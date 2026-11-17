import { describe, expect, it } from 'vitest';
import { bookingTimeMs, createRoundTimer, getRoundPhase, isBookingOpen } from './roundClock';

// カウント10秒、制限時間180秒。基準の時刻を1,000とする。
const settings = { startCountdownMs: 10_000, roundTimeLimitMs: 180_000 };
const timer = createRoundTimer(1_000, settings);
const startAt = 11_000;
const deadlineAt = 191_000;

describe('getRoundPhase', () => {
  it('カウントは10から始まり、START の1ミリ秒前に1になる', () => {
    expect(getRoundPhase(timer, 1_000)).toEqual({ kind: 'countdown', secondsLeft: 10 });
    expect(getRoundPhase(timer, 1_001)).toEqual({ kind: 'countdown', secondsLeft: 10 });
    expect(getRoundPhase(timer, 2_000)).toEqual({ kind: 'countdown', secondsLeft: 9 });
    expect(getRoundPhase(timer, startAt - 1)).toEqual({ kind: 'countdown', secondsLeft: 1 });
  });

  it('START の時刻ちょうどから、制限時間が満タンの状態で始まる', () => {
    expect(getRoundPhase(timer, startAt)).toEqual({
      kind: 'playing',
      elapsedMs: 0,
      remainingMs: 180_000,
    });
  });

  it('締切の1ミリ秒前まではプレイ中、締切の時刻ちょうどで締め切る', () => {
    expect(getRoundPhase(timer, deadlineAt - 1)).toEqual({
      kind: 'playing',
      elapsedMs: 179_999,
      remainingMs: 1,
    });
    expect(getRoundPhase(timer, deadlineAt)).toEqual({ kind: 'closed' });
  });

  it('カウント開始より前の時刻を渡しても、カウントは設定の秒数を超えない', () => {
    // 画面の時計が、やり直した直後に古い時刻のまま残っている場合。
    expect(getRoundPhase(timer, 0)).toEqual({ kind: 'countdown', secondsLeft: 10 });
  });

  it('やり直しで作ったタイマーは、前のタイマーが締め切っていても影響を受けない', () => {
    const now = deadlineAt + 5_000;
    const retried = createRoundTimer(now, settings);

    expect(getRoundPhase(timer, now)).toEqual({ kind: 'closed' });
    expect(getRoundPhase(retried, now)).toEqual({ kind: 'countdown', secondsLeft: 10 });
  });
});

describe('isBookingOpen', () => {
  it('カウント中は予約できず、START の時刻ちょうどから予約できる', () => {
    expect(isBookingOpen(timer, startAt - 1)).toBe(false);
    expect(isBookingOpen(timer, startAt)).toBe(true);
  });

  it('締切の1ミリ秒前までは予約でき、締切の時刻ちょうどからは予約できない', () => {
    expect(isBookingOpen(timer, deadlineAt - 1)).toBe(true);
    expect(isBookingOpen(timer, deadlineAt)).toBe(false);
  });
});

describe('bookingTimeMs', () => {
  it('開始前のカウントは、予約タイムに含めない', () => {
    expect(bookingTimeMs(timer, 5_000)).toBe(0);
    expect(bookingTimeMs(timer, startAt)).toBe(0);
    expect(bookingTimeMs(timer, startAt + 42_195)).toBe(42_195);
  });

  it('締切を過ぎると、予約タイムは制限時間になる', () => {
    expect(bookingTimeMs(timer, deadlineAt)).toBe(180_000);
    expect(bookingTimeMs(timer, deadlineAt + 60_000)).toBe(180_000);
  });
});
