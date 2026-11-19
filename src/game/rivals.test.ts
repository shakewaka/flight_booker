import { describe, expect, it } from 'vitest';
import { sampleRound } from '../data/sampleRound';
import { createMarket, placeHold, purchase, type MarketState } from './market';
import { findSnatch, recentPurchases } from './rivals';
import { createRoundTimer } from './roundClock';

// カウント10秒。START は 10,000。
const timer = createRoundTimer(0, { startCountdownMs: 10_000, roundTimeLimitMs: 300_000 });
const START = 10_000;

const FLIGHT = 'HND-TSA-0910';

function buyAt(
  market: MarketState,
  participantId: string,
  now: number,
  options: { site?: 'site1' | 'site3'; seatId?: string } = {},
): MarketState {
  const result = purchase(market, {
    participantId,
    site: options.site ?? 'site3',
    flightId: FLIGHT,
    seatId: options.seatId,
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

function holdAt(market: MarketState, participantId: string, now: number, seatId?: string) {
  const result = placeHold(market, {
    participantId,
    flightId: FLIGHT,
    seatId,
    procedureId: participantId,
    now,
  });
  if (!result.ok) throw new Error(result.reason);
  return result.state;
}

describe('findSnatch', () => {
  const fresh = createMarket(sampleRound, timer);
  // 6席の便。最初の2席を使う。
  const [seatA, seatB] = fresh.seats[FLIGHT];
  const snatch = (
    market: MarketState,
    refusal: Parameters<typeof findSnatch>[1]['refusal'],
    seatId?: string,
  ) =>
    findSnatch(market, {
      refusal,
      participantId: 'me',
      flightId: FLIGHT,
      seatId,
      now: START + 30_000,
    });

  it('選んだ席を確保した人と、何秒前かを返す', () => {
    const market = holdAt(fresh, 'A', START + 29_200, seatA);
    expect(snatch(market, 'seat-taken', seatA)).toEqual({
      participantId: 'A',
      action: 'hold',
      agoMs: 800,
    });
  });

  it('選んだ席でない席を取った人は、席を取った人として返さない', () => {
    const market = buyAt(fresh, 'A', START + 29_000, { seatId: seatB });
    expect(snatch(market, 'seat-taken', seatA)).toBeNull();
  });

  it('最安料金の売り切れは、最後にサイト1で買った人。サイト3の購入は数えない', () => {
    let market = buyAt(fresh, 'A', START + 10_000, { site: 'site1' });
    market = buyAt(market, 'B', START + 20_000, { site: 'site1' });
    market = buyAt(market, 'C', START + 25_000, { site: 'site3' });
    expect(snatch(market, 'fare-sold-out')).toMatchObject({ participantId: 'B', agoMs: 10_000 });
  });

  it('満席は、その便の席を最後に購入・確保した人', () => {
    let market = buyAt(fresh, 'A', START + 10_000);
    market = holdAt(market, 'B', START + 12_000);
    expect(snatch(market, 'sold-out')).toMatchObject({ participantId: 'B', action: 'hold' });
  });

  it('自分の購入・確保は数えない', () => {
    const market = holdAt(fresh, 'me', START + 10_000, seatA);
    expect(snatch(market, 'seat-taken', seatA)).toBeNull();
    expect(snatch(market, 'sold-out')).toBeNull();
  });

  it('締切などの理由では、取った人を探さない', () => {
    const market = buyAt(fresh, 'A', START + 10_000);
    expect(snatch(market, 'closed')).toBeNull();
  });
});
