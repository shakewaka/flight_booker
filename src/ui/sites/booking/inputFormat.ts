// 予約フォームの入力を、打ちやすく整える。実際の予約サイトによくある入力補助と同じ考え方。
// - ローマ字の欄は、小文字で打っても大文字で表示する。
// - 日付と有効期限は、数字を打つだけで「/」を入れる。
// - カード番号は、4桁ごとに間を空けて表示する。
// 表記を整えるだけで、資料と違う値を正しい値に直すことはしない（入力の正誤はラウンド終了時に判定する）。

export type InputFormat = 'upper' | 'date' | 'expiry' | 'card' | 'digits';

const digitsOf = (value: string) => value.normalize('NFKC').replace(/\D/g, '');

/**
 * 区切り文字を入れて数字を並べる。sizes は区切りごとの桁数。
 * 打ち進めているときは、区切りの手前の桁数がそろった時点で区切り文字を入れる（08 → 08/）。
 * 消しているときは、末尾に区切り文字を残さない（08/ を1文字消すと 08 になる）。
 */
function joinParts(digits: string, sizes: number[], separator: string, deleting: boolean): string {
  let result = '';
  let rest = digits;
  sizes.forEach((size, index) => {
    const part = rest.slice(0, size);
    rest = rest.slice(size);
    result += part;
    const isLast = index === sizes.length - 1;
    const filled = part.length === size;
    if (!isLast && filled && (rest.length > 0 || !deleting)) result += separator;
  });
  return result;
}

/**
 * 入力欄の新しい値を整える。previous は整える前の直前の値で、消しているかどうかの判断に使う。
 */
export function formatInput(format: InputFormat, raw: string, previous: string): string {
  const deleting = raw.length < previous.length;
  switch (format) {
    case 'upper':
      // 全角の英字は半角にし、小文字は大文字にする。
      return raw.normalize('NFKC').toUpperCase();
    case 'date':
      // YYYY/MM/DD
      return joinParts(digitsOf(raw).slice(0, 8), [4, 2, 2], '/', deleting);
    case 'expiry':
      // MM/YY
      return joinParts(digitsOf(raw).slice(0, 4), [2, 2], '/', deleting);
    case 'card': {
      // 4桁ごとに間を空ける。最後の4桁の後ろには空けない。
      const digits = digitsOf(raw).slice(0, 16);
      return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
    }
    case 'digits':
      return digitsOf(raw).slice(0, 4);
  }
}
