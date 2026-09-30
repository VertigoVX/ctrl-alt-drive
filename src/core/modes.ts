export type ModeId = 'normal' | 'hard' | 'extreme';

export interface ModeRules {
  id: ModeId;
  name: string;
  blurb: string;
  lives: number;
  /** Whether a cab at zero health is wrecked (costs a life). */
  wrecks: boolean;
  damageScale: number;
  /** Whether losing a cab to the fleet gives you a repaired one. */
  repairOnCaught: boolean;
  avSpeed: number;
  /** Multiplies the time between spawns (lower = more often). */
  spawnScale: number;
  maxAvsBonus: number;
  meterScale: number;
  cashMultiplier: number;
}

export const MODES: Record<ModeId, ModeRules> = {
  normal: {
    id: 'normal', name: 'Normal', blurb: 'Three cabs. Dents cost you tips, never the cab.',
    lives: 3, wrecks: false, damageScale: 1, repairOnCaught: true,
    avSpeed: 1, spawnScale: 1, maxAvsBonus: 0, meterScale: 1, cashMultiplier: 1,
  },
  hard: {
    id: 'hard', name: 'Hard', blurb: 'Two cabs. Wreck one and it’s gone. Faster fleet. Pays 1.5×.',
    lives: 2, wrecks: true, damageScale: 1, repairOnCaught: true,
    avSpeed: 1.08, spawnScale: 0.85, maxAvsBonus: 1, meterScale: 0.9, cashMultiplier: 1.5,
  },
  extreme: {
    id: 'extreme', name: 'Extreme', blurb: 'Two cabs, heavier damage that carries over. Pays 2×.',
    lives: 2, wrecks: true, damageScale: 1.5, repairOnCaught: false,
    avSpeed: 1.15, spawnScale: 0.7, maxAvsBonus: 2, meterScale: 0.8, cashMultiplier: 2,
  },
};

export const MODE_IDS: ModeId[] = ['normal', 'hard', 'extreme'];
