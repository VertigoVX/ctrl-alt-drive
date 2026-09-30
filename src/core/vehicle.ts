import { isDrivable, tileAt, type CityMap } from './city';
import { angleDiff, clamp, type Vec } from './math';

export interface Handling {
  maxSpeed: number;
  maxReverse: number;
  accel: number;
  brake: number;
  coast: number;
  turnRate: number;
  /** Speed at which steering reaches full authority. */
  turnSpeedRef: number;
  /** How strongly heading settles onto the road axis when the player isn't steering. */
  laneAssist: number;
  /** Fraction of full acceleration available from a standstill; builds to 1 by `launchSpeed`. */
  launchGrip: number;
  launchSpeed: number;
  /** How fast (world units/s) the cab drifts back to its lane centre when not steering. */
  laneKeep: number;
}

export const DEFAULT_HANDLING: Handling = {
  maxSpeed: 270,
  maxReverse: 110,
  accel: 310,
  brake: 800,
  coast: 260,
  // 40% gentler than the launch tuning (3.4): players found small taps over-steered.
  turnRate: 3.4 * 0.6,
  turnSpeedRef: 90,
  laneAssist: 8,
  // Gentle pull-away: players were launching into walls from a standstill.
  launchGrip: 0.35,
  launchSpeed: 140,
  laneKeep: 40,
};

export interface Vehicle {
  pos: Vec;
  heading: number;
  speed: number;
  radius: number;
  /** True if the last update hit a wall — the renderer shakes/sparks on this. */
  bumped: boolean;
  /** Speed straight into the wall on the last update's collision (0 if none). */
  impact: number;
}

export interface DriveInput {
  /** -1 (reverse/brake) .. 1 (accelerate) */
  throttle: number;
  /** -1 (left) .. 1 (right) */
  steer: number;
}

export const createVehicle = (pos: Vec, heading: number, radius = 13): Vehicle => ({
  pos: { ...pos },
  heading,
  speed: 0,
  radius,
  bumped: false,
  impact: 0,
});

export function collidesAt(map: CityMap, p: Vec, r: number): boolean {
  const samples = 8;
  for (let i = 0; i <= samples; i++) {
    const a = (i / samples) * Math.PI * 2;
    const x = i === samples ? p.x : p.x + Math.cos(a) * r;
    const y = i === samples ? p.y : p.y + Math.sin(a) * r;
    if (!isDrivable(tileAt(map, Math.floor(x / map.tileSize), Math.floor(y / map.tileSize)))) return true;
  }
  return false;
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export function updateVehicle(v: Vehicle, input: DriveInput, dt: number, map: CityMap, boost = 1, h = DEFAULT_HANDLING) {
  const maxSpeed = h.maxSpeed * boost;
  // Acceleration builds with speed, so pulling away is gradual and controllable.
  const grip = h.launchGrip + (1 - h.launchGrip) * Math.min(1, Math.abs(v.speed) / h.launchSpeed);
  const accel = h.accel * boost * grip;

  // Longitudinal.
  if (input.throttle > 0) {
    v.speed += (v.speed < 0 ? h.brake : accel) * input.throttle * dt;
  } else if (input.throttle < 0) {
    v.speed += (v.speed > 0 ? h.brake : accel) * input.throttle * dt;
  } else {
    const s = Math.sign(v.speed);
    v.speed -= s * h.coast * dt;
    if (Math.sign(v.speed) !== s) v.speed = 0;
  }
  v.speed = clamp(v.speed, -h.maxReverse, maxSpeed);

  // Steering scales with speed, and inverts in reverse like a real car.
  const authority = Math.min(1, Math.abs(v.speed) / h.turnSpeedRef) * Math.sign(v.speed);
  if (input.steer !== 0) {
    v.heading = wrap(v.heading + input.steer * h.turnRate * authority * dt);
  } else if (Math.abs(v.speed) > 20) {
    const axis = Math.round(v.heading / (Math.PI / 2)) * (Math.PI / 2);
    v.heading = wrap(v.heading + angleDiff(v.heading, axis) * Math.min(1, h.laneAssist * dt));
  }

  // Move each axis separately so the car slides along walls.
  v.bumped = false;
  v.impact = 0;
  // Corner assist only follows the main direction of travel: a slight sideways drift into a
  // kerb isn't an intent to turn, and assisting both axes can cancel out and pin the cab.
  const mainlyX = Math.abs(Math.cos(v.heading)) >= Math.abs(Math.sin(v.heading));
  const dx = Math.cos(v.heading) * v.speed * dt;
  const dy = Math.sin(v.heading) * v.speed * dt;
  const nx = { x: v.pos.x + dx, y: v.pos.y };
  if (!collidesAt(map, nx, v.radius)) v.pos.x = nx.x;
  else {
    v.bumped = true;
    v.impact = Math.max(v.impact, Math.abs(Math.cos(v.heading) * v.speed));
    if (mainlyX) cornerAssist(v, map, 'x', Math.sign(dx), Math.abs(v.speed) * dt);
  }
  const ny = { x: v.pos.x, y: v.pos.y + dy };
  if (!collidesAt(map, ny, v.radius)) v.pos.y = ny.y;
  else {
    v.bumped = true;
    v.impact = Math.max(v.impact, Math.abs(Math.sin(v.heading) * v.speed));
    if (!mainlyX) cornerAssist(v, map, 'y', Math.sign(dy), Math.abs(v.speed) * dt);
  }
  // Lane keeping: when the player isn't steering, ease the cab back to the middle of the
  // lane it's driving along. Pairs with the heading lane assist above.
  if (input.steer === 0 && Math.abs(v.speed) > 40) {
    const ts = map.tileSize;
    const across = mainlyX ? v.pos.y : v.pos.x;
    const centre = (Math.floor(across / ts) + 0.5) * ts;
    const gap = centre - across;
    const shift = Math.sign(gap) * Math.min(Math.abs(gap), h.laneKeep * dt);
    const p = mainlyX ? { x: v.pos.x, y: v.pos.y + shift } : { x: v.pos.x + shift, y: v.pos.y };
    if (shift && !collidesAt(map, p, v.radius)) v.pos = p;
  }

  // A head-on crash kills most of your speed, a knock scrubs some, and a glancing graze along
  // a kerb barely slows you (it used to bleed 8% per frame, which left cabs crawling along walls).
  if (v.bumped) v.speed *= v.impact > 80 ? 0.35 : v.impact > 30 ? 0.92 : 0.99;
}

/**
 * Blocked while pushing along one axis? If an open street lies that way from a lane the cab
 * is partly in, ease the cab sideways onto that lane's centre line so it slides into the street
 * rather than grinding on the corner. Only ever moves toward the centre of an open lane.
 */
function cornerAssist(v: Vehicle, map: CityMap, axis: 'x' | 'y', dir: number, step: number) {
  if (!dir || step <= 0) return;
  const ts = map.tileSize;
  const along = axis === 'x' ? v.pos.x : v.pos.y;
  const across = axis === 'x' ? v.pos.y : v.pos.x;
  const ahead = Math.floor((along + dir * (v.radius + 2)) / ts);
  const here = Math.floor(along / ts);
  let best: number | null = null;
  for (let lane = Math.floor((across - v.radius) / ts); lane <= Math.floor((across + v.radius) / ts); lane++) {
    const open = (a: number) => isDrivable(axis === 'x' ? tileAt(map, a, lane) : tileAt(map, lane, a));
    if (!open(ahead) || !open(here)) continue;
    const centre = (lane + 0.5) * ts;
    if (best === null || Math.abs(centre - across) < Math.abs(best - across)) best = centre;
  }
  if (best === null || Math.abs(best - across) < 0.5) return;
  const move = Math.sign(best - across) * Math.min(Math.abs(best - across), Math.max(step, 0.6));
  const p = axis === 'x' ? { x: v.pos.x, y: v.pos.y + move } : { x: v.pos.x + move, y: v.pos.y };
  // Allowed if it's clear, or if the cab is already wedged on the corner (then any move toward
  // the open lane's centre line is a move out of the wall, never further in).
  if (!collidesAt(map, p, v.radius) || collidesAt(map, v.pos, v.radius)) v.pos = p;
}
