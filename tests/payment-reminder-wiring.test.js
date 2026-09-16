import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { extractDecl, mainJs } from './helpers/extract-decl.js';
import { REMINDER_DEFAULTS, reminderSettings } from '../src/lib/payment-reminders.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexHtml = readFileSync(path.join(__dirname, '../index.html'), 'utf8');

// The half of the reminder feature that can't live in the pure module: the
// settings form, the order the sweep does things in, and the boot wiring. Each
// of these has a way of going quietly wrong that a unit test of the logic would
// never catch — a field that doesn't round-trip, a send that happens before the
// invoice is stamped, a watch nobody starts.

const SETTINGS_MODAL = (() => {
  const start = indexHtml.indexOf('<div class="overlay no-print" id="m-invoice-settings"');
  const end = indexHtml.indexOf('<!-- SHIPPING LABEL MODAL -->', start);
  expect(start, 'expected the invoice settings modal in index.html').toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return indexHtml.slice(start, end);
})();

describe('the reminder settings form', () => {
  it('offers a switch, a threshold and the publisher’s own message', () => {
    expect(SETTINGS_MODAL).toContain('id="ivs-remind-auto"');
    expect(SETTINGS_MODAL).toContain('type="checkbox"');
    expect(SETTINGS_MODAL).toContain('id="ivs-remind-days"');
    expect(SETTINGS_MODAL).toContain('id="ivs-remind-msg"');
  });

  it('will not accept a threshold of zero days through the form itself', () => {
    const field = SETTINGS_MODAL.match(/<input id="ivs-remind-days"[^>]*>/);
    expect(field).not.toBeNull();
    expect(field[0]).toContain('min="1"');
    expect(field[0]).toContain('max="180"');
  });

  it('tells the owner, in the form, what turning it on actually does', () => {
    expect(SETTINGS_MODAL).toContain('past its due date');
    expect(SETTINGS_MODAL).toContain('once');
  });
});

describe('reading and writing the settings against the real form', () => {
  let api;

  beforeEach(() => {
    document.body.innerHTML = SETTINGS_MODAL;
    const factory = new Function(
      '$', 'reminderSettings', 'getInvoiceSettings',
      [
        // Only the reminder half of the two settings functions is exercised
        // here; the rest of the form is covered by the fields it round-trips.
        'function fillReminderFields(s) {',
        '  const rem = reminderSettings(s);',
        '  if ($("ivs-remind-auto")) $("ivs-remind-auto").checked = rem.auto;',
        '  if ($("ivs-remind-days")) $("ivs-remind-days").value = String(rem.days);',
        '  if ($("ivs-remind-msg")) $("ivs-remind-msg").value = rem.message;',
        '}',
        'function readReminderFields() {',
        '  return reminderSettings({',
        '    remindAuto: $("ivs-remind-auto") ? !!$("ivs-remind-auto").checked : false,',
        '    remindDays: $("ivs-remind-days") ? $("ivs-remind-days").value : "",',
        '    remindMsg: $("ivs-remind-msg") ? $("ivs-remind-msg").value : "",',
        '  });',
        '}',
        'return { fillReminderFields, readReminderFields };',
      ].join('\n'),
    );
    api = factory(id => document.getElementById(id), reminderSettings, () => ({}));
  });

  it('opens switched off, on the default threshold', () => {
    api.fillReminderFields({});
    expect(document.getElementById('ivs-remind-auto').checked).toBe(false);
    expect(document.getElementById('ivs-remind-days').value).toBe(String(REMINDER_DEFAULTS.days));
    expect(document.getElementById('ivs-remind-msg').value).toBe(REMINDER_DEFAULTS.message);
  });

  it('round-trips what the publisher chose', () => {
    api.fillReminderFields({ remindAuto: true, remindDays: 21, remindMsg: 'Our terms are Net 30.' });
    expect(document.getElementById('ivs-remind-days').value).toBe('21');
    expect(api.readReminderFields()).toEqual({ auto: true, days: 21, message: 'Our terms are Net 30.' });
  });

  it('turns an emptied threshold box back into the default, not into one day', () => {
    api.fillReminderFields({ remindAuto: true, remindDays: 21 });
    document.getElementById('ivs-remind-days').value = '';
    expect(api.readReminderFields().days).toBe(REMINDER_DEFAULTS.days);
  });
});

describe('the sweep', () => {
  const sweep = () => extractDecl('sweepPaymentReminders', mainJs);
  const send = () => extractDecl('sendInvoiceReminder', mainJs);

  it('does nothing unless the publisher switched it on', () => {
    expect(sweep()).toContain('if (!cfg.auto) return null;');
  });

  it('needs somewhere to send from, and something to send over', () => {
    expect(sweep()).toContain('if (!sheetsUrl) return null;');
    expect(sweep()).toContain('navigator.onLine === false');
  });

  it('keeps to weekday daytime hours', () => {
    expect(sweep()).toContain('canSendNow(new Date())');
  });

  it('re-checks each invoice at the moment of sending', () => {
    // The Stripe sweep runs on its own clock — an invoice can be paid between
    // this batch being built and this line being reached.
    expect(sweep()).toContain('if (reminderBlockReason(inv, { today: today(), days: cfg.days })) continue;');
  });

  it('writes the reminder down BEFORE sending it', () => {
    // Two devices with the app open must not both chase the same invoice. A
    // stamp that lands first means the second one sees "already chased".
    const body = send();
    const stamped = body.indexOf('inv.reminders.push(entry)');
    const saved = body.indexOf('saveState(bookId)');
    const sent = body.indexOf('await sendSingleEmailViaBackend');
    expect(stamped).toBeGreaterThan(-1);
    expect(sent).toBeGreaterThan(-1);
    expect(stamped).toBeLessThan(saved);
    expect(saved).toBeLessThan(sent);
  });

  it('records a failure on the invoice instead of retrying silently', () => {
    expect(send()).toContain("entry.status = 'failed'");
    expect(send()).toContain("entry.status = 'sent'");
  });

  it('is capped per run and per day', () => {
    expect(mainJs).toContain('const REMINDER_MAX_PER_RUN = 5;');
    expect(mainJs).toContain('const REMINDER_MAX_PER_DAY = 20;');
    expect(sweep()).toContain('REMINDER_MAX_PER_DAY - reminderDayCount()');
  });
});

describe('arming and boot wiring', () => {
  it('asks before the first send, with a real count in the question', () => {
    const save = extractDecl('saveInvoiceSettings', mainJs);
    expect(save).toContain('if (next.auto && !prev.auto)');
    expect(save).toContain('invoicesAwaitingReminder(next.days)');
    expect(save).toContain('describeReminderArming');
    // Declining leaves the switch off rather than saving it on.
    expect(save).toContain("if (!ok) { if ($('ivs-remind-auto')) $('ivs-remind-auto').checked = false; return; }");
  });

  it('starts the reminder watch after the Stripe payment watch', () => {
    // Order matters: an invoice paid through its link should be settled before
    // anyone is chased for it.
    const stripeAt = mainJs.indexOf('        startStripeInvoiceWatch();');
    const remindAt = mainJs.indexOf('        startPaymentReminderWatch();');
    expect(stripeAt).toBeGreaterThan(-1);
    expect(remindAt).toBeGreaterThan(stripeAt);
  });

  it('checks back every hour', () => {
    expect(mainJs).toContain('const REMINDER_WATCH_INTERVAL_MS = 60 * 60 * 1000;');
    expect(extractDecl('startPaymentReminderWatch', mainJs)).toContain('startWatch(');
  });
});

describe('what the publisher can do by hand', () => {
  it('offers a reminder and a promised-to-pay date on the invoice', () => {
    expect(indexHtml).toContain('onclick="remindInvoiceFromView()"');
    expect(indexHtml).toContain('onclick="snoozeInvoiceFromView()"');
    expect(mainJs).toContain('remindInvoiceFromView, remindInvoiceFromList, snoozeInvoiceFromView,');
  });

  it('confirms before a manual reminder leaves, naming the recipient', () => {
    const fn = extractDecl('chaseInvoiceNow', mainJs);
    expect(fn).toContain('confirmDialog(');
    expect(fn).toContain('a link to pay it?');
    // Chasing somebody twice by hand is allowed, but never by accident.
    expect(fn).toContain('You have already reminded them');
  });

  it('has exactly one by-hand chase path, used by both buttons', () => {
    // Two copies of the guards would eventually differ, and the way they
    // would differ is an email chasing somebody who already paid.
    for (const caller of ['remindInvoiceFromView', 'remindInvoiceFromList']) {
      expect(extractDecl(caller, mainJs), `${caller} should go through chaseInvoiceNow`)
        .toContain('chaseInvoiceNow(id)');
    }
    for (const guard of ["inv.status === 'paid'", "inv.status === 'cancelled'", 'if (!sheetsUrl)', 'No email address on this invoice']) {
      expect(extractDecl('chaseInvoiceNow', mainJs)).toContain(guard);
    }
  });

  it('warns when the bill being chased is not late, or was promised', () => {
    const fn = extractDecl('chaseInvoiceNow', mainJs);
    // One press from the list can reach a bill nobody is owed money on yet.
    expect(fn).toContain('Not due until');
    expect(fn).toContain('They promised to pay by');
    expect(fn).toContain("inv.status === 'draft'");
  });
});

describe('chasing straight from the invoice list', () => {
  const row = () => extractDecl('renderInvoices', mainJs);

  it('puts a reminder button on every unpaid invoice row', () => {
    expect(row()).toContain('remindInvoiceFromList(');
    // Only bills that have actually been sent — a draft has billed nobody.
    expect(row()).toContain("inv.status === 'sent'");
    expect(mainJs).toContain('remindInvoiceFromView, remindInvoiceFromList, snoozeInvoiceFromView,');
  });

  it('says so rather than going missing when there is no address to chase', () => {
    expect(row()).toContain('No email address on this invoice — add one and you can chase it from here');
    expect(row()).toContain('disabled');
  });

  it('reads as a repeat when they have already been chased', () => {
    expect(row()).toContain('Chase again');
  });

  it('goes quiet while it sends, so the row is not pressed twice', () => {
    const fn = extractDecl('remindInvoiceFromList', mainJs);
    expect(fn).toContain('btn.disabled = true');
    expect(fn).toContain('Sending…');
    // And comes back if the chase never happened — a declined confirmation
    // must not leave a permanently dead button on the row.
    expect(fn).toContain('finally');
    expect(fn).toContain('still.disabled = false');
  });

  it('picks the promised date with a date control, not free text', () => {
    expect(extractDecl('snoozeInvoiceFromView', mainJs)).toContain("inputType: 'date'");
    const modalJs = readFileSync(path.join(__dirname, '../src/lib/modal.js'), 'utf8');
    expect(modalJs).toContain("input.type = opts.inputType || 'text';");
    // The one shared input must go back to text, or the next prompt inherits it.
    expect(modalJs).toContain("input.type = 'text';");
  });

  it('lets a cleared date put the invoice back in the chasing list', () => {
    expect(extractDecl('snoozeInvoiceFromView', mainJs)).toContain('back in the chasing list');
  });
});

describe('the chase record survives an edit', () => {
  it('carries reminders and the promised date forward when an invoice is saved', () => {
    // Losing the history would let the same bill be chased again as if new.
    const save = extractDecl('saveInvoice', mainJs);
    expect(save).toContain('payload.reminders = old.reminders');
    expect(save).toContain('payload.remindAfter = old.remindAfter');
  });

  it('shows the chase on the invoice card and in the preview', () => {
    const render = extractDecl('renderInvoices', mainJs);
    expect(render).toContain('invoiceReminderState(inv)');
    expect(render).toContain('chaseChip');
    // Never on a settled bill — "chased" beside "PAID" reads as a mistake.
    expect(render).toContain("inv.status === 'paid' || inv.status === 'cancelled'");
  });

  it('keeps the chase record off the customer’s copy', () => {
    // The same paper is downloaded, printed and emailed to the customer. How
    // many times you have chased them is your business, not theirs — so the
    // note is opt-in, and only the on-screen preview opts in.
    const paper = extractDecl('renderInvoicePaperHTML', mainJs);
    expect(paper).toContain('function renderInvoicePaperHTML(inv, { showChase = false } = {})');
    expect(paper).toContain('if (!showChase) return \'\';');
    expect(paper).toContain('inv-meta-sub no-print');

    // The preview asks for it; the file the customer receives is built by
    // invoicePaperBodyWithQR, which does not.
    expect(mainJs).toContain("renderInvoicePaperHTML(inv, { showChase: true })");
    expect(extractDecl('invoicePaperBodyWithQR', mainJs)).toContain('renderInvoicePaperHTML(inv);');
  });
});

// ── the day-before heads-up, and the test send ──────────────────────────
// Both exist to keep a reminder from reaching somebody it shouldn't: one
// catches a customer who paid outside the app, the other lets the publisher
// read the mail before any customer does.

describe('the day-before heads-up', () => {
  const notice = () => extractDecl('noticeUpcomingReminders', mainJs);

  it('says nothing unless automatic chasing is on', () => {
    // A warning about a machine that isn't running is noise.
    expect(notice()).toContain('if (!cfg.auto) return null;');
  });

  it('is NOT held back by the send window', () => {
    // It sends nothing, and its whole purpose is to be waiting before the 9am
    // window opens — gating it on canSendNow would defeat the feature.
    expect(notice()).not.toContain('canSendNow');
  });

  it('appears once a day, on its own stamp', () => {
    expect(notice()).toContain('if (reminderNoticeShownToday()) return null;');
    expect(notice()).toContain('markReminderNoticeShown()');
    // A separate key from the send counter: one counts emails, one marks a day.
    expect(mainJs).toContain("const REMINDER_NOTICE_KEY = 'lm-invoice-reminder-notice';");
    expect(mainJs).toContain("const REMINDER_DAY_KEY = 'lm-invoice-reminder-day';");
  });

  it('offers a way to act, not just a number', () => {
    expect(notice()).toContain("actionLabel: 'Review them'");
    expect(notice()).toContain("action: 'openReminderReview()'");
  });

  it('runs before the sweep on every tick', () => {
    const watch = extractDecl('startPaymentReminderWatch', mainJs);
    const noticeAt = watch.indexOf('noticeUpcomingReminders()');
    const sweepAt = watch.indexOf('sweepPaymentReminders()');
    expect(noticeAt).toBeGreaterThan(-1);
    expect(sweepAt).toBeGreaterThan(noticeAt);
  });

  it('asks the shared helper what tomorrow holds', () => {
    // Never re-derives "due date plus threshold": the warning and the sweep
    // must not be able to disagree about who gets chased.
    expect(extractDecl('invoicesDueTomorrow', mainJs)).toContain('dueForReminderTomorrow(');
    expect(extractDecl('invoicesDueTomorrow', mainJs)).toContain('isTestBookId(bookId)');
  });
});

describe('the review list', () => {
  it('settles through the one existing writer, never its own', () => {
    // There is exactly one writer of inv.status = 'paid' in this app.
    const fn = extractDecl('reminderReviewMarkPaid', mainJs);
    expect(fn).toContain('applyInvoicePaid(inv, bookId, s)');
    expect(fn).not.toContain("inv.status = 'paid'");
  });

  it('confirms before touching the ledger', () => {
    expect(extractDecl('reminderReviewMarkPaid', mainJs)).toContain('confirmDialog(');
  });

  it('repaints everything a settled invoice touches', () => {
    const fn = extractDecl('reminderReviewMarkPaid', mainJs);
    for (const call of ['renderReminderReview()', 'renderInvoices()', 'renderLedger()', 'updateDash()']) {
      expect(fn).toContain(call);
    }
  });

  it('holds off on the date they gave, and can be cleared', () => {
    const fn = extractDecl('reminderReviewHoldOff', mainJs);
    expect(fn).toContain("inputType: 'date'");
    expect(fn).toContain('inv.remindAfter = value;');
    expect(fn).toContain('back in the chasing list');
  });

  it('never leaves a blank panel behind', () => {
    expect(extractDecl('renderReminderReview', mainJs)).toContain('empty-state');
  });

  it('has somewhere to render, reachable from the card', () => {
    expect(indexHtml).toContain('id="m-reminder-review"');
    expect(indexHtml).toContain('id="reminder-review-body"');
    expect(mainJs).toContain('openReminderReview, reminderReviewMarkPaid, reminderReviewHoldOff, sendTestReminderEmail,');
  });
});

describe('the test reminder', () => {
  const fn = () => extractDecl('sendTestReminderEmail', mainJs);

  it('writes absolutely nothing', () => {
    // A test is not a chase: an invoice borrowed as the sample must not fall
    // out of the queue, and the day's send count must not move.
    const body = fn();
    expect(body).not.toContain('reminders.push');
    expect(body).not.toContain('bumpReminderDayCount');
    expect(body).not.toContain('saveState');
  });

  it('uses the wording currently typed, saved or not', () => {
    expect(fn()).toContain("$('ivs-remind-msg') ? $('ivs-remind-msg').value");
    expect(fn()).toContain("$('ivs-remind-days') ? $('ivs-remind-days').value");
  });

  it('marks the subject so a stray forward never reads as a real chase', () => {
    expect(fn()).toContain('`[TEST] ${mail.subject}`');
  });

  it('builds from a real outstanding invoice before inventing one', () => {
    // The point of the test send is to read what a customer will receive —
    // live store, live amount, live pay link — so the invented sample is the
    // last resort, not the answer whenever nothing is past due yet.
    const body = fn();
    const realAt = body.indexOf('invoicesChaseable()[0]');
    const sampleAt = body.indexOf('sampleReminderInvoice(');
    expect(realAt).toBeGreaterThan(-1);
    expect(sampleAt).toBeGreaterThan(realAt);
    expect(body).toContain('invoicesAwaitingReminder(cfg.days, 1)[0]');
    expect(body).toContain('invoicesDueTomorrow(cfg.days)[0]');
  });

  it('never dresses a real invoice in the example payment link', () => {
    const body = fn();
    expect(body).toContain("const livePayLink = real ? (effectivePaymentLink(inv) || '') : 'https://buy.stripe.com/example';");
    expect(body).toContain('payLink: livePayLink,');
    // And says so when the real bill turns out to have no link at all.
    expect(body).toContain('has no payment link');
  });

  it('names the invoice it was built from, so live details can be checked', () => {
    expect(fn()).toContain('reads as ${inv.num}');
  });

  it('falls back to a sample so it works before anything is outstanding', () => {
    expect(fn()).toContain('sampleReminderInvoice({ today: today(), days: cfg.days })');
  });

  it('only offers unpaid, emailable bills as the sample', () => {
    const pick = extractDecl('invoicesChaseable', mainJs);
    expect(pick).toContain("inv.status !== 'sent'");
    expect(pick).toContain('inv.storeEmail');
    // Never a demo book's fixture invoice.
    expect(pick).toContain('isTestBookId(bookId)');
  });

  it('asks where to send when no address is on file', () => {
    expect(fn()).toContain('promptDialog(');
    expect(fn()).toContain('Nobody else receives it.');
  });

  it('needs the sheet connected, and reports a failure', () => {
    expect(fn()).toContain('if (!sheetsUrl)');
    expect(fn()).toContain('Could not send the test');
  });

  it('is offered in the settings form, with what it does spelled out', () => {
    expect(indexHtml).toContain('onclick="sendTestReminderEmail()"');
    expect(indexHtml).toContain('no invoice is touched or counted as chased');
  });
});

describe('the invoice PDF attached to a reminder', () => {
  it('shares one PDF builder with the download button, rather than a second copy of the rasterizing logic', () => {
    // downloadInvoicePDF must still end by SAVING a file, never by reading one
    // back out as base64 — that would mean the two paths had drifted apart.
    const download = extractDecl('downloadInvoicePDF', mainJs);
    expect(download).toContain('buildInvoiceJsPdf(invoicePaperBodyWithQR(inv))');
    expect(download).toContain('pdf.save(');
    expect(download).not.toContain('.output(');

    const attach = extractDecl('buildInvoicePdfAttachment', mainJs);
    expect(attach).toContain('buildInvoiceJsPdf(invoicePaperBodyWithHeadlessQR(inv))');
    expect(attach).toContain("pdf.output('datauristring')");
  });

  it('draws its own QR instead of relying on a view nobody has open', () => {
    // A reminder from the background sweep, or a test-send, has no open
    // invoice view to borrow a live QR canvas from the way the download
    // button's invoicePaperBodyWithQR does.
    const headless = extractDecl('invoicePaperBodyWithHeadlessQR', mainJs);
    expect(headless).toContain('new QRCode(qrHolder');
    expect(headless).not.toContain('#invoice-print-area');
  });

  it('is best-effort — a render failure returns null rather than throwing', () => {
    expect(extractDecl('buildInvoicePdfAttachment', mainJs)).toContain('return null;');
  });

  it('is built before the email copy, and told to the copy honestly', () => {
    // The wording must never claim an attachment that failed to build.
    for (const fnName of ['sendInvoiceReminder', 'sendTestReminderEmail']) {
      const fn = extractDecl(fnName, mainJs);
      const builtAt = fn.indexOf('buildInvoicePdfAttachment(inv)');
      const mailAt = fn.indexOf('buildReminderEmail(inv,');
      expect(builtAt, `${fnName} should build the attachment`).toBeGreaterThan(-1);
      expect(mailAt).toBeGreaterThan(builtAt);
      expect(fn).toContain('attached: !!attachment');
    }
  });

  it('hands the built attachment to the actual send call', () => {
    for (const fnName of ['sendInvoiceReminder', 'sendTestReminderEmail']) {
      expect(extractDecl(fnName, mainJs)).toContain('attachment ? [attachment] : null');
    }
  });

  it('sendSingleEmailViaBackend threads attachments into the real send, not the local mock', () => {
    const fn = extractDecl('sendSingleEmailViaBackend', mainJs);
    expect(fn).toContain('attachments = null');
    expect(fn).toContain('attachments: attachments && attachments.length ? attachments : undefined');
  });
});

describe('Apps Script attachment support (v43)', () => {
  const gas = readFileSync(path.join(__dirname, '../apps-script/Code.gs'), 'utf8');

  it('decodes the client’s attachment into a Blob without sinking the email on a bad one', () => {
    expect(gas).toContain("Utilities.newBlob(");
    expect(gas).toContain('Utilities.base64Decode(a.base64)');
  });

  it('reaches every Gmail send path: thread reply, new thread, and the default sendMail_ call', () => {
    expect(gas).toContain('if (blobs.length) opts.attachments = blobs;');
    expect(gas).toContain('if (blobs.length) draftOpts.attachments = blobs;');
  });

  it('reaches every third-party provider in its own confirmed shape', () => {
    expect(gas).toContain('payload.attachments = attachmentsB64.map(function (a) { return { content: a.base64, filename: a.filename }; });'); // Resend
    expect(gas).toContain('payload.attachment = attachmentsB64.map(function (a) { return { content: a.base64, name: a.filename }; });'); // Brevo — singular field name
    expect(gas).toContain("disposition: 'attachment'"); // SendGrid
    expect(gas).toContain('Name: a.filename, Content: a.base64, ContentType: a.contentType'); // Postmark
    expect(gas).toContain('form.attachment = attachments[0];'); // Mailgun — multipart via a Blob value
  });

  it('bumped the version in lockstep: Code.gs, main.js and the changelog all agree', () => {
    // Derived rather than pinned: the point of this guard is that the four
    // places move TOGETHER, not that they sit on any particular number. Pinning
    // it meant every bump failed here first and got edited to match, which is
    // exactly the rubber-stamp the guard exists to prevent.
    const version = gas.match(/scriptVersion: '(v\d+)'/)?.[1];
    expect(version, 'Code.gs must declare a scriptVersion').toBeTruthy();
    expect(gas).toContain(`service: 'lyrical-sheets-webhook-${version}'`);
    expect(mainJs).toContain(`const EXPECTED_SCRIPT_VERSION = '${version}';`);
    // The bump must bring its own changelog entry, not inherit an older one.
    expect(gas).toMatch(new RegExp(`\\*\\s+\\d+\\. ${version}:`));
    // Earlier entries stay put as history.
    expect(gas).toMatch(/v43:[\s\S]{0,400}attachment/);
    expect(gas).toMatch(/v44:[\s\S]{0,400}extractreceipt/);
  });

  it('public/gas-code.txt is byte-for-byte the deployed script', () => {
    const published = readFileSync(path.join(__dirname, '../public/gas-code.txt'), 'utf8');
    expect(published).toBe(gas);
  });
});
