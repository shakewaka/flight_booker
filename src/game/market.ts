import { bookingTimeMs, isBookingOpen, type RoundTimer } from './roundClock';
import { openSeatsOf } from './seatMap';
import type { Flight, FlightOffers, RoundScenario, SiteId, Yen } from './types';

// 1ラウンドの市場。全予約サイト・全参加者（人間とNPC）が、この処理だけを通して席を確保・購入する。
// 画面やタブごとに在庫を持たない。状態は書き換えず、操作のたびに新しい状態を返す。
//
// 守る仕様（企画書「7 予約サイトの3種類」「8 複数タブと予約の制約」）
// - 物理的な座席は、全サイトで共有する。席は座席番号で1席ずつ扱う（src/game/seatMap.ts）。
// - 席を指定しなければ（おまかせ）、空いている席を決まった順に割り当てる。
// - 指定した席だけが埋まっていて他に空席があれば 'seat-taken'、空席がなければ 'sold-out' を返す。
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
  /** 確保した席の座席番号。 */
  seatId: string;
  /** 確保を行った予約手続き。タブなど、画面側で1回の手続きごとに決める。 */
  procedureId: string;
  /** 確保した時点の総額。確保後に値上げしない。 */
  price: Yen;
};

export type Purchase = {
  participantId: string;
  flightId: string;
  /** 購入した席の座席番号。 */
  seatId: string;
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
  /** 便ごとの、参加者が買える席の座席番号。並びは、おまかせで割り当てる順。 */
  seats: Record<string, string[]>;
  /** 便ごとの、サイト1の最安料金で売れる上限数。 */
  site1Quota: Record<string, number>;
  site1Price: Record<string, Yen>;
  site2Price: Record<string, Yen>;
  /** 便ごとのサイト3の現在の価格。閲覧人数と価格帯で変わる（src/game/site3Pricing.ts）。 */
  site3Price: Record<string, Yen>;
  /** 便ごとのサイト3の販売条件。下の価格帯が売り切れたときに、価格を上げるのに使う。 */
  site3Fares: Record<string, FlightOffers['site3']>;
  /** サイト3の価格が、下の価格帯の下限から動いている便。価格を計算し直す便を絞るのに使う。 */
  site3Moved: string[];
  /**
   * ラウンドの途中で足した便と販売条件。検索で候補が0件になったとき、その検索条件に合う便を足す
   * （src/data/generateFlights.ts の ensureSearchResults）。出題の便と同じように確保・購入できる。
   */
  extraFlights: Flight[];
  extraOffers: FlightOffers[];
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
  /** 指定した席は埋まっているが、他に空席がある。席を選び直せば買える。 */
  | 'seat-taken'
  /** 座席表にない席、または一般の乗客が予約済みの席を指定した。 */
  | 'unknown-seat'
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
    seats: Object.fromEntries(scenario.flights.map((flight) => [flight.id, openSeatsOf(flight)])),
    site1Quota: byFlight((offer) => offer.site1.fareQuota),
    site1Price: byFlight((offer) => offer.site1.price),
    site2Price: byFlight((offer) => offer.site2.price),
    // 仮：閲覧人数を数えるまでは、サイト3は下限の価格から始める。
    site3Price: byFlight((offer) => offer.site3.minPrice),
    site3Fares: byFlight((offer) => offer.site3),
    site3Moved: [],
    extraFlights: [],
    extraOffers: [],
    holds: [],
    purchases: [],
    nextHoldNumber: 1,
  };
}

/** 誰も確保・購入していない席の座席番号。並びは、おまかせで割り当てる順。 */
export function freeSeats(market: MarketState, flightId: string): string[] {
  const taken = new Set(
    [...market.holds, ...market.purchases]
      .filter((item) => item.flightId === flightId)
      .map((item) => item.seatId),
  );
  return (market.seats[flightId] ?? []).filter((seat) => !taken.has(seat));
}

/** 誰も確保・購入していない座席の数。 */
export function availableSeats(market: MarketState, flightId: string): number {
  return freeSeats(market, flightId).length;
}

/**
 * 使う席を決める。指定がなければ（おまかせ）、空いている最初の席。
 * 決められなければ、その理由を返す。
 */
function chooseSeat(
  market: MarketState,
  flightId: string,
  seatId: string | undefined,
): { seatId: string } | { refusal: MarketRefusal } {
  const free = freeSeats(market, flightId);
  if (seatId !== undefined && !market.seats[flightId].includes(seatId)) {
    return { refusal: 'unknown-seat' };
  }
  if (free.length === 0) return { refusal: 'sold-out' };
  if (seatId === undefined) return { seatId: free[0] };
  return free.includes(seatId) ? { seatId } : { refusal: 'seat-taken' };
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
 * サイト2の確保。指定した席（指定がなければ空いている席）と、その時点のサイト2の価格を、
 * この手続きのために押さえる。
 * 同じ参加者が同じ手続きで確保し直した場合は、新しい確保を作らず、前の確保を返す。
 */
export function placeHold(
  market: MarketState,
  request: {
    participantId: string;
    flightId: string;
    /** 指定する席。省略すると、おまかせ。 */
    seatId?: string;
    procedureId: string;
    now: number;
  },
): MarketResult<Hold> {
  const { participantId, flightId, procedureId, now } = request;
  const refusal = checkCommon(market, participantId, flightId, now);
  if (refusal) return refuse(market, refusal);

  const existing = market.holds.find(
    (hold) => hold.participantId === participantId && hold.procedureId === procedureId,
  );
  if (existing) return { ok: true, state: market, value: existing };

  const seat = chooseSeat(market, flightId, request.seatId);
  if ('refusal' in seat) return refuse(market, seat.refusal);

  const hold: Hold = {
    id: `hold-${market.nextHoldNumber}`,
    participantId,
    flightId,
    seatId: seat.seatId,
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
 * サイト1・3は、指定した席（指定がなければ空いている席）をこの時点で確かめる。
 * 成功すると、本人の他の確保をすべて解放する。
 */
export function purchase(
  market: MarketState,
  request: {
    participantId: string;
    site: SiteId;
    flightId: string;
    /** 指定する席。省略すると、おまかせ。サイト2では使わず、確保した席を買う。 */
    seatId?: string;
    procedureId: string;
    now: number;
  },
): MarketResult<Purchase> {
  const { participantId, site, flightId, procedureId, now } = request;
  const refusal = checkCommon(market, participantId, flightId, now);
  if (refusal) return refuse(market, refusal);

  let price: Yen;
  let seatId: string;
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
    seatId = hold.seatId;
    // 確保していた席が、そのまま購入済みの席になる。
    holds = holds.filter((candidate) => candidate !== hold);
  } else {
    if (availableSeats(market, flightId) < 1) return refuse(market, 'sold-out');
    // 料金の枠が尽きていれば、席を選び直しても買えないので、先に知らせる。
    if (site === 'site1' && site1FareRemaining(market, flightId) < 1) {
      return refuse(market, 'fare-sold-out');
    }
    const seat = chooseSeat(market, flightId, request.seatId);
    if ('refusal' in seat) return refuse(market, seat.refusal);
    seatId = seat.seatId;
    price = site === 'site1' ? market.site1Price[flightId] : market.site3Price[flightId];
  }

  const bought: Purchase = {
    participantId,
    flightId,
    seatId,
    site,
    procedureId,
    price,
    bookingTimeMs: bookingTimeMs(market.timer, now),
  };
  // 本人の、まだ購入していない他の確保を解放する。
  holds = holds.filter((hold) => hold.participantId !== participantId);

  const next = { ...market, holds, purchases: [...market.purchases, bought] };
  return {
    ok: true,
    state: closeIfEnoughPurchased(
      site === 'site3' ? raiseSite3IfSoldOut(next, flightId) : next,
      now,
    ),
    value: bought,
  };
}

/** サイト3で売れた数。 */
export function site3SoldCount(market: MarketState, flightId: string): number {
  return market.purchases.filter((p) => p.flightId === flightId && p.site === 'site3').length;
}

/** サイト3の、下の価格帯の販売枠が売り切れたか。 */
export function site3FareRaised(market: MarketState, flightId: string): boolean {
  const fare = market.site3Fares[flightId];
  return fare !== undefined && site3SoldCount(market, flightId) >= fare.fareQuota;
}

/**
 * サイト3の購入で下の価格帯がちょうど売り切れたら、その場で価格を上の価格帯へ移す。
 * 下の価格帯の中での位置（閲覧人数による上がり幅）は保つ。次の閲覧人数の更新で、計算し直される。
 */
function raiseSite3IfSoldOut(market: MarketState, flightId: string): MarketState {
  const fare = market.site3Fares[flightId];
  if (!fare) return market;
  if (site3SoldCount(market, flightId) !== fare.fareQuota) return market;
  const offset = market.site3Price[flightId] - fare.minPrice;
  const price = Math.min(fare.raised.maxPrice, fare.raised.minPrice + Math.max(0, offset));
  return { ...market, site3Price: { ...market.site3Price, [flightId]: price } };
}

/** 予約サイトごとの、今の価格と買えるかどうか。比較サイトの検索結果に使う。 */
export type SiteQuote = { price: Yen; available: boolean };

/**
 * 便の、予約サイトごとの今の価格。
 * 空席がなければどのサイトも買えない。サイト1は、最安料金の販売枠が尽きていても買えない。
 */
export function quoteFlight(market: MarketState, flightId: string): Record<SiteId, SiteQuote> {
  const seats = availableSeats(market, flightId) > 0;
  return {
    site1: {
      price: market.site1Price[flightId],
      available: seats && site1FareRemaining(market, flightId) > 0,
    },
    site2: { price: market.site2Price[flightId], available: seats },
    site3: { price: market.site3Price[flightId], available: seats },
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

/** 出題の便と、ラウンドの途中で足した便のすべて。 */
export function allFlights(scenario: RoundScenario, market: MarketState): Flight[] {
  return market.extraFlights.length === 0
    ? scenario.flights
    : [...scenario.flights, ...market.extraFlights];
}

/** 便を番号で探す。出題の便になければ、ラウンドの途中で足した便から探す。 */
export function findFlight(
  scenario: RoundScenario,
  market: MarketState,
  flightId: string,
): Flight | undefined {
  return (
    scenario.flights.find((flight) => flight.id === flightId) ??
    market.extraFlights.find((flight) => flight.id === flightId)
  );
}

/** 便の販売条件を探す。 */
export function findOffers(
  scenario: RoundScenario,
  market: MarketState,
  flightId: string,
): FlightOffers | undefined {
  return (
    scenario.offers.find((offer) => offer.flightId === flightId) ??
    market.extraOffers.find((offer) => offer.flightId === flightId)
  );
}

/**
 * ラウンドの途中で便を足す。座席・価格・販売枠を、出題の便と同じ形で市場に入れる。
 * すでにある番号の便は足さない。
 */
export function addFlights(
  market: MarketState,
  flights: Flight[],
  offers: FlightOffers[],
): MarketState {
  const fresh = flights.filter((flight) => !(flight.id in market.seats));
  if (fresh.length === 0) return market;
  const offerOf = (id: string) => offers.find((offer) => offer.flightId === id);
  const added = fresh.flatMap((flight) => {
    const offer = offerOf(flight.id);
    return offer ? [{ flight, offer }] : [];
  });
  const entries = <T>(pick: (item: (typeof added)[number]) => T) =>
    Object.fromEntries(added.map((item) => [item.flight.id, pick(item)]));
  return {
    ...market,
    seats: { ...market.seats, ...entries(({ flight }) => openSeatsOf(flight)) },
    site1Quota: { ...market.site1Quota, ...entries(({ offer }) => offer.site1.fareQuota) },
    site1Price: { ...market.site1Price, ...entries(({ offer }) => offer.site1.price) },
    site2Price: { ...market.site2Price, ...entries(({ offer }) => offer.site2.price) },
    site3Price: { ...market.site3Price, ...entries(({ offer }) => offer.site3.minPrice) },
    site3Fares: { ...market.site3Fares, ...entries(({ offer }) => offer.site3) },
    extraFlights: [...market.extraFlights, ...added.map(({ flight }) => flight)],
    extraOffers: [...market.extraOffers, ...added.map(({ offer }) => offer)],
  };
}
