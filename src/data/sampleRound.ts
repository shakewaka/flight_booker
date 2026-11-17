import { distanceKm } from '../game/airports';
import { createFlightOffers, highestPrice } from '../game/pricing';
import { prototypeSettings } from '../game/settings';
import type { Airport, Flight, RoundScenario } from '../game/types';

// 1ラウンド分の出題データ。企画書「14 ラウンド例」の条件を、東京（羽田）発・台北（松山）行きの国際線に置き換えた。
// 空港と都市は実在の名前を使う（docs/decisions.md）。人物・国・航空会社・番号は架空。
// 便の時刻・座席数・販売枠・便ごとの倍率は試作用の仮の値で、実在の便や運賃ではない。

/** 選択肢に出す空港。緯度・経度はおおよその値。 */
const airports: Airport[] = [
  {
    code: 'HND',
    name: '東京（羽田）',
    utcOffsetMinutes: 540,
    latitude: 35.5494,
    longitude: 139.7798,
  },
  {
    code: 'NRT',
    name: '東京（成田）',
    utcOffsetMinutes: 540,
    latitude: 35.7647,
    longitude: 140.3864,
  },
  {
    code: 'TSA',
    name: '台北（松山）',
    utcOffsetMinutes: 480,
    latitude: 25.0694,
    longitude: 121.5519,
  },
  {
    code: 'TPE',
    name: '台北（桃園）',
    utcOffsetMinutes: 480,
    latitude: 25.0777,
    longitude: 121.2328,
  },
  {
    code: 'GMP',
    name: 'ソウル（金浦）',
    utcOffsetMinutes: 540,
    latitude: 37.5583,
    longitude: 126.7906,
  },
  { code: 'HKG', name: '香港', utcOffsetMinutes: 480, latitude: 22.308, longitude: 113.9185 },
];

/** 出発・到着の時刻は、それぞれの空港の現地時間。 */
const flights: Flight[] = [
  {
    // 最も安いが、09:00より前に出発するため条件に合わない。
    id: 'HND-TSA-0705',
    sellingAirlineId: 'A',
    operatingAirlineId: 'A',
    originCode: 'HND',
    destinationCode: 'TSA',
    departureDate: '2027-05-18',
    departureTime: '07:05',
    arrivalDate: '2027-05-18',
    arrivalTime: '09:40',
    arrivalTerminal: 1,
    stops: 0,
    checkedBaggageKg: 20,
    seats: 8,
  },
  {
    // 条件を満たす。
    id: 'HND-TSA-0910',
    sellingAirlineId: 'A',
    operatingAirlineId: 'A',
    originCode: 'HND',
    destinationCode: 'TSA',
    departureDate: '2027-05-18',
    departureTime: '09:10',
    arrivalDate: '2027-05-18',
    arrivalTime: '11:45',
    arrivalTerminal: 1,
    stops: 0,
    checkedBaggageKg: 20,
    seats: 6,
  },
  {
    // 安く見えるが、運航会社と到着ターミナルが条件に合わない。
    id: 'HND-TSA-0925',
    sellingAirlineId: 'B',
    operatingAirlineId: 'C',
    originCode: 'HND',
    destinationCode: 'TSA',
    departureDate: '2027-05-18',
    departureTime: '09:25',
    arrivalDate: '2027-05-18',
    arrivalTime: '14:10',
    arrivalTerminal: 2,
    stops: 1,
    checkedBaggageKg: 20,
    seats: 8,
  },
  {
    // 条件を満たす。高いが、座席が多い。
    id: 'HND-TSA-1105',
    sellingAirlineId: 'D',
    operatingAirlineId: 'D',
    originCode: 'HND',
    destinationCode: 'TSA',
    departureDate: '2027-05-18',
    departureTime: '11:05',
    arrivalDate: '2027-05-18',
    arrivalTime: '13:40',
    arrivalTerminal: 1,
    stops: 0,
    checkedBaggageKg: 20,
    seats: 8,
  },
  {
    // 安く見えるが、現地17:00より後に着くため条件に合わない。
    id: 'HND-TSA-1620',
    sellingAirlineId: 'A',
    operatingAirlineId: 'A',
    originCode: 'HND',
    destinationCode: 'TSA',
    departureDate: '2027-05-18',
    departureTime: '16:20',
    arrivalDate: '2027-05-18',
    arrivalTime: '18:55',
    arrivalTerminal: 1,
    stops: 0,
    checkedBaggageKg: 20,
    seats: 8,
  },
  {
    // 成田発・桃園行き。空港を取り違えて検索すると、これが安く見える。
    id: 'NRT-TPE-0950',
    sellingAirlineId: 'B',
    operatingAirlineId: 'B',
    originCode: 'NRT',
    destinationCode: 'TPE',
    departureDate: '2027-05-18',
    departureTime: '09:50',
    arrivalDate: '2027-05-18',
    arrivalTime: '12:35',
    arrivalTerminal: 1,
    stops: 0,
    checkedBaggageKg: 20,
    seats: 8,
  },
];

// 価格は、出発地と目的地の距離から計算する。fareLevel は便ごとの高い・安いを表す倍率。
const fares = [
  { flightId: 'HND-TSA-0705', fareLevel: 0.84, fareQuota: 3 },
  { flightId: 'HND-TSA-0910', fareLevel: 1, fareQuota: 2 },
  { flightId: 'HND-TSA-0925', fareLevel: 0.89, fareQuota: 3 },
  { flightId: 'HND-TSA-1105', fareLevel: 1.28, fareQuota: 2 },
  { flightId: 'HND-TSA-1620', fareLevel: 0.86, fareQuota: 3 },
  { flightId: 'NRT-TPE-0950', fareLevel: 0.8, fareQuota: 3 },
];

const offers = fares.map((fare) => {
  const flight = flights.find((candidate) => candidate.id === fare.flightId);
  if (!flight) throw new Error(`便がありません：${fare.flightId}`);
  const km = distanceKm(airports, flight.originCode, flight.destinationCode);
  return createFlightOffers({ ...fare, distanceKm: km }, prototypeSettings.pricing);
});

export const sampleRound: RoundScenario = {
  id: 'sample-round',
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
  requirements: {
    originCode: 'HND',
    destinationCode: 'TSA',
    departureDate: '2027-05-18',
    departAfter: '09:00',
    arriveBy: '17:00',
    checkedBaggageKg: 20,
    excludedOperatingAirlineIds: ['C'],
    arrivalTerminal: 1,
  },
  airports,
  airlines: [
    { id: 'A', name: '航空会社A' },
    { id: 'B', name: '航空会社B' },
    { id: 'C', name: '航空会社C' },
    { id: 'D', name: '航空会社D' },
  ],
  flights,
  offers,
  maxPrice: highestPrice(offers),
};
