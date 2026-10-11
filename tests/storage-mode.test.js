import { describe, it, expect } from 'vitest';
import { adoptDecision, movedElsewhere } from '../src/lib/storage-mode.js';

describe('adoptDecision', () => {
  const base = { publisher: true, global: true, flagged: false };

  it('moves a book added after the move to the new storage', () => {
    expect(adoptDecision({ ...base, hasFirestoreData: false })).toBe('adopt');
  });

  it('leaves a book that has a copy in both storages alone', () => {
    expect(adoptDecision({ ...base, hasFirestoreData: true })).toBe('kept');
  });

  it('waits when the new storage could not be checked', () => {
    expect(adoptDecision({ ...base, hasFirestoreData: null })).toBe('unknown');
    expect(adoptDecision({ ...base })).toBe('unknown');
  });

  it('does nothing for books already moved, authors, or before the app moved', () => {
    expect(adoptDecision({ ...base, flagged: true, hasFirestoreData: false })).toBe('skip');
    expect(adoptDecision({ ...base, publisher: false, hasFirestoreData: false })).toBe('skip');
    expect(adoptDecision({ ...base, global: false, hasFirestoreData: false })).toBe('skip');
  });
});

describe('movedElsewhere', () => {
  it('notices another device moved the book', () => {
    expect(movedElsewhere({ global: true, flaggedHere: false, serverFlags: { fs_mode_injured: true }, bookId: 'injured' })).toBe(true);
  });

  it('is false when nothing changed or the flags could not be read', () => {
    expect(movedElsewhere({ global: true, flaggedHere: false, serverFlags: {}, bookId: 'injured' })).toBe(false);
    expect(movedElsewhere({ global: true, flaggedHere: false, serverFlags: null, bookId: 'injured' })).toBe(false);
    expect(movedElsewhere({ global: true, flaggedHere: true, serverFlags: { fs_mode_injured: true }, bookId: 'injured' })).toBe(false);
    expect(movedElsewhere({ global: false, flaggedHere: false, serverFlags: { fs_mode_injured: true }, bookId: 'injured' })).toBe(false);
  });
});
