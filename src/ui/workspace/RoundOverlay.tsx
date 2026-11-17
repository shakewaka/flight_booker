import type { RoundPhase } from '../../game/roundClock';
import './round-overlay.css';

/** START の文字を表示し続ける時間。演出だけで、この間も操作できる。 */
const START_BANNER_MS = 1_200;

type RoundOverlayProps = {
  phase: RoundPhase;
  onRestart: () => void;
};

/** 画面全体に重ねる表示。開始前のカウント、START、締切。 */
export function RoundOverlay({ phase, onRestart }: RoundOverlayProps) {
  if (phase.kind === 'countdown') {
    return (
      <div className="round-overlay round-overlay--dim" role="status" aria-live="polite">
        <span className="round-overlay__label">まもなく開始</span>
        {/* key を秒ごとに変えて、数字が切り替わるたびに演出をやり直す。 */}
        <span className="round-overlay__count" key={phase.secondsLeft}>
          {phase.secondsLeft}
        </span>
      </div>
    );
  }

  if (phase.kind === 'playing') {
    if (phase.elapsedMs >= START_BANNER_MS) return null;
    return (
      <div className="round-overlay round-overlay--pass-through" role="status">
        <span className="round-overlay__start">START</span>
      </div>
    );
  }

  return (
    <div className="round-overlay round-overlay--dim" role="status">
      <div className="round-overlay__panel">
        <p className="round-overlay__title">ラウンド終了</p>
        <p className="round-overlay__text">締切の時刻になりました。</p>
        <button type="button" className="round-overlay__button" onClick={onRestart} autoFocus>
          最初からやり直す
        </button>
      </div>
    </div>
  );
}
