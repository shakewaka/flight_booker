import { describe, expect, it } from 'vitest';
import { createProgressCurve, progressAt } from './progressCurve';

const SEEDS = Array.from({ length: 200 }, (_, i) => (i * 2_654_435_761) >>> 0);

describe('progressAt', () => {
  it('どの曲線でも、開始は0、完了は1になる', () => {
    for (const seed of SEEDS) {
      const curve = createProgressCurve(seed);
      expect(progressAt(curve, 0)).toBe(0);
      expect(progressAt(curve, 1)).toBe(1);
    }
  });

  it('どの曲線でも、バーが途中で縮まない', () => {
    for (const seed of SEEDS) {
      const curve = createProgressCurve(seed);
      let previous = 0;
      for (let step = 1; step <= 1_000; step += 1) {
        const value = progressAt(curve, step / 1_000);
        expect(value).toBeGreaterThanOrEqual(previous);
        previous = value;
      }
    }
  });

  it('完了の直前でも100%にはならず、完了の瞬間に埋まる', () => {
    for (const seed of SEEDS) {
      expect(progressAt(createProgressCurve(seed), 0.999)).toBeLessThan(1);
    }
  });

  it('区切りの直後はしばらく止まって見える', () => {
    const curve = createProgressCurve(SEEDS[1]);
    const start = curve.times[1];
    const span = curve.times[2] - start;
    expect(progressAt(curve, start + span * 0.3)).toBe(curve.values[1]);
    expect(progressAt(curve, start + span * 0.6)).toBeGreaterThan(curve.values[1]);
  });
});

describe('createProgressCurve', () => {
  it('同じシードなら、同じ曲線になる', () => {
    expect(createProgressCurve(12_345)).toEqual(createProgressCurve(12_345));
  });

  it('シードが違えば、多くの場合に違う曲線になる', () => {
    const shapes = new Set(SEEDS.map((seed) => JSON.stringify(createProgressCurve(seed))));
    expect(shapes.size).toBeGreaterThan(SEEDS.length * 0.9);
  });
});
