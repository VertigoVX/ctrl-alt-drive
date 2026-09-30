import { drawTaxiSprite, type TaxiLook } from './taxiSprite';
import { THEMES, type ThemeName } from './theme';

/** Size a canvas's backing store to its CSS box at device resolution; returns a ready context. */
export function prepareCanvas(canvas: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; w: number; h: number } {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

/** The garage "stage": a stretch of street in the chosen map style with the cab idling on it. */
export function drawGarageStage(canvas: HTMLCanvasElement, theme: ThemeName, look: TaxiLook, time: number) {
  const { ctx, w, h } = prepareCanvas(canvas);
  const t = THEMES[theme];
  ctx.fillStyle = t.land;
  ctx.fillRect(0, 0, w, h);
  const scale = Math.min(2.6, h / 58);
  const roadH = 52 * scale;
  const cy = h / 2;
  // Buildings above and below, scrolling slowly so the cab seems to cruise.
  const drift = (time * 30) % (70 * scale);
  for (const side of [-1, 1]) {
    for (let x = -70 * scale; x < w + 70 * scale; x += 70 * scale) {
      const bx = x - drift;
      const by = side < 0 ? 0 : cy + roadH / 2 + 10 * scale;
      const bh = cy - roadH / 2 - 10 * scale;
      ctx.fillStyle = t.shadow;
      ctx.beginPath();
      ctx.roundRect(bx + 8 + 6 * scale, by + 6 * scale, 54 * scale, bh, 4 * scale);
      ctx.fill();
      ctx.fillStyle = t.roof;
      ctx.beginPath();
      ctx.roundRect(bx + 8, by, 54 * scale, bh, 4 * scale);
      ctx.fill();
      ctx.strokeStyle = t.roofEdge;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
  ctx.fillStyle = t.roadCasing;
  ctx.fillRect(0, cy - roadH / 2 - 3 * scale, w, roadH + 6 * scale);
  ctx.fillStyle = t.road;
  ctx.fillRect(0, cy - roadH / 2, w, roadH);
  ctx.strokeStyle = t.roadDash;
  ctx.lineWidth = 2 * scale;
  ctx.setLineDash([18 * scale, 14 * scale]);
  ctx.lineDashOffset = time * 30;
  ctx.beginPath();
  ctx.moveTo(0, cy);
  ctx.lineTo(w, cy);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.save();
  ctx.translate(w / 2, cy + Math.sin(time * 6) * 0.4);
  ctx.scale(scale, scale);
  drawTaxiSprite(ctx, look, { lit: true, braking: false, time });
  ctx.restore();
}

/** Small top-down cab for item cards. */
export function drawMiniTaxi(canvas: HTMLCanvasElement, look: TaxiLook, time = 0) {
  const { ctx, w, h } = prepareCanvas(canvas);
  ctx.clearRect(0, 0, w, h);
  const scale = Math.min(w / 44, h / 26);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(scale, scale);
  drawTaxiSprite(ctx, look, { lit: true, braking: false, time });
  ctx.restore();
}

/** A tiny crossroads in a map style, for the map-style cards. */
export function drawMapSwatch(canvas: HTMLCanvasElement, theme: ThemeName) {
  const { ctx, w, h } = prepareCanvas(canvas);
  const t = THEMES[theme];
  ctx.fillStyle = t.land;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = t.water;
  ctx.fillRect(w * 0.72, 0, w * 0.28, h);
  ctx.fillStyle = t.park;
  ctx.fillRect(4, h * 0.62, w * 0.3, h * 0.38 - 4);
  ctx.fillStyle = t.roof;
  ctx.strokeStyle = t.roofEdge;
  for (const [x, y] of [[4, 4], [w * 0.48, 4], [w * 0.48, h * 0.62]]) {
    ctx.beginPath();
    ctx.roundRect(x, y, w * 0.2, h * 0.3, 3);
    ctx.fill();
    ctx.stroke();
  }
  ctx.lineCap = 'round';
  for (const [c, lw] of [[t.roadCasing, 11], [t.road, 8]] as const) {
    ctx.strokeStyle = c;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.47);
    ctx.lineTo(w, h * 0.47);
    ctx.moveTo(w * 0.4, 0);
    ctx.lineTo(w * 0.4, h);
    ctx.stroke();
  }
  ctx.strokeStyle = t.route;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(w * 0.4, h);
  ctx.lineTo(w * 0.4, h * 0.47);
  ctx.lineTo(w * 0.7, h * 0.47);
  ctx.stroke();
}
