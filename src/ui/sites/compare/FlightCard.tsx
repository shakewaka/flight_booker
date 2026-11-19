import { useState } from 'react';
import { airportName, flightDurationMinutes } from '../../../game/airports';
import type { SearchResult } from '../../../game/search';
import type { RoundScenario, SiteId } from '../../../game/types';
import { formatYen } from '../../format';
import { SITE_IDS, SITE_INFO } from '../siteInfo';

type FlightCardProps = {
  result: SearchResult;
  scenario: RoundScenario;
  /** 予約サイトを新しいタブで開く。 */
  onBook: (site: SiteId, flightId: string) => void;
};

const SITES = SITE_IDS.map((id) => ({ id, ...SITE_INFO[id] }));

/** 検索結果の1件。検索で絞り込めない条件も、ここで確認できるようにする。 */
export function FlightCard({ result, scenario, onBook }: FlightCardProps) {
  const [showPrices, setShowPrices] = useState(false);
  const { flight, quotes } = result;

  const cityOf = (code: string) => airportName(scenario.airports, code);
  const duration = flightDurationMinutes(scenario.airports, flight);
  const airlineOf = (id: string) => scenario.airlines.find((a) => a.id === id)?.name ?? id;
  // 検索した時点の価格。サイト3は閲覧人数で変わるので、その時点の価格に「変動」と添える。
  const priceText = (site: SiteId) => {
    const quote = quotes[site];
    if (!quote.available) return '売り切れ';
    return site === 'site3' ? `${formatYen(quote.price)}（変動）` : formatYen(quote.price);
  };

  return (
    <article className="flight-card">
      <div className="flight-card__main">
        <p className="flight-card__time">
          {flight.departureTime} {cityOf(flight.originCode)}
          <span className="flight-card__arrow" aria-hidden="true">
            →
          </span>
          <span className="visually-hidden">から</span>
          {flight.arrivalTime} {cityOf(flight.destinationCode)}
          <span className="flight-card__local">現地時間</span>
        </p>
        <p className="flight-card__summary">
          {airlineOf(flight.sellingAirlineId)} ／{' '}
          {flight.stops === 0 ? '直行便' : `乗継${flight.stops}回`} ／ 受託手荷物
          {flight.checkedBaggageKg > 0 ? `${flight.checkedBaggageKg}kg込み` : 'なし'}
        </p>
        <dl className="flight-card__details">
          <div>
            <dt>所要時間</dt>
            <dd>
              {Math.floor(duration / 60)}時間{duration % 60}分
            </dd>
          </div>
          <div>
            <dt>運航</dt>
            <dd>{airlineOf(flight.operatingAirlineId)}</dd>
          </div>
          <div>
            <dt>到着ターミナル</dt>
            <dd>{flight.arrivalTerminal}</dd>
          </div>
        </dl>
      </div>

      <div className="flight-card__side">
        <p className="flight-card__price">
          {result.lowestPrice === null ? (
            '満席'
          ) : (
            <>
              {formatYen(result.lowestPrice)}
              <span>〜</span>
            </>
          )}
        </p>
        <button
          type="button"
          className="flight-card__toggle"
          aria-expanded={showPrices}
          onClick={() => setShowPrices((shown) => !shown)}
        >
          {showPrices ? '価格を閉じる' : '予約サイト別の価格を見る'}
        </button>
      </div>

      {showPrices && (
        <table className="flight-card__prices">
          <caption className="visually-hidden">予約サイト別の価格</caption>
          <tbody>
            {SITES.map((site) => (
              <tr key={site.id}>
                <th scope="row">{site.name}</th>
                <td
                  className={
                    quotes[site.id].available
                      ? 'flight-card__site-price'
                      : 'flight-card__site-price flight-card__site-price--sold-out'
                  }
                >
                  {priceText(site.id)}
                </td>
                <td className="flight-card__site-feature">{site.feature}</td>
                <td>
                  <button type="button" onClick={() => onBook(site.id, flight.id)}>
                    予約へ進む
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </article>
  );
}
