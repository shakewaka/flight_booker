import { describe, expect, it } from 'vitest';
import {
  describeRequirements,
  findBookingViolations,
  findTripViolations,
  seatMeetsRequirements,
} from './requirements';
import { sampleRound } from '../data/sampleRound';
import type { Flight, TripRequirements } from './types';

const requirements: TripRequirements = {
  originCode: 'HND',
  destinationCode: 'TSA',
  departureDate: '2027-05-18',
  departAfter: '08:00',
  arriveBy: '17:00',
  checkedBaggageKg: 20,
  excludedOperatingAirlineIds: ['C'],
  arrivalTerminal: 1,
};

const validFlight: Flight = {
  id: 'valid',
  sellingAirlineId: 'A',
  operatingAirlineId: 'A',
  originCode: 'HND',
  destinationCode: 'TSA',
  departureDate: '2027-05-18',
  departureTime: '08:10',
  arrivalDate: '2027-05-18',
  arrivalTime: '12:30',
  arrivalTerminal: 1,
  stops: 0,
  checkedBaggageKg: 20,
  seats: 6,
};

describe('乗継・所要時間・予算の条件', () => {
  const { airports } = sampleRound;
  // 08:10発 12:30着（時差1時間）なので、所要時間は5時間20分。
  const connecting: Flight = { ...validFlight, stops: 1, via: ['GMP'] };

  it('直行便のみの条件では、乗継便は違反になる', () => {
    const nonstop = { ...requirements, nonstopOnly: true };
    expect(findTripViolations(validFlight, nonstop)).toEqual([]);
    expect(findTripViolations(connecting, nonstop)).toEqual(['stops']);
  });

  it('乗継の空港の条件では、ほかの空港での乗継は違反、直行便と指定の空港での乗継はよい', () => {
    const viaGmp = { ...requirements, allowedViaCodes: ['GMP'] };
    const viaHkg = { ...requirements, allowedViaCodes: ['HKG'] };
    expect(findTripViolations(validFlight, viaHkg)).toEqual([]);
    expect(findTripViolations(connecting, viaGmp)).toEqual([]);
    expect(findTripViolations(connecting, viaHkg)).toEqual(['via']);
  });

  it('所要時間の上限ちょうどは条件を満たし、1分でも超えると違反になる', () => {
    expect(
      findTripViolations(validFlight, { ...requirements, maxDurationMinutes: 320 }, airports),
    ).toEqual([]);
    expect(
      findTripViolations(validFlight, { ...requirements, maxDurationMinutes: 319 }, airports),
    ).toEqual(['duration']);
  });

  it('所要時間の条件があるのに空港の一覧を渡さないと、エラーにする（判定を飛ばさない）', () => {
    expect(() =>
      findTripViolations(validFlight, { ...requirements, maxDurationMinutes: 300 }),
    ).toThrow();
  });

  it('予算ちょうどは条件を満たし、1円でも超えると違反になる。金額が分からなければ調べない', () => {
    const budget = { ...requirements, maxBudget: 30_000 };
    expect(findBookingViolations(validFlight, { price: 30_000 }, budget)).toEqual([]);
    expect(findBookingViolations(validFlight, { price: 30_001 }, budget)).toEqual(['budget']);
    expect(findBookingViolations(validFlight, {}, budget)).toEqual([]);
  });

  it('条件メモに、予算・直行便・乗継の空港・所要時間を書く', () => {
    const memo = describeRequirements(
      {
        ...requirements,
        maxBudget: 28_000,
        nonstopOnly: true,
        allowedViaCodes: ['GMP'],
        maxDurationMinutes: 330,
      },
      airports,
      [],
    );
    expect(memo.conditions.slice(0, 4)).toEqual([
      '予算は¥28,000まで',
      '直行便のみ',
      '乗継はソウル（金浦）経由のみ',
      '所要時間は5時間30分以内',
    ]);
  });
});

describe('席の条件', () => {
  const withSeat = (seatPositions: TripRequirements['seatPositions']) => ({
    ...requirements,
    seatPositions,
  });

  it('席の条件がなければ、どの席でもよい', () => {
    expect(seatMeetsRequirements('25B', requirements)).toBe(true);
  });

  it('窓側の条件なら、A・F は満たし、B・C は満たさない', () => {
    const window = withSeat(['window']);
    expect(['21A', '30F'].map((s) => seatMeetsRequirements(s, window))).toEqual([true, true]);
    expect(['21B', '21C'].map((s) => seatMeetsRequirements(s, window))).toEqual([false, false]);
  });

  it('便の違反に、席の違反を足す。席が分からなければ、便だけで判定する', () => {
    const aisle = withSeat(['aisle']);
    expect(findBookingViolations(validFlight, { seatId: '22C' }, aisle)).toEqual([]);
    expect(findBookingViolations(validFlight, { seatId: '22A' }, aisle)).toEqual(['seat']);
    expect(findBookingViolations(validFlight, {}, aisle)).toEqual([]);
    expect(
      findBookingViolations({ ...validFlight, arrivalTerminal: 2 }, { seatId: '22A' }, aisle),
    ).toEqual(['arrivalTerminal', 'seat']);
  });

  it('便の判定（findTripViolations）では、席の条件を調べない', () => {
    expect(findTripViolations(validFlight, withSeat(['window']))).toEqual([]);
  });

  it('条件メモには、席の条件を座席表の並びの順で書く', () => {
    const memo = (seatPositions: TripRequirements['seatPositions']) =>
      describeRequirements(withSeat(seatPositions), [], []).conditions.at(-1);
    expect(memo(['window'])).toBe('座席は窓側');
    expect(memo(['aisle', 'window'])).toBe('座席は窓側か通路側');
  });
});

describe('findTripViolations', () => {
  it('すべての条件を満たす便は、違反なし', () => {
    expect(findTripViolations(validFlight, requirements)).toEqual([]);
  });

  it('指定の時刻ちょうどの出発は条件を満たし、1分早いと出発時刻の違反になる', () => {
    expect(findTripViolations({ ...validFlight, departureTime: '08:00' }, requirements)).toEqual(
      [],
    );
    expect(findTripViolations({ ...validFlight, departureTime: '07:59' }, requirements)).toEqual([
      'departureTime',
    ]);
  });

  it('到着期限ちょうどの到着は、条件を満たす', () => {
    expect(findTripViolations({ ...validFlight, arrivalTime: '17:00' }, requirements)).toEqual([]);
  });

  it('到着期限を1分過ぎると、到着時刻の違反になる', () => {
    expect(findTripViolations({ ...validFlight, arrivalTime: '17:01' }, requirements)).toEqual([
      'arrivalTime',
    ]);
  });

  it('翌日に着く便は、到着の時刻が期限より早くても到着時刻の違反になる', () => {
    const overnight = { ...validFlight, arrivalDate: '2027-05-19', arrivalTime: '08:00' };
    expect(findTripViolations(overnight, requirements)).toEqual(['arrivalTime']);
  });

  it('販売する会社が不可の会社でも、運航する会社が別なら違反にしない', () => {
    const flight = { ...validFlight, sellingAirlineId: 'C', operatingAirlineId: 'A' };
    expect(findTripViolations(flight, requirements)).toEqual([]);
  });

  it('販売する会社が別でも、運航する会社が不可の会社なら違反になる', () => {
    const flight = { ...validFlight, sellingAirlineId: 'B', operatingAirlineId: 'C' };
    expect(findTripViolations(flight, requirements)).toEqual(['operatingAirline']);
  });

  it('手荷物が必要な重さより少ないと違反、多い分には違反にしない', () => {
    expect(findTripViolations({ ...validFlight, checkedBaggageKg: 0 }, requirements)).toEqual([
      'checkedBaggage',
    ]);
    expect(findTripViolations({ ...validFlight, checkedBaggageKg: 30 }, requirements)).toEqual([]);
  });

  it('複数の条件に合わない便は、違反をすべて別々に返す', () => {
    const flight = {
      ...validFlight,
      departureDate: '2027-05-19',
      operatingAirlineId: 'C',
      arrivalTerminal: 2,
    };
    expect(findTripViolations(flight, requirements)).toEqual([
      'departureDate',
      'operatingAirline',
      'arrivalTerminal',
    ]);
  });

  it('出発時刻・到着期限・ターミナルを指定しないラウンドでは、その項目を判定しない', () => {
    const loose: TripRequirements = {
      ...requirements,
      departAfter: undefined,
      arriveBy: undefined,
      arrivalTerminal: undefined,
    };
    const flight = {
      ...validFlight,
      departureTime: '00:10',
      arrivalTime: '23:50',
      arrivalTerminal: 3,
    };
    expect(findTripViolations(flight, loose)).toEqual([]);
  });
});

describe('describeRequirements', () => {
  const airports = [
    { code: 'HND', name: '東京（羽田）', utcOffsetMinutes: 540, latitude: 35.5, longitude: 139.8 },
    { code: 'TSA', name: '台北（松山）', utcOffsetMinutes: 480, latitude: 25.1, longitude: 121.6 },
  ];
  const airlines = [{ id: 'C', name: '航空会社C' }];

  it('判定に使う条件を、すべてメモに載せる', () => {
    expect(describeRequirements(requirements, airports, airlines)).toEqual({
      origin: '東京（羽田）',
      destination: '台北（松山）',
      departure: { date: '2027年5月18日', after: '08:00' },
      arrivalDeadline: { date: '2027年5月18日', time: '17:00' },
      conditions: ['受託手荷物 20kg が必要', '運航が航空会社Cの便は不可', '到着はターミナル1'],
    });
  });

  it('指定していない条件は、メモに書かない', () => {
    const loose: TripRequirements = {
      originCode: 'HND',
      destinationCode: 'TSA',
      departureDate: '2027-11-03',
      checkedBaggageKg: 0,
      excludedOperatingAirlineIds: [],
    };
    const memo = describeRequirements(loose, airports, airlines);
    expect(memo.departure).toEqual({ date: '2027年11月3日', after: null });
    expect(memo.arrivalDeadline).toBeNull();
    expect(memo.conditions).toEqual([]);
  });
});
