// ── CHASING A LATE INVOICE ──────────────────────────────────────────────────
//
// An invoice goes out and then goes quiet. The app already knows when one is
// past its due date — the to-do rail says so — but knowing it never moved any
// money, because the follow-up email is the awkward thing nobody writes.
//
// This module holds every judgement about that follow-up: whether an invoice is
// owed one, what it should say, and when it is a decent hour to send it. It is
// DOM-free and Firestore-free so all of it can be tested directly, and so the
// sweep in main.js is left doing nothing but the sending.
//
// Two rules shape the whole thing, because the output is real email to real
// customers rather than a number on a screen:
//
//  1. ONE automatic reminder per invoice, ever. A person who is chased twice by
//     a machine for the same bill remembers the publisher for the wrong reason.
//     Sending another is a deliberate act, and stays a button.
//  2. A reason is always returned for NOT sending. The sweep, the "Remind now"
//     button and the count shown when the feature is switched on all ask the
//     same function, so what the owner is told matches what actually happens.

/** What the settings mean before the publisher has touched them. */
export const REMINDER_DEFAULTS = {
  auto: false,
  days: 7,
  message: 'Just a gentle nudge in case this one slipped through — no rush if it is already on its way. Thank you for stocking our books.',
};

/** Days past due the publisher is allowed to pick. */
export const MIN_REMINDER_DAYS = 1;
export const MAX_REMINDER_DAYS = 180;

/** The daytime, weekday window an automatic email may go out in. */
export const SEND_WINDOW = { startHour: 9, endHour: 18 };

const str = (v) => String(v ?? '').trim();
const isIsoDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(str(v));

/**
 * Whole days between two 'YYYY-MM-DD' dates, `to` minus `from`.
 *
 * Compared as UTC midnights rather than through the local clock: a due date is
 * a calendar day, and running this at 11pm in one timezone should not make an
 * invoice a day later than it is in another.
 */
export function daysBetween(from, to) {
  if (!isIsoDate(from) || !isIsoDate(to)) return null;
  const a = Date.parse(`${str(from)}T00:00:00Z`);
  const b = Date.parse(`${str(to)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

/**
 * The stored settings, made safe to use.
 *
 * Everything here comes out of localStorage, which means it can be anything —
 * a hand-edited number, a string, a value from an older version of the app. A
 * junk threshold must fall back to the default rather than reaching zero, where
 * every unpaid invoice would qualify the moment it was issued.
 */
export function reminderSettings(raw) {
  const s = raw || {};
  // An emptied box is "I haven't said", not zero — `Number('')` is 0, which
  // would clamp to one day and chase every customer the morning after their
  // invoice fell due.
  const rawDays = str(s.remindDays);
  const days = rawDays === '' ? NaN : Math.round(Number(rawDays));
  const message = str(s.remindMsg);
  return {
    auto: s.remindAuto === true,
    days: Number.isFinite(days)
      ? Math.min(MAX_REMINDER_DAYS, Math.max(MIN_REMINDER_DAYS, days))
      : REMINDER_DEFAULTS.days,
    message: message || REMINDER_DEFAULTS.message,
  };
}

/** What has already been said to this customer about this invoice. */
export function invoiceReminderState(inv) {
  const log = Array.isArray(inv && inv.reminders) ? inv.reminders : [];
  // Only a reminder that actually left counts as a chase. A failed send must
  // leave the invoice eligible, or one bad evening of connectivity would mean
  // that customer is never chased at all.
  const sent = log.filter(r => r && r.status === 'sent');
  const last = sent.length ? sent[sent.length - 1] : null;
  const snoozedUntil = isIsoDate(inv && inv.remindAfter) ? str(inv.remindAfter) : '';
  return {
    count: sent.length,
    lastAt: last ? Number(last.at) || 0 : 0,
    lastKind: last ? str(last.kind) : '',
    lastStatus: log.length ? str(log[log.length - 1].status) : '',
    snoozedUntil,
  };
}

/**
 * Why this invoice is NOT getting an automatic reminder — or null when it is.
 *
 * Ordered so the answer is the most useful one: a paid invoice reports `paid`
 * rather than `no-email`, because that is what the owner would want to hear.
 */
export function reminderBlockReason(inv, { today, days } = {}) {
  if (!inv) return 'no-invoice';
  const status = str(inv.status) || 'draft';
  if (status === 'paid') return 'paid';
  if (status === 'cancelled') return 'cancelled';
  if (status !== 'sent') return 'not-sent';
  if (!isIsoDate(inv.dueDate)) return 'no-due-date';

  const state = invoiceReminderState(inv);
  if (state.count > 0) return 'already-chased';
  if (state.snoozedUntil && isIsoDate(today) && str(today) <= state.snoozedUntil) return 'snoozed';
  if (!str(inv.storeEmail)) return 'no-email';

  const late = daysBetween(inv.dueDate, today);
  if (late === null) return 'no-due-date';
  // Strictly greater: "chase after 7 days" should not fire on the seventh day,
  // which is a week to the hour after the date the customer was given.
  const threshold = Number(days) > 0 ? Number(days) : REMINDER_DEFAULTS.days;
  if (late <= threshold) return 'not-late-enough';

  return null;
}

/** How many days past due an invoice is, or null if it isn't (or has no date). */
export function daysLate(inv, today) {
  const late = daysBetween(inv && inv.dueDate, today);
  return late !== null && late > 0 ? late : null;
}

/**
 * The invoices to chase on this run, oldest debt first.
 *
 * Capped because the first run after switching the feature on meets every
 * unpaid invoice at once — and because a mistake that sends five emails is
 * recoverable in a way that one sending fifty is not.
 */
export function dueForReminder(invoices, { today, days, max = 5 } = {}) {
  const out = [];
  for (const inv of (invoices || [])) {
    if (!reminderBlockReason(inv, { today, days })) out.push(inv);
  }
  out.sort((a, b) => str(a.dueDate).localeCompare(str(b.dueDate)));
  return max > 0 ? out.slice(0, max) : out;
}

/**
 * Is now a decent moment to email a customer?
 *
 * A chasing email timestamped 3am on a Sunday reads as a machine dunning them;
 * the same words on Tuesday morning read as a person following up. Nothing is
 * lost by waiting — the sweep runs again within the hour.
 */
export function canSendNow(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return false;
  const day = d.getDay();
  if (day === 0 || day === 6) return false;
  const hour = d.getHours();
  return hour >= SEND_WINDOW.startHour && hour < SEND_WINDOW.endHour;
}

const esc = (s) => str(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/**
 * The reminder itself.
 *
 * Written to be read on a phone in ten seconds: who it is from, which invoice,
 * how much, how late, and a way to pay it — in that order, before any prose.
 * The publisher's own message follows, so the tone is theirs rather than mine.
 *
 * `amountLabel` is passed in already formatted. Currency formatting lives in
 * money.js and depends on the book; this module should not be picking symbols.
 */
export function buildReminderEmail(inv, { settings, payLink = '', today, publisher = '', amountLabel = '' } = {}) {
  const cfg = settings && settings.days !== undefined ? settings : reminderSettings(settings);
  const num = str(inv && inv.num) || 'your invoice';
  const who = str(inv && inv.storeContact) || str(inv && inv.storeName) || 'there';
  const from = str(publisher) || 'Lyricalmyrical Books';
  const late = daysLate(inv, today);
  const amount = str(amountLabel);
  const due = str(inv && inv.dueDate);

  const lateLine = late
    ? `It was due on ${due} — ${late} day${late === 1 ? '' : 's'} ago.`
    : `It was due on ${due}.`;

  const subject = `Reminder: invoice ${num}${amount ? ` — ${amount} outstanding` : ''}`;

  const text = [
    `Hi ${who},`,
    ``,
    `A quick reminder about invoice ${num}${amount ? ` for ${amount}` : ''}.`,
    lateLine,
    ``,
    payLink ? `Pay online: ${payLink}` : '',
    payLink ? `` : '',
    cfg.message,
    ``,
    `Thank you,`,
    from,
  ].filter(line => line !== null).join('\n');

  const html = `<div style="font-family:Georgia,'Times New Roman',serif;font-size:15px;line-height:1.6;color:#2a2520;max-width:520px;">
  <p>Hi ${esc(who)},</p>
  <p>A quick reminder about invoice <strong>${esc(num)}</strong>${amount ? ` for <strong>${esc(amount)}</strong>` : ''}.<br>
  <span style="color:#756e64;">${esc(lateLine)}</span></p>
  ${payLink ? `<p style="margin:22px 0;"><a href="${esc(payLink)}" style="background:#0e0c0a;color:#f7f3ec;text-decoration:none;padding:12px 22px;border-radius:8px;display:inline-block;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;">Pay invoice ${esc(num)}</a></p>` : ''}
  <p>${esc(cfg.message)}</p>
  <p style="margin-top:22px;">Thank you,<br>${esc(from)}</p>
</div>`;

  return { subject, text, html };
}

/**
 * The card in the corner after a run. Null when there is nothing to report —
 * the common case by far, and a card saying "0 reminders sent" every hour is
 * how a person learns to ignore that corner of the screen.
 */
export function describeReminderSweep({ sent = 0, failed = 0 } = {}) {
  if (!sent && !failed) return null;

  if (!sent) {
    return {
      title: `${failed} reminder${failed === 1 ? '' : 's'} could not be sent`,
      detail: 'The email did not go out, so nobody has been chased. Open the invoice to try again.',
      needsReview: true,
    };
  }

  const reminders = `${sent} reminder${sent === 1 ? '' : 's'} sent`;
  return {
    title: reminders,
    detail: failed
      ? `A late invoice was chased for you. ${failed} other${failed === 1 ? '' : 's'} could not be sent — open the invoice to try again.`
      : `A late invoice was chased for you, with a link to pay it.`,
    needsReview: failed > 0,
  };
}

/**
 * What the publisher is told before switching automatic reminders on.
 *
 * The whole point is the number: arming this with a dozen old unpaid invoices
 * on file means a dozen customers hear from you within the hour, and that has
 * to be a decision rather than a surprise.
 */
export function describeReminderArming({ count = 0, days = REMINDER_DEFAULTS.days } = {}) {
  const window = `${days} day${days === 1 ? '' : 's'}`;
  if (!count) {
    return `Chase late invoices automatically? Nothing is late enough to be chased right now — from here on, an invoice gets one reminder once it is more than ${window} past its due date.`;
  }
  return `Chase late invoices automatically? ${count} invoice${count === 1 ? ' is' : 's are'} already more than ${window} past due, so ${count === 1 ? 'that customer' : 'those customers'} will be emailed shortly. After that, each invoice gets one reminder as it falls due.`;
}

// ── THE DAY BEFORE ──────────────────────────────────────────────────────────
//
// The app only learns about money that arrives through the payment link. A shop
// that paid by bank transfer, or handed over cash at a fair, is still "sent"
// here until the publisher marks it paid — and would be chased for money it has
// already handed over. That email is the one this feature must never send.
//
// So: say who is about to be chased while there is still a day to stop it.

/** The day after a 'YYYY-MM-DD' date. UTC, like daysBetween. */
export function nextDay(iso) {
  if (!isIsoDate(iso)) return '';
  const t = Date.parse(`${str(iso)}T00:00:00Z`);
  if (Number.isNaN(t)) return '';
  return new Date(t + 86400000).toISOString().slice(0, 10);
}

/**
 * The invoices that will be chased tomorrow — blocked today, clear tomorrow.
 *
 * Deliberately phrased against reminderBlockReason instead of re-deriving "due
 * date plus threshold". Every route into the queue is then covered for free —
 * the threshold being crossed tonight, a promised-to-pay date lapsing at
 * midnight — and the warning cannot drift from what the sweep will actually do,
 * which is the whole reason both go through one function.
 */
export function dueForReminderTomorrow(invoices, { today, days } = {}) {
  const tomorrow = nextDay(today);
  if (!tomorrow) return [];
  const out = [];
  for (const inv of (invoices || [])) {
    if (!reminderBlockReason(inv, { today, days })) continue;          // already in today's queue
    if (reminderBlockReason(inv, { today: tomorrow, days })) continue; // still blocked tomorrow
    out.push(inv);
  }
  out.sort((a, b) => str(a.dueDate).localeCompare(str(b.dueDate)));
  return out;
}

/** The heads-up card. Null at zero — silence is the normal morning. */
export function describeReminderNotice({ count = 0 } = {}) {
  if (!count) return null;
  return {
    title: `${count} invoice${count === 1 ? '' : 's'} will be chased tomorrow`,
    detail: count === 1
      ? 'If they have already paid you outside the app, mark it paid now and no reminder goes out.'
      : 'If any of them have already paid you outside the app, mark them paid now and no reminder goes out.',
  };
}

/**
 * A stand-in invoice for the test email.
 *
 * The point of the test is to read what a customer receives BEFORE arming the
 * feature — which is exactly when there may be nothing late on file to build it
 * from. Dated past the threshold so it reads like a real reminder.
 */
export function sampleReminderInvoice({ today, days = REMINDER_DEFAULTS.days } = {}) {
  const due = isIsoDate(today)
    ? new Date(Date.parse(`${str(today)}T00:00:00Z`) - (Number(days) + 3) * 86400000).toISOString().slice(0, 10)
    : '';
  return {
    id: 'inv-sample',
    num: 'INV-SAMPLE-0001',
    status: 'sent',
    dueDate: due,
    storeName: 'The Corner Bookshop',
    storeContact: '',
    storeEmail: 'shop@example.com',
    total: 120,
    _sample: true,
  };
}
