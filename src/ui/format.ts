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

/** 直行便か、乗継の回数と乗継の空港。例：「乗継1回（ソウル（仁川）経由）」。 */
export function formatStops(
  flight: { stops: number; via?: string[] },
  airports: { code: string; name: string }[],
): string {
  if (flight.stops === 0) return '直行便';
  const names = (flight.via ?? []).map(
    (code) => airports.find((airport) => airport.code === code)?.name ?? code,
  );
  return names.length > 0
    ? `乗継${flight.stops}回（${names.join('・')}経由）`
    : `乗継${flight.stops}回`;
}
