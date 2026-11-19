import { describe, expect, it } from 'vitest';
import { sampleRound } from '../../data/sampleRound';
import type { SearchQuery } from '../../game/search';
import { compareUrl, pageUrl, parsePageUrl } from './pageUrl';

const query: SearchQuery = {
  originCode: 'HND',
  destinationCode: 'TSA',
  departureDate: '2027-05-18',
  arrivalDate: '2027-05-18',
  nonstopOnly: true,
  checkedBaggageKg: 20,
};

describe('compareUrl', () => {
  it('検索条件がなければ、比較サイトのトップのURL', () => {
    expect(compareUrl()).toBe('https://compare.flight-game.invalid/');
  });

  it('検索条件を、検索結果のページのURLに入れる', () => {
    expect(compareUrl(query)).toBe(
      'https://compare.flight-game.invalid/search?from=HND&to=TSA&dep=2027-05-18&arr=2027-05-18&bag=20&via=nonstop',
    );
  });
});

describe('parsePageUrl', () => {
  it('検索結果のURLから、同じ検索条件を取り出す', () => {
    expect(parsePageUrl(compareUrl(query), sampleRound)).toEqual({ kind: 'compare', query });
    const any = { ...query, nonstopOnly: false, checkedBaggageKg: 0 };
    expect(parsePageUrl(compareUrl(any), sampleRound)).toEqual({ kind: 'compare', query: any });
  });

  it('「https://」がなくても、前後に空白があっても開ける', () => {
    const url = `  ${compareUrl(query).replace('https://', '')} `;
    expect(parsePageUrl(url, sampleRound)).toEqual({ kind: 'compare', query });
  });

  it('比較サイトのトップのURLなら、検索条件のない比較サイト', () => {
    expect(parsePageUrl('compare.flight-game.invalid', sampleRound)).toEqual({ kind: 'compare' });
  });

  it('予約サイトのURLなら、その便の手続きを開く。便の番号の大文字・小文字は問わない', () => {
    const url = pageUrl({ kind: 'booking', site: 'site2', flightId: 'HND-TSA-0910' });
    expect(url).toBe('https://site2.flight-game.invalid/booking/hnd-tsa-0910');
    expect(parsePageUrl(url, sampleRound)).toEqual({
      kind: 'booking',
      site: 'site2',
      flightId: 'HND-TSA-0910',
    });
  });

  it('知らないサイトや、ない便のURLは、ページが見つからない表示にする', () => {
    expect(parsePageUrl('https://example.com/', sampleRound).kind).toBe('not-found');
    expect(
      parsePageUrl('https://site1.flight-game.invalid/booking/no-such-flight', sampleRound).kind,
    ).toBe('not-found');
    expect(parsePageUrl('https://compare.flight-game.invalid/other', sampleRound).kind).toBe(
      'not-found',
    );
  });
});
