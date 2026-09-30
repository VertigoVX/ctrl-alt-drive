import { drivableNeighbours, tileCenter, worldToTile, type CityMap, type Point } from './city';
import { angleDiff, angleOf, dist, sub, type Vec } from './math';
import { findPath } from './pathfinding';
import type { Rng } from './rng';
import { canSee } from './vision';

export type AvState = 'patrol' | 'alert' | 'chase' | 'search' | 'rebooting';

export interface AvTuning {
  patrolSpeed: number;
  alertSpeed: number;
  chaseSpeed: number;
  searchSpeed: number;
  /** Seconds of headlight-flashing before a chase starts: the player's reaction window. */
  alertTime: number;
  /** Seconds a chasing car keeps tracking after losing sight. */
  memory: number;
  searchTime: number;
  rebootTime: number;
  visionRange: number;
  visionHalfAngle: number;
  chaseVisionRange: number;
  chaseVisionHalfAngle: number;
  replanInterval: number;
}

export const DEFAULT_AV_TUNING: AvTuning = {
  patrolSpeed: 150,
  alertSpeed: 70,
  chaseSpeed: 240,
  searchSpeed: 185,
  alertTime: 0.4,
  memory: 0.8,
  searchTime: 3.5,
  rebootTime: 7,
  visionRange: 300,
  visionHalfAngle: 0.5,
  chaseVisionRange: 380,
  chaseVisionHalfAngle: 0.95,
  replanInterval: 0.3,
};

export interface Autonomous {
  id: number;
  pos: Vec;
  heading: number;
  speed: number;
  speedScale: number;
  /** The tile the car last reached. */
  tile: Point;
  /** The tile it is driving towards. */
  next: Point;
  prev: Point | null;
  path: Point[];
  state: AvState;
  stateTime: number;
  unseenTime: number;
  replanTimer: number;
  lastSeen: Vec | null;
  age: number;
}

export interface AvContext {
  map: CityMap;
  taxi: Vec;
  dt: number;
  rng: Rng;
  tuning: AvTuning;
}

export const headlightsOn = (av: Autonomous) => av.state === 'alert' || av.state === 'chase';

const same = (a: Point, b: Point | null) => !!b && a.x === b.x && a.y === b.y;

function patrolNext(av: Autonomous, map: CityMap, rng: Rng): Point {
  const options = drivableNeighbours(map, av.tile.x, av.tile.y).filter((n) => !same(n, av.prev));
  if (!options.length) return av.prev ?? av.tile;
  // Slight preference for carrying straight on, like real traffic.
  const dir = av.prev ? { x: av.tile.x - av.prev.x, y: av.tile.y - av.prev.y } : null;
  const weighted = options.flatMap((o) =>
    dir && o.x - av.tile.x === dir.x && o.y - av.tile.y === dir.y ? [o, o] : [o],
  );
  return rng.pick(weighted);
}

export function createAutonomous(id: number, map: CityMap, tile: Point, heading: number): Autonomous {
  const options = drivableNeighbours(map, tile.x, tile.y);
  // Start by driving whichever way the car is already facing (or the closest match).
  const next = options.sort(
    (a, b) =>
      Math.abs(angleDiff(heading, Math.atan2(a.y - tile.y, a.x - tile.x))) -
      Math.abs(angleDiff(heading, Math.atan2(b.y - tile.y, b.x - tile.x))),
  )[0] ?? tile;
  return {
    id,
    pos: tileCenter(map, tile.x, tile.y),
    heading,
    speed: 0,
    speedScale: 1,
    tile: { ...tile },
    next,
    prev: null,
    path: [],
    state: 'patrol',
    stateTime: 0,
    unseenTime: 0,
    replanTimer: 0,
    lastSeen: null,
    age: 0,
  };
}

function setState(av: Autonomous, state: AvState) {
  if (av.state === state) return;
  av.state = state;
  av.stateTime = 0;
  av.replanTimer = 0;
  av.path = [];
}

function planTo(av: Autonomous, map: CityMap, target: Vec) {
  const goal = worldToTile(map, target);
  const path = findPath(map, av.next, goal, { maxNodes: 1500 });
  if (path) av.path = path.slice(1);
}

function targetSpeed(av: Autonomous, t: AvTuning): number {
  switch (av.state) {
    case 'patrol': return t.patrolSpeed;
    case 'alert': return t.alertSpeed;
    case 'chase': return t.chaseSpeed;
    case 'search': return t.searchSpeed;
    case 'rebooting': return 0;
  }
}

function drive(av: Autonomous, ctx: AvContext) {
  const { map, dt, rng } = ctx;
  let remaining = av.speed * dt;
  let guard = 0;
  while (remaining > 0 && guard++ < 8) {
    const target = tileCenter(map, av.next.x, av.next.y);
    const d = dist(av.pos, target);
    if (d <= remaining) {
      av.pos = target;
      remaining -= d;
      av.prev = av.tile;
      av.tile = av.next;
      const planned = av.path.shift();
      const neighbours = drivableNeighbours(map, av.tile.x, av.tile.y);
      av.next = planned && neighbours.some((n) => same(n, planned)) ? planned : patrolNext(av, map, rng);
    } else {
      const k = remaining / d;
      av.pos = { x: av.pos.x + (target.x - av.pos.x) * k, y: av.pos.y + (target.y - av.pos.y) * k };
      remaining = 0;
    }
  }
  const aim = tileCenter(map, av.next.x, av.next.y);
  if (dist(aim, av.pos) > 0.5) {
    const want = angleOf(sub(aim, av.pos));
    av.heading += angleDiff(av.heading, want) * Math.min(1, 14 * dt);
  }
}

export function updateAutonomous(av: Autonomous, ctx: AvContext) {
  const { map, taxi, dt, tuning: t } = ctx;
  av.age += dt;
  av.stateTime += dt;

  if (av.state === 'rebooting') {
    av.speed = 0;
    if (av.stateTime >= t.rebootTime) setState(av, 'patrol');
    return;
  }

  const hunting = av.state === 'chase' || av.state === 'alert';
  const sees = canSee(map, { pos: av.pos, heading: av.heading }, taxi, {
    range: hunting ? t.chaseVisionRange : t.visionRange,
    halfAngle: hunting ? t.chaseVisionHalfAngle : t.visionHalfAngle,
  });

  if (sees) {
    av.lastSeen = { ...taxi };
    av.unseenTime = 0;
  } else {
    av.unseenTime += dt;
  }

  switch (av.state) {
    case 'patrol':
    case 'search':
      if (sees) setState(av, 'alert');
      else if (av.state === 'search' && av.stateTime >= t.searchTime) setState(av, 'patrol');
      break;
    case 'alert':
      if (av.stateTime >= t.alertTime) setState(av, av.unseenTime < t.memory ? 'chase' : 'search');
      break;
    case 'chase':
      if (av.unseenTime >= t.memory) {
        setState(av, 'search');
        if (av.lastSeen) planTo(av, map, av.lastSeen);
      } else {
        av.replanTimer -= dt;
        if (av.replanTimer <= 0) {
          planTo(av, map, av.lastSeen ?? taxi);
          av.replanTimer = t.replanInterval;
        }
      }
      break;
  }

  const want = targetSpeed(av, t) * av.speedScale;
  av.speed += (want - av.speed) * Math.min(1, 5 * dt);
  drive(av, ctx);
}
