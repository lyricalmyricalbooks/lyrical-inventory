import { describe, it, expect } from 'vitest';
import {
  findSubscriptionDoubles,
  hasReceiptProof,
  isSharedSender,
  learnedSenders,
  matchReceiptToSubscription,
  ordinalDay,
  receiptDayHint,
  receiptIdentity,
  receiptProofFields,
  senderAddress,
  subscriptionCandidate,
} from '../src/lib/subscription-receipts.js';
import {
  chargesBetween,
  firstUnpostedCharge,
  laterChargeDayChange,
  nextRateChange,
  nextRecurringDate,
  recurringDueCharges,
} from '../src/lib/recurring.js';

// The owner's real panel, as of 2026-10-18.
const bigCartel = {
  id: 'rec_bc', desc: 'Big Cartel Website', vendor: '', cat: 'Software & Subscriptions',
  currency: 'USD', amount: 15, startDate: '2026-01-05', frequency: 'monthly', lastInjected: '2026-10',
};
const internet = {
  id: 'rec_net', desc: 'Internet', vendor: 'Freedom mobile', cat: 'Home Office',
  currency: 'CAD', amount: 51, startDate: '2026-09-01', frequency: 'monthly', lastInjected: '2026-10',
};
const phone = {
  id: 'rec_phone', desc: 'Phone Bill', vendor: 'Freedom mobile', cat: 'Home Office',
  currency: 'CAD', amount: 56.5, startDate: '2026-06-16', frequency: 'monthly', lastInjected: '2026-10',
};
const rent = {
  id: 'rec_rent', desc: 'Rent (30% of space)', vendor: 'Home Office', cat: 'Home Office',
  currency: 'CAD', amount: 423, startDate: '2026-01-01', frequency: 'monthly', lastInjected: '2026-10',
};
const googleOne = {
  id: 'rec_g1', desc: 'google one', vendor: 'google', cat: 'Software & Subscriptions',
  currency: 'CAD', amount: 3.15, startDate: '2026-01-25', frequency: 'monthly', lastInjected: '2026-09',
};

const line = (sub, date, over = {}) => ({
  id: `${sub.id}-${date}`, desc: `${sub.desc} (Recurring)`, cat: sub.cat, currency: sub.currency,
  amount: sub.amount, date, ref: 'Auto-Injected', recurringId: sub.id, receipt: '', ...over,
});

const ledger = () => [
  line(bigCartel, '2026-09-05'),
  line(bigCartel, '2026-10-05'),
  line(internet, '2026-10-01'),
  line(phone, '2026-10-16'),
  line(rent, '2026-10-01'),
  line(googleOne, '2026-09-25'),
];
const subs = [bigCartel, internet, phone, rent, googleOne];

const bigCartelReceipt = {
  vendor: 'Big Cartel', date: '2026-10-16', amount: 15, currency: 'USD',
  emailFrom: 'Big Cartel <support@bigcartel.com>',
};

describe('sender addresses', () => {
  it('reads the address out of a From line', () => {
    expect(senderAddress('Big Cartel <Support@BigCartel.com>')).toBe('support@bigcartel.com');
    expect(senderAddress('billing@adobe.com')).toBe('billing@adobe.com');
    expect(senderAddress('no address here')).toBe('');
  });

  it('never treats a payment processor as a vendor of its own', () => {
    expect(isSharedSender('receipts+abc@stripe.com')).toBe(true);
    expect(isSharedSender('service@intl.paypal.com')).toBe(true);
    expect(isSharedSender('support@bigcartel.com')).toBe(false);
  });

  it('learns a vendor address once, newest first, and skips processors', () => {
    expect(learnedSenders({}, 'Big Cartel <support@bigcartel.com>')).toEqual(['support@bigcartel.com']);
    expect(learnedSenders({ receiptSenders: ['support@bigcartel.com'] }, 'support@bigcartel.com')).toEqual(['support@bigcartel.com']);
    expect(learnedSenders({ receiptSenders: ['a@x.com'] }, 'receipts@stripe.com')).toEqual(['a@x.com']);
  });
});

describe('who a receipt is from', () => {
  it('matches a vendor whose name sits inside the subscription name', () => {
    expect(receiptIdentity({ vendor: 'Big Cartel' }, bigCartel)).toBe('name');
    expect(receiptIdentity({ vendor: 'Freedom Mobile' }, phone)).toBe('name');
  });

  it('matches on the sending domain when the vendor name is missing', () => {
    expect(receiptIdentity({ vendor: '', emailFrom: 'billing@bigcartel.com' }, bigCartel)).toBe('name');
  });

  it('does not let a company-wide sending domain stand in for a named vendor', () => {
    const workspace = { id: 'rec_ws', desc: 'Google Workspace', vendor: '', currency: 'CAD', amount: 8.4 };
    expect(receiptIdentity({ vendor: 'Google Ads', emailFrom: 'payments-noreply@google.com' }, workspace)).toBe('similar');
    expect(isSharedSender('auto-confirm@amazon.ca')).toBe(true);
    expect(learnedSenders({}, 'auto-confirm@amazon.ca')).toEqual([]);
  });

  it('never treats an order from the same company as the subscription without an answer', () => {
    const prime = { id: 'rec_prime', desc: 'Amazon Prime', vendor: 'Amazon', cat: 'Software & Subscriptions', currency: 'CAD', amount: 9.99, startDate: '2026-01-02', frequency: 'monthly', lastInjected: '2026-10' };
    const books = [line(prime, '2026-10-02')];
    const order = { vendor: 'Amazon.ca', date: '2026-10-09', amount: 84.5, currency: 'CAD', emailFrom: 'auto-confirm@amazon.ca' };
    const result = matchReceiptToSubscription(order, [prime], books);
    // It is offered, but as a mismatch the owner must answer — never a ready match.
    expect(result.match.amountMatches).toBe(false);
    const ads = { vendor: 'Google Ads', date: '2026-10-20', amount: 250, currency: 'CAD', emailFrom: 'payments-noreply@google.com' };
    const workspace = { id: 'rec_ws', desc: 'Google Workspace', vendor: '', currency: 'CAD', amount: 8.4, startDate: '2026-01-15', frequency: 'monthly', lastInjected: '2026-10' };
    expect(matchReceiptToSubscription(ads, [workspace], [line(workspace, '2026-10-15')])).toBeNull();
  });

  it('only calls a vendor that shares a word "similar", not the same', () => {
    expect(receiptIdentity({ vendor: 'Google Ads' }, googleOne)).toBe('similar');
    expect(receiptIdentity({ vendor: 'Canada Post' }, bigCartel)).toBe('');
  });

  it('trusts a learned sender above all, and asks more of a different one', () => {
    const learned = { ...bigCartel, receiptSenders: ['support@bigcartel.com'] };
    expect(receiptIdentity({ vendor: 'Someone', emailFrom: 'support@bigcartel.com' }, learned)).toBe('sender');
    expect(receiptIdentity({ vendor: 'Big Cartel', emailFrom: 'promo@bigcartel.com' }, learned)).toBe('similar');
  });
});

describe('schedule helpers', () => {
  it('lists every charge in a range, posted or not', () => {
    expect(chargesBetween(bigCartel, '2026-10-01', '2026-11-30')).toEqual([
      { date: '2026-10-05', monthKey: '2026-10', amount: 15, posted: true },
      { date: '2026-11-05', monthKey: '2026-11', amount: 15, posted: false },
    ]);
  });

  it('finds the first charge the ledger does not have yet', () => {
    expect(firstUnpostedCharge(bigCartel)).toEqual({ date: '2026-11-05', monthKey: '2026-11', amount: 15 });
    expect(firstUnpostedCharge({ ...bigCartel, endDate: '2026-10-31' })).toBeNull();
  });
});

describe('matching a receipt to a subscription charge', () => {
  it('ties the Big Cartel receipt on the 16th to the charge posted on the 5th', () => {
    const result = matchReceiptToSubscription(bigCartelReceipt, subs, ledger());
    expect(result.ambiguous).toBe(false);
    expect(result.match.subId).toBe('rec_bc');
    expect(result.match.posted).toBe(true);
    expect(result.match.amountMatches).toBe(true);
    expect(result.match.line.date).toBe('2026-10-05');
    expect(result.match.gapDays).toBe(11);
  });

  it('offers the next charge when the bill arrives before it is due', () => {
    const early = { vendor: 'Freedom Mobile', date: '2026-11-09', amount: 56.5, currency: 'CAD' };
    const result = matchReceiptToSubscription(early, subs, ledger());
    expect(result.match.subId).toBe('rec_phone');
    expect(result.match.posted).toBe(false);
    expect(result.match.charge).toEqual({ date: '2026-11-16', monthKey: '2026-11', amount: 56.5, posted: false });
  });

  it('lets the amount pick between two subscriptions from the same company', () => {
    const bill = { vendor: 'Freedom Mobile', date: '2026-10-02', amount: 51, currency: 'CAD' };
    const result = matchReceiptToSubscription(bill, subs, ledger());
    expect(result.match.subId).toBe('rec_net');
    expect(result.ambiguous).toBe(false);
  });

  it('asks which one when the amount matches neither', () => {
    const bill = { vendor: 'Freedom Mobile', date: '2026-10-08', amount: 60.1, currency: 'CAD' };
    const result = matchReceiptToSubscription(bill, subs, ledger());
    expect(result.ambiguous).toBe(true);
    expect(result.candidates.map(c => c.subId).sort()).toEqual(['rec_net', 'rec_phone']);
    const chosen = matchReceiptToSubscription(bill, subs, ledger(), { chosenId: 'rec_phone' });
    expect(chosen.ambiguous).toBe(false);
    expect(chosen.match.subId).toBe('rec_phone');
  });

  it('still matches when the receipt shows a different amount from the right vendor', () => {
    const fullRent = { vendor: 'Rent', description: 'Rent', date: '2026-10-01', amount: 1410, currency: 'CAD' };
    const result = matchReceiptToSubscription(fullRent, subs, ledger());
    expect(result.match.subId).toBe('rec_rent');
    expect(result.match.amountMatches).toBe(false);
  });

  it('leaves a merely similar vendor alone unless the amount matches too', () => {
    const ads = { vendor: 'Google Ads', date: '2026-10-20', amount: 40, currency: 'CAD' };
    expect(matchReceiptToSubscription(ads, subs, ledger())).toBeNull();
    const same = { ...ads, amount: 3.15 };
    expect(matchReceiptToSubscription(same, subs, ledger()).match.subId).toBe('rec_g1');
  });

  it('does not match a currency it cannot compare by amount alone', () => {
    const cad = { ...bigCartelReceipt, currency: 'CAD', amount: 21.22 };
    const result = matchReceiptToSubscription(cad, subs, ledger());
    expect(result.match.subId).toBe('rec_bc');
    expect(result.match.sameCurrency).toBe(false);
    expect(result.match.amountMatches).toBe(false);
  });

  it('ignores a charge whose ledger line was deleted, so the receipt files normally', () => {
    const books = ledger().filter(e => !(e.recurringId === 'rec_bc' && e.date === '2026-10-05'));
    expect(matchReceiptToSubscription(bigCartelReceipt, subs, books)).toBeNull();
  });

  it('calls a receipt for a charge that already has one a second copy, only at the same amount', () => {
    const books = ledger().map(e => (e.recurringId === 'rec_bc' && e.date === '2026-10-05' ? { ...e, receipt: 'local://receipts/bc.pdf' } : e));
    const copy = matchReceiptToSubscription(bigCartelReceipt, subs, books);
    expect(copy.match.covered).toBe(true);
    expect(matchReceiptToSubscription({ ...bigCartelReceipt, amount: 99 }, subs, books)).toBeNull();
  });

  it('flags a receipt for a paused subscription without offering to count it', () => {
    const paused = { ...bigCartel, paused: true, lastInjected: '2026-09' };
    const books = ledger().filter(e => !(e.recurringId === 'rec_bc' && e.date === '2026-10-05'));
    const result = matchReceiptToSubscription(bigCartelReceipt, [paused], books);
    expect(result.match.paused).toBe(true);
    expect(result.match.posted).toBe(false);
  });

  it('never matches a receipt the owner said is a separate purchase, or one without a date', () => {
    expect(matchReceiptToSubscription({ ...bigCartelReceipt, notSubscription: true }, subs, ledger())).toBeNull();
    expect(matchReceiptToSubscription({ ...bigCartelReceipt, date: '' }, subs, ledger())).toBeNull();
  });

  it('does not reach past the window or into a later unposted month', () => {
    expect(subscriptionCandidate({ ...bigCartelReceipt, date: '2026-12-20' }, bigCartel, ledger())).toBeNull();
  });

  it('prefers the period-tagged line over a same-date guess', () => {
    const books = [line(bigCartel, '2026-10-02', { recurringPeriod: '2026-10' })];
    const result = matchReceiptToSubscription(bigCartelReceipt, [bigCartel], books);
    expect(result.match.line.date).toBe('2026-10-02');
  });
});

describe('receipt proof on a charge', () => {
  it('adds the files to any already there and keeps the receipt figures', () => {
    const fields = receiptProofFields(
      { receipt: 'local://a.pdf', receiptFiles: ['local://a.pdf'], currency: 'USD' },
      { receiptFiles: ['local://b.pdf'], emailMsgId: 'm1', receiptRef: 'receipt-email:m1:0', receiptDate: '2026-10-16', receiptAmount: 15, receiptCurrency: 'usd' },
    );
    expect(fields).toEqual({
      receiptFiles: ['local://a.pdf', 'local://b.pdf'],
      receipt: 'local://a.pdf',
      emailMsgId: 'm1',
      receiptRef: 'receipt-email:m1:0',
      receiptDate: '2026-10-16',
      receiptAmount: 15,
      receiptCurrency: 'USD',
    });
    expect(hasReceiptProof({ ...fields })).toBe(true);
  });

  it('puts a first receipt on a charge that had none', () => {
    expect(receiptProofFields({ receipt: '' }, { receipt: 'https://x/r.pdf' })).toEqual({
      receiptFiles: ['https://x/r.pdf'], receipt: 'https://x/r.pdf',
    });
  });
});

describe('receipts already filed beside a charge', () => {
  it('finds the receipt that doubled a subscription charge', () => {
    const extra = { id: 9, desc: 'Big Cartel', vendor: 'Big Cartel', currency: 'USD', amount: 15, date: '2026-10-16', importedFromEmail: true, receipt: 'local://bc.pdf' };
    const doubles = findSubscriptionDoubles(subs, [extra, ...ledger()]);
    expect(doubles).toHaveLength(1);
    expect(doubles[0].expense).toBe(extra);
    expect(doubles[0].line.date).toBe('2026-10-05');
    expect(doubles[0].sub.id).toBe('rec_bc');
  });

  it('pairs each charge with one copy, and leaves alone what the owner kept apart', () => {
    const a = { id: 1, vendor: 'Big Cartel', currency: 'USD', amount: 15, date: '2026-10-16' };
    const b = { id: 2, vendor: 'Big Cartel', currency: 'USD', amount: 15, date: '2026-10-17' };
    expect(findSubscriptionDoubles(subs, [a, b, ...ledger()])).toHaveLength(1);
    expect(findSubscriptionDoubles(subs, [{ ...a, notSubscriptionDouble: true }, ...ledger()])).toHaveLength(0);
  });

  it('needs the same amount and a real name match, never a lookalike', () => {
    const different = { id: 3, vendor: 'Big Cartel', currency: 'USD', amount: 29, date: '2026-10-16' };
    const lookalike = { id: 4, vendor: 'Phone case', currency: 'CAD', amount: 56.5, date: '2026-10-16' };
    expect(findSubscriptionDoubles(subs, [different, lookalike, ...ledger()])).toHaveLength(0);
  });
});

describe('moving the charge day to match the receipts', () => {
  it('moves the next charge to the later day without skipping or doubling a month', () => {
    const change = laterChargeDayChange(bigCartel, 16);
    expect(change.effectiveFrom).toBe('2026-10-16');
    expect(change.nextDate).toBe('2026-11-16');
    const moved = { ...bigCartel, rateChanges: change.rateChanges };
    expect(nextRecurringDate(moved, new Date(2026, 9, 18))).toBe('2026-11-16');
    expect(recurringDueCharges(moved, new Date(2026, 10, 15))).toEqual([]);
    expect(recurringDueCharges(moved, new Date(2026, 10, 16))).toEqual([{ date: '2026-11-16', monthKey: '2026-11', amount: 15 }]);
    expect(chargesBetween(moved, '2026-10-01', '2026-10-31')).toEqual([{ date: '2026-10-05', monthKey: '2026-10', amount: 15, posted: true }]);
  });

  it('does not show a day move as a price change', () => {
    const change = laterChargeDayChange(bigCartel, 16);
    const moved = { ...bigCartel, rateChanges: change.rateChanges };
    expect(nextRateChange(moved, new Date(2026, 9, 8))).toBeNull();
    const rise = { ...moved, rateChanges: [...change.rateChanges, { effectiveFrom: '2026-12-16', amount: 18 }] };
    expect(nextRateChange(rise, new Date(2026, 9, 8))).toMatchObject({ effectiveFrom: '2026-12-16', from: 15, to: 18 });
  });

  it('refuses an earlier day, which would skip a month', () => {
    expect(laterChargeDayChange(phone, 5)).toBeNull();
  });

  it('suggests the move after two receipts in a row on the same later day', () => {
    const books = [
      line(bigCartel, '2026-09-05', { receiptDate: '2026-09-16' }),
      line(bigCartel, '2026-10-05', { receiptDate: '2026-10-16' }),
    ];
    const hint = receiptDayHint(bigCartel, books);
    expect(hint.day).toBe(16);
    expect(hint.nextDate).toBe('2026-11-16');
    expect(receiptDayHint({ ...bigCartel, dayHintDismissed: 16 }, books)).toBeNull();
    expect(receiptDayHint(bigCartel, books.slice(1))).toBeNull();
    expect(receiptDayHint(bigCartel, [books[0], { ...books[1], receiptDate: '2026-10-12' }])).toBeNull();
  });

  it('writes the day the way people say it', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 16, 21, 22, 23, 31].map(ordinalDay)).toEqual([
      'the 1st', 'the 2nd', 'the 3rd', 'the 4th', 'the 11th', 'the 12th', 'the 13th', 'the 16th', 'the 21st', 'the 22nd', 'the 23rd', 'the 31st',
    ]);
  });
});
