import type { PassportData } from '../../data/sampleRound';
import { Emblem } from './Emblem';
import { buildMrzLines } from './mrz';

type PassportProps = {
  passport: PassportData;
};

/** YYYY-MM-DD を YYYY/MM/DD にする。 */
function formatDate(isoDate: string): string {
  return isoDate.replaceAll('-', '/');
}

function toSignature(passport: PassportData): string {
  const capitalize = (text: string) => text.charAt(0) + text.slice(1).toLowerCase();
  return `${capitalize(passport.givenName)} ${capitalize(passport.surname)}`;
}

/** 開いた状態のパスポート。上が署名のページ、下が顔写真のページ。 */
export function Passport({ passport }: PassportProps) {
  const [mrzLine1, mrzLine2] = buildMrzLines(passport);

  return (
    <article className="passport" aria-label="パスポート">
      <div className="passport__page passport__page--upper" aria-hidden="true">
        <Emblem className="passport__watermark" />
        <p className="passport__country">{passport.nationality}</p>
        <div className="passport__signature">
          <span className="passport__signature-ink">{toSignature(passport)}</span>
          <span className="passport__signature-label">所持人自署 / Signature of bearer</span>
        </div>
      </div>

      <div className="passport__page passport__page--data">
        <header className="passport__head">
          <div>
            <p className="passport__doc-type">PASSPORT 旅券</p>
            <p className="passport__issuer">{passport.nationality}</p>
          </div>
          <dl className="passport__number">
            <dt>
              パスポート番号 <span lang="en">Passport No.</span>
            </dt>
            <dd>{passport.passportNumber}</dd>
          </dl>
        </header>

        <div className="passport__body">
          <svg className="passport__photo" viewBox="0 0 70 90" role="img" aria-label="顔写真">
            <rect width="70" height="90" fill="#cfd8de" />
            <circle cx="35" cy="34" r="15" fill="#8795a1" />
            <path d="M6 90c0-22 12-34 29-34s29 12 29 34z" fill="#8795a1" />
          </svg>

          <dl className="passport__fields">
            <div>
              <dt>
                姓 <span lang="en">Surname</span>
              </dt>
              <dd>{passport.surname}</dd>
            </div>
            <div>
              <dt>
                名 <span lang="en">Given name</span>
              </dt>
              <dd>{passport.givenName}</dd>
            </div>
            <div className="passport__field--wide">
              <dt>
                国籍 <span lang="en">Nationality</span>
              </dt>
              <dd>
                {passport.nationality}（{passport.countryCode}）
              </dd>
            </div>
            <div>
              <dt>
                生年月日 <span lang="en">Date of birth</span>
              </dt>
              <dd>{formatDate(passport.birthDate)}</dd>
            </div>
            <div>
              <dt>
                有効期限 <span lang="en">Date of expiry</span>
              </dt>
              <dd>{formatDate(passport.expiryDate)}</dd>
            </div>
          </dl>
        </div>

        <div className="passport__mrz" aria-hidden="true">
          <span>{mrzLine1}</span>
          <span>{mrzLine2}</span>
        </div>
      </div>
    </article>
  );
}

/** 閉じたパスポートの表紙。カードの表示中に、後ろに置く。 */
export function PassportCover() {
  return (
    <div className="passport-cover" aria-hidden="true">
      <span className="passport-cover__title">NOVA REPUBLIC</span>
      <Emblem className="passport-cover__emblem" />
      <span className="passport-cover__title">PASSPORT</span>
      <span className="passport-cover__sub">旅券</span>
    </div>
  );
}
