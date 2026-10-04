import { describe, it, expect } from 'vitest';
import { CITIES, CITY_IDS, cityById, generateCityMap } from '../src/core/cities';
import { roadTiles, drivableNeighbours, isDrivable, tileAt, Tile, streetNameAt, worldToTile, type CityMap } from '../src/core/city';
import { createGame } from '../src/core/game';
import { GLOBAL_NAMES, VIP_NAMES } from '../src/core/passengers';

function components(map: CityMap) {
  const seen = new Set<number>();
  let n = 0;
  for (const t of roadTiles(map)) {
    if (seen.has(t.y * map.width + t.x)) continue;
    n++;
    const stack = [t];
    seen.add(t.y * map.width + t.x);
    while (stack.length) {
      const c = stack.pop()!;
      for (const nb of drivableNeighbours(map, c.x, c.y)) {
        const k = nb.y * map.width + nb.x;
        if (!seen.has(k)) { seen.add(k); stack.push(nb); }
      }
    }
  }
  return n;
}

describe('the city list', () => {
  it('has the eight launch cities, each with a signature cab', () => {
    expect(CITY_IDS).toEqual(['new-york', 'london', 'hong-kong', 'cape-town', 'sydney', 'singapore', 'paris', 'tokyo']);
    for (const c of CITIES) expect(c.cab).toBe(c.id);
  });

  it('gives Tokyo JDM-style robotaxis and everyone else the standard pods', () => {
    expect(cityById('tokyo').robo).toBe('jdm');
    for (const c of CITIES.filter((c) => c.id !== 'tokyo')) expect(c.robo).toBe('pod');
  });

  it('gives every city local passengers and landmarks', () => {
    for (const c of CITIES) {
      expect(c.passengers.length).toBeGreaterThanOrEqual(35);
      expect(c.landmarks.length).toBeGreaterThanOrEqual(1);
    }
  });
});

describe.each(CITIES.map((c) => [c.id]))('%s', (id) => {
  const city = cityById(id);
  const map = generateCityMap(city);

  it('is the same map every time (a learnable layout, not a random seed)', () => {
    expect(generateCityMap(city).tiles).toEqual(map.tiles);
  });

  it('is fully connected with no dead ends', () => {
    expect(components(map)).toBe(1);
    for (const t of roadTiles(map)) expect(drivableNeighbours(map, t.x, t.y).length).toBeGreaterThanOrEqual(2);
  });

  it('places its landmarks inside the map, off the roads, without overlapping', () => {
    const solid = map.landmarks.filter((l) => !l.overlay);
    expect(map.landmarks.map((l) => l.id).sort()).toEqual(city.landmarks.map((l) => l.id).sort());
    for (const l of solid) {
      expect(l.x).toBeGreaterThanOrEqual(0);
      expect(l.y).toBeGreaterThanOrEqual(0);
      expect(l.x + l.w).toBeLessThanOrEqual(map.width);
      expect(l.y + l.h).toBeLessThanOrEqual(map.height);
      for (let y = l.y; y < l.y + l.h; y++) for (let x = l.x; x < l.x + l.w; x++) expect(isDrivable(tileAt(map, x, y))).toBe(false);
    }
    for (let i = 0; i < solid.length; i++)
      for (let j = i + 1; j < solid.length; j++) {
        const a = solid[i], b = solid[j];
        const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
        expect(apart).toBe(true);
      }
  });

  it('keeps ordinary buildings out of landmark footprints', () => {
    for (const l of map.landmarks.filter((l) => !l.overlay))
      for (const b of map.buildings) {
        const t = worldToTile(map, { x: b.x + b.w / 2, y: b.y + b.h / 2 });
        const inside = t.x >= l.x && t.x < l.x + l.w && t.y >= l.y && t.y < l.y + l.h;
        expect(inside).toBe(false);
      }
  });

  it('uses local street names', () => {
    const local = new Set([...city.rowNames, ...city.colNames]);
    for (const t of roadTiles(map).slice(0, 200)) expect(local.has(streetNameAt(map, t.x, t.y))).toBe(true);
  });

  it(`has its water running ${city.riverAxis === 'horizontal' ? 'east–west' : 'north–south'}`, () => {
    const water = map.tiles.map((t, i) => ({ t, x: i % map.width, y: Math.floor(i / map.width) })).filter((c) => c.t === Tile.Water);
    const xs = water.map((c) => c.x), ys = water.map((c) => c.y);
    const spanX = Math.max(...xs) - Math.min(...xs), spanY = Math.max(...ys) - Math.min(...ys);
    if (city.riverAxis === 'horizontal') expect(spanX).toBeGreaterThan(spanY);
    else expect(spanY).toBeGreaterThan(spanX);
  });
});

describe('playing a city', () => {
  it('uses the city’s map and passengers', () => {
    const city = cityById('london');
    const g = createGame({ seed: 5, city });
    expect(g.map.tiles).toEqual(generateCityMap(city).tiles);
    expect(g.city).toBe('london');
    for (let i = 0; i < 20; i++) {
      const name = g.job.passenger;
      expect([...city.passengers, ...GLOBAL_NAMES, ...VIP_NAMES]).toContain(name);
      g.job = (createGame({ seed: 100 + i, city })).job;
    }
  });

  it('shares the layout between runs but varies the traffic', () => {
    const city = cityById('paris');
    const a = createGame({ seed: 1, city });
    const b = createGame({ seed: 2, city });
    expect(a.map.tiles).toEqual(b.map.tiles);
    expect(a.avs.map((v) => v.pos)).not.toEqual(b.avs.map((v) => v.pos));
  });

  it('marks Shibuya’s scramble crossing on a real junction', () => {
    const map = generateCityMap(cityById('tokyo'));
    const crossing = map.landmarks.find((l) => l.id === 'shibuya-crossing')!;
    expect(crossing.overlay).toBe(true);
    expect(drivableNeighbours(map, crossing.x, crossing.y).length).toBe(4);
  });
});
