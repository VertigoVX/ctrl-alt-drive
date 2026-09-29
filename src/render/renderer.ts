import { DEFAULT_AV_TUNING, headlightsOn, type Autonomous } from '../core/autonomous';
import type { Camera } from '../core/camera';
import { isDrivable, Tile, tileAt, tileCenter, type CityMap } from '../core/city';
import type { GameState, Powerup } from '../core/game';
import type { Vec } from '../core/math';
import { visibilityFan } from '../core/vision';
import { THEMES, type MapTheme, type ThemeName } from './theme';

interface Label {
  text: string;
  x: number;
  y: number;
  vertical: boolean;
}

interface Dash {
  x: number;
  y: number;
  vertical: boolean;
}

interface Floater {
  text: string;
  pos: Vec;
  t: number;
  color: string;
}

interface Ring {
  pos: Vec;
  t: number;
  color: string;
}

export interface RenderOptions {
  theme: ThemeName;
  reducedMotion: boolean;
  braking: boolean;
  /** Title-screen mode hides the taxi, route and pins. */
  attract: boolean;
}

const SAFE_BOTTOM = 150;

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private labels: Label[] = [];
  private dashes: Dash[] = [];
  private mapRef: CityMap | null = null;
  private floaters: Floater[] = [];
  private rings: Ring[] = [];
  private time = 0;
  private dpr = 1;
  width = 0;
  height = 0;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not supported in this browser');
    this.ctx = ctx;
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = this.canvas.clientWidth;
    this.height = this.canvas.clientHeight;
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
  }

  floatText(text: string, pos: Vec, color: string) {
    this.floaters.push({ text, pos: { ...pos }, t: 0, color });
  }

  ring(pos: Vec, color: string) {
    this.rings.push({ pos: { ...pos }, t: 0, color });
  }

  private prepare(map: CityMap) {
    if (this.mapRef === map) return;
    this.mapRef = map;
    this.labels = [];
    this.dashes = [];
    const ts = map.tileSize;
    // Dashed centre lines on straight stretches.
    for (let y = 0; y < map.height; y++)
      for (let x = 0; x < map.width; x++) {
        if (!isDrivable(tileAt(map, x, y))) continue;
        const h = isDrivable(tileAt(map, x - 1, y)) && isDrivable(tileAt(map, x + 1, y));
        const v = isDrivable(tileAt(map, x, y - 1)) && isDrivable(tileAt(map, x, y + 1));
        if (h !== v) this.dashes.push({ x: (x + 0.5) * ts, y: (y + 0.5) * ts, vertical: v });
      }
    // Street name labels on long runs, like the map app.
    const addRuns = (vertical: boolean) => {
      const lines = vertical ? map.colNames : map.rowNames;
      for (const [line, name] of lines) {
        let run: number[] = [];
        const flush = () => {
          if (run.length >= 5) {
            const mid = run[Math.floor(run.length / 2)];
            const c = vertical ? tileCenter(map, line, mid) : tileCenter(map, mid, line);
            this.labels.push({ text: name, x: c.x, y: c.y, vertical });
          }
          run = [];
        };
        const n = vertical ? map.height : map.width;
        for (let i = 0; i < n; i++) {
          const x = vertical ? line : i;
          const y = vertical ? i : line;
          const along = vertical
            ? !isDrivable(tileAt(map, x - 1, y)) && !isDrivable(tileAt(map, x + 1, y))
            : !isDrivable(tileAt(map, x, y - 1)) && !isDrivable(tileAt(map, x, y + 1));
          if (tileAt(map, x, y) === Tile.Road && along) run.push(i);
          else flush();
        }
        flush();
      }
    };
    addRuns(false);
    addRuns(true);
  }

  render(g: GameState, cam: Camera, opts: RenderOptions, dt: number) {
    const { ctx, width: w, height: h } = this;
    const theme = THEMES[opts.theme];
    this.time += dt;
    this.prepare(g.map);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = theme.land;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    const shake = opts.reducedMotion ? 0 : cam.shake * 8;
    const sx = shake ? (Math.random() - 0.5) * shake : 0;
    const sy = shake ? (Math.random() - 0.5) * shake : 0;
    ctx.translate(w / 2 + sx, h / 2 + sy);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);

    const ts = g.map.tileSize;
    const view = {
      x0: Math.max(0, Math.floor((cam.x - w / 2 / cam.zoom) / ts) - 1),
      y0: Math.max(0, Math.floor((cam.y - h / 2 / cam.zoom) / ts) - 1),
      x1: Math.min(g.map.width - 1, Math.ceil((cam.x + w / 2 / cam.zoom) / ts) + 1),
      y1: Math.min(g.map.height - 1, Math.ceil((cam.y + h / 2 / cam.zoom) / ts) + 1),
    };

    this.drawGround(g.map, theme, view);
    this.drawBuildings(g.map, theme, view);
    this.drawLabels(theme, cam, view, ts);
    if (!opts.attract) this.drawRoute(g, theme);
    if (!opts.attract) this.drawPins(g, theme);
    for (const p of g.powerups) this.drawPowerup(p);
    for (const av of g.avs) this.drawVision(g.map, av, theme);
    for (const av of g.avs) this.drawAv(av, theme);
    if (!opts.attract) this.drawTaxi(g, theme, opts.braking);
    this.drawEffects(dt);
    ctx.restore();

    if (!opts.attract) this.drawIndicators(g, cam, theme);
  }

  // ---- map ----------------------------------------------------------------

  private drawGround(map: CityMap, t: MapTheme, v: { x0: number; y0: number; x1: number; y1: number }) {
    const { ctx } = this;
    const ts = map.tileSize;
    for (let y = v.y0; y <= v.y1; y++)
      for (let x = v.x0; x <= v.x1; x++) {
        const tile = tileAt(map, x, y);
        if (tile === Tile.Water || tile === Tile.Bridge) {
          ctx.fillStyle = t.water;
          ctx.fillRect(x * ts - 0.5, y * ts - 0.5, ts + 1, ts + 1);
        } else if (tile === Tile.Park) {
          ctx.fillStyle = t.park;
          ctx.fillRect(x * ts - 0.5, y * ts - 0.5, ts + 1, ts + 1);
        }
      }
    // Soft banks where water meets land.
    ctx.strokeStyle = t.waterEdge;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let y = v.y0; y <= v.y1; y++)
      for (let x = v.x0; x <= v.x1; x++) {
        const tile = tileAt(map, x, y);
        if (tile !== Tile.Water) continue;
        const land = (xx: number, yy: number) => {
          const n = tileAt(map, xx, yy);
          return n !== Tile.Water && n !== Tile.Bridge;
        };
        if (land(x - 1, y)) { ctx.moveTo(x * ts + 1.5, y * ts); ctx.lineTo(x * ts + 1.5, (y + 1) * ts); }
        if (land(x + 1, y)) { ctx.moveTo((x + 1) * ts - 1.5, y * ts); ctx.lineTo((x + 1) * ts - 1.5, (y + 1) * ts); }
      }
    ctx.stroke();

    // Roads are stroked as thick polylines between tile centres: round joins give the soft,
    // map-app intersections, and casing + surface are just two widths of the same path.
    const roadPath = () => {
      ctx.beginPath();
      for (let y = v.y0; y <= v.y1; y++)
        for (let x = v.x0; x <= v.x1; x++) {
          if (!isDrivable(tileAt(map, x, y))) continue;
          const cx = (x + 0.5) * ts, cy = (y + 0.5) * ts;
          if (isDrivable(tileAt(map, x + 1, y))) { ctx.moveTo(cx, cy); ctx.lineTo(cx + ts, cy); }
          if (isDrivable(tileAt(map, x, y + 1))) { ctx.moveTo(cx, cy); ctx.lineTo(cx, cy + ts); }
          // Joins on the visible edge need their neighbour's segment too.
          if (x === v.x0 && isDrivable(tileAt(map, x - 1, y))) { ctx.moveTo(cx, cy); ctx.lineTo(cx - ts, cy); }
          if (y === v.y0 && isDrivable(tileAt(map, x, y - 1))) { ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - ts); }
        }
    };
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    roadPath();
    ctx.strokeStyle = t.roadCasing;
    ctx.lineWidth = ts - 6;
    ctx.stroke();
    ctx.strokeStyle = t.road;
    ctx.lineWidth = ts - 12;
    ctx.stroke();
    // Bridge rails.
    ctx.strokeStyle = t.bridgeRail;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let y = v.y0; y <= v.y1; y++)
      for (let x = v.x0; x <= v.x1; x++) {
        if (tileAt(map, x, y) !== Tile.Bridge) continue;
        ctx.moveTo(x * ts, y * ts + 5);
        ctx.lineTo((x + 1) * ts, y * ts + 5);
        ctx.moveTo(x * ts, (y + 1) * ts - 5);
        ctx.lineTo((x + 1) * ts, (y + 1) * ts - 5);
      }
    ctx.stroke();

    // Centre dashes.
    ctx.strokeStyle = t.roadDash;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    const x0 = v.x0 * ts, x1 = (v.x1 + 1) * ts, y0 = v.y0 * ts, y1 = (v.y1 + 1) * ts;
    for (const d of this.dashes) {
      if (d.x < x0 || d.x > x1 || d.y < y0 || d.y > y1) continue;
      if (d.vertical) { ctx.moveTo(d.x, d.y - 9); ctx.lineTo(d.x, d.y + 9); }
      else { ctx.moveTo(d.x - 9, d.y); ctx.lineTo(d.x + 9, d.y); }
    }
    ctx.stroke();
  }

  private drawBuildings(map: CityMap, t: MapTheme, v: { x0: number; y0: number; x1: number; y1: number }) {
    const { ctx } = this;
    const ts = map.tileSize;
    const minX = v.x0 * ts - ts * 3, maxX = (v.x1 + 1) * ts, minY = v.y0 * ts - ts * 3, maxY = (v.y1 + 1) * ts;
    const visible = map.buildings.filter((b) => b.x < maxX && b.x + b.w > minX && b.y < maxY && b.y + b.h > minY);
    ctx.fillStyle = t.shadow;
    for (const b of visible) {
      const o = 3 + b.height * 7;
      this.roundRect(b.x + o, b.y + o, b.w, b.h, 4);
      ctx.fill();
    }
    for (const b of visible) {
      ctx.fillStyle = t.roof;
      this.roundRect(b.x, b.y, b.w, b.h, 4);
      ctx.fill();
      ctx.strokeStyle = t.roofEdge;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  private drawLabels(t: MapTheme, cam: Camera, v: { x0: number; y0: number; x1: number; y1: number }, ts: number) {
    if (cam.zoom < 0.55) return;
    const { ctx } = this;
    ctx.font = '600 11px -apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const l of this.labels) {
      if (l.x < v.x0 * ts || l.x > (v.x1 + 1) * ts || l.y < v.y0 * ts || l.y > (v.y1 + 1) * ts) continue;
      ctx.save();
      ctx.translate(l.x, l.y);
      if (l.vertical) ctx.rotate(-Math.PI / 2);
      ctx.strokeStyle = t.labelHalo;
      ctx.lineWidth = 3;
      ctx.strokeText(l.text, 0, 0);
      ctx.fillStyle = t.label;
      ctx.fillText(l.text, 0, 0);
      ctx.restore();
    }
  }

  // ---- route, pins, power-ups --------------------------------------------

  private drawRoute(g: GameState, t: MapTheme) {
    if (g.route.length < 2 || g.phase === 'over') return;
    const { ctx } = this;
    const pts = g.route.map((p) => tileCenter(g.map, p.x, p.y));
    pts[0] = { ...g.taxi.pos };
    const target = g.job.stage === 'pickup' ? g.job.pickup : g.job.dropoff;
    pts[pts.length - 1] = target;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    };
    path();
    ctx.strokeStyle = t.routeCasing;
    ctx.lineWidth = 15;
    ctx.stroke();
    path();
    ctx.strokeStyle = t.route;
    ctx.lineWidth = 10;
    ctx.stroke();
    // Direction chevrons along the line.
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    const offset = (this.time * 40) % 48;
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const seg = Math.hypot(b.x - a.x, b.y - a.y);
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      for (let d = ((48 - ((acc - offset) % 48)) % 48); d < seg; d += 48) {
        const x = a.x + Math.cos(ang) * d, y = a.y + Math.sin(ang) * d;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(ang);
        ctx.beginPath();
        ctx.moveTo(-2, -3);
        ctx.lineTo(1.5, 0);
        ctx.lineTo(-2, 3);
        ctx.stroke();
        ctx.restore();
      }
      acc += seg;
    }
  }

  private drawPin(pos: Vec, color: string, glyph: 'person' | 'flag') {
    const { ctx } = this;
    const pulse = (this.time * 0.9) % 1;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.25 * (1 - pulse);
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 10 + pulse * 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.translate(pos.x, pos.y);
    // Ground dot.
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 6, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    // Teardrop pin.
    ctx.beginPath();
    ctx.moveTo(0, -2);
    ctx.bezierCurveTo(-6, -12, -14, -18, -14, -28);
    ctx.arc(0, -28, 14, Math.PI, 0);
    ctx.bezierCurveTo(14, -18, 6, -12, 0, -2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    if (glyph === 'person') {
      ctx.beginPath();
      ctx.arc(0, -33, 3.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, -21, 7, Math.PI, 0);
      ctx.fill();
    } else {
      ctx.fillRect(-5, -38, 2, 18);
      ctx.beginPath();
      ctx.moveTo(-3, -38);
      ctx.lineTo(7, -34);
      ctx.lineTo(-3, -29);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawPins(g: GameState, t: MapTheme) {
    if (g.phase === 'over') return;
    if (g.job.stage === 'pickup') this.drawPin(g.job.pickup, t.pickup, 'person');
    else this.drawPin(g.job.dropoff, t.dropoff, 'flag');
  }

  private drawPowerup(p: Powerup) {
    const { ctx } = this;
    const bob = Math.sin(this.time * 3 + p.pos.x) * 2;
    ctx.save();
    ctx.translate(p.pos.x, p.pos.y + bob);
    const face = p.kind === 'surge' ? '#FFD60A' : '#F4F4F6';
    const side = p.kind === 'surge' ? '#B38F00' : '#A7A9B0';
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    this.roundRect(-14, -10, 28, 28, 7);
    ctx.fill();
    ctx.fillStyle = side;
    this.roundRect(-15, -15, 30, 30, 7);
    ctx.fill();
    ctx.fillStyle = face;
    this.roundRect(-13, -16, 26, 24, 6);
    ctx.fill();
    ctx.fillStyle = p.kind === 'surge' ? '#3A2F00' : '#D70015';
    ctx.font = '700 11px -apple-system, BlinkMacSystemFont, Inter, "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (p.kind === 'reboot') ctx.fillText('Del', 0, -4);
    else {
      ctx.beginPath();
      ctx.moveTo(2, -13);
      ctx.lineTo(-5, -3);
      ctx.lineTo(0, -3);
      ctx.lineTo(-2, 5);
      ctx.lineTo(5, -6);
      ctx.lineTo(0, -6);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // ---- cars ---------------------------------------------------------------

  private drawVision(map: CityMap, av: Autonomous, t: MapTheme) {
    if (av.state === 'rebooting') return;
    const { ctx } = this;
    const tn = DEFAULT_AV_TUNING;
    const lit = headlightsOn(av);
    const cone = lit
      ? { range: tn.chaseVisionRange, halfAngle: tn.chaseVisionHalfAngle }
      : { range: tn.visionRange, halfAngle: tn.visionHalfAngle };
    const fan = visibilityFan(map, { pos: av.pos, heading: av.heading }, cone, 28);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(av.pos.x, av.pos.y);
    for (const p of fan) ctx.lineTo(p.x, p.y);
    ctx.closePath();
    if (lit) {
      const flicker = av.state === 'alert' ? (Math.sin(this.time * 40) > 0 ? 1 : 0.25) : 1;
      const grad = ctx.createRadialGradient(av.pos.x, av.pos.y, 8, av.pos.x, av.pos.y, cone.range);
      grad.addColorStop(0, `${t.headlight}${0.62 * flicker})`);
      grad.addColorStop(0.55, `${t.headlight}${0.28 * flicker})`);
      grad.addColorStop(1, `${t.headlight}0)`);
      ctx.globalCompositeOperation = t.lightBlend;
      ctx.fillStyle = grad;
      ctx.fill();
    } else {
      ctx.fillStyle = t.sensor;
      ctx.fill();
      ctx.setLineDash([3, 6]);
      ctx.strokeStyle = t.sensor.replace('0.10', '0.35');
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawAv(av: Autonomous, t: MapTheme) {
    const { ctx } = this;
    const fadeIn = Math.min(1, av.age / 0.6);
    ctx.save();
    ctx.globalAlpha = fadeIn;
    ctx.translate(av.pos.x, av.pos.y);

    if (av.state === 'chase') {
      const p = (this.time * 2) % 1;
      ctx.strokeStyle = t.pursuit;
      ctx.globalAlpha = fadeIn * (1 - p) * 0.8;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 18 + p * 18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = fadeIn;
    }

    ctx.rotate(av.heading);
    const rebooting = av.state === 'rebooting';
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    this.roundRect(-16, -8, 34, 20, 9);
    ctx.fill();
    ctx.fillStyle = rebooting ? '#8E9199' : t.av;
    this.roundRect(-17, -10, 34, 20, 9);
    ctx.fill();
    ctx.fillStyle = t.avGlass;
    this.roundRect(-10, -8, 20, 16, 6);
    ctx.fill();
    // Headlamps.
    const lit = headlightsOn(av);
    ctx.fillStyle = lit ? '#FFF6D5' : 'rgba(180,185,195,0.6)';
    ctx.beginPath();
    ctx.ellipse(15.5, -6, 1.6, 3, 0, 0, Math.PI * 2);
    ctx.ellipse(15.5, 6, 1.6, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    // Spinning lidar dome.
    ctx.fillStyle = rebooting ? '#5B5E66' : t.lidar;
    ctx.beginPath();
    ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
    ctx.fill();
    if (!rebooting) {
      const a = this.time * 9 + av.id;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * 4.5, Math.sin(a) * 4.5);
      ctx.stroke();
    }
    ctx.restore();

    if (rebooting) {
      // A little progress ring while the car restarts.
      const p = Math.min(1, av.stateTime / DEFAULT_AV_TUNING.rebootTime);
      ctx.save();
      ctx.translate(av.pos.x, av.pos.y - 26);
      ctx.fillStyle = 'rgba(28,28,30,0.85)';
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 5.5, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawTaxi(g: GameState, t: MapTheme, braking: boolean) {
    const { ctx } = this;
    const v = g.taxi;
    if (g.invulnerable > 0 && Math.sin(this.time * 30) < 0) return;
    ctx.save();
    ctx.translate(v.pos.x, v.pos.y);
    ctx.rotate(v.heading);
    // Short headlight throw.
    if (t.lightBlend === 'lighter') {
      const grad = ctx.createRadialGradient(20, 0, 2, 20, 0, 70);
      grad.addColorStop(0, 'rgba(255,236,170,0.35)');
      grad.addColorStop(1, 'rgba(255,236,170,0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(16, -6);
      ctx.lineTo(80, -28);
      ctx.lineTo(80, 28);
      ctx.lineTo(16, 6);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    if (g.boostTime > 0) {
      ctx.fillStyle = 'rgba(255,214,10,0.35)';
      for (let i = 1; i <= 3; i++) {
        ctx.globalAlpha = 0.35 / i;
        this.roundRect(-18 - i * 9, -9, 34, 18, 8);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    this.roundRect(-16, -8, 36, 20, 6);
    ctx.fill();
    ctx.fillStyle = t.taxi;
    this.roundRect(-18, -10, 36, 20, 6);
    ctx.fill();
    ctx.strokeStyle = t.taxiDark;
    ctx.lineWidth = 1;
    ctx.stroke();
    // Windscreens.
    ctx.fillStyle = '#1C1C1E';
    this.roundRect(4, -8, 7, 16, 2.5);
    ctx.fill();
    this.roundRect(-15, -7, 4, 14, 2);
    ctx.fill();
    // Roof sign: lit when the cab is free, dark with a passenger aboard.
    const free = g.job.stage === 'pickup';
    ctx.fillStyle = free ? '#FFF9E0' : '#6B5A00';
    this.roundRect(-5, -4.5, 5, 9, 1.5);
    ctx.fill();
    // Lamps.
    ctx.fillStyle = '#FFF6D5';
    ctx.fillRect(16.5, -8, 1.5, 4);
    ctx.fillRect(16.5, 4, 1.5, 4);
    ctx.fillStyle = braking ? '#FF3B30' : '#8A1C16';
    ctx.fillRect(-18, -8, 1.5, 4);
    ctx.fillRect(-18, 4, 1.5, 4);
    ctx.restore();
  }

  // ---- effects & HUD-on-canvas ---------------------------------------------

  private drawEffects(dt: number) {
    const { ctx } = this;
    this.rings = this.rings.filter((r) => (r.t += dt) < 0.8);
    for (const r of this.rings) {
      const p = r.t / 0.8;
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = 1 - p;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(r.pos.x, r.pos.y, 12 + p * 60, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    this.floaters = this.floaters.filter((f) => (f.t += dt) < 1.4);
    ctx.font = '700 17px -apple-system, BlinkMacSystemFont, Inter, "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const f of this.floaters) {
      const p = f.t / 1.4;
      ctx.globalAlpha = 1 - p * p;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.strokeText(f.text, f.pos.x, f.pos.y - 30 - p * 40);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.pos.x, f.pos.y - 30 - p * 40);
    }
    ctx.globalAlpha = 1;
  }

  private drawIndicators(g: GameState, cam: Camera, t: MapTheme) {
    if (g.phase === 'over') return;
    const { ctx, width: w, height: h } = this;
    const toScreen = (p: Vec) => ({ x: (p.x - cam.x) * cam.zoom + w / 2, y: (p.y - cam.y) * cam.zoom + h / 2 });
    const pad = 26;
    const box = { x0: pad, y0: w < 1000 ? 110 : 96, x1: w - pad, y1: h - SAFE_BOTTOM };
    const items: { pos: Vec; color: string; icon: 'target' | 'av' }[] = [
      { pos: g.job.stage === 'pickup' ? g.job.pickup : g.job.dropoff, color: g.job.stage === 'pickup' ? t.pickup : t.dropoff, icon: 'target' },
      ...g.avs.filter((a) => a.state === 'chase' || a.state === 'alert').map((a) => ({ pos: a.pos, color: t.pursuit, icon: 'av' as const })),
    ];
    for (const it of items) {
      const s = toScreen(it.pos);
      if (s.x >= 0 && s.x <= w && s.y >= 0 && s.y <= h) continue;
      const cx = w / 2, cy = h / 2;
      const dx = s.x - cx, dy = s.y - cy;
      const k = Math.min(
        dx > 0 ? (box.x1 - cx) / dx : dx < 0 ? (box.x0 - cx) / dx : Infinity,
        dy > 0 ? (box.y1 - cy) / dy : dy < 0 ? (box.y0 - cy) / dy : Infinity,
      );
      const x = cx + dx * k, y = cy + dy * k;
      const ang = Math.atan2(dy, dx);
      ctx.save();
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.translate(x, y);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.arc(0, 2, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = it.color;
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.rotate(ang);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(7, 0);
      ctx.lineTo(-4, -5.5);
      ctx.lineTo(-1.5, 0);
      ctx.lineTo(-4, 5.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}
