import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readStoredList } from '../src/lib/stored-list.js';

const KEY = 'lm-test-stored-list';

describe('readStoredList', () => {
  beforeEach(() => localStorage.removeItem(KEY));

  it('returns the saved list', () => {
    localStorage.setItem(KEY, JSON.stringify([{ sheetsId: 'a' }, 2]));
    expect(readStoredList(KEY)).toEqual([{ sheetsId: 'a' }, 2]);
  });

  it('reads nothing saved as an empty list', () => {
    expect(readStoredList(KEY)).toEqual([]);
  });

  it('reads a corrupt or truncated value as an empty list', () => {
    localStorage.setItem(KEY, '[{"sheetsId":');
    expect(readStoredList(KEY)).toEqual([]);
  });

  it('reads a value that is not a list as an empty list', () => {
    for (const saved of ['null', '{}', '"text"', '3']) {
      localStorage.setItem(KEY, saved);
      expect(readStoredList(KEY)).toEqual([]);
    }
  });

  it('reads blocked storage as an empty list', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    try {
      expect(readStoredList(KEY)).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });
});
