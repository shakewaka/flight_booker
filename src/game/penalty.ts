import type { BookingJudgement, InputField, InputMistake } from './judge';
import type { TripViolation } from './requirements';
import type { PenaltySettings } from './settings';
import type { Yen } from './types';

// 減点（案Cをもとに、2026年11月17日のプレイテストで条件違反の扱いを変えた）。
// - 旅行が成り立たない（出発地・目的地・出発日の違い）：時間切れと同じ扱い（最高値・制限時間）。
// - 条件違反（出発時刻、到着期限、運航会社、到着ターミナル、手荷物）：集計金額をラウンド最高値にする。
//   条件を満たす便は最高値より高くならないので、条件違反の予約が正しい予約より有利になることはない。
//   予約タイムは実際の値のままなので、予約しなかった人よりは上になる。
// - 入力ミス：本人確認の情報とカードの情報で割合を分け、1つにつき最高値の割合を足す。
// いくつ重なっても、時間切れより悪くはしない。割合は仮の値（src/game/settings.ts）。

/** 旅行が成り立たない条件違反。 */
const FATAL_VIOLATIONS: TripViolation[] = ['origin', 'destination', 'departureDate'];

const PAYMENT_FIELDS: InputField[] = ['holderName', 'cardNumber', 'cardExpiry', 'securityCode'];

export type PenaltyItem =
  | { kind: 'violation'; violation: TripViolation }
  | { kind: 'input'; mistake: InputMistake; amount: Yen };

export type PenaltyResult = {
  /** 旅行が成り立たない違反があるか。あれば時間切れと同じ扱いにする。 */
  fatal: boolean;
  /** 旅行は成り立つが、条件違反があるか。あれば集計金額をラウンド最高値にする。 */
  violated: boolean;
  /** 違反と入力ミスの一覧。金額があるのは入力ミスだけ。 */
  items: PenaltyItem[];
  /** 入力ミスの減点の合計（上限で切る前）。 */
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
  const violated = !fatal && judgement.tripViolations.length > 0;
  const inputItems = judgement.inputMistakes.map((mistake): PenaltyItem & { kind: 'input' } => ({
    kind: 'input',
    mistake,
    amount: round100(
      maxPrice *
        (PAYMENT_FIELDS.includes(mistake.field)
          ? settings.paymentMistakeRate
          : settings.identityMistakeRate),
    ),
  }));
  return {
    fatal,
    violated,
    items: [
      ...judgement.tripViolations.map((violation): PenaltyItem => ({
        kind: 'violation',
        violation,
      })),
      ...inputItems,
    ],
    total: inputItems.reduce((sum, item) => sum + item.amount, 0),
  };
}

/** 順位の段。同じ集計金額なら、段の小さい方を上にする。 */
export const RANK_TIER = {
  /** 条件を満たす予約（入力ミスがあってもよい）。 */
  valid: 0,
  /** 条件違反のある予約。 */
  violated: 1,
  /** 時間切れ・未予約と、旅行が成り立たない予約。 */
  failed: 2,
} as const;
