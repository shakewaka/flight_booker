import { useSyncExternalStore } from 'react';
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

// 画面とゲーム処理をつなぐ、市場の置き場所。1ラウンドに1つだけ作り、全タブで共有する。
// 判定はすべて src/game/market.ts が行い、ここは結果を保存して画面に知らせるだけ。
// NPCも、この置き場所を通して同じ市場を操作する。

export type MarketSnapshot = {
  market: MarketState;
  /** 購入した予約の入力内容。ラウンド終了時の判定に使う。 */
  entries: BookingEntry[];
};

export type MarketStore = {
  getSnapshot: () => MarketSnapshot;
  subscribe: (listener: () => void) => () => void;
  placeHold: (request: Parameters<typeof placeHold>[1]) => MarketResult<Hold>;
  releaseHold: (participantId: string, holdId: string) => void;
  purchase: (
    request: Parameters<typeof purchase>[1],
    entry: BookingEntry,
  ) => MarketResult<Purchase>;
  close: () => void;
};

export function createMarketStore(initial: MarketState): MarketStore {
  let snapshot: MarketSnapshot = { market: initial, entries: [] };
  const listeners = new Set<() => void>();

  const update = (next: MarketSnapshot) => {
    if (next.market === snapshot.market && next.entries === snapshot.entries) return;
    snapshot = next;
    listeners.forEach((listener) => listener());
  };

  return {
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
      if (result.ok) update({ market: result.state, entries: [...snapshot.entries, entry] });
      return result;
    },
    close: () => {
      update({ ...snapshot, market: closeMarket(snapshot.market) });
    },
  };
}

export function useMarketSnapshot(store: MarketStore): MarketSnapshot {
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
