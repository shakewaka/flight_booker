import type { PricingSettings } from './settings';
import type { FlightOffers, Yen } from './types';

export type FareInput = {
  flightId: string;
  /** 出発地から目的地までの、おおよその距離。 */
  distanceKm: number;
  /** 便ごとの高い・安いを表す倍率。1が距離どおりの標準、0.9なら1割安い便。 */
  fareLevel: number;
  /** サイト1の料金で販売できる上限数。 */
  fareQuota: number;
};

function roundToStep(amount: number, step: Yen): Yen {
  return Math.round(amount / step) * step;
}

/**
 * 距離から、3つの予約サイトの販売条件を作る。
 * 遠い行き先ほど価格帯が上がり、同じ便ではサイト1が必ず最安になる。
 */
export function createFlightOffers(fare: FareInput, pricing: PricingSettings): FlightOffers {
  if (!(fare.distanceKm > 0) || !(fare.fareLevel > 0)) {
    throw new Error(`距離と倍率は0より大きい値にしてください：便 ${fare.flightId}`);
  }

  const step = pricing.roundingStep;
  const standard = pricing.baseFare + fare.distanceKm * pricing.farePerKm;
  const site1Price = Math.max(step, roundToStep(standard * fare.fareLevel, step));

  // 端数の丸めで同額になる場合も、サイト1より1段階は高くする。
  const above = (rate: number, floor: Yen) =>
    Math.max(floor + step, roundToStep(site1Price * rate, step));
  const site3Min = above(pricing.site3MinRate, site1Price);

  return {
    flightId: fare.flightId,
    site1: { price: site1Price, fareQuota: fare.fareQuota },
    site2: { price: above(pricing.site2Rate, site1Price) },
    site3: { minPrice: site3Min, maxPrice: above(pricing.site3MaxRate, site3Min) },
  };
}

/** 販売条件に含まれる価格のうち、最も高い金額。条件を満たす便だけを渡すと、ラウンド最高値になる。 */
export function highestPrice(offers: FlightOffers[]): Yen {
  return Math.max(
    ...offers.map((offer) => Math.max(offer.site1.price, offer.site2.price, offer.site3.maxPrice)),
  );
}
