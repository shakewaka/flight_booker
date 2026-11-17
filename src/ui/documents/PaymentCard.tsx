import type { PaymentCardData } from '../../data/sampleRound';

type PaymentCardProps = {
  card: PaymentCardData;
};

/** 架空のクレジットカードの表面。入力に使う4項目をすべて表面に載せる。 */
export function PaymentCard({ card }: PaymentCardProps) {
  return (
    <article className="pay-card" aria-label="カード">
      <header className="pay-card__top">
        <span className="pay-card__brand">
          NOVA<i>PAY</i>
        </span>
        <span className="pay-card__kind">GAME CARD</span>
      </header>

      <div className="pay-card__chip-row" aria-hidden="true">
        <span className="pay-card__chip" />
        <svg className="pay-card__wave" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M6 8c2 2.5 2 5.500 0 8M10 5.500c3.200 4 3.200 9 0 13M14 3c4.500 5.500 4.500 12.500 0 18" />
        </svg>
      </div>

      <dl className="pay-card__fields">
        <div className="pay-card__number">
          <dt>カード番号</dt>
          <dd>{card.number}</dd>
        </div>
        <div className="pay-card__holder">
          <dt>カード名義</dt>
          <dd>{card.holderName}</dd>
        </div>
        <div>
          <dt>有効期限 月/年</dt>
          <dd>{card.expiry}</dd>
        </div>
        <div>
          <dt>確認コード</dt>
          <dd>{card.securityCode}</dd>
        </div>
      </dl>
    </article>
  );
}

/** カードの裏面。パスポートの表示中に、後ろに置く。 */
export function PaymentCardBack() {
  return (
    <div className="pay-card pay-card--back" aria-hidden="true">
      <span className="pay-card__stripe" />
    </div>
  );
}
