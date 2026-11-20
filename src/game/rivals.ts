import type { MarketState, Purchase } from './market';
import { bookingTimeMs } from './roundClock';

// 他の参加者の動き。競っている相手が見えるように、画面へ出す内容を市場から取り出す。
// 市場の判定には使わない（表示だけ）。

/**
 * いまから windowMs 以内に、自分以外が予約した記録。新しい順。
 * 画面の端に「〇〇さんが予約しました」と流すのに使う。
 */
export function recentPurchases(
  market: MarketState,
  options: { now: number; windowMs: number; excludeParticipantId: string },
): Purchase[] {
  const elapsed = bookingTimeMs(market.timer, options.now);
  return market.purchases
    .filter(
      (purchase) =>
        purchase.participantId !== options.excludeParticipantId &&
        elapsed - purchase.bookingTimeMs < options.windowMs,
    )
    .sort((a, b) => b.bookingTimeMs - a.bookingTimeMs);
}
