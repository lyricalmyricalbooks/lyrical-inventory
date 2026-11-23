// A payment set aside in the Stripe worklist stays set aside on every device.
import { describe, it, expect } from 'vitest';
import { dismissalState, withDismissals, mergeDismissedMap, DISMISSAL_KEEP_MS } from '../src/lib/stripe-dismissals.js';
import { mergeMetadata } from '../src/lib/merge-state.js';

const NOW = Date.parse('2026-11-23T12:00:00Z');

describe('the shared list of dismissed Stripe payments', () => {
  it('adds a dismissal once and records an undo as a later decision', () => {
    const one = withDismissals([], [{ id: 'ch_1', dismissed: true }], NOW);
    expect(one).toEqual([`d|ch_1|${NOW}`]);
    // Dismissing again changes nothing, and returns the very same list.
    expect(withDismissals(one, [{ id: 'ch_1', dismissed: true }], NOW + 1)).toBe(one);
    const back = withDismissals(one, [{ id: 'ch_1', dismissed: false }], NOW + 5);
    expect([...dismissalState(back).dismissed]).toEqual([]);
    expect([...dismissalState(back).undone]).toEqual(['ch_1']);
  });

  it('lets the latest decision win, whatever order the entries arrive in', () => {
    const entries = [`u|ch_1|${NOW + 10}`, `d|ch_1|${NOW}`, `d|ch_2|${NOW}`];
    expect([...dismissalState(entries).dismissed]).toEqual(['ch_2']);
  });

  it('ignores entries that are not decisions', () => {
    expect(dismissalState(['nonsense', 'x|ch_1|1', 'd|bad id|1', null]).dismissed.size).toBe(0);
  });

  it('drops decisions older than the worklist can reach', () => {
    const old = `d|ch_old|${NOW - DISMISSAL_KEEP_MS - 1}`;
    expect(withDismissals([old, `d|ch_new|${NOW}`], [], NOW)).toEqual([`d|ch_new|${NOW}`]);
  });

  it('keeps what both devices decided when their copies are merged', () => {
    // The laptop sets aside ch_1 while the phone sets aside ch_2.
    const base = { stripeDismissals: [] };
    const laptop = { stripeDismissals: withDismissals([], [{ id: 'ch_1', dismissed: true }], NOW) };
    const phone = { stripeDismissals: withDismissals([], [{ id: 'ch_2', dismissed: true }], NOW + 1) };
    const { value } = mergeMetadata(base, laptop, phone);
    expect([...dismissalState(value.stripeDismissals).dismissed].sort()).toEqual(['ch_1', 'ch_2']);
  });

  it('keeps an undo made on one device when the other still holds the old dismissal', () => {
    const dismissed = withDismissals([], [{ id: 'ch_1', dismissed: true }], NOW);
    const undone = withDismissals(dismissed, [{ id: 'ch_1', dismissed: false }], NOW + 60000);
    const { value } = mergeMetadata({ stripeDismissals: dismissed }, { stripeDismissals: dismissed }, { stripeDismissals: undone });
    expect(dismissalState(value.stripeDismissals).dismissed.has('ch_1')).toBe(false);
  });
});

describe('this device’s memory brought in line with the shared list', () => {
  it('adds payments set aside elsewhere and drops ones brought back elsewhere', () => {
    const entries = [`d|ch_elsewhere|${NOW}`, `u|ch_mine|${NOW}`];
    expect(mergeDismissedMap({ ch_mine: true, ch_kept: true }, entries)).toEqual({ ch_kept: true, ch_elsewhere: true });
  });
});
