import { distanceKm } from '../game/airports';
import { createFlightOffers } from '../game/pricing';
import { unitFromString } from '../game/random';
import type { TripViolation } from '../game/requirements';
import { prototypeSettings } from '../game/settings';
import type { Airport, Flight, FlightOffers, TripRequirements } from '../game/types';

// 便の自動生成。手で書いた出題の便に加えて、検索で出てくる候補を増やす。
// - 正しい区間・日付には、条件を満たす便と、条件を1つだけ満たさない便（わな）を作る。
// - 間違えやすい区間・日付（前後の日、同じ都市の別の空港、逆方向など）にも便を作り、
//   検索条件を間違えても候補が出るようにする。
// - 直行便は高くて速い。乗継便は安いが、乗継の待ち時間の分だけ長くかかる。
// 乱数ではなく、ラウンドの番号と区間から決まる（毎回同じ便になる）。
// 時刻・価格の倍率・座席数は試作用の仮の値で、実在の便や運賃ではない。

/** 生成する便の、手で書いた便と同じ形の価格の決め方。 */
export type GeneratedFlight = { flight: Flight; fareLevel: number; fareQuota: number };

/** 便が飛ぶ速さ（km/時）と、離着陸にかかる時間（分）。所要時間の計算に使う。 */
const SPEED_KMH = 780;
const TAXI_MINUTES = 35;
/** 出発の時間帯（出発地の現地時間）。 */
const FIRST_DEPARTURE = 6 * 60;
const LAST_DEPARTURE = 21 * 60 + 30;
/** 料金に含まれる受託手荷物の重さの候補。 */
const BAGGAGE_OPTIONS = [15, 20, 23];

const round5 = (minutes: number) => Math.round(minutes / 5) * 5;
const pad = (value: number) => String(value).padStart(2, '0');
const clock = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
const toMinutes = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

/** YYYY-MM-DD の日付を、days 日ずらす。 */
export function shiftDate(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** 空港の都市名（「東京（羽田）」なら「東京」）。同じ都市の空港を見分けるのに使う。 */
export function cityOf(airport: Airport): string {
  return airport.name.split('（')[0];
}

function airportOf(airports: Airport[], code: string): Airport {
  const airport = airports.find((candidate) => candidate.code === code);
  if (!airport) throw new Error(`空港の一覧にない空港です：${code}`);
  return airport;
}

/** 1区間を飛ぶ時間（分）。 */
function legMinutes(airports: Airport[], from: string, to: string): number {
  return round5((distanceKm(airports, from, to) / SPEED_KMH) * 60 + TAXI_MINUTES);
}

/** 乗継に使える空港。出発地・目的地と同じ都市の空港や、大きく遠回りになる空港は使わない。 */
function hubsFor(airports: Airport[], from: string, to: string): string[] {
  const origin = airportOf(airports, from);
  const destination = airportOf(airports, to);
  const direct = distanceKm(airports, from, to);
  return airports
    .filter((hub) => cityOf(hub) !== cityOf(origin) && cityOf(hub) !== cityOf(destination))
    .filter(
      (hub) =>
        (distanceKm(airports, from, hub.code) + distanceKm(airports, hub.code, to)) / direct <= 1.7,
    )
    .map((hub) => hub.code);
}

/** 便の形（出発時刻と所要時間を決める前の、直行か乗継か）。 */
type Shape = { via: string[]; durationMinutes: number; fareLevel: number };

/** 直行便か乗継便かを決め、所要時間と価格の倍率を決める。 */
function chooseShape(
  airports: Airport[],
  from: string,
  to: string,
  random: (label: string) => number,
  connecting: boolean,
): Shape {
  const hubs = hubsFor(airports, from, to);
  if (connecting && hubs.length > 0) {
    const hub = hubs[Math.floor(random('hub') * hubs.length)];
    const layover = round5(60 + random('layover') * 180);
    return {
      via: [hub],
      durationMinutes: legMinutes(airports, from, hub) + layover + legMinutes(airports, hub, to),
      // 乗継便は安い。待ち時間が長いほど、さらに安い。
      fareLevel: 0.92 - (layover / 240) * 0.18 - random('level') * 0.08,
    };
  }
  return {
    via: [],
    durationMinutes: legMinutes(airports, from, to) + round5(random('extra') * 20),
    // 直行便は高い。
    fareLevel: 1.08 + random('level') * 0.3,
  };
}

/** 出発の日時（出発地の現地時間）と所要時間から、到着の日時（目的地の現地時間）を求める。 */
function arrivalOf(
  airports: Airport[],
  from: string,
  to: string,
  date: string,
  departure: number,
  durationMinutes: number,
): { date: string; time: string } {
  const offset =
    airportOf(airports, to).utcOffsetMinutes - airportOf(airports, from).utcOffsetMinutes;
  const total = departure + durationMinutes + offset;
  const days = Math.floor(total / (24 * 60));
  return { date: shiftDate(date, days), time: clock(total - days * 24 * 60) };
}

type RouteOptions = {
  /** 便を決める元になる文字列。ラウンドごとに変える。 */
  seed: string;
  from: string;
  to: string;
  date: string;
  count: number;
  airports: Airport[];
  airlineIds: string[];
  /**
   * 正しい区間・日付なら、条件メモ。半分ほどを条件を満たす便に、残りを条件を1つだけ満たさない便にする。
   * 省略すると、条件を気にせずに作る。
   */
  requirements?: TripRequirements;
};

/** 条件を1つだけ外す便（わな）で、外す条件の候補。条件メモにない条件は外せない。 */
function breakableConditions(requirements: TripRequirements): TripViolation[] {
  const conditions: TripViolation[] = [];
  if (requirements.departAfter !== undefined) conditions.push('departureTime');
  if (requirements.arriveBy !== undefined) conditions.push('arrivalTime');
  if (requirements.checkedBaggageKg > 0) conditions.push('checkedBaggage');
  if (requirements.excludedOperatingAirlineIds.length > 0) conditions.push('operatingAirline');
  if (requirements.arrivalTerminal !== undefined) conditions.push('arrivalTerminal');
  return conditions;
}

/** 1つの区間・日付の便を作る。 */
export function generateRouteFlights(options: RouteOptions): GeneratedFlight[] {
  const { seed, from, to, date, count, airports, airlineIds, requirements } = options;
  const flights: GeneratedFlight[] = [];
  const usedIds = new Set<string>();
  const offset =
    airportOf(airports, to).utcOffsetMinutes - airportOf(airports, from).utcOffsetMinutes;

  for (let i = 0; i < count; i += 1) {
    const random = (label: string) => unitFromString(`${seed}|${from}|${to}|${date}|${i}|${label}`);
    const pick = <T>(label: string, choices: T[]) =>
      choices[Math.floor(random(label) * choices.length)];

    // 正しい区間なら、偶数番目は条件を満たす便、奇数番目は条件を1つ外す便にする。
    const breakable = requirements ? breakableConditions(requirements) : [];
    const broken: TripViolation | null =
      requirements && i % 2 === 1 && breakable.length > 0 ? pick('broken', breakable) : null;
    const constrained = requirements !== undefined;

    let shape = chooseShape(airports, from, to, random, random('kind') < 0.45);

    // 出発してよい時間帯（出発地の現地時間）。条件を満たす便は、出発と到着の条件に収める。
    const after =
      constrained && requirements.departAfter !== undefined && broken !== 'departureTime'
        ? toMinutes(requirements.departAfter)
        : FIRST_DEPARTURE;
    const latestArrival =
      constrained && requirements.arriveBy !== undefined && broken !== 'arrivalTime'
        ? toMinutes(requirements.arriveBy) - offset
        : null;
    let latest = latestArrival === null ? LAST_DEPARTURE : latestArrival - shape.durationMinutes;
    if (latest < after && shape.via.length > 0) {
      // 乗継便では間に合わないなら、直行便にする。
      shape = chooseShape(airports, from, to, random, false);
      latest = latestArrival === null ? LAST_DEPARTURE : latestArrival - shape.durationMinutes;
    }
    if (latest < after) continue;

    let departure = round5(
      after + random('departure') * (Math.min(latest, LAST_DEPARTURE) - after),
    );
    if (broken === 'departureTime' && requirements?.departAfter !== undefined) {
      // 指定の時刻より、少しだけ早く出発する。
      departure = Math.max(
        FIRST_DEPARTURE,
        toMinutes(requirements.departAfter) - round5(15 + random('early') * 90),
      );
    }
    if (broken === 'arrivalTime' && requirements?.arriveBy !== undefined) {
      // 期限より、少しだけ遅く着く。
      departure =
        toMinutes(requirements.arriveBy) -
        offset -
        shape.durationMinutes +
        round5(10 + random('late') * 80);
    }
    if (departure < FIRST_DEPARTURE || departure > LAST_DEPARTURE) continue;

    // 手荷物。条件を満たす便は、必要な重さ以上にする。
    const needed = constrained ? requirements.checkedBaggageKg : 0;
    let baggageKg =
      random('no-bag') < 0.2 && needed === 0
        ? 0
        : pick(
            'bag',
            BAGGAGE_OPTIONS.filter((kg) => kg >= needed),
          );
    if (broken === 'checkedBaggage') {
      baggageKg = pick('bag-short', [0, ...BAGGAGE_OPTIONS.filter((kg) => kg < needed)]);
    }

    // 販売する会社と運航する会社。条件を満たす便は、不可の会社が運航しない。
    const excluded = constrained ? requirements.excludedOperatingAirlineIds : [];
    const allowed = airlineIds.filter((id) => !excluded.includes(id));
    const seller = pick('seller', airlineIds);
    let operator = random('codeshare') < 0.2 ? pick('operator', airlineIds) : seller;
    if (excluded.includes(operator)) operator = pick('operator-ok', allowed);
    if (broken === 'operatingAirline') {
      // 販売は別の会社で、運航が不可の会社（見落としやすい）。
      operator = pick('operator-ng', excluded);
    }

    // 到着ターミナル。
    const wanted = constrained ? requirements.arrivalTerminal : undefined;
    let terminal = wanted ?? 1 + Math.floor(random('terminal') * 2);
    if (broken === 'arrivalTerminal' && wanted !== undefined) terminal = wanted === 1 ? 2 : 1;

    const arrival = arrivalOf(airports, from, to, date, departure, shape.durationMinutes);
    // 正しい区間の便は、席の条件（窓側だけなど）があっても取り合いになりすぎないよう、座席を多めにする。
    const seats = constrained
      ? 8 + Math.floor(random('seats') * 7)
      : 4 + Math.floor(random('seats') * 5);
    // わなの便は安くして、選びたくなるようにする。手荷物なしの便も安い。
    const fareLevel =
      Math.round(shape.fareLevel * (broken ? 0.9 : 1) * (baggageKg === 0 ? 0.88 : 1) * 100) / 100;

    let id = `${from}-${to}-${date.slice(5).replace('-', '')}-${clock(departure).replace(':', '')}`;
    while (usedIds.has(id)) id += 'X';
    usedIds.add(id);

    flights.push({
      flight: {
        id,
        sellingAirlineId: seller,
        operatingAirlineId: operator,
        originCode: from,
        destinationCode: to,
        departureDate: date,
        departureTime: clock(departure),
        arrivalDate: arrival.date,
        arrivalTime: arrival.time,
        arrivalTerminal: terminal,
        stops: shape.via.length,
        ...(shape.via.length > 0 ? { via: shape.via } : {}),
        checkedBaggageKg: baggageKg,
        seats,
      },
      fareLevel,
      fareQuota: 1 + Math.floor(random('quota') * Math.min(3, seats)),
    });
  }
  return flights;
}

/**
 * 1ラウンド分の自動生成の便。
 * - 正しい区間・日付：correctCount 便（条件を満たす便と、条件を1つ外す便）。
 * - それ以外の、同じ都市どうしでない全区間の、出発日の前日・当日・翌日：otherCount 便ずつ。
 * すでにある便と同じ番号の便は作らない。
 */
export function generateRoundFlights(options: {
  seed: string;
  requirements: TripRequirements;
  airports: Airport[];
  airlineIds: string[];
  existingIds: string[];
  correctCount: number;
  otherCount: number;
}): { flights: Flight[]; offers: FlightOffers[] } {
  const { seed, requirements, airports, airlineIds, correctCount, otherCount } = options;
  const used = new Set(options.existingIds);
  const generated: GeneratedFlight[] = [];

  for (const origin of airports) {
    for (const destination of airports) {
      if (cityOf(origin) === cityOf(destination)) continue;
      for (const days of [-1, 0, 1]) {
        const date = shiftDate(requirements.departureDate, days);
        const correct =
          days === 0 &&
          origin.code === requirements.originCode &&
          destination.code === requirements.destinationCode;
        generated.push(
          ...generateRouteFlights({
            seed,
            from: origin.code,
            to: destination.code,
            date,
            count: correct ? correctCount : otherCount,
            airports,
            airlineIds,
            requirements: correct ? requirements : undefined,
          }),
        );
      }
    }
  }

  const flights: Flight[] = [];
  const offers: FlightOffers[] = [];
  for (const { flight, fareLevel, fareQuota } of generated) {
    if (used.has(flight.id)) continue;
    used.add(flight.id);
    flights.push(flight);
    offers.push(
      createFlightOffers(
        {
          flightId: flight.id,
          distanceKm: distanceKm(airports, flight.originCode, flight.destinationCode),
          fareLevel,
          fareQuota,
        },
        prototypeSettings.pricing,
      ),
    );
  }
  return { flights, offers };
}
