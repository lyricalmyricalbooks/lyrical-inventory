import { describe, expect, test } from 'vitest';
import { moreIconFor, moreIconHtml } from '../src/lib/more-icons.js';

describe('More tile icons', () => {
  test('finds the icon from the tile\'s click handler', () => {
    expect(moreIconFor("switchTab('todo')")).toBe('todo');
    expect(moreIconFor("switchTab('reconcile')")).toBe('payments');
    expect(moreIconFor("switchTab('webanalytics')")).toBe('analytics');
  });
  test('a tile with no known screen gets no icon', () => {
    expect(moreIconFor("switchTab('nowhere')")).toBe('');
    expect(moreIconFor('openReviewInbox()')).toBe('');
    expect(moreIconFor(null)).toBe('');
  });
  test('draws the sprite symbol, hidden from screen readers', () => {
    const html = moreIconHtml('tax');
    expect(html).toContain('href="#ic-tax"');
    expect(html).toContain('aria-hidden="true"');
  });
});
