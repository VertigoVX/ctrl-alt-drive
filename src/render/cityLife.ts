import { drivableNeighbours, isDrivable, Tile, tileAt, type BuildingLot, type CityMap, type Landmark } from '../core/city';
import type { MapTheme } from './theme';

// Everything here is decoration: none of it affects play.

export interface View {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Cheap deterministic hash in [0, 1). */
const hash = (a: number, b = 0) => {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
};

const isNight = (t: MapTheme) => t.lightBlend === 'lighter';

// ---------- glow sprite (pre-rendered once, stamped many times) ----------

const glowCache = new Map<string, HTMLCanvasElement>();
function glow(color: string): HTMLCanvasElement {
  let c = glowCache.get(color);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, color.replace('ALPHA', '0.55'));
  grad.addColorStop(0.4, color.replace('ALPHA', '0.18'));
  grad.addColorStop(1, color.replace('ALPHA', '0'));
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowCache.set(color, c);
  return c;
}

// ---------- parks ----------

export function drawParkTrees(ctx: CanvasRenderingContext2D, map: CityMap, v: View, t: MapTheme) {
  const ts = map.tileSize;
  for (let y = v.y0; y <= v.y1; y++)
    for (let x = v.x0; x <= v.x1; x++) {
      if (tileAt(map, x, y) !== Tile.Park) continue;
      if (map.landmarks.some((l) => !l.overlay && x >= l.x && x < l.x + l.w && y >= l.y && y < l.y + l.h && l.id !== 'central-park' && l.id !== 'botanic-garden'))
        continue;
      const n = 2 + Math.floor(hash(x, y) * 3);
      for (let i = 0; i < n; i++) {
        const px = x * ts + 10 + hash(x * 7 + i, y) * (ts - 20);
        const py = y * ts + 10 + hash(x, y * 7 + i) * (ts - 20);
        const r = 5 + hash(x + i, y + i) * 5;
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.beginPath();
        ctx.arc(px + 2, py + 2, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = t.parkEdge;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.beginPath();
        ctx.arc(px - r * 0.3, py - r * 0.3, r * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
}

// ---------- building details ----------

export function drawWindows(ctx: CanvasRenderingContext2D, buildings: BuildingLot[], t: MapTheme, time: number) {
  const night = isNight(t);
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    const seed = Math.floor(b.x * 7 + b.y * 13);
    if (!night) {
      // Daytime: rooftop plant (AC units, skylights).
      const n = 1 + Math.floor(hash(seed) * 3);
      ctx.fillStyle = t.roofEdge;
      for (let k = 0; k < n; k++) {
        const w = 5 + hash(seed, k) * 6;
        ctx.fillRect(b.x + 5 + hash(seed + k, 1) * (b.w - w - 10), b.y + 5 + hash(seed + k, 2) * (b.h - w - 10), w, w * 0.7);
      }
      continue;
    }
    const cols = Math.max(1, Math.floor((b.w - 6) / 8));
    const rows = Math.max(1, Math.floor((b.h - 6) / 8));
    const ox = b.x + (b.w - cols * 8) / 2 + 2.5;
    const oy = b.y + (b.h - rows * 8) / 2 + 2.5;
    // Each building has its own "occupancy" and rhythm; lights change every few seconds.
    const busy = 0.15 + hash(seed) * 0.45;
    const epoch = Math.floor(time / 6 + hash(seed, 9) * 6);
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const cell = r * cols + c;
        if (hash(seed + cell, epoch + (cell % 3)) > busy) continue;
        const warm = hash(seed, cell) > 0.25;
        ctx.fillStyle = warm ? 'rgba(255,208,130,0.85)' : 'rgba(170,215,255,0.8)';
        ctx.fillRect(ox + c * 8, oy + r * 8, 3, 3);
      }
  }
}

// ---------- street furniture ----------

export function drawStreetLamps(ctx: CanvasRenderingContext2D, map: CityMap, v: View, t: MapTheme) {
  if (!isNight(t)) return;
  const ts = map.tileSize;
  const sprite = glow('rgba(255,210,140,ALPHA)');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let y = v.y0; y <= v.y1; y++)
    for (let x = v.x0; x <= v.x1; x++) {
      if (tileAt(map, x, y) !== Tile.Road || (x + y) % 2) continue;
      const h = isDrivable(tileAt(map, x - 1, y)) && isDrivable(tileAt(map, x + 1, y));
      const vert = isDrivable(tileAt(map, x, y - 1)) && isDrivable(tileAt(map, x, y + 1));
      if (h === vert) continue;
      const side = (x * 31 + y * 17) % 2 ? 1 : -1;
      const lx = (x + 0.5) * ts + (vert ? side * (ts / 2 - 4) : 0);
      const ly = (y + 0.5) * ts + (h ? side * (ts / 2 - 4) : 0);
      ctx.drawImage(sprite, lx - 30, ly - 30, 60, 60);
    }
  ctx.restore();
  ctx.fillStyle = '#FFE7B8';
  for (let y = v.y0; y <= v.y1; y++)
    for (let x = v.x0; x <= v.x1; x++) {
      if (tileAt(map, x, y) !== Tile.Road || (x + y) % 2) continue;
      const h = isDrivable(tileAt(map, x - 1, y)) && isDrivable(tileAt(map, x + 1, y));
      const vert = isDrivable(tileAt(map, x, y - 1)) && isDrivable(tileAt(map, x, y + 1));
      if (h === vert) continue;
      const side = (x * 31 + y * 17) % 2 ? 1 : -1;
      ctx.beginPath();
      ctx.arc((x + 0.5) * ts + (vert ? side * (ts / 2 - 4) : 0), (y + 0.5) * ts + (h ? side * (ts / 2 - 4) : 0), 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
}

export function drawTrafficLights(ctx: CanvasRenderingContext2D, map: CityMap, v: View, time: number) {
  const ts = map.tileSize;
  for (let y = v.y0; y <= v.y1; y++)
    for (let x = v.x0; x <= v.x1; x++) {
      if (tileAt(map, x, y) !== Tile.Road || drivableNeighbours(map, x, y).length < 3) continue;
      const phase = (time / 5 + hash(x, y)) % 1;
      const eastWest = phase < 0.5;
      const amber = phase % 0.5 > 0.44;
      const cx = (x + 0.5) * ts, cy = (y + 0.5) * ts, o = ts / 2 - 3;
      const corners: [number, number, boolean][] = [
        [cx - o, cy - o, true], [cx + o, cy + o, true], [cx + o, cy - o, false], [cx - o, cy + o, false],
      ];
      for (const [px, py, ew] of corners) {
        const go = ew === eastWest;
        ctx.fillStyle = '#1C1C1E';
        ctx.beginPath();
        ctx.arc(px, py, 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = go ? (amber ? '#FFB020' : '#32D74B') : '#FF453A';
        ctx.beginPath();
        ctx.arc(px, py, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
}

// ---------- pedestrians and boats ----------

interface Walker {
  x: number;
  y: number;
  axis: 'h' | 'v';
  dir: 1 | -1;
  speed: number;
  color: string;
  /** Which side of the street (−1 / 1). */
  side: number;
  line: number;
}

interface Boat {
  along: number;
  across: number;
  speed: number;
  size: number;
}

const WALKER_COLOURS = ['#E8A87C', '#C38D9E', '#85DCBA', '#E27D60', '#41B3A3', '#F4D35E', '#9DB4C0', '#EE964B', '#B8B8FF', '#F6F6F6'];

export class Ambient {
  private walkers: Walker[] = [];
  private boats: Boat[] = [];
  private map: CityMap | null = null;
  private riverVertical = true;
  private riverSpan = { min: 0, max: 0 };

  private setup(map: CityMap) {
    this.map = map;
    const ts = map.tileSize;
    const straight: { x: number; y: number; axis: 'h' | 'v' }[] = [];
    for (let y = 0; y < map.height; y++)
      for (let x = 0; x < map.width; x++) {
        if (tileAt(map, x, y) !== Tile.Road) continue;
        const h = isDrivable(tileAt(map, x - 1, y)) && isDrivable(tileAt(map, x + 1, y));
        const v = isDrivable(tileAt(map, x, y - 1)) && isDrivable(tileAt(map, x, y + 1));
        if (h !== v) straight.push({ x, y, axis: h ? 'h' : 'v' });
      }
    this.walkers = [];
    for (let i = 0; i < 90 && straight.length; i++) {
      const s = straight[Math.floor(hash(i, 3) * straight.length)];
      this.walkers.push({
        x: (s.x + hash(i, 4)) * ts,
        y: (s.y + hash(i, 5)) * ts,
        axis: s.axis,
        dir: hash(i, 6) > 0.5 ? 1 : -1,
        speed: 10 + hash(i, 7) * 12,
        color: WALKER_COLOURS[i % WALKER_COLOURS.length],
        side: hash(i, 8) > 0.5 ? 1 : -1,
        line: s.axis === 'h' ? s.y : s.x,
      });
    }
    // Find the water corridor so boats can sail along it.
    const water: { x: number; y: number }[] = [];
    map.tiles.forEach((t, i) => {
      if (t === Tile.Water) water.push({ x: i % map.width, y: Math.floor(i / map.width) });
    });
    if (water.length) {
      const xs = water.map((w) => w.x), ys = water.map((w) => w.y);
      this.riverVertical = Math.max(...ys) - Math.min(...ys) >= Math.max(...xs) - Math.min(...xs);
      const across = this.riverVertical ? xs : ys;
      // Use the most common column/row band (the main channel).
      const counts = new Map<number, number>();
      for (const a of across) counts.set(a, (counts.get(a) ?? 0) + 1);
      const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map((e) => e[0]).sort((a, b) => a - b);
      this.riverSpan = { min: sorted[0], max: sorted[sorted.length - 1] };
      this.boats = Array.from({ length: 4 }, (_, i) => ({
        along: hash(i, 11) * (this.riverVertical ? map.height : map.width) * ts,
        across: (this.riverSpan.min + 0.3 + hash(i, 12) * (this.riverSpan.max - this.riverSpan.min + 0.4)) * ts,
        speed: (hash(i, 13) > 0.5 ? 1 : -1) * (14 + hash(i, 14) * 16),
        size: 0.8 + hash(i, 15) * 0.6,
      }));
    } else this.boats = [];
  }

  update(map: CityMap, dt: number) {
    if (this.map !== map) this.setup(map);
    const ts = map.tileSize;
    for (const w of this.walkers) {
      const nx = w.axis === 'h' ? w.x + w.dir * w.speed * dt : w.x;
      const ny = w.axis === 'v' ? w.y + w.dir * w.speed * dt : w.y;
      const tx = Math.floor(nx / ts), ty = Math.floor(ny / ts);
      if (!isDrivable(tileAt(map, w.axis === 'h' ? tx : w.line, w.axis === 'v' ? ty : w.line))) w.dir = w.dir === 1 ? -1 : 1;
      else {
        w.x = nx;
        w.y = ny;
      }
    }
    const len = (this.riverVertical ? map.height : map.width) * ts;
    for (const b of this.boats) b.along = (((b.along + b.speed * dt) % len) + len) % len;
  }

  drawWalkers(ctx: CanvasRenderingContext2D, v: View, ts: number, t: MapTheme) {
    const x0 = v.x0 * ts, x1 = (v.x1 + 1) * ts, y0 = v.y0 * ts, y1 = (v.y1 + 1) * ts;
    for (const w of this.walkers) {
      // Walk on the pavement just outside the kerb.
      const off = (ts / 2 + 2) * w.side;
      const px = w.axis === 'h' ? w.x : (w.line + 0.5) * ts + off;
      const py = w.axis === 'v' ? w.y : (w.line + 0.5) * ts + off;
      if (px < x0 || px > x1 || py < y0 || py > y1) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.arc(px + 1, py + 1, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = isNight(t) ? w.color : shade(w.color);
      ctx.beginPath();
      ctx.arc(px, py, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawBoats(ctx: CanvasRenderingContext2D, map: CityMap, time: number) {
    const ts = map.tileSize;
    for (const b of this.boats) {
      const x = this.riverVertical ? b.across : b.along;
      const y = this.riverVertical ? b.along : b.across;
      if (tileAt(map, Math.floor(x / ts), Math.floor(y / ts)) !== Tile.Water) continue; // under a bridge
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((this.riverVertical ? Math.PI / 2 : 0) + (b.speed < 0 ? Math.PI : 0));
      ctx.scale(b.size, b.size);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      const wob = Math.sin(time * 3 + b.along) * 1.5;
      ctx.moveTo(-14, -3); ctx.lineTo(-30, -7 + wob);
      ctx.moveTo(-14, 3); ctx.lineTo(-30, 7 - wob);
      ctx.stroke();
      ctx.fillStyle = '#F5F6F8';
      ctx.beginPath();
      ctx.moveTo(-14, -5); ctx.lineTo(8, -5); ctx.quadraticCurveTo(16, 0, 8, 5); ctx.lineTo(-14, 5); ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#3A6EA5';
      ctx.fillRect(-9, -3, 9, 6);
      ctx.restore();
    }
  }
}

const shade = (hex: string) => hex; // day colours read fine as-is; kept as a hook for theme tuning

// ---------- landmarks ----------

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function plaza(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: MapTheme) {
  // Paving: a touch darker than the road so white monuments stand out on light maps.
  ctx.fillStyle = t.roadDash;
  rr(ctx, x + 4, y + 4, w - 8, h - 8, 10);
  ctx.fill();
  ctx.strokeStyle = t.roadCasing;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function shadowed(ctx: CanvasRenderingContext2D, t: MapTheme, off: number, draw: () => void) {
  ctx.save();
  ctx.translate(off, off);
  ctx.fillStyle = t.shadow;
  ctx.strokeStyle = 'transparent';
  draw();
  ctx.fill();
  ctx.restore();
}

export function drawLandmarks(ctx: CanvasRenderingContext2D, map: CityMap, t: MapTheme, time: number, underRoad: boolean) {
  const ts = map.tileSize;
  for (const l of map.landmarks) {
    if (!!l.overlay !== underRoad) continue;
    const x = l.x * ts, y = l.y * ts, w = l.w * ts, h = l.h * ts;
    const cx = x + w / 2, cy = y + h / 2;
    ctx.save();
    DRAW[l.id]?.(ctx, { x, y, w, h, cx, cy, t, time, l, ts });
    ctx.restore();
  }
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
  t: MapTheme;
  time: number;
  l: Landmark;
  ts: number;
}

const night = (b: Box) => isNight(b.t);

const DRAW: Record<string, (ctx: CanvasRenderingContext2D, b: Box) => void> = {
  'central-park': (ctx, { x, y, w, h, t }) => {
    // A lake and looping paths through the trees.
    ctx.fillStyle = t.water;
    ctx.beginPath();
    ctx.ellipse(x + w * 0.55, y + h * 0.3, w * 0.22, h * 0.1, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = t.road;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + 6, y + h * 0.15);
    ctx.bezierCurveTo(x + w, y + h * 0.3, x, y + h * 0.6, x + w - 6, y + h * 0.85);
    ctx.stroke();
    ctx.globalAlpha = 1;
  },
  'empire-state': (ctx, { cx, cy, w, h, t, time }) => {
    const base = Math.min(w, h) * 0.8;
    shadowed(ctx, t, 16, () => rr(ctx, cx - base / 2, cy - base / 2, base, base, 3));
    const steps = [1, 0.74, 0.52, 0.34, 0.2];
    steps.forEach((s, i) => {
      ctx.fillStyle = i % 2 ? t.roofEdge : t.roof;
      rr(ctx, cx - (base * s) / 2, cy - (base * s) / 2, base * s, base * s, 2);
      ctx.fill();
      ctx.strokeStyle = t.roofEdge;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
    ctx.fillStyle = night({ t } as Box) ? `rgba(255,${180 + Math.sin(time * 2) * 40},120,1)` : '#C8CCD2';
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();
  },
  'big-ben': (ctx, { x, y, w, h, t }) => {
    // Parliament's long range with the clock tower at one end.
    const long = w >= h;
    const pw = long ? w - 12 : w * 0.45, ph = long ? h * 0.45 : h - 12;
    shadowed(ctx, t, 8, () => rr(ctx, x + 6, y + 6, pw, ph, 3));
    ctx.fillStyle = '#C9A86A';
    rr(ctx, x + 6, y + 6, pw, ph, 3);
    ctx.fill();
    ctx.strokeStyle = '#8C6F3E';
    ctx.lineWidth = 1;
    for (let i = 1; i < 8; i++) {
      ctx.beginPath();
      if (long) { ctx.moveTo(x + 6 + (pw * i) / 8, y + 6); ctx.lineTo(x + 6 + (pw * i) / 8, y + 6 + ph); }
      else { ctx.moveTo(x + 6, y + 6 + (ph * i) / 8); ctx.lineTo(x + 6 + pw, y + 6 + (ph * i) / 8); }
      ctx.stroke();
    }
    const tx = long ? x + w - 22 : x + w - 22, ty = long ? y + h - 22 : y + h - 22;
    shadowed(ctx, t, 18, () => rr(ctx, tx - 9, ty - 9, 18, 18, 2));
    ctx.fillStyle = '#B8924F';
    rr(ctx, tx - 9, ty - 9, 18, 18, 2);
    ctx.fill();
    ctx.fillStyle = '#F4E7C5';
    ctx.beginPath();
    ctx.arc(tx, ty, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#3A2E1A';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tx, ty); ctx.lineTo(tx, ty - 4); ctx.moveTo(tx, ty); ctx.lineTo(tx + 3, ty);
    ctx.stroke();
  },
  'london-eye': (ctx, b) => {
    const { x, y, w, h, cx, cy, t, time } = b;
    plaza(ctx, x, y, w, h, t);
    const r = Math.min(w, h) * 0.38;
    ctx.strokeStyle = night(b) ? '#7FD3FF' : '#E8ECF2';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1;
    const a0 = time * 0.15;
    for (let i = 0; i < 16; i++) {
      const a = a0 + (i * Math.PI) / 8;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      ctx.stroke();
      ctx.fillStyle = night(b) ? '#BDE9FF' : '#FFFFFF';
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  'hk-tower': (ctx, { cx, cy, w, h, t, time }) => {
    const s = Math.min(w, h) * 0.78;
    shadowed(ctx, t, 20, () => rr(ctx, cx - s / 2, cy - s / 2, s, s, 2));
    // Faceted prism: four triangles meeting at a rotated square.
    const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, bb]) => [cx + (a * s) / 2, cy + (bb * s) / 2]);
    const shades = ['#9FB3C8', '#7B92AA', '#B9CADB', '#8AA0B8'];
    for (let i = 0; i < 4; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % 4];
      ctx.fillStyle = shades[i];
      ctx.beginPath();
      ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx, cy); ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(pts[2][0], pts[2][1]);
    ctx.moveTo(pts[1][0], pts[1][1]); ctx.lineTo(pts[3][0], pts[3][1]);
    ctx.stroke();
    if (isNight(t)) {
      ctx.fillStyle = `rgba(255,70,90,${0.5 + Math.sin(time * 3) * 0.5})`;
      ctx.beginPath();
      ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  'hk-temple': (ctx, { x, y, w, h, cx, cy, t }) => {
    plaza(ctx, x, y, w, h, t);
    const s = Math.min(w, h) * 0.5;
    shadowed(ctx, t, 6, () => rr(ctx, cx - s / 2, cy - s / 2, s, s, 2));
    for (const [k, c] of [[1, '#B03A2E'], [0.72, '#D4A93C'], [0.44, '#B03A2E']] as const) {
      ctx.fillStyle = c;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(Math.PI / 4);
      rr(ctx, (-s * k) / 2, (-s * k) / 2, s * k, s * k, 3);
      ctx.fill();
      ctx.restore();
    }
  },
  'table-mountain': (ctx, { x, y, w, h, t }) => {
    // Topographic style: rings of contour lines rising to a long, flat summit.
    const dark = isNight(t);
    const bands = dark ? ['#2E3326', '#363C2C', '#3F4633', '#474F3A'] : ['#C9D3A6', '#BFB28C', '#B3A27C', '#A8966E'];
    const long = Math.max(w, h), short = Math.min(w, h);
    const horizontal = w >= h;
    for (let i = 0; i < bands.length; i++) {
      const k = i * 0.13;
      const iw = horizontal ? w * (1 - k * 0.8) : w * (1 - k * 1.6);
      const ih = horizontal ? h * (1 - k * 1.6) : h * (1 - k * 0.8);
      ctx.fillStyle = bands[i];
      rr(ctx, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih, short * (0.45 - i * 0.07));
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // The famous flat top.
    const tw = horizontal ? long * 0.46 : short * 0.26, th = horizontal ? short * 0.26 : long * 0.46;
    ctx.fillStyle = dark ? '#565E46' : '#D9CCAA';
    rr(ctx, x + (w - tw) / 2, y + (h - th) / 2, tw, th, 4);
    ctx.fill();
    // A wisp of "tablecloth" cloud.
    ctx.fillStyle = dark ? 'rgba(220,225,235,0.18)' : 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, tw * 0.45, th * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
  },
  'cpt-stadium': (ctx, { cx, cy, w, h, t }) => {
    const rx = w * 0.42, ry = h * 0.36;
    ctx.fillStyle = t.shadow;
    ctx.beginPath();
    ctx.ellipse(cx + 6, cy + 6, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#F2F2F0';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3FA34D';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * 0.62, ry * 0.58, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - rx * 0.45, cy - ry * 0.35, rx * 0.9, ry * 0.7);
  },
  'opera-house': (ctx, { x, y, w, h, cx, cy, t }) => {
    plaza(ctx, x, y, w, h, t);
    // Nested white sails.
    const shell = (sx: number, sy: number, s: number, a: number) => {
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(a);
      ctx.fillStyle = '#FBFAF6';
      ctx.strokeStyle = '#9E978A';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-s, s * 0.5);
      ctx.quadraticCurveTo(0, -s * 1.3, s, s * 0.5);
      ctx.quadraticCurveTo(0, s * 0.1, -s, s * 0.5);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    };
    const s = Math.min(w, h) * 0.16;
    shell(cx - s * 1.3, cy + s * 0.6, s, -0.2);
    shell(cx - s * 0.2, cy, s * 1.15, -0.2);
    shell(cx + s * 1.1, cy - s * 0.6, s * 1.3, -0.2);
  },
  'botanic-garden': (ctx, { x, y, w, h, t }) => {
    ctx.strokeStyle = t.road;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w * 0.32, h * 0.3, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    const beds = ['#E86A92', '#F7C548', '#B084CC'];
    beds.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(x + w * (0.3 + i * 0.2), y + h * 0.5, 5, 0, Math.PI * 2);
      ctx.fill();
    });
  },
  'marina-bay-sands': (ctx, b) => {
    const { cx, cy, w, h, t } = b;
    const tw = w * 0.2, th = h * 0.62, gap = w * 0.08;
    for (let i = -1; i <= 1; i++) {
      const tx = cx + i * (tw + gap) - tw / 2;
      shadowed(ctx, t, 18, () => rr(ctx, tx, cy - th / 2, tw, th, 3));
      ctx.fillStyle = t.roof;
      rr(ctx, tx, cy - th / 2, tw, th, 3);
      ctx.fill();
      ctx.strokeStyle = t.roofEdge;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    // The long "ship" skypark across all three towers.
    ctx.fillStyle = night(b) ? '#DDEBFF' : '#E4E7EC';
    rr(ctx, cx - (tw * 1.5 + gap) - 8, cy - 5, tw * 3 + gap * 2 + 22, 10, 5);
    ctx.fill();
    ctx.fillStyle = '#5AC8FA';
    rr(ctx, cx - tw, cy - 2, tw * 1.4, 4, 2);
    ctx.fill();
  },
  merlion: (ctx, { x, y, w, h, cx, cy, t, time }) => {
    plaza(ctx, x, y, w, h, t);
    // Water jet arcing out, and a small white lion-fish statue.
    ctx.strokeStyle = 'rgba(120,200,255,0.8)';
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]);
    ctx.lineDashOffset = -time * 20;
    ctx.beginPath();
    ctx.moveTo(cx + 6, cy - 2);
    ctx.quadraticCurveTo(cx + w * 0.3, cy - h * 0.25, cx + w * 0.4, cy + 4);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#F5F3EC';
    ctx.beginPath();
    ctx.ellipse(cx - 2, cy + 4, 7, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 5, cy - 2, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#C9A24A';
    ctx.beginPath();
    ctx.arc(cx + 5, cy - 2, 5, Math.PI * 1.1, Math.PI * 1.9);
    ctx.fill();
  },
  'eiffel-tower': (ctx, b) => {
    const { cx, cy, w, h, t, time } = b;
    const s = Math.min(w, h) * 0.7;
    // Long afternoon shadow of the tower.
    ctx.strokeStyle = t.shadow;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + s * 0.9, cy + s * 0.9);
    ctx.stroke();
    ctx.strokeStyle = night(b) ? '#E8B75A' : '#6E5B3E';
    ctx.lineWidth = 1.4;
    // Four legs converging, with lattice rings.
    for (const [a, bb] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      ctx.beginPath();
      ctx.moveTo(cx + (a * s) / 2, cy + (bb * s) / 2);
      ctx.lineTo(cx, cy);
      ctx.stroke();
    }
    for (const k of [1, 0.66, 0.4]) {
      ctx.strokeRect(cx - (s * k) / 2 + 2, cy - (s * k) / 2 + 2, s * k - 4, s * k - 4);
    }
    ctx.fillStyle = night(b) ? '#FFD27A' : '#6E5B3E';
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();
    // At night it sparkles for a few seconds every so often.
    if (night(b) && time % 20 < 4) {
      for (let i = 0; i < 14; i++) {
        if (hash(i, Math.floor(time * 10)) > 0.5) continue;
        const r = hash(i, 1) * s * 0.5;
        const a = hash(i, 2) * Math.PI * 2;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2, 2);
      }
    }
  },
  'arc-de-triomphe': (ctx, { x, y, w, h, cx, cy, t }) => {
    ctx.fillStyle = t.road;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.min(w, h) * 0.46, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = t.roadCasing;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = t.roadDash;
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 16, cy + Math.sin(a) * 16);
      ctx.lineTo(cx + Math.cos(a) * Math.min(w, h) * 0.44, cy + Math.sin(a) * Math.min(w, h) * 0.44);
      ctx.stroke();
    }
    shadowed(ctx, t, 6, () => rr(ctx, cx - 11, cy - 7, 22, 14, 1));
    ctx.fillStyle = '#D8C9A8';
    rr(ctx, cx - 11, cy - 7, 22, 14, 1);
    ctx.fill();
    ctx.fillStyle = '#8C7B58';
    ctx.fillRect(cx - 3, cy - 7, 6, 14);
    void x;
    void y;
  },
  'shibuya-crossing': (ctx, b) => {
    // Zebra stripes on every approach, plus the famous diagonals, and glowing screens nearby.
    const { x, y, ts, t, time } = b;
    ctx.fillStyle = isNight(t) ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.95)';
    const stripe = (sx: number, sy: number, vertical: boolean) => {
      for (let i = 0; i < 7; i++) {
        if (vertical) ctx.fillRect(sx + 8 + i * 7, sy, 4, 10);
        else ctx.fillRect(sx, sy + 8 + i * 7, 10, 4);
      }
    };
    stripe(x, y - 10, true);
    stripe(x, y + ts, true);
    stripe(x - 10, y, false);
    stripe(x + ts, y, false);
    ctx.save();
    ctx.translate(x + ts / 2, y + ts / 2);
    for (const a of [Math.PI / 4, -Math.PI / 4]) {
      ctx.save();
      ctx.rotate(a);
      for (let i = -4; i <= 4; i++) ctx.fillRect(i * 7 - 2, -5, 4, 10);
      ctx.restore();
    }
    ctx.restore();
    if (isNight(t)) {
      const hues = [320, 190, 45];
      hues.forEach((hue, i) => {
        ctx.fillStyle = `hsla(${(hue + time * 20) % 360},90%,60%,0.85)`;
        const px = [x - ts * 0.9, x + ts * 1.5, x + ts * 1.5][i];
        const py = [y - ts * 0.9, y - ts * 0.9, y + ts * 1.5][i];
        ctx.fillRect(px, py, ts * 0.4, 6);
      });
    }
  },
  'shinjuku-towers': (ctx, b) => {
    const { x, y, w, h, t } = b;
    const towers = [[0.08, 0.08, 0.42, 0.4], [0.55, 0.1, 0.36, 0.32], [0.1, 0.56, 0.3, 0.36], [0.5, 0.5, 0.42, 0.42]];
    towers.forEach(([tx, ty, tw, th], i) => {
      const bx = x + tx * w, by = y + ty * h, bw = tw * w, bh = th * h;
      shadowed(ctx, t, 14 + i * 3, () => rr(ctx, bx, by, bw, bh, 2));
      ctx.fillStyle = i % 2 ? t.roofEdge : t.roof;
      rr(ctx, bx, by, bw, bh, 2);
      ctx.fill();
      ctx.strokeStyle = t.roofEdge;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      // Helipad.
      ctx.strokeStyle = night(b) ? '#FFD60A' : '#9A9FA8';
      ctx.beginPath();
      ctx.arc(bx + bw / 2, by + bh / 2, Math.min(bw, bh) * 0.28, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.font = `700 ${Math.min(bw, bh) * 0.3}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('H', bx + bw / 2, by + bh / 2 + 0.5);
    });
  },
};
