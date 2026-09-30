import { describe, it, expect } from 'vitest';
import { DEFAULT_HANDLING } from '../src/core/vehicle';
import { inputFromStick, STICK_GAIN } from '../src/core/input';
import { createGame, updateGame, GAME_RULES } from '../src/core/game';
import { parseSettings, DEFAULT_SETTINGS, SENSITIVITY_RANGE } from '../src/core/settings';

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

  it('defaults to 100% (the new, gentler baseline)', () => {
    expect(DEFAULT_SETTINGS.sensitivity).toBe(1);
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
    const { STEERING_PRESETS } = await import('../src/core/settings');
    expect(STEERING_PRESETS.map((p) => p.label)).toEqual(['Gentle', 'Standard', 'Sharp']);
    expect(STEERING_PRESETS.find((p) => p.label === 'Standard')!.value).toBe(1);
  });
});
