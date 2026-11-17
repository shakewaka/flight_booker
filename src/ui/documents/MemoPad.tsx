import type { TripMemo } from '../../game/types';
import './memo.css';

type MemoPadProps = {
  memo: TripMemo;
  /** true のあいだは中身を描画せず、「？」だけを見せる。 */
  concealed: boolean;
};

/** 右上の条件メモ。机に置いた、罫線入りのメモ帳。 */
export function MemoPad({ memo, concealed }: MemoPadProps) {
  return (
    <section className="memo-area" aria-labelledby="memo-title">
      <article className="memo">
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
