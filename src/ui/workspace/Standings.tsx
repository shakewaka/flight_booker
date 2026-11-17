import type { StandingRow } from '../../game/match';
import { formatYen } from '../format';
import './standings.css';

type StandingsProps = {
  rows: StandingRow[];
  playerId: string;
  /** 終了したラウンドの数。 */
  finishedRounds: number;
  roundCount: number;
  onNextRound: () => void;
  onRestartMatch: () => void;
};

function formatTime(ms: number): string {
  return `${(ms / 1000).toFixed(2)}秒`;
}

function RankChange({ row }: { row: StandingRow }) {
  if (row.previousRank === null) return <span className="standings__change">—</span>;
  const diff = row.previousRank - row.rank;
  if (diff > 0) return <span className="standings__change standings__change--up">▲{diff}</span>;
  if (diff < 0) return <span className="standings__change standings__change--down">▼{-diff}</span>;
  return <span className="standings__change">→</span>;
}

/**
 * 現在の総合順位（企画書「12 ラウンド結果と総合結果の表示」）。
 * 4ラウンド目の後は、優勝者と、ラウンドごとの金額を振り返れるようにする。
 */
export function Standings({
  rows,
  playerId,
  finishedRounds,
  roundCount,
  onNextRound,
  onRestartMatch,
}: StandingsProps) {
  const final = finishedRounds >= roundCount;
  const winners = rows.filter((row) => row.rank === 1);

  return (
    <section className="standings" aria-labelledby="standings-title">
      <header>
        <p className="standings__round">
          {finishedRounds} / {roundCount} ラウンド終了
        </p>
        <h2 id="standings-title">{final ? '最終結果' : '現在の総合順位'}</h2>
        {final && (
          <p className="standings__winner">
            優勝：{winners.map((row) => row.participant.name).join('、')}
          </p>
        )}
      </header>

      <div className="standings__table-wrap">
        <table className="standings__table">
          <thead>
            <tr>
              <th scope="col">順位</th>
              <th scope="col">変動</th>
              <th scope="col">名前</th>
              <th scope="col">合計金額</th>
              <th scope="col">合計タイム</th>
              <th scope="col">首位との差</th>
              {final &&
                rows[0]?.roundAmounts.map((_, index) => (
                  <th scope="col" key={index}>
                    R{index + 1}
                  </th>
                ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.participant.id}
                className={row.participant.id === playerId ? 'standings__me' : undefined}
              >
                <td className="standings__rank">{row.rank}</td>
                <td>
                  <RankChange row={row} />
                </td>
                <th scope="row">{row.participant.name}</th>
                <td className="standings__num">{formatYen(row.amount)}</td>
                <td className="standings__num">{formatTime(row.timeMs)}</td>
                <td className="standings__num">
                  {row.gapToLeader === 0 ? '—' : `+${formatYen(row.gapToLeader)}`}
                </td>
                {final &&
                  row.roundAmounts.map((amount, index) => (
                    <td className="standings__num standings__round-amount" key={index}>
                      {formatYen(amount)}
                    </td>
                  ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="standings__note">
        合計金額の安い順、同額なら合計予約タイムの短い順です。入力ミスと条件違反の減点は未決定のため、反映していません（仮）。
      </p>
      <div className="standings__actions">
        <button type="button" className="standings__secondary" onClick={onRestartMatch}>
          試合を最初からやり直す
        </button>
        {!final && (
          <button type="button" className="standings__primary" onClick={onNextRound} autoFocus>
            次のラウンドへ
          </button>
        )}
      </div>
    </section>
  );
}
