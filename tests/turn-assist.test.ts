import { describe, it, expect } from 'vitest';
import { assistedStick, createAssistMemory, type AssistMemory } from '../src/core/turnAssist';
import { createVehicle, updateVehicle, DEFAULT_HANDLING, collidesAt, type Vehicle } from '../src/core/vehicle';
import { Tile, type CityMap, tileCenter, worldToTile } from '../src/core/city';
import { GAME_RULES } from '../src/core/game';

function makeMap(rows: string[]): CityMap {
  return {
    width: rows[0].length, height: rows.length, tileSize: 64, seed: 0,
    tiles: rows.join('').split('').map((c) => (c === '.' ? Tile.Road : Tile.Building)),
    roadRows: [], roadCols: [], rowNames: new Map(), colNames: new Map(), buildings: [], landmarks: [],
  };
}
// A main street (row 1) with side streets going south at columns 1, 10 and 14.
const map = makeMap([
  '################',
  '#..............#',
  '#.########.###.#',
  '#.########.###.#',
  '#..............#',
  '################',
]);
const dt = 1 / 60;
const SOUTH = { x: 0, y: 1 }, NORTH = { x: 0, y: -1 }, EAST = { x: 1, y: 0 }, WEST = { x: -1, y: 0 };

function drive(opts: { from: { x: number; y: number }; speed: number; stick: { x: number; y: number }; seconds: number; sensitivity?: number; offset?: number }) {
  const turnRate = DEFAULT_HANDLING.turnRate * (opts.sensitivity ?? 1.25);
  const handling = { ...DEFAULT_HANDLING, turnRate };
  const car = createVehicle(tileCenter(map, opts.from.x, opts.from.y), 0);
  car.pos.x += opts.offset ?? 0;
  car.speed = opts.speed;
  const mem = createAssistMemory();
  let maxImpact = 0, wallFrames = 0, everQueued: AssistMemory['queued'] = null;
  const steers: number[] = [];
  for (let t = 0; t < opts.seconds; t += dt) {
    const input = assistedStick(opts.stick, car, map, mem, handling);
    steers.push(input.steer);
    everQueued ??= mem.queued && { ...mem.queued };
    updateVehicle(car, input, dt, map, 1, handling);
    maxImpact = Math.max(maxImpact, car.impact);
    if (car.bumped) wallFrames++;
  }
  return { car, mem, maxImpact, wallFrames, everQueued, steers, tile: worldToTile(map, car.pos) };
}

describe('turn queueing (Pac-Man style) for the touch stick', () => {
  it('queues the turn at the next junction that has an exit the way you point', () => {
    const car = createVehicle(tileCenter(map, 2, 1), 0);
    car.speed = 200;
    const mem = createAssistMemory();
    assistedStick(SOUTH, car, map, mem, DEFAULT_HANDLING);
    expect(mem.queued).toEqual({ x: 10, y: 1, dir: SOUTH });
  });

  it('takes a queued turn from full speed, cleanly: no crash damage', () => {
    const r = drive({ from: { x: 2, y: 1 }, speed: DEFAULT_HANDLING.maxSpeed, stick: SOUTH, seconds: 3 });
    expect(r.tile.x).toBe(10);
    expect(r.tile.y).toBeGreaterThanOrEqual(3);
    expect(r.maxImpact).toBeLessThan(GAME_RULES.damageThreshold);
    expect(r.mem.queued).toBeNull(); // done
  });

  it.each([1, 1.25, 1.5])('makes the turn at every steering preset (sensitivity %f)', (sensitivity) => {
    const r = drive({ from: { x: 2, y: 1 }, speed: DEFAULT_HANDLING.maxSpeed, stick: SOUTH, seconds: 3.5, sensitivity });
    expect(r.tile).toEqual(expect.objectContaining({ x: 10 }));
    expect(r.tile.y).toBeGreaterThanOrEqual(3);
    expect(r.maxImpact).toBeLessThan(GAME_RULES.damageThreshold);
  });

  it('turns from a standstill at the junction itself', () => {
    const r = drive({ from: { x: 10, y: 1 }, speed: 0, stick: SOUTH, seconds: 2.5 });
    expect(r.tile.x).toBe(10);
    expect(r.tile.y).toBeGreaterThanOrEqual(3);
  });

  it('holds the queue past junctions without that exit, and turns at the first one that has it', () => {
    // Pointing south from column 2: columns 3–9 have no southern exit, column 10 does.
    const r = drive({ from: { x: 2, y: 1 }, speed: 150, stick: SOUTH, seconds: 3 });
    expect(r.everQueued).toEqual({ x: 10, y: 1, dir: SOUTH });
    expect(r.tile.x).toBe(10);
  });

  it('missed it? a cab already past the junction at speed queues the next one instead', () => {
    const car = createVehicle(tileCenter(map, 10, 1), 0);
    car.pos.x += 0.4 * map.tileSize;
    car.speed = 250;
    const mem = createAssistMemory();
    assistedStick(SOUTH, car, map, mem, DEFAULT_HANDLING);
    expect(mem.queued).toEqual({ x: 14, y: 1, dir: SOUTH });
  });

  it('never steers into a wall: pointing where there is no street just carries on straight', () => {
    const r = drive({ from: { x: 2, y: 1 }, speed: 150, stick: NORTH, seconds: 1.6 });
    expect(r.everQueued).toBeNull();
    expect(r.steers.every((s) => s === 0)).toBe(true);
    expect(r.tile.y).toBe(1);
    expect(r.wallFrames).toBe(0);
  });

  it('pointing the way you are going drives straight, leaving the lane assist to centre the cab', () => {
    const car = createVehicle(tileCenter(map, 4, 1), 0.08);
    car.speed = 150;
    const input = assistedStick(EAST, car, map, createAssistMemory(), DEFAULT_HANDLING);
    expect(input).toEqual({ throttle: 1, steer: 0 });
  });

  it('pointing back the way you came brakes first instead of slamming into a U-turn', () => {
    const car = createVehicle(tileCenter(map, 6, 1), 0);
    car.speed = 220;
    const input = assistedStick(WEST, car, map, createAssistMemory(), DEFAULT_HANDLING);
    expect(input.throttle).toBeLessThan(0);
    expect(input.steer).toBe(0);
  });

  it('…then turns the cab round with the three-point-turn logic once slow', () => {
    const r = drive({ from: { x: 6, y: 1 }, speed: 220, stick: WEST, seconds: 5 });
    expect(Math.cos(r.car.heading)).toBeLessThan(-0.9); // facing west
    expect(r.tile.x).toBeLessThan(6);
  });

  it('snaps a diagonal thumb to the nearest street direction', () => {
    const car = createVehicle(tileCenter(map, 2, 1), 0);
    car.speed = 150;
    const mostlyAhead = { x: 1, y: 0.8 };
    const mostlyDown = { x: 0.8, y: 1 };
    const mem = createAssistMemory();
    expect(assistedStick(mostlyAhead, car, map, mem, DEFAULT_HANDLING).steer).toBe(0);
    expect(mem.queued).toBeNull();
    assistedStick(mostlyDown, car, map, mem, DEFAULT_HANDLING);
    expect(mem.queued?.dir).toEqual(SOUTH);
  });

  it('lifting your thumb clears the queue and coasts', () => {
    const car = createVehicle(tileCenter(map, 2, 1), 0);
    car.speed = 150;
    const mem = createAssistMemory();
    assistedStick(SOUTH, car, map, mem, DEFAULT_HANDLING);
    expect(mem.queued).not.toBeNull();
    expect(assistedStick({ x: 0, y: 0 }, car, map, mem, DEFAULT_HANDLING)).toEqual({ throttle: 0, steer: 0 });
    expect(mem.queued).toBeNull();
  });

  it('still rescues a cab that crashed nose-first into a corner', () => {
    const corner = makeMap(['#########', '#.......#', '#.#####.#', '#.......#', '#########']);
    const car: Vehicle = createVehicle(tileCenter(corner, 7, 1), 0);
    for (let t = 0; t < 0.4; t += dt) updateVehicle(car, { throttle: 1, steer: 0 }, dt, corner);
    car.speed = 0;
    const mem = createAssistMemory();
    for (let t = 0; t < 4; t += dt) updateVehicle(car, assistedStick(WEST, car, corner, mem, DEFAULT_HANDLING), dt, corner);
    expect(worldToTile(corner, car.pos).x).toBeLessThanOrEqual(5);
    expect(collidesAt(corner, car.pos, car.radius)).toBe(false);
  });
});

describe('pointing at a wall', () => {
  it('drives up to the end of the street and stops short, without touching the wall', () => {
    // Row 1 ends at column 14; east of it is the boundary wall.
    const r = drive({ from: { x: 8, y: 1 }, speed: DEFAULT_HANDLING.maxSpeed, stick: EAST, seconds: 3 });
    expect(r.wallFrames).toBe(0);
    expect(r.tile.x).toBe(14);
    const wallX = 15 * map.tileSize;
    expect(wallX - (r.car.pos.x + r.car.radius)).toBeLessThan(24);
    expect(Math.abs(r.car.speed)).toBeLessThan(5);
  });

  it('does not brake early when the street runs on beyond the look-ahead', () => {
    const long = makeMap(['#'.repeat(40), '#' + '.'.repeat(38) + '#', '#'.repeat(40)]);
    const car = createVehicle(tileCenter(long, 1, 1), 0);
    car.speed = 200;
    expect(assistedStick(EAST, car, long, createAssistMemory(), DEFAULT_HANDLING)).toEqual({ throttle: 1, steer: 0 });
  });
});
