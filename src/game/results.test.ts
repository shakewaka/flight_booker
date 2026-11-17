import { describe, expect, it } from 'vitest';
import { sampleRound } from '../data/sampleRound';
import type { BookingEntry } from './booking';
import { createMarket, purchase, type MarketState } from './market';
import { computeRoundResults, rankRows } from './results';
import { createRoundTimer } from './roundClock';
import type { Participant, SiteId } from './types';

const penaltySettings = { violationRate: 0.2, identityMistakeRate: 0.1, paymentMistakeRate: 0.05 };

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

  it('購入額に減点を足して集計し、購入額・減点・違反の内容は別々に残す', () => {
    let market = createMarket(sampleRound, timer);
    // 人間は条件違反の07:05発（出発が早い）を、パスポート番号の入力ミスありで安く早く買う。
    market = buy(market, 'player', 'site1', 'HND-TSA-0705', 40_000);
    market = buy(market, 'npc-1', 'site1', 'HND-TSA-0910', 90_000);
    const entries = [entryOf('HND-TSA-0705', { passportNumber: 'PX0417268' })];
    const rows = computeRoundResults({
      participants: people,
      market,
      entries,
      scenario: sampleRound,
      timeoutPenalty: 0,
      penaltySettings,
    });
    const player = rows.find((r) => r.participant.id === 'player');

    // 最高値 67,000円 の 20%（条件違反）＋ 10%（本人確認の入力ミス） = 13,400 ＋ 6,700 円
    expect(player).toEqual(
      expect.objectContaining({
        status: 'booked',
        purchasePrice: 26_000,
        amount: 26_000 + 13_400 + 6_700,
        timeMs: 40_000,
        tripViolations: ['departureTime'],
        inputMistakes: [{ field: 'passportNumber', entered: 'PX0417268', expected: 'PX0417286' }],
      }),
    );
    expect(player?.penalty?.total).toBe(20_100);
    // 減点で 46,100円 になり、条件どおりに 31,000円 で買ったNPCより下になる。
    expect(rows.map((r) => r.participant.id)).toEqual(['npc-1', 'player', 'npc-2']);
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
    // 67,000円 の 5% = 3,350円 → 100円単位で 3,400円（丸めは四捨五入）
    expect(rows[0].amount).toBe(31_000 + 3_400);
  });

  it('減点がいくつ重なっても、時間切れの金額より悪くはならない', () => {
    let market = createMarket(sampleRound, timer);
    market = buy(market, 'player', 'site1', 'HND-TSA-0705', 40_000);
    const entries = [
      entryOf('HND-TSA-0705', {
        surname: 'X',
        givenName: 'X',
        birthDate: 'X',
        nationality: 'X',
        passportNumber: 'X',
        passportExpiry: 'X',
      }),
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
    expect(player?.penalty?.total).toBeGreaterThan(sampleRound.maxPrice - 26_000);
    expect(player?.amount).toBe(sampleRound.maxPrice);
    // 時間は実際の予約タイムのまま。時間切れの人（300秒）より上の順位になる。
    expect(player?.timeMs).toBe(40_000);
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

  it('入力内容の記録がないNPCは入力ミスなしとし、条件違反は買った便から判定して減点する', () => {
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
        amount: 27_000 + 13_400,
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
