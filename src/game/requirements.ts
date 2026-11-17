import type { Airline, Airport, Flight, TripMemo, TripRequirements } from './types';

/**
 * 便が満たしていない旅行条件の種類。
 * 違反の軽重や減点は未決定のため、ここでは種類だけを返す。
 */
export type TripViolation =
  | 'origin'
  | 'destination'
  | 'departureDate'
  | 'arrivalTime'
  | 'checkedBaggage'
  | 'operatingAirline'
  | 'arrivalTerminal';

/** 便が条件メモを満たしているかを調べる。空の配列なら、すべて満たしている。 */
export function findTripViolations(
  flight: Flight,
  requirements: TripRequirements,
): TripViolation[] {
  const violations: TripViolation[] = [];

  if (flight.originCode !== requirements.originCode) violations.push('origin');
  if (flight.destinationCode !== requirements.destinationCode) violations.push('destination');
  if (flight.departureDate !== requirements.departureDate) violations.push('departureDate');
  // HH:mm 同士は、文字列のまま比べても時刻の前後と一致する。
  if (requirements.arriveBy !== undefined && flight.arrivalTime > requirements.arriveBy) {
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
  const cityOf = (code: string) => airports.find((airport) => airport.code === code)?.city ?? code;
  const airlineNameOf = (id: string) => airlines.find((airline) => airline.id === id)?.name ?? id;
  const [, month, day] = requirements.departureDate.split('-').map(Number);

  const conditions = [`${month}月${day}日に出発`];
  if (requirements.arriveBy !== undefined) {
    conditions.push(`${requirements.arriveBy}までに到着`);
  }
  if (requirements.checkedBaggageKg > 0) {
    conditions.push(`受託手荷物 ${requirements.checkedBaggageKg}kg が必要`);
  }
  for (const airlineId of requirements.excludedOperatingAirlineIds) {
    conditions.push(`運航が${airlineNameOf(airlineId)}の便は不可`);
  }
  if (requirements.arrivalTerminal !== undefined) {
    conditions.push(`到着はターミナル${requirements.arrivalTerminal}`);
  }

  return {
    route: `${cityOf(requirements.originCode)} → ${cityOf(requirements.destinationCode)}`,
    conditions,
  };
}
