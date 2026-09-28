import { describe, it, expect, beforeAll, vi } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';

let app, win;

beforeAll(async () => {
  app = await loadApp({ books: [makeBook({ id: 'hound', title: 'The Hound' })] });
  win = app.window;
}, 30000);

describe('review and file it navigation', () => {
  it('openReceiptSweepReviewFromAlert takes publisher to Tax Centre email import tab and dismisses alert', () => {
    win.openM('notifications');
    expect(document.getElementById('m-notifications').style.display).not.toBe('none');

    const event = { stopPropagation: vi.fn(), preventDefault: vi.fn() };
    win.openReceiptSweepReviewFromAlert(event);

    expect(event.stopPropagation).toHaveBeenCalled();
    // Notification modal is dismissed so review workspace is directly reachable
    expect(document.getElementById('m-notifications').style.display).toBe('none');
    // Tab and sub-tab are active
    const tab = document.getElementById('tab-taxcenter');
    expect(tab.classList.contains('active')).toBe(true);
    const subSection = document.getElementById('tc-sec-email-import');
    expect(subSection.style.display).not.toBe('none');
    expect(document.getElementById('email-tab-review').getAttribute('aria-selected')).toBe('true');
    expect(document.getElementById('email-receipt-results').hidden).toBe(false);
  });

  it('fileReadyReceiptsFromAlert takes publisher to review page with ready receipts selected rather than auto-filing', () => {
    const expensesBefore = (app.main.TAX_CENTER.businessExpenses || []).length;
    const event = { stopPropagation: vi.fn(), preventDefault: vi.fn() };
    win.fileReadyReceiptsFromAlert(event);

    expect(event.stopPropagation).toHaveBeenCalled();
    const tab = document.getElementById('tab-taxcenter');
    expect(tab.classList.contains('active')).toBe(true);
    const subSection = document.getElementById('tc-sec-email-import');
    expect(subSection.style.display).not.toBe('none');

    // Crucial requirement: It takes the user to the review page where they decide;
    // it does NOT silently write to ledger without review.
    expect((app.main.TAX_CENTER.businessExpenses || []).length).toBe(expensesBefore);
  });

  it('renders and restores drafts from localStorage in the review workspace', () => {
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
        _fromSweep: true,
      },
    ];
    localStorage.setItem('lm-email-receipt-drafts', JSON.stringify(drafts));

    win.openReceiptSweepReviewFromAlert();

    const results = document.getElementById('email-receipt-results');
    expect(results.innerHTML).toContain('Big Cartel');
    expect(results.innerHTML).toContain('File selected receipts');
  });
});
