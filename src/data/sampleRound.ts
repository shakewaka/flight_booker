// 画面の基本配置を確認するための仮データ。企画書「14 ラウンド例」に合わせている。
// 人物・国・番号はすべて架空。型はラウンド進行を実装するときに src/game/ へ整理する。

export type PassportData = {
  surname: string;
  givenName: string;
  /** YYYY-MM-DD */
  birthDate: string;
  nationality: string;
  countryCode: string;
  passportNumber: string;
  /** YYYY-MM-DD */
  expiryDate: string;
};

export type PaymentCardData = {
  holderName: string;
  /** ゲーム専用の番号。実在のカード会社の番号帯を使わない。 */
  number: string;
  /** MM/YY */
  expiry: string;
  securityCode: string;
};

export type TripMemoData = {
  route: string;
  conditions: string[];
};

export type RoundDocuments = {
  passport: PassportData;
  card: PaymentCardData;
  memo: TripMemoData;
};

export const sampleRound: RoundDocuments = {
  passport: {
    surname: 'HOSHINO',
    givenName: 'RINA',
    birthDate: '1998-03-21',
    nationality: 'NOVA REPUBLIC',
    countryCode: 'NVA',
    passportNumber: 'PX0417286',
    expiryDate: '2032-09-30',
  },
  card: {
    holderName: 'RINA HOSHINO',
    number: '9041 7286 0035 1198',
    expiry: '08/31',
    securityCode: '417',
  },
  memo: {
    route: '羽之浦 → 星汐',
    conditions: [
      '5月18日に出発',
      '17:00までに到着',
      '受託手荷物 20kg が必要',
      '運航会社Cの便は不可',
      '到着はターミナル1',
    ],
  },
};
