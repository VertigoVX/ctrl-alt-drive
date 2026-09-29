import { angleDiff, clamp, type Vec } from './math';
import type { DriveInput } from './vehicle';

const UP = ['ArrowUp', 'KeyW'];
const DOWN = ['ArrowDown', 'KeyS'];
const LEFT = ['ArrowLeft', 'KeyA'];
const RIGHT = ['ArrowRight', 'KeyD'];

const any = (keys: Set<string>, list: string[]) => list.some((k) => keys.has(k));

export function inputFromKeys(keys: Set<string>): DriveInput {
  const throttle = (any(keys, UP) ? 1 : 0) - (any(keys, DOWN) ? 1 : 0);
  const steer = (any(keys, RIGHT) ? 1 : 0) - (any(keys, LEFT) ? 1 : 0);
  return { throttle, steer };
}

/**
 * A touch stick points where you want to go on screen; we translate that into
 * throttle and steering relative to the taxi's current heading.
 */
export function inputFromStick(stick: Vec, heading: number): DriveInput {
  const mag = Math.min(1, Math.hypot(stick.x, stick.y));
  if (mag < 0.2) return { throttle: 0, steer: 0 };
  const diff = angleDiff(heading, Math.atan2(stick.y, stick.x));
  return { throttle: mag, steer: clamp(diff * 2, -1, 1) || 0 };
}
