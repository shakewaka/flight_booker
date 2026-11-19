import type { MarketRefusal, MarketState, Purchase } from './market';
import { bookingTimeMs } from './roundClock';
import type { SiteId } from './types';

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

/** 自分より先に、席や販売枠を取った人。 */
export type Snatch = {
  participantId: string;
  /** 購入したのか、サイト2で確保したのか。 */
  action: 'purchase' | 'hold';
  /** 取られてから、いままでの時間。 */
  agoMs: number;
};

/**
 * 予約が断られたとき、その席や販売枠を先に取った人を探す。分からなければ null。
 * - seat-taken：選んだ席を購入・確保している人。
 * - fare-sold-out：サイト1の最安料金で、最後に購入した人。
 * - sold-out：その便の席を、最後に購入・確保した人。
 * 自分の購入・確保は数えない。
 */
export function findSnatch(
  market: MarketState,
  request: {
    refusal: MarketRefusal;
    participantId: string;
    flightId: string;
    seatId?: string;
    now: number;
  },
): Snatch | null {
  const { refusal, participantId, flightId, seatId } = request;
  const others = <T extends { participantId: string; flightId: string }>(items: T[]) =>
    items.filter((item) => item.participantId !== participantId && item.flightId === flightId);

  type Candidate = Omit<Snatch, 'agoMs'> & { atMs: number; seatId: string; site?: SiteId };
  const candidates: Candidate[] = [
    ...others(market.purchases).map((p) => ({
      participantId: p.participantId,
      action: 'purchase' as const,
      atMs: p.bookingTimeMs,
      seatId: p.seatId,
      site: p.site,
    })),
    ...others(market.holds).map((h) => ({
      participantId: h.participantId,
      action: 'hold' as const,
      atMs: h.heldAtMs,
      seatId: h.seatId,
    })),
  ];

  const matching =
    refusal === 'seat-taken'
      ? candidates.filter((c) => c.seatId === seatId)
      : refusal === 'fare-sold-out'
        ? candidates.filter((c) => c.action === 'purchase' && c.site === 'site1')
        : refusal === 'sold-out'
          ? candidates
          : [];
  if (matching.length === 0) return null;

  const latest = matching.reduce((a, b) => (b.atMs > a.atMs ? b : a));
  return {
    participantId: latest.participantId,
    action: latest.action,
    agoMs: Math.max(0, bookingTimeMs(market.timer, request.now) - latest.atMs),
  };
}
