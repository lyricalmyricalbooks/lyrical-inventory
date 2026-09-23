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
// What the form does — previewing, recording, editing and deleting a payout,
// and the history list it feeds — is exercised against the real app in
// artist-payout-behaviour.test.js. What's left here is what a behaviour test
// can't observe: accessibility attributes, styling hooks, and the author view
// (the harness always signs in as the publisher).
// ---------------------------------------------------------------------------
describe('record-payout form markup', () => {
  it('announces the verdict to assistive tech', () => {
    expect(mainJs).toMatch(/id="ap-preview-\$\{bookId\}"[^>]*aria-live="polite"/);
  });

  it('labels every field instead of wrapping the input in bare text', () => {
    for (const f of ['amount', 'date', 'method', 'notes']) {
      expect(mainJs).toContain(`<label for="ap-${f}-\${bookId}">`);
    }
    expect(mainJs).toContain('<label for="ap-cur-${bookId}">Currency</label>');
    expect(mainJs).toContain('<label for="ap-rate-${bookId}">');
  });

  it('keeps the amount and date in tabular figures', () => {
    expect(mainJs).toMatch(/id="ap-amount-\$\{bookId\}" class="ps-payout-num"/);
    expect(mainJs).toMatch(/id="ap-date-\$\{bookId\}" class="ps-payout-num"/);
    expect(styleCss).toMatch(/\.ps-payout-num\{[^}]*tnum/);
  });

  it('never renders the record/edit form for an author', () => {
    // artistPayouts is not author-writable in firestore.rules, and _fbSave
    // commits every dirty part as one batch — an author using this form would
    // queue a permission-denied write forever.
    const fn = mainJs.match(/function getPayoutFormHtml\([\s\S]*?\n\}/)[0];
    expect(fn).toContain('if (isAuthor()) return');
  });
});

describe('payout history list markup', () => {
  const fn = mainJs.match(/function getPayoutHistoryHtml\([\s\S]*?\n\}/)[0];

  it('gives the delete control a full touch target', () => {
    expect(fn).toMatch(/class="btn tx sm sys-target ps-payout-del"/);
    expect(fn).toContain('aria-label="Delete payout"');
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
