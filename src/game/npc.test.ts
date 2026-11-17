import { describe, expect, it } from 'vitest';
import { createParticipants } from '../data/participants';
import { sampleRound } from '../data/sampleRound';
import { availableSeats, createMarket, purchase, type MarketState } from './market';
import {
  advanceNpcs,
  createNpc,
  npcSite3Viewing,
  stepNpc,
  type NpcKind,
  type NpcState,
} from './npc';
import { findTripViolations } from './requirements';
import { createRoundTimer } from './roundClock';
import { prototypeSettings as settings } from './settings';

const timer = createRoundTimer(0, settings);
const START = timer.startAt;
const DEADLINE = timer.deadlineAt;
const TICK = 100;

const freshMarket = () => createMarket(sampleRound, timer);
const ctxAt = (now: number) => ({ scenario: sampleRound, settings, now });

/** 指定した型のNPCを1人作る。型は番号の順に決まるので、番号を合わせる。 */
function npcOf(kind: NpcKind, market: MarketState, id = `npc-${kind}`): NpcState {
  const index = ['rusher', 'careful', 'watcher', 'explorer'].indexOf(kind);
  return createNpc(id, index, market, sampleRound, settings);
}

/** NPC1人を、時刻 until まで 100ミリ秒ずつ進める。途中の市場も記録する。 */
function runAlone(npc: NpcState, market: MarketState, until = DEADLINE) {
  const history: MarketState[] = [];
  for (let now = 0; now <= until; now += TICK) {
    ({ npc, market } = stepNpc(npc, market, ctxAt(now)));
    history.push(market);
  }
  return { npc, market, history };
}

/** NPC9人で、1ラウンドを最後まで進める。人間は何もしない。 */
function runRound() {
  let market = freshMarket();
  const participants = createParticipants(settings.npcCount);
  let npcs = participants
    .filter((p) => p.kind === 'npc')
    .map((p, index) => createNpc(p.id, index, market, sampleRound, settings));
  let maxSeatsUsed = 0;
  for (let now = 0; now <= DEADLINE; now += TICK) {
    ({ market, npcs } = advanceNpcs(market, npcs, {}, participants.length, ctxAt(now)));
    for (const flight of sampleRound.flights) {
      expect(availableSeats(market, flight.id)).toBeGreaterThanOrEqual(0);
      maxSeatsUsed = Math.max(maxSeatsUsed, flight.seats - availableSeats(market, flight.id));
    }
  }
  return { market, npcs };
}

describe('NPC1人の動き', () => {
  it('START より前は何もしない', () => {
    const market = freshMarket();
    const npc = npcOf('rusher', market);
    expect(stepNpc(npc, market, ctxAt(START - 1))).toEqual({ npc, market });
  });

  it('最初の操作は、人間と同じ検索の待ち時間が過ぎてから', () => {
    const market = freshMarket();
    const npc = npcOf('rusher', market);
    expect(npc.readyAt).toBeGreaterThanOrEqual(START + settings.searchDurationMs.min);
  });

  it('rusher は、条件を満たす便のうちサイト1が最も安い便をサイト1で買う', () => {
    const { market, npc } = runAlone(npcOf('rusher', freshMarket()), freshMarket());
    expect(npc.phase).toBe('done');
    expect(market.purchases).toEqual([
      expect.objectContaining({ flightId: 'HND-TSA-0910', site: 'site1' }),
    ]);
  });

  it('rusher は、サイト1の販売枠が尽きていたら、次の便のサイト1を買う', () => {
    let market = freshMarket();
    // 先に2人がサイト1の09:10発を買い、販売枠（2枚）を使い切っておく。
    for (const id of ['x', 'y']) {
      const r = purchase(market, {
        participantId: id,
        site: 'site1',
        flightId: 'HND-TSA-0910',
        procedureId: id,
        now: START,
      });
      if (r.ok) market = r.state;
    }
    const { market: after } = runAlone(npcOf('rusher', market), market);
    expect(after.purchases.at(-1)).toEqual(
      expect.objectContaining({
        participantId: 'npc-rusher',
        flightId: 'HND-TSA-1105',
        site: 'site1',
      }),
    );
  });

  it('careful は、サイト2で確保してから、確保した価格で買う', () => {
    const { market, history } = runAlone(npcOf('careful', freshMarket()), freshMarket());
    expect(history.some((m) => m.holds.some((h) => h.participantId === 'npc-careful'))).toBe(true);
    expect(market.purchases).toEqual([
      expect.objectContaining({ site: 'site2', price: market.site2Price['HND-TSA-0910'] }),
    ]);
    expect(market.holds).toEqual([]);
  });

  it('explorer は、サイト2で保険を確保しながらサイト1で買い、保険を解放する', () => {
    const { market, history } = runAlone(npcOf('explorer', freshMarket()), freshMarket());
    expect(history.some((m) => m.holds.some((h) => h.participantId === 'npc-explorer'))).toBe(true);
    expect(market.purchases).toEqual([expect.objectContaining({ site: 'site1' })]);
    expect(market.holds).toEqual([]);
  });

  it('explorer は、サイト1で買えなければ、保険に確保したサイト2の席を買う', () => {
    let market = freshMarket();
    // サイト1は、条件を満たす2便とも販売枠を使い切っておく。
    for (const [id, flightId] of [
      ['a', 'HND-TSA-0910'],
      ['b', 'HND-TSA-0910'],
      ['c', 'HND-TSA-1105'],
      ['d', 'HND-TSA-1105'],
    ]) {
      const r = purchase(market, {
        participantId: id,
        site: 'site1',
        flightId,
        procedureId: id,
        now: START,
      });
      if (r.ok) market = r.state;
    }
    const { market: after } = runAlone(npcOf('explorer', market), market);
    expect(after.purchases.at(-1)).toEqual(
      expect.objectContaining({ participantId: 'npc-explorer', site: 'site2' }),
    );
  });

  it('watcher は、サイト3が高い間は待ち、残り時間が少なくなったら買う', () => {
    // 条件を満たす2便とも、サイト3を上限の価格にしておく。
    const market = freshMarket();
    const high = {
      ...market,
      site3Price: { ...market.site3Price, 'HND-TSA-0910': 52_000, 'HND-TSA-1105': 67_000 },
    };
    const waitUntil = DEADLINE - settings.npc.stopWaitingRemainingMs - TICK;
    const { npc, market: after } = runAlone(npcOf('watcher', high), high, waitUntil);
    expect(npc.phase).toBe('payment');
    expect(after.purchases).toEqual([]);
    expect(npcSite3Viewing(npc)).toEqual(['HND-TSA-0910']);

    const final = runAlone(npc, after);
    expect(final.market.purchases).toEqual([
      expect.objectContaining({ site: 'site3', flightId: 'HND-TSA-0910', price: 52_000 }),
    ]);
  });

  it('watcher は、サイト3が安ければ待たずに買う', () => {
    const { market } = runAlone(npcOf('watcher', freshMarket()), freshMarket());
    expect(market.purchases).toEqual([
      expect.objectContaining({ site: 'site3', price: freshMarket().site3Price['HND-TSA-0910'] }),
    ]);
  });

  it('締切を過ぎたら、買えないまま終わる', () => {
    const market = freshMarket();
    const { npc } = stepNpc(npcOf('rusher', market), market, ctxAt(DEADLINE));
    expect(npc.phase).toBe('gave-up');
  });
});

describe('NPC9人での1ラウンド', () => {
  const { market, npcs } = runRound();

  it('全員が、買えたか、あきらめたかのどちらかで終わる', () => {
    expect(npcs.every((npc) => npc.phase === 'done' || npc.phase === 'gave-up')).toBe(true);
    expect(npcs.filter((npc) => npc.phase === 'done')).toHaveLength(market.purchases.length);
  });

  it('1人が買うのは1件まで', () => {
    const buyers = market.purchases.map((bought) => bought.participantId);
    expect(new Set(buyers).size).toBe(buyers.length);
  });

  it('NPCは条件メモを満たす便だけを買う', () => {
    for (const bought of market.purchases) {
      const flight = sampleRound.flights.find((f) => f.id === bought.flightId);
      expect(flight && findTripViolations(flight, sampleRound.requirements)).toEqual([]);
    }
  });

  it('サイト1の購入は、どの便でも販売枠を超えない', () => {
    for (const offer of sampleRound.offers) {
      const sold = market.purchases.filter(
        (p) => p.flightId === offer.flightId && p.site === 'site1',
      );
      expect(sold.length).toBeLessThanOrEqual(offer.site1.fareQuota);
    }
  });

  it('締切の後は、確保が残っていない状態にできる（購入済みの席だけが残る）', () => {
    expect(
      market.holds.every((h) => !market.purchases.some((p) => p.participantId === h.participantId)),
    ).toBe(true);
  });

  it('同じ条件で何度動かしても、同じ結果になる', () => {
    expect(runRound().market.purchases).toEqual(market.purchases);
  });

  it('サイトの好みが分かれ、1つのサイトに全員が集まらない', () => {
    expect(new Set(market.purchases.map((p) => p.site)).size).toBeGreaterThan(1);
  });
});
