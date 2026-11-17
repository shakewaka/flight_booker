import type { GameSettings } from './settings';

// 1ラウンドの時間管理。ReactやDOMに依存せず、現在時刻は引数で受け取る。
// 時刻の単位はミリ秒。基準（performance.now() など）は呼び出し側が決める。

export type RoundTimer = {
  /** 開始前のカウントを始めた時刻。 */
  countdownStartedAt: number;
  /** START の時刻。操作と制限時間がここから始まる。 */
  startAt: number;
  /** 締切の時刻。この時刻ちょうどから、予約を確定できない。 */
  deadlineAt: number;
};

export type RoundPhase =
  | { kind: 'countdown'; secondsLeft: number }
  | { kind: 'playing'; elapsedMs: number; remainingMs: number }
  | { kind: 'closed' };

type TimerSettings = Pick<GameSettings, 'startCountdownMs' | 'roundTimeLimitMs'>;

export function createRoundTimer(countdownStartedAt: number, settings: TimerSettings): RoundTimer {
  const startAt = countdownStartedAt + settings.startCountdownMs;
  return {
    countdownStartedAt,
    startAt,
    deadlineAt: startAt + settings.roundTimeLimitMs,
  };
}

/** 現在の段階。カウント中は残り秒数を、10、9、…、1 の順に返す。 */
export function getRoundPhase(timer: RoundTimer, now: number): RoundPhase {
  if (now < timer.startAt) {
    const maxSeconds = Math.ceil((timer.startAt - timer.countdownStartedAt) / 1000);
    const secondsLeft = Math.min(maxSeconds, Math.ceil((timer.startAt - now) / 1000));
    return { kind: 'countdown', secondsLeft };
  }
  if (now < timer.deadlineAt) {
    return {
      kind: 'playing',
      elapsedMs: now - timer.startAt,
      remainingMs: timer.deadlineAt - now,
    };
  }
  return { kind: 'closed' };
}

/** 予約を確定できる時間内か。START の時刻を含み、締切の時刻を含まない。 */
export function isBookingOpen(timer: RoundTimer, now: number): boolean {
  return now >= timer.startAt && now < timer.deadlineAt;
}

/**
 * 予約タイム。START からの経過時間で、開始前のカウントは含めない。
 * 締切を過ぎた場合は制限時間になる（時間切れ・未予約の集計タイム）。
 */
export function bookingTimeMs(timer: RoundTimer, now: number): number {
  const limit = timer.deadlineAt - timer.startAt;
  return Math.min(limit, Math.max(0, now - timer.startAt));
}
