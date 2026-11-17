import type { SiteId } from './types';

// 予約手続きで入力する情報。入力の正誤は、その場では判定しない（企画書「9 人物情報と決済情報」）。
// 入力ミスと条件違反は、ラウンド終了時にこの記録とパスポート・カード・条件メモを照らし合わせて判定する。

export type PassengerInput = {
  surname: string;
  givenName: string;
  birthDate: string;
  nationality: string;
  passportNumber: string;
  passportExpiry: string;
};

export type PaymentInput = {
  holderName: string;
  cardNumber: string;
  cardExpiry: string;
  securityCode: string;
};

/** 購入した予約の、入力内容の記録。市場の購入記録とは、参加者と手続きで結びつける。 */
export type BookingEntry = {
  participantId: string;
  procedureId: string;
  site: SiteId;
  flightId: string;
  passenger: PassengerInput;
  payment: PaymentInput;
};

export const EMPTY_PASSENGER: PassengerInput = {
  surname: '',
  givenName: '',
  birthDate: '',
  nationality: '',
  passportNumber: '',
  passportExpiry: '',
};

export const EMPTY_PAYMENT: PaymentInput = {
  holderName: '',
  cardNumber: '',
  cardExpiry: '',
  securityCode: '',
};

/**
 * 空欄の項目を返す。空白だけの入力も空欄として扱う。
 * 仮：形式や正誤は調べず、空欄だけを止める（docs/decisions.md「試作用の仮案」）。
 * 未入力を通すかどうかは、減点の設計と一緒に正式に決める。
 */
export function findBlankFields<T extends Record<string, string>>(input: T): (keyof T)[] {
  return (Object.keys(input) as (keyof T)[]).filter((key) => input[key].trim() === '');
}
