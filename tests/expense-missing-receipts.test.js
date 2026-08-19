import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { expenseMissingReceipt } from '../src/lib/receipt-storage.js';

// An expense with nothing filed against it is the one row an accountant will
// ask about at tax time. The Expenses ledger used to render that state as the
// faintest text on the row, and it derived "missing" differently from the Tax
// Centre's audit check — so the same expense could read as fine on one screen
// and missing on the other. Both are what these tests hold in place.

const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(process.cwd(), 'src/style.css'), 'utf8');
const receipts = fs.readFileSync(path.join(process.cwd(), 'src/features/receipts.js'), 'utf8');

const expense = (over = {}) => ({ id: 1, desc: 'Padded envelopes x20', cat: 'Supplies', amount: 24.5, ...over });

describe('expenseMissingReceipt', () => {
  it('flags an expense with no proof of any kind', () => {
    expect(expenseMissingReceipt(expense())).toBe(true);
    expect(expenseMissingReceipt(expense({ receipt: '', ref: '' }))).toBe(true);
    expect(expenseMissingReceipt(expense({ receiptFiles: [] }))).toBe(true);
  });

  it('accepts a filed receipt, a cloud receipt, or a multi-file attachment', () => {
    expect(expenseMissingReceipt(expense({ receipt: 'local://General/2026-08-12_x.jpg' }))).toBe(false);
    expect(expenseMissingReceipt(expense({ receipt: 'https://firebasestorage.googleapis.com/x.jpg' }))).toBe(false);
    expect(expenseMissingReceipt(expense({ receiptFiles: ['local://General/a.jpg', 'local://General/b.jpg'] }))).toBe(false);
  });

  it('accepts a supplier invoice pasted into the ref field', () => {
    // This is the case the ledger got wrong: it only ever looked at `receipt`,
    // so a URL typed into Ref was reported as a hole in the paper trail when
    // the Tax Centre had already counted it as proof.
    expect(expenseMissingReceipt(expense({ ref: 'https://supplier.example/invoice/8891' }))).toBe(false);
    expect(expenseMissingReceipt(expense({ ref: 'local://General/2026-08-12_x.jpg' }))).toBe(false);
    expect(expenseMissingReceipt(expense({ ref: 'INV-8891' }))).toBe(true);
  });

  it('never flags the expenses that are exempt by their nature', () => {
    // Rent is governed by a lease and a bank record; a gratuity copy came out of
    // inventory, not a till. Nagging about either would train the owner to
    // ignore the warning that does matter.
    expect(expenseMissingReceipt(expense({ cat: 'Rent', desc: 'Studio rent — August' }))).toBe(false);
    expect(expenseMissingReceipt(expense({ desc: 'Warehouse lease payment' }))).toBe(false);
    expect(expenseMissingReceipt(expense({ gratuity: true, desc: 'Gratuity: 3 copies to reviewer' }))).toBe(false);
    expect(expenseMissingReceipt(expense({ ref: 'GRAT-004' }))).toBe(false);
  });

  it('is safe on junk input', () => {
    expect(expenseMissingReceipt(null)).toBe(false);
    expect(expenseMissingReceipt(undefined)).toBe(false);
    expect(expenseMissingReceipt('nope')).toBe(false);
  });
});

describe('expense ledger — missing receipt affordances', () => {
  it('renders the gap as an amber needs-attention pill, not faint text', () => {
    expect(receipts).toContain('⚠ No receipt');
    expect(receipts).toMatch(/pill amber[^`]*No receipt/);
    // The old faint-grey treatment must not come back alongside it.
    expect(receipts).not.toContain('font-weight: 500;">Missing<');
  });

  it('ships a filter chip wired to a real handler', () => {
    expect(html).toContain('id="exp-missing-receipt-btn"');
    expect(html).toContain('onclick="toggleExpenseReceiptFilter()"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('id="exp-missing-receipt-label"');
    expect(receipts).toContain('function toggleExpenseReceiptFilter()');
    expect(receipts).toContain('toggleExpenseReceiptFilter,');
  });

  it('keeps the chip hidden when the paper trail is complete', () => {
    // A warning that is always on screen stops being a warning.
    expect(receipts).toMatch(/btn\.style\.display = n > 0 \? '' : 'none'/);
    expect(receipts).toContain("if (!missingReceipt.length) _expMissingReceiptOnly = false;");
  });

  it('labels the outstanding total as the whole ledger while filtered', () => {
    // The footer sums every expense, not the filtered subset. Saying so is the
    // difference between a total and a wrong number. The words now ride the
    // shared `.ledger-total-scope` tag the consignment ledger uses to name
    // whose balance a footer figure is.
    expect(receipts).toMatch(/_expMissingReceiptOnly\s*\n?\s*\?\s*' <span class="ledger-total-scope">whole ledger<\/span>'/);
    // …and the footer is still handed the unfiltered set, not the visible one.
    expect(receipts).toContain('expenseLedgerTotals(combined,');
  });

  it('gives dates and refs tabular figures so the column reads as a column', () => {
    expect(receipts).toContain('<td class="mono" style="color:var(--text3);">${fmtD(e.date) ?? \'—\'}</td>');
    expect(receipts).toContain('<td class="mono" style="font-size:11px;color:var(--text3);">${escapeHtml(e.ref) || \'—\'}</td>');
  });
});

describe('ledger toggle chip styling', () => {
  it('extends the existing consignment toggle rather than forking a new one', () => {
    expect(css).toContain('.con-group-toggle-btn,.ledger-toggle-btn{');
    expect(css).toContain('.con-group-toggle-btn.is-on,.ledger-toggle-btn.is-on{');
  });

  it('uses the shared amber status tokens so it themes itself', () => {
    const alert = css.match(/\.ledger-toggle-btn\.is-alert\{[^}]*\}/)?.[0] ?? '';
    expect(alert).toContain('var(--status-active-bg)');
    expect(alert).toContain('var(--status-active)');
    expect(alert).not.toMatch(/#[0-9a-f]{3,8}/i);
    expect(alert).not.toMatch(/\brgb\(/);
  });

  it('keeps the pressed state on the same text/background pairing', () => {
    // Amber is dark in the light theme and light in the dark one, so a solid
    // amber fill would need opposite text colours to clear AA in each.
    const on = css.match(/\.ledger-toggle-btn\.is-alert\.is-on\{[^}]*\}/)?.[0] ?? '';
    expect(on).toContain('background:var(--status-active-bg)');
    expect(on).toContain('color:var(--status-active)');
    expect(on).not.toContain('var(--on-accent)');
  });

  it('has a focus-visible ring and a full-size hit area', () => {
    expect(css).toContain('.con-group-toggle-btn:focus-visible,.ledger-toggle-btn:focus-visible{');
    expect(css).toContain('.ledger-toggle-btn::before{');
    expect(css).toMatch(/\.ledger-toggle-btn::before\{[^}]*var\(--target-min\)/);
  });

  it('stands still for anyone who asked for reduced motion', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\{\s*\.con-group-toggle-btn,\.ledger-toggle-btn\{transition:none;\}/);
  });
});
