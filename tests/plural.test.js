import { describe, it, expect } from 'vitest';
import { plural } from '../src/lib/plural.js';

describe('plural', () => {
  it('picks the singular only for exactly one', () => {
    expect(plural(1, 'copy', 'copies')).toBe('copy');
    expect(plural(0, 'copy', 'copies')).toBe('copies');
    expect(plural(2, 'copy', 'copies')).toBe('copies');
  });

  it('treats non-numbers and fractions as many, like the inline helpers it replaced', () => {
    expect(plural('1', 'copy', 'copies')).toBe('copies');
    expect(plural(1.5, 'copy', 'copies')).toBe('copies');
    expect(plural(undefined, 'copy', 'copies')).toBe('copies');
  });
});
