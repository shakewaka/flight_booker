import { useCallback, useReducer, useState } from 'react';
import type { RoundScenario } from '../../game/types';
import { ComparePage } from '../sites/compare/ComparePage';
import { BrowserShell, type TabView } from './BrowserShell';
import { createInitialTabs, tabsReducer, type TabPage } from './tabs';

type GameBrowserProps = {
  scenario: RoundScenario;
  roundNumber: number;
  roundCount: number;
  remainingMs: number;
  now: number;
  deadlineAt: number;
  searchRange: { min: number; max: number };
};

type PageStatus = { title: string; busy: boolean };

const PAGE_INFO: Record<TabPage, { title: string; url: string }> = {
  compare: { title: '航空券比較サイト', url: 'https://compare.flight-game.invalid/' },
};

/**
 * ゲーム内ブラウザ。タブの並びと、タブごとのページを持つ。
 * 表示していないタブのページも描画したまま隠すので、入力・検索の進行・スクロール位置が残る。
 */
export function GameBrowser({
  scenario,
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

  const tabs: TabView[] = state.tabs.map((tab) => ({
    id: tab.id,
    title: statuses[tab.id]?.title ?? PAGE_INFO[tab.page].title,
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
      url={PAGE_INFO[activeTab.page].url}
      onActivate={(id) => dispatch({ type: 'activate', id })}
      onClose={(id) => dispatch({ type: 'close', id })}
      onOpen={() => dispatch({ type: 'open', page: 'compare' })}
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
          <ComparePage
            tabId={tab.id}
            scenario={scenario}
            now={now}
            deadlineAt={deadlineAt}
            searchRange={searchRange}
            onStatusChange={reportStatus}
          />
        </div>
      ))}
    </BrowserShell>
  );
}
