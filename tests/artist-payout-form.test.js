import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describePayout } from '../src/lib/earnings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const mainJs = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8').replace(/\r\n/g, '\n');
const styleCss = fs.readFileSync(path.join(root, 'src/style.css'), 'utf8').replace(/\r\n/g, '\n');

// ---------------------------------------------------------------------------
// The verdict shown under the amount field, before anything is saved.
// ---------------------------------------------------------------------------
describe('describePayout', () => {
  it('has no verdict to give for an untouched field', () => {
    for (const blank of ['', null, undefined]) {
      expect(describePayout(blank, 120).tone).toBe('empty');
    }
    // It still reports the balance it was asked about, so the caller can lead
    // with "X is owed" rather than showing nothing at all.
    expect(describePayout('', 120).remaining).toBe(120);
  });

  it('rejects zero, negatives and junk', () => {
    for (const bad of ['0', '-5', 'abc', 'NaN']) {
      expect(describePayout(bad, 120).tone).toBe('invalid');
    }
  });

  it('reports what is left when the payout is partial', () => {
    const v = describePayout('50', 120);
    expect(v.tone).toBe('partial');
    expect(v.amount).toBe(50);
    expect(v.remaining).toBe(70);
    expect(v.over).toBe(0);
  });

  it('recognises a payout that settles the balance exactly', () => {
    const v = describePayout('120', 120);
    expect(v.tone).toBe('clears');
    expect(v.remaining).toBe(0);
    expect(v.over).toBe(0);
  });

  it('warns — with the overshoot — when the payout exceeds what is owed', () => {
    const v = describePayout('200', 120);
    expect(v.tone).toBe('over');
    expect(v.amount).toBe(200);
    expect(v.over).toBe(80);
    // Nothing is "still owed" once you have overpaid; that is the balance
    // card's overpaid state, not a remainder.
    expect(v.remaining).toBe(0);
  });

  it('treats anything owed as an advance once the balance is settled', () => {
    const v = describePayout('25', 0);
    expect(v.tone).toBe('over');
    expect(v.over).toBe(25);
  });

  it('does not manufacture a remainder out of floating-point dust', () => {
    // 0.1 + 0.2 arithmetic upstream leaves balances a hair off a round number.
    expect(describePayout('0.3', 0.1 + 0.2).tone).toBe('clears');
    expect(describePayout('120', 120.004).tone).toBe('clears');
    expect(describePayout('120.004', 120).tone).toBe('clears');
  });

  it('survives a missing or unparseable balance', () => {
    expect(describePayout('10', null).tone).toBe('over');
    expect(describePayout('10', undefined).over).toBe(10);
  });

  it('rounds the figures it hands back to whole cents', () => {
    const v = describePayout('33.333', 100);
    expect(v.amount).toBe(33.33);
    expect(v.remaining).toBe(66.67);
  });
});

// ---------------------------------------------------------------------------
// Wiring: the preview only helps if it is actually reachable from the markup.
// ---------------------------------------------------------------------------
describe('record-payout form wiring', () => {
  it('recomputes the verdict on every keystroke', () => {
    expect(mainJs).toContain(`oninput="previewArtistPayout('\${bookId}')"`);
    expect(mainJs).toContain('window.previewArtistPayout = previewArtistPayout;');
  });

  it('reads the balance from the live earnings pipeline, not a captured value', () => {
    const fn = mainJs.match(/function previewArtistPayout\([\s\S]*?\n\}/)[0];
    expect(fn).toContain('calculateArtistEarnings(bookId)');
    expect(fn).toContain('describePayout(');
  });

  it('routes the quick-fill button through a handler so the preview follows', () => {
    // Assigning `.value` from script fires no `input` event, so the old inline
    // `document.getElementById(...).value = ...` would have left the verdict
    // line stale on the figure the user most wants checked.
    expect(mainJs).toContain(`onclick="fillArtistPayoutFull('\${bookId}')"`);
    const fn = mainJs.match(/function fillArtistPayoutFull\([\s\S]*?\n\}/)[0];
    expect(fn).toContain('previewArtistPayout(bookId)');
    expect(mainJs).toContain('window.fillArtistPayoutFull = fillArtistPayoutFull;');
  });

  it('states the balance the moment the form opens', () => {
    const fn = mainJs.match(/function toggleArtistPayoutForm\([\s\S]*?\n\}/)[0];
    expect(fn).toContain('form.hidden = !form.hidden');
    expect(fn).toContain('previewArtistPayout(bookId)');
  });

  it('announces the verdict to assistive tech', () => {
    expect(mainJs).toMatch(/id="ap-preview-\$\{bookId\}"[^>]*aria-live="polite"/);
  });

  it('labels every field instead of wrapping the input in bare text', () => {
    for (const f of ['amount', 'date', 'method', 'notes']) {
      expect(mainJs).toContain(`<label for="ap-${f}-\${bookId}">`);
    }
  });

  it('keeps the amount and date in tabular figures', () => {
    expect(mainJs).toMatch(/id="ap-amount-\$\{bookId\}" class="ps-payout-num"/);
    expect(mainJs).toMatch(/id="ap-date-\$\{bookId\}" class="ps-payout-num"/);
    expect(styleCss).toMatch(/\.ps-payout-num\{[^}]*tnum/);
  });

  it('leaves the save path untouched', () => {
    // This is a styling and feedback change; the write itself must still read
    // the same four fields and persist through the same offline-safe path.
    const fn = mainJs.match(/async function recordArtistPayout\([\s\S]*?\n\}/)[0];
    expect(fn).toContain('ap-amount-');
    expect(fn).toContain('s.artistPayouts.push');
    expect(fn).toContain('await saveState(bookId)');
  });
});

// ---------------------------------------------------------------------------
// The history list under the form.
// ---------------------------------------------------------------------------
describe('payout history list', () => {
  const fn = mainJs.match(/function getPayoutHistoryHtml\([\s\S]*?\n\}/)[0];

  it('totals itself against the "Paid to artist" figure', () => {
    expect(fn).toContain('ps-payout-total');
    expect(fn).toContain('stats.totalPaidToArtist ?? 0');
  });

  it('pluralises the count rather than printing "1 payouts"', () => {
    expect(fn).toContain("payouts.length === 1 ? '' : 's'");
  });

  it('gives the delete control a full touch target', () => {
    expect(fn).toMatch(/class="btn tx sm sys-target ps-payout-del"/);
    expect(fn).toContain('aria-label="Delete payout"');
  });

  it('still escapes operator-entered method and notes text', () => {
    expect(fn).toContain('escapeHtml(p.method)');
    expect(fn).toContain('escapeHtml(p.notes)');
  });

  it('offers a guided empty state, not a bare sentence', () => {
    expect(fn).toContain('ps-payout-empty');
    expect(fn).toContain('No payouts recorded yet');
  });

  it('drops the hairlines that vanished in dark mode', () => {
    // The row separators used to be a hardcoded black wash, invisible on the
    // dark surface. They are a token now, and so is the list background.
    expect(fn).not.toContain('rgba(0,0,0,');
    expect(styleCss).toMatch(/\.ps-payout-row\{[^}]*var\(--border-subtle\)/);
    expect(styleCss).toMatch(/\.ps-payout-list\{[^}]*var\(--surface-sunken\)/);
  });
});

describe('payout form styling holds the house standards', () => {
  it('sizes the money fields to the 44px minimum target', () => {
    expect(styleCss).toMatch(/\.ps-payout-form \.form-group input\{[^}]*min-height:var\(--target-min\)/);
  });

  it('responds to its own panel width, not the viewport', () => {
    expect(styleCss).toContain('@container (max-width:420px){\n  .ps-payout-fields');
    expect(mainJs).toContain('class="ps-payout-form sys-container"');
  });

  it('reuses the amber/green status convention for the verdict tones', () => {
    expect(styleCss).toMatch(/\.ps-payout-preview\.is-good\{[^}]*var\(--status-positive\)/);
    expect(styleCss).toMatch(/\.ps-payout-preview\.is-warn\{[^}]*var\(--status-active\)/);
  });

  it('stands its motion down under prefers-reduced-motion', () => {
    const block = styleCss.slice(styleCss.lastIndexOf('@media (prefers-reduced-motion:reduce)'));
    expect(block).toContain('.ps-payout-actions .btn:hover');
    expect(block).toContain('transform:none');
  });
});
