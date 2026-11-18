import type { RoundScenario } from '../game/types';
import { buildRound, flight } from './buildRound';
import { sampleRound } from './sampleRound';

// 1試合4ラウンドの出題データ。企画書「13 4ラウンドの構成例」に沿って、ラウンドごとに人物・路線・条件を変える。
// 人物・国・航空会社・番号・便は架空。空港と都市は実在の名前を使う。
// 便の時刻・座席数・販売枠・倍率は試作用の仮の値で、実在の便や運賃ではない。

/**
 * ラウンド2：東京（羽田）→ソウル（金浦）。
 * 一番安く見える便ほど、出発時刻・運航会社・手荷物・到着期限のどれかが合わない。
 */
const round2 = buildRound({
  id: 'round-2',
  passport: {
    surname: 'MORISAKI',
    givenName: 'KAITO',
    birthDate: '1994-11-07',
    nationality: 'NOVA REPUBLIC',
    countryCode: 'NVA',
    passportNumber: 'NK5308821',
    expiryDate: '2031-04-14',
  },
  card: {
    holderName: 'KAITO MORISAKI',
    number: '9052 3381 4470 2265',
    expiry: '11/30',
    securityCode: '582',
  },
  requirements: {
    originCode: 'HND',
    destinationCode: 'GMP',
    departureDate: '2027-06-02',
    departAfter: '08:00',
    arriveBy: '13:00',
    checkedBaggageKg: 23,
    excludedOperatingAirlineIds: ['B'],
    arrivalTerminal: 2,
    seatPositions: ['window', 'aisle'],
  },
  flights: [
    // 安いが、08:00より前に出発する。
    flight(
      'HND-GMP-0730',
      { from: 'HND', to: 'GMP', date: '2027-06-02' },
      { dep: '07:30', arr: '09:55' },
      { seller: 'A', terminal: 2, baggageKg: 23, seats: 8 },
    ),
    // 条件を満たす。座席が少ない（窓側か通路側の席は6席）。
    flight(
      'HND-GMP-0840',
      { from: 'HND', to: 'GMP', date: '2027-06-02' },
      { dep: '08:40', arr: '11:05' },
      { seller: 'C', terminal: 2, baggageKg: 23, seats: 9 },
    ),
    // 販売は航空会社Dだが、運航は不可の航空会社B。
    flight(
      'HND-GMP-0915',
      { from: 'HND', to: 'GMP', date: '2027-06-02' },
      { dep: '09:15', arr: '11:40' },
      { seller: 'D', operator: 'B', terminal: 2, baggageKg: 23, seats: 8 },
    ),
    // 条件を満たす。高いが、座席が多い（窓側か通路側の席は8席）。
    flight(
      'HND-GMP-1005',
      { from: 'HND', to: 'GMP', date: '2027-06-02' },
      { dep: '10:05', arr: '12:30' },
      { seller: 'D', terminal: 2, baggageKg: 23, seats: 12 },
    ),
    // 料金に含まれる手荷物が20kgで足りない。
    flight(
      'HND-GMP-1020',
      { from: 'HND', to: 'GMP', date: '2027-06-02' },
      { dep: '10:20', arr: '12:45' },
      { seller: 'A', terminal: 2, baggageKg: 20, seats: 8 },
    ),
    // 13:00より後に着く。
    flight(
      'HND-GMP-1135',
      { from: 'HND', to: 'GMP', date: '2027-06-02' },
      { dep: '11:35', arr: '14:00' },
      { seller: 'D', terminal: 2, baggageKg: 23, seats: 8 },
    ),
  ],
  fares: [
    { flightId: 'HND-GMP-0730', fareLevel: 0.86, fareQuota: 3 },
    { flightId: 'HND-GMP-0840', fareLevel: 1, fareQuota: 2 },
    { flightId: 'HND-GMP-0915', fareLevel: 0.9, fareQuota: 3 },
    { flightId: 'HND-GMP-1005', fareLevel: 1.2, fareQuota: 2 },
    { flightId: 'HND-GMP-1020', fareLevel: 0.88, fareQuota: 3 },
    { flightId: 'HND-GMP-1135', fareLevel: 0.84, fareQuota: 3 },
  ],
});

/**
 * ラウンド3：東京（成田）→香港。
 * 条件を満たす便のサイト1の販売枠が1枚ずつしかない。売り切れを見越してサイト2を選ぶか、入力を急ぐか。
 */
const round3 = buildRound({
  id: 'round-3',
  passport: {
    surname: 'TACHIBANA',
    givenName: 'SORA',
    birthDate: '2001-07-29',
    nationality: 'NOVA REPUBLIC',
    countryCode: 'NVA',
    passportNumber: 'TS2196047',
    expiryDate: '2033-01-08',
  },
  card: {
    holderName: 'SORA TACHIBANA',
    number: '9068 1157 9902 4413',
    expiry: '03/32',
    securityCode: '906',
  },
  requirements: {
    originCode: 'NRT',
    destinationCode: 'HKG',
    departureDate: '2027-07-15',
    departAfter: '10:00',
    arriveBy: '18:00',
    checkedBaggageKg: 20,
    excludedOperatingAirlineIds: ['A'],
    arrivalTerminal: 1,
    seatPositions: ['window'],
  },
  flights: [
    // 10:00より前に出発する。
    flight(
      'NRT-HKG-0925',
      { from: 'NRT', to: 'HKG', date: '2027-07-15' },
      { dep: '09:25', arr: '13:20' },
      { seller: 'B', terminal: 1, baggageKg: 20, seats: 8 },
    ),
    // 条件を満たす。サイト1の販売枠は1枚。空席は多いが、窓側は7席。
    flight(
      'NRT-HKG-1040',
      { from: 'NRT', to: 'HKG', date: '2027-07-15' },
      { dep: '10:40', arr: '14:35' },
      { seller: 'C', terminal: 1, baggageKg: 20, seats: 21 },
    ),
    // 運航が不可の航空会社A。
    flight(
      'NRT-HKG-1110',
      { from: 'NRT', to: 'HKG', date: '2027-07-15' },
      { dep: '11:10', arr: '15:05' },
      { seller: 'D', operator: 'A', terminal: 1, baggageKg: 20, seats: 8 },
    ),
    // 条件を満たす。乗継1回で、到着は期限の5分前。サイト1の販売枠は1枚。窓側は7席。
    flight(
      'NRT-HKG-1230',
      { from: 'NRT', to: 'HKG', date: '2027-07-15' },
      { dep: '12:30', arr: '17:55' },
      { seller: 'B', terminal: 1, stops: 1, baggageKg: 20, seats: 21 },
    ),
    // 18:00より後に着く。
    flight(
      'NRT-HKG-1415',
      { from: 'NRT', to: 'HKG', date: '2027-07-15' },
      { dep: '14:15', arr: '18:10' },
      { seller: 'C', terminal: 1, baggageKg: 20, seats: 8 },
    ),
    // 羽田発。出発空港を取り違えて検索すると、これが安く見える。
    flight(
      'HND-HKG-1050',
      { from: 'HND', to: 'HKG', date: '2027-07-15' },
      { dep: '10:50', arr: '14:45' },
      { seller: 'D', terminal: 1, baggageKg: 20, seats: 8 },
    ),
  ],
  fares: [
    { flightId: 'NRT-HKG-0925', fareLevel: 0.85, fareQuota: 3 },
    { flightId: 'NRT-HKG-1040', fareLevel: 1, fareQuota: 1 },
    { flightId: 'NRT-HKG-1110', fareLevel: 0.88, fareQuota: 3 },
    { flightId: 'NRT-HKG-1230', fareLevel: 1.08, fareQuota: 1 },
    { flightId: 'NRT-HKG-1415', fareLevel: 0.87, fareQuota: 3 },
    { flightId: 'HND-HKG-1050', fareLevel: 0.8, fareQuota: 3 },
  ],
});

/**
 * ラウンド4：東京（羽田）→台北（桃園）。
 * 条件を満たす2便の価格が近く、サイト3の閲覧人数しだいで順番が入れ替わる。到着が期限ちょうどの便もある。
 */
const round4 = buildRound({
  id: 'round-4',
  passport: {
    surname: 'KUROSAWA',
    givenName: 'MEI',
    birthDate: '1989-02-16',
    nationality: 'NOVA REPUBLIC',
    countryCode: 'NVA',
    passportNumber: 'MK7724019',
    expiryDate: '2030-12-03',
  },
  card: {
    holderName: 'MEI KUROSAWA',
    number: '9075 6620 1384 5527',
    expiry: '06/29',
    securityCode: '264',
  },
  requirements: {
    originCode: 'HND',
    destinationCode: 'TPE',
    departureDate: '2027-08-21',
    departAfter: '12:00',
    arriveBy: '20:30',
    checkedBaggageKg: 15,
    excludedOperatingAirlineIds: ['D'],
    arrivalTerminal: 2,
    seatPositions: ['aisle'],
  },
  flights: [
    // 12:00より前に出発する。
    flight(
      'HND-TPE-1130',
      { from: 'HND', to: 'TPE', date: '2027-08-21' },
      { dep: '11:30', arr: '14:15' },
      { seller: 'A', terminal: 2, baggageKg: 20, seats: 8 },
    ),
    // 条件を満たす。空席は多いが、通路側は7席。
    flight(
      'HND-TPE-1225',
      { from: 'HND', to: 'TPE', date: '2027-08-21' },
      { dep: '12:25', arr: '15:10' },
      { seller: 'B', terminal: 2, baggageKg: 20, seats: 21 },
    ),
    // 販売は航空会社Cだが、運航は不可の航空会社D。
    flight(
      'HND-TPE-1340',
      { from: 'HND', to: 'TPE', date: '2027-08-21' },
      { dep: '13:40', arr: '16:25' },
      { seller: 'C', operator: 'D', terminal: 2, baggageKg: 20, seats: 8 },
    ),
    // 到着ターミナルが1。
    flight(
      'HND-TPE-1510',
      { from: 'HND', to: 'TPE', date: '2027-08-21' },
      { dep: '15:10', arr: '17:55' },
      { seller: 'A', terminal: 1, baggageKg: 20, seats: 8 },
    ),
    // 条件を満たす。到着は期限ちょうどの20:30。通路側は7席。
    flight(
      'HND-TPE-1745',
      { from: 'HND', to: 'TPE', date: '2027-08-21' },
      { dep: '17:45', arr: '20:30' },
      { seller: 'B', terminal: 2, baggageKg: 20, seats: 21 },
    ),
    // 台北（松山）行き。到着空港を取り違えると、これが安く見える。
    flight(
      'HND-TSA-1300',
      { from: 'HND', to: 'TSA', date: '2027-08-21' },
      { dep: '13:00', arr: '15:40' },
      { seller: 'C', terminal: 2, baggageKg: 20, seats: 8 },
    ),
  ],
  fares: [
    { flightId: 'HND-TPE-1130', fareLevel: 0.86, fareQuota: 3 },
    { flightId: 'HND-TPE-1225', fareLevel: 1, fareQuota: 2 },
    { flightId: 'HND-TPE-1340', fareLevel: 0.88, fareQuota: 3 },
    { flightId: 'HND-TPE-1510', fareLevel: 0.9, fareQuota: 3 },
    { flightId: 'HND-TPE-1745', fareLevel: 1.04, fareQuota: 2 },
    { flightId: 'HND-TSA-1300', fareLevel: 0.8, fareQuota: 3 },
  ],
});

/** 1試合で使う4ラウンド。ラウンド1は、企画書のラウンド例をもとにした出題。 */
export const matchRounds: RoundScenario[] = [sampleRound, round2, round3, round4];
