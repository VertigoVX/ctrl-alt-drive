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
}

export const DEFAULT_HANDLING: Handling = {
  maxSpeed: 270,
  maxReverse: 110,
  accel: 430,
  brake: 800,
  coast: 260,
  // 40% gentler than the launch tuning (3.4): players found small taps over-steered.
  turnRate: 3.4 * 0.6,
  turnSpeedRef: 90,
  laneAssist: 8,
};

export interface Vehicle {
  pos: Vec;
  heading: number;
  speed: number;
  radius: number;
  /** True if the last update hit a wall — the renderer shakes/sparks on this. */
  bumped: boolean;
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
  const accel = h.accel * boost;

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
  const dx = Math.cos(v.heading) * v.speed * dt;
  const dy = Math.sin(v.heading) * v.speed * dt;
  const nx = { x: v.pos.x + dx, y: v.pos.y };
  if (!collidesAt(map, nx, v.radius)) v.pos.x = nx.x;
  else v.bumped = true;
  const ny = { x: v.pos.x, y: v.pos.y + dy };
  if (!collidesAt(map, ny, v.radius)) v.pos.y = ny.y;
  else v.bumped = true;
  if (v.bumped) v.speed *= 0.92;
}
