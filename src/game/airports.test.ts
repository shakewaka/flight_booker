import { describe, expect, it } from 'vitest';
import { airportName, distanceKm, flightDurationMinutes } from './airports';
import type { Airport, Flight } from './types';

const airports: Airport[] = [
  {
    code: 'HND',
    name: '東京（羽田）',
    utcOffsetMinutes: 540,
    latitude: 35.5494,
    longitude: 139.7798,
  },
  {
    code: 'TSA',
    name: '台北（松山）',
    utcOffsetMinutes: 480,
    latitude: 25.0694,
    longitude: 121.5519,
  },
  {
    code: 'TPE',
    name: '台北（桃園）',
    utcOffsetMinutes: 480,
    latitude: 25.0777,
    longitude: 121.2328,
  },
];

const flight: Flight = {
  id: 'f',
  sellingAirlineId: 'A',
  operatingAirlineId: 'A',
  originCode: 'HND',
  destinationCode: 'TSA',
  departureDate: '2027-05-18',
  departureTime: '08:10',
  arrivalTime: '10:45',
  arrivalTerminal: 1,
  stops: 0,
  checkedBaggageKg: 20,
  seats: 6,
};

describe('distanceKm', () => {
  it('羽田と台北（松山）の距離は、およそ2,100kmになる', () => {
    const km = distanceKm(airports, 'HND', 'TSA');
    expect(km).toBeGreaterThan(2_050);
    expect(km).toBeLessThan(2_150);
  });

  it('行きと帰りで同じ距離になり、同じ空港同士は0kmになる', () => {
    expect(distanceKm(airports, 'TSA', 'HND')).toBeCloseTo(distanceKm(airports, 'HND', 'TSA'), 6);
    expect(distanceKm(airports, 'HND', 'HND')).toBe(0);
  });

  it('同じ都市の別の空港は、距離が少し違う', () => {
    const songshan = distanceKm(airports, 'HND', 'TSA');
    const taoyuan = distanceKm(airports, 'HND', 'TPE');
    expect(taoyuan).toBeGreaterThan(songshan);
    expect(taoyuan - songshan).toBeLessThan(50);
  });

  it('一覧にない空港を指定すると、エラーにする', () => {
    expect(() => distanceKm(airports, 'HND', 'XXX')).toThrow();
  });
});

describe('flightDurationMinutes', () => {
  it('現地時間の差から時差を引いて、所要時間を求める', () => {
    // 東京 08:10 発 → 台北 10:45 着。台北は東京より1時間遅いので、3時間35分。
    expect(flightDurationMinutes(airports, flight)).toBe(215);
  });

  it('時差のない空港同士は、現地時間の差がそのまま所要時間になる', () => {
    const domestic = { ...flight, destinationCode: 'TPE', originCode: 'TSA' };
    expect(flightDurationMinutes(airports, { ...domestic, arrivalTime: '09:00' })).toBe(50);
  });

  it('東行きは現地時刻が時差の分だけ進むため、時差を引いて求める', () => {
    // 台北 10:00 発 → 東京 09:30 着は、時差1時間を考えると -90分 になり、データの誤りと分かる。
    const reversed = { ...flight, originCode: 'TSA', destinationCode: 'HND' };
    expect(
      flightDurationMinutes(airports, {
        ...reversed,
        departureTime: '10:00',
        arrivalTime: '09:30',
      }),
    ).toBe(-90);
    expect(
      flightDurationMinutes(airports, {
        ...reversed,
        departureTime: '10:00',
        arrivalTime: '14:05',
      }),
    ).toBe(185);
  });
});

describe('airportName', () => {
  it('空港コードから表示名を返し、一覧にない場合はコードを返す', () => {
    expect(airportName(airports, 'TSA')).toBe('台北（松山）');
    expect(airportName(airports, 'XXX')).toBe('XXX');
  });
});
