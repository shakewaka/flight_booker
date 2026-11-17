// ゲームで扱うデータの型。ReactやDOMに依存しない。
// 人物・空港・航空会社・番号は、すべて架空のデータを入れる。

/** 円。小数は使わない。 */
export type Yen = number;
/** YYYY-MM-DD */
export type IsoDate = string;
/** HH:mm（24時間表記） */
export type ClockTime = string;

export type Airport = {
  code: string;
  city: string;
};

export type Airline = {
  id: string;
  name: string;
};

export type PassportData = {
  surname: string;
  givenName: string;
  birthDate: IsoDate;
  nationality: string;
  countryCode: string;
  passportNumber: string;
  expiryDate: IsoDate;
};

export type PaymentCardData = {
  holderName: string;
  /** ゲーム専用の番号。実在のカード会社の番号帯を使わない。 */
  number: string;
  /** MM/YY */
  expiry: string;
  securityCode: string;
};

/**
 * 条件メモの内容。ラウンド終了時の条件違反の判定にも使う。
 * 省略した項目は、そのラウンドでは条件にしない。
 */
export type TripRequirements = {
  originCode: string;
  destinationCode: string;
  departureDate: IsoDate;
  /** この時刻ちょうどの到着は条件を満たす。 */
  arriveBy?: ClockTime;
  /** 必要な受託手荷物の重さ。0は手荷物の条件なし。 */
  checkedBaggageKg: number;
  /** 実際に運航する会社として使えない航空会社。 */
  excludedOperatingAirlineIds: string[];
  arrivalTerminal?: number;
};

/** 条件メモに表示する文章。 */
export type TripMemo = {
  route: string;
  conditions: string[];
};

/**
 * 比較サイトに出る候補の便。初期データは、出発日と同じ日に到着する便だけを扱う。
 */
export type Flight = {
  id: string;
  /** 販売する航空会社。便名に表示される会社。 */
  sellingAirlineId: string;
  /** 実際に運航する航空会社。販売する会社と違う場合がある。 */
  operatingAirlineId: string;
  originCode: string;
  destinationCode: string;
  departureDate: IsoDate;
  departureTime: ClockTime;
  arrivalTime: ClockTime;
  arrivalTerminal: number;
  /** 乗継の回数。0は直行便。 */
  stops: number;
  /** 料金に含まれる受託手荷物の重さ。 */
  checkedBaggageKg: number;
  /** 物理的な座席数。全予約サイトで共有する。 */
  seats: number;
};

export type SiteId = 'site1' | 'site2' | 'site3';

/**
 * 1つの便に対する、予約サイトごとの販売条件。
 * 価格は、必要な手荷物と必須の手数料を含む総額。
 */
export type FlightOffers = {
  flightId: string;
  /** 最安型。確定まで席を確保しない。 */
  site1: {
    price: Yen;
    /** この料金で販売できる上限数。物理的な座席数とは別に数える。 */
    fareQuota: number;
  };
  /** 確保型。手続きの途中で、席とその時点の総額を確保する。 */
  site2: {
    price: Yen;
  };
  /** 変動型。閲覧人数で価格が動く。範囲だけを決め、計算式は市場処理で決める。 */
  site3: {
    minPrice: Yen;
    maxPrice: Yen;
  };
};

/** 1ラウンド分の出題。全参加者に同じ内容を配る。 */
export type RoundScenario = {
  id: string;
  passport: PassportData;
  card: PaymentCardData;
  requirements: TripRequirements;
  /** 出発地から目的地までの、おおよその距離。価格帯を決めるのに使う。 */
  distanceKm: number;
  airports: Airport[];
  airlines: Airline[];
  flights: Flight[];
  offers: FlightOffers[];
  /** ラウンド最高値。締切までに予約できなかった人が購入した扱いになる金額。 */
  maxPrice: Yen;
};

export type Participant = {
  id: string;
  name: string;
  kind: 'human' | 'npc';
};
