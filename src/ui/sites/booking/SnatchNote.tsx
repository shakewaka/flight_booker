import type { Snatch } from '../../../game/rivals';

/** この時間より短い差で取られたら「タッチの差」と出す。 */
const NEAR_MISS_MS = 3_000;

type SnatchNoteProps = {
  snatch: Snatch;
  nameOf: (participantId: string) => string;
};

/**
 * 席や販売枠を先に取った人と、何秒前に取ったか。
 * 運が悪かったのではなく、相手に競り負けたと分かるようにする。文の中にも置けるよう span にする。
 */
export function SnatchNote({ snatch, nameOf }: SnatchNoteProps) {
  const seconds = (snatch.agoMs / 1000).toFixed(1);
  const verb = snatch.action === 'hold' ? '確保しました' : '購入しました';
  return (
    <span className="booking__snatch">
      {snatch.agoMs < NEAR_MISS_MS && (
        <strong className="booking__snatch-near">タッチの差！</strong>
      )}
      {nameOf(snatch.participantId)}さんが{seconds}秒前に{verb}。
    </span>
  );
}
