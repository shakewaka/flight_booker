import { rankRows, type RoundResultRow } from './results';
import type { Participant, Yen } from './types';

// 試合全体の総合順位（企画書「11 ラウンド締切と集計」「12 ラウンド結果と総合結果の表示」）。
// 終了したラウンドまでの合計金額の小さい順、同額なら合計予約タイムの短い順。完全に同じなら同順位。
// 勝敗を決めるのは合計金額で、ラウンドの順位点を合算する方式は使わない。
// 減点の反映方法は未決定のため、ここでは扱わない。

export type StandingRow = {
  participant: Participant;
  /** 終了したラウンドまでの合計金額。 */
  amount: Yen;
  /** 終了したラウンドまでの合計予約タイム。 */
  timeMs: number;
  rank: number;
  /** 前のラウンドまでの総合順位。1ラウンド目の後は null。 */
  previousRank: number | null;
  /** 首位との合計金額の差。首位は0。 */
  gapToLeader: Yen;
  /** ラウンドごとの集計金額。 */
  roundAmounts: Yen[];
};

function totals(participants: Participant[], rounds: RoundResultRow[][]) {
  return participants.map((participant) => {
    const mine = rounds.map((rows) => rows.find((row) => row.participant.id === participant.id));
    return {
      participant,
      amount: mine.reduce((sum, row) => sum + (row?.amount ?? 0), 0),
      timeMs: mine.reduce((sum, row) => sum + (row?.timeMs ?? 0), 0),
      roundAmounts: mine.map((row) => row?.amount ?? 0),
    };
  });
}

/** 終了したラウンドの結果から、総合順位を求める。 */
export function computeStandings(
  participants: Participant[],
  rounds: RoundResultRow[][],
): StandingRow[] {
  const current = rankRows(totals(participants, rounds));
  const previous = rounds.length > 1 ? rankRows(totals(participants, rounds.slice(0, -1))) : null;
  const leaderAmount = current[0]?.amount ?? 0;

  return current.map((row) => ({
    ...row,
    previousRank:
      previous?.find((candidate) => candidate.participant.id === row.participant.id)?.rank ?? null,
    gapToLeader: row.amount - leaderAmount,
  }));
}
