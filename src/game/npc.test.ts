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
import { judgeBooking } from './judge';
import { findTripViolations } from './requirements';
import { createRoundTimer } from './roundClock';
import { seatPosition } from './seatMap';
import { prototypeSettings as settings } from './settings';

/** 成功した結果の状態を取り出す。失敗していたらテストを止める。 */
function ok(result: ReturnType<typeof purchase>): MarketState {
  if (!result.ok) throw new Error(`失敗した：${result.reason}`);
  return result.state;
}

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

  it('NPCが買う便の条件違反は、見落とした1つの条件だけ（旅行が成り立たない便は買わない）', () => {
    for (const bought of market.purchases) {
      const flight = sampleRound.flights.find((f) => f.id === bought.flightId);
      const npc = npcs.find((candidate) => candidate.id === bought.participantId);
      const violations = flight ? findTripViolations(flight, sampleRound.requirements) : ['?'];
      expect(violations.every((v) => v === npc?.overlooked)).toBe(true);
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

describe('NPCの席選び', () => {
  // サンプルのラウンドに「座席は窓側」の条件を足したもの。
  const windowRound = {
    ...sampleRound,
    requirements: { ...sampleRound.requirements, seatPositions: ['window' as const] },
  };
  const windowCtx = (now: number) => ({ scenario: windowRound, settings, now });
  const rusher = (market: MarketState): NpcState => ({
    ...createNpc('npc-seat', 0, market, windowRound, settings),
    overlooked: null,
  });
  /** NPCを進め、最初の手続きを始めた時点の状態を返す。 */
  const untilProcedure = (npc: NpcState, market: MarketState) => {
    let now = 0;
    while (npc.phase === 'searching') {
      ({ npc, market } = stepNpc(npc, market, windowCtx(now)));
      now += TICK;
    }
    return { npc, market, now };
  };
  const finish = (npc: NpcState, market: MarketState, from: number) => {
    for (let now = from; now <= DEADLINE; now += TICK) {
      ({ npc, market } = stepNpc(npc, market, windowCtx(now)));
    }
    return { npc, market };
  };

  it('席の条件があれば、条件に合う席を選んで買う', () => {
    const market = createMarket(windowRound, timer);
    const started = untilProcedure(rusher(market), market);
    expect(seatPosition(started.npc.target?.seatId ?? '')).toBe('window');
    const { market: after } = finish(started.npc, started.market, started.now);
    expect(seatPosition(after.purchases[0].seatId)).toBe('window');
  });

  it('入力中に選んだ席が埋まったら、条件に合う別の席を選び直し、同じ手続きのまま買う', () => {
    let market = createMarket(windowRound, timer);
    const started = untilProcedure(rusher(market), market);
    const target = started.npc.target!;
    // 入力している間に、ほかの人がその席を買う。
    market = ok(
      purchase(started.market, {
        participantId: 'someone',
        site: 'site3',
        flightId: target.flightId,
        seatId: target.seatId,
        procedureId: 'x',
        now: started.now,
      }),
    );
    const { market: after } = finish(started.npc, market, started.now);
    const bought = after.purchases.find((p) => p.participantId === 'npc-seat');
    expect(bought?.procedureId).toBe(target.procedureId);
    expect(bought?.seatId).not.toBe(target.seatId);
    expect(seatPosition(bought?.seatId ?? '')).toBe('window');
  });

  it('条件に合う席が残っていない便は選ばない', () => {
    let market = createMarket(windowRound, timer);
    // 最安の 09:10 便の窓側の席を、すべてほかの人が買う。
    const windows = market.seats['HND-TSA-0910'].filter((s) => seatPosition(s) === 'window');
    windows.forEach((seatId, i) => {
      market = ok(
        purchase(market, {
          participantId: `p${i}`,
          site: 'site3',
          flightId: 'HND-TSA-0910',
          seatId,
          procedureId: `p${i}`,
          now: START,
        }),
      );
    });
    const started = untilProcedure(rusher(market), market);
    expect(started.npc.target?.flightId).not.toBe('HND-TSA-0910');
  });
});

describe('NPCの見落としと打ち間違え', () => {
  it('条件を1つ見落としたNPCは、その条件だけを満たさない、より安い便を買うことがある', () => {
    const market = freshMarket();
    // 09:00以降の出発という条件を見落とす。07:05発（サイト1 26,000円）が候補に入る。
    const npc = { ...npcOf('rusher', market), overlooked: 'departureTime' as const };
    const { market: after } = runAlone(npc, market);
    expect(after.purchases).toEqual([
      expect.objectContaining({ flightId: 'HND-TSA-0705', site: 'site1' }),
    ]);
  });

  it('見落とさないNPCは、条件を満たす便だけを候補にする', () => {
    const market = freshMarket();
    const npc = { ...npcOf('rusher', market), overlooked: null };
    expect(runAlone(npc, market).market.purchases[0].flightId).toBe('HND-TSA-0910');
  });

  it('打ち間違えるNPCは、その1項目だけを間違えた入力内容を残す', () => {
    let market = freshMarket();
    let npc: NpcState = { ...npcOf('rusher', market), typoField: 'passportNumber' };
    let entry;
    for (let now = 0; now <= DEADLINE && !entry; now += TICK) {
      const stepped = stepNpc(npc, market, ctxAt(now));
      ({ npc, market } = stepped);
      entry = stepped.entry;
    }
    expect(entry && judgeBooking(entry, sampleRound).inputMistakes).toEqual([
      { field: 'passportNumber', entered: 'PX0417268', expected: 'PX0417286' },
    ]);
  });

  it('打ち間違えないNPCの入力内容は、パスポート・カードどおり', () => {
    let market = freshMarket();
    let npc: NpcState = { ...npcOf('careful', market), typoField: null };
    let entry;
    for (let now = 0; now <= DEADLINE && !entry; now += TICK) {
      const stepped = stepNpc(npc, market, ctxAt(now));
      ({ npc, market } = stepped);
      entry = stepped.entry;
    }
    expect(entry && judgeBooking(entry, sampleRound)).toEqual({
      inputMistakes: [],
      tripViolations: [],
    });
  });

  it('見落とすNPCと打ち間違えるNPCは、設定の割合くらいの人数になる', () => {
    const market = freshMarket();
    const many = Array.from({ length: 400 }, (_, i) =>
      createNpc(`npc-${i}`, i, market, sampleRound, settings),
    );
    const typoRate = many.filter((n) => n.typoField).length / many.length;
    const oversightRate = many.filter((n) => n.overlooked).length / many.length;
    expect(typoRate).toBeGreaterThan(settings.npc.inputMistakeRate - 0.07);
    expect(typoRate).toBeLessThan(settings.npc.inputMistakeRate + 0.07);
    expect(oversightRate).toBeGreaterThan(settings.npc.oversightRate - 0.07);
    expect(oversightRate).toBeLessThan(settings.npc.oversightRate + 0.07);
  });

  it('NPCは、出発地・目的地・出発日を見落とさない', () => {
    const market = freshMarket();
    const many = Array.from({ length: 400 }, (_, i) =>
      createNpc(`npc-${i}`, i, market, sampleRound, settings),
    );
    const fatal = ['origin', 'destination', 'departureDate'];
    expect(many.some((n) => n.overlooked && fatal.includes(n.overlooked))).toBe(false);
  });
});
