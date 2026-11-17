/** 残り時間を mm:ss にする。秒の端数は切り上げ、00:00 は締切の時点だけに出す。 */
export function formatRemaining(ms: number): string {
  const totalSeconds = Math.ceil(Math.max(0, ms) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** 金額を ¥18,000 の形にする。 */
export function formatYen(amount: number): string {
  return `¥${amount.toLocaleString('ja-JP')}`;
}
