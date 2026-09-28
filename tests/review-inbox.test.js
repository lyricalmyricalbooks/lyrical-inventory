import { describe, it, expect, beforeAll } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';
import { modalFieldsChanged } from '../src/lib/modal.js';

let app, win;

const detail = () => document.getElementById('ri-detail');
const fileButton = () => document.querySelector('#ri-detail [data-ri-action="file"]');

beforeAll(async () => {
  app = await loadApp({ books: [makeBook({ id: 'hound', title: 'The Hound' })] });
  win = app.window;
  localStorage.setItem('lm-email-receipt-drafts', JSON.stringify([
    { ref: 'receipt-email:no-amount', vendor: 'Mystery Co', amount: 0, amountUnknown: true, currency: 'CAD', category: 'Software & Subscriptions', date: '2026-09-25', confidence: 0.9, _fromSweep: true },
  ]));
}, 30000);

describe('the review inbox', () => {
  it('explains what is waiting before asking for anything', () => {
    win.openReviewInbox({ filter: 'receipt' });
    expect(document.getElementById('m-review-inbox').style.display).toBe('flex');
    expect(document.getElementById('ri-summary').textContent).toBe('1 receipt to review. 1 needs something from you.');
    expect(detail().innerHTML).toContain('Why it is here');
    expect(detail().innerHTML).toContain('The amount could not be read');
    expect(detail().innerHTML).toContain('What to do');
  });

  it('will not file a receipt with no amount, and says what is missing', () => {
    expect(fileButton().disabled).toBe(true);
    expect(detail().innerHTML).toContain('Fill in the missing details above to file it.');
  });

  it('becomes ready to file once the amount is typed, without losing the box being edited', () => {
    const amount = detail().querySelector('[data-ri-field="amount"]');
    amount.value = '15.00';
    amount.dispatchEvent(new win.Event('change', { bubbles: true }));

    // The same box is still on screen (it was not rebuilt under the typist)...
    expect(detail().querySelector('[data-ri-field="amount"]')).toBe(amount);
    // ...while the guidance and the button caught up.
    expect(fileButton().disabled).toBe(false);
    expect(document.getElementById('ri-list').innerHTML).toContain('Ready to file');
    expect(document.getElementById('ri-summary').textContent).toContain('1 is ready to file');
  });

  it('does not count typing in it as unsaved changes when it is closed', () => {
    expect(modalFieldsChanged('review-inbox')).toBe(false);
  });

  it('shows the empty state when the filter has nothing', () => {
    win.openReviewInbox({ filter: 'label' });
    // No labels waiting: it falls back to everything rather than showing a blank list.
    expect(document.querySelector('[data-ri-filter="all"]').getAttribute('aria-pressed')).toBe('true');
  });

  it('reviews shipping labels here: order link, "not a website order", and link-certain', () => {
    app.main.TAX_CENTER.businessExpenses = [
      { id: 1, ref: 'postage:EE9', desc: 'Expedited Parcel', date: '2026-09-27', amount: 12.5, currency: 'CAD', postageSource: 'email', shippingMatchStatus: 'unmatched' },
    ];
    win.openReviewInbox({ filter: 'label' });
    const html = detail().innerHTML;
    expect(html).toContain('Order this label was for');
    expect(html).toContain('data-ri-action="link"');
    expect(html).toContain('Not a website order');
    expect(document.getElementById('ri-link-certain').hidden).toBe(false);
  });
});
