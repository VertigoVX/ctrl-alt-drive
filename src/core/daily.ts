import { CITY_IDS, cityById, type CityId } from './cities';
import type { GameEvent } from './game';
import { MODES, type ModeId } from './modes';
import { createRng } from './rng';

// The daily challenge: one city, mode and traffic seed per UTC day, shared by every player.
// Everything here is pure and DOM-free; main.ts stores the stats and shows the card.

/** Challenge #1. */
export const DAILY_EPOCH = '2026-10-12';
const DAY_MS = 86_400_000;
const HISTORY_DAYS = 60;
/** Health needed at drop-off for a fare to count as clean (mirrors GAME_RULES.mintCondition). */
const MINT = 90;

export interface DailyChallenge {
  key: string;
  number: number;
  seed: number;
  city: CityId;
  mode: ModeId;
}

/** YYYY-MM-DD in UTC, so a challenge is the same worldwide whatever the player's timezone. */
export const dayKey = (d: Date): string => d.toISOString().slice(0, 10);

const dayIndex = (key: string) => Math.round((Date.parse(`${key}T00:00:00Z`) - Date.parse(`${DAILY_EPOCH}T00:00:00Z`)) / DAY_MS);
const keyFromIndex = (i: number) => dayKey(new Date(Date.parse(`${DAILY_EPOCH}T00:00:00Z`) + i * DAY_MS));
const previousKey = (key: string) => keyFromIndex(dayIndex(key) - 1);

/** FNV-1a, so seeds don't depend on anything but the date string. */
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Each 8-day block visits every city once, in a shuffled order. */
function blockOrder(block: number): CityId[] {
  const rng = createRng(hash32(`cities:${block}`));
  const order = [...CITY_IDS];
  for (let i = order.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

function cityFor(index: number): CityId {
  const n = CITY_IDS.length;
  const block = Math.floor(index / n);
  const order = blockOrder(block);
  // Never the same city two days running across a block boundary.
  if (order[0] === blockOrder(block - 1)[n - 1]) [order[0], order[1]] = [order[1], order[0]];
  return order[((index % n) + n) % n];
}

function modeFor(key: string): ModeId {
  const weekday = new Date(`${key}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  if (weekday === 0 || weekday === 6) return 'extreme';
  if (weekday === 4 || weekday === 5) return 'hard';
  return 'normal';
}

export function dailyChallenge(now: Date): DailyChallenge {
  const key = dayKey(now);
  const index = dayIndex(key);
  return { key, number: index + 1, seed: hash32(`daily:${key}`) % 900000 + 100000, city: cityFor(index), mode: modeFor(key) };
}

// ---------- results and streaks ----------

export type TimelineMark = 'fare' | 'vip' | 'dented' | 'expired' | 'lost';

export interface DailyResult {
  score: number;
  fares: number;
  escapes: number;
  timeline: TimelineMark[];
}

export interface DailyDay {
  attempts: number;
  best: DailyResult | null;
}

export interface DailyStats {
  lastPlayed: string | null;
  streak: number;
  bestStreak: number;
  days: Record<string, DailyDay>;
}

export const emptyDailyStats = (): DailyStats => ({ lastPlayed: null, streak: 0, bestStreak: 0, days: {} });

export function recordDaily(stats: DailyStats, c: DailyChallenge, r: DailyResult): DailyStats {
  const prev = stats.days[c.key] ?? { attempts: 0, best: null };
  const day: DailyDay = { attempts: prev.attempts + 1, best: !prev.best || r.score > prev.best.score ? r : prev.best };
  let { streak, lastPlayed } = stats;
  if (!lastPlayed || c.key > lastPlayed) {
    streak = lastPlayed === previousKey(c.key) ? streak + 1 : 1;
    lastPlayed = c.key;
  }
  const keys = Object.keys({ ...stats.days, [c.key]: day }).sort().slice(-HISTORY_DAYS);
  const all = { ...stats.days, [c.key]: day };
  return {
    lastPlayed,
    streak,
    bestStreak: Math.max(stats.bestStreak, streak),
    days: Object.fromEntries(keys.map((k) => [k, all[k]])),
  };
}

/** The streak as it stands today: still alive if you played today or yesterday. */
export function currentStreak(stats: DailyStats, todayKey: string): number {
  if (!stats.lastPlayed) return 0;
  return stats.lastPlayed === todayKey || stats.lastPlayed === previousKey(todayKey) ? stats.streak : 0;
}

const isKey = (k: unknown): k is string => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k) && !Number.isNaN(Date.parse(`${k}T00:00:00Z`));
const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
const MARKS: TimelineMark[] = ['fare', 'vip', 'dented', 'expired', 'lost'];

function parseResult(v: unknown): DailyResult | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  if (typeof r.score !== 'number' || !Number.isFinite(r.score)) return null;
  return {
    score: Math.max(0, Math.round(r.score)),
    fares: count(r.fares),
    escapes: count(r.escapes),
    timeline: Array.isArray(r.timeline) ? (r.timeline.filter((m) => MARKS.includes(m as TimelineMark)) as TimelineMark[]) : [],
  };
}

export function parseDailyStats(raw: string | null): DailyStats {
  let d: unknown;
  try {
    d = raw ? JSON.parse(raw) : null;
  } catch {
    d = null;
  }
  if (!d || typeof d !== 'object' || Array.isArray(d)) return emptyDailyStats();
  const o = d as Record<string, unknown>;
  const days: Record<string, DailyDay> = {};
  if (o.days && typeof o.days === 'object')
    for (const [k, v] of Object.entries(o.days as Record<string, unknown>)) {
      if (!isKey(k) || !v || typeof v !== 'object') continue;
      const day = v as Record<string, unknown>;
      days[k] = { attempts: count(day.attempts), best: parseResult(day.best) };
    }
  return { lastPlayed: isKey(o.lastPlayed) ? o.lastPlayed : null, streak: count(o.streak), bestStreak: count(o.bestStreak), days };
}

// ---------- the run log and share card ----------

export interface RunLog {
  timeline: TimelineMark[];
  escapes: number;
}

export const createRunLog = (): RunLog => ({ timeline: [], escapes: 0 });

/** `at` is the state just before these events: the cab's health and whether the fare was a VIP. */
export function logEvents(log: RunLog, events: GameEvent[], at: { health: number; vip: boolean }) {
  for (const e of events) {
    if (e.type === 'dropoff') log.timeline.push(at.vip ? 'vip' : at.health >= MINT ? 'fare' : 'dented');
    else if (e.type === 'fareExpired') log.timeline.push('expired');
    else if (e.type === 'caught' || e.type === 'wrecked') log.timeline.push('lost');
    else if (e.type === 'escaped') log.escapes++;
  }
}

const SQUARE: Record<TimelineMark, string> = { fare: '🟩', vip: '⭐', dented: '🟨', expired: '⬛', lost: '🟥' };
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const MAX_SQUARES = 20;

export function shareText(c: DailyChallenge, r: DailyResult, streak: number, baseUrl: string): string {
  const shown = r.timeline.slice(0, MAX_SQUARES).map((m) => SQUARE[m]).join('');
  const more = r.timeline.length > MAX_SQUARES ? `+${r.timeline.length - MAX_SQUARES}` : '';
  return [
    `Ctrl+Alt+Drive daily #${c.number}`,
    `${cityById(c.city).name}, ${MODES[c.mode].name}`,
    `$${r.score.toLocaleString('en-US')} earned, ${plural(r.fares, 'fare')}, ${plural(r.escapes, 'escape')}`,
    shown || more ? shown + more : null,
    streak > 1 ? `Streak: ${streak} days` : null,
    `${baseUrl}?daily`,
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}
