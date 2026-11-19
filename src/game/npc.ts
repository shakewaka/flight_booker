import type { BookingEntry } from './booking';
import type { InputField } from './judge';
import {
  freeSeats,
  placeHold,
  purchase,
  purchaseOf,
  quoteFlight,
  site3SoldCount,
  type MarketState,
} from './market';
import { pickInRange, unitFromString } from './random';
import {
  findTripViolations,
  priceMeetsBudget,
  seatMeetsRequirements,
  type TripViolation,
} from './requirements';
import { searchDurationMs } from './search';
import { countSite3Viewers, site3Band, withSite3Prices, type Site3Viewing } from './site3Pricing';
import type { GameSettings } from './settings';
import type { RoundScenario, SiteId } from './types';

// NPC（コンピューターが操作する対戦相手）。企画書「15 NPCと人数調整」。
// - 人間と同じ市場処理（placeHold / purchase）だけを通して、席を確保・購入する。
// - 検索の待ち時間、入力の時間、販売枠、確保の条件は、人間と同じルールに従う。
// - 未来の価格や、人間に見えない情報は使わない。売り切れは、買おうとして初めて分かる。
// - 動きは乱数ではなく、NPCの番号から決まる。同じ番号なら毎回同じ動きになる。

/**
 * 行動の型（企画書の仮案）。
 * - rusher：最安のサイト1を優先し、急いで入力する。
 * - careful：サイト2で席を確保してから、落ち着いて残りを入力する。
 * - watcher：サイト3を開いて値下がりを待ち、安くなったら買う。
 * - explorer：サイト2で保険の席を確保しつつ、より安いサイト1を狙う。
 */
export type NpcKind = 'rusher' | 'careful' | 'watcher' | 'explorer';

export const NPC_KINDS: NpcKind[] = ['rusher', 'careful', 'watcher', 'explorer'];

export type NpcTarget = {
  flightId: string;
  site: SiteId;
  procedureId: string;
  /** 選んだ席。おまかせなら undefined。サイト2では、確保した後はこの席を買う。 */
  seatId?: string;
};

export type NpcState = {
  id: string;
  kind: NpcKind;
  /** 動きを決める元になる文字列。NPCの番号とラウンドから作り、ラウンドごとに動きを変える。 */
  seed: string;
  /** 速さの倍率。小さいほど速い。 */
  speed: number;
  /** このラウンドで見落とす条件。見落とさなければ null。旅行が成り立たなくなる条件は見落とさない。 */
  overlooked: TripViolation | null;
  /** このラウンドで打ち間違える入力の項目。間違えなければ null。 */
  typoField: InputField | null;
  phase: 'searching' | 'passenger' | 'payment' | 'done' | 'gave-up';
  /** 今の段階を終えて、次の操作をする時刻。 */
  readyAt: number;
  /** 候補を選んだ回数。手続きの番号と、時間の決め方に使う。 */
  attempt: number;
  target: NpcTarget | null;
  /** explorer が保険に確保した、サイト2の席。 */
  backup: NpcTarget | null;
  /** 買えなかった「便とサイト」の組み合わせ。同じ組み合わせは選び直さない。 */
  tried: string[];
};

export type NpcContext = {
  scenario: RoundScenario;
  settings: GameSettings;
  now: number;
};

const keyOf = (flightId: string, site: SiteId) => `${flightId}:${site}`;

/** 型ごとに、試すサイトの順番。 */
const SITE_ORDER: Record<NpcKind, SiteId[]> = {
  rusher: ['site1', 'site3', 'site2'],
  careful: ['site2', 'site1', 'site3'],
  watcher: ['site3', 'site2', 'site1'],
  explorer: ['site1', 'site2', 'site3'],
};

/**
 * NPCを作る。型は番号の順に4種類をくり返す（試合を通して同じ）。
 * 速さと入力の時間は、NPCの番号とラウンドから決める。同じラウンドなら毎回同じ動きになり、
 * ラウンドが変われば変わる。
 */
export function createNpc(
  id: string,
  index: number,
  market: MarketState,
  scenario: RoundScenario,
  settings: GameSettings,
): NpcState {
  const kind = NPC_KINDS[index % NPC_KINDS.length];
  const seed = `${id}|${scenario.id}`;
  const speed = pickInRange(`${seed}|speed`, settings.npc.speed);
  const pick = <T>(label: string, rate: number, choices: T[]): T | null =>
    unitFromString(`${seed}|${label}`) < rate
      ? choices[Math.floor(unitFromString(`${seed}|${label}-which`) * choices.length)]
      : null;
  const npc: NpcState = {
    id,
    kind,
    seed,
    speed,
    overlooked: pick('oversight', settings.npc.oversightRate, OVERLOOKABLE),
    typoField: pick('typo', settings.npc.inputMistakeRate, TYPO_FIELDS),
    phase: 'searching',
    readyAt: 0,
    attempt: 0,
    target: null,
    backup: null,
    tried: [],
  };
  // START と同時に検索を始める。検索の時間は、人間と同じ計算で決まる。
  const searchMs = npcSearchMs(scenario, settings);
  return {
    ...npc,
    readyAt: market.timer.startAt + searchMs + durationOf(npc, 'think', settings.npc.thinkMs),
  };
}

/** NPCごと・段階ごとに決まる時間。速さの倍率を掛ける。 */
function durationOf(npc: NpcState, label: string, range: { min: number; max: number }): number {
  return Math.round(pickInRange(`${npc.seed}|${label}|${npc.attempt}`, range) * npc.speed);
}

/** NPCが見落とすことのある条件。出発地・目的地・出発日は見落とさない。 */
const OVERLOOKABLE: TripViolation[] = [
  'departureTime',
  'arrivalTime',
  'operatingAirline',
  'arrivalTerminal',
  'checkedBaggage',
  'seat',
  'stops',
  'via',
  'duration',
  'budget',
];

/** 手続き中の便の、今の価格。サイト2で確保していれば、確保した価格。 */
function currentPrice(market: MarketState, npc: NpcState, target: NpcTarget): number {
  if (target.site === 'site1') return market.site1Price[target.flightId];
  if (target.site === 'site3') return market.site3Price[target.flightId];
  const hold = market.holds.find(
    (candidate) =>
      candidate.participantId === npc.id && candidate.procedureId === target.procedureId,
  );
  return hold?.price ?? market.site2Price[target.flightId];
}

/**
 * NPCが選ぶ席。席の条件がなければ、おまかせ（undefined）。
 * 条件があれば、空いている席のうち条件に合う席を、NPCごとに決まる順で選ぶ。
 * 席の条件を見落としているNPCは、条件を気にせず空いている席から選ぶ。
 * 選べる席がなければ null。
 */
function pickSeat(
  npc: NpcState,
  market: MarketState,
  flightId: string,
  scenario: RoundScenario,
): string | undefined | null {
  if (scenario.requirements.seatPositions === undefined) return undefined;
  const candidates = freeSeats(market, flightId).filter(
    (seat) => npc.overlooked === 'seat' || seatMeetsRequirements(seat, scenario.requirements),
  );
  if (candidates.length === 0) return null;
  return [...candidates].sort(
    (a, b) => unitFromString(`${npc.seed}|seat|${a}`) - unitFromString(`${npc.seed}|seat|${b}`),
  )[0];
}

/** NPCが打ち間違えることのある入力の項目。 */
const TYPO_FIELDS: InputField[] = [
  'surname',
  'givenName',
  'birthDate',
  'passportNumber',
  'passportExpiry',
  'cardNumber',
  'cardExpiry',
  'securityCode',
];

/**
 * NPCが条件を満たすと考える便を、そのサイトの価格が安い順に並べる。
 * 条件を1つ見落としているNPCは、その条件だけを満たさない便も候補に入れる。
 */
function validFlightsBy(
  npc: NpcState,
  scenario: RoundScenario,
  market: MarketState,
  site: SiteId,
): string[] {
  const priceOf = (flightId: string) =>
    site === 'site1'
      ? market.site1Price[flightId]
      : site === 'site2'
        ? market.site2Price[flightId]
        : market.site3Price[flightId];
  return scenario.flights
    .filter((flight) =>
      findTripViolations(flight, scenario.requirements, scenario.airports).every(
        (v) => v === npc.overlooked,
      ),
    )
    .map((flight) => flight.id)
    .sort((a, b) => priceOf(a) - priceOf(b));
}

type Candidate = { flightId: string; site: SiteId; seatId: string | undefined };

/**
 * 次に試す「便とサイト」と席。まだ試していない組み合わせから、型の順番で選ぶ。
 * 座席表で条件に合う席が空いていない便や、検索結果で売り切れと出ている便は、選ばない（人間にも見えている）。
 */
function nextCandidate(
  npc: NpcState,
  scenario: RoundScenario,
  market: MarketState,
  sites: SiteId[] = SITE_ORDER[npc.kind],
): Candidate | null {
  for (const site of sites) {
    for (const flightId of validFlightsBy(npc, scenario, market, site)) {
      if (npc.tried.includes(keyOf(flightId, site))) continue;
      // 検索結果で売り切れ・満席と出ている組み合わせは選ばない（人間も検索し直せば見える）。
      const quote = quoteFlight(market, flightId)[site];
      if (!quote.available) continue;
      // 予算の条件があれば、今の価格が予算を超える組み合わせは選ばない（予算を見落としたNPCは選ぶ）。
      if (npc.overlooked !== 'budget' && !priceMeetsBudget(quote.price, scenario.requirements)) {
        continue;
      }
      const seatId = pickSeat(npc, market, flightId, scenario);
      if (seatId !== null) return { flightId, site, seatId };
    }
  }
  return null;
}

function startProcedure(
  npc: NpcState,
  candidate: Candidate,
  ctx: NpcContext,
  inputScale = 1,
): NpcState {
  const attempt = npc.attempt + 1;
  const next = { ...npc, attempt };
  // 席の条件があるときは、座席表から席を選ぶ時間もかかる。
  const seatMs =
    candidate.seatId === undefined ? 0 : durationOf(next, 'seat', ctx.settings.npc.seatPickMs);
  return {
    ...next,
    phase: 'passenger',
    target: { ...candidate, procedureId: `${npc.id}-${attempt}` },
    readyAt:
      ctx.now +
      seatMs +
      durationOf(next, 'passenger', ctx.settings.npc.passengerInputMs) * inputScale,
  };
}

/**
 * 選んだ席だけが埋まっていたとき。条件に合う別の席が空いていれば、席を選び直して同じ手続きを続ける
 * （入力は残っている）。空いていなければ、候補を選び直す。
 */
function reselectSeat(npc: NpcState, market: MarketState, ctx: NpcContext): NpcState {
  const target = npc.target;
  const seatId = target ? pickSeat(npc, market, target.flightId, ctx.scenario) : null;
  if (!target || seatId === null) return recover(npc, ctx);
  return {
    ...npc,
    target: { ...target, seatId },
    readyAt:
      ctx.now +
      Math.round(
        pickInRange(`${npc.seed}|reseat|${ctx.now}`, ctx.settings.npc.seatPickMs) * npc.speed,
      ),
  };
}

/** 買えなかったとき。保険の確保があればそれを買いに行き、なければ候補を選び直す。 */
function recover(npc: NpcState, ctx: NpcContext): NpcState {
  const tried = npc.target
    ? [...npc.tried, keyOf(npc.target.flightId, npc.target.site)]
    : npc.tried;
  if (npc.backup) {
    // 搭乗者情報は入力済みなので、決済の入力だけをやり直す。
    return {
      ...npc,
      tried,
      phase: 'payment',
      target: npc.backup,
      backup: null,
      readyAt: ctx.now + durationOf(npc, 'backup-payment', ctx.settings.npc.paymentInputMs),
    };
  }
  return {
    ...npc,
    tried,
    phase: 'searching',
    target: null,
    readyAt: ctx.now + durationOf(npc, 'think', ctx.settings.npc.thinkMs),
  };
}

/** サイト3の値下がりを待つNPCが、今の価格で買うかどうか。価格帯が上がっていれば、上の価格帯の中で考える。 */
function site3PriceIsGood(market: MarketState, ctx: NpcContext, flightId: string): boolean {
  const offer = ctx.scenario.offers.find((candidate) => candidate.flightId === flightId);
  if (!offer) return true;
  const { minPrice, maxPrice } = site3Band(offer.site3, site3SoldCount(market, flightId));
  const limit = minPrice + (maxPrice - minPrice) * ctx.settings.npc.site3BuyBelowRate;
  const remaining = market.timer.deadlineAt - ctx.now;
  return (
    market.site3Price[flightId] <= limit || remaining <= ctx.settings.npc.stopWaitingRemainingMs
  );
}

/**
 * NPCを1歩進める。次の操作の時刻になっていれば操作し、新しいNPCと市場を返す。
 * 市場の操作は、人間と同じ placeHold / purchase だけを使う。
 */
export function stepNpc(
  npc: NpcState,
  market: MarketState,
  ctx: NpcContext,
): { npc: NpcState; market: MarketState; entry?: BookingEntry } {
  const unchanged = { npc, market };
  if (npc.phase === 'done' || npc.phase === 'gave-up') return unchanged;
  if (ctx.now >= market.timer.deadlineAt) return { npc: { ...npc, phase: 'gave-up' }, market };
  if (ctx.now < npc.readyAt || ctx.now < market.timer.startAt) return unchanged;
  if (purchaseOf(market, npc.id)) return { npc: { ...npc, phase: 'done' }, market };

  if (npc.phase === 'searching') {
    const candidate = nextCandidate(npc, ctx.scenario, market);
    if (!candidate) return { npc: { ...npc, phase: 'gave-up' }, market };
    // explorer は、まずサイト2で保険の席を確保しに行く。
    if (npc.kind === 'explorer' && !npc.backup && npc.attempt === 0) {
      const insurance = nextCandidate(npc, ctx.scenario, market, ['site2']);
      if (insurance) return { npc: startProcedure(npc, insurance, ctx), market };
    }
    return { npc: startProcedure(npc, candidate, ctx), market };
  }

  const target = npc.target;
  if (!target) return { npc: recover(npc, ctx), market };

  if (npc.phase === 'passenger') {
    if (target.site === 'site2') {
      const held = placeHold(market, {
        participantId: npc.id,
        flightId: target.flightId,
        seatId: target.seatId,
        procedureId: target.procedureId,
        now: ctx.now,
      });
      if (!held.ok) {
        return {
          npc: held.reason === 'seat-taken' ? reselectSeat(npc, market, ctx) : recover(npc, ctx),
          market,
        };
      }
      if (npc.kind === 'explorer' && !npc.backup) {
        // 保険を確保したら、もっと安いサイト1を狙う。入力は手元にあるので少し速い。
        const cheaper = nextCandidate(npc, ctx.scenario, held.state, ['site1']);
        if (cheaper) {
          const withBackup = { ...npc, backup: target };
          return { npc: startProcedure(withBackup, cheaper, ctx, 0.6), market: held.state };
        }
      }
      market = held.state;
    }
    return {
      npc: {
        ...npc,
        phase: 'payment',
        readyAt: ctx.now + durationOf(npc, 'payment', ctx.settings.npc.paymentInputMs),
      },
      market,
    };
  }

  // 決済の入力が終わった。
  if (
    npc.kind === 'watcher' &&
    target.site === 'site3' &&
    !site3PriceIsGood(market, ctx, target.flightId)
  ) {
    return { npc: { ...npc, readyAt: ctx.now + ctx.settings.npc.priceCheckMs }, market };
  }

  // 確定する前に、今の価格が予算に収まっているかを見る（予算を見落としたNPCは見ない）。
  // サイト3は、値下がりを待つNPCなら待ち、それ以外は別の候補を探す。
  if (
    npc.overlooked !== 'budget' &&
    !priceMeetsBudget(currentPrice(market, npc, target), ctx.scenario.requirements)
  ) {
    if (npc.kind === 'watcher' && target.site === 'site3') {
      return { npc: { ...npc, readyAt: ctx.now + ctx.settings.npc.priceCheckMs }, market };
    }
    return { npc: recover(npc, ctx), market };
  }

  const bought = purchase(market, {
    participantId: npc.id,
    site: target.site,
    flightId: target.flightId,
    seatId: target.seatId,
    procedureId: target.procedureId,
    now: ctx.now,
  });
  if (bought.ok) {
    return {
      npc: { ...npc, phase: 'done' },
      market: bought.state,
      entry: npcEntry(npc, target, ctx.scenario),
    };
  }
  if (bought.reason === 'closed') return { npc: { ...npc, phase: 'gave-up' }, market };
  if (bought.reason === 'seat-taken') return { npc: reselectSeat(npc, market, ctx), market };
  return { npc: recover(npc, ctx), market };
}

/** 打ち間違えた値。末尾の2文字を入れ替え、同じ文字なら末尾を別の文字に変える。 */
function mistype(value: string): string {
  const a = value.at(-2);
  const b = value.at(-1);
  if (a !== undefined && b !== undefined && a !== b) return value.slice(0, -2) + b + a;
  return value.slice(0, -1) + (b === '0' ? '1' : '0');
}

/** NPCが予約で入力した内容。打ち間違える項目があれば、その項目だけ値を変える。 */
function npcEntry(npc: NpcState, target: NpcTarget, scenario: RoundScenario): BookingEntry {
  const { passport, card } = scenario;
  const entry: BookingEntry = {
    participantId: npc.id,
    procedureId: target.procedureId,
    site: target.site,
    flightId: target.flightId,
    passenger: {
      surname: passport.surname,
      givenName: passport.givenName,
      birthDate: passport.birthDate.replaceAll('-', '/'),
      nationality: passport.nationality,
      passportNumber: passport.passportNumber,
      passportExpiry: passport.expiryDate.replaceAll('-', '/'),
    },
    payment: {
      holderName: card.holderName,
      cardNumber: card.number,
      cardExpiry: card.expiry,
      securityCode: card.securityCode,
    },
  };
  const field = npc.typoField;
  if (!field) return entry;
  if (field in entry.passenger) {
    const key = field as keyof BookingEntry['passenger'];
    return { ...entry, passenger: { ...entry.passenger, [key]: mistype(entry.passenger[key]) } };
  }
  const key = field as keyof BookingEntry['payment'];
  return { ...entry, payment: { ...entry.payment, [key]: mistype(entry.payment[key]) } };
}

/** NPCがサイト3で開いている便。閲覧人数に数える。 */
export function npcSite3Viewing(npc: NpcState): string[] {
  if (npc.phase !== 'passenger' && npc.phase !== 'payment') return [];
  return npc.target?.site === 'site3' ? [npc.target.flightId] : [];
}

/** 検索の時間を、人間と同じ計算で求める（NPCは条件メモどおりに検索する）。 */
export function npcSearchMs(scenario: RoundScenario, settings: GameSettings): number {
  const { requirements } = scenario;
  return searchDurationMs(
    {
      originCode: requirements.originCode,
      destinationCode: requirements.destinationCode,
      departureDate: requirements.departureDate,
      arrivalDate: requirements.departureDate,
      nonstopOnly: false,
      checkedBaggageKg: requirements.checkedBaggageKg,
    },
    settings.searchDurationMs,
  );
}

/**
 * NPC全員を1歩ずつ進め、サイト3の価格を閲覧人数に合わせて更新する。
 * 同じ時刻に複数のNPCが操作するときの順番は、時刻によって回し、特定のNPCがいつも先にならないようにする。
 */
export function advanceNpcs(
  market: MarketState,
  npcs: NpcState[],
  humanViewing: Site3Viewing,
  participantCount: number,
  ctx: NpcContext,
): {
  market: MarketState;
  npcs: NpcState[];
  site3Viewers: Record<string, number>;
  /** この1歩で購入したNPCの、予約の入力内容。 */
  entries: BookingEntry[];
} {
  const next = [...npcs];
  const entries: BookingEntry[] = [];
  const offset = npcs.length > 0 ? Math.floor(ctx.now / 100) % npcs.length : 0;
  for (let i = 0; i < next.length; i += 1) {
    const index = (offset + i) % next.length;
    const stepped = stepNpc(next[index], market, ctx);
    next[index] = stepped.npc;
    market = stepped.market;
    if (stepped.entry) entries.push(stepped.entry);
  }

  const viewing: Site3Viewing = { ...humanViewing };
  for (const npc of next) viewing[npc.id] = npcSite3Viewing(npc);
  const purchased = new Set(market.purchases.map((bought) => bought.participantId));
  const site3Viewers = countSite3Viewers(viewing, purchased);
  market = withSite3Prices(
    market,
    ctx.scenario.offers,
    site3Viewers,
    participantCount,
    ctx.settings.site3,
    ctx.settings.pricing.roundingStep,
  );
  return { market, npcs: next, site3Viewers, entries };
}
