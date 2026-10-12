import { describe, it, expect } from 'vitest';
import { TextWidthCache } from '../src/core/textWidth';

describe('TextWidthCache (measure each label once)', () => {
  it('measures a string a single time, however often or at whatever size it is drawn', () => {
    let calls = 0;
    const cache = new TextWidthCache((text) => { calls++; return text.length * 60; }, 100);
    for (let i = 0; i < 500; i++) cache.width('Opera House', 11 + (i % 7) * 0.37);
    expect(calls).toBe(1);
  });

  it('scales the reference measurement to the requested font size (width is linear in size)', () => {
    const cache = new TextWidthCache((text) => text.length * 60, 100);
    expect(cache.width('abcd', 100)).toBe(240);
    expect(cache.width('abcd', 10)).toBeCloseTo(24);
    expect(cache.width('abcd', 22)).toBeCloseTo(52.8);
  });

  it('keeps different strings apart', () => {
    const cache = new TextWidthCache((text) => text.length * 10, 100);
    expect(cache.width('aa', 100)).toBe(20);
    expect(cache.width('aaaa', 100)).toBe(40);
  });

  it('can be cleared, so widths are re-measured once a web font has loaded', () => {
    let calls = 0;
    let scale = 1;
    const cache = new TextWidthCache((text) => { calls++; return text.length * 10 * scale; }, 100);
    expect(cache.width('abc', 100)).toBe(30);
    scale = 2;
    expect(cache.width('abc', 100)).toBe(30);
    cache.clear();
    expect(cache.width('abc', 100)).toBe(60);
    expect(calls).toBe(2);
  });
});
