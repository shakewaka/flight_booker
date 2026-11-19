import { useCallback, useEffect, useReducer, useState } from 'react';
import type { RoundScenario, SiteId } from '../../game/types';
import type { MarketStore } from '../marketStore';
import { BookingPage } from '../sites/booking/BookingPage';
import { ComparePage } from '../sites/compare/ComparePage';
import { SITE_INFO } from '../sites/siteInfo';
import { BrowserShell, type TabView } from './BrowserShell';
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

type PageStatus = { title: string; busy: boolean };

const COMPARE_PAGE: TabPage = { kind: 'compare' };

/** タブに最初に出す題名と、アドレスバーのゲーム内URL。 */
function describePage(page: TabPage, scenario: RoundScenario): { title: string; url: string } {
  if (page.kind === 'compare') {
    return { title: '航空券比較サイト', url: 'https://compare.flight-game.invalid/' };
  }
  const info = SITE_INFO[page.site];
  const flight = scenario.flights.find((candidate) => candidate.id === page.flightId);
  const route = flight
    ? `${flight.originCode} → ${flight.destinationCode} ${flight.departureTime}`
    : '';
  return {
    title: `${info.name}｜${route}`,
    url: `https://${info.host}/booking/${page.flightId.toLowerCase()}`,
  };
}

/**
 * ゲーム内ブラウザ。タブの並びと、タブごとのページを持つ。
 * 表示していないタブのページも描画したまま隠すので、入力・検索の進行・スクロール位置が残る。
 * 在庫と予約は、タブごとではなく、全タブで共有する市場（store）を通して扱う。
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

  // ページから届く、タブに出す題名と検索中かどうか。変わったときだけ更新する。
  const reportStatus = useCallback((tabId: string, title: string, busy: boolean) => {
    setStatuses((previous) => {
      const current = previous[tabId];
      if (current?.title === title && current.busy === busy) return previous;
      return { ...previous, [tabId]: { title, busy } };
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

  const tabs: TabView[] = state.tabs.map((tab) => ({
    id: tab.id,
    title: statuses[tab.id]?.title ?? describePage(tab.page, scenario).title,
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
      url={describePage(activeTab.page, scenario).url}
      onActivate={(id) => dispatch({ type: 'activate', id })}
      onClose={(id) => dispatch({ type: 'close', id })}
      onOpen={() => dispatch({ type: 'open', page: COMPARE_PAGE })}
    >
      {state.tabs.map((tab) => (
        <div
          key={tab.id}
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
              now={now}
              deadlineAt={deadlineAt}
              searchRange={searchRange}
              onStatusChange={reportStatus}
              onBook={openBooking}
            />
          ) : (
            <BookingPage
              tabId={tab.id}
              site={tab.page.site}
              flightId={tab.page.flightId}
              scenario={scenario}
              store={store}
              participantId={participantId}
              onBackToCompare={backToCompare}
            />
          )}
        </div>
      ))}
    </BrowserShell>
  );
}
