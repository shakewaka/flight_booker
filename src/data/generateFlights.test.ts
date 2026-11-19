import { describe, expect, it } from 'vitest';
import { flightDurationMinutes } from '../game/airports';
import { createMarket, findFlight, purchase } from '../game/market';
import { findTripViolations } from '../game/requirements';
import { createRoundTimer } from '../game/roundClock';
import { searchFlights, type SearchQuery } from '../game/search';
import { AIRLINES, AIRPORTS } from './buildRound';
import {
  ensureSearchResults,
  generateRouteFlights,
  shiftDate,
  shiftMonths,
} from './generateFlights';
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

describe('shiftDate・shiftMonths', () => {
  it('月末から1か月ずらすと、ない日は翌月に繰り越す', () => {
    expect(shiftMonths('2027-05-18', -12)).toBe('2026-05-18');
    expect(shiftMonths('2027-01-31', 1)).toBe('2027-03-03');
  });

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
  // 便が多く、市場を作るのに時間がかかるので、ラウンドごとに1回だけ作る（検索では市場を変えない）。
  const markets = new Map<number, ReturnType<typeof createMarket>>();
  const marketOf = (index: number) => {
    const cached = markets.get(index);
    if (cached) return cached;
    const market = createMarket(matchRounds[index], timer);
    markets.set(index, market);
    return market;
  };
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
    // 画面と同じく、検索の前に、候補が0件なら便を足す。
    return searchFlights(scenario, query, ensureSearchResults(scenario, marketOf(index), query));
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

  it.each([-7, -3, -2, 2, 3, 7])('出発日を%i日ずらして検索しても、候補が出る', (days) => {
    const date = shiftDate(matchRounds[0].requirements.departureDate, days);
    expect(search(0, { departureDate: date, arrivalDate: date }).length).toBeGreaterThan(0);
  });

  it.each([-12, -1, 1, 12])(
    '出発日を%iか月ずらして（月や年の打ち間違い）検索しても、候補が出る',
    (months) => {
      const date = shiftMonths(matchRounds[0].requirements.departureDate, months);
      expect(search(0, { departureDate: date, arrivalDate: date }).length).toBeGreaterThan(0);
    },
  );

  it('到着日に出発日の翌日を入れても、正しい検索と同じ候補が出る', () => {
    const r = matchRounds[0].requirements;
    expect(search(0, { arrivalDate: shiftDate(r.departureDate, 1) }).length).toBe(
      search(0, {}).length,
    );
  });
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

describe('ensureSearchResults（どう検索しても候補が出る）', () => {
  const scenario = matchRounds[0];
  const timer = createRoundTimer(0, { startCountdownMs: 0, roundTimeLimitMs: 300_000 });
  const market = createMarket(scenario, timer);
  const base: SearchQuery = {
    originCode: 'HKG',
    destinationCode: 'GMP',
    departureDate: '2031-12-24',
    arrivalDate: '2031-12-24',
    nonstopOnly: false,
    checkedBaggageKg: 0,
  };

  it('正しい検索では、便を足さない（出題の便のまま）', () => {
    const r = scenario.requirements;
    const query = {
      ...base,
      originCode: r.originCode,
      destinationCode: r.destinationCode,
      departureDate: r.departureDate,
      arrivalDate: r.departureDate,
    };
    expect(ensureSearchResults(scenario, market, query)).toBe(market);
  });

  it.each([
    ['遠い日付', {}],
    ['同じ都市どうし', { originCode: 'HND', destinationCode: 'NRT' }],
    ['手荷物23kg・直行便のみ', { checkedBaggageKg: 23, nonstopOnly: true }],
    ['到着日が翌日', { arrivalDate: '2031-12-25' }],
  ] as const)('%s の検索でも、候補が出て、検索条件に合う', (_, change) => {
    const query = { ...base, ...change };
    const results = searchFlights(scenario, query, ensureSearchResults(scenario, market, query));
    expect(results.length).toBeGreaterThan(0);
    for (const { flight } of results) {
      expect(flight.checkedBaggageKg).toBeGreaterThanOrEqual(query.checkedBaggageKg);
      if (query.nonstopOnly) expect(flight.stops).toBe(0);
      expect(flight.arrivalDate <= query.arrivalDate).toBe(true);
    }
  });

  it('同じ検索をくり返しても、同じ便が二重に足されない', () => {
    const once = ensureSearchResults(scenario, market, base);
    expect(ensureSearchResults(scenario, once, base)).toBe(once);
    expect(once.extraFlights.length).toBe(3);
  });

  it('足した便も、出題の便と同じように買え、正しい条件と違うので旅行不成立として判定できる', () => {
    const added = ensureSearchResults(scenario, market, base);
    const flightId = added.extraFlights[0].id;
    const bought = purchase(added, {
      participantId: 'p',
      site: 'site3',
      flightId,
      procedureId: 'p',
      now: timer.startAt,
    });
    expect(bought.ok).toBe(true);
    const flight = findFlight(scenario, added, flightId);
    expect(
      flight && findTripViolations(flight, scenario.requirements, scenario.airports),
    ).toContain('origin');
  });

  it('空港の一覧にない空港や、到着日が出発日より前の検索では、何も足さない', () => {
    expect(ensureSearchResults(scenario, market, { ...base, originCode: 'XXX' })).toBe(market);
    expect(ensureSearchResults(scenario, market, { ...base, arrivalDate: '2031-12-23' })).toBe(
      market,
    );
  });
});
