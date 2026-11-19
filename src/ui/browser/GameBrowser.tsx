import { useCallback, useEffect, useReducer, useState } from 'react';
import type { RoundScenario, SiteId } from '../../game/types';
import { findFlight, type MarketState } from '../../game/market';
import { useMarketSnapshot, type MarketStore } from '../marketStore';
import { BookingPage } from '../sites/booking/BookingPage';
import { ComparePage } from '../sites/compare/ComparePage';
import { SITE_INFO } from '../sites/siteInfo';
import { BrowserShell, type TabView } from './BrowserShell';
import { pageUrl, parsePageUrl } from './pageUrl';
import { createInitialTabs, tabsReducer, type TabPage } from './tabs';

type GameBrowserProps = {
  scenario: RoundScenario;
  store: MarketStore;
  participantId: string;
  roundNumber: number;
  roundCount: number;
  remainingMs: number;
  now: number;
  deadlineAt: number;
  searchRange: { min: number; max: number };
};

/** ページから届く、タブの題名・検索中かどうか・今のURL。 */
type PageStatus = { title: string; busy: boolean; url: string };

const COMPARE_PAGE: TabPage = { kind: 'compare' };

/** タブに最初に出す題名。 */
function pageTitle(page: TabPage, scenario: RoundScenario, market: MarketState): string {
  if (page.kind === 'compare') return '航空券比較サイト';
  if (page.kind === 'not-found') return 'ページが見つかりません';
  const flight = findFlight(scenario, market, page.flightId);
  const route = flight
    ? `${flight.originCode} → ${flight.destinationCode} ${flight.departureTime}`
    : '';
  return `${SITE_INFO[page.site].name}｜${route}`;
}

/**
 * ゲーム内ブラウザ。タブの並びと、タブごとのページを持つ。
 * 表示していないタブのページも描画したまま隠すので、入力・検索の進行・スクロール位置が残る。
 * 在庫と予約は、タブごとではなく、全タブで共有する市場（store）を通して扱う。
 * アドレスバーにURLを入れると、そのタブでそのページを開く（比較サイトの検索結果のURLなら、検索し直す）。
 */
export function GameBrowser({
  scenario,
  store,
  participantId,
  roundNumber,
  roundCount,
  remainingMs,
  now,
  deadlineAt,
  searchRange,
}: GameBrowserProps) {
  const [state, dispatch] = useReducer(tabsReducer, undefined, createInitialTabs);
  const [statuses, setStatuses] = useState<Record<string, PageStatus>>({});
  const { market } = useMarketSnapshot(store);

  // ページから届く、タブに出す題名・検索中かどうか・URL。変わったときだけ更新する。
  const reportStatus = useCallback((tabId: string, title: string, busy: boolean, url: string) => {
    setStatuses((previous) => {
      const current = previous[tabId];
      if (current?.title === title && current.busy === busy && current.url === url) {
        return previous;
      }
      return { ...previous, [tabId]: { title, busy, url } };
    });
  }, []);

  // サイト3で開いている便を、閲覧人数として市場に知らせる。表示していないタブも数える。
  const site3Flights = state.tabs
    .flatMap((tab) =>
      tab.page.kind === 'booking' && tab.page.site === 'site3' ? [tab.page.flightId] : [],
    )
    .join(',');
  useEffect(() => {
    store.setHumanViewing(participantId, site3Flights ? site3Flights.split(',') : []);
  }, [store, participantId, site3Flights]);

  const openBooking = (site: SiteId, flightId: string) =>
    dispatch({ type: 'open', page: { kind: 'booking', site, flightId } });

  // 比較サイトのタブがあればそこへ移り、なければ新しく開く。
  const backToCompare = () => {
    const compareTab = state.tabs.find((tab) => tab.page.kind === 'compare');
    dispatch(
      compareTab ? { type: 'activate', id: compareTab.id } : { type: 'open', page: COMPARE_PAGE },
    );
  };

  /** アドレスバーに入力したURLのページを、表示中のタブで開く。 */
  const navigate = (input: string) => {
    const id = state.activeId;
    // 前のページが知らせた題名やURLは、新しいページでは使わない。
    setStatuses((previous) => {
      const rest = { ...previous };
      delete rest[id];
      return rest;
    });
    const { market } = store.getSnapshot();
    const page = parsePageUrl(input, scenario, market.extraFlights);
    // 検索結果のURLなら、候補が0件にならないよう、先に便を足しておく。
    if (page.kind === 'compare' && page.query) store.ensureSearchResults(page.query);
    dispatch({ type: 'navigate', id, page });
  };

  const tabs: TabView[] = state.tabs.map((tab) => ({
    id: tab.id,
    title: statuses[tab.id]?.title ?? pageTitle(tab.page, scenario, market),
    busy: statuses[tab.id]?.busy ?? false,
  }));
  const activeTab = state.tabs.find((tab) => tab.id === state.activeId) ?? state.tabs[0];

  return (
    <BrowserShell
      roundNumber={roundNumber}
      roundCount={roundCount}
      remainingMs={remainingMs}
      tabs={tabs}
      activeId={state.activeId}
      url={statuses[activeTab.id]?.url ?? pageUrl(activeTab.page)}
      onActivate={(id) => dispatch({ type: 'activate', id })}
      onClose={(id) => dispatch({ type: 'close', id })}
      onOpen={() => dispatch({ type: 'open', page: COMPARE_PAGE })}
      onNavigate={navigate}
    >
      {state.tabs.map((tab) => (
        <div
          // アドレスバーから別のページを開いたら、ページを作り直す。
          key={`${tab.id}-${tab.visit}`}
          id={`${tab.id}-panel`}
          className="browser__tab-page"
          role="tabpanel"
          aria-labelledby={`${tab.id}-tab`}
          hidden={tab.id !== state.activeId}
        >
          {tab.page.kind === 'compare' ? (
            <ComparePage
              tabId={tab.id}
              scenario={scenario}
              store={store}
              initialQuery={tab.page.query}
              now={now}
              deadlineAt={deadlineAt}
              searchRange={searchRange}
              onStatusChange={reportStatus}
              onBook={openBooking}
            />
          ) : tab.page.kind === 'booking' ? (
            <BookingPage
              tabId={tab.id}
              site={tab.page.site}
              flightId={tab.page.flightId}
              scenario={scenario}
              store={store}
              participantId={participantId}
              onBackToCompare={backToCompare}
            />
          ) : (
            <div className="browser__not-found">
              <h1>このページは見つかりません</h1>
              <p>
                {tab.page.url}{' '}
                は、ゲーム内のサイトにありません。比較サイトや予約サイトのURLを確かめてください。
              </p>
            </div>
          )}
        </div>
      ))}
    </BrowserShell>
  );
}
