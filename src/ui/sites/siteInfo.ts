import type { SiteId } from '../../game/types';

/** 予約サイトの名前と特徴。サイト名は企画書の仮称で、正式な名前は後で決める。 */
export const SITE_INFO: Record<
  SiteId,
  { name: string; tag: string; feature: string; host: string }
> = {
  site1: {
    name: '予約サイト1',
    tag: '最安',
    feature: '最安。予約が確定するまで席を確保しない',
    host: 'site1.flight-game.invalid',
  },
  site2: {
    name: '予約サイト2',
    tag: '確保',
    feature: '手続きの途中で席と価格を確保する',
    host: 'site2.flight-game.invalid',
  },
  site3: {
    name: '予約サイト3',
    tag: '変動',
    feature: '閲覧人数で価格が変わる。確定した瞬間の価格になる',
    host: 'site3.flight-game.invalid',
  },
};

export const SITE_IDS: SiteId[] = ['site1', 'site2', 'site3'];
