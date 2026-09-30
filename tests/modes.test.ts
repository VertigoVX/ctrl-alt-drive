import { describe, it, expect } from 'vitest';
import { MODES, type ModeId } from '../src/core/modes';
import { pickPassenger, VIP_NAMES, PASSENGER_KINDS } from '../src/core/passengers';
import { createGame, updateGame, GAME_RULES, type GameState, type GameEvent } from '../src/core/game';
import { createRng } from '../src/core/rng';
import { drivableNeighbours, roadTiles, tileCenter, isDrivable, tileAt } from '../src/core/city';

const tick = 1 / 60;
function play(mode: ModeId, seed = 42): GameState {
  const g = createGame({ seed, mode });
  g.avs = [];
  for (let t = 0; t < GAME_RULES.countdown + 0.05; t += tick) updateGame(g, { throttle: 0, steer: 0 }, tick);
  g.avs = [];
  return g;
}
const run = (g: GameState, s: number, input = { throttle: 0, steer: 0 }) => {
  const e: GameEvent[] = [];
  for (let t = 0; t < s; t += tick) e.push(...updateGame(g, input, tick));
  return e;
};
/** Point the cab at a wall one tile away, at full speed. */
function slam(g: GameState) {
  const m = g.map;
  for (const t of roadTiles(m)) {
    if (isDrivable(tileAt(m, t.x + 1, t.y))) continue;
    if (!isDrivable(tileAt(m, t.x - 1, t.y))) continue;
    g.taxi.pos = tileCenter(m, t.x, t.y);
    g.taxi.heading = 0;
    g.taxi.speed = 270;
    g.powerups = [];
    return run(g, 0.3, { throttle: 1, steer: 0 });
  }
  throw new Error('no wall found');
}

describe('game modes', () => {
  it('Normal is the classic game: three cabs, damage never wrecks you', () => {
    expect(MODES.normal.lives).toBe(3);
    expect(MODES.normal.wrecks).toBe(false);
    expect(MODES.normal.cashMultiplier).toBe(1);
  });

  it('Hard and Extreme give two cabs, can wreck, and pay more', () => {
    for (const m of [MODES.hard, MODES.extreme]) {
      expect(m.lives).toBe(2);
      expect(m.wrecks).toBe(true);
    }
    expect(MODES.hard.cashMultiplier).toBeGreaterThan(1);
    expect(MODES.extreme.cashMultiplier).toBeGreaterThan(MODES.hard.cashMultiplier);
  });

  it('each mode is harder than the last', () => {
    expect(MODES.hard.avSpeed).toBeGreaterThan(MODES.normal.avSpeed);
    expect(MODES.extreme.avSpeed).toBeGreaterThan(MODES.hard.avSpeed);
    expect(MODES.extreme.damageScale).toBeGreaterThan(MODES.hard.damageScale);
    expect(MODES.hard.meterScale).toBeLessThan(MODES.normal.meterScale);
  });

  it('starts the game with the mode’s lives and a healthy cab', () => {
    expect(createGame({ seed: 1, mode: 'hard' }).lives).toBe(2);
    expect(createGame({ seed: 1, mode: 'hard' }).health).toBe(100);
    expect(createGame({ seed: 1 }).mode).toBe('normal');
  });
});

describe('cab damage', () => {
  it('a hard crash costs a big chunk of health', () => {
    const g = play('hard');
    const e = slam(g);
    expect(g.health).toBeLessThan(75);
    expect(e.map((x) => x.type)).toContain('damage');
  });

  it('a gentle nudge does no damage', () => {
    const g = play('hard');
    const m = g.map;
    const t = roadTiles(m).find((p) => !isDrivable(tileAt(m, p.x + 1, p.y)))!;
    g.taxi.pos = tileCenter(m, t.x, t.y);
    g.taxi.heading = 0;
    run(g, 1, { throttle: 0.3, steer: 0 });
    expect(g.health).toBe(100);
  });

  it('Extreme crashes hurt more than Hard ones', () => {
    const hard = play('hard');
    const extreme = play('extreme');
    slam(hard);
    slam(extreme);
    expect(100 - extreme.health).toBeGreaterThan(100 - hard.health);
  });

  it('in Hard, a wrecked cab costs a life and you get a fresh one', () => {
    const g = play('hard');
    g.health = 5;
    const e = slam(g);
    expect(e.map((x) => x.type)).toContain('wrecked');
    expect(g.lives).toBe(1);
    expect(g.health).toBe(100);
  });

  it('in Normal, damage never costs a life', () => {
    const g = play('normal');
    g.health = 5;
    slam(g);
    expect(g.lives).toBe(3);
    expect(g.health).toBe(0);
  });

  it('Hard repairs the cab when you are caught; Extreme does not', () => {
    for (const [mode, expected] of [['hard', 100], ['extreme', 40]] as const) {
      const g = play(mode);
      g.health = 40;
      g.avs = [createGame({ seed: 42 }).avs[0]];
      g.avs[0].pos = { ...g.taxi.pos };
      run(g, tick * 2);
      expect(g.health).toBe(expected);
    }
  });

  it('the wrench power-up repairs damage', () => {
    const g = play('hard');
    g.health = 30;
    g.powerups = [{ kind: 'repair', pos: { ...g.taxi.pos } }];
    run(g, tick);
    expect(g.health).toBe(30 + GAME_RULES.repairAmount);
  });
});

describe('clean-cab bonuses', () => {
  function deliver(g: GameState) {
    g.taxi.pos = { ...g.job.pickup };
    run(g, tick);
    g.taxi.pos = { ...g.job.dropoff };
    return run(g, tick);
  }

  it('fares finished in mint condition sometimes earn a tip or drop a perk nearby', () => {
    let tips = 0, perks = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const g = play('normal', seed);
      const kinds = deliver(g).map((x) => x.type);
      if (kinds.includes('tip')) tips++;
      if (kinds.includes('perk')) perks++;
    }
    expect(tips).toBeGreaterThan(10);
    expect(perks).toBeGreaterThan(3);
  });

  it('a battered cab never earns them', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const g = play('normal', seed);
      g.health = 60;
      const kinds = deliver(g).map((x) => x.type);
      expect(kinds).not.toContain('tip');
      expect(kinds).not.toContain('perk');
    }
  });

  it('tips are added to earnings', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const g = play('normal', seed);
      const e = deliver(g);
      const tip = e.find((x) => x.type === 'tip');
      const fare = e.find((x) => x.type === 'dropoff');
      if (tip && tip.type === 'tip' && fare && fare.type === 'dropoff') {
        expect(g.score).toBe(fare.fare + tip.amount);
        return;
      }
    }
    throw new Error('expected at least one tip');
  });

  it('Hard and Extreme multiply the cash you earn', () => {
    const normal = play('normal', 5);
    const hard = play('hard', 5);
    const fareOf = (g: GameState) => {
      g.job.timeLeft = 10;
      const e = deliver(g).find((x) => x.type === 'dropoff');
      return e && e.type === 'dropoff' ? e.fare : 0;
    };
    // Same seed → same first passenger, so the only difference is the mode.
    expect(fareOf(hard)).toBe(Math.round(fareOf(normal) * MODES.hard.cashMultiplier));
  });
});

describe('passengers', () => {
  const names = ['Ada', 'Ben'];
  it('VIPs are rare (around 4%) and always one of the four', () => {
    const rng = createRng(9);
    let vips = 0;
    for (let i = 0; i < 5000; i++) {
      const p = pickPassenger(rng, names);
      if (p.kind === 'vip') {
        vips++;
        expect(VIP_NAMES).toContain(p.name);
      } else expect(names).toContain(p.name);
    }
    expect(vips / 5000).toBeGreaterThan(0.02);
    expect(vips / 5000).toBeLessThan(0.07);
  });

  it('VIPs pay double', () => {
    expect(PASSENGER_KINDS.vip.fareMultiplier).toBe(2);
    expect(PASSENGER_KINDS.regular.fareMultiplier).toBe(1);
  });

  it('passengers in a hurry pay more but give you less time; tourists are relaxed', () => {
    expect(PASSENGER_KINDS.rush.fareMultiplier).toBeGreaterThan(1);
    expect(PASSENGER_KINDS.rush.meterMultiplier).toBeLessThan(1);
    expect(PASSENGER_KINDS.tourist.meterMultiplier).toBeGreaterThan(1);
  });

  it('a VIP fare pays double what the same trip pays a regular', () => {
    const a = play('normal', 11);
    const b = play('normal', 11);
    b.job.kind = 'vip';
    b.job.passenger = 'Denisha';
    for (const g of [a, b]) { g.job.kind = g === a ? 'regular' : 'vip'; g.job.timeLeft = 10; }
    const pay = (g: GameState) => {
      g.taxi.pos = { ...g.job.pickup }; run(g, tick);
      g.taxi.pos = { ...g.job.dropoff };
      const e = run(g, tick).find((x) => x.type === 'dropoff');
      return e && e.type === 'dropoff' ? e.fare : 0;
    };
    expect(pay(b)).toBe(pay(a) * 2);
  });
});

void drivableNeighbours;
