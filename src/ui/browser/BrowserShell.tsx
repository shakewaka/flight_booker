import './browser.css';

/**
 * ゲーム内ブラウザの枠。タブの追加・切替と検索は、この後の作業で実装する。
 * 現時点の操作ボタンは見た目だけで、押せる部品としては公開しない。
 */
export function BrowserShell() {
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
        <span>ROUND – / 4</span>
        <span className="browser__timer">残り --:--</span>
      </div>

      <div className="browser__page">
        <header className="site-header">
          <span className="site-header__logo" aria-hidden="true">
            ✈
          </span>
          <span className="site-header__name">航空券比較サイト</span>
        </header>
        <div className="site-empty">
          <h1>ここに比較サイトを表示します</h1>
          <p>
            検索フォームと複数タブは、この後の作業で追加します。右側の条件メモとパスポートを読みながら、この画面で予約を進めます。
          </p>
          <p className="site-empty__note">
            登場する人物・航空会社・サイト・決済情報は、すべて架空です。
          </p>
        </div>
      </div>
    </div>
  );
}
