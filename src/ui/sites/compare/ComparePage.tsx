import { useState, type FormEvent } from 'react';
import {
  findQueryError,
  getSearchProgress,
  queryHash,
  searchDurationMs,
  searchFlights,
  type SearchQuery,
} from '../../../game/search';
import { airportName } from '../../../game/airports';
import { formatJapaneseDate } from '../../../game/dates';
import type { RoundScenario } from '../../../game/types';
import { formatRemaining } from '../../format';
import { FlightCard } from './FlightCard';
import { createProgressCurve, progressAt, type ProgressCurve } from './progressCurve';
import './compare.css';

type ComparePageProps = {
  scenario: RoundScenario;
  now: number;
  /** 締切の時刻。検索結果の取得時刻を、残り時間で表すのに使う。 */
  deadlineAt: number;
  searchRange: { min: number; max: number };
};

type RunningSearch = {
  /** 検索ボタンを押した時点の条件。あとからフォームを変えても、結果は変わらない。 */
  query: SearchQuery;
  startedAt: number;
  durationMs: number;
  /** 進捗バーの動き方。検索条件から決まる。 */
  curve: ProgressCurve;
};

const BAGGAGE_OPTIONS = [0, 15, 20, 23];

/** 検索中に順に出す案内。進み具合の割合で切り替える。 */
const SEARCH_STAGES = [
  { until: 0.35, text: '各航空会社の空席を照会しています' },
  { until: 0.7, text: '予約サイトごとの運賃を集めています' },
  { until: 1, text: 'さらに安い候補を確認しています' },
];

const EMPTY_QUERY: SearchQuery = {
  originCode: '',
  destinationCode: '',
  departureDate: '',
  arrivalDate: '',
  nonstopOnly: false,
  checkedBaggageKg: 0,
};

/** 航空券比較サイト。条件を入れて検索し、候補と予約サイトごとの価格を見る。 */
export function ComparePage({ scenario, now, deadlineAt, searchRange }: ComparePageProps) {
  const [draft, setDraft] = useState<SearchQuery>(EMPTY_QUERY);
  const [search, setSearch] = useState<RunningSearch | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const update = (change: Partial<SearchQuery>) =>
    setDraft((previous) => ({ ...previous, ...change }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const error = findQueryError(draft);
    setFormError(error);
    if (error) return;
    setSearch({
      query: draft,
      startedAt: performance.now(),
      durationMs: searchDurationMs(draft, searchRange),
      curve: createProgressCurve(queryHash(draft)),
    });
  };

  return (
    <div className="compare">
      <header className="site-header">
        <span className="site-header__logo" aria-hidden="true">
          ✈
        </span>
        <span className="site-header__name">航空券比較サイト</span>
        <span className="site-header__tagline">3つの予約サイトの価格をまとめて比較</span>
      </header>

      <form className="compare-form" onSubmit={submit} noValidate>
        <label className="compare-form__field">
          <span>出発地</span>
          <select
            value={draft.originCode}
            onChange={(event) => update({ originCode: event.target.value })}
          >
            <option value="">選択してください</option>
            {scenario.airports.map((airport) => (
              <option key={airport.code} value={airport.code}>
                {airport.code} {airport.name}
              </option>
            ))}
          </select>
        </label>
        <label className="compare-form__field">
          <span>目的地</span>
          <select
            value={draft.destinationCode}
            onChange={(event) => update({ destinationCode: event.target.value })}
          >
            <option value="">選択してください</option>
            {scenario.airports.map((airport) => (
              <option key={airport.code} value={airport.code}>
                {airport.code} {airport.name}
              </option>
            ))}
          </select>
        </label>
        <label className="compare-form__field">
          <span>出発日</span>
          <input
            type="date"
            value={draft.departureDate}
            onChange={(event) => update({ departureDate: event.target.value })}
          />
        </label>
        <label className="compare-form__field">
          <span>到着日</span>
          <input
            type="date"
            value={draft.arrivalDate}
            onChange={(event) => update({ arrivalDate: event.target.value })}
          />
        </label>
        <label className="compare-form__field">
          <span>受託手荷物</span>
          <select
            value={draft.checkedBaggageKg}
            onChange={(event) => update({ checkedBaggageKg: Number(event.target.value) })}
          >
            {BAGGAGE_OPTIONS.map((kg) => (
              <option key={kg} value={kg}>
                {kg === 0 ? 'なし' : `${kg}kg`}
              </option>
            ))}
          </select>
        </label>
        <label className="compare-form__field">
          <span>経由地</span>
          <select
            value={draft.nonstopOnly ? 'nonstop' : 'any'}
            onChange={(event) => update({ nonstopOnly: event.target.value === 'nonstop' })}
          >
            <option value="any">指定なし</option>
            <option value="nonstop">直行便のみ</option>
          </select>
        </label>
        <p className="compare-form__fixed">片道 ／ 大人1名</p>
        <button type="submit" className="compare-form__submit">
          {search ? '再検索' : '検索'}
        </button>
        {formError && (
          <p className="compare-form__error" role="alert">
            {formError}
          </p>
        )}
      </form>

      <section className="compare-results" aria-live="polite">
        {search ? (
          <SearchOutcome scenario={scenario} search={search} now={now} deadlineAt={deadlineAt} />
        ) : (
          <p className="compare-results__hint">
            条件メモを見ながら検索条件を入れてください。航空会社・到着時刻・到着ターミナルは検索では絞り込めないため、候補の詳細で確認します。時刻はすべて現地時間です。
          </p>
        )}
      </section>
    </div>
  );
}

type SearchOutcomeProps = {
  scenario: RoundScenario;
  search: RunningSearch;
  now: number;
  deadlineAt: number;
};

function SearchOutcome({ scenario, search, now, deadlineAt }: SearchOutcomeProps) {
  const progress = getSearchProgress(search.startedAt, search.durationMs, now);

  if (progress.kind === 'searching') {
    const shown = progressAt(search.curve, progress.ratio);
    const stage = SEARCH_STAGES.find((candidate) => shown < candidate.until);
    return (
      <div className="compare-progress" role="status">
        <p className="compare-progress__text">{stage?.text ?? SEARCH_STAGES[0].text}…</p>
        <div className="compare-progress__bar">
          <span style={{ width: `${(shown * 100).toFixed(1)}%` }} />
        </div>
        <p className="compare-progress__note">候補の一覧は、検索が終わってから表示されます。</p>
      </div>
    );
  }

  // 検索ボタンを押した時点の条件で、結果を作る。
  const results = searchFlights(scenario, search.query);
  const fetchedAt = formatRemaining(deadlineAt - progress.completedAt);
  const { query } = search;
  const cityOf = (code: string) => airportName(scenario.airports, code);
  const searchedWith = [
    `${cityOf(query.originCode)} → ${cityOf(query.destinationCode)}`,
    `${formatJapaneseDate(query.departureDate)}発`,
    `${formatJapaneseDate(query.arrivalDate)}着`,
    query.checkedBaggageKg > 0 ? `手荷物${query.checkedBaggageKg}kg` : '手荷物なし',
    query.nonstopOnly ? '直行便のみ' : '経由地の指定なし',
  ].join(' ／ ');

  return (
    <>
      <div className="compare-results__head">
        <h2>
          検索完了<span className="compare-results__count">{results.length}件の候補</span>
        </h2>
        <p className="compare-results__query">検索条件：{searchedWith}</p>
        <p>
          残り {fetchedAt}{' '}
          時点の情報です。価格や空席は変わることがあり、この価格での予約を保証するものではありません。
        </p>
      </div>
      {results.length === 0 ? (
        <p className="compare-results__hint">
          条件に合う便は見つかりませんでした。検索条件を見直してください。
        </p>
      ) : (
        <ol className="compare-results__list">
          {results.map((result) => (
            <li key={result.flight.id}>
              <FlightCard result={result} scenario={scenario} />
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
