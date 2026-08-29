import { describe, it, expect } from 'vitest';
import { receiptLinkTarget, receiptIsOpenable } from '../src/lib/receipt-links.js';
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
