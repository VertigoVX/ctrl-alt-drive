import { updateAutonomous, DEFAULT_AV_TUNING } from './core/autonomous';
import { createCamera, updateCamera } from './core/camera';
import { describeDirections, formatClock } from './core/format';
import { createGame, updateGame, spawnAv, GAME_RULES, type GameEvent, type GameState } from './core/game';
import { inputFromKeys, inputFromStick } from './core/input';
import { createRng } from './core/rng';
import type { DriveInput } from './core/vehicle';
import { Renderer } from './render/renderer';
import { THEMES, type ThemeName } from './render/theme';
import { Sfx } from './ui/audio';
import './styles.css';

// ---------- tiny helpers ----------

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const store = {
  get(key: string): string | null {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key: string, value: string) {
    try { localStorage.setItem(key, value); } catch { /* private mode etc. */ }
  },
};
const fmt = (n: number) => n.toLocaleString('en-US');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const ICONS = {
  left: '<svg viewBox="0 0 44 44"><path d="M30 38V22a6 6 0 0 0-6-6H10"/><path d="M17 8l-8 8 8 8"/></svg>',
  right: '<svg viewBox="0 0 44 44"><path d="M14 38V22a6 6 0 0 1 6-6h14"/><path d="M27 8l8 8-8 8"/></svg>',
  arrive: '<svg viewBox="0 0 44 44"><path d="M22 40V8"/><path d="M13 17l9-9 9 9"/></svg>',
  person: '<svg viewBox="0 0 16 16"><circle cx="8" cy="4.5" r="3"/><path d="M2 15a6 6 0 0 1 12 0z"/></svg>',
  flag: '<svg viewBox="0 0 16 16"><path d="M3 1h1.6v14H3z"/><path d="M4.6 1.5 13 5l-8.4 3.6z"/></svg>',
};

// ---------- state ----------

type Mode = 'title' | 'playing' | 'paused' | 'over';
let mode: Mode = 'title';
let theme: ThemeName = (store.get('cad.theme') as ThemeName) || 'night';
const sfx = new Sfx();
sfx.muted = store.get('cad.muted') === '1';
let best = Number(store.get('cad.best') || 0);

const urlSeed = Number(new URLSearchParams(location.search).get('seed'));
const freshSeed = () => Math.floor(Math.random() * 90000) + 10000;
let game: GameState = createGame({ seed: urlSeed || freshSeed() });
const canvas = $<HTMLCanvasElement>('map');
const renderer = new Renderer(canvas);
const cam = createCamera(game.taxi.pos);
const attractRng = createRng(1);
let attractT = 0;

// ---------- theme & sound ----------

function applyTheme() {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEMES[theme].land);
  const btn = $('themeButton');
  btn.setAttribute('aria-label', theme === 'night' ? 'Switch to day map' : 'Switch to night map');
  btn.innerHTML =
    theme === 'night'
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';
}
function toggleTheme() {
  theme = theme === 'night' ? 'day' : 'night';
  store.set('cad.theme', theme);
  applyTheme();
}
function applySound() {
  const btn = $('soundButton');
  btn.setAttribute('aria-pressed', String(sfx.muted));
  btn.setAttribute('aria-label', sfx.muted ? 'Unmute sound' : 'Mute sound');
}
function toggleSound() {
  sfx.muted = !sfx.muted;
  store.set('cad.muted', sfx.muted ? '1' : '0');
  applySound();
}

// ---------- screens ----------

function show(id: string, visible: boolean) {
  $(id).hidden = !visible;
}

function setMode(next: Mode) {
  mode = next;
  show('titleScreen', mode === 'title');
  show('pauseScreen', mode === 'paused');
  show('overScreen', mode === 'over');
  show('hud', mode === 'playing' || mode === 'paused');
  if (mode === 'paused') $('resumeButton').focus();
  if (mode === 'over') $('againButton').focus();
  if (mode === 'title') updateBestLine();
}

function updateBestLine() {
  const line = $('bestLine');
  line.hidden = best <= 0;
  line.textContent = `Best shift: ${fmt(best)}`;
}

function startShift(seed = freshSeed()) {
  sfx.unlock();
  game = createGame({ seed });
  cam.x = game.taxi.pos.x;
  cam.y = game.taxi.pos.y;
  lastCount = -1;
  $('toasts').innerHTML = '';
  keys.clear();
  setMode('playing');
}

function endShift() {
  if (game.score > best) {
    best = game.score;
    store.set('cad.best', String(best));
  }
  $('overScore').textContent = fmt(game.score);
  $('overFares').textContent = String(game.fares);
  $('overEscapes').textContent = String(game.escapes);
  $('overRecycled').textContent = String(game.recycled);
  $('overLine').textContent =
    game.lives > 0
      ? 'You clocked off early.'
      : game.fares === 0
        ? 'The fleet got you before your first fare.'
        : `You got ${game.fares} ${game.fares === 1 ? 'fare' : 'fares'} home before the fleet caught up.`;
  $('overBest').textContent = game.score >= best && game.score > 0 ? 'New best shift.' : `Best shift: ${fmt(best)}`;
  $('overSeed').textContent = `City ${game.seed}. Add ?seed=${game.seed} to the address to drive it again.`;
  show('countdown', false);
  setMode('over');
}

// ---------- toasts ----------

let lastSpottedToast = -10;
function toast(text: string, color: string) {
  const box = $('toasts');
  while (box.children.length >= 3) box.firstElementChild?.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span class="toast-dot" style="background:${color}"></span><span></span>`;
  (el.lastElementChild as HTMLElement).textContent = text;
  box.appendChild(el);
  setTimeout(() => el.classList.add('leaving'), 2200);
  setTimeout(() => el.remove(), 2450);
}

// ---------- events → feedback ----------

function handle(events: GameEvent[]) {
  const t = THEMES[theme];
  for (const e of events) {
    switch (e.type) {
      case 'go':
        sfx.go();
        toast(`Pick up ${game.job.passenger}`, t.pickup);
        break;
      case 'pickup':
        sfx.pickup();
        renderer.ring(game.taxi.pos, t.pickup);
        toast(`${e.passenger} is in the cab`, t.pickup);
        break;
      case 'dropoff':
        sfx.dropoff();
        renderer.ring(game.taxi.pos, t.dropoff);
        renderer.floatText(`+${e.fare}`, game.taxi.pos, '#FFD60A');
        toast(e.bonus > 0 ? `Fare paid: ${e.fare}, with ${e.bonus} on-time bonus` : `Fare paid: ${e.fare}`, '#FFD60A');
        break;
      case 'fareExpired':
        sfx.expired();
        toast(`The meter ran out. ${e.passenger} called a robotaxi`, t.pursuit);
        break;
      case 'spotted':
        sfx.spotted();
        if (game.time - lastSpottedToast > 1.5) {
          toast('Spotted. Break its line of sight', t.pursuit);
          lastSpottedToast = game.time;
        }
        break;
      case 'escaped':
        sfx.escaped();
        toast('You lost them', t.pickup);
        break;
      case 'powerup':
        sfx.powerup();
        renderer.ring(game.taxi.pos, e.kind === 'surge' ? '#FFD60A' : t.route);
        toast(
          e.kind === 'surge' ? 'Surge: top speed boosted' : 'Ctrl+Alt+Del: the whole fleet is rebooting. Ram them',
          e.kind === 'surge' ? '#FFD60A' : t.route,
        );
        break;
      case 'recycled':
        sfx.recycled();
        cam.shake = 0.5;
        renderer.floatText(`+${e.points}`, game.taxi.pos, t.route);
        break;
      case 'caught':
        sfx.caught();
        cam.shake = 1;
        if (!reducedMotion) {
          const f = $('flash');
          f.classList.remove('on');
          void f.offsetWidth;
          f.classList.add('on');
        }
        if (game.lives > 0) toast('A robotaxi poached your fare', t.pursuit);
        break;
      case 'levelUp':
        toast(`Level ${e.level}: the fleet is getting faster`, t.route);
        break;
      case 'gameOver':
        setTimeout(endShift, 900);
        break;
      case 'spawn':
        break;
    }
  }
}

// ---------- HUD ----------

let lastCount = -1;
const hudCache: Record<string, string> = {};
function setText(id: string, text: string) {
  if (hudCache[id] === text) return;
  hudCache[id] = text;
  $(id).textContent = text;
}
function setHtml(id: string, html: string) {
  if (hudCache['h' + id] === html) return;
  hudCache['h' + id] = html;
  $(id).innerHTML = html;
}

function updateHud() {
  const g = game;
  // Countdown keycap.
  if (g.phase === 'ready') {
    const n = Math.max(1, Math.ceil(GAME_RULES.countdown - g.phaseTime));
    show('countdown', true);
    if (n !== lastCount) {
      lastCount = n;
      const k = $('countKey');
      k.textContent = String(n);
      k.classList.remove('pop');
      void k.offsetWidth;
      k.classList.add('pop');
      sfx.tick();
    }
  } else show('countdown', false);

  // Direction banner.
  const job = g.job;
  if (g.route.length >= 2) {
    const d = describeDirections(g.map, g.route);
    setHtml('bannerIcon', ICONS[d.icon]);
    setText('bannerDistance', d.distance);
    setText(
      'bannerInstruction',
      d.icon === 'arrive' ? (job.stage === 'pickup' ? `Pick up ${job.passenger} ahead` : `Drop off at ${job.dropoffLabel}`) : d.instruction,
    );
  } else {
    setHtml('bannerIcon', ICONS.arrive);
    setText('bannerDistance', 'Now');
    setText('bannerInstruction', job.stage === 'pickup' ? `Pick up ${job.passenger}` : `Drop off ${job.passenger}`);
  }

  // Fare card.
  const pickup = job.stage === 'pickup';
  setText('fareTitle', pickup ? `Pick up ${job.passenger}` : `Taking ${job.passenger}`);
  setText('fareWhere', pickup ? `Waiting at ${job.pickupLabel}` : `To ${job.dropoffLabel}`);
  const dot = $('fareDot');
  dot.classList.toggle('dropoff', !pickup);
  setHtml('fareDot', pickup ? ICONS.person : ICONS.flag);
  setText('meterTime', formatClock(job.timeLeft));
  const ratio = job.timeLeft / job.timeTotal;
  const meter = $('meterTime');
  meter.classList.toggle('warn', ratio < 0.4 && ratio >= 0.18);
  meter.classList.toggle('danger', ratio < 0.18);
  const fill = $('meterFill');
  fill.style.transform = `scaleX(${Math.max(0, ratio)})`;
  fill.style.background = ratio < 0.18 ? 'var(--red)' : ratio < 0.4 ? 'var(--yellow)' : 'var(--green)';

  setText('score', fmt(g.score));
  setText('fares', String(g.fares));
  setText('level', String(g.level));
  setHtml(
    'lives',
    Array.from({ length: GAME_RULES.lives }, (_, i) => `<span class="life${i < g.lives ? '' : ' lost'}"></span>`).join(''),
  );

  // Status chips.
  const chips: string[] = [];
  const chasing = g.avs.filter((a) => a.state === 'chase' || a.state === 'alert').length;
  if (chasing) chips.push(`<span class="chip chip-chase">${chasing} ${chasing === 1 ? 'car' : 'cars'} chasing you</span>`);
  if (g.boostTime > 0) chips.push(`<span class="chip chip-surge">Surge ${Math.ceil(g.boostTime)}s</span>`);
  const rebooting = g.avs.filter((a) => a.state === 'rebooting');
  if (rebooting.length) {
    const left = Math.max(...rebooting.map((a) => DEFAULT_AV_TUNING.rebootTime - a.stateTime));
    chips.push(`<span class="chip chip-reboot">Fleet rebooting ${Math.ceil(left)}s</span>`);
  }
  setHtml('chips', chips.join(''));
}

// ---------- input ----------

const keys = new Set<string>();
let stick: { id: number; ox: number; oy: number; x: number; y: number } | null = null;

window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (mode === 'playing') setMode('paused');
    else if (mode === 'paused') setMode('playing');
    return;
  }
  if (mode === 'title' && (e.code === 'Enter' || e.code === 'Space')) {
    e.preventDefault();
    return startShift(urlSeed || freshSeed());
  }
  if (e.code === 'KeyT') return toggleTheme();
  if (e.code === 'KeyM') return toggleSound();
  keys.add(e.code);
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());
document.addEventListener('visibilitychange', () => {
  if (document.hidden && mode === 'playing') setMode('paused');
});

window.addEventListener('pointerdown', (e) => {
  if (mode !== 'playing' || e.pointerType === 'mouse') return;
  if ((e.target as HTMLElement).closest('button, .sheet')) return;
  stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 };
  const el = $('stick');
  el.style.left = `${e.clientX}px`;
  el.style.top = `${e.clientY}px`;
  $('stickKnob').style.transform = '';
  show('stick', true);
});
window.addEventListener('pointermove', (e) => {
  if (!stick || e.pointerId !== stick.id) return;
  const dx = e.clientX - stick.ox;
  const dy = e.clientY - stick.oy;
  const m = Math.hypot(dx, dy);
  const k = m > 50 ? 50 / m : 1;
  stick.x = (dx * k) / 50;
  stick.y = (dy * k) / 50;
  $('stickKnob').style.transform = `translate(${dx * k}px, ${dy * k}px)`;
});
const endStick = (e: PointerEvent) => {
  if (stick && e.pointerId === stick.id) {
    stick = null;
    show('stick', false);
  }
};
window.addEventListener('pointerup', endStick);
window.addEventListener('pointercancel', endStick);

function currentInput(): DriveInput {
  const k = inputFromKeys(keys);
  if (k.throttle || k.steer) return k;
  if (stick) return inputFromStick(stick, game.taxi.heading);
  return { throttle: 0, steer: 0 };
}

$('startButton').addEventListener('click', () => startShift(urlSeed || freshSeed()));
$('resumeButton').addEventListener('click', () => setMode('playing'));
$('quitButton').addEventListener('click', endShift);
$('againButton').addEventListener('click', () => startShift());
$('replayButton').addEventListener('click', () => startShift(game.seed));
$('pauseButton').addEventListener('click', () => setMode('paused'));
$('themeButton').addEventListener('click', toggleTheme);
$('soundButton').addEventListener('click', toggleSound);

// ---------- loop ----------

const STEP = 1 / 60;
let acc = 0;
let last = performance.now();
let input: DriveInput = { throttle: 0, steer: 0 };

function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const view = { w: renderer.width, h: renderer.height };

  if (mode === 'playing') {
    acc += dt;
    input = currentInput();
    while (acc >= STEP) {
      handle(updateGame(game, input, STEP));
      acc -= STEP;
    }
    updateCamera(cam, game.taxi, view, game.map, dt);
    updateHud();
  } else if (mode === 'title') {
    // Attract mode: the fleet roams while the camera drifts across town.
    attractT += dt;
    for (const av of game.avs)
      updateAutonomous(av, { map: game.map, taxi: { x: -1e5, y: -1e5 }, dt, rng: attractRng, tuning: DEFAULT_AV_TUNING });
    const W = game.map.width * game.map.tileSize;
    const H = game.map.height * game.map.tileSize;
    const pos = { x: W / 2 + Math.sin(attractT * 0.06) * W * 0.28, y: H / 2 + Math.cos(attractT * 0.045) * H * 0.25 };
    updateCamera(cam, { pos, heading: 0, speed: 0 }, view, game.map, dt);
  }

  if (mode !== 'paused') {
    renderer.render(game, cam, {
      theme,
      reducedMotion,
      braking: input.throttle < 0 && game.taxi.speed > 0,
      attract: mode === 'title',
    }, dt);
  }
  requestAnimationFrame(frame);
}

// ---------- boot ----------

function resize() {
  renderer.resize();
}
window.addEventListener('resize', resize);
resize();
applyTheme();
applySound();
// Give the attract-mode city a few more cars to look alive.
for (let i = 0; i < 5; i++) spawnAv(game);
setMode('title');
requestAnimationFrame(frame);

// `?debug` exposes the live game for poking at in the console (and for screenshot scripts).
if (new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { cad: unknown }).cad = { get game() { return game; }, cam };
}
