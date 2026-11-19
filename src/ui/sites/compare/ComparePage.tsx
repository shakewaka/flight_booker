import { useEffect, useState, type FormEvent } from 'react';
import {
  findQueryError,
  getSearchProgress,
  queryHash,
  searchDurationMs,
  searchFlights,
  type SearchQuery,
  type SearchResult,
} from '../../../game/search';
import { airportName } from '../../../game/airports';
import { formatJapaneseDate } from '../../../game/dates';
import type { RoundScenario, SiteId } from '../../../game/types';
import { formatRemaining } from '../../format';
import type { MarketStore } from '../../marketStore';
import { compareUrl } from '../../browser/pageUrl';
import { enterToNext } from '../../enterToNext';
import { DateField } from './DateField';
import { FlightCard } from './FlightCard';
import { createProgressCurve, progressAt, type ProgressCurve } from './progressCurve';
import './compare.css';

type ComparePageProps = {
  /** このページを開いているタブ。 */
  tabId: string;
  scenario: RoundScenario;
  /** 市場。検索が終わった時点の価格と空席を、検索結果に使う。 */
  store: MarketStore;
  now: number;
  /** 締切の時刻。検索結果の取得時刻を、残り時間で表すのに使う。 */
  deadlineAt: number;
  searchRange: { min: number; max: number };
  /**
   * アドレスバーのURLから開いたときの検索条件。あれば、開いた時点でその条件で検索する（再検索になる）。
   */
  initialQuery?: SearchQuery;
  /** タブに出す題名・検索中かどうか・アドレスバーのURLを知らせる。 */
  onStatusChange: (tabId: string, title: string, busy: boolean, url: string) => void;
  /** 予約サイトを新しいタブで開く。 */
  onBook: (site: SiteId, flightId: string) => void;
};

type RunningSearch = {
  /** 検索ボタンを押した時点の条件。あとからフォームを変えても、結果は変わらない。 */
  query: SearchQuery;
  startedAt: number;
  durationMs: number;
  /** 進捗バーの動き方。検索条件から決まる。 */
  curve: ProgressCurve;
  /**
   * 検索結果。検索が終わった時点の価格と空席で作り、その後は変えない（再検索すると新しくなる）。
   * 検索中は null。
   */
  results: SearchResult[] | null;
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

function startSearch(
  query: SearchQuery,
  startedAt: number,
  searchRange: { min: number; max: number },
): RunningSearch {
  return {
    query,
    startedAt,
    durationMs: searchDurationMs(query, searchRange),
    curve: createProgressCurve(queryHash(query)),
    results: null,
  };
}

/** 航空券比較サイト。条件を入れて検索し、候補と予約サイトごとの価格を見る。 */
export function ComparePage({
  tabId,
  scenario,
  store,
  initialQuery,
  now,
  deadlineAt,
  searchRange,
  onStatusChange,
  onBook,
}: ComparePageProps) {
  const [draft, setDraft] = useState<SearchQuery>(initialQuery ?? EMPTY_QUERY);
  // URLから開いたときは、その条件ですぐに検索する。条件が足りなければ、理由を出して待つ。
  const [search, setSearch] = useState<RunningSearch | null>(() =>
    initialQuery && !findQueryError(initialQuery)
      ? startSearch(initialQuery, now, searchRange)
      : null,
  );
  const [formError, setFormError] = useState<string | null>(() =>
    initialQuery ? findQueryError(initialQuery) : null,
  );

  // タブの題名は、検索した区間にする。検索中はタブのアイコンを回す。
  const title = search
    ? `比較｜${search.query.originCode} → ${search.query.destinationCode}`
    : '航空券比較サイト';
  const busy =
    search !== null &&
    getSearchProgress(search.startedAt, search.durationMs, now).kind === 'searching';
  // 検索すると、アドレスバーのURLが検索条件入りのURLに変わる。
  const url = compareUrl(search?.query ?? initialQuery);
  useEffect(() => {
    onStatusChange(tabId, title, busy, url);
  }, [onStatusChange, tabId, title, busy, url]);

  // 検索が終わったら、その時点の市場から結果を作って残す（描画中に状態を直す React の書き方）。
  if (search !== null && !busy && search.results === null) {
    setSearch({
      ...search,
      results: searchFlights(scenario, search.query, store.getSnapshot().market),
    });
  }

  const update = (change: Partial<SearchQuery>) =>
    setDraft((previous) => ({ ...previous, ...change }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const error = findQueryError(draft);
    setFormError(error);
    if (error) return;
    // 候補が0件になる検索なら、その条件に合う便を足してから検索する。
    store.ensureSearchResults(draft);
    setSearch(startSearch(draft, performance.now(), searchRange));
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

      <form className="compare-form" onSubmit={submit} onKeyDown={enterToNext} noValidate>
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
        <DateField
          label="出発日"
          value={draft.departureDate}
          onChange={(departureDate) => update({ departureDate })}
        />
        <DateField
          label="到着日"
          value={draft.arrivalDate}
          onChange={(arrivalDate) => update({ arrivalDate })}
        />
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
          <SearchOutcome
            scenario={scenario}
            search={search}
            now={now}
            deadlineAt={deadlineAt}
            onBook={onBook}
          />
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
  onBook: (site: SiteId, flightId: string) => void;
};

function SearchOutcome({ scenario, search, now, deadlineAt, onBook }: SearchOutcomeProps) {
  const progress = getSearchProgress(search.startedAt, search.durationMs, now);

  if (progress.kind === 'searching' || search.results === null) {
    // 検索が終わった直後、結果を作るまでの一瞬は、進捗バーを満たして見せる。
    const shown = progress.kind === 'searching' ? progressAt(search.curve, progress.ratio) : 1;
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

  const { results } = search;
  const fetchedAt = formatRemaining(deadlineAt - progress.completedAt);
  const { query } = search;
  const cityOf = (code: string) => airportName(scenario.airports, code);
  const searchedWith = [
    `${cityOf(query.originCode)} → ${cityOf(query.destinationCode)}`,
    `${formatJapaneseDate(query.departureDate)}発`,
    `${formatJapaneseDate(query.arrivalDate)}までに着`,
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
              <FlightCard result={result} scenario={scenario} onBook={onBook} />
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
