import { describe, it, expect } from 'vitest';
import { receiptLinkTarget, receiptIsOpenable, followableUrl } from '../src/lib/receipt-links.js';
import { appSource } from './helpers/extract-decl.js';

describe('telling a folder path from a real URL', () => {
  it('recognises a receipt saved in the connected folder', () => {
    expect(receiptLinkTarget('local://receipts/cp-2026-08.pdf')).toEqual({
      kind: 'local', path: 'receipts/cp-2026-08.pdf', href: '',
    });
  });

  it('gives a local receipt no href at all', () => {
    // This is the whole bug: `<a href="local://…">` renders as an ordinary
    // link and does nothing when clicked.
    expect(receiptLinkTarget('local://receipts/x.pdf').href).toBe('');
  });

  it('passes a real URL straight through', () => {
    expect(receiptLinkTarget('https://shippo-delivery.s3.amazonaws.com/x.pdf')).toMatchObject({
      kind: 'url', href: 'https://shippo-delivery.s3.amazonaws.com/x.pdf',
    });
    expect(receiptLinkTarget('http://example.com/r.png').kind).toBe('url');
    expect(receiptLinkTarget('data:application/pdf;base64,AAAA').kind).toBe('url');
  });

  it('reports nothing attached for an empty reference', () => {
    expect(receiptLinkTarget('').kind).toBe('none');
    expect(receiptLinkTarget(null).kind).toBe('none');
    expect(receiptLinkTarget(undefined).kind).toBe('none');
    expect(receiptLinkTarget('   ').kind).toBe('none');
  });

  it('refuses a scheme a browser must never follow from a stored field', () => {
    // Strict allow-list rather than "not local, therefore fine": a receipt
    // reference is stored data, and stored data becomes an href here.
    expect(receiptLinkTarget('javascript:alert(1)').kind).toBe('none');
    expect(receiptLinkTarget('javascript:alert(1)').href).toBe('');
    expect(receiptLinkTarget('file:///etc/passwd').kind).toBe('none');
  });

  it('answers whether a receipt can be opened by any route', () => {
    expect(receiptIsOpenable('local://a.pdf')).toBe(true);
    expect(receiptIsOpenable('https://x/a.pdf')).toBe(true);
    expect(receiptIsOpenable('')).toBe(false);
    expect(receiptIsOpenable('javascript:alert(1)')).toBe(false);
  });
});

describe('the shipping ledger opens receipts the working way', () => {
  it('no longer puts a stored receipt reference straight into an href', () => {
    // The regression that made every counter receipt's reference link dead.
    expect(appSource).not.toContain('href="${escapeHtml(primary.receipt)}"');
    expect(appSource).not.toContain('href="${escapeHtml(expense.receipt)}"');
  });

  it('routes a folder receipt through the app instead', () => {
    expect(appSource).toContain('receiptLinkTarget');
    expect(appSource).toMatch(/refTarget\.kind === 'local'[\s\S]{0,220}viewLocalReceipt/);
  });
});

describe('what is safe to put in an href', () => {
  it('follows a real web address', () => {
    expect(followableUrl('https://x.test/a.pdf')).toBe('https://x.test/a.pdf');
    expect(followableUrl('http://x.test/a.pdf')).toBe('http://x.test/a.pdf');
    expect(followableUrl('mailto:pay@example.com')).toBe('mailto:pay@example.com');
  });

  it('refuses a bare email, which becomes a RELATIVE link', () => {
    // An Interac e-Transfer address is where money is sent, not a page.
    // `href="pay@example.com"` navigated the invoice to a path that does not
    // exist — the Pay button on a customer's invoice going nowhere.
    expect(followableUrl('pay@example.com')).toBe('');
  });

  it('refuses a folder path and an executable scheme', () => {
    expect(followableUrl('local://receipts/a.pdf')).toBe('');
    expect(followableUrl('javascript:alert(1)')).toBe('');
    expect(followableUrl('file:///etc/passwd')).toBe('');
  });

  it('refuses empty and non-string input rather than throwing', () => {
    expect(followableUrl('')).toBe('');
    expect(followableUrl(null)).toBe('');
    expect(followableUrl(undefined)).toBe('');
    expect(followableUrl('   ')).toBe('');
  });
});

describe('the audit fixes stay fixed', () => {
  it('never puts a stored reference into an href unchecked', () => {
    // Each of these was a live `href="${...}"` on a stored field.
    expect(appSource).not.toContain('href="${e.receipt}"');
    expect(appSource).not.toContain('href="${e.trackingUrl}"');
    expect(appSource).not.toContain('href="${r}"');
    expect(appSource).not.toContain('href="${payUrl}"');
  });

  it('keeps a cloud receipt a cloud receipt when relinking it', () => {
    // Stripping `local://` unconditionally and re-adding it turned an https
    // receipt into `local://https://…`, which resolves to nothing.
    expect(appSource).not.toContain("currentPath.replace('local://', '')");
    expect(appSource).toContain("const isLocal = currentPath.startsWith('local://')");
  });

  it('deletes one ledger row, not every row sharing its number', () => {
    // History entries never get an id, so these key on `num`, and a
    // consignment num ends in the last 4 digits of the clock.
    expect(appSource).not.toContain("s.hist.filter(h => String(h.id || h.num) !== String(id))");
    expect(appSource).toContain('function removeOneByKey(list, id)');
    expect(appSource).toContain('list.splice(idx, 1)');
  });
});
