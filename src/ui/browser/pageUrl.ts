import type { SearchQuery } from '../../game/search';
import type { RoundScenario, SiteId } from '../../game/types';
import { SITE_IDS, SITE_INFO } from '../sites/siteInfo';
import type { TabPage } from './tabs';

// ゲーム内ブラウザのアドレス（URL）。画面の状態だけを扱い、実際のページは開かない。
// 比較サイトの検索条件をURLに入れておき、そのURLを別のタブで開くと、同じ条件で検索し直せる。

const COMPARE_HOST = 'compare.flight-game.invalid';
const COMPARE_HOME = `https://${COMPARE_HOST}/`;

/** 比較サイトのURL。検索条件があれば、検索結果のページのURLにする。 */
export function compareUrl(query?: SearchQuery): string {
  if (!query) return COMPARE_HOME;
  const params = new URLSearchParams({
    from: query.originCode,
    to: query.destinationCode,
    dep: query.departureDate,
    arr: query.arrivalDate,
    bag: String(query.checkedBaggageKg),
    via: query.nonstopOnly ? 'nonstop' : 'any',
  });
  return `https://${COMPARE_HOST}/search?${params.toString()}`;
}

/** 予約サイトの手続きのURL。 */
export function bookingUrl(site: SiteId, flightId: string): string {
  return `https://${SITE_INFO[site].host}/booking/${flightId.toLowerCase()}`;
}

/** タブで開いているページのURL。 */
export function pageUrl(page: TabPage): string {
  switch (page.kind) {
    case 'compare':
      return compareUrl(page.query);
    case 'booking':
      return bookingUrl(page.site, page.flightId);
    case 'not-found':
      return page.url;
  }
}

/** 入力されたURLの「https://」や前後の空白を除く。 */
function normalize(input: string): string {
  return input.trim().replace(/^https?:\/\//i, '');
}

/**
 * アドレスバーに入力されたURLから、開くページを決める。
 * 比較サイトの検索結果のURLなら、その検索条件で検索し直すページにする。
 * 知らないURLは、ページが見つからない表示にする（実在のサイトは開かない）。
 */
export function parsePageUrl(input: string, scenario: RoundScenario): TabPage {
  const text = normalize(input);
  let url: URL;
  try {
    url = new URL(`https://${text}`);
  } catch {
    return { kind: 'not-found', url: input.trim() };
  }
  const host = url.hostname.toLowerCase();

  if (host === COMPARE_HOST) {
    if (url.pathname === '/' || url.pathname === '') return { kind: 'compare' };
    if (url.pathname === '/search') {
      const get = (key: string) => url.searchParams.get(key) ?? '';
      const baggage = Number(get('bag'));
      return {
        kind: 'compare',
        query: {
          originCode: get('from').toUpperCase(),
          destinationCode: get('to').toUpperCase(),
          departureDate: get('dep'),
          arrivalDate: get('arr'),
          checkedBaggageKg: Number.isFinite(baggage) && baggage > 0 ? baggage : 0,
          nonstopOnly: get('via') === 'nonstop',
        },
      };
    }
  }

  const site = SITE_IDS.find((id) => SITE_INFO[id].host === host);
  const match = /^\/booking\/([^/]+)\/?$/.exec(url.pathname);
  if (site && match) {
    const flight = scenario.flights.find(
      (candidate) => candidate.id.toLowerCase() === decodeURIComponent(match[1]).toLowerCase(),
    );
    if (flight) return { kind: 'booking', site, flightId: flight.id };
  }

  return { kind: 'not-found', url: `https://${text}` };
}
