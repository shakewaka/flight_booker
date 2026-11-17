import type { BookingEntry, PassengerInput, PaymentInput } from './booking';
import { findTripViolations, type TripViolation } from './requirements';
import type { RoundScenario } from './types';

// ラウンド終了時の判定。予約の入力内容をパスポート・カードと、便を条件メモと照らし合わせる。
// ここでは「どこが合わなかったか」を見つけるだけで、減点の数値や順位への反映は扱わない
// （分類・数値・反映方法は未決定。docs/decisions.md「実装前に詰める項目」）。

export type InputField = keyof PassengerInput | keyof PaymentInput;

export type InputMistake = {
  field: InputField;
  /** 入力された値。 */
  entered: string;
  /** パスポート・カードに書かれている値。 */
  expected: string;
};

export type BookingJudgement = {
  inputMistakes: InputMistake[];
  tripViolations: TripViolation[];
};

/**
 * 表記の違いをそろえる（仮）。大文字・小文字、全角・半角、前後や連続する空白の違いは誤りにしない。
 * どこまでを表記の違いとして許すかは、減点の設計と一緒に正式に決める。
 */
function normalizeText(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toUpperCase();
}

/** 日付・番号は、数字と英字だけを比べる（区切りの「/」「-」や空白の違いは誤りにしない）。 */
function normalizeCode(value: string): string {
  return normalizeText(value).replace(/[^0-9A-Z]/g, '');
}

type Check = { field: InputField; entered: string; expected: string; accepted?: string[] };

/** 入力ミスを見つける。 */
export function findInputMistakes(entry: BookingEntry, scenario: RoundScenario): InputMistake[] {
  const { passport, card } = scenario;
  const { passenger, payment } = entry;
  const toSlashDate = (iso: string) => iso.replaceAll('-', '/');

  const textChecks: Check[] = [
    { field: 'surname', entered: passenger.surname, expected: passport.surname },
    { field: 'givenName', entered: passenger.givenName, expected: passport.givenName },
    {
      field: 'nationality',
      entered: passenger.nationality,
      expected: passport.nationality,
      // 国名の代わりに、パスポートに書かれた国のコードを入れても誤りにしない（仮）。
      accepted: [passport.countryCode],
    },
    { field: 'holderName', entered: payment.holderName, expected: card.holderName },
  ];
  const codeChecks: Check[] = [
    { field: 'birthDate', entered: passenger.birthDate, expected: toSlashDate(passport.birthDate) },
    {
      field: 'passportNumber',
      entered: passenger.passportNumber,
      expected: passport.passportNumber,
    },
    {
      field: 'passportExpiry',
      entered: passenger.passportExpiry,
      expected: toSlashDate(passport.expiryDate),
    },
    { field: 'cardNumber', entered: payment.cardNumber, expected: card.number },
    { field: 'cardExpiry', entered: payment.cardExpiry, expected: card.expiry },
    { field: 'securityCode', entered: payment.securityCode, expected: card.securityCode },
  ];

  const mistakes: InputMistake[] = [];
  const judge = (checks: Check[], normalize: (value: string) => string) => {
    for (const check of checks) {
      const entered = normalize(check.entered);
      const allowed = [check.expected, ...(check.accepted ?? [])].map(normalize);
      if (!allowed.includes(entered)) {
        mistakes.push({ field: check.field, entered: check.entered, expected: check.expected });
      }
    }
  };
  judge(textChecks, normalizeText);
  judge(codeChecks, normalizeCode);

  // 画面の入力順に並べる。
  const order: InputField[] = [
    'surname',
    'givenName',
    'birthDate',
    'nationality',
    'passportNumber',
    'passportExpiry',
    'holderName',
    'cardNumber',
    'cardExpiry',
    'securityCode',
  ];
  return mistakes.sort((a, b) => order.indexOf(a.field) - order.indexOf(b.field));
}

/** 予約1件を判定する。 */
export function judgeBooking(entry: BookingEntry, scenario: RoundScenario): BookingJudgement {
  const flight = scenario.flights.find((candidate) => candidate.id === entry.flightId);
  return {
    inputMistakes: findInputMistakes(entry, scenario),
    tripViolations: flight ? findTripViolations(flight, scenario.requirements) : [],
  };
}
