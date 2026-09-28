import { describe, it, expect } from 'vitest';
import {
  REVIEW_STATE,
  buildReviewQueue,
  labelReviewItem,
  receiptKey,
  receiptReviewItem,
  reviewTaskStillOpen,
  summarizeReviewQueue,
} from '../src/lib/review-queue.js';

const receipt = (over = {}) => ({
  ref: 'receipt-email:1', vendor: 'Big Cartel', amount: 15, currency: 'USD', category: 'Software & Subscriptions',
  date: '2026-09-27', confidence: 0.95, emailFrom: 'billing@bigcartel.com', ...over,
});

describe('receipt review items', () => {
  it('calls a complete, unmatched, confident receipt ready to file', () => {
    const item = receiptReviewItem(receipt());
    expect(item.state).toBe(REVIEW_STATE.ready);
    expect(item.reasons).toEqual([]);
    expect(item.subtitle).toBe('USD 15.00 · Software & Subscriptions');
    expect(item.steps.join(' ')).toContain('File this receipt');
  });

  it('needs the owner when the amount could not be read, and says so in words', () => {
    const item = receiptReviewItem(receipt({ amountUnknown: true, amount: 0 }));
    expect(item.state).toBe(REVIEW_STATE.needsYou);
    expect(item.subtitle).toBe('Amount needed');
    expect(item.reasons[0]).toMatch(/amount could not be read/);
  });

  it('asks for a look when the category is vague or the reader was unsure', () => {
    expect(receiptReviewItem(receipt({ category: 'Other' })).state).toBe(REVIEW_STATE.check);
    const unsure = receiptReviewItem(receipt({ confidence: 0.4 }));
    expect(unsure.state).toBe(REVIEW_STATE.check);
    expect(unsure.reasons.join(' ')).toMatch(/not sure/);
  });

  it('never calls a likely duplicate ready, and explains what filing it again would do', () => {
    const item = receiptReviewItem(receipt(), { duplicate: true });
    expect(item.state).toBe(REVIEW_STATE.check);
    expect(item.reasons[0]).toMatch(/twice/);
    expect(item.steps.join(' ')).toContain('Already in my books');
  });

  it('has a stable key that survives a reload', () => {
    expect(receiptKey({ ref: 'r1' })).toBe('receipt:r1');
    expect(receiptKey({ msgId: 'm9' })).toBe('receipt:m9');
    expect(receiptKey({}, 3)).toBe('receipt:row-3');
  });
});

describe('label review items', () => {
  const expense = { ref: 'postage:abc', desc: 'Expedited Parcel', date: '2026-09-26', postageSource: 'email', amount: 0, recipientName: 'Dana', trackingNumber: '7023' };

  it('needs the owner for an amount, and shows the price as unread rather than zero', () => {
    const item = labelReviewItem(expense, { needsAmount: true });
    expect(item.state).toBe(REVIEW_STATE.needsYou);
    expect(item.facts).toContainEqual(['Amount', 'Not read']);
    expect(item.facts).toContainEqual(['Found in', 'Shipping confirmation email']);
    expect(item.steps.join(' ')).toContain('Remove label');
  });

  it('names the guessed order and offers a safe way out for an unlinked label', () => {
    const item = labelReviewItem({ ...expense, amount: 12.5, currency: 'CAD' }, { needsOrder: true, suggestedOrder: '#AB-1' });
    expect(item.state).toBe(REVIEW_STATE.check);
    expect(item.reasons[0]).toContain('#AB-1');
    expect(item.subtitle).toBe('CAD 12.50 · needs order');
    const steps = item.steps.join(' ');
    expect(steps).toContain('Not a website order');
    // Removing a label deletes a real expense, so it is only offered for one with no price.
    expect(steps).not.toContain('Remove label');
  });

  it('can need both jobs at once', () => {
    const item = labelReviewItem(expense, { needsAmount: true, needsOrder: true });
    expect(item.subtitle).toBe('Amount needed · needs amount and order');
    expect(item.reasons).toHaveLength(2);
  });
});

describe('the queue as a whole', () => {
  const labels = [{ expense: { ref: 'postage:1', amount: 9, currency: 'CAD' }, needsOrder: true }];

  it('puts what only the owner can settle first and quick wins last', () => {
    const queue = buildReviewQueue({
      receiptDrafts: [receipt({ ref: 'a' }), receipt({ ref: 'b', amountUnknown: true, amount: 0 }), receipt({ ref: 'c', category: 'Other' })],
      labels,
    });
    expect(queue.map(i => [i.key, i.state])).toEqual([
      ['receipt:b', 'needs-you'],
      ['receipt:c', 'check'],
      ['label:postage:1', 'check'],
      ['receipt:a', 'ready'],
    ]);
  });

  it('asks the ledger about duplicates for every receipt', () => {
    const queue = buildReviewQueue({ receiptDrafts: [receipt({ ref: 'a' })], isDuplicate: () => true });
    expect(queue[0].duplicate).toBe(true);
  });

  it('summarises in plain language', () => {
    const queue = buildReviewQueue({
      receiptDrafts: [receipt({ ref: 'a' }), receipt({ ref: 'b', amountUnknown: true, amount: 0 })],
      labels,
    });
    const s = summarizeReviewQueue(queue);
    expect(s).toMatchObject({ total: 3, receipts: 2, labels: 1, ready: 1, needsYou: 1 });
    expect(s.headline).toBe('2 receipts and 1 shipping label to review');
    expect(s.detail).toBe('1 needs something from you, 1 is ready to file, 1 needs a quick check.');
  });

  it('says plainly when there is nothing', () => {
    expect(summarizeReviewQueue([])).toMatchObject({ total: 0, headline: 'Nothing to review' });
    expect(buildReviewQueue()).toEqual([]);
  });
});

describe('notification history knows when the work is finished', () => {
  it('reads receipt and label messages against what is waiting now', () => {
    expect(reviewTaskStillOpen('receipt-sweep', { receipts: 2, labels: 0 })).toBe(true);
    expect(reviewTaskStillOpen('receipt-sweep', { receipts: 0, labels: 5 })).toBe(false);
    expect(reviewTaskStillOpen('postage-sweep-your-email', { receipts: 0, labels: 1 })).toBe(true);
    expect(reviewTaskStillOpen('shippo-labels', { receipts: 3, labels: 0 })).toBe(false);
    expect(reviewTaskStillOpen('todo:orders-labels', { labels: 2 })).toBe(true);
  });

  it('has no opinion about any other kind of message', () => {
    expect(reviewTaskStillOpen('health-bigcartel', { receipts: 0, labels: 0 })).toBeNull();
    expect(reviewTaskStillOpen('delivery-watch', {})).toBeNull();
  });
});
