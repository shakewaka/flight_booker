import { useState } from 'react';
import { sampleRound } from './data/sampleRound';
import { createRoundTimer, getRoundPhase } from './game/roundClock';
import { prototypeSettings } from './game/settings';
import { useNow } from './ui/useNow';
import { Workspace } from './ui/workspace/Workspace';

type Attempt = {
  /** やり直すたびに変わる番号。画面の部品を作り直し、前の状態を残さない。 */
  id: number;
  timer: ReturnType<typeof createRoundTimer>;
};

function newAttempt(id: number): Attempt {
  return { id, timer: createRoundTimer(performance.now(), prototypeSettings) };
}

export default function App() {
  const [attempt, setAttempt] = useState(() => newAttempt(0));
  const now = useNow(100);
  const phase = getRoundPhase(attempt.timer, now);

  return (
    <Workspace
      key={attempt.id}
      scenario={sampleRound}
      roundNumber={1}
      roundCount={prototypeSettings.roundCount}
      roundTimeLimitMs={prototypeSettings.roundTimeLimitMs}
      phase={phase}
      onRestart={() => setAttempt((previous) => newAttempt(previous.id + 1))}
    />
  );
}
