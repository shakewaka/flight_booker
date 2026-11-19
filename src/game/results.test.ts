import { describe, expect, it } from 'vitest';
import { sampleRound } from '../data/sampleRound';
import type { BookingEntry } from './booking';
import { createMarket, placeHold, purchase, type MarketState } from './market';
import { computeRoundResults, rankRows } from './results';
import { createRoundTimer } from './roundClock';
import { seatPosition } from './seatMap';
import type { Participant, SiteId } from './types';

const penaltySettings = { identityMistakeRate: 0.1, paymentMistakeRate: 0.05 };

const timer = createRoundTimer(0, { startCountdownMs: 10_000, roundTimeLimitMs: 300_000 });
const START = timer.startAt;

const people: Participant[] = [
  { id: 'player', name: 'あなた', kind: 'human' },
  { id: 'npc-1', name: 'ミナト', kind: 'npc' },
  { id: 'npc-2', name: 'カエデ', kind: 'npc' },
];

function buy(
  market: MarketState,
  participantId: string,
  site: SiteId,
  flightId: string,
  atMs: number,
) {
  const r = purchase(market, {
    participantId,
    site,
    flightId,
    procedureId: participantId,
    now: START + atMs,
  });
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

const entryOf = (
  flightId: string,
  change: Partial<BookingEntry['passenger']> = {},
): BookingEntry => ({
  participantId: 'player',
  procedureId: 'player',
  site: 'site1',
  flightId,
  passenger: {
    surname: 'HOSHINO',
    givenName: 'RINA',
    birthDate: '1998/03/21',
    nationality: 'NOVA REPUBLIC',
    passportNumber: 'PX0417286',
    passportExpiry: '2032/09/30',
    ...change,
  },
  payment: {
    holderName: 'RINA HOSHINO',
    cardNumber: '9041 7286 0035 1198',
    cardExpiry: '08/31',
    securityCode: '417',
  },
});

describe('rankRows', () => {
  it('集計金額の小さい順に並べる', () => {
    const ranked = rankRows([
      { id: 'a', amount: 30_000, timeMs: 1 },
      { id: 'b', amount: 20_000, timeMs: 9 },
    ]);
    expect(ranked.map((r) => [r.id, r.rank])).toEqual([
      ['b', 1],
      ['a', 2],
    ]);
  });

  it('同額なら、予約タイムの短い順に並べる', () => {
    const ranked = rankRows([
      { id: 'a', amount: 20_000, timeMs: 60_001 },
      { id: 'b', amount: 20_000, timeMs: 60_000 },
    ]);
    expect(ranked.map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('金額とタイムが完全に同じなら同順位とし、次の人は人数分とばした順位になる', () => {
    const ranked = rankRows([
      { id: 'a', amount: 20_000, timeMs: 5_000 },
      { id: 'b', amount: 20_000, timeMs: 5_000 },
      { id: 'c', amount: 25_000, timeMs: 1_000 },
    ]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 1, 3]);
  });

  it('表示では同じに見える1ミリ秒の差でも、順位は分ける', () => {
    const ranked = rankRows([
      { id: 'a', amount: 20_000, timeMs: 12_344 },
      { id: 'b', amount: 20_000, timeMs: 12_340 },
    ]);
    expect(ranked.map((r) => [r.id, r.rank])).toEqual([
      ['b', 1],
      ['a', 2],
    ]);
  });
});

describe('computeRoundResults', () => {
  it('予約した人は確定額と予約タイム、時間切れの人は最高値と制限時間で集計する', () => {
    let market = createMarket(sampleRound, timer);
    market = buy(market, 'npc-1', 'site1', 'HND-TSA-0910', 80_000);
    const rows = computeRoundResults({
      participants: people,
      market,
      entries: [],
      scenario: sampleRound,
      timeoutPenalty: 0,
      penaltySettings,
    });
    const npc1 = rows.find((r) => r.participant.id === 'npc-1');
    const timeout = rows.find((r) => r.participant.id === 'npc-2');
    expect(npc1).toEqual(
      expect.objectContaining({ status: 'booked', amount: 31_000, timeMs: 80_000, site: 'site1' }),
    );
    expect(timeout).toEqual(
      expect.objectContaining({
        status: 'timeout',
        amount: sampleRound.maxPrice,
        timeMs: 300_000,
        site: null,
      }),
    );
  });

  it('早めに締め切られて予約できなかった人も、時間はもともとの制限時間で集計する', () => {
    let market = createMarket(sampleRound, timer, { closeWhenPurchased: 1 });
    market = buy(market, 'npc-1', 'site1', 'HND-TSA-0910', 80_000);
    const rows = computeRoundResults({
      participants: people,
      market,
      entries: [],
      scenario: sampleRound,
      timeoutPenalty: 0,
      penaltySettings,
    });
    expect(market.timer.deadlineAt).toBe(START + 80_000);
    expect(rows.find((r) => r.participant.id === 'npc-2')).toEqual(
      expect.objectContaining({ status: 'timeout', amount: sampleRound.maxPrice, timeMs: 300_000 }),
    );
  });

  it('時間切れの集計金額には、追加ペナルティを足す', () => {
    const market = createMarket(sampleRound, timer);
    const rows = computeRoundResults({
      participants: people,
      market,
      entries: [],
      scenario: sampleRound,
      timeoutPenalty: 5_000,
      penaltySettings,
    });
    expect(rows[0].amount).toBe(sampleRound.maxPrice + 5_000);
  });

  it('正しい便の入力ミスは、購入額に減点を足す。購入額・減点・違反の内容は別々に残す', () => {
    let market = createMarket(sampleRound, timer);
    market = buy(market, 'player', 'site1', 'HND-TSA-0910', 40_000);
    const entries = [entryOf('HND-TSA-0910', { passportNumber: 'PX0417268' })];
    const rows = computeRoundResults({
      participants: people,
      market,
      entries,
      scenario: sampleRound,
      timeoutPenalty: 0,
      penaltySettings,
    });
    // 最高値 80,500円 の 10%（本人確認の入力ミス） = 8,050円 → 100円単位で 8,100円
    expect(sampleRound.maxPrice).toBe(80_500);
    expect(rows.find((r) => r.participant.id === 'player')).toEqual(
      expect.objectContaining({
        status: 'booked',
        purchasePrice: 31_000,
        amount: 31_000 + 8_100,
        timeMs: 40_000,
        tripViolations: [],
        inputMistakes: [{ field: 'passportNumber', entered: 'PX0417268', expected: 'PX0417286' }],
      }),
    );
  });

  it('カードの入力ミスは、本人確認の入力ミスより軽い', () => {
    let market = createMarket(sampleRound, timer);
    market = buy(market, 'player', 'site1', 'HND-TSA-0910', 40_000);
    const entry = {
      ...entryOf('HND-TSA-0910'),
      payment: { ...entryOf('HND-TSA-0910').payment, securityCode: '471' },
    };
    const rows = computeRoundResults({
      participants: people,
      market,
      entries: [entry],
      scenario: sampleRound,
      timeoutPenalty: 0,
      penaltySettings,
    });
    // 80,500円 の 5% = 4,025円 → 100円単位で 4,000円
    expect(rows[0].amount).toBe(31_000 + 4_000);
  });

  it('条件違反の予約は、安く早く買っても最高値で集計し、遅く正しい便を買った人より下になる', () => {
    let market = createMarket(sampleRound, timer);
    // 人間は条件違反の07:05発（出発が早い）を、26,000円・40秒で買う。
    // NPCは条件を満たす11:05発を、サイト3の上限（最高値と同じ 67,000円）で、280秒で買う。
    market = buy(market, 'player', 'site1', 'HND-TSA-0705', 40_000);
    market = { ...market, site3Price: { ...market.site3Price, 'HND-TSA-1105': 67_000 } };
    market = buy(market, 'npc-1', 'site3', 'HND-TSA-1105', 280_000);
    const rows = computeRoundResults({
      participants: people,
      market,
      entries: [entryOf('HND-TSA-0705')],
      scenario: sampleRound,
      timeoutPenalty: 0,
      penaltySettings,
    });
    const player = rows.find((r) => r.participant.id === 'player');
    expect(player).toEqual(
      expect.objectContaining({
        status: 'booked',
        purchasePrice: 26_000,
        amount: sampleRound.maxPrice,
        timeMs: 40_000,
        tripViolations: ['departureTime'],
      }),
    );
    // 同じ 67,000円 でも、正しい便のNPC（280秒）が条件違反の人（40秒）より上。予約しなかった人は最後。
    expect(rows.map((r) => [r.participant.id, r.rank])).toEqual([
      ['npc-1', 1],
      ['player', 2],
      ['npc-2', 3],
    ]);
  });

  it('条件に合わない席を買った予約は、正しい便でも条件違反として最高値で集計し、席を記録する', () => {
    const windowRound = {
      ...sampleRound,
      requirements: { ...sampleRound.requirements, seatPositions: ['window' as const] },
    };
    let market = createMarket(windowRound, timer);
    const seats = market.seats['HND-TSA-0910'];
    const aisle = seats.find((s) => seatPosition(s) === 'aisle')!;
    const window = seats.find((s) => seatPosition(s) === 'window')!;
    const buySeat = (participantId: string, seatId: string, atMs: number) => {
      const r = purchase(market, {
        participantId,
        site: 'site1',
        flightId: 'HND-TSA-0910',
        seatId,
        procedureId: participantId,
        now: START + atMs,
      });
      if (!r.ok) throw new Error(r.reason);
      market = r.state;
    };
    buySeat('player', aisle, 40_000);
    buySeat('npc-1', window, 90_000);
    const rows = computeRoundResults({
      participants: people,
      market,
      entries: [entryOf('HND-TSA-0910')],
      scenario: windowRound,
      timeoutPenalty: 0,
      penaltySettings,
    });
    const player = rows.find((r) => r.participant.id === 'player');
    expect(player).toEqual(
      expect.objectContaining({
        amount: windowRound.maxPrice,
        seatId: aisle,
        tripViolations: ['seat'],
      }),
    );
    // 窓側の席を買ったNPCは、遅くても上。
    expect(rows[0].participant.id).toBe('npc-1');
    expect(rows[0].tripViolations).toEqual([]);
  });

  it('予算を超える金額で買った予約は、正しい便でも条件違反として最高値で集計する', () => {
    const budgetRound = {
      ...sampleRound,
      requirements: { ...sampleRound.requirements, maxBudget: 35_000 },
    };
    let market = createMarket(budgetRound, timer);
    // 09:10発を、サイト2（41,000円）で買う人と、サイト1（31,000円）で買う人。
    const held = placeHold(market, {
      participantId: 'player',
      flightId: 'HND-TSA-0910',
      procedureId: 'player',
      now: START,
    });
    if (!held.ok) throw new Error(held.reason);
    market = buy(held.state, 'player', 'site2', 'HND-TSA-0910', 40_000);
    market = buy(market, 'npc-1', 'site1', 'HND-TSA-0910', 90_000);
    const rows = computeRoundResults({
      participants: people,
      market,
      entries: [entryOf('HND-TSA-0910')],
      scenario: budgetRound,
      timeoutPenalty: 0,
      penaltySettings,
    });
    const player = rows.find((r) => r.participant.id === 'player');
    expect(player).toEqual(
      expect.objectContaining({
        purchasePrice: 41_000,
        amount: budgetRound.maxPrice,
        tripViolations: ['budget'],
      }),
    );
    expect(rows[0].participant.id).toBe('npc-1');
  });
  it('入力ミスがいくつ重なっても、正しい便の予約は時間切れの金額より悪くならず、未予約より上', () => {
    let market = createMarket(sampleRound, timer);
    market = buy(market, 'player', 'site1', 'HND-TSA-0910', 40_000);
    const allWrong = entryOf('HND-TSA-0910', {
      surname: 'X',
      givenName: 'X',
      birthDate: 'X',
      nationality: 'X',
      passportNumber: 'X',
      passportExpiry: 'X',
    });
    const entries = [
      {
        ...allWrong,
        payment: { holderName: 'X', cardNumber: 'X', cardExpiry: 'X', securityCode: 'X' },
      },
    ];
    const rows = computeRoundResults({
      participants: people,
      market,
      entries,
      scenario: sampleRound,
      timeoutPenalty: 0,
      penaltySettings,
    });
    const player = rows.find((r) => r.participant.id === 'player');
    // 31,000 ＋ 8,100 × 6 ＋ 4,000 × 4 = 95,600円 → 時間切れの金額 80,500円 で止まる。
    expect(player?.penalty?.total).toBe(64_600);
    expect(player?.amount).toBe(sampleRound.maxPrice);
    expect(rows[0].participant.id).toBe('player');
  });

  it('出発地・目的地・出発日が違う予約は、旅行が成り立たないので時間切れと同じ扱い', () => {
    let market = createMarket(sampleRound, timer);
    market = buy(market, 'player', 'site1', 'NRT-TPE-0950', 20_000);
    const rows = computeRoundResults({
      participants: people,
      market,
      entries: [entryOf('NRT-TPE-0950')],
      scenario: sampleRound,
      timeoutPenalty: 0,
      penaltySettings,
    });
    expect(rows.find((r) => r.participant.id === 'player')).toEqual(
      expect.objectContaining({
        status: 'void',
        purchasePrice: 25_500,
        amount: sampleRound.maxPrice,
        timeMs: 300_000,
        tripViolations: ['origin', 'destination'],
      }),
    );
  });

  it('入力内容の記録がないNPCは入力ミスなしとし、条件違反は買った便から判定する', () => {
    let market = createMarket(sampleRound, timer);
    market = buy(market, 'npc-1', 'site1', 'HND-TSA-1620', 50_000);
    const rows = computeRoundResults({
      participants: people,
      market,
      entries: [],
      scenario: sampleRound,
      timeoutPenalty: 0,
      penaltySettings,
    });
    expect(rows.find((r) => r.participant.id === 'npc-1')).toEqual(
      expect.objectContaining({
        inputMistakes: [],
        tripViolations: ['arrivalTime'],
        amount: sampleRound.maxPrice,
      }),
    );
  });

  it('時間切れの人どうしは同額・同タイムなので、同じ順位になる', () => {
    let market = createMarket(sampleRound, timer);
    market = buy(market, 'npc-1', 'site1', 'HND-TSA-0910', 80_000);
    const rows = computeRoundResults({
      participants: people,
      market,
      entries: [],
      scenario: sampleRound,
      timeoutPenalty: 0,
      penaltySettings,
    });
    expect(rows.map((r) => [r.participant.id, r.rank])).toEqual([
      ['npc-1', 1],
      ['player', 2],
      ['npc-2', 2],
    ]);
  });
});
