import { describe, expect, it } from 'vitest';
import { createInitialTabs, tabsReducer, type TabsAction, type TabsState } from './tabs';

const run = (actions: TabsAction[], start: TabsState = createInitialTabs()) =>
  actions.reduce(tabsReducer, start);

const ids = (state: TabsState) => state.tabs.map((tab) => tab.id);

/** tab-1〜tab-4 の4タブを開き、tab-4 を表示している状態。 */
const four = run([
  { type: 'open', page: { kind: 'compare' } },
  { type: 'open', page: { kind: 'compare' } },
  { type: 'open', page: { kind: 'compare' } },
]);

describe('アドレスバーからの移動（navigate）', () => {
  const query = {
    originCode: 'HND',
    destinationCode: 'TSA',
    departureDate: '2027-05-18',
    arrivalDate: '2027-05-18',
    nonstopOnly: false,
    checkedBaggageKg: 20,
  };

  it('そのタブのページだけを入れ替え、作り直すための番号を増やす', () => {
    const state = run([{ type: 'navigate', id: 'tab-2', page: { kind: 'compare', query } }], four);
    expect(state.tabs[1]).toEqual({ id: 'tab-2', page: { kind: 'compare', query }, visit: 1 });
    expect(state.tabs.filter((tab) => tab.visit > 0)).toHaveLength(1);
    // 表示するタブとタブの並びは変えない。
    expect(state.activeId).toBe('tab-4');
    expect(ids(state)).toEqual(ids(four));
  });

  it('ないタブを指定しても、何も変わらない', () => {
    expect(tabsReducer(four, { type: 'navigate', id: 'tab-9', page: { kind: 'compare' } })).toBe(
      four,
    );
  });
});

describe('tabsReducer', () => {
  it('最初は比較サイトのタブが1つだけ開いている', () => {
    const state = createInitialTabs();
    expect(state.tabs).toEqual([{ id: 'tab-1', page: { kind: 'compare' }, visit: 0 }]);
    expect(state.activeId).toBe('tab-1');
  });

  it('新しいタブは右端に追加され、そのタブが表示される', () => {
    expect(ids(four)).toEqual(['tab-1', 'tab-2', 'tab-3', 'tab-4']);
    expect(four.activeId).toBe('tab-4');
  });

  it('最後の1タブは閉じられない', () => {
    const state = createInitialTabs();
    expect(tabsReducer(state, { type: 'close', id: 'tab-1' })).toBe(state);
  });

  it('表示中のタブを閉じると、右隣のタブが表示される', () => {
    const state = run(
      [
        { type: 'activate', id: 'tab-2' },
        { type: 'close', id: 'tab-2' },
      ],
      four,
    );
    expect(ids(state)).toEqual(['tab-1', 'tab-3', 'tab-4']);
    expect(state.activeId).toBe('tab-3');
  });

  it('右端の表示中のタブを閉じると、左隣のタブが表示される', () => {
    const state = tabsReducer(four, { type: 'close', id: 'tab-4' });
    expect(ids(state)).toEqual(['tab-1', 'tab-2', 'tab-3']);
    expect(state.activeId).toBe('tab-3');
  });

  it('表示していないタブを閉じても、表示中のタブは変わらない', () => {
    const state = tabsReducer(four, { type: 'close', id: 'tab-1' });
    expect(ids(state)).toEqual(['tab-2', 'tab-3', 'tab-4']);
    expect(state.activeId).toBe('tab-4');
  });

  it('閉じたタブの番号は使い回さない', () => {
    const state = run(
      [
        { type: 'close', id: 'tab-4' },
        { type: 'open', page: { kind: 'compare' } },
      ],
      four,
    );
    expect(ids(state)).toEqual(['tab-1', 'tab-2', 'tab-3', 'tab-5']);
  });

  it('存在しないタブを閉じたり表示したりしても、何も変わらない', () => {
    expect(tabsReducer(four, { type: 'close', id: 'tab-9' })).toBe(four);
    expect(tabsReducer(four, { type: 'activate', id: 'tab-9' })).toBe(four);
  });

  it('予約サイトのタブも、比較サイトと同じ規則で右端に開く', () => {
    const state = tabsReducer(four, {
      type: 'open',
      page: { kind: 'booking', site: 'site2', flightId: 'HND-TSA-0910' },
    });
    expect(state.tabs.at(-1)).toEqual({
      id: 'tab-5',
      page: { kind: 'booking', site: 'site2', flightId: 'HND-TSA-0910' },
      visit: 0,
    });
    expect(state.activeId).toBe('tab-5');
  });

  it('タブの数に上限はない', () => {
    const many = run(
      Array.from({ length: 50 }, () => ({ type: 'open', page: { kind: 'compare' } }) as const),
    );
    expect(many.tabs).toHaveLength(51);
  });
});
