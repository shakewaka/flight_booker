import { describe, expect, it } from 'vitest';
import type { InputMistake } from './judge';
import { computePenalty } from './penalty';

const settings = { identityMistakeRate: 0.1, paymentMistakeRate: 0.05 };
const mistake = (field: InputMistake['field']): InputMistake => ({
  field,
  entered: 'x',
  expected: 'y',
});

describe('computePenalty', () => {
  it('違反も入力ミスもなければ、減点は0', () => {
    expect(computePenalty({ inputMistakes: [], tripViolations: [] }, 50_000, settings)).toEqual({
      fatal: false,
      violated: false,
      items: [],
      total: 0,
    });
  });

  it('本人確認の入力ミスは最高値の10%、カードの入力ミスは5%', () => {
    const result = computePenalty(
      { inputMistakes: [mistake('passportNumber'), mistake('cardNumber')], tripViolations: [] },
      50_000,
      settings,
    );
    expect(result.total).toBe(5_000 + 2_500);
    expect(result.violated).toBe(false);
  });

  it('同じ種類の入力ミスが重なれば、その数だけ足す', () => {
    const result = computePenalty(
      { inputMistakes: [mistake('surname'), mistake('givenName')], tripViolations: [] },
      50_000,
      settings,
    );
    expect(result.total).toBe(10_000);
  });

  it('条件違反は金額を足さず、「条件違反あり」として扱う（集計金額は最高値になる）', () => {
    const result = computePenalty(
      {
        inputMistakes: [mistake('securityCode')],
        tripViolations: ['arrivalTerminal', 'departureTime'],
      },
      50_000,
      settings,
    );
    expect(result.violated).toBe(true);
    expect(result.fatal).toBe(false);
    expect(result.items.filter((item) => item.kind === 'violation')).toHaveLength(2);
    // 入力ミスの減点は別に数える。
    expect(result.total).toBe(2_500);
  });

  it('出発地・目的地・出発日の違いは、旅行が成り立たない違反として扱う', () => {
    for (const violation of ['origin', 'destination', 'departureDate'] as const) {
      const result = computePenalty(
        { inputMistakes: [], tripViolations: [violation, 'arrivalTerminal'] },
        50_000,
        settings,
      );
      expect(result.fatal).toBe(true);
      expect(result.violated).toBe(false);
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
