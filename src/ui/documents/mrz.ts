import type { PassportData } from '../../game/types';

// パスポート下部の機械読取欄（MRZ：機械が読むための2行の文字列）を、表示用に組み立てる。
// 見た目を実物に近づけるための飾りで、予約の入力や判定には使わない。

const LINE_LENGTH = 44;
const WEIGHTS = [7, 3, 1];

function charValue(char: string): number {
  if (char >= '0' && char <= '9') return Number(char);
  if (char >= 'A' && char <= 'Z') return char.charCodeAt(0) - 55;
  return 0;
}

function checkDigit(text: string): string {
  let sum = 0;
  for (let i = 0; i < text.length; i += 1) {
    sum += charValue(text[i]) * WEIGHTS[i % 3];
  }
  return String(sum % 10);
}

function toMrzText(text: string): string {
  return text.toUpperCase().replace(/[^A-Z0-9]/g, '<');
}

/** YYYY-MM-DD を YYMMDD にする。 */
function toMrzDate(isoDate: string): string {
  return isoDate.slice(2).replaceAll('-', '');
}

export function buildMrzLines(passport: PassportData): [string, string] {
  const names = `${toMrzText(passport.surname)}<<${toMrzText(passport.givenName)}`;
  const line1 = `P<${passport.countryCode}${names}`.padEnd(LINE_LENGTH, '<').slice(0, LINE_LENGTH);

  const number = toMrzText(passport.passportNumber).padEnd(9, '<').slice(0, 9);
  const birth = toMrzDate(passport.birthDate);
  const expiry = toMrzDate(passport.expiryDate);
  const personal = '<'.repeat(14);

  const numberPart = number + checkDigit(number);
  const birthPart = birth + checkDigit(birth);
  const expiryPart = expiry + checkDigit(expiry);
  const personalPart = personal + checkDigit(personal);
  const composite = checkDigit(numberPart + birthPart + expiryPart + personalPart);

  const line2 = `${numberPart}${passport.countryCode}${birthPart}<${expiryPart}${personalPart}${composite}`;
  return [line1, line2];
}
