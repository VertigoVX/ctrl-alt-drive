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

export const createCamera = (at: Vec): Camera => ({ x: at.x, y: at.y, zoom: 1.15, shake: 0 });

export function updateCamera(cam: Camera, target: Follow, view: { w: number; h: number }, map: CityMap, dt: number) {
  const k = Math.min(1, 3 * dt);
  const speedRatio = clamp(Math.abs(target.speed) / 270, 0, 1.4);
  // Small screens get a slightly wider view so you can see what's coming.
  const base = clamp(Math.min(view.w, view.h) / 620, 0.72, 1.2);
  cam.zoom = lerp(cam.zoom, base * (1.1 - speedRatio * 0.2), Math.min(1, 1.5 * dt));

  const lookAhead = target.speed * 0.45;
  const wantX = target.pos.x + Math.cos(target.heading) * lookAhead;
  const wantY = target.pos.y + Math.sin(target.heading) * lookAhead;
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
