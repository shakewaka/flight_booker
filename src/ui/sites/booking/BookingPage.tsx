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
import { freeSeats, site3FareRaised, type MarketRefusal } from '../../../game/market';
import { SEAT_POSITION_LABEL, seatPosition } from '../../../game/seatMap';
import type { RoundScenario, SiteId } from '../../../game/types';
import { formatStops, formatYen } from '../../format';
import { useMarketSnapshot, type MarketStore } from '../../marketStore';
import { SITE_INFO } from '../siteInfo';
import { enterToNext } from '../../enterToNext';
import { formatInput, type InputFormat } from './inputFormat';
import { SeatPicker } from './SeatPicker';
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

type Step = 'review' | 'seat' | 'passenger' | 'payment';

const STEP_LABEL: Record<Step, string> = {
  review: '便の確認',
  seat: '座席',
  passenger: '搭乗者情報',
  payment: '決済',
};

/** 席を指定しないとき（おまかせ）の値。 */
const AUTO_SEAT = 'auto';

type FieldDefinition<K extends string> = {
  key: K;
  label: string;
  placeholder: string;
  /** 入力の整え方（大文字にする、「/」を入れる、4桁ごとに空けるなど）。 */
  format: InputFormat;
};

const PASSENGER_FIELDS: FieldDefinition<keyof PassengerInput>[] = [
  { key: 'surname', label: '姓（ローマ字）', placeholder: '例：YAMADA', format: 'upper' },
  { key: 'givenName', label: '名（ローマ字）', placeholder: '例：TARO', format: 'upper' },
  { key: 'birthDate', label: '生年月日', placeholder: 'YYYY/MM/DD', format: 'date' },
  { key: 'nationality', label: '国籍', placeholder: '例：JAPAN', format: 'upper' },
  { key: 'passportNumber', label: 'パスポート番号', placeholder: '例：TR1234567', format: 'upper' },
  {
    key: 'passportExpiry',
    label: 'パスポートの有効期限',
    placeholder: 'YYYY/MM/DD',
    format: 'date',
  },
];

const PAYMENT_FIELDS: FieldDefinition<keyof PaymentInput>[] = [
  { key: 'holderName', label: 'カード名義', placeholder: '例：TARO YAMADA', format: 'upper' },
  { key: 'cardNumber', label: 'カード番号', placeholder: '0000 0000 0000 0000', format: 'card' },
  { key: 'cardExpiry', label: '有効期限（月/年）', placeholder: 'MM/YY', format: 'expiry' },
  { key: 'securityCode', label: '確認コード', placeholder: '3桁', format: 'digits' },
];

const REFUSAL_TEXT: Record<MarketRefusal, string> = {
  closed: '締切の時刻を過ぎたため、予約できません。',
  'already-purchased': 'このラウンドの予約は、すでに完了しています。',
  'unknown-flight': 'この便は見つかりませんでした。',
  'sold-out': 'この便は満席になりました。別の便を探してください。',
  // 席だけが埋まったときは、座席の画面へ戻すので、この文は通常は表示しない。
  'seat-taken': '選んだ席は、ほかの人が先に予約しました。',
  'unknown-seat': 'この席は選べません。座席を選び直してください。',
  'fare-sold-out': 'このチケットは売り切れました。この料金での販売は終了しています。',
  'no-hold': '席の確保が見つかりません。搭乗者情報の画面から手続きをやり直してください。',
};

/**
 * 予約サイトの手続き。便の確認 → 座席 → 搭乗者情報 → 決済情報 → 確定 の順に進む。
 * 席は指定しなくてもよい（おまかせ：市場が空いている席を割り当てる）。
 * 選んだ席だけが先に埋まり、他に空席があるときは、入力を残したまま座席の画面へ戻す（企画書の基本仕様）。
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
  /** 選んだ席。おまかせなら AUTO_SEAT、まだ選んでいなければ null。 */
  const [seat, setSeat] = useState<string | null>(null);
  /** 席が埋まって座席の画面へ戻ったとき、席を選び直したら戻る手順。 */
  const [resumeStep, setResumeStep] = useState<Step | null>(null);
  /** サイト1で、最安料金のチケットが売り切れたことを知らせるポップアップ。 */
  const [soldOutNotice, setSoldOutNotice] = useState(false);

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
  // サイト3で、安い価格帯のチケットが売り切れて価格が上がっているか。
  const raised = site === 'site3' && site3FareRaised(market, flightId);
  if (!flight) return <p className="booking__empty">この便は見つかりませんでした。</p>;

  const cityOf = (code: string) => airportName(scenario.airports, code);
  const airlineOf = (id: string) => scenario.airlines.find((a) => a.id === id)?.name ?? id;
  const duration = flightDurationMinutes(scenario.airports, flight);
  // 確保していれば、確保した席。そうでなければ、選んだ席（おまかせなら指定しない）。
  const shownSeat = hold?.seatId ?? (seat === AUTO_SEAT ? null : seat);
  const requestedSeat = seat === AUTO_SEAT || seat === null ? undefined : seat;

  /** 市場に断られたとき。席だけが埋まったなら、入力を残したまま座席の画面へ戻す。 */
  const handleRefusal = (reason: MarketRefusal, from: Step) => {
    if (reason === 'seat-taken' || reason === 'unknown-seat') {
      setMessage(
        `選んだ席（${seat}）は、ほかの人が先に予約しました。別の席を選んでください。入力した内容は残っています。`,
      );
      setSeat(null);
      setResumeStep(from);
      setStep('seat');
      return;
    }
    // サイト1の料金の売り切れは、ポップアップで知らせる。
    if (reason === 'fare-sold-out') {
      setSoldOutNotice(true);
      return;
    }
    setRefusal(reason);
  };

  const chooseSeat = (next: string) => {
    setSeat(next);
    setMessage(null);
    setStep(resumeStep ?? 'passenger');
    setResumeStep(null);
  };

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
        seatId: requestedSeat,
        procedureId: tabId,
        now: performance.now(),
      });
      if (!result.ok) {
        handleRefusal(result.reason, 'passenger');
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
      {
        participantId,
        site,
        flightId,
        seatId: requestedSeat,
        procedureId: tabId,
        now: performance.now(),
      },
      { participantId, procedureId: tabId, site, flightId, passenger, payment },
    );
    // 成功すると、画面全体に予約完了の表示が重なる。
    if (!result.ok) handleRefusal(result.reason, 'payment');
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
        {(['review', 'seat', 'passenger', 'payment'] as const).map((key, index) => (
          <li key={key} aria-current={step === key ? 'step' : undefined}>
            {index + 1}. {STEP_LABEL[key]}
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
            {airlineOf(flight.operatingAirlineId)}）／ {formatStops(flight, scenario.airports)} ／
            所要
            {Math.floor(duration / 60)}時間{duration % 60}分 ／ 到着ターミナル
            {flight.arrivalTerminal} ／ 受託手荷物{flight.checkedBaggageKg}kg込み
          </p>
          {(seat !== null || hold) && (
            <p className="booking__meta">
              座席：
              {shownSeat
                ? `${shownSeat}（${SEAT_POSITION_LABEL[seatPosition(shownSeat)]}）`
                : 'おまかせ（予約の確定時に割り当て）'}
            </p>
          )}
        </div>
        <p className="booking__price">
          {formatYen(price)}
          {site === 'site3' && (
            <span className="booking__price-note">
              {trend === 'up' ? '▲ 値上がり' : trend === 'down' ? '▼ 値下がり' : '現在の価格'}
              ／いま{site3Viewers[flightId] ?? 0}人が閲覧中
            </span>
          )}
          {raised && (
            <span className="booking__price-raised" role="status">
              安い価格のチケットが売り切れたため、価格が上がりました
            </span>
          )}
          {site === 'site2' && hold && <span className="booking__price-note">確保した価格</span>}
        </p>
      </section>

      {hold && (
        <div className="booking__hold" role="status">
          <span>
            席（{hold.seatId}）を確保しています。この手続きでは {formatYen(hold.price)}{' '}
            で予約できます。
          </span>
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
            <button type="button" className="booking__primary" onClick={() => setStep('seat')}>
              予約手続きへ進む
            </button>
          </div>
        </div>
      ) : step === 'seat' ? (
        <div className="booking__panel">
          <h2>座席</h2>
          <p className="booking__hint">
            空いている席を選んでください。席を選んでも、
            {site === 'site2' ? '「決済へ進む」を押すまで' : '予約が確定するまで'}
            確保はされません。指定しない場合は、確定時に空いている席を割り当てます。
          </p>
          {message && (
            <p className="booking__message" role="alert">
              {message}
            </p>
          )}
          <SeatPicker
            openSeats={market.seats[flightId] ?? []}
            freeSeats={freeSeats(market, flightId)}
            selected={seat}
            onSelect={chooseSeat}
          />
          <div className="booking__actions">
            <button
              type="button"
              onClick={() => {
                setMessage(null);
                setResumeStep(null);
                setStep('review');
              }}
            >
              戻る
            </button>
            <button type="button" onClick={() => chooseSeat(AUTO_SEAT)}>
              座席を指定しない（おまかせ）
            </button>
          </div>
        </div>
      ) : step === 'passenger' ? (
        <form className="booking__panel" onSubmit={goToPayment} onKeyDown={enterToNext} noValidate>
          <h2>搭乗者情報</h2>
          <p className="booking__hint">
            パスポートの記載どおりに入力してください。Enterで次の欄へ、Tabでパスポートとカードを切り替えます。
          </p>
          <Fields fields={PASSENGER_FIELDS} values={passenger} onChange={setPassenger} />
          {message && (
            <p className="booking__message" role="alert">
              {message}
            </p>
          )}
          <div className="booking__actions">
            {/* 確保した後は席を変えられない。変えるときは、確保を解除する。 */}
            {!hold && (
              <button
                type="button"
                onClick={() => {
                  setMessage(null);
                  setStep('seat');
                }}
              >
                座席を選び直す
              </button>
            )}
            <button type="submit" className="booking__primary">
              決済へ進む
            </button>
          </div>
        </form>
      ) : (
        <form className="booking__panel" onSubmit={confirm} onKeyDown={enterToNext} noValidate>
          <h2>決済情報</h2>
          <p className="booking__hint">
            カードの記載どおりに入力してください。Enterで次の欄へ、Tabでパスポートとカードを切り替えます。
          </p>
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

      {soldOutNotice && (
        <div className="booking__modal-backdrop">
          <div
            className="booking__modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={`${tabId}-sold-out-title`}
            aria-describedby={`${tabId}-sold-out-text`}
          >
            <h2 id={`${tabId}-sold-out-title`}>売り切れました</h2>
            <p id={`${tabId}-sold-out-text`}>
              この料金（{formatYen(price)}）のチケットは売り切れました。
              別の便や、別の予約サイトを探してください。
            </p>
            <div className="booking__actions">
              <button type="button" onClick={() => setSoldOutNotice(false)}>
                閉じる
              </button>
              <button
                type="button"
                className="booking__primary"
                autoFocus
                onClick={() => {
                  setSoldOutNotice(false);
                  onBackToCompare();
                }}
              >
                比較サイトで探し直す
              </button>
            </div>
          </div>
        </div>
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
  fields: FieldDefinition<keyof T & string>[];
  values: T;
  onChange: (next: T) => void;
};

/**
 * 入力欄の並び。表記は整えるが（大文字、「/」、4桁ごとの間）、つづりや数字を直すことはしない。
 * ブラウザの自動入力とスペルチェックは使わない。
 */
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
            inputMode={field.format === 'upper' ? 'text' : 'numeric'}
            autoCapitalize={field.format === 'upper' ? 'characters' : 'off'}
            onChange={(event) =>
              onChange({
                ...values,
                [field.key]: formatInput(field.format, event.target.value, values[field.key]),
              })
            }
          />
        </label>
      ))}
    </div>
  );
}
