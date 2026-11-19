import { describe, expect, it } from 'vitest';
import { sampleRound } from '../data/sampleRound';
import { createMarket, purchase, type MarketState } from './market';
import { recentPurchases } from './rivals';
import { createRoundTimer } from './roundClock';

// カウント10秒。START は 10,000。
const timer = createRoundTimer(0, { startCountdownMs: 10_000, roundTimeLimitMs: 300_000 });
const START = 10_000;

function buyAt(market: MarketState, participantId: string, now: number): MarketState {
  const result = purchase(market, {
    participantId,
    site: 'site3',
    flightId: 'HND-TSA-0910',
    procedureId: participantId,
    now,
  });
  if (!result.ok) throw new Error(result.reason);
  return result.state;
}

describe('recentPurchases', () => {
  // A は START から 20秒、B は 25秒、自分は 26秒に予約する。
  let market = createMarket(sampleRound, timer);
  market = buyAt(market, 'A', START + 20_000);
  market = buyAt(market, 'B', START + 25_000);
  market = buyAt(market, 'me', START + 26_000);
  const recent = (now: number) =>
    recentPurchases(market, { now, windowMs: 6_000, excludeParticipantId: 'me' }).map(
      (p) => p.participantId,
    );

  it('自分の予約は含めず、新しい順に並べる', () => {
    expect(recent(START + 26_000 - 1)).toEqual(['B', 'A']);
  });

  it('ちょうど windowMs たった予約は含めない', () => {
    // A の予約から 6秒ちょうど。
    expect(recent(START + 26_000)).toEqual(['B']);
    expect(recent(START + 31_000)).toEqual([]);
  });
});
