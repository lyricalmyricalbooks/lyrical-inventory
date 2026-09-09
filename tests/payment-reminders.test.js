import { describe, expect, it } from 'vitest';
import {
  MAX_REMINDER_DAYS,
  MIN_REMINDER_DAYS,
  REMINDER_DEFAULTS,
  buildReminderEmail,
  canSendNow,
  daysBetween,
  daysLate,
  describeReminderArming,
  describeReminderSweep,
  dueForReminder,
  invoiceReminderState,
  reminderBlockReason,
  reminderSettings,
} from '../src/lib/payment-reminders.js';

// The thing being protected here is a relationship with a customer, not a
// number on a screen: every one of these decisions ends in a real email landing
// in somebody's inbox, so the rules are tested at their edges.

const TODAY = '2026-09-20';

const lateInvoice = (over = {}) => ({
  id: 'inv-1',
  num: 'INV-ALTROV-2026-004',
  status: 'sent',
  dueDate: '2026-09-01',
  storeName: 'Casa Bosques',
  storeEmail: 'hola@casabosques.com',
  total: 180,
  ...over,
});

describe('daysBetween', () => {
  it('counts whole calendar days', () => {
    expect(daysBetween('2026-09-01', '2026-09-20')).toBe(19);
    expect(daysBetween('2026-09-20', '2026-09-20')).toBe(0);
    expect(daysBetween('2026-09-25', '2026-09-20')).toBe(-5);
  });

  it('crosses a month and a leap day without drifting', () => {
    expect(daysBetween('2028-02-27', '2028-03-01')).toBe(3);
  });

  it('answers null for anything that is not a date', () => {
    expect(daysBetween('', TODAY)).toBeNull();
    expect(daysBetween('last tuesday', TODAY)).toBeNull();
    expect(daysBetween(undefined, undefined)).toBeNull();
  });
});

describe('reminderSettings', () => {
  it('is switched off until somebody deliberately switches it on', () => {
    expect(reminderSettings({}).auto).toBe(false);
    expect(reminderSettings({ remindAuto: 'yes' }).auto).toBe(false);
    expect(reminderSettings({ remindAuto: true }).auto).toBe(true);
  });

  it('falls back to the default rather than to zero days', () => {
    // Zero would mean every invoice qualifies the day it is issued.
    expect(reminderSettings({ remindDays: 'soon' }).days).toBe(REMINDER_DEFAULTS.days);
    expect(reminderSettings({ remindDays: '' }).days).toBe(REMINDER_DEFAULTS.days);
    expect(reminderSettings({ remindDays: 0 }).days).toBe(MIN_REMINDER_DAYS);
    expect(reminderSettings({ remindDays: -30 }).days).toBe(MIN_REMINDER_DAYS);
    expect(reminderSettings({ remindDays: 9999 }).days).toBe(MAX_REMINDER_DAYS);
    expect(reminderSettings({ remindDays: '14' }).days).toBe(14);
  });

  it('keeps the publisher’s own wording, and supplies one when blank', () => {
    expect(reminderSettings({ remindMsg: '  Pay up please  ' }).message).toBe('Pay up please');
    expect(reminderSettings({ remindMsg: '   ' }).message).toBe(REMINDER_DEFAULTS.message);
  });
});

describe('reminderBlockReason', () => {
  const opts = { today: TODAY, days: 7 };

  it('lets a genuinely late, unpaid, emailable invoice through', () => {
    expect(reminderBlockReason(lateInvoice(), opts)).toBeNull();
  });

  it('never chases a bill that is settled or withdrawn', () => {
    expect(reminderBlockReason(lateInvoice({ status: 'paid' }), opts)).toBe('paid');
    expect(reminderBlockReason(lateInvoice({ status: 'cancelled' }), opts)).toBe('cancelled');
  });

  it('never chases a draft nobody has been sent', () => {
    expect(reminderBlockReason(lateInvoice({ status: 'draft' }), opts)).toBe('not-sent');
  });

  it('waits until the day AFTER the threshold', () => {
    // "Chase after 7 days" must not fire at exactly seven days, which is a week
    // to the hour after the date the customer was given.
    expect(reminderBlockReason(lateInvoice({ dueDate: '2026-09-13' }), opts)).toBe('not-late-enough');
    expect(reminderBlockReason(lateInvoice({ dueDate: '2026-09-12' }), opts)).toBeNull();
  });

  it('does not chase something that is not late at all', () => {
    expect(reminderBlockReason(lateInvoice({ dueDate: '2026-10-01' }), opts)).toBe('not-late-enough');
  });

  it('cannot chase an invoice with no due date or no email', () => {
    expect(reminderBlockReason(lateInvoice({ dueDate: '' }), opts)).toBe('no-due-date');
    expect(reminderBlockReason(lateInvoice({ storeEmail: '' }), opts)).toBe('no-email');
  });

  it('chases once and never again on its own', () => {
    const chased = lateInvoice({ reminders: [{ at: 1, kind: 'auto', status: 'sent' }] });
    expect(reminderBlockReason(chased, opts)).toBe('already-chased');
  });

  it('still chases after a send that failed', () => {
    // A bad evening of connectivity must not mean that customer is never asked.
    const failed = lateInvoice({ reminders: [{ at: 1, kind: 'auto', status: 'failed' }] });
    expect(reminderBlockReason(failed, opts)).toBeNull();
  });

  it('holds off while a promised payment date is still ahead', () => {
    expect(reminderBlockReason(lateInvoice({ remindAfter: '2026-09-30' }), opts)).toBe('snoozed');
    expect(reminderBlockReason(lateInvoice({ remindAfter: TODAY }), opts)).toBe('snoozed');
  });

  it('resumes the day after a promise passes unkept', () => {
    expect(reminderBlockReason(lateInvoice({ remindAfter: '2026-09-19' }), opts)).toBeNull();
  });

  it('reports being paid ahead of every other reason', () => {
    // What the owner wants to hear about a paid invoice is that it is paid.
    const paidAndUnreachable = lateInvoice({ status: 'paid', storeEmail: '', dueDate: '' });
    expect(reminderBlockReason(paidAndUnreachable, opts)).toBe('paid');
  });

  it('handles nothing at all', () => {
    expect(reminderBlockReason(null, opts)).toBe('no-invoice');
  });
});

describe('dueForReminder', () => {
  const invoices = [
    lateInvoice({ id: 'a', num: 'A', dueDate: '2026-09-05' }),
    lateInvoice({ id: 'b', num: 'B', dueDate: '2026-08-01' }),
    lateInvoice({ id: 'c', num: 'C', status: 'paid', dueDate: '2026-08-01' }),
    lateInvoice({ id: 'd', num: 'D', dueDate: '2026-09-18' }),
  ];

  it('takes the oldest debts first and leaves the settled one alone', () => {
    const due = dueForReminder(invoices, { today: TODAY, days: 7, max: 0 });
    expect(due.map(i => i.id)).toEqual(['b', 'a']);
  });

  it('caps a run, so switching the feature on cannot mail everyone at once', () => {
    const due = dueForReminder(invoices, { today: TODAY, days: 7, max: 1 });
    expect(due.map(i => i.id)).toEqual(['b']);
  });

  it('survives an empty or missing list', () => {
    expect(dueForReminder([], { today: TODAY, days: 7 })).toEqual([]);
    expect(dueForReminder(undefined, { today: TODAY, days: 7 })).toEqual([]);
  });
});

describe('invoiceReminderState', () => {
  it('counts only reminders that actually left', () => {
    const state = invoiceReminderState({
      reminders: [
        { at: 10, kind: 'auto', status: 'failed' },
        { at: 20, kind: 'manual', status: 'sent' },
      ],
    });
    expect(state.count).toBe(1);
    expect(state.lastAt).toBe(20);
    expect(state.lastKind).toBe('manual');
    expect(state.lastStatus).toBe('sent');
  });

  it('surfaces a failure as the latest thing that happened', () => {
    const state = invoiceReminderState({
      reminders: [{ at: 10, status: 'sent' }, { at: 20, status: 'failed' }],
    });
    expect(state.count).toBe(1);
    expect(state.lastStatus).toBe('failed');
  });

  it('ignores a snooze date that is not a date', () => {
    expect(invoiceReminderState({ remindAfter: 'next week' }).snoozedUntil).toBe('');
    expect(invoiceReminderState({}).snoozedUntil).toBe('');
  });
});

describe('canSendNow', () => {
  it('sends on a weekday, during working hours', () => {
    expect(canSendNow(new Date(2026, 8, 22, 10, 0))).toBe(true); // Tuesday 10am
  });

  it('never sends at night or at the weekend', () => {
    expect(canSendNow(new Date(2026, 8, 22, 3, 0))).toBe(false);  // Tuesday 3am
    expect(canSendNow(new Date(2026, 8, 22, 18, 30))).toBe(false); // Tuesday evening
    expect(canSendNow(new Date(2026, 8, 20, 11, 0))).toBe(false); // Sunday
    expect(canSendNow(new Date(2026, 8, 19, 11, 0))).toBe(false); // Saturday
  });

  it('treats a broken clock as "not now"', () => {
    expect(canSendNow(new Date('nonsense'))).toBe(false);
  });
});

describe('buildReminderEmail', () => {
  const settings = reminderSettings({ remindMsg: 'No rush if it is already on its way.' });
  const built = () => buildReminderEmail(lateInvoice(), {
    settings,
    payLink: 'https://buy.stripe.com/test_abc',
    today: TODAY,
    publisher: 'Lyricalmyrical Books',
    amountLabel: 'CA$180.00',
  });

  it('names the invoice and the amount in the subject line', () => {
    expect(built().subject).toContain('INV-ALTROV-2026-004');
    expect(built().subject).toContain('CA$180.00');
  });

  it('says how late it is, in days', () => {
    expect(built().text).toContain('19 days ago');
  });

  it('leads with a way to pay, in both the plain and the styled copy', () => {
    expect(built().text).toContain('https://buy.stripe.com/test_abc');
    expect(built().html).toContain('href="https://buy.stripe.com/test_abc"');
  });

  it('carries the publisher’s own wording', () => {
    expect(built().text).toContain('No rush if it is already on its way.');
    expect(built().html).toContain('No rush if it is already on its way.');
  });

  it('greets the named contact, and the shop when there is no contact', () => {
    expect(built().text.startsWith('Hi Casa Bosques,')).toBe(true);
    const withContact = buildReminderEmail(lateInvoice({ storeContact: 'Ana' }), { settings, today: TODAY });
    expect(withContact.text.startsWith('Hi Ana,')).toBe(true);
  });

  it('still reads properly with no payment link to offer', () => {
    const plain = buildReminderEmail(lateInvoice(), { settings, today: TODAY, amountLabel: 'CA$180.00' });
    expect(plain.text).not.toContain('Pay online');
    expect(plain.html).not.toContain('<a href');
    expect(plain.text).toContain('INV-ALTROV-2026-004');
  });

  it('escapes a customer name that contains markup', () => {
    const nasty = buildReminderEmail(lateInvoice({ storeName: '<script>alert(1)</script>' }), { settings, today: TODAY });
    expect(nasty.html).not.toContain('<script>');
    expect(nasty.html).toContain('&lt;script&gt;');
  });
});

describe('the words shown to the publisher', () => {
  it('says nothing at all when a run did nothing', () => {
    expect(describeReminderSweep({ sent: 0, failed: 0 })).toBeNull();
  });

  it('reports what went out, and what did not', () => {
    expect(describeReminderSweep({ sent: 1 }).title).toBe('1 reminder sent');
    expect(describeReminderSweep({ sent: 3 }).title).toBe('3 reminders sent');
    expect(describeReminderSweep({ sent: 0, failed: 2 }).needsReview).toBe(true);
    expect(describeReminderSweep({ sent: 2, failed: 1 }).detail).toContain('1 other');
  });

  it('warns with a real count before the feature is armed', () => {
    const many = describeReminderArming({ count: 6, days: 7 });
    expect(many).toContain('6 invoices');
    expect(many).toContain('7 days');
    expect(describeReminderArming({ count: 0, days: 7 })).toContain('Nothing is late enough');
    expect(describeReminderArming({ count: 1, days: 1 })).toContain('1 invoice is');
  });
});

describe('daysLate', () => {
  it('answers only for an invoice that is actually late', () => {
    expect(daysLate(lateInvoice(), TODAY)).toBe(19);
    expect(daysLate(lateInvoice({ dueDate: '2026-10-01' }), TODAY)).toBeNull();
    expect(daysLate(lateInvoice({ dueDate: '' }), TODAY)).toBeNull();
  });
});
