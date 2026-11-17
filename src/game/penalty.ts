import type { BookingJudgement, InputField, InputMistake } from './judge';
import type { TripViolation } from './requirements';
import type { PenaltySettings } from './settings';
import type { Yen } from './types';

// 減点（案C、2026年11月17日にユーザーが採用）。違反の重さで3段階に分ける。
// - 旅行が成り立たない（出発地・目的地・出発日の違い）：時間切れと同じ扱い。
// - 条件違反：1つにつき、ラウンド最高値の一定の割合を集計金額に足す。
// - 入力ミス：本人確認の情報とカードの情報で割合を分け、1つにつき足す。
// いくつ重なっても、時間切れより悪くはしない。割合は仮の値（src/game/settings.ts）。

/** 旅行が成り立たない条件違反。 */
const FATAL_VIOLATIONS: TripViolation[] = ['origin', 'destination', 'departureDate'];

const PAYMENT_FIELDS: InputField[] = ['holderName', 'cardNumber', 'cardExpiry', 'securityCode'];

export type PenaltyItem =
  | { kind: 'violation'; violation: TripViolation; amount: Yen }
  | { kind: 'input'; mistake: InputMistake; amount: Yen };

export type PenaltyResult = {
  /** 旅行が成り立たない違反があるか。あれば時間切れと同じ扱いにする。 */
  fatal: boolean;
  /** 違反ごとの減点。旅行が成り立たない違反の金額は0とし、fatal で扱う。 */
  items: PenaltyItem[];
  /** 減点の合計（上限で切る前）。 */
  total: Yen;
};

/** 100円単位に丸める。 */
const round100 = (amount: number): Yen => Math.round(amount / 100) * 100;

/** 予約1件の判定結果から、減点を求める。 */
export function computePenalty(
  judgement: BookingJudgement,
  maxPrice: Yen,
  settings: PenaltySettings,
): PenaltyResult {
  const fatal = judgement.tripViolations.some((v) => FATAL_VIOLATIONS.includes(v));
  const items: PenaltyItem[] = [
    ...judgement.tripViolations.map((violation): PenaltyItem => ({
      kind: 'violation',
      violation,
      amount: FATAL_VIOLATIONS.includes(violation)
        ? 0
        : round100(maxPrice * settings.violationRate),
    })),
    ...judgement.inputMistakes.map((mistake): PenaltyItem => ({
      kind: 'input',
      mistake,
      amount: round100(
        maxPrice *
          (PAYMENT_FIELDS.includes(mistake.field)
            ? settings.paymentMistakeRate
            : settings.identityMistakeRate),
      ),
    })),
  ];
  return { fatal, items, total: items.reduce((sum, item) => sum + item.amount, 0) };
}
