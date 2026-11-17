import { describe, expect, it } from 'vitest';
import { createParticipants } from '../data/participants';
import { matchRounds } from '../data/rounds';
import { createMarket } from './market';
import { computeStandings } from './match';
import { advanceNpcs, createNpc } from './npc';
import { findTripViolations } from './requirements';
import { createRoundTimer } from './roundClock';
import type { RoundResultRow } from './results';
import { findScenarioProblems } from './scenario';
import { prototypeSettings } from './settings';
import type { Participant } from './types';

const people: Participant[] = [
  { id: 'a', name: 'A', kind: 'human' },
  { id: 'b', name: 'B', kind: 'npc' },
  { id: 'c', name: 'C', kind: 'npc' },
];

/** 参加者ごとの [金額, タイム] から、1ラウンド分の結果を作る。順位は総合順位の計算に使わない。 */
function round(values: Record<string, [number, number]>): RoundResultRow[] {
  return people.map((participant) => ({
    participant,
    status: 'booked',
    amount: values[participant.id][0],
    timeMs: values[participant.id][1],
    site: 'site1',
    flightId: 'F',
    inputMistakes: [],
    tripViolations: [],
    rank: 0,
  }));
}

describe('computeStandings', () => {
  it('合計金額の小さい順に並べ、ラウンドごとの金額も残す', () => {
    const rounds = [
      round({ a: [30_000, 60_000], b: [20_000, 90_000], c: [25_000, 50_000] }),
      round({ a: [20_000, 40_000], b: [35_000, 30_000], c: [26_000, 70_000] }),
    ];
    const standings = computeStandings(people, rounds);
    expect(standings.map((s) => [s.participant.id, s.amount, s.rank])).toEqual([
      ['a', 50_000, 1],
      ['c', 51_000, 2],
      ['b', 55_000, 3],
    ]);
    expect(standings[0].roundAmounts).toEqual([30_000, 20_000]);
  });

  it('合計金額が同じなら、合計予約タイムの短い順', () => {
    const standings = computeStandings(people, [
      round({ a: [20_000, 70_000], b: [20_000, 69_999], c: [30_000, 1_000] }),
    ]);
    expect(standings.map((s) => s.participant.id)).toEqual(['b', 'a', 'c']);
  });

  it('合計金額も合計タイムも同じなら同順位', () => {
    const standings = computeStandings(people, [
      round({ a: [20_000, 50_000], b: [25_000, 40_000], c: [30_000, 1_000] }),
      round({ a: [25_000, 40_000], b: [20_000, 50_000], c: [30_000, 1_000] }),
    ]);
    expect(standings.map((s) => s.rank)).toEqual([1, 1, 3]);
  });

  it('ラウンドの順位点ではなく合計金額で決める（毎回2位でも、合計が最も安ければ1位）', () => {
    const standings = computeStandings(people, [
      round({ a: [21_000, 1], b: [20_000, 1], c: [40_000, 1] }),
      round({ a: [21_000, 1], b: [40_000, 1], c: [20_000, 1] }),
    ]);
    expect(standings[0].participant.id).toBe('a');
  });

  it('前のラウンドまでの順位と、首位との金額差を出す', () => {
    const standings = computeStandings(people, [
      round({ a: [20_000, 1], b: [25_000, 1], c: [30_000, 1] }),
      round({ a: [40_000, 1], b: [25_000, 1], c: [21_000, 1] }),
    ]);
    expect(standings.map((s) => [s.participant.id, s.rank, s.previousRank, s.gapToLeader])).toEqual(
      [
        ['b', 1, 2, 0],
        ['c', 2, 3, 1_000],
        ['a', 3, 1, 10_000],
      ],
    );
  });

  it('1ラウンド目の後は、前の順位がない', () => {
    const standings = computeStandings(people, [round({ a: [1, 1], b: [2, 1], c: [3, 1] })]);
    expect(standings.every((s) => s.previousRank === null)).toBe(true);
  });
});

describe('4ラウンドの出題データ', () => {
  const participantCount = createParticipants(prototypeSettings.npcCount).length;

  it('4ラウンドある', () => {
    expect(matchRounds).toHaveLength(prototypeSettings.roundCount);
  });

  it.each(matchRounds.map((scenario, index) => [index + 1, scenario] as const))(
    'ラウンド%iは、価格の関係・時差・座席数の点検で問題がない',
    (_, scenario) => {
      expect(findScenarioProblems(scenario, participantCount)).toEqual([]);
    },
  );

  it('ラウンドごとに、パスポートと条件メモが変わる', () => {
    const passports = new Set(matchRounds.map((s) => s.passport.passportNumber));
    const routes = new Set(
      matchRounds.map((s) => `${s.requirements.originCode}-${s.requirements.destinationCode}`),
    );
    expect(passports.size).toBe(4);
    expect(routes.size).toBe(4);
  });
});

describe('4ラウンドでのNPC', () => {
  it.each(matchRounds.map((scenario, index) => [index + 1, scenario] as const))(
    'ラウンド%iでも、NPCは1人1件まで、条件を満たす便だけを、販売枠の中で買う',
    (_, scenario) => {
      const participants = createParticipants(prototypeSettings.npcCount);
      const timer = createRoundTimer(0, prototypeSettings);
      let market = createMarket(scenario, timer);
      let npcs = participants
        .filter((p) => p.kind === 'npc')
        .map((p, index) => createNpc(p.id, index, market, scenario, prototypeSettings));
      for (let now = 0; now <= timer.deadlineAt; now += 100) {
        ({ market, npcs } = advanceNpcs(market, npcs, {}, participants.length, {
          scenario,
          settings: prototypeSettings,
          now,
        }));
      }

      const buyers = market.purchases.map((p) => p.participantId);
      expect(new Set(buyers).size).toBe(buyers.length);
      expect(market.purchases.length).toBeGreaterThan(0);
      for (const bought of market.purchases) {
        const flight = scenario.flights.find((f) => f.id === bought.flightId);
        expect(flight && findTripViolations(flight, scenario.requirements)).toEqual([]);
      }
      for (const offer of scenario.offers) {
        const sold = market.purchases.filter(
          (p) => p.flightId === offer.flightId && p.site === 'site1',
        );
        expect(sold.length).toBeLessThanOrEqual(offer.site1.fareQuota);
      }
    },
  );
});

describe('ラウンドごとのNPCの動き', () => {
  const participants = createParticipants(prototypeSettings.npcCount);
  const npcsOf = (roundIndex: number) => {
    const scenario = matchRounds[roundIndex];
    const market = createMarket(scenario, createRoundTimer(0, prototypeSettings));
    return participants
      .filter((p) => p.kind === 'npc')
      .map((p, index) => createNpc(p.id, index, market, scenario, prototypeSettings));
  };

  it('同じラウンドなら、何度作っても同じ速さになる', () => {
    expect(npcsOf(1).map((npc) => npc.speed)).toEqual(npcsOf(1).map((npc) => npc.speed));
  });

  it('ラウンドが変わると、NPCの速さも変わる。型は試合を通して同じ', () => {
    const first = npcsOf(0);
    const second = npcsOf(1);
    expect(second.map((npc) => npc.kind)).toEqual(first.map((npc) => npc.kind));
    const changed = second.filter((npc, i) => npc.speed !== first[i].speed);
    expect(changed.length).toBe(second.length);
  });

  it('4ラウンドすべてで同じNPCが最も速い、ということが起きない', () => {
    const fastest = matchRounds.map((_, round) => {
      const npcs = npcsOf(round);
      return npcs.reduce((best, npc) => (npc.speed < best.speed ? npc : best)).id;
    });
    expect(new Set(fastest).size).toBeGreaterThan(1);
  });
});
