import { describe, it, expect } from 'vitest';
import {
  dayKey, dailyChallenge, DAILY_EPOCH, emptyDailyStats, recordDaily, currentStreak, parseDailyStats,
  createRunLog, logEvents, shareText, type DailyResult,
} from '../src/core/daily';
import { CITY_IDS } from '../src/core/cities';
import { createGame, updateGame, GAME_RULES } from '../src/core/game';
import { cityById } from '../src/core/cities';

const utc = (s: string) => new Date(`${s}T12:00:00Z`);

describe('which challenge is today', () => {
  it('keys the day in UTC, so everyone in the world shares one challenge', () => {
    expect(dayKey(new Date('2026-10-12T23:30:00-05:00'))).toBe('2026-10-13'); // late evening in Chicago is already the 13th in UTC
    expect(dayKey(new Date('2026-10-13T01:00:00+02:00'))).toBe('2026-10-12'); // 1am in Johannesburg is still the 12th in UTC
  });

  it('numbers challenges from launch day: today (12 Oct 2026) is #1', () => {
    expect(DAILY_EPOCH).toBe('2026-10-12');
    expect(dailyChallenge(utc('2026-10-12')).number).toBe(1);
    expect(dailyChallenge(utc('2026-10-13')).number).toBe(2);
    expect(dailyChallenge(utc('2027-10-12')).number).toBe(366);
  });

  it('is identical for everyone on the same day, and different the next day', () => {
    expect(dailyChallenge(new Date('2026-11-03T00:00:01Z'))).toEqual(dailyChallenge(new Date('2026-11-03T23:59:59Z')));
    expect(dailyChallenge(utc('2026-11-03')).seed).not.toBe(dailyChallenge(utc('2026-11-04')).seed);
  });

  it('visits every city once in each eight-day block, so cities never repeat back to back', () => {
    for (let block = 0; block < 6; block++) {
      const cities = Array.from({ length: 8 }, (_, i) => dailyChallenge(new Date(Date.UTC(2026, 9, 12 + block * 8 + i, 12))).city);
      expect([...cities].sort()).toEqual([...CITY_IDS].sort());
    }
    for (let d = 0; d < 120; d++) {
      const a = dailyChallenge(new Date(Date.UTC(2026, 9, 12 + d, 12))).city;
      const b = dailyChallenge(new Date(Date.UTC(2026, 9, 13 + d, 12))).city;
      expect(a).not.toBe(b);
    }
  });

  it('runs Normal Monday to Wednesday, Hard Thursday and Friday, Extreme at the weekend', () => {
    // 12 Oct 2026 is a Monday.
    const modes = Array.from({ length: 7 }, (_, i) => dailyChallenge(new Date(Date.UTC(2026, 9, 12 + i, 12))).mode);
    expect(modes).toEqual(['normal', 'normal', 'normal', 'hard', 'hard', 'extreme', 'extreme']);
  });
});

describe('a fair challenge', () => {
  it('gives every player the same starting traffic and first fare', () => {
    const c = dailyChallenge(utc('2026-10-20'));
    const a = createGame({ seed: c.seed, city: cityById(c.city), mode: c.mode });
    const b = createGame({ seed: c.seed, city: cityById(c.city), mode: c.mode });
    expect(a.avs.map((v) => v.pos)).toEqual(b.avs.map((v) => v.pos));
    expect([a.job.pickupTile, a.job.dropoffTile, a.job.passenger]).toEqual([b.job.pickupTile, b.job.dropoffTile, b.job.passenger]);
  });

  it('hands out the same passengers in the same order however you drive', () => {
    const c = dailyChallenge(utc('2026-10-20'));
    const names = (input: { throttle: number; steer: number }) => {
      const g = createGame({ seed: c.seed, city: cityById(c.city), mode: c.mode });
      const out: string[] = [];
      for (let t = 0; t < GAME_RULES.countdown + 0.05; t += 1 / 60) updateGame(g, { throttle: 0, steer: 0 }, 1 / 60);
      for (let i = 0; i < 8; i++) {
        g.invulnerable = 1e9;
        for (let t = 0; t < 1.5; t += 1 / 60) updateGame(g, input, 1 / 60); // drive differently between fares
        out.push(g.job.passenger);
        g.taxi.pos = { ...g.job.pickup };
        updateGame(g, input, 1 / 60);
        g.taxi.pos = { ...g.job.dropoff };
        updateGame(g, input, 1 / 60);
      }
      return out;
    };
    expect(names({ throttle: 1, steer: 0.4 })).toEqual(names({ throttle: 0, steer: 0 }));
  });
});

const result = (score: number, extra: Partial<DailyResult> = {}): DailyResult => ({ score, fares: 3, escapes: 1, timeline: ['fare', 'fare', 'lost'], ...extra });

describe('daily stats', () => {
  const day1 = dailyChallenge(utc('2026-10-12'));
  const day2 = dailyChallenge(utc('2026-10-13'));
  const day4 = dailyChallenge(utc('2026-10-15'));

  it('keeps your best run and counts attempts', () => {
    let s = recordDaily(emptyDailyStats(), day1, result(400));
    s = recordDaily(s, day1, result(900));
    s = recordDaily(s, day1, result(650));
    expect(s.days[day1.key]).toEqual({ attempts: 3, best: result(900) });
  });

  it('counts a streak of consecutive days, once per day however often you play', () => {
    let s = recordDaily(emptyDailyStats(), day1, result(100));
    s = recordDaily(s, day1, result(200));
    expect(s.streak).toBe(1);
    s = recordDaily(s, day2, result(100));
    expect(s.streak).toBe(2);
    expect(s.bestStreak).toBe(2);
  });

  it('starts again after a missed day, remembering the best streak', () => {
    let s = recordDaily(emptyDailyStats(), day1, result(100));
    s = recordDaily(s, day2, result(100));
    s = recordDaily(s, day4, result(100));
    expect(s.streak).toBe(1);
    expect(s.bestStreak).toBe(2);
  });

  it('shows a streak as broken once a day has been missed, before you play again', () => {
    let s = recordDaily(emptyDailyStats(), day1, result(100));
    s = recordDaily(s, day2, result(100));
    expect(currentStreak(s, day2.key)).toBe(2); // played today
    expect(currentStreak(s, '2026-10-14')).toBe(2); // not yet played today: still alive
    expect(currentStreak(s, '2026-10-15')).toBe(0); // missed yesterday
  });

  it('only keeps the last 60 days of history', () => {
    let s = emptyDailyStats();
    for (let d = 0; d < 90; d++) s = recordDaily(s, dailyChallenge(new Date(Date.UTC(2026, 9, 12 + d, 12))), result(d));
    expect(Object.keys(s.days)).toHaveLength(60);
    expect(s.streak).toBe(90);
  });

  it('never mutates the stats it is given', () => {
    const s = recordDaily(emptyDailyStats(), day1, result(100));
    const before = JSON.stringify(s);
    recordDaily(s, day2, result(300));
    expect(JSON.stringify(s)).toBe(before);
  });

  it('survives missing, corrupt or tampered saves', () => {
    expect(parseDailyStats(null)).toEqual(emptyDailyStats());
    expect(parseDailyStats('{oops')).toEqual(emptyDailyStats());
    const t = parseDailyStats(JSON.stringify({ streak: -4, bestStreak: 'lots', lastPlayed: 7, days: { 'not-a-date': {}, '2026-10-12': { attempts: 2, best: { score: 'x' } } } }));
    expect(t.streak).toBe(0);
    expect(t.bestStreak).toBe(0);
    expect(t.lastPlayed).toBeNull();
    expect(Object.keys(t.days)).toEqual(['2026-10-12']);
    expect(t.days['2026-10-12'].best).toBeNull();
    const ok = recordDaily(emptyDailyStats(), day1, result(500));
    expect(parseDailyStats(JSON.stringify(ok))).toEqual(ok);
  });
});

describe('the run log behind the share card', () => {
  it('records fares, tips, VIPs, lost cabs and expired meters in order', () => {
    const log = createRunLog();
    logEvents(log, [{ type: 'dropoff', fare: 120, bonus: 20 }], { health: 100, vip: false });
    logEvents(log, [{ type: 'dropoff', fare: 300, bonus: 20 }, { type: 'tip', amount: 40, passenger: 'Tsebo' }], { health: 100, vip: true });
    logEvents(log, [{ type: 'dropoff', fare: 90, bonus: 0 }], { health: 55, vip: false });
    logEvents(log, [{ type: 'fareExpired', passenger: 'Ada' }], { health: 55, vip: false });
    logEvents(log, [{ type: 'caught' }], { health: 55, vip: false });
    logEvents(log, [{ type: 'wrecked' }], { health: 0, vip: false });
    logEvents(log, [{ type: 'escaped', id: 3 }], { health: 100, vip: false });
    expect(log.timeline).toEqual(['fare', 'vip', 'dented', 'expired', 'lost', 'lost']);
    expect(log.escapes).toBe(1);
  });
});

describe('the share card', () => {
  const c = dailyChallenge(utc('2026-10-12'));

  it('says which challenge, how it went, and links back', () => {
    const text = shareText(c, { score: 1240, fares: 5, escapes: 2, timeline: ['fare', 'vip', 'dented', 'fare', 'lost', 'fare', 'lost', 'lost'] }, 3, 'https://vertigovx.github.io/ctrl-alt-drive/');
    expect(text).toBe([
      'Ctrl+Alt+Drive daily #1',
      'New York, Normal',
      '$1,240 earned, 5 fares, 2 escapes',
      '🟩⭐🟨🟩🟥🟩🟥🟥',
      'Streak: 3 days',
      'https://vertigovx.github.io/ctrl-alt-drive/?daily',
    ].join('\n'));
  });

  it('reads naturally for single fares and first days, and leaves the streak out at 1', () => {
    const text = shareText(c, { score: 100, fares: 1, escapes: 1, timeline: ['fare', 'lost', 'lost', 'lost'] }, 1, 'https://x.example/');
    expect(text).toContain('$100 earned, 1 fare, 1 escape');
    expect(text).not.toContain('Streak');
  });

  it('caps a long run at 20 squares', () => {
    const timeline = Array.from({ length: 30 }, () => 'fare' as const);
    const grid = shareText(c, { score: 1, fares: 30, escapes: 0, timeline }, 1, 'https://x.example/').split('\n')[3];
    expect([...grid].filter((ch) => ch === '🟩')).toHaveLength(20);
    expect(grid.endsWith('+10')).toBe(true);
  });

  it('shows an empty run honestly', () => {
    expect(shareText(c, { score: 0, fares: 0, escapes: 0, timeline: ['lost', 'lost', 'lost'] }, 1, 'https://x.example/').split('\n')[2]).toBe('$0 earned, 0 fares, 0 escapes');
  });
});
