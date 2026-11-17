import { useEffect, useState } from 'react';
import { createParticipants } from './data/participants';
import { matchRounds } from './data/rounds';
import { createMarket } from './game/market';
import type { RoundResultRow } from './game/results';
import { createRoundTimer, getRoundPhase } from './game/roundClock';
import { prototypeSettings } from './game/settings';
import type { Participant } from './game/types';
import { createMarketStore, useMarketSnapshot, type MarketStore } from './ui/marketStore';
import { useNow } from './ui/useNow';
import { Workspace } from './ui/workspace/Workspace';

/** 画面を操作する人間の参加者。NPCは別の番号を使う。 */
const PLAYER_ID = 'player';

/** 1試合の進行。参加者は試合を通して同じで、ラウンドごとに市場と時計を作り直す。 */
type Match = {
  /** ラウンドや試合が変わるたびに増える番号。画面の部品を作り直し、前の状態を残さない。 */
  key: number;
  participants: Participant[];
  /** 今のラウンド（0から数える）。 */
  roundIndex: number;
  /** 終了したラウンドの結果。 */
  finished: RoundResultRow[][];
  /** このラウンドの市場。 */
  store: MarketStore;
};

function startRound(
  key: number,
  participants: Participant[],
  roundIndex: number,
  finished: RoundResultRow[][],
): Match {
  const scenario = matchRounds[roundIndex];
  const timer = createRoundTimer(performance.now(), prototypeSettings);
  // 参加者の75%が予約した時点で締め切る（10人なら8人）。
  const closeWhenPurchased = Math.ceil(participants.length * prototypeSettings.earlyCloseRate);
  const store = createMarketStore(createMarket(scenario, timer, { closeWhenPurchased }), {
    scenario,
    settings: prototypeSettings,
    participants,
  });
  return { key, participants, roundIndex, finished, store };
}

function startMatch(key: number): Match {
  return startRound(key, createParticipants(prototypeSettings.npcCount), 0, []);
}

export default function App() {
  const [match, setMatch] = useState(() => startMatch(0));
  const now = useNow(100);
  // 締切は市場が持つ。早めの締切が起きると、市場の時計の締切が早まる。
  const { market } = useMarketSnapshot(match.store);
  const closed = getRoundPhase(market.timer, now).kind === 'closed';

  // 画面の時計が進むたびに、NPCを進めてサイト3の価格を更新する。
  useEffect(() => {
    match.store.tick(now);
  }, [now, match.store]);

  // 締切になったら、残っている確保をすべて解放する。
  useEffect(() => {
    if (closed) match.store.close();
  }, [closed, match.store]);

  return (
    <Workspace
      key={match.key}
      scenario={matchRounds[match.roundIndex]}
      store={match.store}
      participantId={PLAYER_ID}
      participants={match.participants}
      timeoutPenalty={prototypeSettings.timeoutPenalty}
      penaltySettings={prototypeSettings.penalty}
      roundNumber={match.roundIndex + 1}
      roundCount={matchRounds.length}
      finishedRounds={match.finished}
      searchRange={prototypeSettings.searchDurationMs}
      now={now}
      onNextRound={(rows) =>
        setMatch((previous) =>
          startRound(previous.key + 1, previous.participants, previous.roundIndex + 1, [
            ...previous.finished,
            rows,
          ]),
        )
      }
      onRestartMatch={() => setMatch((previous) => startMatch(previous.key + 1))}
    />
  );
}
