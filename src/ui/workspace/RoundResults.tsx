import type { InputField } from '../../game/judge';
import type { TripViolation } from '../../game/requirements';
import type { RoundResultRow } from '../../game/results';
import { formatYen } from '../format';
import { SITE_INFO } from '../sites/siteInfo';
import './round-results.css';

type RoundResultsProps = {
  rows: RoundResultRow[];
  /** 時間切れの集計金額。 */
  timeoutAmount: number;
  playerId: string;
  roundNumber: number;
  roundCount: number;
  /** 総合順位へ進む。 */
  onNext: () => void;
};

const FIELD_LABEL: Record<InputField, string> = {
  surname: '姓',
  givenName: '名',
  birthDate: '生年月日',
  nationality: '国籍',
  passportNumber: 'パスポート番号',
  passportExpiry: 'パスポートの有効期限',
  holderName: 'カード名義',
  cardNumber: 'カード番号',
  cardExpiry: 'カードの有効期限',
  securityCode: '確認コード',
};

const PAYMENT_FIELDS: InputField[] = ['holderName', 'cardNumber', 'cardExpiry', 'securityCode'];

/** 旅行が成り立たない条件違反。 */
const FATAL: TripViolation[] = ['origin', 'destination', 'departureDate'];

const VIOLATION_LABEL: Record<TripViolation, string> = {
  origin: '出発地が条件と違う',
  destination: '目的地が条件と違う',
  departureDate: '出発日が条件と違う',
  departureTime: '出発が指定の時刻より早い',
  arrivalTime: '到着が指定の時刻を超過',
  checkedBaggage: '受託手荷物が足りない',
  operatingAirline: '運航が不可の航空会社',
  arrivalTerminal: '到着ターミナルが条件と違う',
};

/** 予約タイムを表示する。計測はミリ秒、表示は小数第2位まで。 */
function formatTime(ms: number): string {
  return `${(ms / 1000).toFixed(2)}秒`;
}

/**
 * ラウンド結果（企画書「12 ラウンド結果と総合結果の表示」の「今回のラウンド順位」）。
 * 集計金額（購入額＋減点）の安い順、同額なら予約タイムの短い順。購入額と減点は分けて示す。
 */
export function RoundResults({
  rows,
  timeoutAmount,
  playerId,
  roundNumber,
  roundCount,
  onNext,
}: RoundResultsProps) {
  const player = rows.find((row) => row.participant.id === playerId);

  return (
    <section className="results" aria-labelledby="results-title">
      <header className="results__head">
        <p className="results__round">
          ROUND {roundNumber} / {roundCount} 終了
        </p>
        <h2 id="results-title">今回のラウンド順位</h2>
      </header>

      <div className="results__table-wrap">
        <table className="results__table">
          <thead>
            <tr>
              <th scope="col">順位</th>
              <th scope="col">名前</th>
              <th scope="col">購入額</th>
              <th scope="col">減点</th>
              <th scope="col">集計金額</th>
              <th scope="col">予約タイム</th>
              <th scope="col">利用サイト</th>
              <th scope="col">結果</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.participant.id}
                className={row.participant.id === playerId ? 'results__me' : undefined}
              >
                <td className="results__rank">{row.rank}</td>
                <th scope="row">{row.participant.name}</th>
                <td className="results__num">
                  {row.purchasePrice === null ? '—' : formatYen(row.purchasePrice)}
                </td>
                <td className="results__num results__penalty">
                  {row.penalty && row.penalty.total > 0 ? `+${formatYen(row.penalty.total)}` : '—'}
                </td>
                <td className="results__num results__amount">{formatYen(row.amount)}</td>
                <td className="results__num">{formatTime(row.timeMs)}</td>
                <td>{row.site ? SITE_INFO[row.site].name : '—'}</td>
                <td>
                  <Outcome row={row} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {player && player.penalty && (
        <div className="results__detail">
          <h3>あなたの予約の確認</h3>
          {player.inputMistakes.length === 0 && player.tripViolations.length === 0 ? (
            <p>入力ミス・条件違反はありませんでした。</p>
          ) : (
            <ul>
              {player.penalty.items.map((item) =>
                item.kind === 'violation' ? (
                  <li key={item.violation}>
                    {VIOLATION_LABEL[item.violation]}
                    <span className="results__item-amount">
                      {FATAL.includes(item.violation)
                        ? '旅行が成り立たないため、時間切れと同じ扱い'
                        : `+${formatYen(item.amount)}`}
                    </span>
                  </li>
                ) : (
                  <li key={item.mistake.field}>
                    {FIELD_LABEL[item.mistake.field]}が
                    {PAYMENT_FIELDS.includes(item.mistake.field) ? 'カード' : 'パスポート'}と不一致
                    <span className="results__values">
                      （入力：{item.mistake.entered || '空欄'} ／ 正しくは：{item.mistake.expected}
                      ）
                    </span>
                    <span className="results__item-amount">+{formatYen(item.amount)}</span>
                  </li>
                ),
              )}
            </ul>
          )}
        </div>
      )}

      <p className="results__note">
        集計金額は購入額に減点を足した額で、時間切れの金額が上限です。減点は、条件違反1つにつき最高値の20%、本人確認の入力ミスは10%、カードの入力ミスは5%です（仮）。時間切れと、出発地・目的地・出発日の違う予約は、条件を満たす便の最高値（
        {formatYen(timeoutAmount)}）で集計します。
      </p>
      <div className="results__actions">
        <button type="button" onClick={onNext} autoFocus>
          総合順位へ
        </button>
      </div>
    </section>
  );
}

function Outcome({ row }: { row: RoundResultRow }) {
  if (row.status === 'timeout')
    return <span className="results__tag results__tag--bad">時間切れ</span>;
  if (row.status === 'void')
    return <span className="results__tag results__tag--bad">旅行不成立</span>;
  const issues = [
    row.inputMistakes.length > 0 && `入力ミス${row.inputMistakes.length}件`,
    row.tripViolations.length > 0 && `条件違反${row.tripViolations.length}件`,
  ].filter(Boolean);
  if (issues.length === 0) return <span className="results__tag results__tag--good">成功</span>;
  return <span className="results__tag results__tag--warn">{issues.join('・')}</span>;
}
