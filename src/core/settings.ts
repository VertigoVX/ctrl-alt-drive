import { clamp } from './math';

export const THEME_IDS = ['night', 'day', 'neon', 'blueprint', 'vintage'] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export interface Settings {
  /** Multiplier on the (already gentle) default steering rate. */
  sensitivity: number;
  muted: boolean;
  theme: ThemeId;
}

export const SENSITIVITY_RANGE = { min: 0.5, max: 1.5, step: 0.05 };

export const DEFAULT_SETTINGS: Settings = { sensitivity: 1, muted: false, theme: 'night' };

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
  };
}
