import { drivableNeighbours, isDrivable, tileAt, type CityMap, type Point } from './city';

export interface PathOptions {
  /** Tiles ("x,y") that may not be entered. */
  blocked?: Set<string>;
  /** Give up after expanding this many nodes. */
  maxNodes?: number;
}

const key = (p: Point) => `${p.x},${p.y}`;
const manhattan = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/** A* over the 4-connected road grid. Returns the tile path including start and goal, or null. */
export function findPath(map: CityMap, start: Point, goal: Point, opts: PathOptions = {}): Point[] | null {
  if (!isDrivable(tileAt(map, goal.x, goal.y))) return null;
  if (start.x === goal.x && start.y === goal.y) return [{ ...start }];

  const blocked = opts.blocked ?? new Set<string>();
  const maxNodes = opts.maxNodes ?? map.width * map.height;
  const open: { p: Point; f: number; g: number }[] = [{ p: start, f: manhattan(start, goal), g: 0 }];
  const came = new Map<string, Point>();
  const best = new Map<string, number>([[key(start), 0]]);
  let expanded = 0;

  while (open.length && expanded < maxNodes) {
    // The grids are small; a linear scan beats a heap in both code size and practice here.
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const cur = open.splice(bi, 1)[0];
    expanded++;
    if (cur.p.x === goal.x && cur.p.y === goal.y) {
      const path = [cur.p];
      let k = key(cur.p);
      while (came.has(k)) {
        const prev = came.get(k)!;
        path.push(prev);
        k = key(prev);
      }
      return path.reverse();
    }
    for (const n of drivableNeighbours(map, cur.p.x, cur.p.y)) {
      const nk = key(n);
      if (blocked.has(nk)) continue;
      const g = cur.g + 1;
      if (g < (best.get(nk) ?? Infinity)) {
        best.set(nk, g);
        came.set(nk, cur.p);
        open.push({ p: n, g, f: g + manhattan(n, goal) });
      }
    }
  }
  return null;
}

export type TurnKind = 'left' | 'right' | 'arrive';
export interface Turn {
  kind: TurnKind;
  tilesAway: number;
  at: Point;
}

/** The first manoeuvre along a path — powers the Maps-style direction banner. */
export function nextTurn(path: Point[]): Turn {
  const last = path[path.length - 1];
  if (path.length < 3) return { kind: 'arrive', tilesAway: path.length - 1, at: last };
  const d0 = { x: path[1].x - path[0].x, y: path[1].y - path[0].y };
  for (let i = 1; i < path.length - 1; i++) {
    const d = { x: path[i + 1].x - path[i].x, y: path[i + 1].y - path[i].y };
    if (d.x !== d0.x || d.y !== d0.y) {
      // Screen space has y pointing down, so a positive cross product is a clockwise (right) turn.
      const cross = d0.x * d.y - d0.y * d.x;
      return { kind: cross > 0 ? 'right' : 'left', tilesAway: i, at: path[i] };
    }
  }
  return { kind: 'arrive', tilesAway: path.length - 1, at: last };
}

/** Road distance (in tiles) from `start` to every tile; -1 where unreachable. */
export function distanceField(map: CityMap, start: Point): Int32Array {
  const d = new Int32Array(map.width * map.height).fill(-1);
  if (!isDrivable(tileAt(map, start.x, start.y))) return d;
  d[start.y * map.width + start.x] = 0;
  const queue: Point[] = [start];
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi];
    const base = d[cur.y * map.width + cur.x];
    for (const n of drivableNeighbours(map, cur.x, cur.y)) {
      const k = n.y * map.width + n.x;
      if (d[k] === -1) {
        d[k] = base + 1;
        queue.push(n);
      }
    }
  }
  return d;
}
