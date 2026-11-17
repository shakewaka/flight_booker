import { useEffect, useState } from 'react';
import { createParticipants } from './data/participants';
import { sampleRound } from './data/sampleRound';
import { createMarket } from './game/market';
import { createRoundTimer, getRoundPhase, type RoundTimer } from './game/roundClock';
import { prototypeSettings } from './game/settings';
import type { Participant } from './game/types';
import { createMarketStore, type MarketStore } from './ui/marketStore';
import { useNow } from './ui/useNow';
import { Workspace } from './ui/workspace/Workspace';

/** 画面を操作する人間の参加者。NPCは別の番号を使う。 */
const PLAYER_ID = 'player';

type Attempt = {
  /** やり直すたびに変わる番号。画面の部品を作り直し、前の状態を残さない。 */
  id: number;
  timer: RoundTimer;
  /** このラウンドの市場。やり直すと、新しい市場に替わる。 */
  store: MarketStore;
  participants: Participant[];
};

function newAttempt(id: number): Attempt {
  const timer = createRoundTimer(performance.now(), prototypeSettings);
  const participants = createParticipants(prototypeSettings.npcCount);
  const store = createMarketStore(createMarket(sampleRound, timer), {
    scenario: sampleRound,
    settings: prototypeSettings,
    participants,
  });
  return { id, timer, store, participants };
}

export default function App() {
  const [attempt, setAttempt] = useState(() => newAttempt(0));
  const now = useNow(100);
  const closed = getRoundPhase(attempt.timer, now).kind === 'closed';

  // 画面の時計が進むたびに、NPCを進めてサイト3の価格を更新する。
  useEffect(() => {
    attempt.store.tick(now);
  }, [now, attempt.store]);

  // 締切になったら、残っている確保をすべて解放する。
  useEffect(() => {
    if (closed) attempt.store.close();
  }, [closed, attempt.store]);

  return (
    <Workspace
      key={attempt.id}
      scenario={sampleRound}
      store={attempt.store}
      participantId={PLAYER_ID}
      participants={attempt.participants}
      timeoutPenalty={prototypeSettings.timeoutPenalty}
      roundNumber={1}
      roundCount={prototypeSettings.roundCount}
      searchRange={prototypeSettings.searchDurationMs}
      timer={attempt.timer}
      now={now}
      onRestart={() => setAttempt((previous) => newAttempt(previous.id + 1))}
    />
  );
}
