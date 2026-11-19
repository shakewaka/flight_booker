import { useState, type KeyboardEvent } from 'react';
import { closedEarly, findFlight, purchaseOf } from '../../game/market';
import { computeStandings } from '../../game/match';
import { describeRequirements } from '../../game/requirements';
import { computeRoundResults, type RoundResultRow } from '../../game/results';
import { getRoundPhase } from '../../game/roundClock';
import type { PenaltySettings } from '../../game/settings';
import type { Participant, RoundScenario } from '../../game/types';
import { blockClipboard } from '../blockClipboard';
import { GameBrowser } from '../browser/GameBrowser';
import { TabletFrame } from '../browser/TabletFrame';
import { IdentityStack, type ShownDocument } from '../documents/IdentityStack';
import { MemoPad } from '../documents/MemoPad';
import { useMarketSnapshot, type MarketStore } from '../marketStore';
import { BookedOverlay } from './BookedOverlay';
import { RoundOverlay } from './RoundOverlay';
import { RivalFeed } from './RivalFeed';
import { RoundResults } from './RoundResults';
import { Standings } from './Standings';
import './workspace.css';

type WorkspaceProps = {
  scenario: RoundScenario;
  /** このラウンドの市場。全タブとNPCで共有する。 */
  store: MarketStore;
  /** 画面を操作する人間の参加者。 */
  participantId: string;
  /** このラウンドの参加者全員（人間とNPC）。 */
  participants: Participant[];
  /** 時間切れの集計金額に加える額。 */
  timeoutPenalty: number;
  /** 減点の割合。 */
  penaltySettings: PenaltySettings;
  roundNumber: number;
  roundCount: number;
  /** 終了したラウンドの結果。総合順位に使う。 */
  finishedRounds: RoundResultRow[][];
  searchRange: { min: number; max: number };
  now: number;
  /** このラウンドの結果を確定して、次のラウンドへ進む。 */
  onNextRound: (rows: RoundResultRow[]) => void;
  onRestartMatch: () => void;
};

/** 机の上。左80%にタブレット（企画書の「架空PC」）、右20%の上半分に条件メモ、下半分にパスポート・カードを置く。 */
export function Workspace({
  scenario,
  store,
  participantId,
  participants,
  timeoutPenalty,
  penaltySettings,
  roundNumber,
  roundCount,
  finishedRounds,
  searchRange,
  now,
  onNextRound,
  onRestartMatch,
}: WorkspaceProps) {
  // 締切後に、ラウンド結果と総合順位のどちらを見せているか。
  const [showStandings, setShowStandings] = useState(false);
  // 締切は市場が持つ。参加者の75%が予約すると、締切が早まる。
  const { market, entries } = useMarketSnapshot(store);
  const timer = market.timer;
  const phase = getRoundPhase(timer, now);
  // 右下に手前に出している資料。入力欄でのTabキーでも入れ替える。
  const [shownDocument, setShownDocument] = useState<ShownDocument>('passport');
  const toggleDocument = () =>
    setShownDocument((current) => (current === 'passport' ? 'card' : 'passport'));

  /**
   * ゲーム内ブラウザの入力欄にいるときは、Tabキーで次の欄へ移らず、パスポートとカードを入れ替える。
   * 入力欄からは離れないので、資料を見ながらそのまま打ち続けられる。次の欄へは Enter で進む。
   * 入力欄の外では、Tabキーは通常どおり、ボタンなどへ移る。
   */
  function switchDocumentByTab(event: KeyboardEvent) {
    if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target as HTMLElement;
    const inBrowserField =
      (target instanceof HTMLInputElement || target instanceof HTMLSelectElement) &&
      target.closest('.desk__pc') !== null;
    if (!inBrowserField || phase.kind !== 'playing') return;
    event.preventDefault();
    toggleDocument();
  }
  const memo = describeRequirements(scenario.requirements, scenario.airports, scenario.airlines);
  // カウント中は資料の中身を描画しない。締切後は操作だけを止め、資料は読めるままにする。
  const concealed = phase.kind === 'countdown';
  // 予約が完了した人は、締切を待たずに操作を終える。
  const bought = purchaseOf(market, participantId);
  const locked = phase.kind !== 'playing' || bought !== undefined;
  const remainingMs =
    phase.kind === 'playing' ? phase.remainingMs : phase.kind === 'closed' ? 0 : market.limitMs;

  // 締切後の市場は変わらないので、毎回計算しても同じ結果になる。
  function closedView() {
    const rows = computeRoundResults({
      participants,
      market,
      entries,
      scenario,
      timeoutPenalty,
      penaltySettings,
    });
    if (!showStandings) {
      return (
        <RoundResults
          rows={rows}
          timeoutAmount={scenario.maxPrice + timeoutPenalty}
          closedEarlyBy={closedEarly(market) ? market.closeWhenPurchased : null}
          playerId={participantId}
          roundNumber={roundNumber}
          roundCount={roundCount}
          onNext={() => setShowStandings(true)}
        />
      );
    }
    return (
      <Standings
        rows={computeStandings(participants, [...finishedRounds, rows])}
        playerId={participantId}
        finishedRounds={finishedRounds.length + 1}
        roundCount={roundCount}
        onNextRound={() => onNextRound(rows)}
        onRestartMatch={onRestartMatch}
      />
    );
  }

  return (
    <main className="desk" onKeyDownCapture={switchDocumentByTab}>
      <section className="desk__pc" aria-label="タブレット" inert={locked} {...blockClipboard}>
        <TabletFrame>
          <GameBrowser
            scenario={scenario}
            store={store}
            participantId={participantId}
            roundNumber={roundNumber}
            roundCount={roundCount}
            remainingMs={remainingMs}
            now={now}
            deadlineAt={timer.deadlineAt}
            searchRange={searchRange}
          />
        </TabletFrame>
      </section>
      <aside className="desk__papers" aria-label="手元の資料" inert={locked} {...blockClipboard}>
        <MemoPad memo={memo} concealed={concealed} />
        <IdentityStack
          passport={scenario.passport}
          card={scenario.card}
          concealed={concealed}
          shown={shownDocument}
          onToggle={toggleDocument}
        />
      </aside>
      {phase.kind === 'playing' && (
        <RivalFeed
          market={market}
          participants={participants}
          participantId={participantId}
          now={now}
        />
      )}
      {bought && phase.kind === 'playing' && (
        <BookedOverlay
          scenario={scenario}
          flight={findFlight(scenario, market, bought.flightId)}
          purchase={bought}
          entry={entries.find(
            (entry) =>
              entry.participantId === participantId && entry.procedureId === bought.procedureId,
          )}
          remainingMs={remainingMs}
          purchasedCount={market.purchases.length}
          participantCount={participants.length}
          closeWhenPurchased={market.closeWhenPurchased}
        />
      )}
      <RoundOverlay
        phase={phase}
        onRestart={onRestartMatch}
        closedContent={phase.kind === 'closed' ? closedView() : undefined}
      />
    </main>
  );
}
