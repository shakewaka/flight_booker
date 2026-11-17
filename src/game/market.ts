import { bookingTimeMs, isBookingOpen, type RoundTimer } from './roundClock';
import type { RoundScenario, SiteId, Yen } from './types';

// 1ラウンドの市場。全予約サイト・全参加者（人間とNPC）が、この処理だけを通して席を確保・購入する。
// 画面やタブごとに在庫を持たない。状態は書き換えず、操作のたびに新しい状態を返す。
//
// 守る仕様（企画書「7 予約サイトの3種類」「8 複数タブと予約の制約」）
// - 物理的な座席は、全サイトで共有する。
// - サイト1の最安料金で売れる数（販売枠）は、座席数とは別に数える。
// - 確保（サイト2）は、参加者・手続き・価格にひも付く。他サイトの購入には流用しない。
// - 1人が何枠でも確保できる。同じ手続きの確保をくり返しても、別の確保として数えない。
// - 購入は1人1ラウンド1件。購入した瞬間に、本人の他の確保を解放する。購入済みの席は解放しない。
// - 締切以降は、確保も購入もできない。
// - 決めた人数が購入した時点で、締切をその時刻に早める（ユーザーの決定。参加者の75%）。

export type Hold = {
  id: string;
  participantId: string;
  flightId: string;
  /** 確保を行った予約手続き。タブなど、画面側で1回の手続きごとに決める。 */
  procedureId: string;
  /** 確保した時点の総額。確保後に値上げしない。 */
  price: Yen;
};

export type Purchase = {
  participantId: string;
  flightId: string;
  site: SiteId;
  procedureId: string;
  price: Yen;
  /** START から購入までの時間（予約タイム）。 */
  bookingTimeMs: number;
};

export type MarketState = {
  /** ラウンドの時計。早めの締切が起きると、deadlineAt がその時刻に早まる。 */
  timer: RoundTimer;
  /** もともとの制限時間。早めに締め切っても変わらない。時間切れの集計タイムに使う。 */
  limitMs: number;
  /** この人数が購入した時点で締め切る。締め切らないなら null。 */
  closeWhenPurchased: number | null;
  /** 便ごとの物理的な座席数。 */
  seats: Record<string, number>;
  /** 便ごとの、サイト1の最安料金で売れる上限数。 */
  site1Quota: Record<string, number>;
  site1Price: Record<string, Yen>;
  site2Price: Record<string, Yen>;
  /** 便ごとのサイト3の現在の価格。閲覧人数による変動は、NPCを作るときに加える。 */
  site3Price: Record<string, Yen>;
  holds: Hold[];
  purchases: Purchase[];
  /** 次に作る確保の番号。 */
  nextHoldNumber: number;
};

/** 操作が通らなかった理由。 */
export type MarketRefusal =
  /** 開始前、または締切以降。 */
  | 'closed'
  /** この参加者は、このラウンドで購入済み。 */
  | 'already-purchased'
  /** 便がない。 */
  | 'unknown-flight'
  /** 空いている座席がない（他人の確保や購入で埋まっている）。 */
  | 'sold-out'
  /** 座席はあるが、サイト1の最安料金の販売枠が尽きた。 */
  | 'fare-sold-out'
  /** サイト2で、この手続きの確保がない。 */
  | 'no-hold';

export type MarketResult<T> =
  | { ok: true; state: MarketState; value: T }
  | { ok: false; state: MarketState; reason: MarketRefusal };

/** 出題データから、そのラウンドの市場を作る。 */
export function createMarket(
  scenario: RoundScenario,
  timer: RoundTimer,
  options: { closeWhenPurchased?: number } = {},
): MarketState {
  const byFlight = <T>(pick: (offer: RoundScenario['offers'][number]) => T) =>
    Object.fromEntries(scenario.offers.map((offer) => [offer.flightId, pick(offer)]));

  return {
    timer,
    limitMs: timer.deadlineAt - timer.startAt,
    closeWhenPurchased: options.closeWhenPurchased ?? null,
    seats: Object.fromEntries(scenario.flights.map((flight) => [flight.id, flight.seats])),
    site1Quota: byFlight((offer) => offer.site1.fareQuota),
    site1Price: byFlight((offer) => offer.site1.price),
    site2Price: byFlight((offer) => offer.site2.price),
    // 仮：閲覧人数を数えるまでは、サイト3は下限の価格から始める。
    site3Price: byFlight((offer) => offer.site3.minPrice),
    holds: [],
    purchases: [],
    nextHoldNumber: 1,
  };
}

/** 誰も確保・購入していない座席の数。 */
export function availableSeats(market: MarketState, flightId: string): number {
  const held = market.holds.filter((hold) => hold.flightId === flightId).length;
  const sold = market.purchases.filter((purchase) => purchase.flightId === flightId).length;
  return (market.seats[flightId] ?? 0) - held - sold;
}

/** サイト1の最安料金で、あと何枚売れるか。座席が空いているかは別に調べる。 */
export function site1FareRemaining(market: MarketState, flightId: string): number {
  const sold = market.purchases.filter(
    (purchase) => purchase.flightId === flightId && purchase.site === 'site1',
  ).length;
  return (market.site1Quota[flightId] ?? 0) - sold;
}

export function purchaseOf(market: MarketState, participantId: string): Purchase | undefined {
  return market.purchases.find((purchase) => purchase.participantId === participantId);
}

function refuse<T>(market: MarketState, reason: MarketRefusal): MarketResult<T> {
  return { ok: false, state: market, reason };
}

/** 確保と購入に共通する確認。通るなら null。 */
function checkCommon(
  market: MarketState,
  participantId: string,
  flightId: string,
  now: number,
): MarketRefusal | null {
  if (!isBookingOpen(market.timer, now)) return 'closed';
  if (purchaseOf(market, participantId)) return 'already-purchased';
  if (!(flightId in market.seats)) return 'unknown-flight';
  return null;
}

/**
 * サイト2の確保。空いている座席1つと、その時点のサイト2の価格を、この手続きのために押さえる。
 * 同じ参加者が同じ手続きで確保し直した場合は、新しい確保を作らず、前の確保を返す。
 */
export function placeHold(
  market: MarketState,
  request: { participantId: string; flightId: string; procedureId: string; now: number },
): MarketResult<Hold> {
  const { participantId, flightId, procedureId, now } = request;
  const refusal = checkCommon(market, participantId, flightId, now);
  if (refusal) return refuse(market, refusal);

  const existing = market.holds.find(
    (hold) => hold.participantId === participantId && hold.procedureId === procedureId,
  );
  if (existing) return { ok: true, state: market, value: existing };

  if (availableSeats(market, flightId) < 1) return refuse(market, 'sold-out');

  const hold: Hold = {
    id: `hold-${market.nextHoldNumber}`,
    participantId,
    flightId,
    procedureId,
    price: market.site2Price[flightId],
  };
  return {
    ok: true,
    state: { ...market, holds: [...market.holds, hold], nextHoldNumber: market.nextHoldNumber + 1 },
    value: hold,
  };
}

/** 自分の確保を解除する。他人の確保や、存在しない確保を指定しても何も変わらない。 */
export function releaseHold(
  market: MarketState,
  participantId: string,
  holdId: string,
): MarketState {
  const holds = market.holds.filter(
    (hold) => !(hold.id === holdId && hold.participantId === participantId),
  );
  return holds.length === market.holds.length ? market : { ...market, holds };
}

/**
 * 予約の確定。価格は、ここで市場の値から決める（画面から価格を受け取らない）。
 * - サイト1：空席と最安料金の販売枠の両方が残っていれば、その価格で買える。
 * - サイト2：この手続きで確保した席を、確保した価格で買う。
 * - サイト3：空席があれば、確定した瞬間のサイト3の価格で買える。
 * 成功すると、本人の他の確保をすべて解放する。
 */
export function purchase(
  market: MarketState,
  request: {
    participantId: string;
    site: SiteId;
    flightId: string;
    procedureId: string;
    now: number;
  },
): MarketResult<Purchase> {
  const { participantId, site, flightId, procedureId, now } = request;
  const refusal = checkCommon(market, participantId, flightId, now);
  if (refusal) return refuse(market, refusal);

  let price: Yen;
  let holds = market.holds;

  if (site === 'site2') {
    const hold = market.holds.find(
      (candidate) =>
        candidate.participantId === participantId &&
        candidate.procedureId === procedureId &&
        candidate.flightId === flightId,
    );
    if (!hold) return refuse(market, 'no-hold');
    price = hold.price;
    // 確保していた席が、そのまま購入済みの席になる。
    holds = holds.filter((candidate) => candidate !== hold);
  } else {
    if (availableSeats(market, flightId) < 1) return refuse(market, 'sold-out');
    if (site === 'site1' && site1FareRemaining(market, flightId) < 1) {
      return refuse(market, 'fare-sold-out');
    }
    price = site === 'site1' ? market.site1Price[flightId] : market.site3Price[flightId];
  }

  const bought: Purchase = {
    participantId,
    flightId,
    site,
    procedureId,
    price,
    bookingTimeMs: bookingTimeMs(market.timer, now),
  };
  // 本人の、まだ購入していない他の確保を解放する。
  holds = holds.filter((hold) => hold.participantId !== participantId);

  return {
    ok: true,
    state: closeIfEnoughPurchased(
      { ...market, holds, purchases: [...market.purchases, bought] },
      now,
    ),
    value: bought,
  };
}

/** 決めた人数が購入していたら、締切を今の時刻に早める。 */
function closeIfEnoughPurchased(market: MarketState, now: number): MarketState {
  const limit = market.closeWhenPurchased;
  if (limit === null || market.purchases.length < limit || market.timer.deadlineAt <= now) {
    return market;
  }
  return { ...market, timer: { ...market.timer, deadlineAt: now } };
}

/** 早めの締切が起きたかどうか。 */
export function closedEarly(market: MarketState): boolean {
  return market.timer.deadlineAt - market.timer.startAt < market.limitMs;
}

/** 締切までに購入が必要な人数のうち、まだ残っている人数。早めに締め切らないなら null。 */
export function purchasesUntilClose(market: MarketState): number | null {
  if (market.closeWhenPurchased === null) return null;
  return Math.max(0, market.closeWhenPurchased - market.purchases.length);
}

/** ラウンドの終了。残っている確保をすべて解放する。購入済みの席はそのまま残る。 */
export function closeMarket(market: MarketState): MarketState {
  return market.holds.length === 0 ? market : { ...market, holds: [] };
}
