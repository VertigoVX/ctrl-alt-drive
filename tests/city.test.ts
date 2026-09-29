import { describe, it, expect } from 'vitest';
import {
  generateCity, tileAt, isDrivable, blocksSight, Tile, drivableNeighbours,
  tileCenter, worldToTile, streetNameAt, roadTiles,
} from '../src/core/city';

const city = generateCity({ width: 44, height: 32, seed: 1234 });

function componentCount(map = city): number {
  const seen = new Set<number>();
  let comps = 0;
  for (const t of roadTiles(map)) {
    const key = t.y * map.width + t.x;
    if (seen.has(key)) continue;
    comps++;
    const stack = [t];
    seen.add(key);
    while (stack.length) {
      const cur = stack.pop()!;
      for (const n of drivableNeighbours(map, cur.x, cur.y)) {
        const k = n.y * map.width + n.x;
        if (!seen.has(k)) { seen.add(k); stack.push(n); }
      }
    }
  }
  return comps;
}

describe('city generation', () => {
  it('has the requested dimensions', () => {
    expect(city.width).toBe(44);
    expect(city.height).toBe(32);
    expect(city.tiles).toHaveLength(44 * 32);
  });

  it('is deterministic for a seed and varies across seeds', () => {
    const again = generateCity({ width: 44, height: 32, seed: 1234 });
    const other = generateCity({ width: 44, height: 32, seed: 99 });
    expect(again.tiles).toEqual(city.tiles);
    expect(other.tiles).not.toEqual(city.tiles);
  });

  it.each([1, 7, 1234, 5555, 90210])('seed %i: every road is reachable from every other road', (seed) => {
    expect(componentCount(generateCity({ width: 44, height: 32, seed }))).toBe(1);
  });

  it.each([1, 7, 1234, 5555, 90210])('seed %i: has no dead ends (pac-man rule)', (seed) => {
    const map = generateCity({ width: 44, height: 32, seed });
    for (const t of roadTiles(map)) {
      expect(drivableNeighbours(map, t.x, t.y).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('includes a river crossed by at least two bridges, and some parks', () => {
    const count = (kind: Tile) => city.tiles.filter((t) => t === kind).length;
    expect(count(Tile.Water)).toBeGreaterThan(20);
    expect(count(Tile.Bridge)).toBeGreaterThanOrEqual(2);
    expect(count(Tile.Park)).toBeGreaterThan(0);
  });

  it('has plenty of intersections to make route choices at', () => {
    const junctions = roadTiles(city).filter((t) => drivableNeighbours(city, t.x, t.y).length >= 3);
    expect(junctions.length).toBeGreaterThan(20);
  });

  it('treats the outside of the map as solid', () => {
    expect(tileAt(city, -1, 0)).toBe(Tile.Building);
    expect(tileAt(city, 0, 999)).toBe(Tile.Building);
    expect(isDrivable(tileAt(city, -5, -5))).toBe(false);
  });

  it('only buildings block sight lines', () => {
    expect(blocksSight(Tile.Building)).toBe(true);
    expect(blocksSight(Tile.Park)).toBe(false);
    expect(blocksSight(Tile.Water)).toBe(false);
    expect(blocksSight(Tile.Road)).toBe(false);
  });

  it('converts between world and tile coordinates', () => {
    const c = tileCenter(city, 3, 5);
    expect(c).toEqual({ x: 3.5 * city.tileSize, y: 5.5 * city.tileSize });
    expect(worldToTile(city, c)).toEqual({ x: 3, y: 5 });
  });

  it('names every street so directions can reference them', () => {
    for (const t of roadTiles(city)) expect(streetNameAt(city, t.x, t.y)).toMatch(/\S+/);
  });

  it('places building footprints only on building tiles', () => {
    expect(city.buildings.length).toBeGreaterThan(30);
    for (const b of city.buildings) {
      for (const [px, py] of [[b.x, b.y], [b.x + b.w - 1, b.y + b.h - 1]]) {
        const t = worldToTile(city, { x: px, y: py });
        expect(tileAt(city, t.x, t.y)).toBe(Tile.Building);
      }
    }
  });
});
