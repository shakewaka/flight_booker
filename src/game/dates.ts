/** YYYY-MM-DD を「2027年5月18日」の形にする。年は省略しない。 */
export function formatJapaneseDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return `${year}年${month}月${day}日`;
}
