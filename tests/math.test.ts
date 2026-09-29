import { describe, it, expect } from 'vitest';
import { vec, add, sub, scale, len, dist, norm, angleOf, fromAngle, angleDiff, clamp, lerp } from '../src/core/math';
import { createRng } from '../src/core/rng';

describe('vector math', () => {
  it('adds, subtracts and scales', () => {
    expect(add(vec(1, 2), vec(3, 4))).toEqual({ x: 4, y: 6 });
    expect(sub(vec(5, 5), vec(2, 3))).toEqual({ x: 3, y: 2 });
    expect(scale(vec(2, -1), 3)).toEqual({ x: 6, y: -3 });
  });

  it('measures length and distance', () => {
    expect(len(vec(3, 4))).toBe(5);
    expect(dist(vec(0, 0), vec(6, 8))).toBe(10);
  });

  it('normalises, and leaves the zero vector alone', () => {
    const n = norm(vec(10, 0));
    expect(n.x).toBeCloseTo(1);
    expect(norm(vec(0, 0))).toEqual({ x: 0, y: 0 });
  });

  it('round-trips angles', () => {
    const v = fromAngle(Math.PI / 2);
    expect(v.x).toBeCloseTo(0);
    expect(v.y).toBeCloseTo(1);
    expect(angleOf(vec(0, 1))).toBeCloseTo(Math.PI / 2);
  });

  it('computes the shortest signed angle difference', () => {
    expect(angleDiff(0.1, -0.1)).toBeCloseTo(-0.2);
    expect(angleDiff(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2);
  });

  it('clamps and lerps', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(lerp(0, 10, 0.25)).toBe(2.5);
  });
});

describe('seeded rng', () => {
  it('is deterministic for a given seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 5 }, () => a.next());
    const seqB = Array.from({ length: 5 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('differs between seeds', () => {
    expect(createRng(1).next()).not.toEqual(createRng(2).next());
  });

  it('produces values in [0, 1) and ints in range', () => {
    const r = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      const n = r.int(3, 6);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(6);
    }
  });

  it('picks from arrays', () => {
    const r = createRng(3);
    const items = ['a', 'b', 'c'];
    for (let i = 0; i < 50; i++) expect(items).toContain(r.pick(items));
  });
});
