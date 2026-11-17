import { describe, expect, it } from 'vitest';
import { describeRequirements, findTripViolations } from './requirements';
import type { Flight, TripRequirements } from './types';

const requirements: TripRequirements = {
  originCode: 'HNU',
  destinationCode: 'HSO',
  departureDate: '2027-05-18',
  arriveBy: '17:00',
  checkedBaggageKg: 20,
  excludedOperatingAirlineIds: ['C'],
  arrivalTerminal: 1,
};

const validFlight: Flight = {
  id: 'valid',
  sellingAirlineId: 'A',
  operatingAirlineId: 'A',
  originCode: 'HNU',
  destinationCode: 'HSO',
  departureDate: '2027-05-18',
  departureTime: '08:10',
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

  it('到着期限ちょうどの到着は、条件を満たす', () => {
    expect(findTripViolations({ ...validFlight, arrivalTime: '17:00' }, requirements)).toEqual([]);
  });

  it('到着期限を1分過ぎると、到着時刻の違反になる', () => {
    expect(findTripViolations({ ...validFlight, arrivalTime: '17:01' }, requirements)).toEqual([
      'arrivalTime',
    ]);
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

  it('到着期限とターミナルを指定しないラウンドでは、その項目を判定しない', () => {
    const loose: TripRequirements = {
      ...requirements,
      arriveBy: undefined,
      arrivalTerminal: undefined,
    };
    const flight = { ...validFlight, arrivalTime: '23:50', arrivalTerminal: 3 };
    expect(findTripViolations(flight, loose)).toEqual([]);
  });
});

describe('describeRequirements', () => {
  const airports = [
    { code: 'HNU', city: '羽之浦' },
    { code: 'HSO', city: '星汐' },
  ];
  const airlines = [{ id: 'C', name: '航空会社C' }];

  it('判定に使う条件を、すべてメモに載せる', () => {
    expect(describeRequirements(requirements, airports, airlines)).toEqual({
      route: '羽之浦 → 星汐',
      conditions: [
        '5月18日に出発',
        '17:00までに到着',
        '受託手荷物 20kg が必要',
        '運航が航空会社Cの便は不可',
        '到着はターミナル1',
      ],
    });
  });

  it('指定していない条件は、メモに書かない', () => {
    const loose: TripRequirements = {
      originCode: 'HNU',
      destinationCode: 'HSO',
      departureDate: '2027-11-03',
      checkedBaggageKg: 0,
      excludedOperatingAirlineIds: [],
    };
    expect(describeRequirements(loose, airports, airlines).conditions).toEqual(['11月3日に出発']);
  });
});
