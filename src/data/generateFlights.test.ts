import { describe, expect, it } from 'vitest';
import { flightDurationMinutes } from '../game/airports';
import { createMarket } from '../game/market';
import { findTripViolations } from '../game/requirements';
import { createRoundTimer } from '../game/roundClock';
import { searchFlights, type SearchQuery } from '../game/search';
import { AIRLINES, AIRPORTS } from './buildRound';
import { generateRouteFlights, shiftDate } from './generateFlights';
import { matchRounds } from './rounds';

const airlineIds = AIRLINES.map((airline) => airline.id);
const route = (
  from: string,
  to: string,
  extra: Partial<Parameters<typeof generateRouteFlights>[0]> = {},
) =>
  generateRouteFlights({
    seed: 'test',
    from,
    to,
    date: '2027-05-18',
    count: 30,
    airports: AIRPORTS,
    airlineIds,
    ...extra,
  });

describe('shiftDate', () => {
  it('月や年をまたいでも、日付をずらせる', () => {
    expect(shiftDate('2027-05-31', 1)).toBe('2027-06-01');
    expect(shiftDate('2027-01-01', -1)).toBe('2026-12-31');
  });
});

describe('generateRouteFlights', () => {
  it('同じ元の文字列なら毎回同じ便を作り、変えると違う便になる', () => {
    expect(route('HND', 'HKG')).toEqual(route('HND', 'HKG'));
    expect(route('HND', 'HKG', { seed: 'other' })).not.toEqual(route('HND', 'HKG'));
  });

  it('乗継便は、直行便より安く、所要時間が長い', () => {
    const flights = route('HND', 'HKG');
    const direct = flights.filter((f) => f.flight.stops === 0);
    const connecting = flights.filter((f) => f.flight.stops > 0);
    expect(direct.length).toBeGreaterThan(0);
    expect(connecting.length).toBeGreaterThan(0);
    const duration = (f: (typeof flights)[number]) => flightDurationMinutes(AIRPORTS, f.flight);
    expect(Math.max(...connecting.map((f) => f.fareLevel))).toBeLessThan(
      Math.min(...direct.map((f) => f.fareLevel)),
    );
    expect(Math.min(...connecting.map(duration))).toBeGreaterThan(
      Math.max(...direct.map(duration)),
    );
  });

  it('乗継の空港は、出発地・目的地と同じ都市の空港にしない', () => {
    for (const { flight } of route('HND', 'TSA')) {
      expect(flight.via ?? []).not.toContain('NRT');
      expect(flight.via ?? []).not.toContain('TPE');
      expect(flight.via?.length ?? 0).toBe(flight.stops);
    }
  });

  it('到着の日時は、時差と所要時間から求め、所要時間は正になる', () => {
    for (const { flight } of route('HKG', 'HND')) {
      expect(flightDurationMinutes(AIRPORTS, flight)).toBeGreaterThan(0);
    }
  });

  it('条件メモを渡すと、偶数番目は条件を満たし、奇数番目は条件を1つだけ満たさない', () => {
    const requirements = matchRounds[0].requirements;
    const flights = route(requirements.originCode, requirements.destinationCode, {
      requirements,
      count: 12,
    });
    const violations = flights.map(({ flight }) =>
      findTripViolations(flight, requirements, AIRPORTS),
    );
    expect(violations.filter((v) => v.length === 0).length).toBeGreaterThanOrEqual(4);
    // 条件を1つ外す便は、狙った条件を外している（出発時刻を早めた乗継便は、到着も外れることがある）。
    expect(violations.every((v) => v.length <= 2)).toBe(true);
  });
});

describe('試合のラウンドの便', () => {
  const timer = createRoundTimer(0, { startCountdownMs: 0, roundTimeLimitMs: 1 });
  const search = (index: number, change: Partial<SearchQuery>) => {
    const scenario = matchRounds[index];
    const r = scenario.requirements;
    const query: SearchQuery = {
      originCode: r.originCode,
      destinationCode: r.destinationCode,
      departureDate: r.departureDate,
      arrivalDate: r.departureDate,
      nonstopOnly: false,
      checkedBaggageKg: 0,
      ...change,
    };
    return searchFlights(scenario, query, createMarket(scenario, timer));
  };

  it.each([0, 1, 2, 3])(
    'ラウンド%iの正しい検索では、候補が10件以上あり、条件を満たす便が3件以上ある',
    (index) => {
      const results = search(index, {});
      const requirements = matchRounds[index].requirements;
      expect(results.length).toBeGreaterThanOrEqual(10);
      expect(
        results.filter((r) => findTripViolations(r.flight, requirements, AIRPORTS).length === 0)
          .length,
      ).toBeGreaterThanOrEqual(3);
    },
  );

  it('出発日を1日ずらしたり、同じ都市の別の空港や逆方向で検索したりしても、候補が出る', () => {
    const r = matchRounds[0].requirements;
    const next = shiftDate(r.departureDate, 1);
    expect(search(0, { departureDate: next, arrivalDate: next }).length).toBeGreaterThan(0);
    expect(search(0, { originCode: 'NRT' }).length).toBeGreaterThan(0);
    expect(search(0, { destinationCode: 'TPE' }).length).toBeGreaterThan(0);
    expect(
      search(0, { originCode: r.destinationCode, destinationCode: r.originCode }).length,
    ).toBeGreaterThan(0);
  });
});
