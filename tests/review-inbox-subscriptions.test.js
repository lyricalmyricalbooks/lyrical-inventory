// The review inbox, for receipts that belong to a subscription charge: the
// receipt is kept as that charge's proof (or counts the next charge early)
// instead of being filed as a second copy of the same cost.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';
import { modalFieldsChanged } from '../src/lib/modal.js';

let app, win, TC;

const pad = n => String(n).padStart(2, '0');
const ymdOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const now = new Date();
const thisMonth = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
const monthBack = (n) => {
  const d = new Date(now.getFullYear(), now.getMonth() - n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

const detail = () => document.getElementById('ri-detail');
const button = action => document.querySelector(`#ri-detail [data-ri-action="${action}"]`);
const subLines = id => TC().businessExpenses.filter(e => e.recurringId === id);

function bigCartel(over = {}) {
  return {
    id: 'rec_bc', desc: 'Big Cartel Website', vendor: '', cat: 'Software & Subscriptions',
    currency: 'USD', amount: 15, startDate: `${monthBack(3)}-01`, frequency: 'monthly', lastInjected: '', ...over,
  };
}

function receipt(over = {}) {
  return {
    ref: `receipt-email:${over.msgId || 'bc1'}:0`, msgId: 'bc1', vendor: 'Big Cartel', amount: 15, currency: 'USD',
    category: 'Software & Subscriptions', date: `${thisMonth}-04`, confidence: 0.95, _fromSweep: true,
    emailFrom: 'Big Cartel <support@bigcartel.com>', receipt: 'https://example.com/bc.pdf', ...over,
  };
}

/** A fresh Tax Centre with these subscriptions posted up to today, and these drafts waiting. */
async function setup({ recurring = [bigCartel()], expenses = [], drafts = [] } = {}) {
  TC().recurring = recurring;
  TC().businessExpenses = expenses;
  win.processRecurringExpenses();
  localStorage.setItem('lm-email-receipt-drafts', JSON.stringify(drafts));
  await app.settle();
}

beforeAll(async () => {
  app = await loadApp({ books: [makeBook({ id: 'hound', title: 'The Hound' })] });
  win = app.window;
  TC = () => app.main.TAX_CENTER;
}, 30000);

beforeEach(() => {
  const toast = document.getElementById('toast');
  if (toast) toast.textContent = '';
});

describe('a receipt for a subscription charge already in the books', () => {
  it('says it is already counted, and keeps it as proof instead of filing it again', async () => {
    await setup({ drafts: [receipt()] });
    const before = TC().businessExpenses.length;
    expect(subLines('rec_bc')).toHaveLength(4);

    win.openReviewInbox({ filter: 'receipt' });
    expect(detail().textContent).toContain('This is the');
    expect(detail().textContent).toContain('of your Big Cartel Website subscription');
    expect(detail().textContent).toContain('already counted in your books');
    expect(button('file').textContent).toBe('Attach as proof');
    expect(button('separate')).not.toBeNull();
    expect(document.getElementById('ri-list').textContent).toContain('Big Cartel Website subscription');

    button('file').click();
    await app.settle(10);

    expect(TC().businessExpenses).toHaveLength(before);
    const line = subLines('rec_bc').find(e => e.date === `${thisMonth}-01`);
    expect(line.receipt).toBe('https://example.com/bc.pdf');
    expect(line.receiptDate).toBe(`${thisMonth}-04`);
    expect(line.emailMsgId).toBe('bc1');
    expect(line.amount).toBe(15);
    expect(TC().recurring[0].receiptSenders).toEqual(['support@bigcartel.com']);
    expect(app.toast()).toContain('Kept as proof');
    expect(document.getElementById('ri-summary').textContent).toBe('Nothing is waiting for review.');
  });

  it('asks what a receipt at another amount is, picks nothing for the owner, and uses the answer', async () => {
    const prev = monthBack(1);
    await setup({ drafts: [receipt({ msgId: 'bc2', amount: 16.2, date: `${prev}-06` })] });
    win.openReviewInbox({ filter: 'receipt' });
    expect(detail().textContent).toContain('It looks like');
    expect(detail().textContent).toContain('But the receipt says USD 16.20. It may be that charge at a different amount, or a separate purchase from the same company.');
    const choices = [...detail().querySelectorAll('[data-ri-field="subscriptionAmount"]')].map(r => r.value);
    // An older charge can't start a new price "from here on".
    expect(choices).toEqual(['keep', 'receipt', 'separate']);
    expect(choices.some(v => detail().querySelector(`[value="${v}"]`).checked)).toBe(false);
    expect(button('file').disabled).toBe(true);
    expect(detail().textContent).toContain('Choose what this receipt is above first.');
    expect(button('separate')).toBeNull();
    // Nothing reaches the books while it is unanswered.
    const before = JSON.stringify(TC().businessExpenses);
    await win.importEmailReceiptDrafts?.();
    await app.settle(10);
    expect(JSON.stringify(TC().businessExpenses)).toBe(before);
    win.closeM('email-receipt-import-modal');
    win.openReviewInbox({ filter: 'receipt' });

    const useReceipt = detail().querySelector('[value="receipt"]');
    useReceipt.checked = true;
    useReceipt.dispatchEvent(new win.Event('change', { bubbles: true }));
    await app.settle();
    expect(button('file').disabled).toBe(false);
    button('file').click();
    await app.settle(10);

    const line = subLines('rec_bc').find(e => e.date === `${prev}-01`);
    expect(line.amount).toBe(16.2);
    expect(line.amountFromReceipt).toBe(true);
    expect(line.receiptAmount).toBe(16.2);
    expect(subLines('rec_bc')).toHaveLength(4);
    // Vouched for by the owner, not matched on amount: its sender is not learned.
    expect(TC().recurring[0].receiptSenders).toBeUndefined();
  });

  it('files the receipt on its own when "A separate purchase" is the answer', async () => {
    await setup({ drafts: [receipt({ msgId: 'bc9', vendor: 'Big Cartel', amount: 84.5, date: `${thisMonth}-09` })] });
    win.openReviewInbox({ filter: 'receipt' });
    const separate = detail().querySelector('[value="separate"]');
    separate.checked = true;
    separate.dispatchEvent(new win.Event('change', { bubbles: true }));
    await app.settle();
    expect(button('file').textContent).toBe('File this receipt');
    const before = TC().businessExpenses.length;
    button('file').click();
    await app.settle(10);
    expect(TC().businessExpenses).toHaveLength(before + 1);
    expect(TC().businessExpenses[0].amount).toBe(84.5);
    expect(subLines('rec_bc').every(e => !e.receipt)).toBe(true);
  });

  it('files a separate purchase on its own when the owner says so, and can take that back', async () => {
    await setup({ drafts: [receipt({ msgId: 'bc3' })] });
    win.openReviewInbox({ filter: 'receipt' });
    button('separate').click();
    await app.settle();
    expect(detail().textContent).toContain('You said this is separate from your Big Cartel Website subscription');
    expect(button('file').textContent).toBe('File this receipt');
    button('unseparate').click();
    await app.settle();
    expect(button('file').textContent).toBe('Attach as proof');

    button('separate').click();
    await app.settle();
    const before = TC().businessExpenses.length;
    button('file').click();
    await app.settle(10);
    expect(TC().businessExpenses).toHaveLength(before + 1);
    expect(TC().businessExpenses[0].desc).toBe('Big Cartel');
    // Filed on purpose beside the charge, so it is not then called a double.
    expect(TC().businessExpenses[0].notSubscriptionDouble).toBe(true);
    expect(document.getElementById('ri-summary').textContent).toBe('Nothing is waiting for review.');
  });
});

describe('two devices', () => {
  it('does not post a charge again that another device already posted', async () => {
    await setup({ drafts: [receipt({ msgId: 'cp1', vendor: 'Canada Post', amount: 12.4, currency: 'CAD', category: 'Shipping & Postage', emailFrom: '' })] });
    // The other device's saved books carry this month's charge…
    const remote = JSON.parse(JSON.stringify(TC()));
    remote.businessExpenses.find(e => e.recurringId === 'rec_bc' && e.recurringPeriod === thisMonth).id = 'from-other-device';
    app.cloud.settings.taxCenter = remote;
    // …while this one was opened before it was posted and never reloaded.
    TC().businessExpenses = TC().businessExpenses.filter(e => e.recurringPeriod !== thisMonth);
    TC().recurring[0].lastInjected = monthBack(1);

    win.openReviewInbox({ filter: 'receipt' });
    button('file').click();
    await app.settle(10);
    expect(subLines('rec_bc').filter(e => e.recurringPeriod === thisMonth).map(e => e.id)).toEqual(['from-other-device']);
    expect(TC().businessExpenses.some(e => e.vendor === 'Canada Post')).toBe(true);
    win.closeM('review-inbox');
  });
});

describe('a bill that arrives before its charge is due', () => {
  it('counts the charge now on its own due date, and the subscription does not add it again', async () => {
    let due = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
    if (due.getDate() > 28) due = new Date(due.getFullYear(), due.getMonth(), 28);
    const start = new Date(due.getFullYear(), due.getMonth() - 3, due.getDate());
    const phone = {
      id: 'rec_phone', desc: 'Phone Bill', vendor: 'Freedom mobile', cat: 'Home Office',
      currency: 'CAD', amount: 56.5, startDate: ymdOf(start), frequency: 'monthly', lastInjected: '',
    };
    await setup({
      recurring: [phone],
      drafts: [receipt({ msgId: 'fm1', vendor: 'Freedom Mobile', amount: 56.5, currency: 'CAD', category: 'Home Office', date: ymdOf(now), emailFrom: 'Freedom <billing@freedommobile.ca>' })],
    });
    const posted = subLines('rec_phone').length;
    win.openReviewInbox({ filter: 'receipt' });
    expect(detail().textContent).toContain('It has not been counted yet.');
    expect(detail().textContent).toContain(`goes into your books on its due date, ${ymdOf(due)}`);
    expect(button('file').textContent).toBe('Attach as proof');

    button('file').click();
    await app.settle(10);
    const lines = subLines('rec_phone');
    expect(lines).toHaveLength(posted + 1);
    const early = lines.find(e => e.recurringPeriod === ymdOf(due).slice(0, 7));
    // Dated when it is due, not when the bill was sent, so it can never land in
    // the month (or tax year) before; the bill's date is kept beside it.
    expect(early.date).toBe(ymdOf(due));
    expect(early.receiptDate).toBe(ymdOf(now));
    expect(early.amount).toBe(56.5);
    expect(early.receipt).toBe('https://example.com/bc.pdf');
    expect(TC().recurring[0].lastInjected).toBe(ymdOf(due).slice(0, 7));

    win.processRecurringExpenses();
    expect(subLines('rec_phone')).toHaveLength(posted + 1);
  });
});

describe('two subscriptions from the same company', () => {
  it('asks which one before anything can be filed', async () => {
    const internet = { id: 'rec_net', desc: 'Internet', vendor: 'Freedom mobile', cat: 'Home Office', currency: 'CAD', amount: 51, startDate: `${monthBack(2)}-01`, frequency: 'monthly', lastInjected: '' };
    const phone = { id: 'rec_phone', desc: 'Phone Bill', vendor: 'Freedom mobile', cat: 'Home Office', currency: 'CAD', amount: 56.5, startDate: `${monthBack(2)}-01`, frequency: 'monthly', lastInjected: '' };
    await setup({
      recurring: [internet, phone],
      drafts: [receipt({ msgId: 'fm2', vendor: 'Freedom Mobile', amount: 60.1, currency: 'CAD', category: 'Home Office', date: `${thisMonth}-03`, emailFrom: '' })],
    });
    win.openReviewInbox({ filter: 'receipt' });
    expect(detail().textContent).toContain('It could be the charge of more than one of your subscriptions');
    expect(button('file').disabled).toBe(true);
    expect(detail().textContent).toContain('Choose the subscription above first.');

    const pick = detail().querySelector('[data-ri-field="subscriptionId"]');
    pick.value = 'rec_phone';
    pick.dispatchEvent(new win.Event('change', { bubbles: true }));
    await app.settle();
    expect(detail().textContent).toContain('of your Phone Bill subscription');
    expect(detail().querySelector('[value="price"]')).not.toBeNull();
    // Picked the subscription; what the different amount is still waits.
    expect(button('file').disabled).toBe(true);
    const keep = detail().querySelector('[value="keep"]');
    keep.checked = true;
    keep.dispatchEvent(new win.Event('change', { bubbles: true }));
    await app.settle();
    expect(button('file').disabled).toBe(false);

    const before = TC().businessExpenses.length;
    button('file').click();
    await app.settle(10);
    expect(TC().businessExpenses).toHaveLength(before);
    const line = subLines('rec_phone').find(e => e.date === `${thisMonth}-01`);
    expect(line.receiptAmount).toBe(60.1);
    expect(line.amount).toBe(56.5);
  });
});

describe('a cost already in the books twice', () => {
  it('shows up for review and merges into the subscription charge', async () => {
    const extra = {
      id: 777, desc: 'Big Cartel', vendor: 'Big Cartel', cat: 'Software & Subscriptions', currency: 'USD', amount: 15,
      origCurrency: 'USD', origAmount: 15, date: `${thisMonth}-04`, ref: 'receipt-email:old:0', importedFromEmail: true,
      receipt: 'https://example.com/old.pdf', receiptFiles: ['https://example.com/old.pdf'], emailMsgId: 'old',
    };
    await setup({ expenses: [extra] });
    win.openReviewInbox({ filter: 'receipt' });
    expect(document.getElementById('ri-summary').textContent).toContain('1 cost counted twice to review');
    expect(detail().textContent).toContain('looks like a second copy of');
    expect(detail().textContent).toContain('Right now your books count that cost twice.');

    button('merge').click();
    await app.answerConfirm(true);
    await app.settle(10);
    expect(TC().businessExpenses.some(e => e.id === 777)).toBe(false);
    const line = subLines('rec_bc').find(e => e.date === `${thisMonth}-01`);
    expect(line.receiptFiles).toEqual(['https://example.com/old.pdf']);
    expect(line.receiptRef).toBe('receipt-email:old:0');
    expect(line.receiptDate).toBe(`${thisMonth}-04`);
    expect(app.toast()).toContain('counted once');
  });

  it('keeps two different costs apart for good when told to', async () => {
    const other = { id: 778, desc: 'Big Cartel', vendor: 'Big Cartel', currency: 'USD', amount: 15, date: `${thisMonth}-05` };
    await setup({ expenses: [other] });
    win.openReviewInbox({ filter: 'all' });
    button('keepApart').click();
    await app.settle(10);
    expect(TC().businessExpenses.find(e => e.id === 778).notSubscriptionDouble).toBe('rec_bc');
    expect(document.getElementById('ri-summary').textContent).toBe('Nothing is waiting for review.');
  });
});

describe('the subscriptions panel', () => {
  const row = () => document.querySelector('#tc-recurring-body .rec-row');

  it('says how many posted charges have their receipt', async () => {
    await setup();
    subLines('rec_bc')[0].receipt = 'https://example.com/a.pdf';
    win.renderTaxCenter();
    expect(row().textContent).toContain('4 charges logged');
    expect(row().textContent).toContain('· 1 with a receipt');
    subLines('rec_bc').forEach(e => { e.receipt = 'https://example.com/a.pdf'; });
    win.renderTaxCenter();
    expect(row().textContent).toContain('· all 4 with receipts');
  });

  it('offers to move the charge day when the receipts keep landing later', async () => {
    await setup();
    const [latest, previous] = subLines('rec_bc');
    latest.receiptDate = `${latest.date.slice(0, 7)}-16`;
    previous.receiptDate = `${previous.date.slice(0, 7)}-16`;
    win.renderTaxCenter();
    expect(row().textContent).toContain('Its last two receipts are dated the 16th.');

    const move = row().querySelector('[onclick^="tcMoveRecurringDay"]');
    await win.tcMoveRecurringDay('rec_bc', 16);
    await app.settle();
    expect(move.textContent).toContain('Charge on the 16th');
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 16);
    expect(row().querySelector('.rec-next-date').textContent).toBe(ymdOf(next));
    expect(row().textContent).not.toContain('Its last two receipts');
    // Nothing already posted moved.
    expect(subLines('rec_bc').map(e => e.date.slice(8))).toEqual(['01', '01', '01', '01']);
  });

  it('can be told to keep the day as it is', async () => {
    await setup();
    const [latest, previous] = subLines('rec_bc');
    latest.receiptDate = `${latest.date.slice(0, 7)}-20`;
    previous.receiptDate = `${previous.date.slice(0, 7)}-20`;
    win.renderTaxCenter();
    await win.tcKeepRecurringDay('rec_bc', 20);
    await app.settle();
    expect(TC().recurring[0].dayHintDismissed).toBe(20);
    expect(row().textContent).not.toContain('Its last two receipts');
  });

  it('warns about a cost counted twice and opens the inbox on it', async () => {
    const extra = { id: 991, desc: 'Big Cartel', vendor: 'Big Cartel', currency: 'USD', amount: 15, date: `${thisMonth}-04` };
    await setup({ expenses: [extra] });
    win.renderTaxCenter();
    const note = document.getElementById('tc-recurring-doubles');
    expect(note.hidden).toBe(false);
    expect(note.textContent).toContain('One cost looks counted twice.');

    win.tcReviewSubscriptionDoubles();
    await app.settle();
    expect(document.getElementById('m-review-inbox').style.display).toBe('flex');
    expect(document.querySelector('#ri-detail [data-ri-action="merge"]')).not.toBeNull();
    win.closeM('review-inbox');

    win.tcCloseSubscriptionDoublesNote();
    expect(note.hidden).toBe(true);
  });
});

describe('answers that stay changeable', () => {
  it('keeps the subscription picker after a choice, and the answers never count as unsaved work', async () => {
    const internet = { id: 'rec_net', desc: 'Internet', vendor: 'Freedom mobile', cat: 'Home Office', currency: 'CAD', amount: 51, startDate: `${monthBack(2)}-01`, frequency: 'monthly', lastInjected: '' };
    const phone = { id: 'rec_phone', desc: 'Phone Bill', vendor: 'Freedom mobile', cat: 'Home Office', currency: 'CAD', amount: 56.5, startDate: `${monthBack(2)}-01`, frequency: 'monthly', lastInjected: '' };
    await setup({
      recurring: [internet, phone],
      drafts: [receipt({ msgId: 'fm5', vendor: 'Freedom Mobile', amount: 60.1, currency: 'CAD', category: 'Home Office', date: `${thisMonth}-03`, emailFrom: '' })],
    });
    win.openReviewInbox({ filter: 'receipt' });
    let pick = detail().querySelector('[data-ri-field="subscriptionId"]');
    pick.value = 'rec_phone';
    pick.dispatchEvent(new win.Event('change', { bubbles: true }));
    await app.settle();
    const price = detail().querySelector('[value="price"]');
    price.checked = true;
    price.dispatchEvent(new win.Event('change', { bubbles: true }));

    pick = detail().querySelector('[data-ri-field="subscriptionId"]');
    expect(pick.value).toBe('rec_phone');
    pick.value = 'rec_net';
    pick.dispatchEvent(new win.Event('change', { bubbles: true }));
    await app.settle();
    expect(detail().textContent).toContain('of your Internet subscription');
    // The answer was for the other subscription, so it is asked again.
    expect(detail().querySelector('[value="keep"]').checked).toBe(false);
    expect(button('file').disabled).toBe(true);
    expect(modalFieldsChanged('review-inbox')).toBe(false);
    const keep = detail().querySelector('[value="keep"]');
    keep.checked = true;
    keep.dispatchEvent(new win.Event('change', { bubbles: true }));
    await app.settle();
    button('file').click();
    await app.settle(10);
    expect(subLines('rec_net').find(e => e.date === `${thisMonth}-01`).receiptAmount).toBe(60.1);
    win.closeM('review-inbox');
  });
});

describe('the full receipts table', () => {
  it('asks what filing a subscription receipt does, and can file it on its own', async () => {
    await setup({ drafts: [receipt({ msgId: 'tb1', amount: 29.99, date: `${thisMonth}-06` })] });
    win.openEmailReceiptImportModal({ review: true });
    await app.settle();
    const pick = document.querySelector('[data-erd-field="subscriptionPick"]');
    expect([...pick.options].map(o => o.value)).toEqual(['', 'sub:rec_bc:keep', 'sub:rec_bc:receipt', 'separate']);
    // A different amount from the right company: nothing is chosen for the owner.
    expect(pick.value).toBe('');

    pick.value = 'separate';
    pick.dispatchEvent(new win.Event('change', { bubbles: true }));
    await app.settle();
    expect(document.querySelector('[data-erd-field="subscriptionPick"]').value).toBe('separate');

    const before = TC().businessExpenses.length;
    await win.importEmailReceiptDrafts();
    await app.settle(10);
    expect(TC().businessExpenses).toHaveLength(before + 1);
    expect(TC().businessExpenses[0].amount).toBe(29.99);
    expect(subLines('rec_bc').every(e => !e.receipt)).toBe(true);
  });
});
