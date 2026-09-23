import { describe, it, expect } from 'vitest';
import { plainChange, plainChanges, parseBuildDate, relativeWhen, dayHeading, kindLabel } from '../src/lib/whats-new.js';

// The What's New list is read by the shop owner, not a developer, so every
// note has to make sense without knowing the code.
describe('plainChange', () => {
  it('uses the hand-written note for a known pull request', () => {
    const c = plainChange({ message: 'Move the menu-alerts switch into the sidebar account menu (#905)\n\nCo-authored-by: Claude <noreply@anthropic.com>', date: '2026-09-23T00:37:00Z', fullSha: 'abc' });
    expect(c.title).toBe('The "Hide menu alerts" switch has moved');
    expect(c.tryIt).toMatch(/bottom of the side menu/);
    expect(c.kind).toBe('improved');
  });

  it('reads "For you:" and "Try it:" lines from a commit body and drops trailers', () => {
    const c = plainChange({ message: 'feat(pos): add tip jar (#999)\n\nAdds TipJar component.\nFor you: Customers can now add a tip at the till.\nTry it: Open Event POS and tap "Add tip".\n\nCo-Authored-By: Someone <x@y.z>\nClaude-Session: https://example.test' });
    expect(c).toMatchObject({ kind: 'new', title: 'Add tip jar', detail: 'Customers can now add a tip at the till.', tryIt: 'Open Event POS and tap "Add tip".' });
  });

  it('cleans developer prefixes, emoji and PR numbers from a bare title', () => {
    expect(plainChange({ message: 'fix: stop double toast (#1234)' })).toMatchObject({ kind: 'fixed', title: 'Stop double toast', detail: '', tryIt: '' });
    expect(plainChange({ message: 'perf: speed up history (#1235)' }).kind).toBe('faster');
  });

  it('hides internal work, merges and skipped pull requests', () => {
    expect(plainChange({ message: 'test: cover payouts (#1300)' })).toBeNull();
    expect(plainChange({ message: 'refactor(main): split file' })).toBeNull();
    expect(plainChange({ message: "Merge branch 'main' into x" })).toBeNull();
    expect(plainChange({ message: 'Behavioural tests for payouts, sales and the save path (#900)' })).toBeNull();
  });

  it('keeps internal-typed work when its author wrote a note for the owner', () => {
    expect(plainChange({ message: 'chore: bump pdf lib (#1301)\n\nFor you: PDF receipts open faster.' })).toMatchObject({ detail: 'PDF receipts open faster.' });
  });

  it('caps the list and tolerates junk', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ message: `fix: thing ${i} (#${5000 + i})` }));
    expect(plainChanges(many, 8)).toHaveLength(8);
    expect(plainChanges(null)).toEqual([]);
    expect(plainChange({})).toBeNull();
    expect(kindLabel('weird')).toBe('Improved');
  });
});

describe('build-date wording', () => {
  const now = new Date(2026, 8, 23, 15, 0, 0);
  it('parses both the ISO stamp and the older space-separated one', () => {
    expect(parseBuildDate('2026-09-22T20:37:22-04:00')).toBeInstanceOf(Date);
    expect(parseBuildDate('2026-09-22 20:37:22')).toBeInstanceOf(Date);
    expect(parseBuildDate('Unknown')).toBeNull();
    expect(parseBuildDate(undefined)).toBeNull();
  });
  it('says when in words', () => {
    expect(relativeWhen(new Date(2026, 8, 23, 14, 59, 30), now)).toBe('just now');
    expect(relativeWhen(new Date(2026, 8, 23, 14, 20), now)).toBe('40 minutes ago');
    expect(relativeWhen(new Date(2026, 8, 23, 12, 0), now)).toBe('3 hours ago');
    expect(relativeWhen(new Date(2026, 8, 22, 20, 0), now)).toBe('yesterday');
    expect(relativeWhen(new Date(2026, 8, 19, 20, 0), now)).toBe('4 days ago');
    expect(relativeWhen(new Date(2026, 7, 2), now)).toMatch(/^on /);
    expect(dayHeading(new Date(2026, 8, 23, 1), now)).toBe('Today');
    expect(dayHeading(new Date(2026, 8, 22, 1), now)).toBe('Yesterday');
  });
});
