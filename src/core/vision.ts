import { blocksSight, tileAt, type CityMap } from './city';
import { angleDiff, angleOf, dist, sub, type Vec } from './math';

/** Ray-march between two world points; false if any building tile is in the way. */
export function hasLineOfSight(map: CityMap, from: Vec, to: Vec): boolean {
  const d = dist(from, to);
  const step = map.tileSize / 4;
  const n = Math.ceil(d / step);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const x = Math.floor((from.x + (to.x - from.x) * t) / map.tileSize);
    const y = Math.floor((from.y + (to.y - from.y) * t) / map.tileSize);
    if (blocksSight(tileAt(map, x, y))) return false;
  }
  return true;
}

export interface Eye {
  pos: Vec;
  heading: number;
}

export interface Cone {
  range: number;
  halfAngle: number;
}

/** Headlight cone check: in range, inside the cone (or right up close), and not behind a building. */
export function canSee(map: CityMap, eye: Eye, target: Vec, cone: Cone): boolean {
  const d = dist(eye.pos, target);
  if (d > cone.range) return false;
  const close = d <= map.tileSize * 1.1;
  if (!close && Math.abs(angleDiff(eye.heading, angleOf(sub(target, eye.pos)))) > cone.halfAngle) return false;
  return hasLineOfSight(map, eye.pos, target);
}

/** End points of `rays` sight rays spread across the cone, each stopping at the first building. */
export function visibilityFan(map: CityMap, eye: Eye, cone: Cone, rays = 24): Vec[] {
  const step = map.tileSize / 8;
  const out: Vec[] = [];
  for (let i = 0; i < rays; i++) {
    const a = eye.heading - cone.halfAngle + (cone.halfAngle * 2 * i) / (rays - 1);
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let d = 0;
    while (d < cone.range) {
      const nd = Math.min(cone.range, d + step);
      const x = eye.pos.x + dx * nd;
      const y = eye.pos.y + dy * nd;
      if (blocksSight(tileAt(map, Math.floor(x / map.tileSize), Math.floor(y / map.tileSize)))) break;
      d = nd;
    }
    out.push({ x: eye.pos.x + dx * d, y: eye.pos.y + dy * d });
  }
  return out;
}
