import { describe, expect, it } from 'vitest';
import { describeRequirements, findTripViolations } from './requirements';
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
