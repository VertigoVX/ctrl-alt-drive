import { describe, it, expect } from 'vitest';
import { inputFromKeys, inputFromStick } from '../src/core/input';
import { createCamera, updateCamera } from '../src/core/camera';
import { formatClock, formatDistance, describeDirections } from '../src/core/format';
import { Tile, type CityMap } from '../src/core/city';

describe('keyboard input', () => {
  it('maps arrows and WASD to throttle and steering', () => {
    expect(inputFromKeys(new Set(['ArrowUp']))).toEqual({ throttle: 1, steer: 0 });
    expect(inputFromKeys(new Set(['KeyS', 'KeyD']))).toEqual({ throttle: -1, steer: 1 });
    expect(inputFromKeys(new Set(['ArrowLeft', 'KeyW']))).toEqual({ throttle: 1, steer: -1 });
  });
  it('cancels opposite keys', () => {
    expect(inputFromKeys(new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']))).toEqual({ throttle: 0, steer: 0 });
  });
});

describe('touch stick input', () => {
  it('ignores a small dead zone', () => {
    expect(inputFromStick({ x: 0.05, y: -0.05 }, 0)).toEqual({ throttle: 0, steer: 0 });
  });
  it('steers towards the stick direction relative to the car heading', () => {
    // car faces east; pushing the stick north (screen up) means turn left and go
    const i = inputFromStick({ x: 0, y: -1 }, 0);
    expect(i.throttle).toBeGreaterThan(0);
    expect(i.steer).toBeLessThan(0);
    // pushing the stick the way the car faces means straight ahead
    expect(inputFromStick({ x: 1, y: 0 }, 0)).toEqual({ throttle: 1, steer: 0 });
  });
});

describe('camera', () => {
  const map = { width: 40, height: 30, tileSize: 64 } as CityMap;

  it('eases towards the taxi with a look-ahead in its direction of travel', () => {
    const cam = createCamera({ x: 1000, y: 1000 });
    for (let i = 0; i < 120; i++) updateCamera(cam, { pos: { x: 1000, y: 1000 }, heading: 0, speed: 200 }, { w: 800, h: 600 }, map, 1 / 60);
    expect(cam.x).toBeGreaterThan(1000);
    expect(cam.y).toBeCloseTo(1000, 0);
  });

  it('never shows beyond the edge of the map', () => {
    const cam = createCamera({ x: 0, y: 0 });
    updateCamera(cam, { pos: { x: 0, y: 0 }, heading: 0, speed: 0 }, { w: 800, h: 600 }, map, 1);
    expect(cam.x - 400 / cam.zoom).toBeGreaterThanOrEqual(0);
    expect(cam.y - 300 / cam.zoom).toBeGreaterThanOrEqual(0);
  });

  it('zooms out a little at speed', () => {
    const slow = createCamera({ x: 1200, y: 900 });
    const fast = createCamera({ x: 1200, y: 900 });
    for (let i = 0; i < 120; i++) {
      updateCamera(slow, { pos: { x: 1200, y: 900 }, heading: 0, speed: 0 }, { w: 800, h: 600 }, map, 1 / 60);
      updateCamera(fast, { pos: { x: 1200, y: 900 }, heading: 0, speed: 260 }, { w: 800, h: 600 }, map, 1 / 60);
    }
    expect(fast.zoom).toBeLessThan(slow.zoom);
  });
});

describe('formatting', () => {
  it('formats the fare meter clock', () => {
    expect(formatClock(75.2)).toBe('1:16');
    expect(formatClock(9)).toBe('0:09');
    expect(formatClock(0)).toBe('0:00');
  });
  it('formats distances the way Maps does', () => {
    expect(formatDistance(3)).toBe('150 m');
    expect(formatDistance(0.2)).toBe('Now');
    expect(formatDistance(30)).toBe('1.5 km');
  });

  it('writes turn-by-turn directions with street names', () => {
    const rows = ['#####', '#...#', '#.#.#', '#...#', '#####'];
    const map: CityMap = {
      width: 5, height: 5, tileSize: 64, seed: 0,
      tiles: rows.join('').split('').map((c) => (c === '.' ? Tile.Road : Tile.Building)),
      roadRows: [1, 3], roadCols: [1, 3],
      rowNames: new Map([[1, 'Juniper St'], [3, 'Harbor St']]),
      colNames: new Map([[1, 'Cedar Ave'], [3, 'Mercer Ave']]),
      buildings: [],
    };
    const d = describeDirections(map, [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 2 }]);
    expect(d).toEqual({ icon: 'right', distance: '100 m', instruction: 'Turn right onto Mercer Ave' });
    const arrive = describeDirections(map, [{ x: 1, y: 1 }, { x: 2, y: 1 }]);
    expect(arrive.icon).toBe('arrive');
    expect(arrive.instruction).toBe('Arrive on Juniper St');
  });
});

describe('camera framing on different screens', () => {
  const map = { width: 44, height: 32, tileSize: 64 } as CityMap;
  const settle = (view: { w: number; h: number }, insets?: { top: number; bottom: number }) => {
    const cam = createCamera({ x: 1400, y: 1000 });
    for (let i = 0; i < 400; i++)
      updateCamera(cam, { pos: { x: 1400, y: 1000 }, heading: 0, speed: 0 }, view, map, 1 / 60, insets);
    return cam;
  };
  const tilesAcross = (cam: { zoom: number }, view: { w: number; h: number }) => Math.min(view.w, view.h) / cam.zoom / 64;

  it('keeps cars readable on a phone: about 7.5 tiles across the short side', () => {
    const view = { w: 390, h: 664 };
    expect(tilesAcross(settle(view), view)).toBeGreaterThan(7);
    expect(tilesAcross(settle(view), view)).toBeLessThan(8);
  });

  it('shows more of the city on a desktop: about 12.5 tiles across', () => {
    const view = { w: 1280, h: 800 };
    expect(tilesAcross(settle(view), view)).toBeGreaterThan(12);
    expect(tilesAcross(settle(view), view)).toBeLessThan(13);
  });

  it('frames the taxi in the middle of the space the HUD leaves free', () => {
    const view = { w: 390, h: 664 };
    const insets = { top: 100, bottom: 260 };
    const cam = settle(view, insets);
    const screenY = (1000 - cam.y) * cam.zoom + view.h / 2;
    expect(screenY).toBeCloseTo(insets.top + (view.h - insets.top - insets.bottom) / 2, 0);
  });
});

describe('camera framing with a side panel (landscape phones)', () => {
  it('frames the taxi in the middle of the space right of a docked panel', () => {
    const map = { width: 44, height: 32, tileSize: 64 } as CityMap;
    const view = { w: 844, h: 390 };
    const insets = { top: 0, bottom: 0, left: 320 };
    const cam = createCamera({ x: 1400, y: 1000 });
    for (let i = 0; i < 400; i++) updateCamera(cam, { pos: { x: 1400, y: 1000 }, heading: 0, speed: 0 }, view, map, 1 / 60, insets);
    const screenX = (1400 - cam.x) * cam.zoom + view.w / 2;
    expect(screenX).toBeCloseTo(insets.left + (view.w - insets.left) / 2, 0);
  });
});
