import type { ReactNode } from 'react';
import { formatRemaining } from '../format';
import './browser.css';

/** 残り時間がこれ以下になったら、時計を赤くする。 */
const WARNING_MS = 30_000;

export type TabView = {
  id: string;
  title: string;
  /** 検索中など、ページが処理を続けているとき true。 */
  busy: boolean;
};

type BrowserShellProps = {
  roundNumber: number;
  roundCount: number;
  remainingMs: number;
  tabs: TabView[];
  activeId: string;
  /** 表示中のタブのゲーム内URL。 */
  url: string;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onOpen: () => void;
  /** タブごとのページ。表示していないページは hidden で隠しておく。 */
  children: ReactNode;
};

/**
 * ゲーム内ブラウザの枠。タブ列、アドレスバー、ラウンドと残り時間を表示する。
 * 戻る・進む・再読み込みのボタンは見た目だけで、押せる部品としては公開しない。
 */
export function BrowserShell({
  roundNumber,
  roundCount,
  remainingMs,
  tabs,
  activeId,
  url,
  onActivate,
  onClose,
  onOpen,
  children,
}: BrowserShellProps) {
  const timerClass =
    remainingMs <= WARNING_MS ? 'browser__timer browser__timer--warning' : 'browser__timer';
  const closable = tabs.length > 1;

  return (
    <div className="browser">
      <div className="browser__tabs">
        <div className="browser__tab-list" role="tablist" aria-label="ゲーム内ブラウザのタブ">
          {tabs.map((tab) => {
            const active = tab.id === activeId;
            return (
              <div
                key={tab.id}
                className={active ? 'browser__tab browser__tab--active' : 'browser__tab'}
              >
                <button
                  type="button"
                  id={`${tab.id}-tab`}
                  className="browser__tab-button"
                  role="tab"
                  aria-selected={active}
                  aria-controls={`${tab.id}-panel`}
                  title={tab.title}
                  onClick={() => onActivate(tab.id)}
                >
                  <span
                    className={
                      tab.busy ? 'browser__favicon browser__favicon--busy' : 'browser__favicon'
                    }
                    aria-hidden="true"
                  />
                  <span className="browser__tab-title">{tab.title}</span>
                  {tab.busy && <span className="visually-hidden">（検索中）</span>}
                </button>
                {closable && (
                  <button
                    type="button"
                    className="browser__tab-close"
                    aria-label={`「${tab.title}」のタブを閉じる`}
                    onClick={() => onClose(tab.id)}
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <button
          type="button"
          className="browser__new-tab"
          aria-label="新しいタブで比較サイトを開く"
          title="新しいタブ"
          onClick={onOpen}
        >
          ＋
        </button>
      </div>

      <div className="browser__toolbar">
        <span className="browser__nav" aria-hidden="true">
          ←
        </span>
        <span className="browser__nav" aria-hidden="true">
          →
        </span>
        <span className="browser__nav" aria-hidden="true">
          ↻
        </span>
        <span className="browser__url">
          <span className="browser__lock" aria-hidden="true" />
          <span className="visually-hidden">ゲーム内のアドレス：</span>
          {url}
        </span>
      </div>

      <div className="browser__status">
        <span>
          ROUND {roundNumber} / {roundCount}
        </span>
        <span className={timerClass}>残り {formatRemaining(remainingMs)}</span>
      </div>

      <div className="browser__page">{children}</div>
    </div>
  );
}
