import { airportName, flightDurationMinutes } from './airports';
import { formatJapaneseDate } from './dates';
import { SEAT_POSITION_LABEL, seatPosition } from './seatMap';
import type { Airline, Airport, Flight, TripMemo, TripRequirements, Yen } from './types';

/**
 * 便が満たしていない旅行条件の種類。
 * 違反の軽重や減点は src/game/penalty.ts で決める。ここでは種類だけを返す。
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
  /** 直行便のみの条件で、乗継がある。 */
  | 'stops'
  /** 乗継してよい空港以外で乗継する。 */
  | 'via'
  /** 所要時間が上限を超える。 */
  | 'duration'
  /** 座席の位置。便ではなく、予約した席で決まる。 */
  | 'seat'
  /** 予算を超える。便ではなく、支払った金額で決まる。 */
  | 'budget';

/** 席が、条件メモの席の条件を満たしているか。席の条件がなければ、どの席でもよい。 */
export function seatMeetsRequirements(seatId: string, requirements: TripRequirements): boolean {
  return (
    requirements.seatPositions === undefined ||
    requirements.seatPositions.includes(seatPosition(seatId))
  );
}

/** 金額が予算に収まっているか。予算の条件がなければ、いくらでもよい。 */
export function priceMeetsBudget(price: Yen, requirements: TripRequirements): boolean {
  return requirements.maxBudget === undefined || price <= requirements.maxBudget;
}

/**
 * 予約の条件違反。便の条件違反に、予約した席と支払った金額の条件違反を足す。
 * 席や金額が分からない（記録がない）ときは、その条件は調べない。
 */
export function findBookingViolations(
  flight: Flight,
  booking: { seatId?: string; price?: Yen },
  requirements: TripRequirements,
  airports?: Airport[],
): TripViolation[] {
  const violations = findTripViolations(flight, requirements, airports);
  if (booking.seatId !== undefined && !seatMeetsRequirements(booking.seatId, requirements)) {
    violations.push('seat');
  }
  if (booking.price !== undefined && !priceMeetsBudget(booking.price, requirements)) {
    violations.push('budget');
  }
  return violations;
}

/**
 * 便が条件メモを満たしているかを調べる。空の配列なら、すべて満たしている。
 * 席と予算の条件は便では決まらないので、ここでは調べない（findBookingViolations で調べる）。
 * 所要時間の条件があるときは、時差の計算に空港の一覧（airports）が要る。
 */
export function findTripViolations(
  flight: Flight,
  requirements: TripRequirements,
  airports?: Airport[],
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
  if (requirements.nonstopOnly && flight.stops > 0) violations.push('stops');
  if (
    requirements.allowedViaCodes !== undefined &&
    (flight.via ?? []).some((code) => !requirements.allowedViaCodes?.includes(code))
  ) {
    violations.push('via');
  }
  if (requirements.maxDurationMinutes !== undefined) {
    if (!airports) throw new Error('所要時間の条件を調べるには、空港の一覧が必要です');
    if (flightDurationMinutes(airports, flight) > requirements.maxDurationMinutes) {
      violations.push('duration');
    }
  }

  return violations;
}

/** 分を「5時間」「5時間30分」の形にする。 */
function formatHours(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}時間` : `${hours}時間${rest}分`;
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
  if (requirements.maxBudget !== undefined) {
    conditions.push(`予算は¥${requirements.maxBudget.toLocaleString('ja-JP')}まで`);
  }
  if (requirements.nonstopOnly) conditions.push('直行便のみ');
  if (requirements.allowedViaCodes !== undefined) {
    const names = requirements.allowedViaCodes.map((code) => airportName(airports, code));
    // メモの1行に収まるよう、短く書く。直行便はよい。
    conditions.push(`乗継は${names.join('か')}経由のみ`);
  }
  if (requirements.maxDurationMinutes !== undefined) {
    conditions.push(`所要時間は${formatHours(requirements.maxDurationMinutes)}以内`);
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
