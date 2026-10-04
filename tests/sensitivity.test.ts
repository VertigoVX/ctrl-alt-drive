import { describe, it, expect } from 'vitest';
import { DEFAULT_HANDLING } from '../src/core/vehicle';
import { inputFromStick, STICK_GAIN } from '../src/core/input';
import { createGame, updateGame, GAME_RULES } from '../src/core/game';
import { parseSettings, DEFAULT_SETTINGS, SENSITIVITY_RANGE, SETTINGS_VERSION, STEERING_PRESETS } from '../src/core/settings';

describe('steering sensitivity', () => {
  it('turns 40% more gently than the original tuning (3.4 rad/s)', () => {
    expect(DEFAULT_HANDLING.turnRate).toBeCloseTo(3.4 * 0.6, 5);
  });

  it('touch stick steers 40% more gently than the original gain of 2', () => {
    expect(STICK_GAIN).toBeCloseTo(2 * 0.6, 5);
    const i = inputFromStick({ x: Math.cos(0.3), y: Math.sin(0.3) }, 0);
    expect(i.steer).toBeCloseTo(0.3 * STICK_GAIN, 5);
  });

  it('lets the player scale steering up or down', () => {
    const turnAfter = (sensitivity: number) => {
      const g = createGame({ seed: 42 });
      g.avs = [];
      g.steeringSensitivity = sensitivity;
      for (let t = 0; t < GAME_RULES.countdown + 0.05; t += 1 / 60) updateGame(g, { throttle: 0, steer: 0 }, 1 / 60);
      g.taxi.speed = 150;
      const h0 = g.taxi.heading;
      updateGame(g, { throttle: 1, steer: 1 }, 0.1);
      return Math.abs(g.taxi.heading - h0);
    };
    const gentle = turnAfter(0.5);
    const normal = turnAfter(1);
    const sharp = turnAfter(1.5);
    expect(normal).toBeCloseTo(gentle * 2, 3);
    expect(sharp).toBeCloseTo(gentle * 3, 3);
  });
});

describe('settings persistence', () => {
  it('falls back to defaults for missing or corrupt data', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('not json {')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('[1,2]')).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid values and clamps sensitivity into range', () => {
    expect(parseSettings(JSON.stringify({ sensitivity: 1.3, muted: true })).sensitivity).toBe(1.3);
    expect(parseSettings(JSON.stringify({ sensitivity: 1.3, muted: true })).muted).toBe(true);
    expect(parseSettings(JSON.stringify({ sensitivity: 99 })).sensitivity).toBe(SENSITIVITY_RANGE.max);
    expect(parseSettings(JSON.stringify({ sensitivity: -4 })).sensitivity).toBe(SENSITIVITY_RANGE.min);
    expect(parseSettings(JSON.stringify({ sensitivity: 'fast' })).sensitivity).toBe(DEFAULT_SETTINGS.sensitivity);
  });

  it('defaults to 125%: playtesting found most players, touch players especially, want sharper steering', () => {
    expect(DEFAULT_SETTINGS.sensitivity).toBe(1.25);
    expect(parseSettings(null).sensitivity).toBe(1.25);
  });

  it('is still gentler than the launch tuning that players called too twitchy (75% of its turn rate)', async () => {
    const { DEFAULT_HANDLING } = await import('../src/core/vehicle');
    expect(DEFAULT_HANDLING.turnRate * DEFAULT_SETTINGS.sensitivity).toBeCloseTo(3.4 * 0.75, 5);
  });
});

describe('settings remember city, mode and music', () => {
  it('defaults to New York, Normal, music on', () => {
    expect(DEFAULT_SETTINGS.city).toBe('new-york');
    expect(DEFAULT_SETTINGS.mode).toBe('normal');
    expect(DEFAULT_SETTINGS.music).toBe(true);
  });
  it('keeps valid choices and rejects unknown ones', () => {
    const s = parseSettings(JSON.stringify({ city: 'tokyo', mode: 'extreme', music: false }));
    expect([s.city, s.mode, s.music]).toEqual(['tokyo', 'extreme', false]);
    const bad = parseSettings(JSON.stringify({ city: 'atlantis', mode: 'godlike', music: 'loud' }));
    expect([bad.city, bad.mode, bad.music]).toEqual(['new-york', 'normal', true]);
  });
  it('offers steering presets', async () => {
    expect(STEERING_PRESETS.map((p) => p.label)).toEqual(['Gentle', 'Standard', 'Sharp']);
    expect(STEERING_PRESETS.find((p) => p.label === 'Standard')!.value).toBe(DEFAULT_SETTINGS.sensitivity);
    const values = STEERING_PRESETS.map((p) => p.value);
    expect(values).toEqual([...values].sort((a, b) => a - b));
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(SENSITIVITY_RANGE.min);
      expect(v).toBeLessThanOrEqual(SENSITIVITY_RANGE.max);
    }
  });
});

describe('upgrading saved settings from the old 100% default', () => {
  it('moves a legacy save that is still on the old default to the new default', () => {
    const legacy = JSON.stringify({ sensitivity: 1, muted: false, theme: 'night', city: 'tokyo', mode: 'hard', music: true });
    const s = parseSettings(legacy);
    expect(s.sensitivity).toBe(1.25);
    expect([s.city, s.mode]).toEqual(['tokyo', 'hard']); // everything else is kept
  });

  it('leaves legacy saves that were customised alone', () => {
    for (const v of [0.6, 0.8, 1.1, 1.3, 1.5]) expect(parseSettings(JSON.stringify({ sensitivity: v })).sensitivity).toBe(v);
  });

  it('respects a deliberate 100% chosen after the upgrade', () => {
    const upgraded = parseSettings(JSON.stringify({ sensitivity: 1, version: SETTINGS_VERSION }));
    expect(upgraded.sensitivity).toBe(1);
  });

  it('stamps the current version so the migration only ever runs once', () => {
    expect(parseSettings(null).version).toBe(SETTINGS_VERSION);
    const once = parseSettings(JSON.stringify({ sensitivity: 1 }));
    expect(parseSettings(JSON.stringify(once)).sensitivity).toBe(1.25);
    const afterUserChoice = { ...once, sensitivity: 1 };
    expect(parseSettings(JSON.stringify(afterUserChoice)).sensitivity).toBe(1);
  });
});

describe('describing a sensitivity', () => {
  it('names the three presets correctly and puts the default in the middle', async () => {
    const { describeSensitivity } = await import('../src/core/settings');
    expect(describeSensitivity(DEFAULT_SETTINGS.sensitivity)).toBe('Standard');
    expect(describeSensitivity(1)).toBe('Gentle');
    expect(describeSensitivity(0.6)).toBe('Gentle');
    expect(describeSensitivity(1.5)).toBe('Sharp');
    for (const p of STEERING_PRESETS) expect(describeSensitivity(p.value)).toBe(p.label);
  });
});
