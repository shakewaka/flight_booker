import type { Participant } from '../game/types';

// NPC（コンピューターが操作する対戦相手）の表示名。すべて架空。
// 行動の性格（急ぐ、慎重など）は、NPCを実装するときに決める。
const NPC_NAMES = [
  'ミナト',
  'カエデ',
  'ソウタ',
  'ユヅキ',
  'ハルカ',
  'レン',
  'シオリ',
  'タクミ',
  'ナギサ',
  'コハル',
  'イツキ',
  'アオイ',
];

/** 人間1人と、指定した人数のNPCを作る。 */
export function createParticipants(npcCount: number): Participant[] {
  if (!Number.isInteger(npcCount) || npcCount < 0 || npcCount > NPC_NAMES.length) {
    throw new Error(`NPCの人数は0〜${NPC_NAMES.length}人で指定してください：${npcCount}`);
  }

  const human: Participant = { id: 'player', name: 'あなた', kind: 'human' };
  const npcs = NPC_NAMES.slice(0, npcCount).map((name, index): Participant => ({
    id: `npc-${index + 1}`,
    name,
    kind: 'npc',
  }));
  return [human, ...npcs];
}
