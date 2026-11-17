export default function App() {
  return (
    <main className="setup-page">
      <header className="setup-header">
        <p className="eyebrow">架空の航空券予約グランプリ</p>
        <h1>Flight Booker</h1>
        <p className="intro">条件を読み、価格を見極め、最安の一枚を予約する。</p>
      </header>

      <section className="setup-card" aria-labelledby="setup-heading">
        <span className="status">開発準備中</span>
        <h2 id="setup-heading">起動確認ページ</h2>
        <p>開発環境が起動しました。ゲーム本体は、ここから実装していきます。</p>
        <dl className="document-list">
          <div>
            <dt>企画と仕様</dt>
            <dd>
              <code>docs/flight-booker-game-proposal.md</code>
            </dd>
          </div>
          <div>
            <dt>開発の進め方</dt>
            <dd>
              <code>docs/workflow.md</code>
            </dd>
          </div>
          <div>
            <dt>次に作るもの</dt>
            <dd>
              <code>docs/roadmap.md</code>
            </dd>
          </div>
        </dl>
      </section>
      <p className="setup-footer">登場する人物・航空券・サイト・決済情報は、すべて架空です。</p>
    </main>
  );
}
