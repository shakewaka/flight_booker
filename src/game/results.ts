import type { BookingEntry } from './booking';
import { judgeBooking, type InputMistake } from './judge';
import type { MarketState } from './market';
import { findTripViolations, type TripViolation } from './requirements';
import type { Participant, RoundScenario, SiteId, Yen } from './types';

// ラウンドの基本集計（企画書「11 ラウンド締切と集計」）。
// 購入額・予約タイム・違反内容を、別々の値として残す。
// 順位は、企画書の基本順位（集計金額の小さい順、同額なら予約タイムの短い順、完全に同じなら同順位）で並べる。
// 違反の減点と、減点の順位への反映は未決定のため、ここでは扱わない。

export type RoundResultRow = {
  participant: Participant;
  status: 'booked' | 'timeout';
  /** 集計金額。予約した人は確定した総額、時間切れの人はラウンド最高値＋追加ペナルティ。 */
  amount: Yen;
  /** 集計タイム。予約した人は予約タイム、時間切れの人は制限時間。 */
  timeMs: number;
  site: SiteId | null;
  flightId: string | null;
  inputMistakes: InputMistake[];
  tripViolations: TripViolation[];
  /** 基本順位。1から始まり、完全に同じ金額・タイムなら同じ順位になる。 */
  rank: number;
};

export function computeRoundResults(options: {
  participants: Participant[];
  market: MarketState;
  entries: BookingEntry[];
  scenario: RoundScenario;
  timeoutPenalty: Yen;
}): RoundResultRow[] {
  const { participants, market, entries, scenario, timeoutPenalty } = options;
  const limitMs = market.timer.deadlineAt - market.timer.startAt;

  const rows = participants.map((participant): Omit<RoundResultRow, 'rank'> => {
    const bought = market.purchases.find((p) => p.participantId === participant.id);
    if (!bought) {
      return {
        participant,
        status: 'timeout',
        amount: scenario.maxPrice + timeoutPenalty,
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
    // 入力内容の記録がない参加者（NPC）は、入力ミスなしとして扱う（仮）。条件違反は便から判定する。
    const judgement = entry
      ? judgeBooking(entry, scenario)
      : {
          inputMistakes: [],
          tripViolations: flight ? findTripViolations(flight, scenario.requirements) : [],
        };
    return {
      participant,
      status: 'booked',
      amount: bought.price,
      timeMs: bought.bookingTimeMs,
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
