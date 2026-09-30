import type { Rng } from './rng';

export type PassengerKind = 'regular' | 'rush' | 'tourist' | 'business' | 'vip';

export interface KindRules {
  label: string;
  /** Chance of this kind, out of 1. */
  weight: number;
  fareMultiplier: number;
  meterMultiplier: number;
  /** Added to the base chance of a tip for a clean cab. */
  tipBias: number;
}

export const PASSENGER_KINDS: Record<PassengerKind, KindRules> = {
  regular: { label: 'Passenger', weight: 0.55, fareMultiplier: 1, meterMultiplier: 1, tipBias: 0 },
  rush: { label: 'In a hurry', weight: 0.15, fareMultiplier: 1.4, meterMultiplier: 0.75, tipBias: 0 },
  tourist: { label: 'Sightseeing', weight: 0.15, fareMultiplier: 1.1, meterMultiplier: 1.3, tipBias: 0.05 },
  business: { label: 'Business', weight: 0.11, fareMultiplier: 1.2, meterMultiplier: 1, tipBias: 0.25 },
  vip: { label: 'VIP', weight: 0.04, fareMultiplier: 2, meterMultiplier: 1, tipBias: 0.2 },
};

export const VIP_NAMES = ['Shingai', 'Mark', 'Tiago', 'Denisha'];

export interface Passenger {
  name: string;
  kind: PassengerKind;
}

export function pickPassenger(rng: Rng, names: readonly string[]): Passenger {
  let roll = rng.next();
  let kind: PassengerKind = 'regular';
  for (const [k, rules] of Object.entries(PASSENGER_KINDS) as [PassengerKind, KindRules][]) {
    if (roll < rules.weight) {
      kind = k;
      break;
    }
    roll -= rules.weight;
  }
  return { kind, name: rng.pick(kind === 'vip' ? VIP_NAMES : names) };
}
