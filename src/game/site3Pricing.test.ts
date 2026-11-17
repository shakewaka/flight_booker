import { describe, expect, it } from 'vitest';
import { sampleRound } from '../data/sampleRound';
import { createMarket } from './market';
import { createRoundTimer } from './roundClock';
import { countSite3Viewers, site3PriceFor, withSite3Prices } from './site3Pricing';

const offer = { minPrice: 20_000, maxPrice: 30_000 };
const settings = { fullPriceViewRate: 0.5 };

describe('site3PriceFor', () => {
  it('誰も見ていなければ下限、参加者の半数が見ると上限になる', () => {
    expect(site3PriceFor(offer, 0, 10, settings, 500)).toBe(20_000);
    expect(site3PriceFor(offer, 5, 10, settings, 500)).toBe(30_000);
  });

  it('上限に達した後は、それ以上見る人が増えても上限のまま', () => {
    expect(site3PriceFor(offer, 10, 10, settings, 500)).toBe(30_000);
  });

  it('途中の人数では範囲の中で上がり、丸めの単位にそろう', () => {
    // 10人中1人 → 上限までの5分の1 → 22,000円
    expect(site3PriceFor(offer, 1, 10, settings, 500)).toBe(22_000);
    // 3人中1人 → 0.333 / 0.5 = 66.7% → 26,666円 → 26,500円
    expect(site3PriceFor(offer, 1, 3, settings, 500)).toBe(26_500);
  });

  it('参加人数で割合を求めるので、10人中2人と20人中4人は同じ価格になる', () => {
    expect(site3PriceFor(offer, 2, 10, settings, 500)).toBe(
      site3PriceFor(offer, 4, 20, settings, 500),
    );
  });
});

describe('countSite3Viewers', () => {
  it('同じ人が同じ便を複数のタブで開いていても、1人と数える', () => {
    expect(countSite3Viewers({ player: ['F', 'F', 'F'], npc1: ['F'] }, new Set())).toEqual({
      F: 2,
    });
  });

  it('1人が別々の便を開いていれば、それぞれの便で1人と数える', () => {
    expect(countSite3Viewers({ player: ['F', 'G'] }, new Set())).toEqual({ F: 1, G: 1 });
  });

  it('購入済みの人は、閲覧人数から外す', () => {
    expect(countSite3Viewers({ player: ['F'], npc1: ['F'] }, new Set(['npc1']))).toEqual({ F: 1 });
  });
});

describe('withSite3Prices', () => {
  const timer = createRoundTimer(0, { startCountdownMs: 10_000, roundTimeLimitMs: 300_000 });
  const market = createMarket(sampleRound, timer);
  const flight = sampleRound.offers[0];

  it('閲覧人数に合わせて、その便のサイト3の価格だけを書き換える', () => {
    const next = withSite3Prices(
      market,
      sampleRound.offers,
      { [flight.flightId]: 5 },
      10,
      settings,
      500,
    );
    expect(next.site3Price[flight.flightId]).toBe(flight.site3.maxPrice);
    expect(next.site3Price[sampleRound.offers[1].flightId]).toBe(
      sampleRound.offers[1].site3.minPrice,
    );
  });

  it('価格が変わらなければ、同じ市場をそのまま返す', () => {
    expect(withSite3Prices(market, sampleRound.offers, {}, 10, settings, 500)).toBe(market);
  });
});
