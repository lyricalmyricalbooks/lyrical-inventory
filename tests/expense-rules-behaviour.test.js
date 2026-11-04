// @vitest-environment jsdom
// Sorting rules in the real app: added from the Tax Centre card, they pre-fill
// the category as an expense is typed, but a category picked by hand is never
// moved, and expenses already logged are never re-sorted.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';

let app;
const $ = id => document.getElementById(id);
const type = (id, value) => {
  $(id).value = value;
  $(id).dispatchEvent(new Event('input', { bubbles: true }));
};
const pick = (id, value) => {
  $(id).value = value;
  $(id).dispatchEvent(new Event('change', { bubbles: true }));
};

beforeAll(async () => {
  app = await loadApp({ books: [makeBook({ id: 'harbour' })] });
  document.dispatchEvent(new Event('DOMContentLoaded'));
}, 30000);

beforeEach(() => {
  app.main.TAX_CENTER.expenseRules = [];
  app.main.TAX_CENTER.businessExpenses = [];
  delete app.main.TAX_CENTER._preview;
  app.window.resetCategoryAutofill?.('tc-exp-cat', 'tc-exp-cat-hint');
  const cat = $('tc-exp-cat');
  delete cat.dataset.handPicked;
  delete cat.dataset.autoValue;
});

function addRule(match, cat) {
  app.window.renderTaxCenter();
  $('tc-rule-match').value = match;
  $('tc-rule-cat').value = cat;
  document.querySelector('[data-action="rules.add"]').click();
}

describe('sorting rules', () => {
  it('adds a rule from the card and lists it', async () => {
    addRule('Canva', 'Software & Subscriptions');
    await app.settle();
    expect(app.main.TAX_CENTER.expenseRules).toEqual([
      expect.objectContaining({ match: 'Canva', cat: 'Software & Subscriptions' }),
    ]);
    expect($('tc-rules-list').textContent).toContain('Canva');
    expect($('tc-rule-match').value).toBe('');
  });

  it('pre-fills the category as the description is typed, and says why', () => {
    app.main.TAX_CENTER.expenseRules = [{ id: 'r1', match: 'Michaels', cat: 'Packaging Materials' }];
    pick('tc-exp-cat', 'Other');
    delete $('tc-exp-cat').dataset.handPicked;
    type('tc-exp-desc', 'Michaels tissue paper');
    expect($('tc-exp-cat').value).toBe('Packaging Materials');
    expect($('tc-exp-cat-hint').hidden).toBe(false);
    expect($('tc-exp-cat-hint').textContent).toContain('Michaels');
  });

  it('beats the built-in keyword guess', () => {
    app.main.TAX_CENTER.expenseRules = [{ id: 'r1', match: 'google', cat: 'Marketing & Advertising' }];
    type('tc-exp-desc', 'Google Ads October');
    expect($('tc-exp-cat').value).toBe('Marketing & Advertising');
  });

  it('never moves a category the owner picked by hand', () => {
    app.main.TAX_CENTER.expenseRules = [{ id: 'r1', match: 'canva', cat: 'Software & Subscriptions' }];
    pick('tc-exp-cat', 'Marketing & Advertising');
    type('tc-exp-desc', 'Canva poster');
    expect($('tc-exp-cat').value).toBe('Marketing & Advertising');
    // The keyword list respects the hand pick too ("hosting" is Software).
    type('tc-exp-desc', 'Canva hosting');
    expect($('tc-exp-cat').value).toBe('Marketing & Advertising');
  });

  it('removing a rule leaves logged expenses as they were', async () => {
    app.main.TAX_CENTER.expenseRules = [{ id: 'r1', match: 'canva', cat: 'Software & Subscriptions' }];
    app.main.TAX_CENTER.businessExpenses = [{ id: 1, desc: 'Canva', cat: 'Software & Subscriptions', amount: 10, currency: 'CAD', date: '2026-11-01' }];
    app.window.renderTaxCenter();
    document.querySelector('[data-action="rules.remove"]').click();
    await app.settle();
    app.answerConfirm(true);
    await app.settle();
    expect(app.main.TAX_CENTER.expenseRules).toEqual([]);
    expect(app.main.TAX_CENTER.businessExpenses[0].cat).toBe('Software & Subscriptions');
  });
});
