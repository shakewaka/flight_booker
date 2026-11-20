import type { MarketState } from '../../game/market';
import { recentPurchases } from '../../game/rivals';
import type { Participant } from '../../game/types';
import { SITE_INFO } from '../sites/siteInfo';
import './rival-feed.css';

/** 予約の通知を出しておく時間。 */
const SHOW_MS = 6_000;

type RivalFeedProps = {
  market: MarketState;
  participants: Participant[];
  /** 画面を操作する人間。自分の予約は通知しない。 */
  participantId: string;
  now: number;
};

/**
 * 他の参加者が予約したことを、画面の端に流す。
 * 出すのは名前と予約サイトだけで、金額は出さない（仮。docs/decisions.md）。
 */
export function RivalFeed({ market, participants, participantId, now }: RivalFeedProps) {
  const recent = recentPurchases(market, {
    now,
    windowMs: SHOW_MS,
    excludeParticipantId: participantId,
  });
  const nameOf = (id: string) => participants.find((p) => p.id === id)?.name ?? id;

  return (
    <ol className="rival-feed" role="log" aria-live="polite" aria-label="他の参加者の予約">
      {recent.map((purchase) => (
        <li key={purchase.participantId} className="rival-feed__item">
          <span className="rival-feed__name">{nameOf(purchase.participantId)}さん</span>
          が予約しました
          <span className="rival-feed__site">{SITE_INFO[purchase.site].name}</span>
        </li>
      ))}
    </ol>
  );
}
