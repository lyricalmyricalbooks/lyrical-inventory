import { describe, it, expect } from 'vitest';
import { findCategoryMismatches } from '../src/lib/category-fit.js';

// This never decides what category a description "should" be — it only
// checks whether an expense's own words match how THIS business has filed
// those same words everywhere else. Every test below is really checking that
// the bar for saying anything is high enough not to cry wolf.

const expense = (over = {}) => ({
  id: 'e', desc: 'x', cat: 'Other', amount: 10, baseAmount: 10, currency: 'CAD', date: '2026-01-05', ...over,
});

function fixture({ businessExpenses = [], bookExpenses = {} } = {}) {
  const states = {};
  for (const [bookId, list] of Object.entries(bookExpenses)) {
    states[bookId] = { expenses: list };
  }
  return { books: {}, states, taxCenter: { businessExpenses } };
}

// A well-established Printing & Production vocabulary (4 expenses), one
// business expense wrongly filed under Travel & Meals that shares that
// vocabulary, and enough unrelated filler to clear the "real ledger" floor.
function ledgerWithOneMismatch() {
  return [
    expense({ id: 'p1', desc: 'printer ink cartridge', cat: 'Printing & Production' }),
    expense({ id: 'p2', desc: 'printer toner', cat: 'Printing & Production' }),
    expense({ id: 'p3', desc: 'printer paper', cat: 'Printing & Production' }),
    expense({ id: 'p4', desc: 'inkjet cartridge', cat: 'Printing & Production' }),
    expense({ id: 'outlier', desc: 'printer ink refill', cat: 'Travel & Meals', amount: 42, baseAmount: 42 }),
    expense({ id: 'sw1', desc: 'domain hosting renewal', cat: 'Software & Subscriptions' }),
    expense({ id: 'sw2', desc: 'domain hosting renewal', cat: 'Software & Subscriptions' }),
    expense({ id: 'sw3', desc: 'domain hosting renewal', cat: 'Software & Subscriptions' }),
    expense({ id: 'ev1', desc: 'conference table booth', cat: 'Events & Exhibitions' }),
    expense({ id: 'ev2', desc: 'conference table booth', cat: 'Events & Exhibitions' }),
    expense({ id: 'ev3', desc: 'conference table booth', cat: 'Events & Exhibitions' }),
    expense({ id: 'tr1', desc: 'train ticket fare', cat: 'Travel & Meals' }),
    expense({ id: 'tr2', desc: 'train ticket fare', cat: 'Travel & Meals' }),
    expense({ id: 'tr3', desc: 'train ticket fare', cat: 'Travel & Meals' }),
    expense({ id: 'ed1', desc: 'editor proofreading pass', cat: 'Editorial & Proofreading' }),
    expense({ id: 'ed2', desc: 'editor proofreading pass', cat: 'Editorial & Proofreading' }),
  ];
}

describe('an expense whose own words point at a different category', () => {
  it('is flagged, naming the words and the count behind it', () => {
    const findings = findCategoryMismatches(fixture({ businessExpenses: ledgerWithOneMismatch() }));
    const hit = findings.find(f => f.expenseId === 'outlier');
    expect(hit).toBeDefined();
    expect(hit.currentCategory).toBe('Travel & Meals');
    expect(hit.suggestedCategory).toBe('Printing & Production');
    expect(hit.evidence.matchedWords).toContain('printer');
    expect(hit.evidence.suggestedSupport).toBeGreaterThanOrEqual(3);
    expect(hit.evidence.ownSupport).toBe(0);
    expect(hit.amount).toBe(42);
  });

  it('does not flag the well-supported expenses that built the pattern in the first place', () => {
    const findings = findCategoryMismatches(fixture({ businessExpenses: ledgerWithOneMismatch() }));
    expect(findings.map(f => f.expenseId)).not.toEqual(expect.arrayContaining(['p1', 'p2', 'p3', 'p4']));
  });

  it('works the same way for a book-scoped expense', () => {
    const ledger = ledgerWithOneMismatch();
    const outlier = ledger.find(e => e.id === 'outlier');
    const rest = ledger.filter(e => e.id !== 'outlier');
    const ctx = fixture({ businessExpenses: rest, bookExpenses: { hound: [outlier] } });
    const hit = findCategoryMismatches(ctx).find(f => f.expenseId === 'outlier');
    expect(hit.scope).toBe('book');
    expect(hit.bookId).toBe('hound');
  });
});

describe('when there is nothing solid to check against', () => {
  it('says nothing about a ledger too small to have a pattern yet', () => {
    const small = ledgerWithOneMismatch().slice(0, 10); // under the 15-expense floor
    expect(findCategoryMismatches(fixture({ businessExpenses: small }))).toEqual([]);
  });

  it('says nothing when a shared word has only ever been used once before', () => {
    const ledger = [
      expense({ id: 'p1', desc: 'printer maintenance', cat: 'Printing & Production' }),
      expense({ id: 'outlier2', desc: 'printer service', cat: 'Travel & Meals' }),
      ...Array.from({ length: 13 }, (_, i) => expense({ id: `pad${i}`, desc: 'random filler copy', cat: 'Other' })),
    ];
    const findings = findCategoryMismatches(fixture({ businessExpenses: ledger }));
    expect(findings.find(f => f.expenseId === 'outlier2')).toBeUndefined();
  });

  it('has nothing to say about a description with no meaningful words', () => {
    const ledger = [
      ...ledgerWithOneMismatch(),
      expense({ id: 'vague', desc: 'the and for', cat: 'Other' }),
    ];
    const findings = findCategoryMismatches(fixture({ businessExpenses: ledger }));
    expect(findings.find(f => f.expenseId === 'vague')).toBeUndefined();
  });
});
