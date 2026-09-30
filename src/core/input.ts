import { angleDiff, clamp, type Vec } from './math';
import type { DriveInput } from './vehicle';

const UP = ['ArrowUp', 'KeyW'];
const DOWN = ['ArrowDown', 'KeyS'];
const LEFT = ['ArrowLeft', 'KeyA'];
const RIGHT = ['ArrowRight', 'KeyD'];

/** How hard the touch stick steers per radian of error (was 2, lowered 40%). */
export const STICK_GAIN = 2 * 0.6;

const any = (keys: Set<string>, list: string[]) => list.some((k) => keys.has(k));

export function inputFromKeys(keys: Set<string>): DriveInput {
  const throttle = (any(keys, UP) ? 1 : 0) - (any(keys, DOWN) ? 1 : 0);
  const steer = (any(keys, RIGHT) ? 1 : 0) - (any(keys, LEFT) ? 1 : 0);
  return { throttle, steer };
}

export interface StickCar {
  heading: number;
  speed: number;
  /** Pressed against a wall on the last update. */
  bumped?: boolean;
}

/** Point further than this behind a slow cab and it reverses (radians, ~110°). */
const REVERSE_ANGLE = 1.9;
/** A cab stuck against a wall reverses for anything more than ~57° off its nose. */
const STUCK_ANGLE = 1.0;
/** Once reversing, keep going until the nose is within ~52° of where you're pointing. */
const RESUME_ANGLE = 0.9;
/** Above this speed the stick never selects reverse: it steers you round instead. */
const REVERSE_MAX_SPEED = 90;
/**
 * Within this angle of the nose the stick sends no steering at all. Thumbs are never perfectly
 * aligned, and lane assist (which straightens the cab on its lane) only engages at zero steer.
 */
const STEER_DEADZONE = 0.12;

/**
 * What the stick remembers between frames, so a three-point turn commits to each leg
 * instead of flickering between forward and reverse. Keep one per player.
 */
export interface StickMemory {
  manoeuvre: boolean;
  reverse: boolean;
}
export const createStickMemory = (): StickMemory => ({ manoeuvre: false, reverse: false });

/**
 * A touch stick points where you want to go on screen; we translate that into throttle and
 * steering relative to the cab. A car can't turn on the spot, so pointing well behind a slow
 * cab, or away from a wall it's stuck against, starts a three-point turn: reverse while swinging
 * the nose round, pull forward if the tail meets the kerb, repeat until facing the right way.
 * Without this, touch players who crashed nose-first into a wall had no way out.
 */
export function inputFromStick(stick: Vec, car: StickCar | number, mem: StickMemory = createStickMemory()): DriveInput {
  const c: StickCar = typeof car === 'number' ? { heading: car, speed: 0 } : car;
  const mag = Math.min(1, Math.hypot(stick.x, stick.y));
  if (mag < 0.2) {
    mem.manoeuvre = mem.reverse = false;
    return { throttle: 0, steer: 0 };
  }
  const diff = angleDiff(c.heading, Math.atan2(stick.y, stick.x));
  const off = Math.abs(diff);
  const slow = c.speed < REVERSE_MAX_SPEED;

  if (!mem.manoeuvre) {
    if (slow && (off > REVERSE_ANGLE || (!!c.bumped && off > STUCK_ANGLE))) mem.manoeuvre = mem.reverse = true;
  } else if (off < RESUME_ANGLE || c.speed > REVERSE_MAX_SPEED) {
    mem.manoeuvre = mem.reverse = false; // facing the right way: drive normally
  } else if (mem.reverse && c.bumped && c.speed < -5) {
    mem.reverse = false; // tail met the kerb: pull forward, steering round
  } else if (!mem.reverse && c.bumped && c.speed > 5) {
    mem.reverse = true; // nose met the kerb: back up again
  }

  if (mem.manoeuvre && mem.reverse) {
    // Steering inverts in reverse, so steer the opposite way to swing the nose toward the target.
    return { throttle: -mag, steer: clamp(-diff * STICK_GAIN * 2, -1, 1) || 0 };
  }
  if (!mem.manoeuvre && off < STEER_DEADZONE) return { throttle: mag, steer: 0 };
  return { throttle: mag, steer: clamp(diff * STICK_GAIN * (mem.manoeuvre ? 2 : 1), -1, 1) || 0 };
}
