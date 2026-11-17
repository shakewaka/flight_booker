import { placeHold, purchase, purchaseOf, type MarketState } from './market';
import { pickInRange } from './random';
import { findTripViolations } from './requirements';
import { searchDurationMs } from './search';
import { countSite3Viewers, withSite3Prices, type Site3Viewing } from './site3Pricing';
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

export type NpcTarget = { flightId: string; site: SiteId; procedureId: string };

export type NpcState = {
  id: string;
  kind: NpcKind;
  /** 動きを決める元になる文字列。NPCの番号とラウンドから作り、ラウンドごとに動きを変える。 */
  seed: string;
  /** 速さの倍率。小さいほど速い。 */
  speed: number;
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
  const npc: NpcState = {
    id,
    kind,
    seed,
    speed,
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

/** 条件メモを満たす便を、そのサイトの価格が安い順に並べる。 */
function validFlightsBy(scenario: RoundScenario, market: MarketState, site: SiteId): string[] {
  const priceOf = (flightId: string) =>
    site === 'site1'
      ? market.site1Price[flightId]
      : site === 'site2'
        ? market.site2Price[flightId]
        : market.site3Price[flightId];
  return scenario.flights
    .filter((flight) => findTripViolations(flight, scenario.requirements).length === 0)
    .map((flight) => flight.id)
    .sort((a, b) => priceOf(a) - priceOf(b));
}

/** 次に試す「便とサイト」。まだ試していない組み合わせから、型の順番で選ぶ。 */
function nextCandidate(
  npc: NpcState,
  scenario: RoundScenario,
  market: MarketState,
  sites: SiteId[] = SITE_ORDER[npc.kind],
): { flightId: string; site: SiteId } | null {
  for (const site of sites) {
    for (const flightId of validFlightsBy(scenario, market, site)) {
      if (!npc.tried.includes(keyOf(flightId, site))) return { flightId, site };
    }
  }
  return null;
}

function startProcedure(
  npc: NpcState,
  candidate: { flightId: string; site: SiteId },
  ctx: NpcContext,
  inputScale = 1,
): NpcState {
  const attempt = npc.attempt + 1;
  const next = { ...npc, attempt };
  return {
    ...next,
    phase: 'passenger',
    target: { ...candidate, procedureId: `${npc.id}-${attempt}` },
    readyAt:
      ctx.now + durationOf(next, 'passenger', ctx.settings.npc.passengerInputMs) * inputScale,
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

/** サイト3の値下がりを待つNPCが、今の価格で買うかどうか。 */
function site3PriceIsGood(market: MarketState, ctx: NpcContext, flightId: string): boolean {
  const offer = ctx.scenario.offers.find((candidate) => candidate.flightId === flightId);
  if (!offer) return true;
  const { minPrice, maxPrice } = offer.site3;
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
): { npc: NpcState; market: MarketState } {
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
        procedureId: target.procedureId,
        now: ctx.now,
      });
      if (!held.ok) return { npc: recover(npc, ctx), market };
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

  const bought = purchase(market, {
    participantId: npc.id,
    site: target.site,
    flightId: target.flightId,
    procedureId: target.procedureId,
    now: ctx.now,
  });
  if (bought.ok) return { npc: { ...npc, phase: 'done' }, market: bought.state };
  if (bought.reason === 'closed') return { npc: { ...npc, phase: 'gave-up' }, market };
  return { npc: recover(npc, ctx), market };
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
): { market: MarketState; npcs: NpcState[]; site3Viewers: Record<string, number> } {
  const next = [...npcs];
  const offset = npcs.length > 0 ? Math.floor(ctx.now / 100) % npcs.length : 0;
  for (let i = 0; i < next.length; i += 1) {
    const index = (offset + i) % next.length;
    const stepped = stepNpc(next[index], market, ctx);
    next[index] = stepped.npc;
    market = stepped.market;
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
  return { market, npcs: next, site3Viewers };
}
