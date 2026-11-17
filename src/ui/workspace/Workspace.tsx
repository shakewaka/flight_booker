import { describeRequirements } from '../../game/requirements';
import { getRoundPhase, type RoundTimer } from '../../game/roundClock';
import type { RoundScenario } from '../../game/types';
import { GameBrowser } from '../browser/GameBrowser';
import { TabletFrame } from '../browser/TabletFrame';
import { IdentityStack } from '../documents/IdentityStack';
import { MemoPad } from '../documents/MemoPad';
import { RoundOverlay } from './RoundOverlay';
import './workspace.css';

type WorkspaceProps = {
  scenario: RoundScenario;
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
  const locked = phase.kind !== 'playing';
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
      <RoundOverlay phase={phase} onRestart={onRestart} />
    </main>
  );
}
