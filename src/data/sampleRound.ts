import { createFlightOffers, highestPrice } from '../game/pricing';
import { prototypeSettings } from '../game/settings';
import type { RoundScenario } from '../game/types';

// 1ラウンド分の出題データ。企画書「14 ラウンド例」と画面配置図の内容に合わせている。
// 人物・国・空港・航空会社・番号は、すべて架空。
// 便の数、座席数、販売枠、距離、便ごとの倍率は試作用の仮の値で、標準の価格を決めるものではない。

/** 仮：羽之浦から星汐までの距離。 */
const distanceKm = 1_000;

// 価格は距離から計算する。fareLevel は便ごとの高い・安いを表す倍率。
const offers = [
  { flightId: 'HNU-HSO-0810', fareLevel: 1, fareQuota: 2 },
  { flightId: 'HNU-HSO-0925', fareLevel: 0.89, fareQuota: 3 },
  { flightId: 'HNU-HSO-1105', fareLevel: 1.28, fareQuota: 2 },
  { flightId: 'HNU-HSO-1320', fareLevel: 0.86, fareQuota: 3 },
].map((fare) => createFlightOffers({ ...fare, distanceKm }, prototypeSettings.pricing));

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
    originCode: 'HNU',
    destinationCode: 'HSO',
    departureDate: '2027-05-18',
    arriveBy: '17:00',
    checkedBaggageKg: 20,
    excludedOperatingAirlineIds: ['C'],
    arrivalTerminal: 1,
  },
  distanceKm,
  airports: [
    { code: 'HNU', city: '羽之浦' },
    { code: 'HSO', city: '星汐' },
  ],
  airlines: [
    { id: 'A', name: '航空会社A' },
    { id: 'B', name: '航空会社B' },
    { id: 'C', name: '航空会社C' },
    { id: 'D', name: '航空会社D' },
  ],
  flights: [
    {
      // 条件を満たす。
      id: 'HNU-HSO-0810',
      sellingAirlineId: 'A',
      operatingAirlineId: 'A',
      originCode: 'HNU',
      destinationCode: 'HSO',
      departureDate: '2027-05-18',
      departureTime: '08:10',
      arrivalTime: '12:30',
      arrivalTerminal: 1,
      stops: 0,
      checkedBaggageKg: 20,
      seats: 6,
    },
    {
      // 最も安く見えるが、運航会社と到着ターミナルが条件に合わない。
      id: 'HNU-HSO-0925',
      sellingAirlineId: 'B',
      operatingAirlineId: 'C',
      originCode: 'HNU',
      destinationCode: 'HSO',
      departureDate: '2027-05-18',
      departureTime: '09:25',
      arrivalTime: '15:40',
      arrivalTerminal: 2,
      stops: 1,
      checkedBaggageKg: 20,
      seats: 8,
    },
    {
      // 条件を満たす。高いが、座席が多い。
      id: 'HNU-HSO-1105',
      sellingAirlineId: 'D',
      operatingAirlineId: 'D',
      originCode: 'HNU',
      destinationCode: 'HSO',
      departureDate: '2027-05-18',
      departureTime: '11:05',
      arrivalTime: '16:50',
      arrivalTerminal: 1,
      stops: 0,
      checkedBaggageKg: 20,
      seats: 8,
    },
    {
      // 到着が17:00を過ぎるため、条件に合わない。
      id: 'HNU-HSO-1320',
      sellingAirlineId: 'A',
      operatingAirlineId: 'A',
      originCode: 'HNU',
      destinationCode: 'HSO',
      departureDate: '2027-05-18',
      departureTime: '13:20',
      arrivalTime: '17:35',
      arrivalTerminal: 1,
      stops: 0,
      checkedBaggageKg: 20,
      seats: 8,
    },
  ],
  offers,
  maxPrice: highestPrice(offers),
};
