import { useSyncExternalStore } from 'react';
import { ensureSearchResults } from '../data/generateFlights';
import type { BookingEntry } from '../game/booking';
import {
  closeMarket,
  placeHold,
  purchase,
  releaseHold,
  type Hold,
  type MarketResult,
  type MarketState,
  type Purchase,
} from '../game/market';
import { advanceNpcs, createNpc, type NpcState } from '../game/npc';
import type { SearchQuery } from '../game/search';
import type { GameSettings } from '../game/settings';
import type { Site3Viewing } from '../game/site3Pricing';
import type { Participant, RoundScenario } from '../game/types';

// 画面とゲーム処理をつなぐ、市場の置き場所。1ラウンドに1つだけ作り、全タブで共有する。
// 判定はすべて src/game/ の処理が行い、ここは結果を保存して画面に知らせるだけ。
// NPCも、この置き場所を通して同じ市場を操作する。

export type MarketSnapshot = {
  market: MarketState;
  /** 購入した予約の入力内容。ラウンド終了時の判定に使う。 */
  entries: BookingEntry[];
  npcs: NpcState[];
  /** 便ごとの、サイト3の閲覧人数。 */
  site3Viewers: Record<string, number>;
};

export type MarketStore = {
  /** このラウンドの参加者全員（人間とNPC）。他の参加者の名前を出すのに使う。 */
  participants: Participant[];
  getSnapshot: () => MarketSnapshot;
  subscribe: (listener: () => void) => () => void;
  placeHold: (request: Parameters<typeof placeHold>[1]) => MarketResult<Hold>;
  releaseHold: (participantId: string, holdId: string) => void;
  purchase: (
    request: Parameters<typeof purchase>[1],
    entry: BookingEntry,
  ) => MarketResult<Purchase>;
  /**
   * 検索の候補が0件になるなら、その検索条件に合う便を市場に足す（どう検索しても候補が出るように）。
   * 検索を始めるときに呼ぶ。
   */
  ensureSearchResults: (query: SearchQuery) => void;
  /** 人間がサイト3で開いている便（裏のタブも含む）を知らせる。 */
  setHumanViewing: (participantId: string, flightIds: string[]) => void;
  /** NPCを進め、サイト3の価格を閲覧人数に合わせる。画面の時計に合わせて呼ぶ。 */
  tick: (now: number) => void;
  close: () => void;
};

type StoreOptions = {
  scenario: RoundScenario;
  settings: GameSettings;
  participants: Participant[];
};

export function createMarketStore(initial: MarketState, options: StoreOptions): MarketStore {
  const { scenario, settings, participants } = options;
  const npcs = participants
    .filter((participant) => participant.kind === 'npc')
    .map((participant, index) => createNpc(participant.id, index, initial, scenario, settings));

  let snapshot: MarketSnapshot = { market: initial, entries: [], npcs, site3Viewers: {} };
  let humanViewing: Site3Viewing = {};
  const listeners = new Set<() => void>();

  const update = (next: MarketSnapshot) => {
    const same = (Object.keys(next) as (keyof MarketSnapshot)[]).every(
      (key) => next[key] === snapshot[key],
    );
    if (same) return;
    snapshot = next;
    listeners.forEach((listener) => listener());
  };

  return {
    participants,
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    placeHold: (request) => {
      const result = placeHold(snapshot.market, request);
      update({ ...snapshot, market: result.state });
      return result;
    },
    releaseHold: (participantId, holdId) => {
      update({ ...snapshot, market: releaseHold(snapshot.market, participantId, holdId) });
    },
    purchase: (request, entry) => {
      const result = purchase(snapshot.market, request);
      if (result.ok) {
        update({ ...snapshot, market: result.state, entries: [...snapshot.entries, entry] });
      }
      return result;
    },
    ensureSearchResults: (query) => {
      update({ ...snapshot, market: ensureSearchResults(scenario, snapshot.market, query) });
    },
    setHumanViewing: (participantId, flightIds) => {
      humanViewing = { ...humanViewing, [participantId]: flightIds };
    },
    tick: (now) => {
      const next = advanceNpcs(snapshot.market, snapshot.npcs, humanViewing, participants.length, {
        scenario,
        settings,
        now,
      });
      const viewersChanged =
        JSON.stringify(next.site3Viewers) !== JSON.stringify(snapshot.site3Viewers);
      const npcsChanged = next.npcs.some((npc, index) => npc !== snapshot.npcs[index]);
      update({
        ...snapshot,
        market: next.market,
        // NPCの予約の入力内容も、人間と同じ判定にかけるため記録する。
        entries:
          next.entries.length > 0 ? [...snapshot.entries, ...next.entries] : snapshot.entries,
        npcs: npcsChanged ? next.npcs : snapshot.npcs,
        site3Viewers: viewersChanged ? next.site3Viewers : snapshot.site3Viewers,
      });
    },
    close: () => {
      update({ ...snapshot, market: closeMarket(snapshot.market) });
    },
  };
}

export function useMarketSnapshot(store: MarketStore): MarketSnapshot {
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
