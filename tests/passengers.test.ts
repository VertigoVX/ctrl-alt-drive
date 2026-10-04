import { describe, it, expect } from 'vitest';
import { GLOBAL_NAMES, NameDeck, Roster, VIP_NAMES, PASSENGER_KINDS } from '../src/core/passengers';
import { CITIES } from '../src/core/cities';
import { createGame, updateGame, GAME_RULES } from '../src/core/game';
import { createRng } from '../src/core/rng';

const lower = (n: string) => n.toLowerCase();
const tick = 1 / 60;
const idle = { throttle: 0, steer: 0 };

describe('VIP passengers', () => {
  it('are the eight named VIPs', () => {
    expect([...VIP_NAMES].sort()).toEqual(['Archal', 'Denisha', 'Duncan', 'Jordan', 'Mark', 'Shingai', 'Tiago', 'Tsebo']);
  });

  it('are rare (around 4%) and every one of them turns up', () => {
    const roster = new Roster(createRng(9), ['Ada', 'Ben'], ['Cy', 'Di']);
    const seen = new Set<string>();
    let vips = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const p = roster.pick();
      if (p.kind === 'vip') {
        vips++;
        seen.add(p.name);
        expect(VIP_NAMES).toContain(p.name);
      } else expect(VIP_NAMES).not.toContain(p.name);
    }
    expect(vips / n).toBeGreaterThan(0.03);
    expect(vips / n).toBeLessThan(0.05);
    expect(seen.size).toBe(VIP_NAMES.length);
  });

  it('cycle through all eight before any VIP comes back', () => {
    const roster = new Roster(createRng(4), ['Ada'], ['Cy']);
    const vipNames: string[] = [];
    while (vipNames.length < 16) {
      const p = roster.pick();
      if (p.kind === 'vip') vipNames.push(p.name);
    }
    expect(new Set(vipNames.slice(0, 8)).size).toBe(8);
    expect(new Set(vipNames.slice(8, 16)).size).toBe(8);
  });

  it('still pay double', () => {
    expect(PASSENGER_KINDS.vip.fareMultiplier).toBe(2);
  });
});

describe('the name pools', () => {
  it('has a big global pool of unique names (was 40 in total)', () => {
    expect(GLOBAL_NAMES.length).toBeGreaterThanOrEqual(200);
    const dupes = GLOBAL_NAMES.filter((n, i) => GLOBAL_NAMES.findIndex((m) => lower(m) === lower(n)) !== i);
    expect(dupes).toEqual([]);
  });

  it('keeps VIP names out of every regular pool, so a VIP name always means a VIP', () => {
    const vips = new Set(VIP_NAMES.map(lower));
    for (const n of GLOBAL_NAMES) expect(vips.has(lower(n))).toBe(false);
    for (const c of CITIES) for (const n of c.passengers) expect(vips.has(lower(n))).toBe(false);
  });

  describe.each(CITIES.map((c) => [c.id, c]))('%s', (_id, city) => {
    it('has a local pool of at least 35 names', () => {
      expect(city.passengers.length).toBeGreaterThanOrEqual(35);
    });

    it('has no name appearing twice across its local and global pools', () => {
      const all = [...city.passengers, ...GLOBAL_NAMES].map(lower);
      const dupes = all.filter((n, i) => all.indexOf(n) !== i);
      expect(dupes).toEqual([]);
    });

    it('gives 40 regular fares in a row without a single repeated name', () => {
      for (let seed = 1; seed <= 25; seed++) {
        const roster = new Roster(createRng(seed), city.passengers);
        const names: string[] = [];
        while (names.length < 40) {
          const p = roster.pick();
          if (p.kind !== 'vip') names.push(p.name);
        }
        expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
      }
    });
  });
});

describe('NameDeck (draws without replacement)', () => {
  const names = Array.from({ length: 40 }, (_, i) => `N${i}`);

  it('deals every name once before any name repeats', () => {
    const deck = new NameDeck(createRng(1), names);
    const first = Array.from({ length: 40 }, () => deck.next());
    expect(new Set(first).size).toBe(40);
  });

  it('never brings a name back within 10 draws, even across a reshuffle', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const deck = new NameDeck(createRng(seed), names);
      const lastSeen = new Map<string, number>();
      for (let i = 0; i < 600; i++) {
        const n = deck.next();
        if (lastSeen.has(n)) expect(i - lastSeen.get(n)!).toBeGreaterThanOrEqual(11);
        lastSeen.set(n, i);
      }
    }
  });

  it('is deterministic for a seed, and different seeds deal differently', () => {
    const a = new NameDeck(createRng(5), names), b = new NameDeck(createRng(5), names), c = new NameDeck(createRng(6), names);
    const draw = (d: NameDeck) => Array.from({ length: 15 }, () => d.next());
    expect(draw(a)).toEqual(draw(b));
    expect(draw(new NameDeck(createRng(5), names))).not.toEqual(draw(c));
  });

  it('copes with tiny pools', () => {
    const one = new NameDeck(createRng(1), ['Solo']);
    expect([one.next(), one.next(), one.next()]).toEqual(['Solo', 'Solo', 'Solo']);
    const two = new NameDeck(createRng(1), ['A', 'B']);
    const drawn = Array.from({ length: 6 }, () => two.next());
    expect(new Set(drawn.slice(0, 2)).size).toBe(2);
  });
});

describe('a whole shift in a real game', () => {
  function deliver(g: ReturnType<typeof createGame>, n: number) {
    const names: string[] = [];
    for (let t = 0; t < GAME_RULES.countdown + 0.05; t += tick) updateGame(g, idle, tick);
    for (let i = 0; i < n; i++) {
      g.avs = [];
      g.invulnerable = 1e9;
      if (g.job.kind !== 'vip') names.push(g.job.passenger);
      g.taxi.pos = { ...g.job.pickup };
      updateGame(g, idle, tick);
      g.taxi.pos = { ...g.job.dropoff };
      updateGame(g, idle, tick);
    }
    return names;
  }

  it.each(CITIES.map((c) => [c.id, c]))('%s: 50 fares and no name twice (except VIP rarities)', (_id, city) => {
    const names = deliver(createGame({ seed: 11, city }), 50);
    expect(names.length).toBeGreaterThan(40);
    expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
  });

  it('is deterministic: the same seed hands out the same passengers', () => {
    const city = CITIES[1];
    expect(deliver(createGame({ seed: 3, city }), 15)).toEqual(deliver(createGame({ seed: 3, city }), 15));
    expect(deliver(createGame({ seed: 4, city }), 15)).not.toEqual(deliver(createGame({ seed: 3, city }), 15));
  });
});
