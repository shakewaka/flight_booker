import { airportName } from './airports';
import { formatJapaneseDate } from './dates';
import { SEAT_POSITION_LABEL, seatPosition } from './seatMap';
import type { Airline, Airport, Flight, TripMemo, TripRequirements } from './types';

/**
 * 便が満たしていない旅行条件の種類。
 * 違反の軽重や減点は未決定のため、ここでは種類だけを返す。
 */
export type TripViolation =
  | 'origin'
  | 'destination'
  | 'departureDate'
  | 'departureTime'
  | 'arrivalTime'
  | 'checkedBaggage'
  | 'operatingAirline'
  | 'arrivalTerminal'
  /** 座席の位置。便ではなく、予約した席で決まる。 */
  | 'seat';

/** 席が、条件メモの席の条件を満たしているか。席の条件がなければ、どの席でもよい。 */
export function seatMeetsRequirements(seatId: string, requirements: TripRequirements): boolean {
  return (
    requirements.seatPositions === undefined ||
    requirements.seatPositions.includes(seatPosition(seatId))
  );
}

/**
 * 予約の条件違反。便の条件違反に、予約した席の条件違反を足す。
 * 席が分からない（記録がない）ときは、便だけで判定する。
 */
export function findBookingViolations(
  flight: Flight,
  seatId: string | undefined,
  requirements: TripRequirements,
): TripViolation[] {
  const violations = findTripViolations(flight, requirements);
  if (seatId !== undefined && !seatMeetsRequirements(seatId, requirements)) {
    violations.push('seat');
  }
  return violations;
}

/**
 * 便が条件メモを満たしているかを調べる。空の配列なら、すべて満たしている。
 * 席の条件は便では決まらないので、ここでは調べない（findBookingViolations で調べる）。
 */
export function findTripViolations(
  flight: Flight,
  requirements: TripRequirements,
): TripViolation[] {
  const violations: TripViolation[] = [];

  if (flight.originCode !== requirements.originCode) violations.push('origin');
  if (flight.destinationCode !== requirements.destinationCode) violations.push('destination');
  if (flight.departureDate !== requirements.departureDate) violations.push('departureDate');
  // HH:mm 同士は、文字列のまま比べても時刻の前後と一致する。
  if (requirements.departAfter !== undefined && flight.departureTime < requirements.departAfter) {
    violations.push('departureTime');
  }
  // 到着の期限は、出発日のその時刻。翌日以降に着く便は、時刻が早くても期限を過ぎている。
  if (
    requirements.arriveBy !== undefined &&
    `${flight.arrivalDate} ${flight.arrivalTime}` >
      `${requirements.departureDate} ${requirements.arriveBy}`
  ) {
    violations.push('arrivalTime');
  }
  if (flight.checkedBaggageKg < requirements.checkedBaggageKg) violations.push('checkedBaggage');
  if (requirements.excludedOperatingAirlineIds.includes(flight.operatingAirlineId)) {
    violations.push('operatingAirline');
  }
  if (
    requirements.arrivalTerminal !== undefined &&
    flight.arrivalTerminal !== requirements.arrivalTerminal
  ) {
    violations.push('arrivalTerminal');
  }

  return violations;
}

/**
 * 条件メモの文章を、判定に使う条件から作る。
 * 判定する条件を必ずメモに載せ、隠し条件を作らないために、文章を別に手書きしない。
 */
export function describeRequirements(
  requirements: TripRequirements,
  airports: Airport[],
  airlines: Airline[],
): TripMemo {
  const airlineNameOf = (id: string) => airlines.find((airline) => airline.id === id)?.name ?? id;
  const date = formatJapaneseDate(requirements.departureDate);
  const departure = { date, after: requirements.departAfter ?? null };
  // 初期データは出発日と同じ日に到着する便だけなので、到着の期限も出発日の日付で書く。
  const arrivalDeadline =
    requirements.arriveBy === undefined ? null : { date, time: requirements.arriveBy };

  const conditions: string[] = [];
  if (requirements.checkedBaggageKg > 0) {
    conditions.push(`受託手荷物 ${requirements.checkedBaggageKg}kg が必要`);
  }
  for (const airlineId of requirements.excludedOperatingAirlineIds) {
    conditions.push(`運航が${airlineNameOf(airlineId)}の便は不可`);
  }
  if (requirements.arrivalTerminal !== undefined) {
    conditions.push(`到着はターミナル${requirements.arrivalTerminal}`);
  }
  if (requirements.seatPositions !== undefined) {
    // 座席表の並び（窓側・真ん中・通路側）の順に書く。
    const labels = (['window', 'middle', 'aisle'] as const)
      .filter((position) => requirements.seatPositions?.includes(position))
      .map((position) => SEAT_POSITION_LABEL[position]);
    conditions.push(`座席は${labels.join('か')}`);
  }

  return {
    origin: airportName(airports, requirements.originCode),
    destination: airportName(airports, requirements.destinationCode),
    departure,
    arrivalDeadline,
    conditions,
  };
}
