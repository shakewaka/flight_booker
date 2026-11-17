import { useState } from 'react';
import { airportName, flightDurationMinutes } from '../../../game/airports';
import type { SearchResult } from '../../../game/search';
import type { RoundScenario, SiteId } from '../../../game/types';
import { formatYen } from '../../format';

type FlightCardProps = {
  result: SearchResult;
  scenario: RoundScenario;
};

/** 予約サイトの名前と特徴。サイト名は企画書の仮称。 */
const SITES: { id: SiteId; name: string; feature: string }[] = [
  { id: 'site1', name: '予約サイト1', feature: '最安。予約が確定するまで席を確保しない' },
  { id: 'site2', name: '予約サイト2', feature: '手続きの途中で席と価格を確保する' },
  { id: 'site3', name: '予約サイト3', feature: '閲覧人数で価格が変わる。確定した瞬間の価格になる' },
];

/** 検索結果の1件。検索で絞り込めない条件も、ここで確認できるようにする。 */
export function FlightCard({ result, scenario }: FlightCardProps) {
  const [showPrices, setShowPrices] = useState(false);
  const { flight, offers } = result;

  const cityOf = (code: string) => airportName(scenario.airports, code);
  const duration = flightDurationMinutes(scenario.airports, flight);
  const airlineOf = (id: string) => scenario.airlines.find((a) => a.id === id)?.name ?? id;
  const priceText: Record<SiteId, string> = {
    site1: formatYen(offers.site1.price),
    site2: formatYen(offers.site2.price),
    site3: `${formatYen(offers.site3.minPrice)}〜${formatYen(offers.site3.maxPrice)}`,
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
          {formatYen(result.lowestPrice)}
          <span>〜</span>
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
                <td className="flight-card__site-price">{priceText[site.id]}</td>
                <td className="flight-card__site-feature">{site.feature}</td>
                <td>
                  <button type="button" disabled title="予約サイトは次の作業で追加する">
                    予約へ進む（準備中）
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
