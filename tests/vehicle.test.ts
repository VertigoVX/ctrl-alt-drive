import { describe, it, expect } from 'vitest';
import { createVehicle, updateVehicle, DEFAULT_HANDLING, collidesAt } from '../src/core/vehicle';
import { Tile, type CityMap, tileCenter, worldToTile, isDrivable, tileAt } from '../src/core/city';

function makeMap(rows: string[]): CityMap {
  const legend: Record<string, Tile> = { '#': Tile.Building, '.': Tile.Road };
  return {
    width: rows[0].length, height: rows.length, tileSize: 64, seed: 0,
    tiles: rows.join('').split('').map((c) => legend[c]),
    roadRows: [], roadCols: [], rowNames: new Map(), colNames: new Map(), buildings: [], landmarks: [],
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
    v.speed = 150; // already moving: this is about grazing a wall, not launching
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

describe('corner assist', () => {
  // A cab half in the side street, half across the junction, pushing west into the corner.
  const loop = makeMap([
    '#########',
    '#.......#',
    '#.#####.#',
    '#.......#',
    '#########',
  ]);

  it('slides into the street it is pushing towards instead of sticking on the corner', () => {
    const v = createVehicle({ x: 457, y: 128 }, Math.PI); // straddling row 1 and the building below-left
    v.speed = 30;
    for (let t = 0; t < 1.5; t += 1 / 60) updateVehicle(v, { throttle: 1, steer: 0 }, 1 / 60, loop);
    expect(worldToTile(loop, v.pos)).toEqual(expect.objectContaining({ y: 1 }));
    expect(v.pos.x).toBeLessThan(400);
    expect(collidesAt(loop, v.pos, v.radius)).toBe(false);
  });

  it('does not invent a way through a solid wall', () => {
    const v = createVehicle(tileCenter(loop, 1, 1), -Math.PI / 2); // facing the northern boundary
    const x0 = v.pos.x;
    for (let t = 0; t < 1; t += 1 / 60) updateVehicle(v, { throttle: 1, steer: 0 }, 1 / 60, loop);
    expect(v.pos.x).toBeCloseTo(x0, 0);
    expect(worldToTile(loop, v.pos).y).toBe(1);
  });
});

describe('corner assist (regression)', () => {
  it('is not cancelled out by a slight sideways drift into the corner', () => {
    const loop = makeMap(['#########', '#.......#', '#.#####.#', '#.......#', '#########']);
    const v = createVehicle({ x: 456, y: 118.7 }, (168 * Math.PI) / 180); // mostly west, drifting south
    v.speed = 37;
    for (let t = 0; t < 1.5; t += 1 / 60) updateVehicle(v, { throttle: 1, steer: 0.24 }, 1 / 60, loop);
    expect(v.pos.x).toBeLessThan(400);
  });
});

describe('grazing a kerb', () => {
  it('barely slows a cab sliding along a wall at a shallow angle', () => {
    const loop = makeMap(['#########', '#.......#', '#.#####.#', '#.......#', '#########']);
    const v = createVehicle({ x: 440, y: 114 }, Math.PI - 0.1); // heading west, nudging the kerb below
    v.speed = 150;
    for (let t = 0; t < 0.5; t += 1 / 60) updateVehicle(v, { throttle: 0.6, steer: 0 }, 1 / 60, loop);
    expect(v.speed).toBeGreaterThan(120);
  });
});

describe('lane keeping', () => {
  it('gently re-centres a cab that drifted off its lane when the player is not steering', () => {
    const loop = makeMap(['##########', '#........#', '##########']);
    const v = createVehicle({ x: 500, y: 112 }, Math.PI); // 16px below the lane centre (96)
    v.speed = 200;
    for (let t = 0; t < 1; t += 1 / 60) updateVehicle(v, { throttle: 1, steer: 0 }, 1 / 60, loop);
    expect(Math.abs(v.pos.y - 96)).toBeLessThan(4);
  });
  it('leaves the cab alone while the player is steering', () => {
    const loop = makeMap(['##########', '#........#', '##########']);
    const v = createVehicle({ x: 500, y: 112 }, Math.PI);
    v.speed = 60;
    updateVehicle(v, { throttle: 0, steer: 0.5 }, 1 / 60, loop);
    expect(v.pos.y).toBeGreaterThan(110);
  });
});
