import type { MarketState } from './market';
import type { Site3Settings } from './settings';
import type { FlightOffers, Yen } from './types';

// サイト3の価格。その便のサイト3を開いている参加者の割合で、価格の範囲の中を上下する。
// 人数はタブ数ではなく参加者数で数える（同じ人の複数タブは1人）。購入済みの人は数えない。

/** 参加者ごとに、サイト3で開いている便の一覧。 */
export type Site3Viewing = Record<string, string[]>;

/** 便ごとの閲覧人数。同じ人が同じ便を複数のタブで開いていても1人と数える。 */
export function countSite3Viewers(
  viewing: Site3Viewing,
  purchasedParticipantIds: Set<string>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [participantId, flightIds] of Object.entries(viewing)) {
    if (purchasedParticipantIds.has(participantId)) continue;
    for (const flightId of new Set(flightIds)) counts[flightId] = (counts[flightId] ?? 0) + 1;
  }
  return counts;
}

/** 閲覧人数から、サイト3の価格を求める。 */
export function site3PriceFor(
  offer: FlightOffers['site3'],
  viewers: number,
  participantCount: number,
  settings: Site3Settings,
  roundingStep: Yen,
): Yen {
  const rate = participantCount > 0 ? viewers / participantCount : 0;
  const level = Math.min(1, rate / settings.fullPriceViewRate);
  const raw = offer.minPrice + (offer.maxPrice - offer.minPrice) * level;
  const rounded = Math.round(raw / roundingStep) * roundingStep;
  return Math.min(offer.maxPrice, Math.max(offer.minPrice, rounded));
}

/** 市場のサイト3の価格を、今の閲覧人数に合わせて書き換える。変わらなければ同じ市場を返す。 */
export function withSite3Prices(
  market: MarketState,
  offers: FlightOffers[],
  viewers: Record<string, number>,
  participantCount: number,
  settings: Site3Settings,
  roundingStep: Yen,
): MarketState {
  let changed = false;
  const site3Price = { ...market.site3Price };
  for (const offer of offers) {
    const price = site3PriceFor(
      offer.site3,
      viewers[offer.flightId] ?? 0,
      participantCount,
      settings,
      roundingStep,
    );
    if (site3Price[offer.flightId] !== price) {
      site3Price[offer.flightId] = price;
      changed = true;
    }
  }
  return changed ? { ...market, site3Price } : market;
}
