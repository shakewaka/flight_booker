import { useState } from 'react';
import type { PassportData, PaymentCardData } from '../../game/types';
import { Passport, PassportCover } from './Passport';
import { PaymentCard, PaymentCardBack } from './PaymentCard';
import './identity.css';

type IdentityStackProps = {
  passport: PassportData;
  card: PaymentCardData;
  /** true のあいだは中身を描画せず、「？」だけを見せる。カードへの切替もできない。 */
  concealed: boolean;
};

type ShownDocument = 'passport' | 'card';

const NAMES: Record<ShownDocument, string> = {
  passport: 'パスポート',
  card: 'カード',
};

/**
 * 右下のパスポートとカード。領域を押すたびに、表示する資料を入れ替える。
 * 読めるのは手前の1つだけで、後ろの資料は表紙や裏面しか見えない。
 */
export function IdentityStack({ passport, card, concealed }: IdentityStackProps) {
  const [shown, setShown] = useState<ShownDocument>('passport');
  const other: ShownDocument = shown === 'passport' ? 'card' : 'passport';

  if (concealed) {
    return (
      <section className="identity" aria-label="パスポートとカード（開始前のため非表示）">
        <p className="identity__label">
          <strong>パスポート</strong>
        </p>
        <div className="identity__stage">
          <div className="identity__concealed" aria-hidden="true">
            <span className="identity__concealed-mark">？</span>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="identity" aria-label="パスポートとカード">
      <p className="identity__label">
        <strong>{NAMES[shown]}</strong>
        <span aria-hidden="true">クリックで{NAMES[other]}へ ⇄</span>
      </p>

      <div className="identity__stage" key={shown}>
        {shown === 'passport' ? (
          <>
            <div className="identity__behind identity__behind--card">
              <PaymentCardBack />
            </div>
            <div className="identity__front identity__front--passport">
              <Passport passport={passport} />
            </div>
          </>
        ) : (
          <>
            <div className="identity__behind identity__behind--passport">
              <PassportCover />
            </div>
            <div className="identity__front identity__front--card">
              <PaymentCard card={card} />
            </div>
          </>
        )}
      </div>

      <button
        type="button"
        className="identity__toggle"
        aria-label={`${NAMES[shown]}を表示中。押すと${NAMES[other]}に切り替え`}
        onClick={() => setShown(other)}
      />
    </section>
  );
}
