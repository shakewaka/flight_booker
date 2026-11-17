// 検索中の進捗バーの動き方。時間に比例して進むと単調なので、
// 「しばらく止まる → 一気に進む」を数回くり返す曲線にする。
// 曲線は検索条件から作る数（シード）で決まり、同じ条件なら毎回同じ動きになる。
// 見た目だけの演出で、検索が終わる時刻は変えない。

export type ProgressCurve = {
  /** 区切りの時刻（0〜1）。最初は0、最後は1。 */
  times: number[];
  /** 区切りでのバーの長さ（0〜1）。最初は0、最後は1。 */
  values: number[];
};

/** 各区間のうち、止まって見せる前半の割合。 */
const HOLD = 0.35;

/** シードから、0以上1未満の数を順に作る（mulberry32 という簡単な乱数）。 */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function createProgressCurve(seed: number): ProgressCurve {
  const random = createRandom(seed);
  const count = 3 + Math.floor(random() * 3); // 途中の区切りは3〜5個
  const pick = (min: number, max: number) =>
    Array.from({ length: count }, () => min + random() * (max - min)).sort((a, b) => a - b);

  return {
    times: [0, ...pick(0.08, 0.9), 1],
    // 最後の区切りは97%までにして、完了の瞬間に残りを埋める。
    values: [0, ...pick(0.06, 0.97), 1],
  };
}

function easeOutCubic(x: number): number {
  return 1 - (1 - x) ** 3;
}

/** 経過時間の割合（0〜1）から、バーの長さ（0〜1）を求める。減ることはない。 */
export function progressAt(curve: ProgressCurve, timeRatio: number): number {
  if (timeRatio <= 0) return 0;
  if (timeRatio >= 1) return 1;

  let i = 0;
  while (curve.times[i + 1] <= timeRatio) i += 1;

  const start = curve.times[i];
  const span = curve.times[i + 1] - start;
  const local = span > 0 ? (timeRatio - start) / span : 1;
  const moved = local <= HOLD ? 0 : easeOutCubic((local - HOLD) / (1 - HOLD));
  return curve.values[i] + (curve.values[i + 1] - curve.values[i]) * moved;
}
