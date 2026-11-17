import type { KeyboardEvent } from 'react';

/**
 * フォームの中で Enter を押したら、次の入力欄へ移る。最後の入力欄なら、フォームを送信する（次へ進む）。
 * フォームの onKeyDown にそのまま渡して使う。
 * 日本語入力の変換を確定する Enter では動かない。ボタンの上の Enter は、ボタンの動きのままにする。
 */
export function enterToNext(event: KeyboardEvent<HTMLFormElement>) {
  if (event.key !== 'Enter' || event.nativeEvent.isComposing || event.shiftKey) return;
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;

  const form = event.currentTarget;
  // 隠れている入力欄（カレンダーを開くための欄など）は飛ばす。
  const fields = Array.from(
    form.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select'),
  ).filter((field) => !field.disabled && field.type !== 'hidden' && field.tabIndex !== -1);
  const index = fields.indexOf(target);
  if (index === -1) return;

  event.preventDefault();
  const next = fields[index + 1];
  if (next) {
    next.focus();
    if (next instanceof HTMLInputElement) next.select();
  } else {
    form.requestSubmit();
  }
}
