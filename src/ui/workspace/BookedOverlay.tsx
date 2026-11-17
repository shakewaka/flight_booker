import { airportName } from '../../game/airports';
import type { BookingEntry } from '../../game/booking';
import { formatJapaneseDate } from '../../game/dates';
import type { Purchase } from '../../game/market';
import type { RoundScenario } from '../../game/types';
import { formatRemaining, formatYen } from '../format';
import { SITE_INFO } from '../sites/siteInfo';
import './booked-overlay.css';

type BookedOverlayProps = {
  scenario: RoundScenario;
  purchase: Purchase;
  entry: BookingEntry | undefined;
  remainingMs: number;
};

/** 予約タイムを「1分23.45秒」の形にする。計測はミリ秒、表示は小数第2位まで。 */
function formatBookingTime(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  const seconds = ((ms % 60_000) / 1000).toFixed(2);
  return minutes > 0 ? `${minutes}分${seconds}秒` : `${seconds}秒`;
}

/**
 * 予約が成功した人の終了画面（企画書「10 プレイヤーごとの予約終了画面」）。
 * 全体を半透明のグレーで覆い、中央にチケット、画面全体の右下に購入金額を大きく出す。
 * この時点では、入力ミスや条件違反の有無は表示しない。
 */
export function BookedOverlay({ scenario, purchase, entry, remainingMs }: BookedOverlayProps) {
  const flight = scenario.flights.find((candidate) => candidate.id === purchase.flightId);
  const cityOf = (code: string) => airportName(scenario.airports, code);
  const passengerName = entry
    ? `${entry.passenger.surname} ${entry.passenger.givenName}`.trim()
    : '';

  return (
    <div className="booked" role="status">
      <article className="ticket" aria-label="予約したチケット">
        <header className="ticket__head">
          <span>E-TICKET</span>
          <span>{SITE_INFO[purchase.site].name}で予約</span>
        </header>
        {flight && (
          <div className="ticket__body">
            <div className="ticket__place">
              <span className="ticket__code">{flight.originCode}</span>
              <span>{cityOf(flight.originCode)}</span>
              <span className="ticket__time">{flight.departureTime} 発</span>
            </div>
            <span className="ticket__plane" aria-hidden="true">
              ✈
            </span>
            <div className="ticket__place">
              <span className="ticket__code">{flight.destinationCode}</span>
              <span>{cityOf(flight.destinationCode)}</span>
              <span className="ticket__time">{flight.arrivalTime} 着（現地時間）</span>
            </div>
          </div>
        )}
        <dl className="ticket__details">
          <div>
            <dt>搭乗者</dt>
            <dd>{passengerName || '—'}</dd>
          </div>
          <div>
            <dt>搭乗日</dt>
            <dd>{flight ? formatJapaneseDate(flight.departureDate) : '—'}</dd>
          </div>
          <div>
            <dt>予約タイム</dt>
            <dd>{formatBookingTime(purchase.bookingTimeMs)}</dd>
          </div>
        </dl>
      </article>
      <p className="booked__wait">
        予約が完了しました。ほかの参加者は締切までプレイを続けます（残り{' '}
        {formatRemaining(remainingMs)}）。
      </p>
      <p className="booked__price" aria-label={`購入金額 ${formatYen(purchase.price)}`}>
        <span>購入金額</span>
        {formatYen(purchase.price)}
      </p>
    </div>
  );
}
