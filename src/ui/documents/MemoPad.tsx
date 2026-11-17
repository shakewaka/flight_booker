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
      <p className="memo__route">
        <span>{memo.route}</span>
      </p>
      <ul className="memo__list">
        {memo.conditions.map((condition) => (
          <li key={condition}>{condition}</li>
        ))}
      </ul>
      <p className="memo__note">※ 絞れない条件は詳細で確認</p>
    </>
  );
}
