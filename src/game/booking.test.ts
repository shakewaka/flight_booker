import { describe, expect, it } from 'vitest';
import { EMPTY_PAYMENT, findBlankFields } from './booking';

const filled = {
  holderName: 'RINA HOSHINO',
  cardNumber: '9041 7286 0035 1198',
  cardExpiry: '08/31',
  securityCode: '417',
};

describe('findBlankFields', () => {
  it('すべて入力済みなら、空欄なし', () => {
    expect(findBlankFields(filled)).toEqual([]);
  });

  it('何も入れていない項目と、空白だけの項目を空欄として返す', () => {
    expect(findBlankFields({ ...filled, cardNumber: '', securityCode: '  　' })).toEqual([
      'cardNumber',
      'securityCode',
    ]);
  });

  it('資料と違う値や、形式の崩れた値は止めない（正誤はラウンド終了時に判定する）', () => {
    expect(
      findBlankFields({
        ...filled,
        holderName: 'RINA HOSHIN0',
        cardExpiry: '2031年8月',
        securityCode: 'x',
      }),
    ).toEqual([]);
  });

  it('最初の状態では、すべて空欄', () => {
    expect(findBlankFields(EMPTY_PAYMENT)).toEqual([
      'holderName',
      'cardNumber',
      'cardExpiry',
      'securityCode',
    ]);
  });
});
