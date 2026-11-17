import { describe, expect, it } from 'vitest';
import { formatInput, type InputFormat } from './inputFormat';

/** 1文字ずつ打ったときの、各時点の表示を返す。 */
function typeEach(format: InputFormat, keys: string): string[] {
  const shown: string[] = [];
  let value = '';
  for (const key of keys) {
    value = formatInput(format, value + key, value);
    shown.push(value);
  }
  return shown;
}

/** 末尾から1文字ずつ消したときの、各時点の表示を返す。 */
function deleteEach(format: InputFormat, start: string, times: number): string[] {
  const shown: string[] = [];
  let value = start;
  for (let i = 0; i < times; i += 1) {
    value = formatInput(format, value.slice(0, -1), value);
    shown.push(value);
  }
  return shown;
}

describe('ローマ字の欄（upper）', () => {
  it('小文字で打っても大文字で表示する', () => {
    expect(formatInput('upper', 'hoshino', '')).toBe('HOSHINO');
    expect(formatInput('upper', 'Rina Hoshino', '')).toBe('RINA HOSHINO');
  });

  it('全角の英字は半角の大文字にする', () => {
    expect(formatInput('upper', 'ｒｉｎａ', '')).toBe('RINA');
  });

  it('つづりは変えない（資料と違う値を直さない）', () => {
    expect(formatInput('upper', 'hoshin0', '')).toBe('HOSHIN0');
  });
});

describe('有効期限（expiry、MM/YY）', () => {
  it('月の2桁を打った時点で「/」が入り、続けて年の2桁を打つだけでよい', () => {
    expect(typeEach('expiry', '0831')).toEqual(['0', '08/', '08/3', '08/31']);
  });

  it('4桁より多くは入らない', () => {
    expect(typeEach('expiry', '083199').at(-1)).toBe('08/31');
  });

  it('「/」を自分で打っても、二重にならない', () => {
    expect(typeEach('expiry', '08/31').at(-1)).toBe('08/31');
  });

  it('消していくと、「/」は自動で入り直さず、そのまま月まで消せる', () => {
    expect(deleteEach('expiry', '08/31', 4)).toEqual(['08/3', '08', '0', '']);
  });
});

describe('日付（date、YYYY/MM/DD）', () => {
  it('年の4桁、月の2桁を打った時点で「/」が入る', () => {
    expect(typeEach('date', '19980321')).toEqual([
      '1',
      '19',
      '199',
      '1998/',
      '1998/0',
      '1998/03/',
      '1998/03/2',
      '1998/03/21',
    ]);
  });

  it('区切りを「-」で打っても、「/」にそろえる', () => {
    expect(formatInput('date', '1998-03-21', '')).toBe('1998/03/21');
  });

  it('消していくと、末尾に「/」を残さない', () => {
    expect(deleteEach('date', '1998/03/', 2)).toEqual(['1998/03', '1998/0']);
  });
});

describe('カード番号（card）', () => {
  it('4桁ごとに間を空けて表示する。区切りの空白を打つ必要はない', () => {
    expect(typeEach('card', '90417').slice(3)).toEqual(['9041', '9041 7']);
    expect(formatInput('card', '9041728600351198', '')).toBe('9041 7286 0035 1198');
  });

  it('16桁より多くは入らず、数字以外は入らない', () => {
    expect(formatInput('card', '9041-7286-0035-1198-77', '')).toBe('9041 7286 0035 1198');
  });

  it('消していくと、間の空白も一緒になくなる', () => {
    expect(deleteEach('card', '9041 7', 2)).toEqual(['9041', '904']);
  });
});

describe('確認コード（digits）', () => {
  it('数字だけを4桁まで受け付ける', () => {
    expect(formatInput('digits', '41a7', '')).toBe('417');
    expect(formatInput('digits', '123456', '')).toBe('1234');
  });
});
