import { describe, expect, it } from 'vitest';
import type { InputMistake } from './judge';
import { computePenalty } from './penalty';

const settings = { violationRate: 0.2, identityMistakeRate: 0.1, paymentMistakeRate: 0.05 };
const mistake = (field: InputMistake['field']): InputMistake => ({
  field,
  entered: 'x',
  expected: 'y',
});

describe('computePenalty', () => {
  it('違反も入力ミスもなければ、減点は0', () => {
    expect(computePenalty({ inputMistakes: [], tripViolations: [] }, 50_000, settings)).toEqual({
      fatal: false,
      items: [],
      total: 0,
    });
  });

  it('条件違反は1つにつき最高値の20%、本人確認の入力ミスは10%、カードの入力ミスは5%', () => {
    const result = computePenalty(
      {
        inputMistakes: [mistake('passportNumber'), mistake('cardNumber')],
        tripViolations: ['arrivalTerminal'],
      },
      50_000,
      settings,
    );
    expect(result.items.map((item) => item.amount)).toEqual([10_000, 5_000, 2_500]);
    expect(result.total).toBe(17_500);
    expect(result.fatal).toBe(false);
  });

  it('同じ種類の違反が重なれば、その数だけ足す', () => {
    const result = computePenalty(
      {
        inputMistakes: [mistake('surname'), mistake('givenName')],
        tripViolations: ['departureTime', 'arrivalTime'],
      },
      50_000,
      settings,
    );
    expect(result.total).toBe(10_000 * 2 + 5_000 * 2);
  });

  it('出発地・目的地・出発日の違いは、旅行が成り立たない違反として扱う', () => {
    for (const violation of ['origin', 'destination', 'departureDate'] as const) {
      const result = computePenalty(
        { inputMistakes: [], tripViolations: [violation] },
        50_000,
        settings,
      );
      expect(result.fatal).toBe(true);
      expect(result.total).toBe(0);
    }
  });

  it('減点は100円単位に丸める', () => {
    // 67,000円 の 5% = 3,350円 → 3,400円
    const result = computePenalty(
      { inputMistakes: [mistake('securityCode')], tripViolations: [] },
      67_000,
      settings,
    );
    expect(result.total).toBe(3_400);
  });
});
