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

export const createCamera = (at: Vec): Camera => ({ x: at.x, y: at.y, zoom: 0.9, shake: 0 });

/** Screen space covered by HUD panels; the taxi is framed in the gap between them. */
export interface Insets {
  top: number;
  bottom: number;
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
  const wantX = target.pos.x + Math.cos(target.heading) * lookAhead;
  // Offset so the taxi sits centred in the unobstructed part of the screen.
  const wantY = target.pos.y + Math.sin(target.heading) * lookAhead - (insets.top - insets.bottom) / 2 / cam.zoom;
  cam.x = lerp(cam.x, wantX, k);
  cam.y = lerp(cam.y, wantY, k);

  const worldW = map.width * map.tileSize;
  const worldH = map.height * map.tileSize;
  const halfW = view.w / 2 / cam.zoom;
  const halfH = view.h / 2 / cam.zoom;
  cam.x = halfW * 2 >= worldW ? worldW / 2 : clamp(cam.x, halfW, worldW - halfW);
  cam.y = halfH * 2 >= worldH ? worldH / 2 : clamp(cam.y, halfH, worldH - halfH);
  cam.shake = Math.max(0, cam.shake - dt * 2);
}
