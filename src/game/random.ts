// 再現できる乱数。同じ文字列からは、いつも同じ数を作る。
// NPCの動きを毎回同じにして、テストで確かめられるようにするために使う。

/** 文字列を、0以上1未満の数に変える（FNV-1a で数にしてから、mulberry32 で混ぜる）。 */
export function unitFromString(key: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  let t = (hash + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
}

/** 範囲の中から、文字列で決まる値を1つ選ぶ。 */
export function pickInRange(key: string, range: { min: number; max: number }): number {
  return range.min + unitFromString(key) * (range.max - range.min);
}
