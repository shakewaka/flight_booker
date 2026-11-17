// 試合の調整値。
// roundCount 以外は試作用の仮の値で、正式なルールではない（docs/decisions.md「試作用の仮案」）。
// プレイテストで変える前提のため、処理の中に直接書かず、ここから参照する。

/** 仮：距離から価格帯を決める係数。 */
export type PricingSettings = {
  /** 距離に関係なくかかる基本料金。 */
  baseFare: number;
  /** 1kmあたりの加算額。 */
  farePerKm: number;
  /** 価格を丸める単位。 */
  roundingStep: number;
  /** サイト1の価格に対する、サイト2の価格の倍率。 */
  site2Rate: number;
  /** サイト1の価格に対する、サイト3の下限と上限の倍率。 */
  site3MinRate: number;
  site3MaxRate: number;
};

export type GameSettings = {
  /** 1試合のラウンド数。決定事項。 */
  roundCount: number;
  /** 仮：NPCの人数。人間1人と合わせて10人。 */
  npcCount: number;
  /** 仮：1ラウンドの制限時間。企画書の180秒から、ユーザーの判断で300秒に変更した。 */
  roundTimeLimitMs: number;
  /** 仮：ラウンド開始前のカウント。予約タイムには含めない。 */
  startCountdownMs: number;
  /** 仮：比較検索にかかる時間の範囲。 */
  searchDurationMs: { min: number; max: number };
  /** 仮：締切までに予約できなかった場合に、ラウンド最高値へ加える金額。 */
  timeoutPenalty: number;
  pricing: PricingSettings;
};

export const prototypeSettings: GameSettings = {
  roundCount: 4,
  npcCount: 9,
  roundTimeLimitMs: 300_000,
  startCountdownMs: 10_000,
  searchDurationMs: { min: 20_000, max: 30_000 },
  timeoutPenalty: 0,
  // 1,000kmの標準の便が、企画書のラウンド例（18,000円・24,000円・19,000〜30,000円）になる値。
  pricing: {
    baseFare: 6_000,
    farePerKm: 12,
    roundingStep: 500,
    site2Rate: 1.33,
    site3MinRate: 1.05,
    site3MaxRate: 1.67,
  },
};
