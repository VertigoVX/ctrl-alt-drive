import { describe, it, expect } from 'vitest';
import { createStickMemory, inputFromStick } from '../src/core/input';
import { createVehicle, updateVehicle } from '../src/core/vehicle';
import { Tile, type CityMap, tileCenter, worldToTile } from '../src/core/city';
import { createGame, updateGame, GAME_RULES } from '../src/core/game';
import { DEFAULT_AV_TUNING } from '../src/core/autonomous';

function makeMap(rows: string[]): CityMap {
  return {
    width: rows[0].length, height: rows.length, tileSize: 64, seed: 0,
    tiles: rows.join('').split('').map((c) => (c === '.' ? Tile.Road : Tile.Building)),
    roadRows: [], roadCols: [], rowNames: new Map(), colNames: new Map(), buildings: [], landmarks: [],
  };
}
// A loop: the corners are where cabs end up nose-first in a wall.
const map = makeMap([
  '#########',
  '#.......#',
  '#.#####.#',
  '#.......#',
  '#########',
]);
const dt = 1 / 60;

/** Hold the touch stick in one direction for `seconds`, as a phone player would. */
function holdStick(stick: { x: number; y: number }, start: { x: number; y: number }, heading: number, seconds: number) {
  const car = createVehicle(tileCenter(map, start.x, start.y), heading);
  // Pinned against the wall after a crash: nose touching it, stopped.
  for (let t = 0; t < 0.4; t += dt) updateVehicle(car, { throttle: 1, steer: 0 }, dt, map);
  car.speed = 0;
  const memory = createStickMemory(); // the game keeps one of these per player
  for (let t = 0; t < seconds; t += dt) updateVehicle(car, inputFromStick(stick, car, memory), dt, map);
  return car;
}

describe('touch controls after a crash', () => {
  it('reverses when you point the stick behind a stopped cab', () => {
    const i = inputFromStick({ x: -1, y: 0 }, { heading: 0, speed: 0, bumped: false });
    expect(i.throttle).toBeLessThan(0);
  });

  it('still drives forward normally when you point roughly ahead', () => {
    expect(inputFromStick({ x: 1, y: 0.2 }, { heading: 0, speed: 0, bumped: false }).throttle).toBeGreaterThan(0);
  });

  it('does not slam into reverse at speed: at speed it keeps driving and turns', () => {
    expect(inputFromStick({ x: -1, y: 0 }, { heading: 0, speed: 200, bumped: false }).throttle).toBeGreaterThan(0);
  });

  it('gets a cab facing a dead end turned round and driving away within 4 seconds', () => {
    // Nose into the east wall at the top-right corner; the way out is back west. Before the fix the
    // cab never escaped. A full 180° in a street one lane wide, from a standstill with the gentle
    // launch, measures ~3.5s; the first draft of this test guessed 3s.
    const car = holdStick({ x: -1, y: 0 }, { x: 7, y: 1 }, 0, 4);
    expect(worldToTile(map, car.pos).x).toBeLessThanOrEqual(5);
  });

  it('gets a cab out of a corner it crashed into, heading down the side street', () => {
    // Nose into the east wall at the corner; the road continues south.
    const car = holdStick({ x: 0, y: 1 }, { x: 7, y: 1 }, 0, 3);
    expect(worldToTile(map, car.pos).y).toBeGreaterThanOrEqual(2);
  });

  it('keeps accepting a bare heading for callers that only know the direction', () => {
    expect(inputFromStick({ x: 1, y: 0 }, 0)).toEqual({ throttle: 1, steer: 0 });
  });
});

describe('power-up durations (one second longer)', () => {
  it('Surge lasts 5 seconds (was 4)', () => {
    expect(GAME_RULES.surgeTime).toBe(5);
  });

  it('Ctrl+Alt+Del keeps the fleet rebooting for 7 seconds (was 6)', () => {
    expect(DEFAULT_AV_TUNING.rebootTime).toBe(7);
    const g = createGame({ seed: 3 });
    for (let t = 0; t < GAME_RULES.countdown + 0.05; t += dt) updateGame(g, { throttle: 0, steer: 0 }, dt);
    g.powerups = [{ kind: 'reboot', pos: { ...g.taxi.pos } }];
    g.invulnerable = 1e9;
    updateGame(g, { throttle: 0, steer: 0 }, dt);
    for (let t = 0; t < 6.8; t += dt) updateGame(g, { throttle: 0, steer: 0 }, dt);
    expect(g.avs.every((a) => a.state === 'rebooting')).toBe(true);
  });
});

describe('touch steering dead-zone', () => {
  it('outputs zero steering when the stick is within a few degrees of the nose, so lane assist can straighten the cab', () => {
    const nearlyAhead = { x: Math.cos(0.08), y: Math.sin(0.08) };
    expect(inputFromStick(nearlyAhead, { heading: 0, speed: 150 }).steer).toBe(0);
  });
  it('still steers for anything more deliberate', () => {
    const turning = { x: Math.cos(0.3), y: Math.sin(0.3) };
    expect(inputFromStick(turning, { heading: 0, speed: 150 }).steer).toBeGreaterThan(0);
  });
});
