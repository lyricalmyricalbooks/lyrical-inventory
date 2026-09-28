import { describe, it, expect, beforeAll, vi } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';

let app, win;

beforeAll(async () => {
  app = await loadApp({ books: [makeBook({ id: 'hound', title: 'The Hound' })] });
  win = app.window;
}, 30000);

const inbox = () => document.getElementById('m-review-inbox');

describe('review and file it navigation', () => {
  it('openReceiptSweepReviewFromAlert opens the review inbox on the receipts and closes the notifications window', () => {
    win.openM('notifications');
    expect(document.getElementById('m-notifications').style.display).not.toBe('none');

    const event = { stopPropagation: vi.fn(), preventDefault: vi.fn() };
    win.openReceiptSweepReviewFromAlert(event);

    expect(event.stopPropagation).toHaveBeenCalled();
    // The notification window steps aside so the inbox is directly reachable.
    expect(document.getElementById('m-notifications').style.display).toBe('none');
    expect(inbox().style.display).toBe('flex');
    // With nothing waiting it says so, rather than showing an empty list.
    expect(document.getElementById('ri-detail').innerHTML).toContain('All caught up');
  });

  it('fileReadyReceiptsFromAlert opens the inbox for a decision rather than auto-filing', () => {
    win.closeM('review-inbox');
    const expensesBefore = (app.main.TAX_CENTER.businessExpenses || []).length;
    const event = { stopPropagation: vi.fn(), preventDefault: vi.fn() };
    win.fileReadyReceiptsFromAlert(event);

    expect(event.stopPropagation).toHaveBeenCalled();
    expect(inbox().style.display).toBe('flex');
    // Crucial requirement: it takes the user to where they decide;
    // it does NOT silently write to the ledger without review.
    expect((app.main.TAX_CENTER.businessExpenses || []).length).toBe(expensesBefore);
  });

  it('lists a saved draft in the inbox with what the app found and what to do', () => {
    const drafts = [
      {
        ref: 'receipt-email:test-bigcartel',
        vendor: 'Big Cartel',
        description: 'Subscription',
        amount: 15,
        currency: 'USD',
        category: 'Software & Subscriptions',
        confidence: 0.95,
        date: '2026-09-25',
        emailFrom: 'billing@bigcartel.com',
        _fromSweep: true,
      },
    ];
    localStorage.setItem('lm-email-receipt-drafts', JSON.stringify(drafts));

    win.closeM('review-inbox');
    win.openReceiptSweepReviewFromAlert();

    const list = document.getElementById('ri-list').innerHTML;
    expect(list).toContain('Big Cartel');
    expect(list).toContain('Ready to file');
    const detail = document.getElementById('ri-detail').innerHTML;
    expect(detail).toContain('What to do');
    expect(detail).toContain('File this receipt');
    expect(detail).toContain('billing@bigcartel.com');
  });
});
