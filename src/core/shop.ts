import type { ThemeId } from './settings';

export const CATEGORIES = ['paint', 'roof', 'horn', 'map'] as const;
export type Category = (typeof CATEGORIES)[number];

/**
 * Everything in the garage is cosmetic. Items deliberately carry no stats: how an item
 * looks or sounds is defined in the render/audio layers, keyed by id.
 */
export interface ShopItem {
  id: string;
  category: Category;
  name: string;
  price: number;
  blurb: string;
}

export const CATALOG: readonly ShopItem[] = [
  { id: 'paint-classic', category: 'paint', name: 'Classic Yellow', price: 0, blurb: 'The one everyone waves at.' },
  { id: 'paint-checker', category: 'paint', name: 'Checker Cab', price: 600, blurb: 'A checkerboard band down each side.' },
  { id: 'paint-midnight', category: 'paint', name: 'Midnight', price: 900, blurb: 'Gloss black with yellow trim.' },
  { id: 'paint-mint', category: 'paint', name: 'Mint', price: 900, blurb: 'Fresh, calm, and fast enough.' },
  { id: 'paint-sunset', category: 'paint', name: 'Sunset', price: 1500, blurb: 'Orange fading into pink.' },
  { id: 'paint-racing', category: 'paint', name: 'Racing Stripes', price: 2000, blurb: 'Blue with twin white stripes.' },
  { id: 'paint-chrome', category: 'paint', name: 'Chrome', price: 3500, blurb: 'Polished until the robotaxis can see themselves.' },
  { id: 'paint-holo', category: 'paint', name: 'Holographic', price: 6000, blurb: 'Shifts colour as you drive.' },

  { id: 'roof-taxi', category: 'roof', name: 'Taxi Light', price: 0, blurb: 'Lit when you are free for hire.' },
  { id: 'roof-star', category: 'roof', name: 'Star', price: 500, blurb: 'Five-star service, advertised.' },
  { id: 'roof-heart', category: 'roof', name: 'Heart', price: 800, blurb: 'For drivers who love the job.' },
  { id: 'roof-bolt', category: 'roof', name: 'Lightning', price: 1200, blurb: 'Looks fast. Is exactly as fast.' },
  { id: 'roof-crown', category: 'roof', name: 'Crown', price: 1800, blurb: 'Royalty of the rank.' },
  { id: 'roof-disco', category: 'roof', name: 'Disco', price: 4000, blurb: 'A light that never picks one colour.' },

  { id: 'horn-classic', category: 'horn', name: 'City Horn', price: 0, blurb: 'A short, honest honk.' },
  { id: 'horn-twotone', category: 'horn', name: 'Two-tone', price: 400, blurb: 'European and slightly dramatic.' },
  { id: 'horn-bell', category: 'horn', name: 'Bike Bell', price: 700, blurb: 'Ring ring.' },
  { id: 'horn-chiptune', category: 'horn', name: 'Chiptune', price: 1500, blurb: 'Eight bits of attitude.' },
  { id: 'horn-air', category: 'horn', name: 'Air Horn', price: 2500, blurb: 'Rattles the lidar.' },

  { id: 'map-standard', category: 'map', name: 'Standard', price: 0, blurb: 'Day and night, like the map app.' },
  { id: 'map-vintage', category: 'map', name: 'Vintage', price: 2000, blurb: 'An old paper street atlas.' },
  { id: 'map-blueprint', category: 'map', name: 'Blueprint', price: 2500, blurb: 'The city as the planners drew it.' },
  { id: 'map-neon', category: 'map', name: 'Neon Noir', price: 3000, blurb: 'Rain-slick streets and neon edges.' },
];

const MAP_THEMES: Record<string, ThemeId[]> = {
  'map-standard': ['night', 'day'],
  'map-vintage': ['vintage'],
  'map-blueprint': ['blueprint'],
  'map-neon': ['neon'],
};

export const itemById = (id: string): ShopItem | undefined => CATALOG.find((i) => i.id === id);

export interface Profile {
  cash: number;
  /** Total ever earned — for bragging rights, never spent. */
  lifetime: number;
  owned: string[];
  equipped: Record<Category, string>;
}

export type BuyResult =
  | { ok: true; profile: Profile }
  | { ok: false; reason: 'owned' | 'unknown' }
  | { ok: false; reason: 'insufficient'; short: number };

const defaults = () =>
  Object.fromEntries(CATEGORIES.map((c) => [c, CATALOG.find((i) => i.category === c && i.price === 0)!.id])) as Record<
    Category,
    string
  >;

export function defaultProfile(): Profile {
  const equipped = defaults();
  return { cash: 0, lifetime: 0, owned: Object.values(equipped), equipped };
}

export function addEarnings(p: Profile, amount: number): Profile {
  if (!Number.isFinite(amount) || amount <= 0) return p;
  const n = Math.round(amount);
  return { ...p, cash: p.cash + n, lifetime: p.lifetime + n };
}

export function buy(p: Profile, id: string): BuyResult {
  const item = itemById(id);
  if (!item) return { ok: false, reason: 'unknown' };
  if (p.owned.includes(id)) return { ok: false, reason: 'owned' };
  if (p.cash < item.price) return { ok: false, reason: 'insufficient', short: item.price - p.cash };
  return {
    ok: true,
    profile: {
      ...p,
      cash: p.cash - item.price,
      owned: [...p.owned, id],
      equipped: { ...p.equipped, [item.category]: id },
    },
  };
}

export function equip(p: Profile, id: string): Profile {
  const item = itemById(id);
  if (!item || !p.owned.includes(id)) return p;
  return { ...p, equipped: { ...p.equipped, [item.category]: id } };
}

export function availableThemes(p: Profile): ThemeId[] {
  return CATALOG.filter((i) => i.category === 'map' && p.owned.includes(i.id)).flatMap((i) => MAP_THEMES[i.id] ?? []);
}

const nonNegInt = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : 0);

export function parseProfile(raw: string | null): Profile {
  let data: unknown;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }
  const base = defaultProfile();
  if (!data || typeof data !== 'object' || Array.isArray(data)) return base;
  const d = data as Record<string, unknown>;
  const owned = new Set(base.owned);
  if (Array.isArray(d.owned)) for (const id of d.owned) if (typeof id === 'string' && itemById(id)) owned.add(id);
  const equipped = { ...base.equipped };
  const e = d.equipped && typeof d.equipped === 'object' ? (d.equipped as Record<string, unknown>) : {};
  for (const c of CATEGORIES) {
    const id = e[c];
    if (typeof id === 'string' && owned.has(id) && itemById(id)?.category === c) equipped[c] = id;
  }
  // Keep catalogue order so saves are stable.
  return {
    cash: nonNegInt(d.cash),
    lifetime: nonNegInt(d.lifetime),
    owned: CATALOG.map((i) => i.id).filter((id) => owned.has(id)),
    equipped,
  };
}
