import { flightDurationMinutes } from './airports';
import { findTripViolations, seatMeetsRequirements } from './requirements';
import { cabinSeats, openSeatsOf } from './seatMap';
import type { RoundScenario } from './types';

/**
 * 出題データが、企画書の前提を満たしているかを調べる。問題点の説明を返し、空の配列なら問題なし。
 * データを手で書き換えたときに、サイト間の価格の関係や供給数が崩れるのを防ぐ。
 */
export function findScenarioProblems(scenario: RoundScenario, participantCount: number): string[] {
  const problems: string[] = [];
  const airportCodes = new Set(scenario.airports.map((airport) => airport.code));
  const airlineIds = new Set(scenario.airlines.map((airline) => airline.id));

  for (const flight of scenario.flights) {
    const offers = scenario.offers.filter((offer) => offer.flightId === flight.id);
    if (offers.length !== 1) {
      problems.push(`便 ${flight.id}：販売条件が${offers.length}件ある（1件にする）`);
    }
    if (!airportCodes.has(flight.originCode) || !airportCodes.has(flight.destinationCode)) {
      problems.push(`便 ${flight.id}：空港の一覧にない空港を使っている`);
    } else if (flightDurationMinutes(scenario.airports, flight) <= 0) {
      // 時差の考え違いや、到着日の書き間違いを見つける。
      problems.push(`便 ${flight.id}：時差を考えると、到着が出発より前になっている`);
    }
    if (!airlineIds.has(flight.sellingAirlineId) || !airlineIds.has(flight.operatingAirlineId)) {
      problems.push(`便 ${flight.id}：航空会社の一覧にない会社を使っている`);
    }
    const via = flight.via ?? [];
    if (via.length !== flight.stops) {
      problems.push(`便 ${flight.id}：乗継の回数と乗継の空港の数が合わない`);
    }
    if (via.some((code) => !airportCodes.has(code))) {
      problems.push(`便 ${flight.id}：乗継の空港が空港の一覧にない`);
    }
    if (flight.seats < 1) {
      problems.push(`便 ${flight.id}：座席がない`);
    }
    if (flight.seats > cabinSeats().length) {
      problems.push(
        `便 ${flight.id}：座席数が座席表の席の数（${cabinSeats().length}席）を超えている`,
      );
    }
  }

  for (const offer of scenario.offers) {
    const flight = scenario.flights.find((candidate) => candidate.id === offer.flightId);
    if (!flight) {
      problems.push(`販売条件 ${offer.flightId}：対応する便がない`);
      continue;
    }
    const { site1, site2, site3 } = offer;

    // サイト1は、同じ便では常に最安。サイト3の下限もサイト1より上に置く。
    if (site1.price >= site2.price) {
      problems.push(`便 ${flight.id}：サイト1がサイト2より安くない`);
    }
    if (site1.price >= site3.minPrice) {
      problems.push(`便 ${flight.id}：サイト3の下限がサイト1より高くない`);
    }
    if (site3.minPrice > site3.maxPrice) {
      problems.push(`便 ${flight.id}：サイト3の下限が上限を超えている`);
    }
    if (site3.raised.minPrice <= site3.minPrice || site3.raised.maxPrice <= site3.maxPrice) {
      problems.push(`便 ${flight.id}：サイト3の上の価格帯が下の価格帯より高くない`);
    }
    if (site1.fareQuota < 1 || site1.fareQuota > flight.seats) {
      problems.push(`便 ${flight.id}：サイト1の販売枠が1〜座席数の範囲にない`);
    }
    // ラウンド最高値は、条件を満たす便のどの価格よりも低くならない。
    if (
      findTripViolations(flight, scenario.requirements).length === 0 &&
      Math.max(site1.price, site2.price, site3.raised.maxPrice) > scenario.maxPrice
    ) {
      problems.push(`便 ${flight.id}：ラウンド最高値を超える価格がある`);
    }
  }

  // 条件を満たす便の、条件を満たす席は、全員が購入できる数を用意する。
  const validSeats = scenario.flights
    .filter((flight) => findTripViolations(flight, scenario.requirements).length === 0)
    .flatMap((flight) => openSeatsOf(flight))
    .filter((seat) => seatMeetsRequirements(seat, scenario.requirements)).length;
  if (validSeats < participantCount) {
    problems.push(`条件を満たす便の座席が${validSeats}席で、参加者${participantCount}人に足りない`);
  }

  return problems;
}
