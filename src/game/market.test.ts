import { describe, expect, it } from 'vitest';
import { sampleRound } from '../data/sampleRound';
import {
  availableSeats,
  closeMarket,
  createMarket,
  placeHold,
  purchase,
  purchaseOf,
  releaseHold,
  site1FareRemaining,
  type MarketResult,
  type MarketState,
} from './market';
import { createRoundTimer } from './roundClock';
import type { RoundScenario, SiteId } from './types';

// カウント10秒、制限時間300秒。基準の時刻を0とする。
const timer = createRoundTimer(0, { startCountdownMs: 10_000, roundTimeLimitMs: 300_000 });
const OPEN = 20_000;
const DEADLINE = 310_000;

/** 座席数と販売枠を指定した、1便だけの市場。価格はサイト1・2・3で 10,000・13,000・11,000円。 */
function smallMarket(seats: number, site1Quota: number): MarketState {
  const flight = { ...sampleRound.flights[0], id: 'F', seats };
  const scenario: RoundScenario = {
    ...sampleRound,
    flights: [flight],
    offers: [
      {
        flightId: 'F',
        site1: { price: 10_000, fareQuota: site1Quota },
        site2: { price: 13_000 },
        site3: { minPrice: 11_000, maxPrice: 18_000 },
      },
    ],
  };
  return createMarket(scenario, timer);
}

/** 成功した結果の状態を取り出す。失敗していたらテストを止める。 */
function ok<T>(result: MarketResult<T>): MarketState {
  if (!result.ok) throw new Error(`失敗した：${result.reason}`);
  return result.state;
}

const buy = (
  market: MarketState,
  participantId: string,
  site: SiteId,
  procedureId = `${participantId}-${site}`,
  now = OPEN,
) => purchase(market, { participantId, site, flightId: 'F', procedureId, now });

const hold = (market: MarketState, participantId: string, procedureId: string, now = OPEN) =>
  placeHold(market, { participantId, flightId: 'F', procedureId, now });

describe('共通の座席', () => {
  it('出題データの座席数と販売枠で始まる', () => {
    const market = createMarket(sampleRound, timer);
    expect(availableSeats(market, 'HND-TSA-0910')).toBe(6);
    expect(site1FareRemaining(market, 'HND-TSA-0910')).toBe(2);
  });

  it('残り1席を2人が続けて買うと、成功は先の1人だけ', () => {
    const market = ok(buy(smallMarket(1, 1), 'A', 'site1'));
    const second = buy(market, 'B', 'site3');
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe('sold-out');
    expect(availableSeats(market, 'F')).toBe(0);
  });

  it('どのサイトで買っても、同じ座席数が減る', () => {
    let market = smallMarket(3, 3);
    market = ok(buy(market, 'A', 'site1'));
    market = ok(buy(market, 'B', 'site3'));
    market = ok(hold(market, 'C', 'c-1'));
    expect(availableSeats(market, 'F')).toBe(0);
  });

  it('他人が確保している席は、他のサイトでも買えない', () => {
    const market = ok(hold(smallMarket(1, 1), 'A', 'a-1'));
    const result = buy(market, 'B', 'site1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('sold-out');
  });
});

describe('サイト1の販売枠', () => {
  it('空席があっても、最安料金の枠が尽きたらサイト1では買えない', () => {
    let market = smallMarket(5, 2);
    market = ok(buy(market, 'A', 'site1'));
    market = ok(buy(market, 'B', 'site1'));
    const third = buy(market, 'C', 'site1');
    expect(third.ok).toBe(false);
    if (!third.ok) expect(third.reason).toBe('fare-sold-out');
    expect(availableSeats(market, 'F')).toBe(3);
  });

  it('販売枠が尽きても、同じ便をサイト3では買える', () => {
    const market = ok(buy(smallMarket(5, 1), 'A', 'site1'));
    expect(ok(buy(market, 'B', 'site3')).purchases).toHaveLength(2);
  });

  it('サイト2・3の購入は、サイト1の販売枠を減らさない', () => {
    let market = ok(hold(smallMarket(5, 2), 'A', 'a-1'));
    market = ok(buy(market, 'A', 'site2', 'a-1'));
    market = ok(buy(market, 'B', 'site3'));
    expect(site1FareRemaining(market, 'F')).toBe(2);
  });
});

describe('価格', () => {
  it('価格は市場が決め、サイトごとの価格で買う', () => {
    let market = smallMarket(5, 5);
    market = ok(buy(market, 'A', 'site1'));
    market = ok(buy(market, 'B', 'site3'));
    market = ok(hold(market, 'C', 'c-1'));
    market = ok(buy(market, 'C', 'site2', 'c-1'));
    expect(market.purchases.map((p) => [p.participantId, p.price])).toEqual([
      ['A', 10_000],
      ['B', 11_000],
      ['C', 13_000],
    ]);
  });

  it('サイト2は、確保した時点の価格で買う。確保後に値上げしない', () => {
    let market = ok(hold(smallMarket(5, 5), 'A', 'a-1'));
    market = { ...market, site2Price: { F: 20_000 } };
    const bought = buy(market, 'A', 'site2', 'a-1');
    expect(bought.ok && bought.value.price).toBe(13_000);
  });

  it('サイト3は、確定した瞬間の価格で買う', () => {
    const market = { ...smallMarket(5, 5), site3Price: { F: 16_500 } };
    const bought = buy(market, 'A', 'site3');
    expect(bought.ok && bought.value.price).toBe(16_500);
  });
});

describe('確保', () => {
  it('1人で何枠でも確保できる（上限を置かない）', () => {
    let market = smallMarket(10, 1);
    for (let i = 1; i <= 7; i += 1) market = ok(hold(market, 'A', `a-${i}`));
    expect(market.holds).toHaveLength(7);
    expect(availableSeats(market, 'F')).toBe(3);
  });

  it('同じ手続きの確保をくり返しても、別の確保として数えない', () => {
    const first = hold(smallMarket(5, 5), 'A', 'a-1');
    const again = hold(ok(first), 'A', 'a-1');
    expect(ok(again).holds).toHaveLength(1);
    expect(again.ok && first.ok && again.value.id).toBe(first.ok && first.value.id);
  });

  it('空席がないと確保できない', () => {
    const market = ok(hold(smallMarket(1, 1), 'A', 'a-1'));
    const result = hold(market, 'B', 'b-1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('sold-out');
  });

  it('自分の確保は解除でき、解除した席は他人が買える', () => {
    let market = smallMarket(1, 1);
    const held = hold(market, 'A', 'a-1');
    market = ok(held);
    const holdId = held.ok ? held.value.id : '';
    market = releaseHold(market, 'A', holdId);
    expect(availableSeats(market, 'F')).toBe(1);
    expect(ok(buy(market, 'B', 'site1')).purchases).toHaveLength(1);
  });

  it('他人の確保は解除できない', () => {
    const held = hold(smallMarket(1, 1), 'A', 'a-1');
    const market = ok(held);
    const holdId = held.ok ? held.value.id : '';
    expect(releaseHold(market, 'B', holdId)).toBe(market);
  });

  it('サイト2の確保を、サイト1の安い価格での購入に流用できない', () => {
    // 1席を A がサイト2で確保。A がサイト1で同じ便を買おうとしても、空席がない。
    const market = ok(hold(smallMarket(1, 1), 'A', 'a-1'));
    const result = buy(market, 'A', 'site1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('sold-out');
  });

  it('サイト2の購入には、同じ手続きの確保が必要', () => {
    const market = ok(hold(smallMarket(5, 5), 'A', 'a-1'));
    const result = buy(market, 'A', 'site2', 'a-2');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('no-hold');
  });
});

describe('1人1件の購入と、確保の解放', () => {
  it('購入済みの人は、2件目を買えない（別のタブからの確定も通らない）', () => {
    const market = ok(buy(smallMarket(5, 5), 'A', 'site1', 'tab-1'));
    const second = buy(market, 'A', 'site3', 'tab-2');
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe('already-purchased');
    expect(market.purchases).toHaveLength(1);
  });

  it('購入済みの人は、新しく確保もできない', () => {
    const market = ok(buy(smallMarket(5, 5), 'A', 'site1'));
    const result = hold(market, 'A', 'a-9');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('already-purchased');
  });

  it('購入すると、本人の他の確保だけが解放され、他人の確保は残る', () => {
    let market = smallMarket(10, 10);
    market = ok(hold(market, 'A', 'a-1'));
    market = ok(hold(market, 'A', 'a-2'));
    market = ok(hold(market, 'B', 'b-1'));
    market = ok(buy(market, 'A', 'site1'));
    expect(market.holds.map((h) => h.participantId)).toEqual(['B']);
    // 10席 − Aの購入1 − Bの確保1
    expect(availableSeats(market, 'F')).toBe(8);
  });

  it('サイト2で確保した席を買うと、その席は購入済みになり、二重に数えない', () => {
    let market = smallMarket(3, 3);
    market = ok(hold(market, 'A', 'a-1'));
    market = ok(hold(market, 'A', 'a-2'));
    market = ok(buy(market, 'A', 'site2', 'a-1'));
    expect(market.holds).toEqual([]);
    expect(availableSeats(market, 'F')).toBe(2);
    expect(purchaseOf(market, 'A')?.procedureId).toBe('a-1');
  });
});

describe('締切', () => {
  it('開始前のカウント中は、確保も購入もできない', () => {
    const market = smallMarket(5, 5);
    const bought = buy(market, 'A', 'site1', 'a', 9_999);
    const held = hold(market, 'A', 'a-1', 9_999);
    expect(!bought.ok && bought.reason).toBe('closed');
    expect(!held.ok && held.reason).toBe('closed');
  });

  it('締切の1ミリ秒前は買え、締切の時刻ちょうどからは買えない', () => {
    const market = smallMarket(5, 5);
    expect(buy(market, 'A', 'site1', 'a', DEADLINE - 1).ok).toBe(true);
    const late = buy(market, 'A', 'site1', 'a', DEADLINE);
    expect(!late.ok && late.reason).toBe('closed');
  });

  it('確保していても、締切後はサイト2で買えない', () => {
    const market = ok(hold(smallMarket(5, 5), 'A', 'a-1'));
    const late = buy(market, 'A', 'site2', 'a-1', DEADLINE);
    expect(!late.ok && late.reason).toBe('closed');
  });

  it('予約タイムは、STARTからの経過時間で記録する', () => {
    const bought = buy(smallMarket(5, 5), 'A', 'site1', 'a', 10_000 + 42_195);
    expect(bought.ok && bought.value.bookingTimeMs).toBe(42_195);
  });

  it('ラウンドを閉じると確保はすべて解放され、購入済みの席は残る', () => {
    let market = smallMarket(5, 5);
    market = ok(hold(market, 'A', 'a-1'));
    market = ok(buy(market, 'B', 'site1'));
    market = closeMarket(market);
    expect(market.holds).toEqual([]);
    expect(market.purchases).toHaveLength(1);
    expect(availableSeats(market, 'F')).toBe(4);
  });
});
