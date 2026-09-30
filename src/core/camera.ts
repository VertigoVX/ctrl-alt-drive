import type { CityMap } from './city';
import { clamp, lerp, type Vec } from './math';

export interface Camera {
  x: number;
  y: number;
  zoom: number;
  shake: number;
}

export interface Follow {
  pos: Vec;
  heading: number;
  speed: number;
}

/** Screen pixels kept between the taxi and any HUD panel. */
export const SAFE_MARGIN = 40;

/** Clamp into [min, max]; if the range is inverted (too little room), sit in its middle. */
const clampRange = (v: number, min: number, max: number) => (min > max ? (min + max) / 2 : clamp(v, min, max));

export const createCamera = (at: Vec): Camera => ({ x: at.x, y: at.y, zoom: 0.9, shake: 0 });

/** Screen space covered by HUD panels; the taxi is framed in the gap between them. */
export interface Insets {
  top: number;
  bottom: number;
  left?: number;
}

export function updateCamera(
  cam: Camera,
  target: Follow,
  view: { w: number; h: number },
  map: CityMap,
  dt: number,
  insets: Insets = { top: 0, bottom: 0 },
) {
  const k = Math.min(1, 3 * dt);
  const speedRatio = clamp(Math.abs(target.speed) / 270, 0, 1.4);
  // Show ~7.5 tiles across the short side on a phone, up to ~12.5 on a big screen:
  // phones get closer in so cars and street names stay legible.
  const short = Math.min(view.w, view.h);
  const tilesAcross = clamp(short / 60, 7.5, 12.5);
  const base = short / (tilesAcross * map.tileSize);
  cam.zoom = lerp(cam.zoom, base * (1 - speedRatio * 0.15), Math.min(1, 1.5 * dt));

  const lookAhead = target.speed * 0.45;
  const wantX = target.pos.x + Math.cos(target.heading) * lookAhead - (insets.left ?? 0) / 2 / cam.zoom;
  // Offset so the taxi sits centred in the unobstructed part of the screen.
  const wantY = target.pos.y + Math.sin(target.heading) * lookAhead - (insets.top - insets.bottom) / 2 / cam.zoom;
  cam.x = lerp(cam.x, wantX, k);
  cam.y = lerp(cam.y, wantY, k);

  // 1. Stay over the city. The camera may scroll past a map edge by exactly the
  //    width of the panel covering that edge, so the taxi can reach the edge of the
  //    *visible* area without ever revealing empty space beyond the city.
  const top = insets.top;
  const bottom = insets.bottom;
  const left = insets.left ?? 0;
  const worldW = map.width * map.tileSize;
  const worldH = map.height * map.tileSize;
  const halfW = view.w / 2 / cam.zoom;
  const halfH = view.h / 2 / cam.zoom;
  cam.x = clampRange(cam.x, halfW - left / cam.zoom, worldW - halfW);
  cam.y = clampRange(cam.y, halfH - top / cam.zoom, worldH - halfH + bottom / cam.zoom);

  // 2. Hard guarantee: whatever easing, look-ahead or a respawn did, the taxi ends the
  //    frame inside the gap between panels, with some breathing room.
  const minX = left + SAFE_MARGIN, maxX = view.w - SAFE_MARGIN;
  const minY = top + SAFE_MARGIN, maxY = view.h - bottom - SAFE_MARGIN;
  cam.x = clampRange(cam.x, target.pos.x - (maxX - view.w / 2) / cam.zoom, target.pos.x - (minX - view.w / 2) / cam.zoom);
  cam.y = clampRange(cam.y, target.pos.y - (maxY - view.h / 2) / cam.zoom, target.pos.y - (minY - view.h / 2) / cam.zoom);
  cam.shake = Math.max(0, cam.shake - dt * 2);
}

export interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Does a panel cover any part of the cab (a circle of `radius` screen px at `p`)? */
export function isObscured(p: { x: number; y: number }, radius: number, r: ScreenRect): boolean {
  return p.x + radius > r.left && p.x - radius < r.right && p.y + radius > r.top && p.y - radius < r.bottom;
}
