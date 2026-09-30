import { describe, it, expect } from 'vitest';
import {
  CATALOG, CATEGORIES, defaultProfile, parseProfile, buy, equip, addEarnings, availableThemes, itemById,
} from '../src/core/shop';

describe('catalog', () => {
  it('has a free default in every category', () => {
    for (const c of CATEGORIES) {
      const free = CATALOG.filter((i) => i.category === c && i.price === 0);
      expect(free).toHaveLength(1);
    }
  });

  it('is purely cosmetic: items carry no gameplay stats', () => {
    const allowed = ['id', 'category', 'name', 'price', 'blurb'];
    for (const item of CATALOG) expect(Object.keys(item).every((k) => allowed.includes(k))).toBe(true);
  });

  it('has unique ids and sensible prices', () => {
    expect(new Set(CATALOG.map((i) => i.id)).size).toBe(CATALOG.length);
    for (const i of CATALOG) {
      expect(Number.isInteger(i.price)).toBe(true);
      expect(i.price).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('profile', () => {
  it('starts with an empty wallet and the free defaults owned and equipped', () => {
    const p = defaultProfile();
    expect(p.cash).toBe(0);
    for (const c of CATEGORIES) {
      expect(p.owned).toContain(p.equipped[c]);
      expect(itemById(p.equipped[c])!.price).toBe(0);
    }
  });

  it('banks earnings, ignoring junk amounts', () => {
    let p = addEarnings(defaultProfile(), 240);
    p = addEarnings(p, 99.6);
    p = addEarnings(p, -500);
    p = addEarnings(p, Number.NaN);
    expect(p.cash).toBe(340);
    expect(p.lifetime).toBe(340);
  });

  it('buys an item it can afford, deducts the price and equips it', () => {
    const p = addEarnings(defaultProfile(), 1000);
    const r = buy(p, 'paint-midnight');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.profile.cash).toBe(1000 - itemById('paint-midnight')!.price);
    expect(r.profile.owned).toContain('paint-midnight');
    expect(r.profile.equipped.paint).toBe('paint-midnight');
    expect(r.profile.lifetime).toBe(1000); // spending doesn't reduce lifetime earnings
  });

  it('refuses when the wallet is short, without changing anything', () => {
    const p = addEarnings(defaultProfile(), 100);
    const r = buy(p, 'paint-holo');
    expect(r).toEqual({ ok: false, reason: 'insufficient', short: itemById('paint-holo')!.price - 100 });
    expect(p.cash).toBe(100);
  });

  it('refuses to sell the same thing twice, or things that do not exist', () => {
    const p = addEarnings(defaultProfile(), 5000);
    const r = buy(p, 'roof-star');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(buy(r.profile, 'roof-star')).toEqual({ ok: false, reason: 'owned' });
    expect(buy(p, 'rocket-launcher')).toEqual({ ok: false, reason: 'unknown' });
  });

  it('only equips things you own, one per category', () => {
    const p = defaultProfile();
    expect(equip(p, 'paint-chrome')).toBe(p);
    const bought = buy(addEarnings(p, 5000), 'paint-chrome');
    if (!bought.ok) throw new Error('should buy');
    const back = equip(bought.profile, 'paint-classic');
    expect(back.equipped.paint).toBe('paint-classic');
    expect(back.equipped.roof).toBe(p.equipped.roof);
  });

  it('never mutates the profile it was given', () => {
    const p = addEarnings(defaultProfile(), 5000);
    const snapshot = JSON.stringify(p);
    buy(p, 'horn-bell');
    equip(p, 'horn-classic');
    addEarnings(p, 10);
    expect(JSON.stringify(p)).toBe(snapshot);
  });
});

describe('profile persistence', () => {
  it('round-trips through JSON', () => {
    const r = buy(addEarnings(defaultProfile(), 3000), 'map-neon');
    if (!r.ok) throw new Error('should buy');
    expect(parseProfile(JSON.stringify(r.profile))).toEqual(r.profile);
  });

  it('recovers from missing, corrupt or tampered data', () => {
    expect(parseProfile(null)).toEqual(defaultProfile());
    expect(parseProfile('{{{')).toEqual(defaultProfile());
    const tampered = parseProfile(JSON.stringify({
      cash: -50, lifetime: 'lots', owned: ['paint-holo', 'made-up-item'], equipped: { paint: 'paint-chrome', horn: 42 },
    }));
    expect(tampered.cash).toBe(0);
    expect(tampered.owned).toContain('paint-holo');
    expect(tampered.owned).not.toContain('made-up-item');
    // Can't equip something the save doesn't own; bad slots fall back to defaults.
    expect(tampered.equipped.paint).toBe(defaultProfile().equipped.paint);
    expect(tampered.equipped.horn).toBe(defaultProfile().equipped.horn);
    // Defaults are always owned even if the save forgot them.
    for (const c of CATEGORIES) expect(tampered.owned).toContain(defaultProfile().equipped[c]);
  });
});

describe('map styles', () => {
  it('unlock extra themes for the map toggle', () => {
    expect(availableThemes(defaultProfile())).toEqual(['night', 'day']);
    const r = buy(addEarnings(defaultProfile(), 9000), 'map-blueprint');
    if (!r.ok) throw new Error('should buy');
    expect(availableThemes(r.profile)).toEqual(['night', 'day', 'blueprint']);
  });
});
