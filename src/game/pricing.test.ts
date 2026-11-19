import { describe, expect, it } from 'vitest';
import { createFlightOffers, highestPrice } from './pricing';
import type { PricingSettings } from './settings';

const pricing: PricingSettings = {
  baseFare: 6_000,
  farePerKm: 12,
  roundingStep: 500,
  site2Rate: 1.33,
  site3MinRate: 1.05,
  site3MaxRate: 1.67,
  site3RaisedRate: 1.2,
};

const fare = { flightId: 'f', distanceKm: 1_000, fareLevel: 1, fareQuota: 2 };

describe('createFlightOffers', () => {
  it('1,000kmの標準の便は、企画書のラウンド例と同じ価格帯になる', () => {
    expect(createFlightOffers(fare, pricing)).toEqual({
      flightId: 'f',
      site1: { price: 18_000, fareQuota: 2 },
      site2: { price: 24_000 },
      site3: {
        minPrice: 19_000,
        maxPrice: 30_000,
        fareQuota: 2,
        // 下の価格帯が売り切れたら、2割上げる。
        raised: { minPrice: 23_000, maxPrice: 36_000 },
      },
    });
  });

  it('距離が長いほど、3サイトとも価格が上がる', () => {
    const near = createFlightOffers({ ...fare, distanceKm: 400 }, pricing);
    const far = createFlightOffers({ ...fare, distanceKm: 3_000 }, pricing);

    expect(near.site1.price).toBe(11_000);
    expect(far.site1.price).toBe(42_000);
    expect(far.site2.price).toBeGreaterThan(near.site2.price);
    expect(far.site3.minPrice).toBeGreaterThan(near.site3.minPrice);
    expect(far.site3.maxPrice).toBeGreaterThan(near.site3.maxPrice);
  });

  it('同じ距離でも、倍率の低い便は安くなる', () => {
    expect(createFlightOffers({ ...fare, fareLevel: 0.89 }, pricing).site1.price).toBe(16_000);
    expect(createFlightOffers({ ...fare, fareLevel: 1.28 }, pricing).site1.price).toBe(23_000);
  });

  it('丸めると同額になるほど安い便でも、サイト1 < サイト3の下限 < 上限、サイト1 < サイト2 を保つ', () => {
    // 標準 1,000円 → サイト3の下限は 1,050円 を丸めて 1,000円 になり、そのままではサイト1と同額。
    const tiny: PricingSettings = { ...pricing, baseFare: 0, farePerKm: 1, site3MaxRate: 1.05 };
    const offers = createFlightOffers(fare, tiny);

    expect(offers.site1.price).toBe(1_000);
    expect(offers.site2.price).toBe(1_500);
    expect(offers.site3).toEqual({
      minPrice: 1_500,
      maxPrice: 2_000,
      fareQuota: 2,
      // 上の価格帯も、下の価格帯より1段階は高くする。
      raised: { minPrice: 2_000, maxPrice: 2_500 },
    });
  });

  it('サイト3の下の価格帯の販売枠は、指定がなければサイト1と同じ数', () => {
    expect(createFlightOffers(fare, pricing).site3.fareQuota).toBe(2);
    expect(createFlightOffers({ ...fare, site3Quota: 4 }, pricing).site3.fareQuota).toBe(4);
  });

  it('極端に近くて安い便でも、価格は0円にならない', () => {
    const offers = createFlightOffers({ ...fare, distanceKm: 1, fareLevel: 0.01 }, pricing);
    expect(offers.site1.price).toBe(500);
  });

  it('距離や倍率が0以下なら、エラーにする', () => {
    expect(() => createFlightOffers({ ...fare, distanceKm: 0 }, pricing)).toThrow();
    expect(() => createFlightOffers({ ...fare, fareLevel: -1 }, pricing)).toThrow();
  });
});

describe('highestPrice', () => {
  it('全サイトの価格のうち、最も高い金額を返す（サイト3は上の価格帯の上限）', () => {
    const offers = [
      createFlightOffers(fare, pricing),
      createFlightOffers({ ...fare, flightId: 'g', fareLevel: 1.28 }, pricing),
    ];
    expect(highestPrice(offers)).toBe(46_000);
  });
});
