import { createAutonomous, DEFAULT_AV_TUNING, updateAutonomous, type Autonomous, type AvState } from './autonomous';
import {
  drivableNeighbours, generateCity, isDrivable, roadTiles, streetNameAt, tileAt, tileCenter, worldToTile,
  type CityMap, type Point,
} from './city';
import { dist, type Vec } from './math';
import { distanceField, findPath } from './pathfinding';
import { generateCityMap, type CityDef, type CityId } from './cities';
import { MODES, type ModeId, type ModeRules } from './modes';
import { PASSENGER_KINDS, Roster, type PassengerKind } from './passengers';
import { createRng, type Rng } from './rng';
import { createVehicle, DEFAULT_HANDLING, updateVehicle, type DriveInput, type Vehicle } from './vehicle';

export const GAME_RULES = {
  countdown: 3,
  lives: 3,
  initialAvs: 2,
  maxAvs: (level: number) => Math.min(12, 2 + level * 2),
  spawnInterval: (level: number) => Math.max(3.5, 8 - level * 0.7),
  avSpeedScale: (level: number) => Math.min(1.3, 1 + (level - 1) * 0.06),
  /** In tiles. */
  minSpawnDistance: 9,
  faresPerLevel: 2,
  baseFare: 100,
  bonusPerSecond: 10,
  recyclePoints: 250,
  /** World units/sec a decent driver averages; used to size the fare meter. */
  referenceSpeed: 200,
  caughtPause: 1.6,
  graceTime: 2.5,
  surgeTime: 5,
  surgeBoost: 1.4,
  powerupInterval: 14,
  maxPowerups: 2,
  pickupRadius: 30,
  catchRadius: 24,
  /** Impacts slower than this (world units/s straight into a wall) do no damage. */
  damageThreshold: 90, // measured: 60–90 is almost all kerb scrapes while cornering sensibly
  /** Health lost by a full-speed head-on crash at damage scale 1. */
  crashDamage: 40,
  damageCooldown: 0.35,
  repairAmount: 50,
  /** Health needed at drop-off for the clean-cab bonuses. */
  mintCondition: 90,
  tipChance: 0.45,
  perkChance: 0.35,
};

export type Phase = 'ready' | 'playing' | 'caught' | 'over';
export type PowerupKind = 'reboot' | 'surge' | 'repair';

export interface Powerup {
  kind: PowerupKind;
  pos: Vec;
}

export interface Job {
  stage: 'pickup' | 'dropoff';
  passenger: string;
  kind: PassengerKind;
  pickup: Vec;
  pickupTile: Point;
  pickupLabel: string;
  dropoff: Vec;
  dropoffTile: Point;
  dropoffLabel: string;
  routeTiles: number;
  timeTotal: number;
  timeLeft: number;
}

export type GameEvent =
  | { type: 'go' }
  | { type: 'pickup'; passenger: string }
  | { type: 'dropoff'; fare: number; bonus: number }
  | { type: 'fareExpired'; passenger: string }
  | { type: 'caught' }
  | { type: 'damage'; amount: number }
  | { type: 'wrecked' }
  | { type: 'tip'; amount: number; passenger: string }
  | { type: 'perk'; kind: PowerupKind }
  | { type: 'gameOver' }
  | { type: 'spawn' }
  | { type: 'spotted'; id: number }
  | { type: 'escaped'; id: number }
  | { type: 'powerup'; kind: PowerupKind }
  | { type: 'recycled'; points: number }
  | { type: 'levelUp'; level: number };

export interface GameState {
  seed: number;
  /** The named city being played, if any. */
  city: CityId | null;
  mode: ModeId;
  rules: ModeRules;
  /** 0–100. */
  health: number;
  damageCooldown: number;
  map: CityMap;
  rng: Rng;
  taxi: Vehicle;
  avs: Autonomous[];
  job: Job;
  route: Point[];
  powerups: Powerup[];
  phase: Phase;
  phaseTime: number;
  time: number;
  score: number;
  lives: number;
  fares: number;
  level: number;
  escapes: number;
  recycled: number;
  invulnerable: number;
  boostTime: number;
  /** Player steering preference, multiplies the handling turn rate. */
  steeringSensitivity: number;
  spawnTimer: number;
  powerupTimer: number;
  routeTimer: number;
  nextAvId: number;
  roster: Roster;
}


const addressOf = (map: CityMap, t: Point) => `${100 + ((t.x * 37 + t.y * 53) % 880)} ${streetNameAt(map, t.x, t.y)}`;

function tilesWithin(map: CityMap, field: Int32Array, min: number, max: number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < field.length; i++)
    if (field[i] >= min && field[i] <= max) out.push({ x: i % map.width, y: Math.floor(i / map.width) });
  return out;
}

function farthest(map: CityMap, field: Int32Array, fraction: number): Point[] {
  const vals = Array.from(field).filter((v) => v > 0).sort((a, b) => a - b);
  const cut = vals[Math.floor(vals.length * (1 - fraction))] ?? 1;
  return tilesWithin(map, field, cut, Infinity);
}

function newJob(g: GameState): Job {
  const { map, rng } = g;
  const passenger = g.roster.pick();
  const from = worldToTile(map, g.taxi.pos);
  const f1 = distanceField(map, from);
  let pickups = tilesWithin(map, f1, 8, 22);
  if (!pickups.length) pickups = farthest(map, f1, 0.5);
  const pickupTile = rng.pick(pickups);
  const f2 = distanceField(map, pickupTile);
  let drops = tilesWithin(map, f2, 18, 40);
  if (!drops.length) drops = farthest(map, f2, 0.3);
  const dropoffTile = rng.pick(drops);
  const routeTiles = f1[pickupTile.y * map.width + pickupTile.x] + f2[dropoffTile.y * map.width + dropoffTile.x];
  const tilesPerSecond = GAME_RULES.referenceSpeed / map.tileSize;
  const kind = PASSENGER_KINDS[passenger.kind];
  const timeTotal = Math.round((routeTiles / tilesPerSecond * 1.8 + 10) * kind.meterMultiplier * g.rules.meterScale);
  return {
    stage: 'pickup',
    passenger: passenger.name,
    kind: passenger.kind,
    pickup: tileCenter(map, pickupTile.x, pickupTile.y),
    pickupTile,
    pickupLabel: addressOf(map, pickupTile),
    dropoff: tileCenter(map, dropoffTile.x, dropoffTile.y),
    dropoffTile,
    dropoffLabel: addressOf(map, dropoffTile),
    routeTiles,
    timeTotal,
    timeLeft: timeTotal,
  };
}

function randomRoadAwayFrom(g: GameState, from: Vec, minTiles: number): Point | null {
  const min = minTiles * g.map.tileSize;
  const candidates = roadTiles(g.map).filter((t) => dist(tileCenter(g.map, t.x, t.y), from) > min);
  return candidates.length ? g.rng.pick(candidates) : null;
}

export function spawnAv(g: GameState): boolean {
  const t = randomRoadAwayFrom(g, g.taxi.pos, GAME_RULES.minSpawnDistance);
  if (!t) return false;
  const n = g.rng.pick(drivableNeighbours(g.map, t.x, t.y));
  const av = createAutonomous(g.nextAvId++, g.map, t, Math.atan2(n.y - t.y, n.x - t.x));
  av.speedScale = GAME_RULES.avSpeedScale(g.level) * g.rules.avSpeed;
  g.avs.push(av);
  return true;
}

function refreshRoute(g: GameState) {
  const from = worldToTile(g.map, g.taxi.pos);
  if (!isDrivable(tileAt(g.map, from.x, from.y))) return;
  const goal = g.job.stage === 'pickup' ? g.job.pickupTile : g.job.dropoffTile;
  g.route = findPath(g.map, from, goal) ?? g.route;
}

export interface GameOptions {
  seed: number;
  mode?: ModeId;
  city?: CityDef;
  /** Local names to mix with the global pool (defaults to the city's own). */
  passengerNames?: readonly string[];
  width?: number;
  height?: number;
}

export function createGame(opts: GameOptions): GameState {
  // A named city always has the same layout; the run seed only varies traffic and fares.
  const map = opts.city
    ? generateCityMap(opts.city)
    : generateCity({ width: opts.width ?? 44, height: opts.height ?? 32, seed: opts.seed });
  const rng = createRng(opts.seed ^ 0x5eed);
  // Start the taxi near the middle of town, pointing down its street.
  const roads = roadTiles(map);
  const mid = { x: map.width / 2, y: map.height / 2 };
  const start = roads.reduce((a, b) => (Math.hypot(b.x - mid.x, b.y - mid.y) < Math.hypot(a.x - mid.x, a.y - mid.y) ? b : a));
  const taxi = createVehicle(tileCenter(map, start.x, start.y), 0);

  const rules = MODES[opts.mode ?? 'normal'];
  const g: GameState = {
    seed: opts.seed, city: opts.city?.id ?? null, mode: rules.id, rules, health: 100, damageCooldown: 0,
    roster: new Roster(rng, opts.passengerNames ?? opts.city?.passengers ?? []),
    map, rng, taxi, avs: [], route: [], powerups: [],
    job: undefined as unknown as Job,
    phase: 'ready', phaseTime: 0, time: 0,
    score: 0, lives: rules.lives, fares: 0, level: 1, escapes: 0, recycled: 0,
    invulnerable: 0, boostTime: 0, steeringSensitivity: 1,
    spawnTimer: GAME_RULES.spawnInterval(1) * rules.spawnScale, powerupTimer: GAME_RULES.powerupInterval, routeTimer: 0,
    nextAvId: 1,
  };
  g.job = newJob(g);
  for (let i = 0; i < GAME_RULES.initialAvs; i++) spawnAv(g);
  refreshRoute(g);
  // Face the first leg of the route so the shift starts moving towards the passenger.
  const [a, b] = g.route;
  if (a && b) taxi.heading = Math.atan2(b.y - a.y, b.x - a.x);
  return g;
}

export function updateGame(g: GameState, input: DriveInput, dt: number): GameEvent[] {
  const events: GameEvent[] = [];
  g.phaseTime += dt;

  if (g.phase === 'over') return events;
  if (g.phase === 'ready') {
    if (g.phaseTime >= GAME_RULES.countdown) {
      g.phase = 'playing';
      g.phaseTime = 0;
      events.push({ type: 'go' });
    }
    return events;
  }
  if (g.phase === 'caught') {
    if (g.phaseTime >= GAME_RULES.caughtPause) {
      g.phase = 'playing';
      g.phaseTime = 0;
      g.invulnerable = GAME_RULES.graceTime;
    }
    return events;
  }

  g.time += dt;
  g.invulnerable = Math.max(0, g.invulnerable - dt);
  g.boostTime = Math.max(0, g.boostTime - dt);

  // Taxi.
  const handling = { ...DEFAULT_HANDLING, turnRate: DEFAULT_HANDLING.turnRate * g.steeringSensitivity };
  updateVehicle(g.taxi, input, dt, g.map, g.boostTime > 0 ? GAME_RULES.surgeBoost : 1, handling);

  // Crashes dent the cab.
  g.damageCooldown = Math.max(0, g.damageCooldown - dt);
  if (g.taxi.impact > GAME_RULES.damageThreshold && g.damageCooldown <= 0) {
    const severity = (g.taxi.impact - GAME_RULES.damageThreshold) / (DEFAULT_HANDLING.maxSpeed - GAME_RULES.damageThreshold);
    const amount = Math.round(Math.min(1.4, severity) * GAME_RULES.crashDamage * g.rules.damageScale);
    if (amount > 0) {
      g.health = Math.max(0, g.health - amount);
      g.damageCooldown = GAME_RULES.damageCooldown;
      events.push({ type: 'damage', amount });
      if (g.health <= 0 && g.rules.wrecks) {
        events.push({ type: 'wrecked' });
        g.health = 100; // the next cab off the rank is a fresh one
        loseCab(g, events);
        return events;
      }
    }
  }

  // Fleet.
  const tuning = DEFAULT_AV_TUNING;
  for (const av of g.avs) {
    const before: AvState = av.state;
    updateAutonomous(av, { map: g.map, taxi: g.taxi.pos, dt, rng: g.rng, tuning });
    if (av.state === 'alert' && before !== 'alert') events.push({ type: 'spotted', id: av.id });
    if (before === 'chase' && av.state === 'search') {
      g.escapes++;
      events.push({ type: 'escaped', id: av.id });
    }
  }

  // Power-ups.
  g.powerupTimer -= dt;
  if (g.powerupTimer <= 0) {
    g.powerupTimer = GAME_RULES.powerupInterval;
    if (g.powerups.length < GAME_RULES.maxPowerups) {
      const t = randomRoadAwayFrom(g, g.taxi.pos, 6);
      if (t) {
        const kind: PowerupKind = g.health < 100 && g.rng.chance(0.3) ? 'repair' : g.rng.chance(0.4) ? 'reboot' : 'surge';
        g.powerups.push({ kind, pos: tileCenter(g.map, t.x, t.y) });
      }
    }
  }
  g.powerups = g.powerups.filter((p) => {
    if (dist(p.pos, g.taxi.pos) > GAME_RULES.pickupRadius) return true;
    if (p.kind === 'surge') g.boostTime = GAME_RULES.surgeTime;
    else if (p.kind === 'repair') g.health = Math.min(100, g.health + GAME_RULES.repairAmount);
    else
      for (const av of g.avs) {
        av.state = 'rebooting';
        av.stateTime = 0;
        av.path = [];
      }
    events.push({ type: 'powerup', kind: p.kind });
    return false;
  });

  // Collisions with the fleet.
  const touching = g.avs.filter((av) => dist(av.pos, g.taxi.pos) < GAME_RULES.catchRadius);
  for (const av of touching.filter((a) => a.state === 'rebooting')) {
    g.avs.splice(g.avs.indexOf(av), 1);
    const points = Math.round(GAME_RULES.recyclePoints * g.rules.cashMultiplier);
    g.score += points;
    g.recycled++;
    events.push({ type: 'recycled', points });
  }
  if (g.invulnerable <= 0 && touching.some((a) => a.state !== 'rebooting')) {
    events.push({ type: 'caught' });
    // The robotaxi drives off with your passenger, and the cars around you clear out.
    g.avs = g.avs.filter((av) => dist(av.pos, g.taxi.pos) > 6 * g.map.tileSize);
    if (g.rules.repairOnCaught) g.health = 100;
    loseCab(g, events);
    return events;
  }

  // The fare.
  const job = g.job;
  job.timeLeft = Math.max(0, job.timeLeft - dt);
  if (job.stage === 'pickup' && dist(g.taxi.pos, job.pickup) < GAME_RULES.pickupRadius) {
    job.stage = 'dropoff';
    events.push({ type: 'pickup', passenger: job.passenger });
    g.routeTimer = 0;
  } else if (job.stage === 'dropoff' && dist(g.taxi.pos, job.dropoff) < GAME_RULES.pickupRadius) {
    const kind = PASSENGER_KINDS[job.kind];
    const scale = kind.fareMultiplier * g.rules.cashMultiplier;
    const bonus = Math.round(job.timeLeft * GAME_RULES.bonusPerSecond);
    const fare = Math.round((GAME_RULES.baseFare + bonus) * scale);
    g.score += fare;
    g.fares++;
    events.push({ type: 'dropoff', fare, bonus: Math.round(bonus * scale) });
    // Clean-cab bonuses: a tip, or failing that maybe a perk dropped nearby.
    if (g.health >= GAME_RULES.mintCondition) {
      if (g.rng.chance(GAME_RULES.tipChance + kind.tipBias)) {
        const amount = Math.round(fare * (0.2 + g.rng.next() * 0.3));
        g.score += amount;
        events.push({ type: 'tip', amount, passenger: job.passenger });
      } else if (g.rng.chance(GAME_RULES.perkChance)) {
        const near = roadTiles(g.map).filter((t) => {
          const d = dist(tileCenter(g.map, t.x, t.y), g.taxi.pos) / g.map.tileSize;
          return d >= 3 && d <= 7;
        });
        if (near.length) {
          const t = g.rng.pick(near);
          const kindOf: PowerupKind = g.health < 100 ? 'repair' : g.rng.chance(0.5) ? 'surge' : 'reboot';
          g.powerups.push({ kind: kindOf, pos: tileCenter(g.map, t.x, t.y) });
          events.push({ type: 'perk', kind: kindOf });
        }
      }
    }
    const level = 1 + Math.floor(g.fares / GAME_RULES.faresPerLevel);
    if (level > g.level) {
      g.level = level;
      events.push({ type: 'levelUp', level });
    }
    g.job = newJob(g);
    g.routeTimer = 0;
  } else if (job.timeLeft <= 0) {
    events.push({ type: 'fareExpired', passenger: job.passenger });
    g.job = newJob(g);
    g.routeTimer = 0;
  }

  // Spawner.
  g.spawnTimer -= dt;
  if (g.spawnTimer <= 0) {
    g.spawnTimer = GAME_RULES.spawnInterval(g.level) * g.rules.spawnScale;
    if (g.avs.length < GAME_RULES.maxAvs(g.level) + g.rules.maxAvsBonus && spawnAv(g)) events.push({ type: 'spawn' });
  }

  g.routeTimer -= dt;
  if (g.routeTimer <= 0) {
    refreshRoute(g);
    g.routeTimer = 0.25;
  }
  return events;
}

/** Lose the current cab (caught or wrecked): passenger gone, brief pause, or game over. */
function loseCab(g: GameState, events: GameEvent[]) {
  g.lives--;
  g.taxi.speed = 0;
  if (g.lives <= 0) {
    g.phase = 'over';
    g.phaseTime = 0;
    events.push({ type: 'gameOver' });
    return;
  }
  g.phase = 'caught';
  g.phaseTime = 0;
  g.job = newJob(g);
  refreshRoute(g);
}
