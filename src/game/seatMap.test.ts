import { describe, expect, it } from 'vitest';
import { matchRounds } from '../data/rounds';
import { cabinSeats, openSeatsOf, seatPosition } from './seatMap';

describe('seatPosition', () => {
  it('A・F は窓側、C・D は通路側、B・E は真ん中', () => {
    expect(['21A', '30F'].map(seatPosition)).toEqual(['window', 'window']);
    expect(['22C', '22D'].map(seatPosition)).toEqual(['aisle', 'aisle']);
    expect(['25B', '25E'].map(seatPosition)).toEqual(['middle', 'middle']);
  });
});

describe('openSeatsOf', () => {
  it('便の座席数だけ、座席表の中から重ならずに選ぶ', () => {
    const seats = openSeatsOf({ id: 'X', seats: 8 });
    expect(seats).toHaveLength(8);
    expect(new Set(seats).size).toBe(8);
    for (const seat of seats) expect(cabinSeats()).toContain(seat);
  });

  it('同じ便なら毎回同じ席になり、便が違えば変わる', () => {
    expect(openSeatsOf({ id: 'X', seats: 8 })).toEqual(openSeatsOf({ id: 'X', seats: 8 }));
    expect(openSeatsOf({ id: 'X', seats: 8 })).not.toEqual(openSeatsOf({ id: 'Y', seats: 8 }));
  });

  it('窓側・通路側・真ん中に偏らずに空席を作る', () => {
    for (const round of matchRounds) {
      for (const flight of round.flights) {
        const count = (position: string) =>
          openSeatsOf(flight).filter((seat) => seatPosition(seat) === position).length;
        const third = Math.floor(flight.seats / 3);
        expect(count('window')).toBeGreaterThanOrEqual(third);
        expect(count('aisle')).toBeGreaterThanOrEqual(third);
        expect(count('middle')).toBeGreaterThanOrEqual(third);
      }
    }
  });
});
