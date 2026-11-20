import { useState, type FormEvent, type ReactNode } from 'react';
import { formatRemaining } from '../format';
import './browser.css';

/** 残り時間がこれ以下になったら、時計を赤くする。 */
const WARNING_MS = 30_000;
/** 締切まであと何人で締め切るかが、この人数以下になったら赤くする。 */
const WARNING_PEOPLE = 2;

/** 参加者のうち何人が予約したかと、あと何人の予約で締め切るか。 */
export type BookingProgress = {
  booked: number;
  participantCount: number;
  /** あと何人が予約すると締め切るか。早めに締め切らないなら null。 */
  untilClose: number | null;
};

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
  progress: BookingProgress;
  tabs: TabView[];
  activeId: string;
  /** 表示中のタブのゲーム内URL。 */
  url: string;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onOpen: () => void;
  /** アドレスバーに入力したURLのページを開く。 */
  onNavigate: (url: string) => void;
  /** タブごとのページ。表示していないページは hidden で隠しておく。 */
  children: ReactNode;
};

/**
 * ゲーム内ブラウザの枠。タブ列、アドレスバー、ラウンド・予約済みの人数・残り時間を表示する。
 * 戻る・進む・再読み込みのボタンは見た目だけで、押せる部品としては公開しない。
 * アドレスバーはURLを書き換えられ、Enterでそのページを開く。
 */
export function BrowserShell({
  roundNumber,
  roundCount,
  remainingMs,
  progress,
  tabs,
  activeId,
  url,
  onActivate,
  onClose,
  onOpen,
  onNavigate,
  children,
}: BrowserShellProps) {
  const timerClass =
    remainingMs <= WARNING_MS ? 'browser__timer browser__timer--warning' : 'browser__timer';
  const closable = tabs.length > 1;
  const closingSoon = progress.untilClose !== null && progress.untilClose <= WARNING_PEOPLE;

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
        <AddressBar url={url} onNavigate={onNavigate} />
      </div>

      <div className="browser__status">
        <span>
          ROUND {roundNumber} / {roundCount}
        </span>
        {/* 他の人が予約するたびに数字が動き、締切が近づいているのが分かる。 */}
        <span
          className={
            closingSoon ? 'browser__progress browser__progress--warning' : 'browser__progress'
          }
        >
          予約済み {progress.booked} / {progress.participantCount}人
          {progress.untilClose !== null &&
            (progress.untilClose > 0 ? `・あと${progress.untilClose}人で締切` : '・締切')}
        </span>
        <span className={timerClass}>残り {formatRemaining(remainingMs)}</span>
      </div>

      <div className="browser__page">{children}</div>
    </div>
  );
}

/**
 * アドレスバー。表示中のタブのURLを出す。押すと全体を選んだ状態で書き換えられ、
 * Enterでそのページを開く。Escか、欄から離れると、元のURLに戻す。
 * ここだけは、URLのコピーと貼り付けができる（src/ui/blockClipboard.ts）。
 */
function AddressBar({ url, onNavigate }: { url: string; onNavigate: (url: string) => void }) {
  /** 書き換え中の文字。書き換えていなければ null で、今のURLを出す。 */
  const [draft, setDraft] = useState<string | null>(null);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (draft !== null && draft.trim() !== '') onNavigate(draft);
    setDraft(null);
    event.currentTarget.querySelector('input')?.blur();
  };

  return (
    <form className="browser__url" onSubmit={submit} role="search">
      <span className="browser__lock" aria-hidden="true" />
      <input
        className="browser__url-input"
        aria-label="ゲーム内のアドレス"
        value={draft ?? url}
        spellCheck={false}
        autoComplete="off"
        onFocus={(event) => {
          setDraft(url);
          event.currentTarget.select();
        }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => setDraft(null)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setDraft(null);
            event.currentTarget.blur();
          }
        }}
      />
    </form>
  );
}
