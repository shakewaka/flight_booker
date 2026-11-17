import type { BookingEntry } from './booking';
import { judgeBooking, type InputMistake } from './judge';
import type { MarketState } from './market';
import { computePenalty, type PenaltyResult } from './penalty';
import { findTripViolations, type TripViolation } from './requirements';
import type { PenaltySettings } from './settings';
import type { Participant, RoundScenario, SiteId, Yen } from './types';

// ラウンドの集計（企画書「11 ラウンド締切と集計」）。
// 購入額・予約タイム・違反内容・減点を、別々の値として残す。
// 集計金額は、購入額に減点（案C、src/game/penalty.ts）を足した額。ただし時間切れより悪くはしない。
// 順位は、集計金額の小さい順、同額なら予約タイムの短い順、完全に同じなら同順位。

export type RoundResultRow = {
  participant: Participant;
  /**
   * booked：予約した。timeout：時間切れ。
   * void：予約したが、出発地・目的地・出発日が違い旅行が成り立たないため、時間切れと同じ扱い。
   */
  status: 'booked' | 'timeout' | 'void';
  /** 確定した購入額。予約していなければ null。 */
  purchasePrice: Yen | null;
  /** 減点の内訳。予約していなければ null。 */
  penalty: PenaltyResult | null;
  /**
   * 集計金額。予約した人は購入額＋減点（時間切れの金額が上限）、
   * 時間切れの人と旅行が成り立たない人は、ラウンド最高値＋追加ペナルティ。
   */
  amount: Yen;
  /** 集計タイム。予約した人は予約タイム、時間切れの人と旅行が成り立たない人は制限時間。 */
  timeMs: number;
  site: SiteId | null;
  flightId: string | null;
  inputMistakes: InputMistake[];
  tripViolations: TripViolation[];
  /** 順位。1から始まり、完全に同じ金額・タイムなら同じ順位になる。 */
  rank: number;
};

export function computeRoundResults(options: {
  participants: Participant[];
  market: MarketState;
  entries: BookingEntry[];
  scenario: RoundScenario;
  timeoutPenalty: Yen;
  penaltySettings: PenaltySettings;
}): RoundResultRow[] {
  const { participants, market, entries, scenario, timeoutPenalty, penaltySettings } = options;
  // 早めに締め切っても、時間切れの集計タイムはもともとの制限時間にする。
  const limitMs = market.limitMs;
  const timeoutAmount = scenario.maxPrice + timeoutPenalty;

  const rows = participants.map((participant): Omit<RoundResultRow, 'rank'> => {
    const bought = market.purchases.find((p) => p.participantId === participant.id);
    if (!bought) {
      return {
        participant,
        status: 'timeout',
        purchasePrice: null,
        penalty: null,
        amount: timeoutAmount,
        timeMs: limitMs,
        site: null,
        flightId: null,
        inputMistakes: [],
        tripViolations: [],
      };
    }
    const entry = entries.find(
      (candidate) =>
        candidate.participantId === participant.id && candidate.procedureId === bought.procedureId,
    );
    const flight = scenario.flights.find((candidate) => candidate.id === bought.flightId);
    // 入力内容の記録がない参加者は、入力ミスなしとして扱う。条件違反は便から判定する。
    const judgement = entry
      ? judgeBooking(entry, scenario)
      : {
          inputMistakes: [],
          tripViolations: flight ? findTripViolations(flight, scenario.requirements) : [],
        };
    const penalty = computePenalty(judgement, scenario.maxPrice, penaltySettings);
    return {
      participant,
      status: penalty.fatal ? 'void' : 'booked',
      purchasePrice: bought.price,
      penalty,
      amount: penalty.fatal ? timeoutAmount : Math.min(timeoutAmount, bought.price + penalty.total),
      timeMs: penalty.fatal ? limitMs : bought.bookingTimeMs,
      site: bought.site,
      flightId: bought.flightId,
      ...judgement,
    };
  });

  return rankRows(rows);
}

/** 集計金額の小さい順、同額なら集計タイムの短い順。完全に同じなら同順位にする。 */
export function rankRows<T extends { amount: number; timeMs: number }>(
  rows: T[],
): (T & { rank: number })[] {
  // 名前や参加者の番号のような、成績と関係のない値で順位を決めない。並びの順は元の順を保つ。
  const sorted = rows
    .map((row, index) => ({ row, index }))
    .sort(
      (a, b) => a.row.amount - b.row.amount || a.row.timeMs - b.row.timeMs || a.index - b.index,
    );

  return sorted.map(({ row }, position) => {
    let rank = position + 1;
    for (let i = position - 1; i >= 0; i -= 1) {
      const other = sorted[i].row;
      if (other.amount !== row.amount || other.timeMs !== row.timeMs) break;
      rank = i + 1;
    }
    return { ...row, rank };
  });
}
