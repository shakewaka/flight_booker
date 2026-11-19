import type { ClipboardEvent, DragEvent } from 'react';

/**
 * コピー・切り取り・貼り付けと、文字のドラッグ＆ドロップを止める。
 * パスポートとカードを見ながら打つ手間が、このゲームの競争の中心なので、資料や入力欄から写せないようにする。
 * 要素にそのまま渡して使う（例：`<section {...blockClipboard}>`）。中の要素すべてに効く。
 * ただし、ゲーム内ブラウザのアドレスバーだけは、検索条件入りのURLを別のタブへ写せるように止めない。
 */
const prevent = (event: ClipboardEvent | DragEvent) => {
  const target = event.target;
  if (target instanceof Element && target.closest('.browser__url-input')) return;
  event.preventDefault();
};

export const blockClipboard = {
  onCopy: prevent,
  onCut: prevent,
  onPaste: prevent,
  onDragStart: prevent,
  onDrop: prevent,
};
