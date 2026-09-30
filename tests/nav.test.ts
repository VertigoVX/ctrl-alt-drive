import { describe, it, expect } from 'vitest';
import { findPath, nextTurn } from '../src/core/pathfinding';
import { hasLineOfSight, canSee } from '../src/core/vision';
import { Tile, type CityMap, tileCenter, isDrivable, tileAt } from '../src/core/city';

/**
 * Hand-made test map (legend: # building, . road, = bridge, ~ water, * park)
 *   0123456789
 * 0 ##########
 * 1 #........#
 * 2 #.##*#.#.#
 * 3 #.##*#...#
 * 4 #........#
 * 5 ##########
 */
function makeMap(rows: string[]): CityMap {
  const legend: Record<string, Tile> = { '#': Tile.Building, '.': Tile.Road, '=': Tile.Bridge, '~': Tile.Water, '*': Tile.Park };
  return {
    width: rows[0].length,
    height: rows.length,
    tileSize: 10,
    seed: 0,
    tiles: rows.join('').split('').map((c) => legend[c]),
    roadRows: [],
    roadCols: [],
    rowNames: new Map(),
    colNames: new Map(),
    buildings: [], landmarks: [],
  };
}

const map = makeMap([
  '##########',
  '#........#',
  '#.##*#.#.#',
  '#.##*#...#',
  '#........#',
  '##########',
]);

describe('findPath (A*)', () => {
  it('returns a single-tile path when already there', () => {
    expect(findPath(map, { x: 1, y: 1 }, { x: 1, y: 1 })).toEqual([{ x: 1, y: 1 }]);
  });

  it('finds a shortest path along roads', () => {
    const path = findPath(map, { x: 1, y: 1 }, { x: 8, y: 4 })!;
    expect(path[0]).toEqual({ x: 1, y: 1 });
    expect(path[path.length - 1]).toEqual({ x: 8, y: 4 });
    expect(path).toHaveLength(11); // manhattan distance 10 → 11 tiles
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBe(1);
      expect(isDrivable(tileAt(map, b.x, b.y))).toBe(true);
    }
  });

  it('returns null when the goal is not drivable', () => {
    expect(findPath(map, { x: 1, y: 1 }, { x: 2, y: 2 })).toBeNull();
  });

  it('can be told to avoid tiles (used by cars that should not reverse)', () => {
    const path = findPath(map, { x: 1, y: 2 }, { x: 1, y: 4 }, { blocked: new Set(['1,3']) })!;
    expect(path.some((p) => p.x === 1 && p.y === 3)).toBe(false);
    expect(path[path.length - 1]).toEqual({ x: 1, y: 4 });
  });
});

describe('nextTurn (turn-by-turn directions)', () => {
  it('says straight when the path does not turn', () => {
    const t = nextTurn([{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }]);
    expect(t.kind).toBe('arrive');
  });

  it('detects the first left/right turn and its distance in tiles', () => {
    // heading east then turning south: on screen (y down) that is a right turn
    const right = nextTurn([{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 2 }]);
    expect(right).toEqual({ kind: 'right', tilesAway: 2, at: { x: 3, y: 1 } });
    const left = nextTurn([{ x: 1, y: 4 }, { x: 2, y: 4 }, { x: 2, y: 3 }]);
    expect(left).toEqual({ kind: 'left', tilesAway: 1, at: { x: 2, y: 4 } });
  });
});

describe('line of sight', () => {
  const c = (x: number, y: number) => tileCenter(map, x, y);

  it('is clear along an open street', () => {
    expect(hasLineOfSight(map, c(1, 1), c(8, 1))).toBe(true);
  });

  it('is blocked by buildings', () => {
    expect(hasLineOfSight(map, c(1, 1), c(1, 4))).toBe(true);
    expect(hasLineOfSight(map, c(1, 1), c(8, 4))).toBe(false);
  });

  it('sees across parks and water', () => {
    const open = makeMap(['#####', '#.~.#', '#.*.#', '#####']);
    expect(hasLineOfSight(open, tileCenter(open, 1, 1), tileCenter(open, 3, 1))).toBe(true);
    expect(hasLineOfSight(open, tileCenter(open, 1, 2), tileCenter(open, 3, 2))).toBe(true);
  });
});

describe('canSee (headlight cone)', () => {
  const eye = { pos: tileCenter(map, 1, 1), heading: 0 }; // facing east
  const cone = { range: 60, halfAngle: Math.PI / 5 };

  it('sees a target in front, within range and line of sight', () => {
    expect(canSee(map, eye, tileCenter(map, 5, 1), cone)).toBe(true);
  });

  it('does not see behind itself', () => {
    const back = { pos: tileCenter(map, 6, 1), heading: 0 };
    expect(canSee(map, back, tileCenter(map, 3, 1), cone)).toBe(false);
  });

  it('does not see beyond its range', () => {
    expect(canSee(map, eye, tileCenter(map, 8, 1), { ...cone, range: 40 })).toBe(false);
  });

  it('does not see through buildings even inside the cone', () => {
    const wide = { range: 200, halfAngle: Math.PI / 2 };
    expect(canSee(map, eye, tileCenter(map, 6, 3), wide)).toBe(false);
  });

  it('always notices a target that is bumper-to-bumper, whatever the heading', () => {
    expect(canSee(map, { pos: tileCenter(map, 3, 1), heading: Math.PI }, tileCenter(map, 4, 1), cone)).toBe(true);
  });
});


describe('distanceField (BFS)', () => {
  it('gives road distance from a start tile, -1 where unreachable', async () => {
    const { distanceField } = await import('../src/core/pathfinding');
    const d = distanceField(map, { x: 1, y: 1 });
    expect(d[1 * map.width + 1]).toBe(0);
    expect(d[4 * map.width + 8]).toBe(10);
    expect(d[2 * map.width + 2]).toBe(-1);
  });
});

describe('visibilityFan (for drawing honest headlight cones)', () => {
  it('casts rays across the cone that stop at buildings', async () => {
    const { visibilityFan } = await import('../src/core/vision');
    const eye = { pos: tileCenter(map, 1, 1), heading: 0 };
    const fan = visibilityFan(map, eye, { range: 200, halfAngle: Math.PI / 4 }, 9);
    expect(fan).toHaveLength(9);
    const lengths = fan.map((p) => Math.hypot(p.x - eye.pos.x, p.y - eye.pos.y));
    for (const l of lengths) expect(l).toBeLessThanOrEqual(200 + 1e-6);
    // Straight down the open street goes further than the rays angled into buildings.
    expect(lengths[4]).toBeGreaterThan(lengths[0]);
    expect(lengths[4]).toBeGreaterThan(lengths[8]);
  });
});
