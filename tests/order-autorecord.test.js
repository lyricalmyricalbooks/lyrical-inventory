// Which new website orders may be recorded without anyone pressing a button,
// and what the publisher is told afterwards. Pure rules from lib/order-watch.js.
import { describe, it, expect } from 'vitest';
import { autoRecordBlocker, describeOrderOutcomes, reviewReasonText } from '../src/lib/order-watch.js';

const NOW = Date.parse('2026-09-23T12:00:00Z');
const order = (attributes = {}) => ({ id: 'AAAA-1', attributes: { status: 'completed', created_at: '2026-09-23T10:00:00Z', ...attributes } });
const exact = { autoSafe: true, confidence: 'exact', presetBookId: 'hound', unmatchedTitles: [] };

describe('which orders may be recorded unattended', () => {
  it('records a fresh order that names one book outright', () => {
    expect(autoRecordBlocker(order(), exact, { now: NOW })).toBe('');
  });

  it('holds a box with two different titles', () => {
    expect(autoRecordBlocker(order(), { autoSafe: false, confidence: 'mixed', presetBookId: 'hound' }, { now: NOW })).toBe('mixed');
  });

  it('holds an order with something not in the catalogue', () => {
    expect(autoRecordBlocker(order(), { autoSafe: false, confidence: 'partial', presetBookId: 'hound', unmatchedTitles: ['Tote bag'] }, { now: NOW })).toBe('unmatched');
    expect(autoRecordBlocker(order(), { autoSafe: false, confidence: 'none', presetBookId: '' }, { now: NOW })).toBe('unmatched');
  });

  it('holds an order whose book was only guessed from the price', () => {
    expect(autoRecordBlocker(order(), { autoSafe: false, confidence: 'partial', presetBookId: 'hound', unmatchedTitles: [] }, { now: NOW })).toBe('guessed');
  });

  it('never takes stock for a refunded order, however clear it is', () => {
    expect(autoRecordBlocker(order({ status: 'refunded' }), exact, { now: NOW })).toBe('refunded');
  });

  it('holds an order more than a month old — likely entered by hand already', () => {
    expect(autoRecordBlocker(order({ created_at: '2026-08-01T10:00:00Z' }), exact, { now: NOW })).toBe('too-old');
  });

  it('does not hold an order just because the storefront sent no date', () => {
    expect(autoRecordBlocker(order({ created_at: '' }), exact, { now: NOW })).toBe('');
  });

  it('has plain words for every reason, and a fallback', () => {
    ['mixed', 'unmatched', 'guessed', 'refunded', 'too-old', 'failed', 'something-new'].forEach(reason => {
      expect(reviewReasonText(reason)).toMatch(/\w/);
    });
  });
});

describe('what the publisher is told', () => {
  const recorded = (extra = {}) => ({
    num: '#AAAA-1', customer: 'Dana', outcome: 'recorded',
    qty: 1, bookTitle: 'Altrove', stockBefore: 10, stockLeft: 9, threshold: 3, ...extra,
  });

  it('names the buyer, the book and what is left', () => {
    const said = describeOrderOutcomes([recorded()]);
    expect(said.title).toBe('New order recorded');
    expect(said.detail).toBe('Dana bought 1 × Altrove (#AAAA-1). 9 left in stock.');
    expect(said.needsYou).toBe(false);
  });

  it('warns when stock reaches the reorder level', () => {
    expect(describeOrderOutcomes([recorded({ stockLeft: 2 })]).detail).toContain('Only 2 left — time to reorder.');
  });

  it('says so when that was the last copy', () => {
    expect(describeOrderOutcomes([recorded({ stockBefore: 1, stockLeft: 0 })]).detail).toContain('That was your last copy.');
  });

  it('flags a sale of more copies than the shelf held', () => {
    const said = describeOrderOutcomes([recorded({ qty: 3, stockBefore: 1, stockLeft: 0 })]);
    expect(said.detail).toContain('You only had 1 copy on the shelf');
    expect(said.detail).toContain('recount');
  });

  it('says why an order is waiting and that stock has not moved', () => {
    const said = describeOrderOutcomes([{ num: '#AAAA-1', customer: 'Dana', outcome: 'review', reason: 'mixed' }]);
    expect(said.title).toBe('New order needs you');
    expect(said.detail).toContain('more than one book');
    expect(said.detail).toContain('stock hasn’t been taken off yet');
    expect(said.needsYou).toBe(true);
  });

  it('sums up a batch and names the books running low', () => {
    const said = describeOrderOutcomes([
      recorded(),
      recorded({ num: '#BBBB-2', customer: 'Sam', bookTitle: 'The Hound', stockLeft: 1 }),
      { num: '#CCCC-3', customer: 'Lee', outcome: 'review', reason: 'unmatched' },
    ]);
    expect(said.title).toBe('3 new orders — 1 needs you');
    expect(said.detail).toBe('2 recorded and stock updated; 1 needs you. Running low: The Hound (1 left).');
    expect(said.needsYou).toBe(true);
  });

  it('reads as all done when every order in a batch was recorded', () => {
    const said = describeOrderOutcomes([recorded(), recorded({ num: '#BBBB-2' })]);
    expect(said.title).toBe('2 new orders recorded');
    expect(said.needsYou).toBe(false);
  });

  it('falls back to the plain announcement when recording is switched off', () => {
    const said = describeOrderOutcomes([{ num: '#AAAA-1', customer: 'Dana', outcome: 'off' }]);
    expect(said.title).toBe('New order');
    expect(said.detail).toBe('Dana just ordered — #AAAA-1.');
  });

  it('says nothing for nothing', () => {
    expect(describeOrderOutcomes([]).count).toBe(0);
  });
});
