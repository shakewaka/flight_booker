import { unitFromString } from './random';
import type { Flight, SeatPosition } from './types';

// 座席表（企画書「7 予約サイトの3種類」の座席番号の選択）。ReactやDOMに依存しない。
// 仮案：どの便も、エコノミー席の一区画（21〜30列、A〜F、通路をはさんで3席ずつ）を見せる。
// 参加者が買える席は、そのうち便の座席数（Flight.seats）だけで、残りは一般の乗客が予約済み。
// どの席が空いているかは、便の番号から決まる（毎回同じ）。

export const CABIN = {
  firstRow: 21,
  rowCount: 10,
  /** 左から順の席の記号。C と D の間が通路。 */
  letters: ['A', 'B', 'C', 'D', 'E', 'F'],
} as const;

const POSITION_BY_LETTER: Record<string, SeatPosition> = {
  A: 'window',
  B: 'middle',
  C: 'aisle',
  D: 'aisle',
  E: 'middle',
  F: 'window',
};

export const SEAT_POSITION_LABEL: Record<SeatPosition, string> = {
  window: '窓側',
  middle: '真ん中',
  aisle: '通路側',
};

/** 座席番号（例：23A）の、窓側・真ん中・通路側。 */
export function seatPosition(seatId: string): SeatPosition {
  return POSITION_BY_LETTER[seatId.at(-1) ?? ''] ?? 'middle';
}

/** 座席表の列番号の一覧。 */
export function cabinRows(): number[] {
  return Array.from({ length: CABIN.rowCount }, (_, index) => CABIN.firstRow + index);
}

/** 座席表のすべての席。前の列から、A〜F の順。 */
export function cabinSeats(): string[] {
  return cabinRows().flatMap((row) => CABIN.letters.map((letter) => `${row}${letter}`));
}

/** 便の番号と目的から決まる順に並べ替える。 */
function shuffled(seats: string[], key: string): string[] {
  // 並べ替えの比較のたびに計算し直さないよう、席ごとの数を先に1回だけ求める。
  const order = new Map(seats.map((seat) => [seat, unitFromString(`${key}|${seat}`)]));
  return [...seats].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
}

/**
 * 参加者が買える席（空席）。便の座席数だけ、窓側→通路側→真ん中の順にくり返して選ぶ。
 * 偏らないようにして、どの位置の席にも空きがあるようにする。返す順は、おまかせで割り当てる順。
 */
export function openSeatsOf(flight: Pick<Flight, 'id' | 'seats'>): string[] {
  const byPosition: Record<SeatPosition, string[]> = {
    window: [],
    aisle: [],
    middle: [],
  };
  for (const seat of shuffled(cabinSeats(), `${flight.id}|open`)) {
    byPosition[seatPosition(seat)].push(seat);
  }
  const order: SeatPosition[] = ['window', 'aisle', 'middle'];
  const chosen: string[] = [];
  for (let i = 0; chosen.length < Math.min(flight.seats, cabinSeats().length); i += 1) {
    const seat = byPosition[order[i % order.length]].shift();
    if (seat) chosen.push(seat);
  }
  return shuffled(chosen, `${flight.id}|auto`);
}
