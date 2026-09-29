import { describe, it, expect } from 'vitest';
import { createVehicle, updateVehicle, DEFAULT_HANDLING, collidesAt } from '../src/core/vehicle';
import { Tile, type CityMap, tileCenter, worldToTile, isDrivable, tileAt } from '../src/core/city';

function makeMap(rows: string[]): CityMap {
  const legend: Record<string, Tile> = { '#': Tile.Building, '.': Tile.Road };
  return {
    width: rows[0].length, height: rows.length, tileSize: 64, seed: 0,
    tiles: rows.join('').split('').map((c) => legend[c]),
    roadRows: [], roadCols: [], rowNames: new Map(), colNames: new Map(), buildings: [],
  };
}

const map = makeMap([
  '##########',
  '#........#',
  '#.######.#',
  '#........#',
  '##########',
]);

const idle = { throttle: 0, steer: 0 };
const gas = { throttle: 1, steer: 0 };
const run = (v: ReturnType<typeof createVehicle>, input: typeof idle, seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 60) updateVehicle(v, input, 1 / 60, map);
};

describe('vehicle handling', () => {
  it('accelerates with throttle and tops out at max speed', () => {
    const v = createVehicle(tileCenter(map, 1, 1), 0);
    run(v, gas, 0.2);
    expect(v.speed).toBeGreaterThan(0);
    const wide = makeMap(['#' + '.'.repeat(60) + '#']);
    const w = createVehicle(tileCenter(wide, 1, 0), 0);
    for (let t = 0; t < 5; t += 1 / 60) updateVehicle(w, gas, 1 / 60, wide);
    expect(w.speed).toBeCloseTo(DEFAULT_HANDLING.maxSpeed, 0);
  });

  it('coasts to a stop without throttle', () => {
    const v = createVehicle(tileCenter(map, 1, 1), 0);
    v.speed = 150;
    run(v, idle, 3);
    expect(v.speed).toBe(0);
  });

  it('reverses, but slower than it drives forward', () => {
    const v = createVehicle(tileCenter(map, 8, 1), 0);
    run(v, { throttle: -1, steer: 0 }, 3);
    expect(v.speed).toBeLessThan(0);
    expect(Math.abs(v.speed)).toBeLessThanOrEqual(DEFAULT_HANDLING.maxReverse);
  });

  it('cannot turn on the spot', () => {
    const v = createVehicle(tileCenter(map, 1, 1), 0);
    run(v, { throttle: 0, steer: 1 }, 1);
    expect(v.heading).toBe(0);
  });

  it('turns while moving', () => {
    const v = createVehicle(tileCenter(map, 1, 1), 0);
    v.speed = 150;
    updateVehicle(v, { throttle: 1, steer: 1 }, 0.1, map);
    expect(v.heading).toBeGreaterThan(0);
  });

  it('never drives into buildings', () => {
    const v = createVehicle(tileCenter(map, 1, 1), -Math.PI / 2); // facing the northern wall
    run(v, gas, 2);
    expect(collidesAt(map, v.pos, v.radius)).toBe(false);
    const t = worldToTile(map, v.pos);
    expect(isDrivable(tileAt(map, t.x, t.y))).toBe(true);
    expect(v.bumped).toBe(true);
  });

  it('slides along walls instead of sticking', () => {
    const v = createVehicle(tileCenter(map, 2, 1), -0.4); // pointed slightly into the top wall, mostly east
    const startX = v.pos.x;
    run(v, gas, 0.6);
    expect(v.pos.x).toBeGreaterThan(startX + 40);
  });

  it('lane assist gently snaps heading to the road axis when not steering', () => {
    const v = createVehicle(tileCenter(map, 2, 1), 0.12);
    v.speed = 120;
    run(v, gas, 0.5);
    expect(Math.abs(v.heading)).toBeLessThan(0.03);
  });

  it('can be boosted above the normal top speed', () => {
    const wide = makeMap(['#' + '.'.repeat(80) + '#']);
    const v = createVehicle(tileCenter(wide, 1, 0), 0);
    for (let t = 0; t < 4; t += 1 / 60) updateVehicle(v, gas, 1 / 60, wide, 1.4);
    expect(v.speed).toBeGreaterThan(DEFAULT_HANDLING.maxSpeed * 1.2);
  });
});
