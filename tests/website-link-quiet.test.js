import { describe, it, expect } from 'vitest';
import { WEBSITE_QUIET_MS, promisedPreorders, websiteQuietSince } from '../src/lib/website-link.js';
import { buildAttentionSignals } from '../src/lib/attention-signals.js';

const NOW = Date.parse('2026-10-15T12:00:00Z');

describe('websiteQuietSince', () => {
  it('says nothing for a website that checked in recently, never, or while offline', () => {
    expect(websiteQuietSince(new Date(NOW - 10 * 60 * 1000).toISOString(), { now: NOW })).toBe('');
    expect(websiteQuietSince('', { now: NOW })).toBe('');
    expect(websiteQuietSince(null, { now: NOW })).toBe('');
    expect(websiteQuietSince(new Date(NOW - 5 * WEBSITE_QUIET_MS).toISOString(), { now: NOW, online: false })).toBe('');
  });
  it('gives the last check-in once it is more than an hour old', () => {
    const at = new Date(NOW - WEBSITE_QUIET_MS - 1000).toISOString();
    expect(websiteQuietSince(at, { now: NOW })).toBe(at);
  });
});

describe('promisedPreorders', () => {
  it('counts pre-ordered copies not sent yet', () => {
    const hist = [
      { preorder: true, qty: 2 },
      { preorder: true, qty: 1 },
      { preorder: true, qty: 1, shipped: true },
      { preorder: true, qty: 3, voided: true },
      { preorder: true, qty: 1, gratuity: true },
      { preorder: true, qty: 1, webRefunded: true },
      { qty: 5 },
    ];
    expect(promisedPreorders(hist)).toEqual({ copies: 3, orders: 2 });
    expect(promisedPreorders()).toEqual({ copies: 0, orders: 0 });
  });
});

describe('To-do signals for the link', () => {
  const book = { id: 'hound', title: 'The Hound', maxPrint: 100 };
  const base = { books: [book], states: { hound: { stock: 50, hist: [] } }, today: '2026-10-15' };
  const ids = websiteLink => buildAttentionSignals({ ...base, automation: { websiteLink } }).signals.map(s => s.id);
  it('warns when the website goes quiet', () => {
    expect(ids({ quietSince: '2026-10-15T09:00:00Z' })).toContain('setup-website-link-quiet');
    expect(ids({})).not.toContain('setup-website-link-quiet');
  });
  it('a broken connection is said once, instead of quiet', () => {
    const list = ids({ problem: 'The connection dropped.', quietSince: '2026-10-15T09:00:00Z' });
    expect(list).toContain('setup-website-link-problem');
    expect(list).not.toContain('setup-website-link-quiet');
  });
});
