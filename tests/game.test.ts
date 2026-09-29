import { describe, it, expect } from 'vitest';
import { createGame, updateGame, GAME_RULES, type GameState, type GameEvent } from '../src/core/game';
import { createAutonomous } from '../src/core/autonomous';
import { isDrivable, tileAt, worldToTile, tileCenter, roadTiles } from '../src/core/city';
import { dist } from '../src/core/math';

const idle = { throttle: 0, steer: 0 };
const tick = 1 / 60;

function run(g: GameState, seconds: number, input = idle): GameEvent[] {
  const events: GameEvent[] = [];
  for (let t = 0; t < seconds; t += tick) events.push(...updateGame(g, input, tick));
  return events;
}
const kinds = (e: GameEvent[]) => e.map((x) => x.type);

function playing(seed = 42): GameState {
  const g = createGame({ seed });
  run(g, GAME_RULES.countdown + 0.05);
  return g;
}

function parkAv(g: GameState, at: { x: number; y: number }) {
  const t = worldToTile(g.map, at);
  const av = createAutonomous(999, g.map, t, 0);
  g.avs.push(av);
  return av;
}

describe('game setup', () => {
  const g = createGame({ seed: 42 });

  it('puts the taxi on a road', () => {
    const t = worldToTile(g.map, g.taxi.pos);
    expect(isDrivable(tileAt(g.map, t.x, t.y))).toBe(true);
  });

  it.each([1, 42, 1234, 777])('seed %i: points the taxi down its longest open street', (seed) => {
    const game = createGame({ seed });
    const t = worldToTile(game.map, game.taxi.pos);
    const run = (dx: number, dy: number) => {
      let n = 0;
      while (isDrivable(tileAt(game.map, t.x + dx * (n + 1), t.y + dy * (n + 1)))) n++;
      return n;
    };
    const dx = Math.round(Math.cos(game.taxi.heading));
    const dy = Math.round(Math.sin(game.taxi.heading));
    const best = Math.max(run(1, 0), run(-1, 0), run(0, 1), run(0, -1));
    expect(run(dx, dy)).toBe(best);
  });

  it('starts with three lives, no score, and a passenger waiting', () => {
    expect(g.lives).toBe(3);
    expect(g.score).toBe(0);
    expect(g.job.stage).toBe('pickup');
    expect(g.job.passenger).toMatch(/\w+/);
    expect(g.job.dropoffLabel).toMatch(/\d+ \w+/);
  });

  it('spawns the first self-driving cars well away from the taxi', () => {
    expect(g.avs.length).toBe(GAME_RULES.initialAvs);
    for (const av of g.avs) expect(dist(av.pos, g.taxi.pos)).toBeGreaterThan(GAME_RULES.minSpawnDistance * g.map.tileSize);
  });

  it('is deterministic for the same seed', () => {
    const a = createGame({ seed: 7 });
    const b = createGame({ seed: 7 });
    run(a, 5, { throttle: 1, steer: 0.3 });
    run(b, 5, { throttle: 1, steer: 0.3 });
    expect(a.taxi.pos).toEqual(b.taxi.pos);
    expect(a.avs.map((v) => v.pos)).toEqual(b.avs.map((v) => v.pos));
  });
});

describe('countdown', () => {
  it('holds everything still until the countdown ends', () => {
    const g = createGame({ seed: 42 });
    const start = { ...g.taxi.pos };
    run(g, 1, { throttle: 1, steer: 0 });
    expect(g.phase).toBe('ready');
    expect(g.taxi.pos).toEqual(start);
    const e = run(g, GAME_RULES.countdown);
    expect(g.phase).toBe('playing');
    expect(kinds(e)).toContain('go');
  });
});

describe('fares', () => {
  it('picks the passenger up when the taxi reaches them', () => {
    const g = playing();
    g.avs = [];
    g.taxi.pos = { ...g.job.pickup };
    const e = run(g, tick);
    expect(kinds(e)).toContain('pickup');
    expect(g.job.stage).toBe('dropoff');
  });

  it('pays out on drop-off, with a bonus for time left on the meter, and starts a new fare', () => {
    const g = playing();
    g.avs = [];
    g.taxi.pos = { ...g.job.pickup };
    run(g, tick);
    const oldDropoff = { ...g.job.dropoff };
    g.taxi.pos = { ...g.job.dropoff };
    const e = run(g, tick);
    const payout = e.find((x) => x.type === 'dropoff');
    expect(payout).toBeDefined();
    expect(g.score).toBeGreaterThan(GAME_RULES.baseFare);
    expect(g.fares).toBe(1);
    expect(g.job.stage).toBe('pickup');
    expect(g.job.dropoff).not.toEqual(oldDropoff);
  });

  it('loses the fare (but not a life) when the meter runs out', () => {
    const g = playing();
    g.avs = [];
    g.job.timeLeft = 0.01;
    const e = run(g, 0.05);
    expect(kinds(e)).toContain('fareExpired');
    expect(g.lives).toBe(3);
    expect(g.job.timeLeft).toBeGreaterThan(1);
  });

  it('gives each fare enough time to actually drive it', () => {
    const g = createGame({ seed: 3 });
    const tilesPerSecond = GAME_RULES.referenceSpeed / g.map.tileSize;
    expect(g.job.timeTotal).toBeGreaterThan(g.job.routeTiles / tilesPerSecond);
  });

  it('keeps a live route from the taxi to the current target for the map', () => {
    const g = playing();
    run(g, 0.5);
    expect(g.route.length).toBeGreaterThan(1);
    expect(g.route[g.route.length - 1]).toEqual(g.job.pickupTile);
  });
});

describe('getting caught', () => {
  it('costs a life and the current fare when a self-driving car reaches the taxi', () => {
    const g = playing();
    g.avs = [];
    const passenger = g.job.passenger;
    parkAv(g, g.taxi.pos);
    const e = run(g, tick * 2);
    expect(kinds(e)).toContain('caught');
    expect(g.lives).toBe(2);
    expect(g.phase).toBe('caught');
    run(g, GAME_RULES.caughtPause + 0.1);
    expect(g.phase).toBe('playing');
    expect(g.job.stage).toBe('pickup');
    void passenger;
  });

  it('gives a short grace period after being caught', () => {
    const g = playing();
    g.avs = [];
    parkAv(g, g.taxi.pos);
    run(g, GAME_RULES.caughtPause + 0.2);
    expect(g.invulnerable).toBeGreaterThan(0);
    parkAv(g, g.taxi.pos);
    const e = run(g, tick * 2);
    expect(kinds(e)).not.toContain('caught');
  });

  it('ends the game when the last life is lost', () => {
    const g = playing();
    g.avs = [];
    g.lives = 1;
    parkAv(g, g.taxi.pos);
    const e = run(g, tick * 2);
    expect(kinds(e)).toContain('gameOver');
    expect(g.phase).toBe('over');
  });
});

describe('spawning', () => {
  it('adds self-driving cars over time, up to the cap for the level', () => {
    const g = playing();
    run(g, 60);
    expect(g.avs.length).toBeGreaterThan(GAME_RULES.initialAvs);
    expect(g.avs.length).toBeLessThanOrEqual(GAME_RULES.maxAvs(g.level));
  });

  it('never spawns a car on top of the taxi', () => {
    const g = playing();
    g.lives = 99;
    for (let i = 0; i < 40; i++) {
      const before = g.avs.length;
      const e = run(g, 1);
      if (kinds(e).includes('spawn')) {
        const av = g.avs[g.avs.length - 1];
        if (g.avs.length > before) expect(dist(av.pos, g.taxi.pos)).toBeGreaterThan(GAME_RULES.minSpawnDistance * g.map.tileSize * 0.9);
      }
    }
  });

  it('makes the fleet faster as the level rises', () => {
    const g = playing();
    g.avs = [];
    for (let i = 0; i < GAME_RULES.faresPerLevel * 2; i++) {
      g.taxi.pos = { ...g.job.pickup };
      run(g, tick);
      g.taxi.pos = { ...g.job.dropoff };
      run(g, tick);
    }
    expect(g.level).toBe(3);
    const spawned = run(g, 30).filter((x) => x.type === 'spawn');
    expect(spawned.length).toBeGreaterThan(0);
    expect(g.avs[0].speedScale).toBeGreaterThan(1);
  });
});

describe('power-ups', () => {
  it('Ctrl+Alt+Del reboots every self-driving car', () => {
    const g = playing();
    const far = roadTiles(g.map).map((t) => tileCenter(g.map, t.x, t.y)).find((p) => dist(p, g.taxi.pos) > 600)!;
    parkAv(g, far);
    g.powerups = [{ kind: 'reboot', pos: { ...g.taxi.pos } }];
    const e = run(g, tick);
    expect(kinds(e)).toContain('powerup');
    expect(g.avs.every((a) => a.state === 'rebooting')).toBe(true);
  });

  it('lets the taxi ram a rebooting car off the road for points', () => {
    const g = playing();
    g.avs = [];
    const av = parkAv(g, g.taxi.pos);
    av.state = 'rebooting';
    av.stateTime = 0;
    const e = run(g, tick);
    expect(kinds(e)).toContain('recycled');
    expect(g.avs).toHaveLength(0);
    expect(g.lives).toBe(3);
    expect(g.score).toBe(GAME_RULES.recyclePoints);
  });

  it('Surge boosts the taxi for a few seconds', () => {
    const g = playing();
    g.avs = [];
    g.powerups = [{ kind: 'surge', pos: { ...g.taxi.pos } }];
    run(g, tick);
    expect(g.boostTime).toBeGreaterThan(0);
    run(g, GAME_RULES.surgeTime + 0.1);
    expect(g.boostTime).toBe(0);
  });

  it('drops power-ups onto the map from time to time', () => {
    const g = playing();
    g.avs = [];
    g.lives = 99;
    run(g, GAME_RULES.powerupInterval * 2 + 1);
    expect(g.powerups.length).toBeGreaterThan(0);
    for (const p of g.powerups) {
      const t = worldToTile(g.map, p.pos);
      expect(isDrivable(tileAt(g.map, t.x, t.y))).toBe(true);
    }
  });
});

describe('escapes', () => {
  it('counts an escape when a chasing car loses the taxi', () => {
    const g = playing();
    g.avs = [];
    const av = parkAv(g, tileCenter(g.map, 0, 0));
    av.state = 'chase';
    av.pos = { x: -9999, y: -9999 };
    const e = run(g, 2);
    expect(kinds(e)).toContain('escaped');
    expect(g.escapes).toBe(1);
  });
});
