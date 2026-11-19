import { distanceKm } from '../game/airports';
import { createFlightOffers, highestPrice } from '../game/pricing';
import { findTripViolations } from '../game/requirements';
import { prototypeSettings } from '../game/settings';
import { generateRoundFlights } from './generateFlights';
import type {
  Airline,
  Airport,
  Flight,
  FlightOffers,
  PassportData,
  PaymentCardData,
  RoundScenario,
  TripRequirements,
} from '../game/types';

// 出題データを組み立てる。便ごとの価格は、出発地と目的地の距離から計算する。

/** 選択肢に出す空港。緯度・経度はおおよその値。空港と都市は実在の名前を使う。 */
export const AIRPORTS: Airport[] = [
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
  {
    code: 'ICN',
    name: 'ソウル（仁川）',
    utcOffsetMinutes: 540,
    latitude: 37.4602,
    longitude: 126.4407,
  },
  { code: 'HKG', name: '香港', utcOffsetMinutes: 480, latitude: 22.308, longitude: 113.9185 },
];

/** 航空会社は架空。 */
export const AIRLINES: Airline[] = [
  { id: 'A', name: '航空会社A' },
  { id: 'B', name: '航空会社B' },
  { id: 'C', name: '航空会社C' },
  { id: 'D', name: '航空会社D' },
];

/** 便ごとの価格の決め方。fareLevel は便ごとの高い・安いを表す倍率、fareQuota はサイト1の販売枠。 */
export type FareDefinition = { flightId: string; fareLevel: number; fareQuota: number };

/**
 * 条件を満たす便の価格のうち、最も高い金額（ラウンド最高値）。
 * 予算の条件は便では決まらないので、ここでは見ない（予算を超える予約は条件違反として最高値で集計する）。
 */
export function validMaxPrice(
  flights: Flight[],
  offers: FlightOffers[],
  requirements: TripRequirements,
  airports: Airport[] = AIRPORTS,
): number {
  const valid = new Set(
    flights
      .filter((f) => findTripViolations(f, requirements, airports).length === 0)
      .map((f) => f.id),
  );
  return highestPrice(offers.filter((offer) => valid.has(offer.flightId)));
}

export function buildRound(definition: {
  id: string;
  passport: PassportData;
  card: PaymentCardData;
  requirements: TripRequirements;
  flights: Flight[];
  fares: FareDefinition[];
}): RoundScenario {
  const offers = definition.fares.map((fare) => {
    const flight = definition.flights.find((candidate) => candidate.id === fare.flightId);
    if (!flight) throw new Error(`便がありません：${fare.flightId}`);
    const km = distanceKm(AIRPORTS, flight.originCode, flight.destinationCode);
    return createFlightOffers({ ...fare, distanceKm: km }, prototypeSettings.pricing);
  });
  return {
    id: definition.id,
    passport: definition.passport,
    card: definition.card,
    requirements: definition.requirements,
    airports: AIRPORTS,
    airlines: AIRLINES,
    flights: definition.flights,
    offers,
    maxPrice: validMaxPrice(definition.flights, offers, definition.requirements),
  };
}

/** 便のデータを短く書くための関数。出発日と到着日が同じ便は、到着日を省略できる。 */
export function flight(
  id: string,
  route: { from: string; to: string; date: string; arrivalDate?: string },
  times: { dep: string; arr: string },
  details: {
    seller: string;
    operator?: string;
    terminal: number;
    /** 乗継の空港。省略すると直行便。 */
    via?: string[];
    baggageKg: number;
    seats: number;
  },
): Flight {
  return {
    id,
    sellingAirlineId: details.seller,
    operatingAirlineId: details.operator ?? details.seller,
    originCode: route.from,
    destinationCode: route.to,
    departureDate: route.date,
    departureTime: times.dep,
    arrivalDate: route.arrivalDate ?? route.date,
    arrivalTime: times.arr,
    arrivalTerminal: details.terminal,
    stops: details.via?.length ?? 0,
    ...(details.via ? { via: details.via } : {}),
    checkedBaggageKg: details.baggageKg,
    seats: details.seats,
  };
}

/**
 * 手で書いた出題に、自動生成の便を足す（src/data/generateFlights.ts）。
 * 正しい区間・日付の候補を増やし、検索条件を間違えても候補が出るようにする。
 * 空港の一覧は、全ラウンド共通の一覧にそろえる。ラウンド最高値は、足した便も含めて決め直す。
 */
export function withGeneratedFlights(
  scenario: RoundScenario,
  counts: { correct: number; other: number } = { correct: 8, other: 3 },
): RoundScenario {
  const generated = generateRoundFlights({
    seed: scenario.id,
    requirements: scenario.requirements,
    airports: AIRPORTS,
    airlineIds: AIRLINES.map((airline) => airline.id),
    existingIds: scenario.flights.map((f) => f.id),
    correctCount: counts.correct,
    otherCount: counts.other,
  });
  const flights = [...scenario.flights, ...generated.flights];
  const offers = [...scenario.offers, ...generated.offers];
  return {
    ...scenario,
    airports: AIRPORTS,
    flights,
    offers,
    maxPrice: validMaxPrice(flights, offers, scenario.requirements),
  };
}
