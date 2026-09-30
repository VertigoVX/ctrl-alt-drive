import { CITY_IDS, type CityId } from './cities';
import { clamp } from './math';
import { MODE_IDS, type ModeId } from './modes';

export const THEME_IDS = ['night', 'day', 'neon', 'blueprint', 'vintage'] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export interface Settings {
  /** Multiplier on the (already gentle) default steering rate. */
  sensitivity: number;
  muted: boolean;
  theme: ThemeId;
  city: CityId;
  mode: ModeId;
  music: boolean;
}

export const SENSITIVITY_RANGE = { min: 0.5, max: 1.5, step: 0.05 };

export const DEFAULT_SETTINGS: Settings = { sensitivity: 1, muted: false, theme: 'night', city: 'new-york', mode: 'normal', music: true };

/** One-tap choices shown on the title screen; the slider in Settings allows anything in range. */
export const STEERING_PRESETS = [
  { label: 'Gentle', value: 0.75 },
  { label: 'Standard', value: 1 },
  { label: 'Sharp', value: 1.3 },
] as const;

/** Parse whatever is in storage; anything missing or malformed falls back to defaults. */
export function parseSettings(raw: string | null): Settings {
  let data: unknown;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ...DEFAULT_SETTINGS };
  const d = data as Record<string, unknown>;
  return {
    sensitivity:
      typeof d.sensitivity === 'number' && Number.isFinite(d.sensitivity)
        ? clamp(d.sensitivity, SENSITIVITY_RANGE.min, SENSITIVITY_RANGE.max)
        : DEFAULT_SETTINGS.sensitivity,
    muted: typeof d.muted === 'boolean' ? d.muted : DEFAULT_SETTINGS.muted,
    theme: THEME_IDS.includes(d.theme as ThemeId) ? (d.theme as ThemeId) : DEFAULT_SETTINGS.theme,
    city: CITY_IDS.includes(d.city as CityId) ? (d.city as CityId) : DEFAULT_SETTINGS.city,
    mode: MODE_IDS.includes(d.mode as ModeId) ? (d.mode as ModeId) : DEFAULT_SETTINGS.mode,
    music: typeof d.music === 'boolean' ? d.music : DEFAULT_SETTINGS.music,
  };
}
