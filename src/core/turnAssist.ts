import { isDrivable, tileAt, tileCenter, worldToTile, type CityMap, type Point } from './city';
import { createStickMemory, inputFromStick, type StickMemory } from './input';
import { angleDiff, type Vec } from './math';
import type { DriveInput, Handling } from './vehicle';

/**
 * Turn assist for the touch stick, Pac-Man style: point where you want to go and the cab takes
 * the next street that way. The stick snaps to the four street directions; a perpendicular point
 * queues a turn at the next junction ahead with that exit, and the assist brakes to a cornering
 * speed and steers in at the right moment for the cab's real turning circle. Pointing ahead
 * drives straight; pointing back brakes, then hands over to the three-point-turn logic.
 *
 * It only ever acts on where the player points. It never follows the route line.
 */

export interface QueuedTurn {
  /** The junction tile where the turn will be taken. */
  x: number;
  y: number;
  dir: Point;
}

export interface AssistMemory {
  queued: QueuedTurn | null;
  /** Turning in to the queued junction: stay committed until the cab faces the new street. */
  committed: boolean;
  /** Three-point-turn state, shared with the manual stick logic. */
  stick: StickMemory;
}

export const createAssistMemory = (): AssistMemory => ({ queued: null, committed: false, stick: createStickMemory() });

export interface AssistCar {
  pos: Vec;
  heading: number;
  speed: number;
  bumped?: boolean;
  radius?: number;
}

const DIRS: Point[] = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];

const cardinal = (angle: number): Point => DIRS[((Math.round(angle / (Math.PI / 2)) % 4) + 4) % 4];
const angleOfDir = (d: Point) => Math.atan2(d.y, d.x);
const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

/** How far ahead (in tiles) a queued turn may be. */
const LOOKAHEAD = 14;
/** Speed below which a cab is "slow": it may still turn at a junction it is partly through. */
const SLOW = 60;
/** Steering gain while turning in, per radian of heading error. */
const TURN_GAIN = 3;
/** Gap kept between the cab's nose and a wall it was told to drive at. */
const STOP_GAP = 3;

type AssistHandling = Pick<Handling, 'turnRate' | 'brake' | 'turnSpeedRef'>;

export function assistedStick(stick: Vec, car: AssistCar, map: CityMap, mem: AssistMemory, h: AssistHandling): DriveInput {
  const mag = Math.min(1, Math.hypot(stick.x, stick.y));
  if (mag < 0.2) {
    clear(mem);
    mem.stick = createStickMemory();
    return { throttle: 0, steer: 0 };
  }
  const want = cardinal(Math.atan2(stick.y, stick.x));
  const travel = cardinal(car.heading);
  const offAxis = Math.abs(angleDiff(car.heading, angleOfDir(travel)));
  const backwards = same(want, { x: -travel.x, y: -travel.y });

  // Mid three-point turn, reversing, or knocked off-axis at low speed: the manual stick logic
  // already handles recovery well, so let it drive.
  const turningIn = mem.committed && mem.queued !== null && same(mem.queued.dir, want);
  if (!turningIn && (mem.stick.manoeuvre || car.speed < -5 || (offAxis > 0.6 && Math.abs(car.speed) < SLOW))) {
    clear(mem);
    return inputFromStick(stick, car, mem.stick);
  }

  if (backwards) {
    clear(mem);
    // A car can't reverse direction on the spot: brake to a crawl, then three-point turn.
    if (car.speed > 40) return { throttle: -1, steer: 0 };
    return inputFromStick(stick, car, mem.stick);
  }

  if (same(want, travel)) {
    clear(mem); // includes handing a finished turn back to the lane assist
    return straightOn(car, map, travel, mag, h);
  }

  if (turningIn) {
    const q = mem.queued!;
    return turnIn(car, map, q, want, mag, h);
  }

  // Perpendicular: find the next junction ahead with an exit that way.
  const ts = map.tileSize;
  const here = worldToTile(map, car.pos);
  const progressHere = (car.pos.x - tileCenter(map, here.x, here.y).x) * travel.x + (car.pos.y - tileCenter(map, here.x, here.y).y) * travel.y;
  let junction: Point | null = null;
  for (let k = 0; k <= LOOKAHEAD; k++) {
    const t = { x: here.x + travel.x * k, y: here.y + travel.y * k };
    if (!isDrivable(tileAt(map, t.x, t.y))) break;
    // Too far through this junction to make the turn at speed: Pac-Man would queue the next one.
    if (k === 0 && progressHere > ts * (car.speed < SLOW ? 0.45 : 0.15)) continue;
    if (isDrivable(tileAt(map, t.x + want.x, t.y + want.y))) {
      junction = t;
      break;
    }
  }
  if (!junction) {
    // No street that way ahead: keep going straight rather than steer into a wall.
    clear(mem);
    return straightOn(car, map, travel, mag, h);
  }
  if (!mem.queued || mem.queued.x !== junction.x || mem.queued.y !== junction.y || !same(mem.queued.dir, want)) mem.committed = false;
  mem.queued = { x: junction.x, y: junction.y, dir: want };

  // Geometry of the turn. Below turnSpeedRef steering authority scales with speed, so the
  // tightest circle is turnSpeedRef / turnRate; above it the circle grows with speed. The plan
  // is to arrive at cornering speed and turn in one radius before the junction's centre.
  const centre = tileCenter(map, junction.x, junction.y);
  const toCentre = (centre.x - car.pos.x) * travel.x + (centre.y - car.pos.y) * travel.y;
  const v = Math.max(0, car.speed);
  const cornerSpeed = cornerSpeedFor(ts, h);
  const plannedRadius = Math.max(Math.min(v, cornerSpeed), h.turnSpeedRef) / h.turnRate;
  if (toCentre <= plannedRadius + 2) {
    mem.committed = true;
    return turnIn(car, map, mem.queued, want, mag, h);
  }
  // Approaching: brake in time to arrive at the turn-in point at cornering speed.
  const toTurnIn = toCentre - plannedRadius;
  if (v > cornerSpeed && toTurnIn <= brakingDistance(v, cornerSpeed, h) + v * 0.05) return { throttle: -1, steer: 0 };
  return { throttle: mag, steer: 0 };
}

function clear(mem: AssistMemory) {
  mem.queued = null;
  mem.committed = false;
}

const cornerSpeedFor = (ts: number, h: AssistHandling) => Math.max(h.turnSpeedRef, 0.5 * ts * h.turnRate);
const brakingDistance = (from: number, to: number, h: AssistHandling) => Math.max(0, (from * from - to * to) / (2 * h.brake));

/** Steer round the corner, shedding excess speed so the circle stays tight. */
function turnIn(car: AssistCar, map: CityMap, _q: QueuedTurn, want: Point, mag: number, h: AssistHandling): DriveInput {
  const v = Math.max(0, car.speed);
  const cornerSpeed = cornerSpeedFor(map.tileSize, h);
  const throttle = v > cornerSpeed * 1.15 ? -1 : v > cornerSpeed ? 0 : mag;
  const error = angleDiff(car.heading, angleOfDir(want));
  return { throttle, steer: Math.max(-1, Math.min(1, error * TURN_GAIN)) };
}

/** Drive straight along the street, braking to stop short of a wall rather than hitting it. */
function straightOn(car: AssistCar, map: CityMap, travel: Point, mag: number, h: AssistHandling): DriveInput {
  const ts = map.tileSize;
  const here = worldToTile(map, car.pos);
  let n = 0;
  while (n < LOOKAHEAD && isDrivable(tileAt(map, here.x + travel.x * (n + 1), here.y + travel.y * (n + 1)))) n++;
  if (n === LOOKAHEAD) return { throttle: mag, steer: 0 };
  const last = tileCenter(map, here.x + travel.x * n, here.y + travel.y * n);
  const wall = (last.x - car.pos.x) * travel.x + (last.y - car.pos.y) * travel.y + ts / 2;
  const room = wall - (car.radius ?? 13) - STOP_GAP;
  const v = Math.max(0, car.speed);
  if (room <= 1) return { throttle: v > 5 ? -1 : 0, steer: 0 };
  if (brakingDistance(v, 0, h) + v * 0.04 >= room) return { throttle: -1, steer: 0 };
  // Creep the last stretch so the cab settles instead of bumping the wall.
  if (room < 24) return { throttle: v > room * 3 ? 0 : mag * 0.4, steer: 0 };
  return { throttle: mag, steer: 0 };
}
