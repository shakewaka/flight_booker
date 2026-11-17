import { describe, expect, it } from 'vitest';
import { sampleRound } from '../data/sampleRound';
import {
  findQueryError,
  getSearchProgress,
  searchDurationMs,
  searchFlights,
  type SearchQuery,
} from './search';

const query: SearchQuery = {
  originCode: 'HND',
  destinationCode: 'TSA',
  departureDate: '2027-05-18',
  nonstopOnly: false,
  checkedBaggageKg: 20,
};

const ids = (q: SearchQuery) => searchFlights(sampleRound, q).map((result) => result.flight.id);

describe('searchFlights', () => {
  it('条件メモと合わない便も含めて、検索条件に合う便を安い順に返す', () => {
    expect(ids(query)).toEqual([
      'HND-TSA-0705',
      'HND-TSA-1620',
      'HND-TSA-0925',
      'HND-TSA-0910',
      'HND-TSA-1105',
    ]);
  });

  it('一覧の金額は、3サイトのうち最も安い価格になる', () => {
    const first = searchFlights(sampleRound, query)[0];
    expect(first.lowestPrice).toBe(first.offers.site1.price);
  });

  it('同じ金額の便は、出発の早い順に並べる', () => {
    const sameFare = {
      ...sampleRound,
      offers: sampleRound.offers.map((offer) => ({
        ...offer,
        site1: { ...offer.site1, price: 10_000 },
      })),
    };
    const order = searchFlights(sameFare, query).map((result) => result.flight.departureTime);
    expect(order).toEqual(['07:05', '09:10', '09:25', '11:05', '16:20']);
  });

  it('直行便だけを指定すると、乗継のある便を除く', () => {
    expect(ids({ ...query, nonstopOnly: true })).not.toContain('HND-TSA-0925');
    expect(ids({ ...query, nonstopOnly: true })).toHaveLength(4);
  });

  it('料金に含まれる手荷物と同じ重さまでは出し、1kgでも重いと出さない', () => {
    expect(ids({ ...query, checkedBaggageKg: 20 })).toHaveLength(5);
    expect(ids({ ...query, checkedBaggageKg: 21 })).toEqual([]);
    expect(ids({ ...query, checkedBaggageKg: 0 })).toHaveLength(5);
  });

  it('同じ都市でも、空港が違う便は出さない', () => {
    expect(ids({ ...query, originCode: 'NRT', destinationCode: 'TPE' })).toEqual(['NRT-TPE-0950']);
    expect(ids({ ...query, destinationCode: 'TPE' })).toEqual([]);
  });

  it('出発日や方向が違うと、便は見つからない', () => {
    expect(ids({ ...query, departureDate: '2027-05-19' })).toEqual([]);
    expect(ids({ ...query, originCode: 'TSA', destinationCode: 'HND' })).toEqual([]);
  });
});

describe('findQueryError', () => {
  it('出発地・目的地・出発日がそろえば検索できる', () => {
    expect(findQueryError(query)).toBeNull();
  });

  it('未選択の項目や、同じ出発地と目的地では検索できない', () => {
    expect(findQueryError({ ...query, originCode: '' })).not.toBeNull();
    expect(findQueryError({ ...query, destinationCode: 'HND' })).not.toBeNull();
    expect(findQueryError({ ...query, departureDate: '' })).not.toBeNull();
  });
});

describe('searchDurationMs', () => {
  const range = { min: 20_000, max: 30_000 };

  it('同じ検索条件なら、何度検索しても同じ時間になる', () => {
    expect(searchDurationMs({ ...query }, range)).toBe(searchDurationMs(query, range));
  });

  it('どの条件でも、20〜30秒の範囲に入る', () => {
    const dates = Array.from({ length: 31 }, (_, i) => `2027-05-${String(i + 1).padStart(2, '0')}`);
    for (const departureDate of dates) {
      for (const checkedBaggageKg of [0, 15, 20, 23]) {
        const ms = searchDurationMs({ ...query, departureDate, checkedBaggageKg }, range);
        expect(ms).toBeGreaterThanOrEqual(20_000);
        expect(ms).toBeLessThanOrEqual(30_000);
      }
    }
  });

  it('範囲の幅が0なら、常にその時間になる', () => {
    expect(searchDurationMs(query, { min: 25_000, max: 25_000 })).toBe(25_000);
  });
});

describe('getSearchProgress', () => {
  it('開始の時点は0%、所要時間の1ミリ秒前までは検索中', () => {
    expect(getSearchProgress(1_000, 20_000, 1_000)).toEqual({ kind: 'searching', ratio: 0 });
    expect(getSearchProgress(1_000, 20_000, 11_000)).toEqual({ kind: 'searching', ratio: 0.5 });
    expect(getSearchProgress(1_000, 20_000, 20_999).kind).toBe('searching');
  });

  it('開始から所要時間が経った時刻ちょうどで完了し、完了時刻を返す', () => {
    expect(getSearchProgress(1_000, 20_000, 21_000)).toEqual({ kind: 'done', completedAt: 21_000 });
    expect(getSearchProgress(1_000, 20_000, 99_000)).toEqual({ kind: 'done', completedAt: 21_000 });
  });
});
