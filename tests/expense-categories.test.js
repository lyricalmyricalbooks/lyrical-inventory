import { describe, it, expect } from 'vitest';
import { canonicalExpenseCategory, allLiveExpenses } from '../src/lib/expense-categories.js';

// The bug this guards: an expense stored as "Marketing" and one stored as
// "Marketing & Advertising" are the same deductible bucket, but the Tax Centre
// showed them as two rows, so neither total was the number that belongs on a
// tax return.

describe('canonicalExpenseCategory', () => {
  it('folds legacy short names onto the canonical category', () => {
    expect(canonicalExpenseCategory('Marketing')).toBe('Marketing & Advertising');
    expect(canonicalExpenseCategory('Postage')).toBe('Shipping & Postage');
    expect(canonicalExpenseCategory('Production')).toBe('Printing & Production');
  });

  it('leaves an already-canonical name untouched', () => {
    expect(canonicalExpenseCategory('Marketing & Advertising')).toBe('Marketing & Advertising');
    expect(canonicalExpenseCategory('Home Office')).toBe('Home Office');
  });

  it('matches case-insensitively and ignores surrounding whitespace', () => {
    expect(canonicalExpenseCategory('  marketing  ')).toBe('Marketing & Advertising');
    expect(canonicalExpenseCategory('POSTAGE')).toBe('Shipping & Postage');
  });

  it('accepts the spelled-out "and" variant', () => {
    expect(canonicalExpenseCategory('Travel and Meals')).toBe('Travel & Meals');
  });

  it('passes an unrecognised category through rather than swallowing it', () => {
    expect(canonicalExpenseCategory('Llama Boarding')).toBe('Llama Boarding');
  });

  it('trims a passed-through category', () => {
    expect(canonicalExpenseCategory('  Llama Boarding ')).toBe('Llama Boarding');
  });

  it('falls back when the category is missing, blank or not a string', () => {
    expect(canonicalExpenseCategory('')).toBe('Other');
    expect(canonicalExpenseCategory('   ')).toBe('Other');
    expect(canonicalExpenseCategory(undefined)).toBe('Other');
    expect(canonicalExpenseCategory(null)).toBe('Other');
    expect(canonicalExpenseCategory(42)).toBe('Other');
  });

  it('honours a caller-supplied fallback', () => {
    expect(canonicalExpenseCategory('', 'Project Expense')).toBe('Project Expense');
  });

  it('is idempotent — folding a folded name changes nothing', () => {
    const once = canonicalExpenseCategory('Marketing');
    expect(canonicalExpenseCategory(once)).toBe(once);
  });
});

// Shared by the category-mismatch and missed-deduction detectors, which used
// to carry their own copies of this walk.
describe('allLiveExpenses', () => {
  it('merges business and per-book expenses, tagged with where each lives', () => {
    const rows = allLiveExpenses({
      taxCenter: { businessExpenses: [{ id: 'b1', cat: 'Postage', amount: 5 }] },
      states: { bookA: { expenses: [{ id: 'a1', cat: 'Printing & Production', amount: 900 }] } },
    });
    expect(rows).toEqual([
      { id: 'b1', cat: 'Postage', amount: 5, _scope: 'business', _bookId: null, _cat: 'Shipping & Postage' },
      { id: 'a1', cat: 'Printing & Production', amount: 900, _scope: 'book', _bookId: 'bookA', _cat: 'Printing & Production' },
    ]);
  });

  it('skips voided and empty rows and tolerates missing ledgers', () => {
    const rows = allLiveExpenses({
      taxCenter: { businessExpenses: [null, { id: 'v', voided: true }] },
      states: { bookA: null, bookB: { expenses: [{ id: 'k' }, { id: 'x', voided: true }] } },
    });
    expect(rows.map(r => [r.id, r._cat])).toEqual([['k', 'Other']]);
    expect(allLiveExpenses({})).toEqual([]);
  });
});
