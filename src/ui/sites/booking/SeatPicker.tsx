import { CABIN, cabinRows, SEAT_POSITION_LABEL, seatPosition } from '../../../game/seatMap';
import './seat-picker.css';

type SeatPickerProps = {
  /** 参加者が買える席（一般の乗客が予約済みの席は含まない）。 */
  openSeats: string[];
  /** 今、誰も確保・購入していない席。 */
  freeSeats: string[];
  /** 選んでいる席。おまかせなら 'auto'、まだ選んでいなければ null。 */
  selected: string | null;
  onSelect: (seat: string) => void;
};

/**
 * 座席表。空いている席だけを押せる。他の参加者が確保・購入すると、その場で埋まった表示に変わる。
 * 横向きのタブレットに合わせて、左を機首側にし、列（21〜30）を横に、A〜F を縦に並べる。
 * C と D の間が通路。
 */
export function SeatPicker({ openSeats, freeSeats, selected, onSelect }: SeatPickerProps) {
  const open = new Set(openSeats);
  const free = new Set(freeSeats);
  const rows = cabinRows();

  return (
    <div className="seat-picker">
      <div
        className="seat-picker__cabin"
        style={{ gridTemplateColumns: `auto repeat(${rows.length}, var(--seat-size))` }}
        aria-label="座席表（左が前方）"
      >
        <span className="seat-picker__nose" aria-hidden="true">
          前方
        </span>
        {rows.map((row) => (
          <span key={row} className="seat-picker__row-number" aria-hidden="true">
            {row}
          </span>
        ))}
        {CABIN.letters.map((letter) => [
          letter === 'D' && (
            <span key="aisle" className="seat-picker__aisle" aria-hidden="true">
              通路
            </span>
          ),
          <span key={`label-${letter}`} className="seat-picker__letter" aria-hidden="true">
            {letter}
          </span>,
          ...rows.map((row) => {
            const seat = `${row}${letter}`;
            const available = free.has(seat);
            const state = !open.has(seat) ? 'occupied' : available ? 'free' : 'taken';
            return (
              <button
                key={seat}
                type="button"
                className={[
                  'seat-picker__seat',
                  `seat-picker__seat--${state}`,
                  seat === selected ? 'seat-picker__seat--selected' : '',
                ].join(' ')}
                disabled={!available}
                aria-pressed={seat === selected}
                aria-label={`${seat}（${SEAT_POSITION_LABEL[seatPosition(seat)]}）${available ? '' : ' 予約済み'}`}
                title={`${seat}（${SEAT_POSITION_LABEL[seatPosition(seat)]}）`}
                onClick={() => onSelect(seat)}
              />
            );
          }),
        ])}
      </div>
      <ul className="seat-picker__legend" aria-hidden="true">
        <li>
          <span className="seat-picker__seat seat-picker__seat--free" />
          空席
        </li>
        <li>
          <span className="seat-picker__seat seat-picker__seat--free seat-picker__seat--selected" />
          選択中
        </li>
        <li>
          <span className="seat-picker__seat seat-picker__seat--occupied" />
          予約済み
        </li>
        <li>A・F 窓側 ／ B・E 真ん中 ／ C・D 通路側</li>
      </ul>
    </div>
  );
}
