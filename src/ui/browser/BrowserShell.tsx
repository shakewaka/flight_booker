import type { ReactNode } from 'react';
import { formatRemaining } from '../format';
import './browser.css';

/** 残り時間がこれ以下になったら、時計を赤くする。 */
const WARNING_MS = 30_000;

type BrowserShellProps = {
  roundNumber: number;
  roundCount: number;
  remainingMs: number;
  /** 開いているページの中身。 */
  children: ReactNode;
};

/**
 * ゲーム内ブラウザの枠。タブの追加・切替は、この後の作業で実装する。
 * 現時点のタブと操作ボタンは見た目だけで、押せる部品としては公開しない。
 */
export function BrowserShell({
  roundNumber,
  roundCount,
  remainingMs,
  children,
}: BrowserShellProps) {
  const timerClass =
    remainingMs <= WARNING_MS ? 'browser__timer browser__timer--warning' : 'browser__timer';

  return (
    <div className="browser">
      <div className="browser__tabs" aria-hidden="true">
        <span className="browser__tab browser__tab--active">
          <span className="browser__favicon" />
          航空券比較サイト
          <span className="browser__tab-close">×</span>
        </span>
        <span className="browser__new-tab">＋</span>
      </div>

      <div className="browser__toolbar" aria-hidden="true">
        <span className="browser__nav">←</span>
        <span className="browser__nav">→</span>
        <span className="browser__nav">↻</span>
        <span className="browser__url">
          <span className="browser__lock" />
          https://compare.flight-game.invalid/
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
