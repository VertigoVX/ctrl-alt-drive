import { describe, it, expect } from 'vitest';
import { createVehicle, updateVehicle, DEFAULT_HANDLING } from '../src/core/vehicle';
import { Tile, type CityMap, tileCenter } from '../src/core/city';

const open: CityMap = {
  width: 80, height: 3, tileSize: 64, seed: 0,
  tiles: Array.from({ length: 240 }, (_, i) => (i >= 80 && i < 160 && i % 80 > 0 && i % 80 < 79 ? Tile.Road : Tile.Building)),
  roadRows: [], roadCols: [], rowNames: new Map(), colNames: new Map(), buildings: [], landmarks: [],
};
const dt = 1 / 60;
function launch(seconds: number) {
  const v = createVehicle(tileCenter(open, 1, 1), 0);
  const x0 = v.pos.x;
  for (let t = 0; t < seconds - 1e-9; t += dt) updateVehicle(v, { throttle: 1, steer: 0 }, dt, open);
  return { speed: v.speed, distance: v.pos.x - x0 };
}
function timeTo(speed: number) {
  const v = createVehicle(tileCenter(open, 1, 1), 0);
  let t = 0;
  while (v.speed < speed && t < 10) { updateVehicle(v, { throttle: 1, steer: 0 }, dt, open); t += dt; }
  return t;
}

describe('gradual acceleration from a standstill', () => {
  it('pulls away gently: under 20px covered in the first 0.4s (was ~34px)', () => {
    expect(launch(0.4).distance).toBeLessThan(20);
  });

  it('takes over half a second to reach 100 (was under a quarter)', () => {
    expect(timeTo(100)).toBeGreaterThan(0.55);
  });

  it('still reaches top speed in good time once rolling', () => {
    expect(timeTo(DEFAULT_HANDLING.maxSpeed * 0.95)).toBeLessThan(2);
  });

  it('keeps braking just as strong, so you can always stop', () => {
    const v = createVehicle(tileCenter(open, 1, 1), 0);
    v.speed = 200;
    let t = 0;
    while (v.speed > 0 && t < 5) { updateVehicle(v, { throttle: -1, steer: 0 }, dt, open); t += dt; }
    expect(t).toBeLessThan(0.3);
  });
});
