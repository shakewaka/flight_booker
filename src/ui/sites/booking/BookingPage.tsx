import { useState, type FormEvent } from 'react';
import { airportName, flightDurationMinutes } from '../../../game/airports';
import {
  EMPTY_PASSENGER,
  EMPTY_PAYMENT,
  findBlankFields,
  type PassengerInput,
  type PaymentInput,
} from '../../../game/booking';
import { formatJapaneseDate } from '../../../game/dates';
import type { MarketRefusal } from '../../../game/market';
import type { RoundScenario, SiteId } from '../../../game/types';
import { formatYen } from '../../format';
import { useMarketSnapshot, type MarketStore } from '../../marketStore';
import { SITE_INFO } from '../siteInfo';
import './booking.css';

type BookingPageProps = {
  /** このページを開いているタブ。予約手続きの番号として使う。 */
  tabId: string;
  site: SiteId;
  flightId: string;
  scenario: RoundScenario;
  store: MarketStore;
  participantId: string;
  /** 比較サイトのタブへ移る。 */
  onBackToCompare: () => void;
};

type Step = 'review' | 'passenger' | 'payment';

const PASSENGER_FIELDS: { key: keyof PassengerInput; label: string; placeholder: string }[] = [
  { key: 'surname', label: '姓（ローマ字）', placeholder: '例：YAMADA' },
  { key: 'givenName', label: '名（ローマ字）', placeholder: '例：TARO' },
  { key: 'birthDate', label: '生年月日', placeholder: 'YYYY/MM/DD' },
  { key: 'nationality', label: '国籍', placeholder: '例：JAPAN' },
  { key: 'passportNumber', label: 'パスポート番号', placeholder: '例：TR1234567' },
  { key: 'passportExpiry', label: 'パスポートの有効期限', placeholder: 'YYYY/MM/DD' },
];

const PAYMENT_FIELDS: { key: keyof PaymentInput; label: string; placeholder: string }[] = [
  { key: 'holderName', label: 'カード名義', placeholder: '例：TARO YAMADA' },
  { key: 'cardNumber', label: 'カード番号', placeholder: '0000 0000 0000 0000' },
  { key: 'cardExpiry', label: '有効期限（月/年）', placeholder: 'MM/YY' },
  { key: 'securityCode', label: '確認コード', placeholder: '3桁' },
];

const REFUSAL_TEXT: Record<MarketRefusal, string> = {
  closed: '締切の時刻を過ぎたため、予約できません。',
  'already-purchased': 'このラウンドの予約は、すでに完了しています。',
  'unknown-flight': 'この便は見つかりませんでした。',
  'sold-out': 'この便は満席になりました。別の便を探してください。',
  'fare-sold-out': 'このチケットは売り切れました。この料金での販売は終了しています。',
  'no-hold': '席の確保が見つかりません。搭乗者情報の画面から手続きをやり直してください。',
};

/**
 * 予約サイトの手続き。便の確認 → 搭乗者情報 → 決済情報 → 確定 の順に進む。
 * - サイト1：確定するまで席を確保しない。確定の時点で売り切れなら買えない。
 * - サイト2：搭乗者情報の画面で「決済へ進む」を押した時点で、席と価格を確保する（企画書の仮案）。
 * - サイト3：確定ボタンを押した瞬間の価格で買う。
 * 入力の正誤は、その場では知らせない。空欄だけを止める（仮）。
 */
export function BookingPage({
  tabId,
  site,
  flightId,
  scenario,
  store,
  participantId,
  onBackToCompare,
}: BookingPageProps) {
  const { market, site3Viewers } = useMarketSnapshot(store);
  const [step, setStep] = useState<Step>('review');
  const [passenger, setPassenger] = useState<PassengerInput>(EMPTY_PASSENGER);
  const [payment, setPayment] = useState<PaymentInput>(EMPTY_PAYMENT);
  const [message, setMessage] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<MarketRefusal | null>(null);

  const info = SITE_INFO[site];
  const flight = scenario.flights.find((candidate) => candidate.id === flightId);

  const hold = market.holds.find(
    (candidate) => candidate.participantId === participantId && candidate.procedureId === tabId,
  );
  const price =
    site === 'site1'
      ? market.site1Price[flightId]
      : site === 'site2'
        ? (hold?.price ?? market.site2Price[flightId])
        : market.site3Price[flightId];

  const trend = usePriceTrend(price);
  if (!flight) return <p className="booking__empty">この便は見つかりませんでした。</p>;

  const cityOf = (code: string) => airportName(scenario.airports, code);
  const airlineOf = (id: string) => scenario.airlines.find((a) => a.id === id)?.name ?? id;
  const duration = flightDurationMinutes(scenario.airports, flight);

  const goToPayment = (event: FormEvent) => {
    event.preventDefault();
    if (findBlankFields(passenger).length > 0) {
      setMessage('未入力の項目があります。すべての項目を入力してください。');
      return;
    }
    setMessage(null);
    if (site === 'site2') {
      const result = store.placeHold({
        participantId,
        flightId,
        procedureId: tabId,
        now: performance.now(),
      });
      if (!result.ok) {
        setRefusal(result.reason);
        return;
      }
    }
    setStep('payment');
  };

  const confirm = (event: FormEvent) => {
    event.preventDefault();
    if (findBlankFields(payment).length > 0) {
      setMessage('未入力の項目があります。すべての項目を入力してください。');
      return;
    }
    setMessage(null);
    const result = store.purchase(
      { participantId, site, flightId, procedureId: tabId, now: performance.now() },
      { participantId, procedureId: tabId, site, flightId, passenger, payment },
    );
    // 成功すると、画面全体に予約完了の表示が重なる。
    if (!result.ok) setRefusal(result.reason);
  };

  const releaseOwnHold = () => {
    if (hold) store.releaseHold(participantId, hold.id);
    setStep('passenger');
  };

  return (
    <div className={`booking booking--${site}`}>
      <header className="booking__header">
        <span className="booking__logo" aria-hidden="true">
          {info.tag}
        </span>
        <span className="booking__name">{info.name}</span>
        <span className="booking__feature">{info.feature}</span>
      </header>

      <ol className="booking__steps" aria-label="予約の手順">
        {(['review', 'passenger', 'payment'] as const).map((key, index) => (
          <li key={key} aria-current={step === key ? 'step' : undefined}>
            {index + 1}.{' '}
            {key === 'review' ? '便の確認' : key === 'passenger' ? '搭乗者情報' : '決済'}
          </li>
        ))}
      </ol>

      <section className="booking__flight" aria-label="予約する便">
        <div>
          <p className="booking__route">
            {flight.departureTime} {cityOf(flight.originCode)}
            <span aria-hidden="true"> → </span>
            <span className="visually-hidden">から</span>
            {flight.arrivalTime} {cityOf(flight.destinationCode)}
            <span className="booking__local">現地時間</span>
          </p>
          <p className="booking__meta">
            {formatJapaneseDate(flight.departureDate)}発 ／ {airlineOf(flight.sellingAirlineId)}
            （運航：
            {airlineOf(flight.operatingAirlineId)}）／{' '}
            {flight.stops === 0 ? '直行便' : `乗継${flight.stops}回`} ／ 所要
            {Math.floor(duration / 60)}時間{duration % 60}分 ／ 到着ターミナル
            {flight.arrivalTerminal} ／ 受託手荷物{flight.checkedBaggageKg}kg込み
          </p>
        </div>
        <p className="booking__price">
          {formatYen(price)}
          {site === 'site3' && (
            <span className="booking__price-note">
              {trend === 'up' ? '▲ 値上がり' : trend === 'down' ? '▼ 値下がり' : '現在の価格'}
              ／いま{site3Viewers[flightId] ?? 0}人が閲覧中
            </span>
          )}
          {site === 'site2' && hold && <span className="booking__price-note">確保した価格</span>}
        </p>
      </section>

      {hold && (
        <div className="booking__hold" role="status">
          <span>席を確保しています。この手続きでは {formatYen(hold.price)} で予約できます。</span>
          <button type="button" onClick={releaseOwnHold}>
            確保を解除する
          </button>
        </div>
      )}

      {refusal ? (
        <div className="booking__refusal" role="alert">
          <p>{REFUSAL_TEXT[refusal]}</p>
          <div className="booking__actions">
            <button type="button" className="booking__primary" onClick={onBackToCompare}>
              比較サイトで探し直す
            </button>
            {refusal === 'no-hold' && (
              <button
                type="button"
                onClick={() => {
                  setRefusal(null);
                  setStep('passenger');
                }}
              >
                搭乗者情報へ戻る
              </button>
            )}
          </div>
        </div>
      ) : step === 'review' ? (
        <div className="booking__panel">
          <p>
            この便で予約手続きを始めます。価格や空席は変わることがあり、
            {site === 'site1' && '予約が確定するまで席は確保されません。'}
            {site === 'site2' &&
              '搭乗者情報を入力して「決済へ進む」を押すと、席と価格を確保します。'}
            {site === 'site3' && '確定ボタンを押した瞬間の価格で予約が確定します。'}
          </p>
          <div className="booking__actions">
            <button type="button" className="booking__primary" onClick={() => setStep('passenger')}>
              予約手続きへ進む
            </button>
          </div>
        </div>
      ) : step === 'passenger' ? (
        <form className="booking__panel" onSubmit={goToPayment} noValidate>
          <h2>搭乗者情報</h2>
          <p className="booking__hint">パスポートの記載どおりに入力してください。</p>
          <Fields fields={PASSENGER_FIELDS} values={passenger} onChange={setPassenger} />
          {message && (
            <p className="booking__message" role="alert">
              {message}
            </p>
          )}
          <div className="booking__actions">
            <button type="button" onClick={() => setStep('review')}>
              戻る
            </button>
            <button type="submit" className="booking__primary">
              決済へ進む
            </button>
          </div>
        </form>
      ) : (
        <form className="booking__panel" onSubmit={confirm} noValidate>
          <h2>決済情報</h2>
          <p className="booking__hint">カードの記載どおりに入力してください。</p>
          <Fields fields={PAYMENT_FIELDS} values={payment} onChange={setPayment} />
          {message && (
            <p className="booking__message" role="alert">
              {message}
            </p>
          )}
          {site === 'site3' && (
            <p className="booking__warning">このボタンを押した時点の表示価格で予約が確定します。</p>
          )}
          <div className="booking__actions">
            <button type="button" onClick={() => setStep('passenger')}>
              搭乗者情報へ戻る
            </button>
            <button type="submit" className="booking__primary">
              {formatYen(price)} で予約を確定する
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/** 価格が前回から上がったか下がったか。変わるまでは前回の向きを保つ。 */
function usePriceTrend(price: number): 'up' | 'down' | null {
  const [seen, setSeen] = useState<{ price: number; trend: 'up' | 'down' | null }>({
    price,
    trend: null,
  });
  if (price !== seen.price) {
    // 描画中に前回の価格と比べて覚え直す（React の「前回の値に合わせて状態を直す」書き方）。
    const trend = price > seen.price ? 'up' : 'down';
    setSeen({ price, trend });
    return trend;
  }
  return seen.trend;
}

type FieldsProps<T extends Record<string, string>> = {
  fields: { key: keyof T & string; label: string; placeholder: string }[];
  values: T;
  onChange: (next: T) => void;
};

/** 入力欄の並び。自動入力と自動修正は使わない。 */
function Fields<T extends Record<string, string>>({ fields, values, onChange }: FieldsProps<T>) {
  return (
    <div className="booking__fields">
      {fields.map((field) => (
        <label key={field.key} className="booking__field">
          <span>{field.label}</span>
          <input
            type="text"
            value={values[field.key]}
            placeholder={field.placeholder}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => onChange({ ...values, [field.key]: event.target.value })}
          />
        </label>
      ))}
    </div>
  );
}
