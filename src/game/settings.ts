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

/** 仮：NPCの動き方。時間はすべて、NPCごとの速さの倍率（speed）を掛ける前の値。 */
export type NpcSettings = {
  /** 検索結果を見て、次の候補を決めるまでの時間。 */
  thinkMs: { min: number; max: number };
  /** 搭乗者情報（パスポートの6項目）の入力にかかる時間。 */
  passengerInputMs: { min: number; max: number };
  /** 決済情報（カードの4項目）の入力にかかる時間。 */
  paymentInputMs: { min: number; max: number };
  /** NPCごとの速さの倍率。小さいほど速い。 */
  speed: { min: number; max: number };
  /** サイト3の値下がりを待つNPCが、価格を見直す間隔。 */
  priceCheckMs: number;
  /** サイト3の値下がりを待つNPCが、待つのをやめる残り時間。 */
  stopWaitingRemainingMs: number;
  /** サイト3の値下がりを待つNPCが買う価格。価格の範囲のうち、下からこの割合までなら買う。 */
  site3BuyBelowRate: number;
  /** 1ラウンドで、パスポートかカードの1項目を打ち間違えるNPCの割合。 */
  inputMistakeRate: number;
  /** 1ラウンドで、条件メモの条件を1つ見落として便を選ぶNPCの割合。 */
  oversightRate: number;
};

/** 仮：サイト3の価格と閲覧人数の関係。 */
export type Site3Settings = {
  /** 参加者のうち、この割合が閲覧すると価格が上限に達する。 */
  fullPriceViewRate: number;
};

/** 仮：減点の割合（案C）。ラウンド最高値に対する、違反1つあたりの割合。 */
export type PenaltySettings = {
  /** 条件違反（出発時刻、到着期限、運航会社、到着ターミナル、手荷物）。 */
  violationRate: number;
  /** 本人確認の情報の入力ミス（姓、名、生年月日、国籍、パスポート番号、有効期限）。 */
  identityMistakeRate: number;
  /** カードの情報の入力ミス（名義、番号、有効期限、確認コード）。 */
  paymentMistakeRate: number;
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
  /** 仮：比較検索にかかる時間の範囲。企画書の20〜30秒から、ユーザーの判断で5倍の速さ（4〜6秒）に変更した。 */
  searchDurationMs: { min: number; max: number };
  /** 仮：締切までに予約できなかった場合に、ラウンド最高値へ加える金額。 */
  timeoutPenalty: number;
  pricing: PricingSettings;
  npc: NpcSettings;
  site3: Site3Settings;
  penalty: PenaltySettings;
  /** 参加者のうち、この割合が予約した時点でラウンドを締め切る（ユーザーの決定。2026年11月17日）。 */
  earlyCloseRate: number;
};

export const prototypeSettings: GameSettings = {
  roundCount: 4,
  npcCount: 9,
  roundTimeLimitMs: 300_000,
  startCountdownMs: 10_000,
  searchDurationMs: { min: 4_000, max: 6_000 },
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
  npc: {
    thinkMs: { min: 2_000, max: 8_000 },
    passengerInputMs: { min: 25_000, max: 60_000 },
    paymentInputMs: { min: 15_000, max: 35_000 },
    speed: { min: 0.7, max: 1.4 },
    priceCheckMs: 3_000,
    stopWaitingRemainingMs: 60_000,
    site3BuyBelowRate: 0.3,
    inputMistakeRate: 0.2,
    oversightRate: 0.15,
  },
  // 10人中5人が閲覧すると上限の価格になる。
  site3: { fullPriceViewRate: 0.5 },
  penalty: { violationRate: 0.2, identityMistakeRate: 0.1, paymentMistakeRate: 0.05 },
  earlyCloseRate: 0.75,
};
