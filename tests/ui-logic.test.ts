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
    // The outermost tiles are always buildings, so the closest the taxi can get to a
    // corner is the centre of the ring road's corner tile (1, 1).
    const corner = { x: 1.5 * 64, y: 1.5 * 64 };
    const cam = createCamera(corner);
    updateCamera(cam, { pos: corner, heading: 0, speed: 0 }, { w: 800, h: 600 }, map, 1);
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

describe('the taxi is never hidden behind HUD panels', () => {
  const map = { width: 44, height: 32, tileSize: 64 } as CityMap;
  const W = 44 * 64, H = 32 * 64;
  const SAFE = 40; // screen px of breathing room between the taxi and any panel
  const portrait = { view: { w: 390, h: 664 }, insets: { top: 100, bottom: 260 } };
  const landscape = { view: { w: 844, h: 390 }, insets: { top: 0, bottom: 0, left: 320 } };

  function screenPos(setup: typeof portrait | typeof landscape, pos: { x: number; y: number }, heading: number, speed: number, frames = 300) {
    const cam = createCamera(pos);
    for (let i = 0; i < frames; i++) updateCamera(cam, { pos, heading, speed }, setup.view, map, 1 / 60, setup.insets);
    return { x: (pos.x - cam.x) * cam.zoom + setup.view.w / 2, y: (pos.y - cam.y) * cam.zoom + setup.view.h / 2 };
  }
  const inGap = (setup: typeof portrait | typeof landscape, p: { x: number; y: number }) => {
    const i = { left: 0, ...setup.insets };
    expect(p.y).toBeGreaterThanOrEqual(i.top + SAFE - 0.5);
    expect(p.y).toBeLessThanOrEqual(setup.view.h - i.bottom - SAFE + 0.5);
    expect(p.x).toBeGreaterThanOrEqual(i.left + SAFE - 0.5);
    expect(p.x).toBeLessThanOrEqual(setup.view.w - SAFE + 0.5);
  };

  it.each([
    ['bottom edge', { x: 1400, y: H - 96 }, Math.PI / 2],
    ['top edge', { x: 1400, y: 96 }, -Math.PI / 2],
    ['bottom-left corner', { x: 96, y: H - 96 }, Math.PI],
    ['bottom-right corner', { x: W - 96, y: H - 96 }, 0],
  ])('portrait: stays visible at the %s of the city', (_n, pos, heading) => {
    inGap(portrait, screenPos(portrait, pos, heading, 120));
  });

  it.each([
    ['left edge', { x: 96, y: 1000 }, Math.PI],
    ['right edge', { x: W - 96, y: 1000 }, 0],
  ])('landscape: stays visible at the %s of the city', (_n, pos, heading) => {
    inGap(landscape, screenPos(landscape, pos, heading, 120));
  });

  it.each([0, Math.PI / 2, Math.PI, -Math.PI / 2])('stays visible at full speed in any direction (heading %f)', (heading) => {
    inGap(portrait, screenPos(portrait, { x: 1400, y: 1000 }, heading, 380));
    inGap(landscape, screenPos(landscape, { x: 1400, y: 1000 }, heading, 380));
  });

  it('stays visible on the very first frame after a teleport (e.g. respawn)', () => {
    const cam = createCamera({ x: 1400, y: 1000 });
    for (let i = 0; i < 120; i++) updateCamera(cam, { pos: { x: 1400, y: 1000 }, heading: 0, speed: 0 }, portrait.view, map, 1 / 60, portrait.insets);
    const jumped = { x: 1400, y: 1600 };
    updateCamera(cam, { pos: jumped, heading: 0, speed: 0 }, portrait.view, map, 1 / 60, portrait.insets);
    inGap(portrait, { x: (jumped.x - cam.x) * cam.zoom + 195, y: (jumped.y - cam.y) * cam.zoom + 332 });
  });

  it('never reveals empty space beyond the city in the visible gap', () => {
    const cam = createCamera({ x: 1400, y: H - 96 });
    for (let i = 0; i < 300; i++) updateCamera(cam, { pos: { x: 1400, y: H - 96 }, heading: Math.PI / 2, speed: 100 }, portrait.view, map, 1 / 60, portrait.insets);
    // World y at the bottom of the visible gap must still be inside the map.
    const gapBottomWorldY = cam.y + (portrait.view.h - portrait.insets.bottom - portrait.view.h / 2) / cam.zoom;
    expect(gapBottomWorldY).toBeLessThanOrEqual(H + 0.5);
  });
});
