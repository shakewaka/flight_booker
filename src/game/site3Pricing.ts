import type { MarketState } from './market';
import type { Site3Settings } from './settings';
import type { FlightOffers, Yen } from './types';

// サイト3の価格。その便のサイト3を開いている参加者の割合で、価格の範囲の中を上下する。
// 人数はタブ数ではなく参加者数で数える（同じ人の複数タブは1人）。購入済みの人は数えない。
// 下の価格帯の販売枠が売り切れると、上の価格帯の範囲で同じように上下する。

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

/** 今の価格の範囲。下の価格帯の販売枠が売り切れていれば、上の価格帯。 */
export function site3Band(
  offer: FlightOffers['site3'],
  sold: number,
): { minPrice: Yen; maxPrice: Yen } {
  return sold >= offer.fareQuota ? offer.raised : offer;
}

/** 閲覧人数から、サイト3の価格を求める。offer には今の価格の範囲（site3Band）を渡す。 */
export function site3PriceFor(
  offer: { minPrice: Yen; maxPrice: Yen },
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
  // 便が多いので、0.1秒ごとに全便を計算し直さない。
  // 価格が動きうるのは、閲覧されている便・サイト3で売れた便・前に価格を動かした便だけ。
  // それ以外の便は、価格が下の価格帯の下限のまま変わらない。
  const sold: Record<string, number> = {};
  for (const bought of market.purchases) {
    if (bought.site === 'site3') sold[bought.flightId] = (sold[bought.flightId] ?? 0) + 1;
  }
  const targets = new Set([...Object.keys(viewers), ...Object.keys(sold), ...market.site3Moved]);
  const fares =
    Object.keys(market.site3Fares).length > 0
      ? market.site3Fares
      : Object.fromEntries(offers.map((offer) => [offer.flightId, offer.site3]));

  let site3Price: Record<string, Yen> | null = null;
  const moved: string[] = [];
  for (const id of targets) {
    const fare = fares[id];
    if (!fare) continue;
    const price = site3PriceFor(
      site3Band(fare, sold[id] ?? 0),
      viewers[id] ?? 0,
      participantCount,
      settings,
      roundingStep,
    );
    if (price !== fare.minPrice) moved.push(id);
    if (market.site3Price[id] !== price) {
      site3Price ??= { ...market.site3Price };
      site3Price[id] = price;
    }
  }
  if (!site3Price) return market;
  return { ...market, site3Price, site3Moved: moved };
}
