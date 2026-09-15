// A receipt Gemini couldn't fully price, found by a background sweep: the
// money rule, the stable identity, and the merge that keeps nothing lost.
import { describe, expect, it } from 'vitest';
import {
  mergeReceiptDrafts,
  needsReceiptAmount,
  needsReceiptReview,
  receiptDraftRef,
  receiptSweepWindowStart,
} from '../src/lib/receipt-drafts.js';

describe('an amount is trustworthy or it is not', () => {
  it('treats a missing, zero or negative figure the same way — unknown', () => {
    expect(needsReceiptAmount({})).toBe(true);
    expect(needsReceiptAmount({ amount: null })).toBe(true);
    expect(needsReceiptAmount({ amount: undefined })).toBe(true);
    expect(needsReceiptAmount({ amount: 0 })).toBe(true);
    expect(needsReceiptAmount({ amount: -5 })).toBe(true);
    expect(needsReceiptAmount({ amount: NaN })).toBe(true);
    expect(needsReceiptAmount({ amount: 'free lunch' })).toBe(true);
  });

  it('trusts a real positive figure', () => {
    expect(needsReceiptAmount({ amount: 24.1 })).toBe(false);
    expect(needsReceiptAmount({ amount: 0.01 })).toBe(false);
  });
});

describe('a stable identity for a receipt found in an email', () => {
  it('keys a single-receipt email plainly', () => {
    expect(receiptDraftRef({ msgId: 'msg-1' }, { totalForMsg: 1 })).toBe('receipt-email:msg-1');
  });

  it('only pays for the index when one email held more than one receipt', () => {
    expect(receiptDraftRef({ msgId: 'msg-1', rowIndex: 0 }, { totalForMsg: 2 })).toBe('receipt-email:msg-1:0');
    expect(receiptDraftRef({ msgId: 'msg-1', rowIndex: 2 }, { totalForMsg: 3 })).toBe('receipt-email:msg-1:2');
  });

  it('falls back to whatever reference it has when there is no message id', () => {
    // A pasted or uploaded receipt has no durable identity this app can later
    // ask "have I seen you before?" — this is today's actual fallback, kept.
    expect(receiptDraftRef({ reference: 'INV-204' })).toBe('INV-204');
    expect(receiptDraftRef({})).toBe('');
    expect(receiptDraftRef({ reference: '  ' })).toBe('');
  });

  it('trims a stray blank message id down to the reference fallback', () => {
    expect(receiptDraftRef({ msgId: '  ', reference: 'INV-1' })).toBe('INV-1');
  });
});

describe('what still needs the owner’s attention', () => {
  it('flags an unpriced row that came from the email pipeline', () => {
    expect(needsReceiptReview({ amountUnknown: true, ref: 'receipt-email:msg-1' })).toBe(true);
  });

  it('leaves a priced row alone', () => {
    expect(needsReceiptReview({ amountUnknown: false, ref: 'receipt-email:msg-1' })).toBe(false);
  });

  it('is scoped to this source — a hand-entered expense is the publisher’s own doing', () => {
    // Mirrors needsAmountAttention's own guard in shipping-reconciliation.js:
    // an unrelated blank amount elsewhere in the ledger is not this list's job.
    expect(needsReceiptReview({ amountUnknown: true, ref: '' })).toBe(false);
    expect(needsReceiptReview({ amountUnknown: true, ref: 'postage:123' })).toBe(false);
    expect(needsReceiptReview({ amountUnknown: true })).toBe(false);
  });
});

describe('folding a fresh find into what is already on screen', () => {
  it('never replaces a row already there, however it has been edited', () => {
    const existing = [{ ref: 'receipt-email:msg-1', vendor: 'Hand-edited vendor name' }];
    const incoming = [{ ref: 'receipt-email:msg-1', vendor: 'Original AI guess' }];
    const merged = mergeReceiptDrafts(existing, incoming);
    expect(merged).toHaveLength(1);
    expect(merged[0].vendor).toBe('Hand-edited vendor name');
  });

  it('appends a genuinely new find after what is already there, not before it', () => {
    const existing = [{ ref: 'receipt-email:msg-1' }];
    const incoming = [{ ref: 'receipt-email:msg-2' }];
    const merged = mergeReceiptDrafts(existing, incoming);
    expect(merged.map(d => d.ref)).toEqual(['receipt-email:msg-1', 'receipt-email:msg-2']);
  });

  it('dedupes the incoming batch against itself, not just against existing', () => {
    const merged = mergeReceiptDrafts([], [
      { ref: 'receipt-email:msg-1' },
      { ref: 'receipt-email:msg-1' },
    ]);
    expect(merged).toHaveLength(1);
  });

  it('accepts a custom key, for rows identified by something other than ref', () => {
    const existing = [{ _inboxId: 'gmail_abc' }];
    const incoming = [{ _inboxId: 'gmail_abc' }, { _inboxId: 'gmail_def' }];
    const merged = mergeReceiptDrafts(existing, incoming, d => d._inboxId);
    expect(merged.map(d => d._inboxId)).toEqual(['gmail_abc', 'gmail_def']);
  });

  it('survives being handed nothing at all', () => {
    expect(mergeReceiptDrafts()).toEqual([]);
    expect(mergeReceiptDrafts(undefined, undefined)).toEqual([]);
  });
});

describe('the search window never closes past a receipt still waiting for review', () => {
  it('starts at the cold-start horizon on a first-ever run', () => {
    const now = new Date('2026-09-14T12:00:00Z').getTime();
    expect(receiptSweepWindowStart({ now, coldStartDays: 14 })).toBe(now - 14 * 86400000);
  });

  it('overlaps the last run by a day when nothing is pending', () => {
    const now = new Date('2026-09-14T12:00:00Z').getTime();
    const lastStamp = now - 3600000; // an hour ago
    expect(receiptSweepWindowStart({ lastStamp, now })).toBe(lastStamp - 86400000);
  });

  it('clamps to the oldest unresolved find, not the last-checked stamp — the whole point', () => {
    // This is the case that proves a reload cannot lose a found-but-unreviewed
    // receipt: the stamp says the sweep ran an hour ago, but a receipt found
    // three days ago is still sitting in the table unimported. The window
    // must reach back far enough to see it again.
    const now = new Date('2026-09-14T12:00:00Z').getTime();
    const lastStamp = now - 3600000;
    const threeDaysAgo = now - 3 * 86400000;
    const start = receiptSweepWindowStart({ lastStamp, pendingFoundAts: [threeDaysAgo], now });
    expect(start).toBe(threeDaysAgo);
    expect(start).toBeLessThan(lastStamp - 86400000);
  });

  it('picks the oldest of several pending finds', () => {
    const now = new Date('2026-09-14T12:00:00Z').getTime();
    const oldest = now - 5 * 86400000;
    const start = receiptSweepWindowStart({
      lastStamp: now - 3600000,
      pendingFoundAts: [now - 86400000, oldest, now - 2 * 86400000],
      now,
    });
    expect(start).toBe(oldest);
  });

  it('reaches back for a pending item however old, because losing it is the one thing this guards against', () => {
    // An item this stale would not exist in ordinary use — it would already
    // have been imported or dismissed — but the guarantee is unconditional:
    // whatever is still unresolved must still be findable, cold-start window
    // or not.
    const now = new Date('2026-09-14T12:00:00Z').getTime();
    const ancientFind = now - 400 * 86400000;
    const start = receiptSweepWindowStart({ pendingFoundAts: [ancientFind], coldStartDays: 14, now });
    expect(start).toBe(ancientFind);
  });
});
