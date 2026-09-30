import { createRng, type Rng } from './rng';
import type { Vec } from './math';

export enum Tile {
  Building = 0,
  Road = 1,
  Bridge = 2,
  Park = 3,
  Water = 4,
}

export interface Point {
  x: number;
  y: number;
}

export interface BuildingLot {
  /** World-space footprint. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** 0..1 — used by the renderer for extrusion/shade. */
  height: number;
}

export interface CityMap {
  width: number;
  height: number;
  tileSize: number;
  seed: number;
  tiles: Tile[];
  roadRows: number[];
  roadCols: number[];
  rowNames: Map<number, string>;
  colNames: Map<number, string>;
  buildings: BuildingLot[];
  landmarks: Landmark[];
}

export interface Landmark {
  id: string;
  /** Tile-space footprint. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CityOptions {
  width: number;
  height: number;
  seed: number;
  tileSize?: number;
}

const STREET_NAMES = [
  'Juniper', 'Market', 'Harbor', 'Linden', 'Mercer', 'Alder', 'Kestrel', 'Bayview', 'Cedar', 'Orchard',
  'Halcyon', 'Beacon', 'Wren', 'Sycamore', 'Delancey', 'Foundry', 'Larkspur', 'Mission', 'Quarry', 'Vista',
  'Rowan', 'Ferris', 'Tidewater', 'Granite', 'Magnolia',
];

const DIRS: Point[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

export const isDrivable = (t: Tile): boolean => t === Tile.Road || t === Tile.Bridge;
export const blocksSight = (t: Tile): boolean => t === Tile.Building;

export function tileAt(map: CityMap, x: number, y: number): Tile {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return Tile.Building;
  return map.tiles[y * map.width + x];
}

export function drivableNeighbours(map: CityMap, x: number, y: number): Point[] {
  return DIRS.map((d) => ({ x: x + d.x, y: y + d.y })).filter((p) => isDrivable(tileAt(map, p.x, p.y)));
}

export function roadTiles(map: CityMap): Point[] {
  const out: Point[] = [];
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) if (isDrivable(map.tiles[y * map.width + x])) out.push({ x, y });
  return out;
}

export const tileCenter = (map: CityMap, x: number, y: number): Vec => ({
  x: (x + 0.5) * map.tileSize,
  y: (y + 0.5) * map.tileSize,
});

export const worldToTile = (map: CityMap, p: Vec): Point => ({
  x: Math.floor(p.x / map.tileSize),
  y: Math.floor(p.y / map.tileSize),
});

export function streetNameAt(map: CityMap, x: number, y: number): string {
  const tile = tileAt(map, x, y);
  if (!isDrivable(tile)) return '';
  const horizontal = map.rowNames.get(y);
  const vertical = map.colNames.get(x);
  const runsHorizontally = isDrivable(tileAt(map, x - 1, y)) || isDrivable(tileAt(map, x + 1, y));
  if (horizontal && runsHorizontally) return horizontal;
  return vertical ?? horizontal ?? '';
}

// ---------------------------------------------------------------------------

function pickLines(rng: Rng, size: number): number[] {
  const lines = [1];
  let cur = 1;
  while (true) {
    const next = cur + rng.int(4, 6);
    if (next >= size - 4) break;
    lines.push(next);
    cur = next;
  }
  lines.push(size - 2);
  return lines;
}

function set(map: CityMap, x: number, y: number, t: Tile) {
  if (x >= 0 && y >= 0 && x < map.width && y < map.height) map.tiles[y * map.width + x] = t;
}

function fillerFor(map: CityMap, x: number, y: number, was: Tile): Tile {
  if (was === Tile.Bridge) return Tile.Water;
  const around = DIRS.map((d) => tileAt(map, x + d.x, y + d.y));
  // A removed stub between two park tiles becomes a park path; otherwise it's built over.
  if (around.filter((t) => t === Tile.Park).length >= 2) return Tile.Park;
  return Tile.Building;
}

function pruneDeadEnds(map: CityMap) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const t of roadTiles(map)) {
      if (drivableNeighbours(map, t.x, t.y).length < 2) {
        set(map, t.x, t.y, fillerFor(map, t.x, t.y, tileAt(map, t.x, t.y)));
        changed = true;
      }
    }
  }
}

function keepLargestComponent(map: CityMap) {
  const comp = new Map<number, number>();
  const sizes: number[] = [];
  for (const start of roadTiles(map)) {
    const k0 = start.y * map.width + start.x;
    if (comp.has(k0)) continue;
    const id = sizes.length;
    let size = 0;
    const stack = [start];
    comp.set(k0, id);
    while (stack.length) {
      const cur = stack.pop()!;
      size++;
      for (const n of drivableNeighbours(map, cur.x, cur.y)) {
        const k = n.y * map.width + n.x;
        if (!comp.has(k)) {
          comp.set(k, id);
          stack.push(n);
        }
      }
    }
    sizes.push(size);
  }
  const best = sizes.indexOf(Math.max(...sizes));
  for (const [k, id] of comp) {
    if (id !== best) {
      const x = k % map.width;
      const y = Math.floor(k / map.width);
      set(map, x, y, fillerFor(map, x, y, tileAt(map, x, y)));
    }
  }
}

function placeBuildings(map: CityMap, rng: Rng) {
  const covered = new Uint8Array(map.tiles.length);
  const ts = map.tileSize;
  const inset = ts * 0.12;
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const i = y * map.width + x;
      if (covered[i] || map.tiles[i] !== Tile.Building) continue;
      let w = rng.int(1, 3);
      let h = rng.int(1, 3);
      const fits = (ww: number, hh: number) => {
        for (let yy = y; yy < y + hh; yy++)
          for (let xx = x; xx < x + ww; xx++) {
            if (tileAt(map, xx, yy) !== Tile.Building || xx >= map.width || yy >= map.height) return false;
            if (covered[yy * map.width + xx]) return false;
          }
        return true;
      };
      while (!fits(w, h)) {
        if (w >= h && w > 1) w--;
        else if (h > 1) h--;
        else break;
      }
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) covered[yy * map.width + xx] = 1;
      map.buildings.push({
        x: x * ts + inset,
        y: y * ts + inset,
        w: w * ts - inset * 2,
        h: h * ts - inset * 2,
        height: 0.25 + rng.next() * 0.75,
      });
    }
  }
}

function attempt(opts: CityOptions, seed: number): CityMap {
  const rng = createRng(seed);
  const { width, height } = opts;
  const map: CityMap = {
    width,
    height,
    tileSize: opts.tileSize ?? 64,
    seed: opts.seed,
    tiles: new Array(width * height).fill(Tile.Building),
    roadRows: pickLines(rng, height),
    roadCols: pickLines(rng, width),
    rowNames: new Map(),
    colNames: new Map(),
    buildings: [],
    landmarks: [],
  };
  const { roadRows: rows, roadCols: cols } = map;

  // 1. Full street grid.
  for (const r of rows) for (let x = cols[0]; x <= cols[cols.length - 1]; x++) set(map, x, r, Tile.Road);
  for (const c of cols) for (let y = rows[0]; y <= rows[rows.length - 1]; y++) set(map, c, y, Tile.Road);

  // 2. Parks on some blocks.
  for (let ri = 0; ri < rows.length - 1; ri++)
    for (let ci = 0; ci < cols.length - 1; ci++)
      if (rng.chance(0.12))
        for (let y = rows[ri] + 1; y < rows[ri + 1]; y++)
          for (let x = cols[ci] + 1; x < cols[ci + 1]; x++) set(map, x, y, Tile.Park);

  // 3. Knock out interior street segments to create varied, maze-like routes.
  const interiorRows = rows.slice(1, -1);
  const interiorCols = cols.slice(1, -1);
  for (const r of interiorRows)
    for (let ci = 0; ci < cols.length - 1; ci++)
      if (rng.chance(0.2)) for (let x = cols[ci] + 1; x < cols[ci + 1]; x++) set(map, x, r, Tile.Building);
  for (const c of interiorCols)
    for (let ri = 0; ri < rows.length - 1; ri++)
      if (rng.chance(0.2)) for (let y = rows[ri] + 1; y < rows[ri + 1]; y++) set(map, c, y, Tile.Building);

  // 4. A river running north–south through one block column near the middle.
  const mid = Math.floor((cols.length - 1) / 2);
  const riverBlock = rng.int(Math.max(1, mid - 1), Math.min(cols.length - 3, mid + 1));
  const rx0 = cols[riverBlock] + 1;
  const rx1 = cols[riverBlock + 1] - 1;
  const bridgeRows = new Set<number>();
  const shuffled = [...rows].sort(() => rng.next() - 0.5);
  const nBridges = Math.max(2, Math.round(rows.length * 0.45));
  shuffled.slice(0, nBridges).forEach((r) => bridgeRows.add(r));
  for (let y = 0; y < height; y++)
    for (let x = rx0; x <= rx1; x++) {
      if (bridgeRows.has(y)) set(map, x, y, Tile.Bridge);
      else set(map, x, y, Tile.Water);
    }
  // Soft riverbanks: occasionally widen into the neighbouring block interior.
  for (let y = 0; y < height; y++) {
    if (rows.includes(y)) continue;
    if (rng.chance(0.25) && tileAt(map, rx0 - 1, y) !== Tile.Road) set(map, rx0 - 1, y, Tile.Water);
    if (rng.chance(0.25) && tileAt(map, rx1 + 1, y) !== Tile.Road) set(map, rx1 + 1, y, Tile.Water);
  }

  // 5. Clean-up so the network is pac-man friendly.
  pruneDeadEnds(map);
  keepLargestComponent(map);
  pruneDeadEnds(map);

  // 6. Names.
  const names = [...STREET_NAMES].sort(() => rng.next() - 0.5);
  rows.forEach((r, i) => map.rowNames.set(r, `${names[i % names.length]} St`));
  cols.forEach((c, i) => map.colNames.set(c, `${names[(i + rows.length) % names.length]} Ave`));

  placeBuildings(map, rng);
  return map;
}

export function generateCity(opts: CityOptions): CityMap {
  // Rarely, the random cuts leave too little city; retry with a derived seed until it's playable.
  for (let i = 0; i < 20; i++) {
    const map = attempt(opts, opts.seed + i * 7919);
    const bridges = map.tiles.filter((t) => t === Tile.Bridge).length;
    const roads = roadTiles(map).length;
    if (bridges >= 2 && roads > map.width * map.height * 0.2) return map;
  }
  throw new Error('Could not generate a playable city');
}
