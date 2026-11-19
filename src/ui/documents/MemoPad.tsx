import type { CSSProperties } from 'react';
import type { TripMemo } from '../../game/types';
import './memo.css';

type MemoPadProps = {
  memo: TripMemo;
  /** true のあいだは中身を描画せず、「？」だけを見せる。 */
  concealed: boolean;
};

/** メモに収まる行の数（題名を含む）。これより多いと、文字を小さくして全部が見えるようにする。 */
const MEMO_CAPACITY_LINES = 10.5;

/** メモに書く行の数（題名・発着の行・条件・注意書き）。 */
function lineCount(memo: TripMemo): number {
  const header = 4 + (memo.departure.after ? 1 : 0) + (memo.arrivalDeadline ? 2 : 0);
  return 1 + header + memo.conditions.length + 1;
}

/** 右上の条件メモ。机に置いた、罫線入りのメモ帳。条件が多いラウンドでは、文字を少し小さくする。 */
export function MemoPad({ memo, concealed }: MemoPadProps) {
  const scale = Math.min(1, MEMO_CAPACITY_LINES / lineCount(memo));
  return (
    <section className="memo-area" aria-labelledby="memo-title">
      <article className="memo" style={{ '--memo-scale': scale } as CSSProperties}>
        <span className="memo__binding" aria-hidden="true" />
        <h2 className="memo__title" id="memo-title">
          条件メモ
        </h2>
        {concealed ? (
          <p className="memo__concealed" aria-label="開始前のため非表示">
            ？
          </p>
        ) : (
          <MemoBody memo={memo} />
        )}
      </article>
    </section>
  );
}

function MemoBody({ memo }: { memo: TripMemo }) {
  return (
    <>
      {/* 発着地は、地名の行と日時の行を2行ずつ書く。 */}
      <p className="memo__place">
        <span className="memo__marker">{memo.origin}</span>
        <span className="memo__suffix">発</span>
      </p>
      <p className="memo__when">{memo.departure.date}</p>
      {memo.departure.after && (
        <p className="memo__when">
          {memo.departure.after}以降に出発
          <span className="memo__local">（現地時間）</span>
        </p>
      )}
      <p className="memo__place">
        <span className="memo__marker">{memo.destination}</span>
        <span className="memo__suffix">着</span>
      </p>
      {memo.arrivalDeadline && (
        <>
          <p className="memo__when">{memo.arrivalDeadline.date}</p>
          <p className="memo__when">
            {memo.arrivalDeadline.time}までに到着
            <span className="memo__local">（現地時間）</span>
          </p>
        </>
      )}
      <ul className="memo__list">
        {memo.conditions.map((condition) => (
          <li key={condition}>{condition}</li>
        ))}
      </ul>
      <p className="memo__note">※ 絞れない条件は詳細で確認</p>
    </>
  );
}
