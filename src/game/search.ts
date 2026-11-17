import type { Flight, FlightOffers, RoundScenario, Yen } from './types';

// 比較サイトの検索。ReactやDOMに依存せず、現在時刻は引数で受け取る。
// 航空会社・到着時刻・到着ターミナルは、企画書のとおり検索では絞り込めない。

export type SearchQuery = {
  originCode: string;
  destinationCode: string;
  departureDate: string;
  /** true なら直行便だけを探す。false は経由地の指定なし。 */
  nonstopOnly: boolean;
  /** 必要な受託手荷物の重さ。0は手荷物なし。 */
  checkedBaggageKg: number;
};

export type SearchResult = {
  flight: Flight;
  offers: FlightOffers;
  /** 一覧に「〜」付きで出す金額。3サイトのうち最も安い価格。 */
  lowestPrice: Yen;
};

/** 検索を始められない理由。null なら検索できる。条件メモと合っているかは調べない。 */
export function findQueryError(query: SearchQuery): string | null {
  if (!query.originCode || !query.destinationCode) return '出発地と目的地を選んでください';
  if (query.originCode === query.destinationCode) return '出発地と目的地が同じです';
  if (!query.departureDate) return '出発日を選んでください';
  return null;
}

/** 条件に合う便を、安い順に返す。同額なら出発の早い順。 */
export function searchFlights(scenario: RoundScenario, query: SearchQuery): SearchResult[] {
  const results: SearchResult[] = [];

  for (const flight of scenario.flights) {
    if (flight.originCode !== query.originCode) continue;
    if (flight.destinationCode !== query.destinationCode) continue;
    if (flight.departureDate !== query.departureDate) continue;
    if (query.nonstopOnly && flight.stops > 0) continue;
    if (flight.checkedBaggageKg < query.checkedBaggageKg) continue;

    const offers = scenario.offers.find((offer) => offer.flightId === flight.id);
    if (!offers) continue;
    const lowestPrice = Math.min(offers.site1.price, offers.site2.price, offers.site3.minPrice);
    results.push({ flight, offers, lowestPrice });
  }

  return results.sort(
    (a, b) =>
      a.lowestPrice - b.lowestPrice || a.flight.departureTime.localeCompare(b.flight.departureTime),
  );
}

/**
 * 検索にかかる時間。同じ検索条件なら、誰が検索しても同じ時間になる。
 * 実世界の通信のような、ランダムな待ち時間は使わない。
 */
export function searchDurationMs(query: SearchQuery, range: { min: number; max: number }): number {
  const key = [
    query.originCode,
    query.destinationCode,
    query.departureDate,
    query.nonstopOnly ? 'nonstop' : 'any',
    query.checkedBaggageKg,
  ].join('|');

  // FNV-1a という簡単なハッシュで、条件の文字列を数に変える。
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  const seconds = Math.floor((range.max - range.min) / 1000);
  return range.min + (hash % (seconds + 1)) * 1000;
}

export type SearchProgress =
  { kind: 'searching'; ratio: number } | { kind: 'done'; completedAt: number };

/** 検索の進み具合。開始から所要時間が経った時刻ちょうどで完了する。 */
export function getSearchProgress(
  startedAt: number,
  durationMs: number,
  now: number,
): SearchProgress {
  const completedAt = startedAt + durationMs;
  if (now >= completedAt) return { kind: 'done', completedAt };
  return { kind: 'searching', ratio: Math.max(0, now - startedAt) / durationMs };
}
