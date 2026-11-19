// ゲーム内ブラウザのタブの並び。画面の状態だけを扱い、在庫や予約の判定は持たない。
// 企画書のとおり、タブの数に上限は置かない。

import type { SearchQuery } from '../../game/search';
import type { SiteId } from '../../game/types';

/**
 * タブで開くページ。比較サイトか、ある便の予約サイトの手続き、または見つからないページ。
 * 比較サイトに検索条件（query）があれば、開いた時点でその条件で検索する。
 */
export type TabPage =
  | { kind: 'compare'; query?: SearchQuery }
  | { kind: 'booking'; site: SiteId; flightId: string }
  | { kind: 'not-found'; url: string };

export type Tab = {
  id: string;
  page: TabPage;
  /** アドレスバーから別のページを開くたびに増やす。ページを作り直すのに使う。 */
  visit: number;
};

export type TabsState = {
  tabs: Tab[];
  activeId: string;
  /** 次に作るタブの番号。閉じたタブの番号は使い回さない。 */
  nextNumber: number;
};

export type TabsAction =
  | { type: 'open'; page: TabPage }
  /** アドレスバーに入力したURLのページを、そのタブで開く。 */
  | { type: 'navigate'; id: string; page: TabPage }
  | { type: 'close'; id: string }
  | { type: 'activate'; id: string };

/** 最初は比較サイトを1タブだけ開いておく。 */
export function createInitialTabs(): TabsState {
  return {
    tabs: [{ id: 'tab-1', page: { kind: 'compare' }, visit: 0 }],
    activeId: 'tab-1',
    nextNumber: 2,
  };
}

export function tabsReducer(state: TabsState, action: TabsAction): TabsState {
  switch (action.type) {
    case 'open': {
      // 新しいタブは右端に追加し、そのタブを表示する。
      const tab: Tab = { id: `tab-${state.nextNumber}`, page: action.page, visit: 0 };
      return { tabs: [...state.tabs, tab], activeId: tab.id, nextNumber: state.nextNumber + 1 };
    }

    case 'close': {
      const index = state.tabs.findIndex((tab) => tab.id === action.id);
      // 最後の1タブは閉じない。何も開いていない画面を作らないため。
      if (index === -1 || state.tabs.length === 1) return state;

      const tabs = state.tabs.filter((tab) => tab.id !== action.id);
      if (action.id !== state.activeId) return { ...state, tabs };
      // 表示中のタブを閉じたら、右隣を表示する。右端だったら左隣を表示する。
      const next = tabs[Math.min(index, tabs.length - 1)];
      return { ...state, tabs, activeId: next.id };
    }

    case 'navigate': {
      if (!state.tabs.some((tab) => tab.id === action.id)) return state;
      return {
        ...state,
        tabs: state.tabs.map((tab) =>
          tab.id === action.id ? { ...tab, page: action.page, visit: tab.visit + 1 } : tab,
        ),
      };
    }

    case 'activate': {
      if (!state.tabs.some((tab) => tab.id === action.id)) return state;
      return { ...state, activeId: action.id };
    }
  }
}
