// The player's cab, drawn in local space: 36 × 20, nose pointing along +x.
// Shared by the in-game renderer and the garage previews so they always match.

export interface TaxiLook {
  paint: string;
  roof: string;
}

export interface TaxiState {
  /** Roof light on (free for hire) or off (passenger aboard). */
  lit: boolean;
  braking: boolean;
  time: number;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

interface PaintSpec {
  fill: (ctx: CanvasRenderingContext2D, t: number) => string | CanvasGradient;
  edge: string;
  /** Extra decoration painted over the body, under the glass. */
  decorate?: (ctx: CanvasRenderingContext2D) => void;
}

const solid = (c: string) => () => c;

export const PAINTS: Record<string, PaintSpec> = {
  'paint-classic': { fill: solid('#FFD60A'), edge: '#B38F00' },
  'paint-checker': {
    fill: solid('#FFD60A'),
    edge: '#B38F00',
    decorate: (ctx) => {
      ctx.fillStyle = '#1C1C1E';
      for (let i = 0; i < 8; i++) {
        const x = -12 + i * 3;
        ctx.fillRect(x, i % 2 ? -10 : -7, 3, 3);
        ctx.fillRect(x, i % 2 ? 4 : 7, 3, 3);
      }
    },
  },
  'paint-midnight': { fill: solid('#1D1D21'), edge: '#FFD60A' },
  'paint-mint': { fill: solid('#63E6BE'), edge: '#2F9E7B' },
  'paint-sunset': {
    fill: (ctx) => {
      const g = ctx.createLinearGradient(-18, 0, 18, 0);
      g.addColorStop(0, '#FF375F');
      g.addColorStop(1, '#FF9F0A');
      return g;
    },
    edge: '#B3243F',
  },
  'paint-racing': {
    fill: solid('#0A84FF'),
    edge: '#0050B4',
    decorate: (ctx) => {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(-18, -3.5, 36, 2);
      ctx.fillRect(-18, 1.5, 36, 2);
    },
  },
  'paint-chrome': {
    fill: (ctx) => {
      const g = ctx.createLinearGradient(0, -10, 0, 10);
      g.addColorStop(0, '#F7F9FC');
      g.addColorStop(0.3, '#9FA6B1');
      g.addColorStop(0.55, '#EEF1F5');
      g.addColorStop(1, '#7B828D');
      return g;
    },
    edge: '#5E636B',
  },
  'paint-holo': {
    fill: (ctx, t) => {
      const h = (t * 60) % 360;
      const g = ctx.createLinearGradient(-18, -10, 18, 10);
      g.addColorStop(0, `hsl(${h},90%,70%)`);
      g.addColorStop(0.5, `hsl(${(h + 120) % 360},90%,72%)`);
      g.addColorStop(1, `hsl(${(h + 240) % 360},90%,70%)`);
      return g;
    },
    edge: 'rgba(255,255,255,0.8)',
  },
};

type RoofDraw = (ctx: CanvasRenderingContext2D) => void;

// Glyphs are drawn upright relative to a car facing right (as in the garage), centred on the roof.
const CX = -2.5;
const ROOF_SHAPES: Record<string, RoofDraw> = {
  'roof-taxi': (ctx) => roundRect(ctx, -5, -4.5, 5, 9, 1.5),
  'roof-star': (ctx) => {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 2.3 : 5.4;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      ctx.lineTo(CX + Math.cos(a) * r, Math.sin(a) * r + 0.4);
    }
    ctx.closePath();
  },
  'roof-heart': (ctx) => {
    ctx.beginPath();
    ctx.moveTo(CX, 4.8);
    ctx.bezierCurveTo(CX - 7, 0.2, CX - 4.5, -5.5, CX, -2.2);
    ctx.bezierCurveTo(CX + 4.5, -5.5, CX + 7, 0.2, CX, 4.8);
    ctx.closePath();
  },
  'roof-bolt': (ctx) => {
    ctx.beginPath();
    ctx.moveTo(CX + 1.2, -6);
    ctx.lineTo(CX - 3.8, 0.8);
    ctx.lineTo(CX - 0.4, 0.8);
    ctx.lineTo(CX - 1.4, 6);
    ctx.lineTo(CX + 3.8, -1);
    ctx.lineTo(CX + 0.4, -1);
    ctx.closePath();
  },
  'roof-crown': (ctx) => {
    ctx.beginPath();
    ctx.moveTo(CX - 5.2, 4);
    ctx.lineTo(CX - 5.2, -3.5);
    ctx.lineTo(CX - 2.6, -0.6);
    ctx.lineTo(CX, -5);
    ctx.lineTo(CX + 2.6, -0.6);
    ctx.lineTo(CX + 5.2, -3.5);
    ctx.lineTo(CX + 5.2, 4);
    ctx.closePath();
  },
  'roof-disco': (ctx) => {
    ctx.beginPath();
    ctx.arc(CX, 0, 4.5, 0, Math.PI * 2);
  },
};

export function drawTaxiSprite(ctx: CanvasRenderingContext2D, look: TaxiLook, s: TaxiState) {
  const paint = PAINTS[look.paint] ?? PAINTS['paint-classic'];
  // Drop shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  roundRect(ctx, -16, -8, 36, 20, 6);
  ctx.fill();
  // Body.
  ctx.save();
  roundRect(ctx, -18, -10, 36, 20, 6);
  ctx.fillStyle = paint.fill(ctx, s.time);
  ctx.fill();
  ctx.clip();
  paint.decorate?.(ctx);
  ctx.restore();
  roundRect(ctx, -18, -10, 36, 20, 6);
  ctx.strokeStyle = paint.edge;
  ctx.lineWidth = look.paint === 'paint-midnight' ? 1.5 : 1;
  ctx.stroke();
  // Glass.
  ctx.fillStyle = '#1C1C1E';
  roundRect(ctx, 4, -8, 7, 16, 2.5);
  ctx.fill();
  roundRect(ctx, -15, -7, 4, 14, 2);
  ctx.fill();
  // Roof light.
  const shape = ROOF_SHAPES[look.roof] ?? ROOF_SHAPES['roof-taxi'];
  shape(ctx);
  if (look.roof === 'roof-disco') ctx.fillStyle = s.lit ? `hsl(${(s.time * 240) % 360},100%,65%)` : '#4A4A4F';
  else ctx.fillStyle = s.lit ? '#FFF9E0' : 'rgba(40,36,20,0.75)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  // Lamps.
  ctx.fillStyle = '#FFF6D5';
  ctx.fillRect(16.5, -8, 1.5, 4);
  ctx.fillRect(16.5, 4, 1.5, 4);
  ctx.fillStyle = s.braking ? '#FF3B30' : '#8A1C16';
  ctx.fillRect(-18, -8, 1.5, 4);
  ctx.fillRect(-18, 4, 1.5, 4);
}
