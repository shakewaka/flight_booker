import { describe, expect, it } from 'vitest';
import { sampleRound } from '../data/sampleRound';
import type { BookingEntry } from './booking';
import { findInputMistakes, judgeBooking } from './judge';

const correct: BookingEntry = {
  participantId: 'player',
  procedureId: 'tab-2',
  site: 'site1',
  flightId: 'HND-TSA-0910',
  passenger: {
    surname: 'HOSHINO',
    givenName: 'RINA',
    birthDate: '1998/03/21',
    nationality: 'NOVA REPUBLIC',
    passportNumber: 'PX0417286',
    passportExpiry: '2032/09/30',
  },
  payment: {
    holderName: 'RINA HOSHINO',
    cardNumber: '9041 7286 0035 1198',
    cardExpiry: '08/31',
    securityCode: '417',
  },
};

const withPassenger = (change: Partial<BookingEntry['passenger']>): BookingEntry => ({
  ...correct,
  passenger: { ...correct.passenger, ...change },
});
const withPayment = (change: Partial<BookingEntry['payment']>): BookingEntry => ({
  ...correct,
  payment: { ...correct.payment, ...change },
});

describe('findInputMistakes', () => {
  it('パスポート・カードどおりに入力していれば、入力ミスなし', () => {
    expect(findInputMistakes(correct, sampleRound)).toEqual([]);
  });

  it('大文字・小文字、全角・半角、前後や連続する空白の違いは誤りにしない', () => {
    const entry = {
      ...withPassenger({ surname: ' hoshino ', givenName: 'ＲＩＮＡ' }),
      payment: { ...correct.payment, holderName: 'Rina   Hoshino' },
    };
    expect(findInputMistakes(entry, sampleRound)).toEqual([]);
  });

  it('日付と番号は、区切りや空白の違いを誤りにしない', () => {
    const entry = {
      ...withPassenger({ birthDate: '1998-03-21', passportExpiry: '20320930' }),
      payment: { ...correct.payment, cardNumber: '9041728600351198', cardExpiry: '08-31' },
    };
    expect(findInputMistakes(entry, sampleRound)).toEqual([]);
  });

  it('国籍は、国名の代わりにパスポートの国コードでもよい', () => {
    expect(findInputMistakes(withPassenger({ nationality: 'NVA' }), sampleRound)).toEqual([]);
  });

  it('1文字でも違えば入力ミスとし、入力した値と正しい値を記録する', () => {
    expect(findInputMistakes(withPassenger({ passportNumber: 'PX0417268' }), sampleRound)).toEqual([
      { field: 'passportNumber', entered: 'PX0417268', expected: 'PX0417286' },
    ]);
  });

  it('数字の0と英字のOのように、見た目が似ていても違う文字は誤りにする', () => {
    expect(findInputMistakes(withPassenger({ surname: 'H0SHINO' }), sampleRound)).toHaveLength(1);
  });

  it('姓と名を入れ替えると、両方の入力ミスになる', () => {
    const swapped = withPassenger({ surname: 'RINA', givenName: 'HOSHINO' });
    expect(findInputMistakes(swapped, sampleRound).map((m) => m.field)).toEqual([
      'surname',
      'givenName',
    ]);
  });

  it('カードの誤りも、パスポートの誤りと同じように見つけ、入力順に並べる', () => {
    const entry = {
      ...withPayment({ securityCode: '471', cardExpiry: '31/08' }),
      passenger: { ...correct.passenger, birthDate: '1998/12/03' },
    };
    expect(findInputMistakes(entry, sampleRound).map((m) => m.field)).toEqual([
      'birthDate',
      'cardExpiry',
      'securityCode',
    ]);
  });
});

describe('judgeBooking', () => {
  it('条件を満たす便を正しく入力して予約すれば、入力ミスも条件違反もない', () => {
    expect(judgeBooking(correct, sampleRound)).toEqual({ inputMistakes: [], tripViolations: [] });
  });

  it('入力ミスと条件違反は、別々に記録する', () => {
    const entry = {
      ...withPayment({ cardNumber: '9041 7286 0035 1189' }),
      flightId: 'HND-TSA-0705',
    };
    expect(judgeBooking(entry, sampleRound)).toEqual({
      inputMistakes: [
        { field: 'cardNumber', entered: '9041 7286 0035 1189', expected: '9041 7286 0035 1198' },
      ],
      tripViolations: ['departureTime'],
    });
  });

  it('空港を取り違えた便は、出発地と目的地の違反になる', () => {
    expect(
      judgeBooking({ ...correct, flightId: 'NRT-TPE-0950' }, sampleRound).tripViolations,
    ).toEqual(['origin', 'destination']);
  });
});
