import { describe, expect, it } from 'vitest';
import { sampleRound } from '../data/sampleRound';
import {
  findQueryError,
  getSearchProgress,
  searchDurationMs,
  searchFlights,
  type SearchQuery,
} from './search';
import { createMarket, purchase, type MarketState } from './market';
import { createRoundTimer } from './roundClock';
import type { RoundScenario } from './types';

const timer = createRoundTimer(0, { startCountdownMs: 10_000, roundTimeLimitMs: 300_000 });
const marketOf = (scenario: RoundScenario) => createMarket(scenario, timer);

const query: SearchQuery = {
  originCode: 'HND',
  destinationCode: 'TSA',
  departureDate: '2027-05-18',
  arrivalDate: '2027-05-18',
  nonstopOnly: false,
  checkedBaggageKg: 20,
};

const ids = (q: SearchQuery, scenario: RoundScenario = sampleRound) =>
  searchFlights(scenario, q, marketOf(scenario)).map((result) => result.flight.id);

describe('searchFlights の価格', () => {
  /** 便 flightId を、サイト site で n 人に買わせた市場。 */
  const sold = (market: MarketState, flightId: string, site: 'site1' | 'site3', n: number) => {
    for (let i = 0; i < n; i += 1) {
      const result = purchase(market, {
        participantId: `${site}-${i}`,
        site,
        flightId,
        procedureId: `${site}-${i}`,
        now: timer.startAt,
      });
      if (!result.ok) throw new Error(result.reason);
      market = result.state;
    }
    return market;
  };
  const resultOf = (market: MarketState, flightId: string) =>
    searchFlights(sampleRound, query, market).find((r) => r.flight.id === flightId)!;

  it('サイト1の最安料金が売り切れた後に検索すると、サイト1は買えない表示になり、一覧の金額も変わる', () => {
    const fresh = resultOf(marketOf(sampleRound), 'HND-TSA-0910');
    expect(fresh.quotes.site1.available).toBe(true);
    // 09:10発のサイト1の販売枠は2枚。
    const after = resultOf(sold(marketOf(sampleRound), 'HND-TSA-0910', 'site1', 2), 'HND-TSA-0910');
    expect(after.quotes.site1.available).toBe(false);
    expect(after.lowestPrice).toBe(Math.min(after.quotes.site2.price, after.quotes.site3.price));
  });

  it('サイト3の安い価格帯が売り切れた後に検索すると、上がった価格を出す', () => {
    const offer = sampleRound.offers.find((o) => o.flightId === 'HND-TSA-0910')!;
    const market = sold(marketOf(sampleRound), 'HND-TSA-0910', 'site3', offer.site3.fareQuota);
    expect(resultOf(market, 'HND-TSA-0910').quotes.site3.price).toBe(offer.site3.raised.minPrice);
  });

  it('満席の便は、どのサイトでも買えない表示にし、一覧の最後に並べる', () => {
    // 09:10発は6席。
    const market = sold(marketOf(sampleRound), 'HND-TSA-0910', 'site3', 6);
    const results = searchFlights(sampleRound, query, market);
    expect(results.at(-1)?.flight.id).toBe('HND-TSA-0910');
    expect(results.at(-1)?.lowestPrice).toBeNull();
  });
});

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
    const first = searchFlights(sampleRound, query, marketOf(sampleRound))[0];
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
    const order = searchFlights(sameFare, query, marketOf(sameFare)).map(
      (result) => result.flight.departureTime,
    );
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
    expect(ids({ ...query, departureDate: '2027-05-19', arrivalDate: '2027-05-19' })).toEqual([]);
    expect(ids({ ...query, originCode: 'TSA', destinationCode: 'HND' })).toEqual([]);
  });

  it('到着日は「この日までに着く」。翌日を入れても、当日に着く便を出す', () => {
    expect(ids({ ...query, arrivalDate: '2027-05-19' })).toEqual(ids(query));
  });

  it('翌日に着く便は、到着日に翌日以降を入れたときだけ出す', () => {
    const overnight: RoundScenario = {
      ...sampleRound,
      flights: sampleRound.flights.map((flight) =>
        flight.id === 'HND-TSA-1620' ? { ...flight, arrivalDate: '2027-05-19' } : flight,
      ),
    };
    expect(ids(query, overnight)).not.toContain('HND-TSA-1620');
    expect(ids({ ...query, arrivalDate: '2027-05-19' }, overnight)).toContain('HND-TSA-1620');
    expect(ids({ ...query, arrivalDate: '2027-05-20' }, overnight)).toContain('HND-TSA-1620');
  });
});

describe('findQueryError', () => {
  it('出発地・目的地・出発日・到着日がそろえば検索できる', () => {
    expect(findQueryError(query)).toBeNull();
  });

  it('未選択の項目や、同じ出発地と目的地では検索できない', () => {
    expect(findQueryError({ ...query, originCode: '' })).not.toBeNull();
    expect(findQueryError({ ...query, destinationCode: 'HND' })).not.toBeNull();
    expect(findQueryError({ ...query, departureDate: '' })).not.toBeNull();
    expect(findQueryError({ ...query, arrivalDate: '' })).not.toBeNull();
  });

  it('到着日が出発日と同じか後なら検索でき、1日でも前なら検索できない', () => {
    expect(findQueryError({ ...query, arrivalDate: '2027-05-19' })).toBeNull();
    expect(findQueryError({ ...query, arrivalDate: '2027-05-17' })).toBe(
      '到着日が出発日より前になっています',
    );
  });
});

describe('searchDurationMs', () => {
  const range = { min: 4_000, max: 6_000 };

  it('同じ検索条件なら、何度検索しても同じ時間になる', () => {
    expect(searchDurationMs({ ...query }, range)).toBe(searchDurationMs(query, range));
  });

  it('どの条件でも4〜6秒の範囲に入り、0.1秒単位になる', () => {
    const dates = Array.from({ length: 31 }, (_, i) => `2027-05-${String(i + 1).padStart(2, '0')}`);
    for (const departureDate of dates) {
      for (const checkedBaggageKg of [0, 15, 20, 23]) {
        const ms = searchDurationMs(
          { ...query, departureDate, arrivalDate: departureDate, checkedBaggageKg },
          range,
        );
        expect(ms).toBeGreaterThanOrEqual(4_000);
        expect(ms).toBeLessThanOrEqual(6_000);
        expect(ms % 100).toBe(0);
      }
    }
  });

  it('範囲の幅が0なら、常にその時間になる', () => {
    expect(searchDurationMs(query, { min: 5_000, max: 5_000 })).toBe(5_000);
  });
});

describe('getSearchProgress', () => {
  it('開始の時点は0%、所要時間の1ミリ秒前までは検索中', () => {
    expect(getSearchProgress(1_000, 4_000, 1_000)).toEqual({ kind: 'searching', ratio: 0 });
    expect(getSearchProgress(1_000, 4_000, 3_000)).toEqual({ kind: 'searching', ratio: 0.5 });
    expect(getSearchProgress(1_000, 4_000, 4_999).kind).toBe('searching');
  });

  it('開始から所要時間が経った時刻ちょうどで完了し、完了時刻を返す', () => {
    expect(getSearchProgress(1_000, 4_000, 5_000)).toEqual({ kind: 'done', completedAt: 5_000 });
    expect(getSearchProgress(1_000, 4_000, 99_000)).toEqual({ kind: 'done', completedAt: 5_000 });
  });
});
