import { describe, expect, it } from 'vitest';
import { pickKey, rememberedBook, withPick, PICK_KEEP_MS } from '../src/lib/stripe-book-picks.js';
import { UNION_METADATA_KEYS } from '../src/lib/merge-state.js';
const tap = { amount: 22, currency: 'cad', description: '' };

describe('remembering the book picked for a kind of payment', () => {
  it('treats the same amount, currency and note as the same kind of payment', () => {
    expect(pickKey(tap)).toBe(pickKey({ amount: 22.0, currency: 'CAD', description: '  ' }));
    expect(pickKey({ ...tap, description: 'Fair  TABLE' })).toBe(pickKey({ ...tap, description: 'fair table' }));
    expect(pickKey({ ...tap, amount: 44 })).not.toBe(pickKey(tap));
    expect(pickKey({ ...tap, currency: 'USD' })).not.toBe(pickKey(tap));
    expect(pickKey({ ...tap, amount: 0 })).toBe('');
  });

  it('offers the latest pick, and a new pick replaces the old one', () => {
    let list = withPick([], tap, 'meadow', 1000);
    expect(rememberedBook(list, tap)).toBe('meadow');
    list = withPick(list, tap, 'harbour', 2000);
    expect(rememberedBook(list, tap)).toBe('harbour');
    expect(list).toHaveLength(1);
    expect(rememberedBook(list, { ...tap, amount: 44 })).toBe('');
  });

  it('takes the latest pick when two devices’ lists are merged', () => {
    const laptop = withPick([], tap, 'meadow', 1000);
    const phone = withPick([], tap, 'harbour', 2000);
    expect(rememberedBook([...new Set([...laptop, ...phone])], tap)).toBe('harbour');
  });

  it('returns the same list when nothing changes, and drops old picks', () => {
    const list = withPick([], tap, 'meadow', 1000);
    expect(withPick(list, tap, 'meadow', 5000)).toBe(list);
    const later = withPick(list, { ...tap, amount: 30 }, 'ember', 1000 + PICK_KEEP_MS + 1);
    expect(rememberedBook(later, tap)).toBe('');
  });

  it('keeps a note with a bar in it from breaking the list', () => {
    const odd = { ...tap, description: 'a|b' };
    const list = withPick([], odd, 'meadow', 1000);
    expect(rememberedBook(list, odd)).toBe('meadow');
  });

  it('is merged across devices as a union', () => {
    expect(UNION_METADATA_KEYS.has('stripeBookPicks')).toBe(true);
  });
});
