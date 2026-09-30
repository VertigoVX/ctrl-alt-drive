import { updateAutonomous, DEFAULT_AV_TUNING } from './core/autonomous';
import { createCamera, updateCamera, type Insets } from './core/camera';
import { describeDirections, formatClock } from './core/format';
import { createGame, updateGame, spawnAv, GAME_RULES, type GameEvent, type GameState } from './core/game';
import { inputFromKeys, inputFromStick } from './core/input';
import { createRng } from './core/rng';
import { parseSettings, type Settings, type ThemeId } from './core/settings';
import { addEarnings, availableThemes, CATALOG, equip, parseProfile, type Profile } from './core/shop';
import type { DriveInput } from './core/vehicle';
import { Renderer } from './render/renderer';
import { THEMES } from './render/theme';
import { Sfx } from './ui/audio';
import { Garage, mapItemForTheme } from './ui/garage';
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
const money = (n: number) => `$${fmt(n)}`;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const landscapePhone = window.matchMedia('(max-height: 500px) and (orientation: landscape)');

const ICONS = {
  left: '<svg viewBox="0 0 44 44"><path d="M30 38V22a6 6 0 0 0-6-6H10"/><path d="M17 8l-8 8 8 8"/></svg>',
  right: '<svg viewBox="0 0 44 44"><path d="M14 38V22a6 6 0 0 1 6-6h14"/><path d="M27 8l8 8-8 8"/></svg>',
  arrive: '<svg viewBox="0 0 44 44"><path d="M22 40V8"/><path d="M13 17l9-9 9 9"/></svg>',
  person: '<svg viewBox="0 0 16 16"><circle cx="8" cy="4.5" r="3"/><path d="M2 15a6 6 0 0 1 12 0z"/></svg>',
  flag: '<svg viewBox="0 0 16 16"><path d="M3 1h1.6v14H3z"/><path d="M4.6 1.5 13 5l-8.4 3.6z"/></svg>',
};

// ---------- persistent state ----------

function loadSettings(): Settings {
  const raw = store.get('cad.settings');
  if (raw) return parseSettings(raw);
  // Migrate the separate keys used by the first release.
  return parseSettings(JSON.stringify({ theme: store.get('cad.theme') ?? undefined, muted: store.get('cad.muted') === '1' }));
}
let settings = loadSettings();
let profile: Profile = parseProfile(store.get('cad.profile'));
const saveSettings = () => store.set('cad.settings', JSON.stringify(settings));
const saveProfile = () => store.set('cad.profile', JSON.stringify(profile));
// A theme from a style you no longer own (or a hand-edited save) falls back to the night map.
if (!availableThemes(profile).includes(settings.theme)) settings.theme = 'night';

// ---------- game state ----------

type Mode = 'title' | 'playing' | 'paused' | 'over' | 'garage' | 'settings';
let mode: Mode = 'title';
let returnMode: Mode = 'title';
const sfx = new Sfx();
sfx.muted = settings.muted;
let best = Number(store.get('cad.best') || 0);

const urlSeed = Number(new URLSearchParams(location.search).get('seed'));
const freshSeed = () => Math.floor(Math.random() * 90000) + 10000;
let game: GameState = createGame({ seed: urlSeed || freshSeed() });
const canvas = $<HTMLCanvasElement>('map');
const renderer = new Renderer(canvas);
const cam = createCamera(game.taxi.pos);
const attractRng = createRng(1);
let attractT = 0;
let shiftStartCash = profile.cash;

// ---------- theme & sound ----------

function applyTheme() {
  const t = THEMES[settings.theme];
  document.documentElement.dataset.theme = t.ui === 'light' ? 'day' : 'night';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.land);
  $('themeButton').setAttribute('aria-label', `Map style: ${t.label2}. Change map style`);
}
function setTheme(theme: ThemeId) {
  settings.theme = theme;
  saveSettings();
  applyTheme();
}
function cycleTheme() {
  const themes = availableThemes(profile);
  const next = themes[(themes.indexOf(settings.theme) + 1) % themes.length];
  setTheme(next);
  profile = equip(profile, mapItemForTheme(next));
  saveProfile();
  if (mode === 'playing') toast(`Map style: ${THEMES[next].label2}`, THEMES[next].route);
}
function applySound() {
  const btn = $('soundButton');
  btn.setAttribute('aria-pressed', String(sfx.muted));
  btn.setAttribute('aria-label', sfx.muted ? 'Unmute sound' : 'Mute sound');
  $('soundSwitch').setAttribute('aria-checked', String(!sfx.muted));
}
function setMuted(muted: boolean) {
  sfx.muted = muted;
  settings.muted = muted;
  saveSettings();
  applySound();
}

let lastHorn = 0;
function honk() {
  const now = performance.now();
  if (now - lastHorn < 400) return;
  lastHorn = now;
  sfx.unlock();
  sfx.horn(profile.equipped.horn);
}

// ---------- screens ----------

function show(id: string, visible: boolean) {
  $(id).hidden = !visible;
}

const garage = new Garage({
  getProfile: () => profile,
  setProfile: (p) => {
    profile = p;
    saveProfile();
  },
  getTheme: () => settings.theme,
  setTheme,
  playHorn: (id) => {
    sfx.unlock();
    sfx.horn(id);
  },
  onClose: () => setMode(returnMode),
  reducedMotion,
});

function setMode(next: Mode) {
  if (mode === 'garage' && next !== 'garage') garage.close();
  mode = next;
  show('titleScreen', mode === 'title');
  show('pauseScreen', mode === 'paused');
  show('overScreen', mode === 'over');
  show('garageScreen', mode === 'garage');
  show('settingsScreen', mode === 'settings');
  show('hud', mode === 'playing' || mode === 'paused' || (mode === 'settings' && returnMode === 'paused'));
  if (mode === 'paused') $('resumeButton').focus();
  if (mode === 'over') $('againButton').focus();
  if (mode === 'title') updateTitle();
  if (mode === 'garage') garage.open();
  if (mode === 'settings') syncSettingsPanel();
}

function openOverlay(target: 'garage' | 'settings') {
  returnMode = mode;
  setMode(target);
}

function updateTitle() {
  const line = $('bestLine');
  line.hidden = best <= 0;
  line.textContent = `Best shift: ${money(best)}`;
  $('titleWallet').textContent = money(profile.cash);
}

function startShift(seed = freshSeed()) {
  sfx.unlock();
  game = createGame({ seed });
  game.steeringSensitivity = settings.sensitivity;
  cam.x = game.taxi.pos.x;
  cam.y = game.taxi.pos.y;
  lastCount = -1;
  shiftStartCash = profile.cash;
  $('toasts').innerHTML = '';
  keys.clear();
  setMode('playing');
}

function endShift() {
  if (game.score > best) {
    best = game.score;
    store.set('cad.best', String(best));
  }
  $('overScore').textContent = money(game.score);
  $('overFares').textContent = String(game.fares);
  $('overEscapes').textContent = String(game.escapes);
  $('overRecycled').textContent = String(game.recycled);
  $('overWallet').textContent = money(profile.cash);
  $('overLine').textContent =
    game.lives > 0
      ? 'You clocked off early.'
      : game.fares === 0
        ? 'The fleet got you before your first fare.'
        : `You got ${game.fares} ${game.fares === 1 ? 'fare' : 'fares'} home before the fleet caught up.`;
  $('overBest').textContent = game.score >= best && game.score > 0 ? 'New best shift.' : `Best shift: ${money(best)}`;
  // Nudge towards the garage when this shift put something new within reach.
  const newlyAffordable = CATALOG.filter(
    (i) => !profile.owned.includes(i.id) && i.price <= profile.cash && i.price > shiftStartCash,
  );
  const nudge = $('overNudge');
  nudge.hidden = newlyAffordable.length === 0;
  nudge.textContent =
    newlyAffordable.length === 1
      ? `You can now afford ${newlyAffordable[0].name} in the garage.`
      : `${newlyAffordable.length} new things in the garage are within reach.`;
  $('overSeed').textContent = `City ${game.seed}. Add ?seed=${game.seed} to the address to drive it again.`;
  show('countdown', false);
  setMode('over');
}

// ---------- settings panel ----------

const sensitivityWord = (v: number) => (v < 0.8 ? 'Gentle' : v > 1.2 ? 'Sharp' : 'Standard');
function syncSettingsPanel() {
  const pct = Math.round(settings.sensitivity * 100);
  ($('sensitivity') as HTMLInputElement).value = String(pct);
  $('sensitivityValue').textContent = `${pct}%`;
  $('sensitivityWord').textContent = sensitivityWord(settings.sensitivity);
  applySound();
}
$('sensitivity').addEventListener('input', (e) => {
  settings.sensitivity = Number((e.target as HTMLInputElement).value) / 100;
  game.steeringSensitivity = settings.sensitivity;
  saveSettings();
  syncSettingsPanel();
});
$('soundSwitch').addEventListener('click', () => setMuted(!sfx.muted));
$('settingsDone').addEventListener('click', () => setMode(returnMode));

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

function bank(amount: number) {
  profile = addEarnings(profile, amount);
  saveProfile();
}

function handle(events: GameEvent[]) {
  const t = THEMES[settings.theme];
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
        bank(e.fare);
        renderer.ring(game.taxi.pos, t.dropoff);
        renderer.floatText(`+${money(e.fare)}`, game.taxi.pos, '#FFD60A');
        toast(e.bonus > 0 ? `Fare paid: ${money(e.fare)}, with ${money(e.bonus)} on-time bonus` : `Fare paid: ${money(e.fare)}`, '#FFD60A');
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
        bank(e.points);
        cam.shake = 0.5;
        renderer.floatText(`+${money(e.points)}`, game.taxi.pos, t.route);
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

  const pickup = job.stage === 'pickup';
  setText('fareTitle', pickup ? `Pick up ${job.passenger}` : `Taking ${job.passenger}`);
  setText('fareWhere', pickup ? `Waiting at ${job.pickupLabel}` : `To ${job.dropoffLabel}`);
  $('fareDot').classList.toggle('dropoff', !pickup);
  setHtml('fareDot', pickup ? ICONS.person : ICONS.flag);
  setText('meterTime', formatClock(job.timeLeft));
  const ratio = job.timeLeft / job.timeTotal;
  const meter = $('meterTime');
  meter.classList.toggle('warn', ratio < 0.4 && ratio >= 0.18);
  meter.classList.toggle('danger', ratio < 0.18);
  const fill = $('meterFill');
  fill.style.transform = `scaleX(${Math.max(0, ratio)})`;
  fill.style.background = ratio < 0.18 ? 'var(--red)' : ratio < 0.4 ? 'var(--yellow)' : 'var(--green)';

  setText('score', money(g.score));
  setText('fares', String(g.fares));
  setText('level', String(g.level));
  setHtml(
    'lives',
    Array.from({ length: GAME_RULES.lives }, (_, i) => `<span class="life${i < g.lives ? '' : ' lost'}"></span>`).join(''),
  );

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

/** Where the HUD panels sit, so the camera can frame the taxi in the visible gap. */
let insets: Required<Insets> = { top: 0, bottom: 0, left: 0 };
let insetTimer = 0;
function measureInsets() {
  if (mode !== 'playing') {
    insets = { top: 0, bottom: 0, left: 0 };
    return;
  }
  const h = renderer.height || window.innerHeight;
  const sheet = document.querySelector('.sheet')!.getBoundingClientRect();
  const banner = $('banner').getBoundingClientRect();
  insets = landscapePhone.matches
    ? { top: 0, bottom: 0, left: Math.max(sheet.right, banner.right) + 8 }
    : { top: banner.bottom + 8, bottom: Math.max(0, h - sheet.top) + 8, left: 0 };
}

// ---------- input ----------

const keys = new Set<string>();
let stick: { id: number; ox: number; oy: number; x: number; y: number } | null = null;

window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  if (mode === 'title' && (e.code === 'Enter' || e.code === 'Space')) {
    e.preventDefault();
    return startShift(urlSeed || freshSeed());
  }
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (mode === 'playing') setMode('paused');
    else if (mode === 'paused') setMode('playing');
    else if (mode === 'garage' || mode === 'settings') setMode(returnMode);
    return;
  }
  if (e.code === 'KeyT') return cycleTheme();
  if (e.code === 'KeyM') return setMuted(!sfx.muted);
  if (e.code === 'KeyH' && mode === 'playing') return honk();
  keys.add(e.code);
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());
document.addEventListener('visibilitychange', () => {
  if (document.hidden && mode === 'playing') setMode('paused');
});

window.addEventListener('pointerdown', (e) => {
  if (mode !== 'playing' || e.pointerType === 'mouse') return;
  if ((e.target as HTMLElement).closest('button, .sheet, .banner')) return;
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
$('themeButton').addEventListener('click', cycleTheme);
$('soundButton').addEventListener('click', () => setMuted(!sfx.muted));
$('hornButton').addEventListener('click', honk);
$('garageButton').addEventListener('click', () => openOverlay('garage'));
$('overGarageButton').addEventListener('click', () => openOverlay('garage'));
$('settingsButton').addEventListener('click', () => openOverlay('settings'));
$('pauseSettingsButton').addEventListener('click', () => openOverlay('settings'));

// ---------- loop ----------

const STEP = 1 / 60;
let acc = 0;
let last = performance.now();
let input: DriveInput = { throttle: 0, steer: 0 };

function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  renderer.syncSize();
  const view = { w: renderer.width, h: renderer.height };

  insetTimer -= dt;
  if (insetTimer <= 0) {
    measureInsets();
    insetTimer = 0.25;
  }

  if (mode === 'playing') {
    acc += dt;
    input = currentInput();
    while (acc >= STEP) {
      handle(updateGame(game, input, STEP));
      acc -= STEP;
    }
    updateCamera(cam, game.taxi, view, game.map, dt, insets);
    updateHud();
  } else if (mode === 'title' || (mode === 'garage' && returnMode === 'title') || (mode === 'settings' && returnMode === 'title')) {
    // Attract mode: the fleet roams while the camera drifts across town.
    attractT += dt;
    for (const av of game.avs)
      updateAutonomous(av, { map: game.map, taxi: { x: -1e5, y: -1e5 }, dt, rng: attractRng, tuning: DEFAULT_AV_TUNING });
    const W = game.map.width * game.map.tileSize;
    const H = game.map.height * game.map.tileSize;
    const pos = { x: W / 2 + Math.sin(attractT * 0.06) * W * 0.28, y: H / 2 + Math.cos(attractT * 0.045) * H * 0.25 };
    updateCamera(cam, { pos, heading: 0, speed: 0 }, view, game.map, dt);
  }

  const attract = mode === 'title' || ((mode === 'garage' || mode === 'settings') && returnMode === 'title');
  if (mode !== 'paused' && !(mode === 'settings' && returnMode === 'paused')) {
    renderer.render(game, cam, {
      theme: settings.theme,
      reducedMotion,
      braking: input.throttle < 0 && game.taxi.speed > 0,
      attract,
      look: { paint: profile.equipped.paint, roof: profile.equipped.roof },
      insets,
    }, dt);
  }
  requestAnimationFrame(frame);
}

// ---------- boot ----------

applyTheme();
applySound();
for (let i = 0; i < 5; i++) spawnAv(game);
setMode('title');
requestAnimationFrame(frame);

// `?debug` exposes the live game for poking at in the console (and for screenshot scripts).
if (new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { cad: unknown }).cad = {
    get game() { return game; },
    get profile() { return profile; },
    cam,
    give(n: number) { bank(n); updateTitle(); },
  };
}
