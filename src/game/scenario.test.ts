import { describe, expect, it } from 'vitest';
import { sampleRound } from '../data/sampleRound';
import { findScenarioProblems } from './scenario';
import { prototypeSettings } from './settings';
import type { FlightOffers, RoundScenario } from './types';

const participantCount = 1 + prototypeSettings.npcCount;

/** 1つの便の販売条件だけを書き換えた出題データを作る。 */
function withOffer(flightId: string, change: Partial<FlightOffers>): RoundScenario {
  return {
    ...sampleRound,
    offers: sampleRound.offers.map((offer) =>
      offer.flightId === flightId ? { ...offer, ...change } : offer,
    ),
  };
}

describe('findScenarioProblems', () => {
  it('用意した出題データは、仮の参加人数で問題なし', () => {
    expect(findScenarioProblems(sampleRound, participantCount)).toEqual([]);
  });

  it('サイト3の下限がサイト1と同額だと、問題として返す', () => {
    const scenario = withOffer('HNU-HSO-0810', { site3: { minPrice: 18_000, maxPrice: 30_000 } });
    expect(findScenarioProblems(scenario, participantCount)).toEqual([
      '便 HNU-HSO-0810：サイト3の下限がサイト1より高くない',
    ]);
  });

  it('サイト1がサイト2と同額だと、問題として返す', () => {
    const scenario = withOffer('HNU-HSO-0810', { site2: { price: 18_000 } });
    expect(findScenarioProblems(scenario, participantCount)).toEqual([
      '便 HNU-HSO-0810：サイト1がサイト2より安くない',
    ]);
  });

  it('サイト1の販売枠が座席数を超えると、問題として返す', () => {
    const scenario = withOffer('HNU-HSO-0810', { site1: { price: 18_000, fareQuota: 7 } });
    expect(findScenarioProblems(scenario, participantCount)).toEqual([
      '便 HNU-HSO-0810：サイト1の販売枠が1〜座席数の範囲にない',
    ]);
  });

  it('ラウンド最高値を1円でも超える価格があると、問題として返す', () => {
    const scenario = withOffer('HNU-HSO-1105', {
      site3: { minPrice: 24_000, maxPrice: sampleRound.maxPrice + 1 },
    });
    expect(findScenarioProblems(scenario, participantCount)).toEqual([
      '便 HNU-HSO-1105：ラウンド最高値を超える価格がある',
    ]);
  });

  it('条件を満たす便の座席がちょうど人数分なら問題なし、1人多いと足りない', () => {
    // 条件を満たす便は 6席 と 8席 の2便で、合計14席。
    expect(findScenarioProblems(sampleRound, 14)).toEqual([]);
    expect(findScenarioProblems(sampleRound, 15)).toEqual([
      '条件を満たす便の座席が14席で、参加者15人に足りない',
    ]);
  });

  it('販売条件のない便があると、問題として返す', () => {
    const scenario: RoundScenario = {
      ...sampleRound,
      offers: sampleRound.offers.filter((offer) => offer.flightId !== 'HNU-HSO-1320'),
    };
    expect(findScenarioProblems(scenario, participantCount)).toEqual([
      '便 HNU-HSO-1320：販売条件が0件ある（1件にする）',
    ]);
  });
});
