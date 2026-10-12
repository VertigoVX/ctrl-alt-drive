import { describe, it, expect } from 'vitest';
import { createGame, updateGame, GAME_RULES, type GameEvent, type GameState } from '../src/core/game';
import { createTutorial, stepTutorial, placeTutorialRobotaxi, TUTORIAL_PASSENGER } from '../src/core/tutorial';
import { distanceField } from '../src/core/pathfinding';
import { worldToTile, isDrivable, tileAt } from '../src/core/city';
import { CITIES } from '../src/core/cities';
import { dist } from '../src/core/math';

const dt = 1 / 60;
const idle = { throttle: 0, steer: 0 };
function run(g: GameState, seconds: number, input = idle) {
  const out: GameEvent[] = [];
  for (let t = 0; t < seconds; t += dt) out.push(...updateGame(g, input, dt));
  return out;
}
const tutorialGame = (seed = 3, city = CITIES[0]) => createGame({ seed, city, tutorial: true });

describe('the tutorial run', () => {
  it('starts with an empty road: no robotaxis, no power-ups, nothing spawns', () => {
    const g = tutorialGame();
    expect(g.avs).toHaveLength(0);
    run(g, GAME_RULES.countdown + 60);
    expect(g.avs).toHaveLength(0);
    expect(g.powerups).toHaveLength(0);
  });

  it('pauses the meter', () => {
    const g = tutorialGame();
    run(g, GAME_RULES.countdown + 0.1);
    const left = g.job.timeLeft;
    run(g, 30);
    expect(g.job.timeLeft).toBe(left);
  });

  it.each(CITIES.map((c, i) => [c.id, c, i + 1]))('%s: a nearby, ordinary first passenger and a short trip', (_id, city, seed) => {
    const g = createGame({ seed: seed as number, city, tutorial: true });
    const from = worldToTile(g.map, g.taxi.pos);
    const toPickup = distanceField(g.map, from)[g.job.pickupTile.y * g.map.width + g.job.pickupTile.x];
    const trip = distanceField(g.map, g.job.pickupTile)[g.job.dropoffTile.y * g.map.width + g.job.dropoffTile.x];
    expect(toPickup).toBeGreaterThanOrEqual(3);
    expect(toPickup).toBeLessThanOrEqual(9);
    expect(trip).toBeGreaterThanOrEqual(10);
    expect(trip).toBeLessThanOrEqual(18);
    expect(g.job.kind).toBe('regular');
    expect(g.job.passenger).toBe(TUTORIAL_PASSENGER);
  });

  it('never costs a cab: getting caught is a lesson, and that robotaxi stands down', () => {
    const g = tutorialGame();
    run(g, GAME_RULES.countdown + 0.1);
    const av = placeTutorialRobotaxi(g)!;
    av.pos = { ...g.taxi.pos };
    const events = run(g, 0.1);
    expect(events.map((e) => e.type)).toContain('tutorialCaught');
    expect(events.map((e) => e.type)).not.toContain('caught');
    expect(g.lives).toBe(GAME_RULES.lives);
    expect(av.state).toBe('rebooting');
    expect(g.phase).toBe('playing');
  });
});

describe('placing the tutorial robotaxi', () => {
  it.each(CITIES.map((c, i) => [c.id, c, i + 1]))('%s: on the road ahead of the cab, a fair distance off, facing it', (_id, city, seed) => {
    const g = createGame({ seed: seed as number, city, tutorial: true });
    run(g, GAME_RULES.countdown + 0.1);
    g.taxi.pos = { ...g.job.pickup };
    run(g, dt); // passenger aboard: the route now leads to the drop-off
    const av = placeTutorialRobotaxi(g)!;
    expect(av).toBeTruthy();
    const t = worldToTile(g.map, av.pos);
    expect(isDrivable(tileAt(g.map, t.x, t.y))).toBe(true);
    const tiles = dist(av.pos, g.taxi.pos) / g.map.tileSize;
    expect(tiles).toBeGreaterThanOrEqual(4);
    expect(tiles).toBeLessThanOrEqual(11);
    expect(g.route.some((p) => p.x === t.x && p.y === t.y)).toBe(true);
    // Its next step heads back along the route, towards the cab.
    const i = g.route.findIndex((p) => p.x === t.x && p.y === t.y);
    expect(av.next).toEqual(g.route[i - 1]);
    expect(g.avs).toContain(av);
  });
});

describe('the coaching script', () => {
  const ctx = (over: Partial<{ time: number; touch: boolean }> = {}) => ({ time: 0, touch: false, ...over });

  it('opens by pointing at the passenger, with controls for the device in hand', () => {
    const keys = createTutorial(ctx());
    expect(keys.message).toContain(TUTORIAL_PASSENGER);
    expect(keys.message).toMatch(/arrow keys|WASD/);
    const touch = createTutorial(ctx({ touch: true }));
    expect(touch.message).toMatch(/thumb/);
  });

  it('walks through pickup, a robotaxi, being spotted, escaping and the drop-off', () => {
    const t = createTutorial(ctx());
    let a = stepTutorial(t, [{ type: 'pickup', passenger: TUTORIAL_PASSENGER }], ctx({ time: 10 }));
    expect(t.step).toBe('deliver');
    expect(t.message).toMatch(/red pin/);
    expect(a.spawnRobotaxi).toBe(false);
    a = stepTutorial(t, [], ctx({ time: 11 }));
    expect(a.spawnRobotaxi).toBe(false); // gives the player a moment first
    a = stepTutorial(t, [], ctx({ time: 13 }));
    expect(a.spawnRobotaxi).toBe(true);
    expect(t.step).toBe('robotaxi');
    expect(t.message).toMatch(/headlights/);
    expect(stepTutorial(t, [], ctx({ time: 14 })).spawnRobotaxi).toBe(false); // only ever one
    stepTutorial(t, [{ type: 'spotted', id: 1 }], ctx({ time: 15 }));
    expect(t.step).toBe('spotted');
    expect(t.message).toMatch(/corner|line of sight/);
    stepTutorial(t, [{ type: 'escaped', id: 1 }], ctx({ time: 18 }));
    expect(t.step).toBe('escaped');
    stepTutorial(t, [{ type: 'dropoff', fare: 100, bonus: 0 }], ctx({ time: 25 }));
    expect(t.step).toBe('done');
    expect(t.finished).toBe(true);
  });

  it('turns being caught into a lesson rather than a failure', () => {
    const t = createTutorial(ctx());
    stepTutorial(t, [{ type: 'pickup', passenger: TUTORIAL_PASSENGER }], ctx({ time: 1 }));
    stepTutorial(t, [], ctx({ time: 4 }));
    stepTutorial(t, [{ type: 'spotted', id: 1 }], ctx({ time: 5 }));
    stepTutorial(t, [{ type: 'tutorialCaught' }], ctx({ time: 6 }));
    expect(t.step).toBe('caught');
    expect(t.message).toMatch(/real shift/);
  });

  it('moves on if the robotaxi never notices the cab', () => {
    const t = createTutorial(ctx());
    stepTutorial(t, [{ type: 'pickup', passenger: TUTORIAL_PASSENGER }], ctx({ time: 1 }));
    stepTutorial(t, [], ctx({ time: 4 }));
    stepTutorial(t, [], ctx({ time: 20 }));
    expect(t.step).toBe('finish');
    expect(t.message).toMatch(/drop-off|red pin/);
  });

  it('finishes whenever the fare is delivered, even mid-lesson', () => {
    const t = createTutorial(ctx());
    stepTutorial(t, [{ type: 'pickup', passenger: TUTORIAL_PASSENGER }], ctx({ time: 1 }));
    stepTutorial(t, [{ type: 'dropoff', fare: 100, bonus: 0 }], ctx({ time: 2 }));
    expect(t.finished).toBe(true);
  });
});
