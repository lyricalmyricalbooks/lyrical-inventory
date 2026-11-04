// Sorting rules: the owner's "anything from Canva is Software" list.
import { describe, expect, it } from 'vitest';
import { addExpenseRule, cleanExpenseRules, findExpenseRule, removeExpenseRule, ruleMatches } from '../src/lib/expense-rules.js';
import { scanReadChecks } from '../src/lib/receipt-scan-checks.js';

const rule = (id, match, cat) => ({ id, match, cat });

describe('ruleMatches', () => {
  it('matches whole words, ignoring case and punctuation', () => {
    expect(ruleMatches(rule('a', 'canva', 'X'), 'Canva Pro yearly')).toBe(true);
    expect(ruleMatches(rule('a', 'canva', 'X'), 'canva.com invoice')).toBe(true);
    expect(ruleMatches(rule('a', 'Canada Post', 'X'), 'CANADA-POST shipping')).toBe(true);
  });

  it('does not fire inside another word', () => {
    expect(ruleMatches(rule('a', 'post', 'X'), 'PostNet copies')).toBe(false);
    expect(ruleMatches(rule('a', 'ink', 'X'), 'drinks at the fair')).toBe(false);
  });

  it('ignores a rule with fewer than two letters', () => {
    expect(ruleMatches(rule('a', 'a', 'X'), 'a b c')).toBe(false);
  });
});

describe('findExpenseRule', () => {
  const rules = [
    rule('1', 'post', 'Office Supplies'),
    rule('2', 'canada post', 'Shipping & Postage'),
    rule('3', 'canva', 'Software & Subscriptions'),
  ];

  it('picks the longest matching rule', () => {
    expect(findExpenseRule(rules, { vendor: 'Canada Post', description: 'parcel' }).category).toBe('Shipping & Postage');
  });

  it('searches the shop name and the description', () => {
    expect(findExpenseRule(rules, { vendor: '', description: 'Canva subscription' }).category).toBe('Software & Subscriptions');
    expect(findExpenseRule(rules, { vendor: 'Canva', description: '' }).rule.id).toBe('3');
  });

  it("doesn't match across the gap between shop and description", () => {
    expect(findExpenseRule([rule('1', 'canada post', 'X')], { vendor: 'Air Canada', description: 'Post card' })).toBeNull();
  });

  it('skips a rule whose category this form does not offer', () => {
    expect(findExpenseRule(rules, { description: 'canva' }, { allowed: ['Travel'] })).toBeNull();
  });

  it('keeps the older rule on a tie', () => {
    const tie = [rule('old', 'abc', 'Travel'), rule('new', 'abc', 'Other')];
    expect(findExpenseRule(tie, { description: 'abc' }).rule.id).toBe('old');
  });

  it('returns null with no rules or no text', () => {
    expect(findExpenseRule(undefined, { description: 'canva' })).toBeNull();
    expect(findExpenseRule(rules, { description: '' })).toBeNull();
  });
});

describe('addExpenseRule / removeExpenseRule', () => {
  it('adds a rule without changing the list it was given', () => {
    const before = [];
    const out = addExpenseRule(before, { match: '  Canva ', cat: 'Software & Subscriptions' }, { id: 'r1', now: '2026-11-04T00:00:00Z' });
    expect(before).toEqual([]);
    expect(out.rules).toEqual([{ id: 'r1', match: 'Canva', cat: 'Software & Subscriptions', createdAt: '2026-11-04T00:00:00Z' }]);
    expect(out.replaced).toBeNull();
  });

  it('re-points a rule with the same words instead of adding a second', () => {
    const first = addExpenseRule([], { match: 'Canva', cat: 'Other' }, { id: 'r1' }).rules;
    const out = addExpenseRule(first, { match: 'CANVA', cat: 'Software & Subscriptions' }, { id: 'r2' });
    expect(out.rules).toHaveLength(1);
    expect(out.rules[0]).toMatchObject({ id: 'r1', cat: 'Software & Subscriptions' });
    expect(out.replaced).toBe('Other');
  });

  it('refuses a rule that is too short or has no category', () => {
    expect(addExpenseRule([], { match: 'a', cat: 'Other' }).error).toMatch(/two letters/);
    expect(addExpenseRule([], { match: 'canva', cat: '' }).error).toMatch(/category/);
  });

  it('removes by id and drops malformed rows', () => {
    const list = [rule('1', 'canva', 'X'), rule('2', 'adobe', 'Y'), { id: '3', match: '', cat: 'Z' }, null];
    expect(cleanExpenseRules(list).map(r => r.id)).toEqual(['1', '2']);
    expect(removeExpenseRule(list, '1').map(r => r.id)).toEqual(['2']);
  });
});

describe('scan summary', () => {
  it('says when a sorting rule chose the category, instead of the habit line', () => {
    const checks = scanReadChecks({
      rule: { match: 'Canva', cat: 'Software & Subscriptions' },
      habit: { category: 'Other', count: 3, of: 3 },
      vendor: 'Canva',
    });
    const texts = checks.map(c => c.text).join('\n');
    expect(texts).toContain('Filed under Software & Subscriptions by your sorting rule for "Canva"');
    expect(texts).not.toContain('the way you filed');
  });
});
