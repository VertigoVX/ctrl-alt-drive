import { CITY_IDS, type CityId } from './cities';
import { clamp } from './math';
import { MODE_IDS, type ModeId } from './modes';

export const THEME_IDS = ['night', 'day', 'neon', 'blueprint', 'vintage'] as const;
export type ThemeId = (typeof THEME_IDS)[number];

/** Bump when a default changes in a way saved settings need to follow. */
export const SETTINGS_VERSION = 2;

export interface Settings {
  /** Which generation of defaults this save was made under (see SETTINGS_VERSION). */
  version: number;
  /** Multiplier on the (already gentle) default steering rate. */
  sensitivity: number;
  muted: boolean;
  theme: ThemeId;
  city: CityId;
  mode: ModeId;
  music: boolean;
}

export const SENSITIVITY_RANGE = { min: 0.5, max: 1.5, step: 0.05 };

export const DEFAULT_SETTINGS: Settings = { version: SETTINGS_VERSION, sensitivity: 1.25, muted: false, theme: 'night', city: 'new-york', mode: 'normal', music: true };

/** One-tap choices shown on the title screen; the slider in Settings allows anything in range. */
export const STEERING_PRESETS = [
  { label: 'Gentle', value: 1 },
  { label: 'Standard', value: 1.25 },
  { label: 'Sharp', value: 1.5 },
] as const;

/** The word shown under the slider. Bands are centred on the presets. */
export function describeSensitivity(v: number): 'Gentle' | 'Standard' | 'Sharp' {
  if (v < 1.1) return 'Gentle';
  if (v <= 1.35) return 'Standard';
  return 'Sharp';
}

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
  const stored = typeof d.version === 'number' ? d.version : 1;
  let sensitivity =
    typeof d.sensitivity === 'number' && Number.isFinite(d.sensitivity)
      ? clamp(d.sensitivity, SENSITIVITY_RANGE.min, SENSITIVITY_RANGE.max)
      : DEFAULT_SETTINGS.sensitivity;
  // v1 → v2: the default moved from 100% to 125%. Anyone still sitting exactly on the old
  // default almost certainly never touched it, so bring them along. Customised values stay.
  if (stored < 2 && sensitivity === 1) sensitivity = DEFAULT_SETTINGS.sensitivity;
  return {
    version: SETTINGS_VERSION,
    sensitivity,
    muted: typeof d.muted === 'boolean' ? d.muted : DEFAULT_SETTINGS.muted,
    theme: THEME_IDS.includes(d.theme as ThemeId) ? (d.theme as ThemeId) : DEFAULT_SETTINGS.theme,
    city: CITY_IDS.includes(d.city as CityId) ? (d.city as CityId) : DEFAULT_SETTINGS.city,
    mode: MODE_IDS.includes(d.mode as ModeId) ? (d.mode as ModeId) : DEFAULT_SETTINGS.mode,
    music: typeof d.music === 'boolean' ? d.music : DEFAULT_SETTINGS.music,
  };
}
