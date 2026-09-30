// The player's cab, drawn in local space: 36 × 20, nose pointing along +x.
// Shared by the in-game renderer and the garage previews so they always match.

export interface TaxiLook {
  paint: string;
  roof: string;
  /** Which city's cab body and livery to use (defaults to the classic sedan). */
  cab?: string;
}

type Body = 'sedan' | 'blackcab' | 'minibus' | 'jpn';

interface CabStyle {
  body: Body;
  /** Signature livery, used when the garage paint is "City livery". */
  livery: PaintSpec;
  /** The local roof sign, used when the garage roof is "City sign". */
  sign: 'taxi' | 'amber' | 'andon' | 'parisien' | 'none';
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

const CAB_STYLES: Record<string, CabStyle> = {
  'new-york': { body: 'sedan', sign: 'taxi', livery: {
    fill: solid('#F7C600'), edge: '#9C7A00',
    decorate: (ctx) => { ctx.fillStyle = '#1C1C1E'; ctx.fillRect(-12, -10, 26, 1.6); ctx.fillRect(-12, 8.4, 26, 1.6); },
  } },
  london: { body: 'blackcab', sign: 'amber', livery: { fill: solid('#141416'), edge: '#5A5C62' } },
  'hong-kong': { body: 'sedan', sign: 'taxi', livery: {
    fill: solid('#D7261E'), edge: '#8C1510',
    decorate: (ctx) => { ctx.fillStyle = '#E9ECF0'; ctx.fillRect(-11, -8, 16, 16); },
  } },
  'cape-town': { body: 'minibus', sign: 'none', livery: {
    fill: solid('#F4F4F2'), edge: '#9A9A98',
    decorate: (ctx) => { ctx.fillStyle = '#E8563A'; ctx.fillRect(-24, -11, 48, 2.2); ctx.fillRect(-24, 8.8, 48, 2.2);
      ctx.fillStyle = '#1D8F8A'; ctx.fillRect(-24, -8.6, 48, 1.2); ctx.fillRect(-24, 7.4, 48, 1.2); },
  } },
  sydney: { body: 'sedan', sign: 'taxi', livery: {
    fill: solid('#F5F6F8'), edge: '#9DA2AA',
    decorate: (ctx) => { ctx.fillStyle = '#1B3A6B'; ctx.fillRect(-18, -10, 36, 2); ctx.fillRect(-18, 8, 36, 2); },
  } },
  singapore: { body: 'sedan', sign: 'taxi', livery: { fill: solid('#1F6FD6'), edge: '#0D458C' } },
  paris: { body: 'sedan', sign: 'parisien', livery: { fill: solid('#2A2D33'), edge: '#6B7079' } },
  tokyo: { body: 'jpn', sign: 'andon', livery: {
    fill: solid('#1E2A57'), edge: '#0E1633',
    decorate: (ctx) => { ctx.fillStyle = '#C9A24A'; ctx.fillRect(-17, -1, 34, 2); },
  } },
};

const SEDAN: CabStyle = { body: 'sedan', sign: 'taxi', livery: PAINTS['paint-classic'] };

/** Length/width and glass layout for each body type. */
function bodyPath(ctx: CanvasRenderingContext2D, body: Body) {
  switch (body) {
    case 'blackcab': return roundRect(ctx, -17, -10.5, 34, 21, 8);
    case 'minibus': return roundRect(ctx, -24, -11, 48, 22, 4);
    case 'jpn': return roundRect(ctx, -17, -10, 34, 20, 5);
    default: return roundRect(ctx, -18, -10, 36, 20, 6);
  }
}

function drawGlass(ctx: CanvasRenderingContext2D, body: Body) {
  ctx.fillStyle = '#1C1C1E';
  switch (body) {
    case 'blackcab':
      roundRect(ctx, 3, -8.5, 6, 17, 3); ctx.fill();
      roundRect(ctx, -14, -7.5, 4, 15, 2); ctx.fill();
      break;
    case 'minibus':
      roundRect(ctx, 15, -9, 6, 18, 2); ctx.fill();
      ctx.fillStyle = 'rgba(28,28,30,0.85)';
      for (let x = -18; x < 12; x += 7.5) { ctx.fillRect(x, -10.4, 5.5, 2); ctx.fillRect(x, 8.4, 5.5, 2); }
      // Roof rack.
      ctx.strokeStyle = 'rgba(40,40,40,0.55)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      for (let x = -16; x <= 10; x += 4.5) { ctx.moveTo(x, -6); ctx.lineTo(x, 6); }
      ctx.moveTo(-16, -6); ctx.lineTo(10, -6); ctx.moveTo(-16, 6); ctx.lineTo(10, 6);
      ctx.stroke();
      break;
    case 'jpn':
      roundRect(ctx, 5, -8, 6.5, 16, 2.5); ctx.fill();
      roundRect(ctx, -14.5, -7.5, 4, 15, 2); ctx.fill();
      break;
    default:
      roundRect(ctx, 4, -8, 7, 16, 2.5); ctx.fill();
      roundRect(ctx, -15, -7, 4, 14, 2); ctx.fill();
  }
}

function drawCitySign(ctx: CanvasRenderingContext2D, sign: CabStyle['sign'], lit: boolean) {
  if (sign === 'none') return;
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 0.8;
  if (sign === 'andon') {
    // A Japanese "andon" lamp: a small rounded lantern, lit warm when free.
    roundRect(ctx, -5, -3.5, 4.5, 7, 2);
    ctx.fillStyle = lit ? '#FFE9A8' : '#4A3F24';
  } else if (sign === 'parisien') {
    roundRect(ctx, -5.5, -6, 4, 12, 1.2);
    ctx.fillStyle = lit ? '#EAF6FF' : '#3A4048';
  } else if (sign === 'amber') {
    roundRect(ctx, -4, -5, 4, 10, 1.2);
    ctx.fillStyle = lit ? '#FFB22E' : '#4A3310';
  } else {
    roundRect(ctx, -5, -4.5, 5, 9, 1.5);
    ctx.fillStyle = lit ? '#FFF9E0' : 'rgba(40,36,20,0.75)';
  }
  ctx.fill();
  ctx.stroke();
}

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
  const style = (look.cab && CAB_STYLES[look.cab]) || SEDAN;
  const paint = look.paint === 'paint-classic' ? style.livery : PAINTS[look.paint] ?? style.livery;
  const body = style.body;
  const front = body === 'minibus' ? 24 : body === 'blackcab' || body === 'jpn' ? 17 : 18;
  // Drop shadow.
  ctx.save();
  ctx.translate(2, 2);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  bodyPath(ctx, body);
  ctx.fill();
  ctx.restore();
  // Body.
  ctx.save();
  bodyPath(ctx, body);
  ctx.fillStyle = paint.fill(ctx, s.time);
  ctx.fill();
  ctx.clip();
  paint.decorate?.(ctx);
  ctx.restore();
  bodyPath(ctx, body);
  ctx.strokeStyle = paint.edge;
  ctx.lineWidth = look.paint === 'paint-midnight' ? 1.5 : 1;
  ctx.stroke();
  drawGlass(ctx, body);
  // Roof light: the city's own sign by default, or a garage one.
  if (look.roof === 'roof-taxi' || !ROOF_SHAPES[look.roof]) {
    drawCitySign(ctx, look.cab ? style.sign : 'taxi', s.lit);
  } else {
    ROOF_SHAPES[look.roof](ctx);
    if (look.roof === 'roof-disco') ctx.fillStyle = s.lit ? `hsl(${(s.time * 240) % 360},100%,65%)` : '#4A4A4F';
    else ctx.fillStyle = s.lit ? '#FFF9E0' : 'rgba(40,36,20,0.75)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
  // Lamps.
  ctx.fillStyle = '#FFF6D5';
  ctx.fillRect(front - 1.5, -8, 1.5, 4);
  ctx.fillRect(front - 1.5, 4, 1.5, 4);
  ctx.fillStyle = s.braking ? '#FF3B30' : '#8A1C16';
  ctx.fillRect(-front, -8, 1.5, 4);
  ctx.fillRect(-front, 4, 1.5, 4);
}

/** Sporty JDM-style robotaxi (Tokyo): long nose, wide rear wing, lidar pod on the roof. */
const JDM_COLOURS = [
  ['#F4F5F7', '#1C1C1E'], ['#C8102E', '#5A0714'], ['#4B2A7B', '#22103E'],
  ['#F2C300', '#7A6200'], ['#B8BEC6', '#50565E'], ['#1A1A1C', '#F4F5F7'],
];
export function drawJdmCar(ctx: CanvasRenderingContext2D, id: number, lit: boolean, rebooting: boolean, time: number) {
  const [body, accent] = rebooting ? ['#8E9199', '#5B5E66'] : JDM_COLOURS[id % JDM_COLOURS.length];
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.moveTo(-15, -7.5); ctx.lineTo(13, -8.5); ctx.quadraticCurveTo(21, -4, 21, 2); ctx.quadraticCurveTo(21, 8, 13, 11.5); ctx.lineTo(-15, 11.5); ctx.closePath();
  ctx.fill();
  // Body: a wedge with a long bonnet.
  ctx.beginPath();
  ctx.moveTo(-17, -9.5); ctx.lineTo(11, -10); ctx.quadraticCurveTo(19, -6, 19, 0); ctx.quadraticCurveTo(19, 6, 11, 10);
  ctx.lineTo(-17, 9.5); ctx.quadraticCurveTo(-19, 0, -17, -9.5);
  ctx.fillStyle = body;
  ctx.fill();
  // Two-tone "panda" style bonnet stripe or racing accent.
  ctx.fillStyle = accent;
  ctx.fillRect(4, -2, 12, 4);
  // Cabin glass, set well back.
  ctx.fillStyle = '#16181C';
  roundRect(ctx, -8, -7.5, 11, 15, 4);
  ctx.fill();
  // Rear wing.
  ctx.fillStyle = accent;
  ctx.fillRect(-19.5, -10, 3, 20);
  // Pop-up headlights / lamps.
  ctx.fillStyle = lit ? '#FFF6D5' : 'rgba(180,185,195,0.6)';
  ctx.beginPath();
  ctx.ellipse(17, -5.5, 1.4, 2.6, 0, 0, Math.PI * 2);
  ctx.ellipse(17, 5.5, 1.4, 2.6, 0, 0, Math.PI * 2);
  ctx.fill();
  // Lidar pod: still a robot.
  ctx.fillStyle = rebooting ? '#5B5E66' : '#64D2FF';
  ctx.beginPath();
  ctx.arc(-2.5, 0, 3.6, 0, Math.PI * 2);
  ctx.fill();
  if (!rebooting) {
    const a = time * 9 + id;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-2.5, 0);
    ctx.lineTo(-2.5 + Math.cos(a) * 3.6, Math.sin(a) * 3.6);
    ctx.stroke();
  }
}
