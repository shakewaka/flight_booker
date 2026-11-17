import { purchaseOf } from '../../game/market';
import { describeRequirements } from '../../game/requirements';
import { computeRoundResults } from '../../game/results';
import { getRoundPhase, type RoundTimer } from '../../game/roundClock';
import type { Participant, RoundScenario } from '../../game/types';
import { GameBrowser } from '../browser/GameBrowser';
import { TabletFrame } from '../browser/TabletFrame';
import { IdentityStack } from '../documents/IdentityStack';
import { MemoPad } from '../documents/MemoPad';
import { useMarketSnapshot, type MarketStore } from '../marketStore';
import { BookedOverlay } from './BookedOverlay';
import { RoundOverlay } from './RoundOverlay';
import { RoundResults } from './RoundResults';
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
  roundNumber: number;
  roundCount: number;
  searchRange: { min: number; max: number };
  timer: RoundTimer;
  now: number;
  onRestart: () => void;
};

/** 机の上。左80%にタブレット（企画書の「架空PC」）、右20%の上半分に条件メモ、下半分にパスポート・カードを置く。 */
export function Workspace({
  scenario,
  store,
  participantId,
  participants,
  timeoutPenalty,
  roundNumber,
  roundCount,
  searchRange,
  timer,
  now,
  onRestart,
}: WorkspaceProps) {
  const phase = getRoundPhase(timer, now);
  const memo = describeRequirements(scenario.requirements, scenario.airports, scenario.airlines);
  // カウント中は資料の中身を描画しない。締切後は操作だけを止め、資料は読めるままにする。
  const concealed = phase.kind === 'countdown';
  // 予約が完了した人は、締切を待たずに操作を終える。
  const { market, entries } = useMarketSnapshot(store);
  const bought = purchaseOf(market, participantId);
  const locked = phase.kind !== 'playing' || bought !== undefined;
  const remainingMs =
    phase.kind === 'playing'
      ? phase.remainingMs
      : phase.kind === 'closed'
        ? 0
        : timer.deadlineAt - timer.startAt;

  return (
    <main className="desk">
      <section className="desk__pc" aria-label="タブレット" inert={locked}>
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
      <aside className="desk__papers" aria-label="手元の資料" inert={locked}>
        <MemoPad memo={memo} concealed={concealed} />
        <IdentityStack passport={scenario.passport} card={scenario.card} concealed={concealed} />
      </aside>
      {bought && phase.kind === 'playing' && (
        <BookedOverlay
          scenario={scenario}
          purchase={bought}
          entry={entries.find(
            (entry) =>
              entry.participantId === participantId && entry.procedureId === bought.procedureId,
          )}
          remainingMs={remainingMs}
        />
      )}
      <RoundOverlay
        phase={phase}
        onRestart={onRestart}
        closedContent={
          phase.kind === 'closed' ? (
            <RoundResults
              rows={computeRoundResults({
                participants,
                market,
                entries,
                scenario,
                timeoutPenalty,
              })}
              playerId={participantId}
              roundNumber={roundNumber}
              roundCount={roundCount}
              onRestart={onRestart}
            />
          ) : undefined
        }
      />
    </main>
  );
}
