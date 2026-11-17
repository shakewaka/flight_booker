import type { Airport, Flight } from './types';

// 空港の情報を使った計算。空港と都市は実在の名前を使う（docs/decisions.md）。

const EARTH_RADIUS_KM = 6_371;

function findAirport(airports: Airport[], code: string): Airport {
  const airport = airports.find((candidate) => candidate.code === code);
  if (!airport) throw new Error(`空港の一覧にない空港です：${code}`);
  return airport;
}

/** 空港の表示名。一覧にない場合は、空港コードをそのまま返す。 */
export function airportName(airports: Airport[], code: string): string {
  return airports.find((airport) => airport.code === code)?.name ?? code;
}

/**
 * 2つの空港を結ぶ大円距離（地球の表面に沿った最短距離）。
 * 実際の飛行経路とは違うが、価格帯を決める「おおよその距離」として使う。
 */
export function distanceKm(airports: Airport[], fromCode: string, toCode: string): number {
  const from = findAirport(airports, fromCode);
  const to = findAirport(airports, toCode);
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(to.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * 飛行の所要時間（分）。出発・到着の時刻は、それぞれの空港の現地時間で持っている。
 * 日付をまたぐ便は扱わないため、0以下になったらデータの誤りとして扱う。
 */
export function flightDurationMinutes(airports: Airport[], flight: Flight): number {
  const origin = findAirport(airports, flight.originCode);
  const destination = findAirport(airports, flight.destinationCode);
  const localDifference = toMinutes(flight.arrivalTime) - toMinutes(flight.departureTime);
  return localDifference - (destination.utcOffsetMinutes - origin.utcOffsetMinutes);
}
