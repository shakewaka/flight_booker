import { describe, expect, it } from 'vitest';
import { sampleRound } from '../data/sampleRound';
import { findScenarioProblems } from './scenario';
import { prototypeSettings } from './settings';
import type { Flight, FlightOffers, RoundScenario } from './types';

const participantCount = 1 + prototypeSettings.npcCount;
const FLIGHT = 'HND-TSA-0910';

function offerOf(flightId: string): FlightOffers {
  const offer = sampleRound.offers.find((candidate) => candidate.flightId === flightId);
  if (!offer) throw new Error(flightId);
  return offer;
}

/** 1つの便の販売条件だけを書き換えた出題データを作る。 */
function withOffer(flightId: string, change: Partial<FlightOffers>): RoundScenario {
  return {
    ...sampleRound,
    offers: sampleRound.offers.map((offer) =>
      offer.flightId === flightId ? { ...offer, ...change } : offer,
    ),
  };
}

/** 1つの便だけを書き換えた出題データを作る。 */
function withFlight(flightId: string, change: Partial<Flight>): RoundScenario {
  return {
    ...sampleRound,
    flights: sampleRound.flights.map((flight) =>
      flight.id === flightId ? { ...flight, ...change } : flight,
    ),
  };
}

describe('findScenarioProblems', () => {
  it('用意した出題データは、仮の参加人数で問題なし', () => {
    expect(findScenarioProblems(sampleRound, participantCount)).toEqual([]);
  });

  it('サイト3の下限がサイト1と同額だと、問題として返す', () => {
    const { site1, site3 } = offerOf(FLIGHT);
    const scenario = withOffer(FLIGHT, { site3: { ...site3, minPrice: site1.price } });
    expect(findScenarioProblems(scenario, participantCount)).toEqual([
      `便 ${FLIGHT}：サイト3の下限がサイト1より高くない`,
    ]);
  });

  it('サイト1がサイト2と同額だと、問題として返す', () => {
    const { site1 } = offerOf(FLIGHT);
    const scenario = withOffer(FLIGHT, { site2: { price: site1.price } });
    expect(findScenarioProblems(scenario, participantCount)).toEqual([
      `便 ${FLIGHT}：サイト1がサイト2より安くない`,
    ]);
  });

  it('サイト1の販売枠が座席数を超えると、問題として返す', () => {
    const { site1 } = offerOf(FLIGHT);
    const scenario = withOffer(FLIGHT, { site1: { ...site1, fareQuota: 7 } });
    expect(findScenarioProblems(scenario, participantCount)).toEqual([
      `便 ${FLIGHT}：サイト1の販売枠が1〜座席数の範囲にない`,
    ]);
  });

  it('ラウンド最高値を1円でも超える価格があると、問題として返す', () => {
    const { site3 } = offerOf(FLIGHT);
    const scenario = withOffer(FLIGHT, { site3: { ...site3, maxPrice: sampleRound.maxPrice + 1 } });
    expect(findScenarioProblems(scenario, participantCount)).toEqual([
      `便 ${FLIGHT}：ラウンド最高値を超える価格がある`,
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
      offers: sampleRound.offers.filter((offer) => offer.flightId !== 'HND-TSA-1620'),
    };
    expect(findScenarioProblems(scenario, participantCount)).toEqual([
      '便 HND-TSA-1620：販売条件が0件ある（1件にする）',
    ]);
  });

  it('時差を考えると到着が出発より前になる便を、問題として返す', () => {
    // 西行きは現地時刻が1時間戻る。羽田 09:10 発 → 台北 08:05 着は、時差を足しても -5分。
    expect(findScenarioProblems(withFlight(FLIGHT, { arrivalTime: '08:05' }), 14)).toEqual([
      `便 ${FLIGHT}：時差を考えると、到着が出発より前になっている`,
    ]);
    // 現地時刻では出発より前に見える 08:11 着でも、時差を足すと所要1分で、データとしては通る。
    expect(findScenarioProblems(withFlight(FLIGHT, { arrivalTime: '08:11' }), 14)).toEqual([]);
  });
});
