// Invoices — the publisher's invoices inside the Consignment tab: the invoice
// template settings, the exact-amount Stripe payment link per invoice (also
// used by the register and the fair kit for their QR codes), invoices that
// span several books, the invoice editor (who it bills, due-date shortcuts,
// line items, the invoice-wide discount), and the printable / emailed / PDF
// invoice view.
//
// Lifted out of src/main.js as one unit, verbatim. Nothing here runs at
// module-evaluation time (the top level is constants, empty state and
// function declarations), which is what makes the main.js <-> feature import
// cycle safe. Inline onclick handlers keep reaching these functions through
// exposeLegacyInlineHandlers in main.js, which imports them back.
//
// eslint's no-undef (an error, checked in CI) is what keeps the import list
// honest: an identifier that isn't imported fails the build rather than
// throwing at click time.
import {
  $,
  acceptedBookPaymentLink,
  applyConSection,
  getAcceptedPaymentMethodsForBook,
  invoicesAwaitingReminder,
  isAuthor,
  isTestBook,
  isTestBookId,
  ledgerById,
  openConsignPayment,
  renderHist,
  renderLedger,
  saveState,
  setConTabCount,
  settleLedgerSalePaid,
  sheetsUrl,
  showToast,
  sweepPaymentReminders,
  today,
} from '../main.js';
import { BOOKS, BOOK_LIST, states, activeBook, getState, getBook } from '../core/store.js';
import { localDayPlus } from '../lib/calendar-day.js';
import { consignmentSyncPayload, stampLedgerInvoiceLink } from '../lib/consignment.js';
import { downloadText } from '../lib/download.js';
import { loadExternalScript } from '../lib/external-scripts.js';
import { escapeHtml } from '../lib/html.js';
import { isZeroDecimalCurrency } from '../lib/invoice-payments.js';
import {
  BILL_TO_PERSON,
  BILL_TO_STORE,
  billToPayload,
  billToPersonFrom,
  buildInvoiceNumber,
  clampPercent,
  computeInvoiceTotals,
  daysBetween,
  deriveInvoiceBookIds,
  dueDateFromTerms,
  duplicateInvoiceContent,
  findInvoiceAcrossBooks,
  formatInvoiceUnitPrice,
  invoiceBillToMode,
  invoiceBookSplit,
  invoiceHasLineDiscounts,
  invoiceLineAmount,
  invoiceLineGross,
  invoiceNumberPrefix,
  invoicesForBook,
  invoiceShareForBook,
  lineItemBookId,
  neutralInvoicePrefix,
  nextInvoiceSeq,
  otherBookTitles,
  parseDiscountEntry,
} from '../lib/invoices.js';
import { closeM, confirmDialog, fieldError, openM, refreshUnsavedMarkers } from '../lib/modal.js';
import {
  fmt,
  fmtD,
  getBookCurrencyCode,
  getSym,
  normalizeCurrencyCode,
  putCurrencyFirst,
  setSelectCurrency,
} from '../lib/money.js';
import { describeReminderArming, invoiceReminderState, reminderSettings } from '../lib/payment-reminders.js';
import { pdfLinkPlacements, pdfSafeLinkUrl } from '../lib/pdf-links.js';
import { followableUrl } from '../lib/receipt-links.js';
import { createStripePriceAndLink } from '../lib/stripe-payment-link.js';
import { syncToSheets } from './sheets-bridge.js';

// ═══════════════════════════════════════════════════════════════════════
//  INVOICES (publisher-only, lives inside Consignment tab)
// ═══════════════════════════════════════════════════════════════════════
const INVOICE_SETTINGS_KEY = 'lm-invoice-settings';
function getInvoiceSettings() {
  try { return JSON.parse(localStorage.getItem(INVOICE_SETTINGS_KEY) || '{}'); }
  catch (e) { return {}; }
}
function saveInvoiceSettingsObj(o) { localStorage.setItem(INVOICE_SETTINGS_KEY, JSON.stringify(o || {})); }

function openInvoiceTemplateSettings() {
  const s = getInvoiceSettings();
  $('ivs-name').value = s.name || 'Lyricalmyrical Books';
  $('ivs-email').value = s.email || '';
  $('ivs-addr').value = s.addr || '';
  $('ivs-vat').value = s.vat || '';
  $('ivs-web').value = s.web || '';
  $('ivs-terms').value = s.terms || 'Net 30. Payment via Stripe, PayPal, or bank transfer.';
  $('ivs-footer').value = s.footer || 'Thank you for stocking our books.';
  $('ivs-bank').value = s.bank || '';
  if ($('ivs-stripe-key')) $('ivs-stripe-key').value = s.stripeKey || '';
  if ($('ivs-stripe-auto')) $('ivs-stripe-auto').checked = s.stripeAuto !== false; // default ON
  if ($('ivs-stripe-test')) $('ivs-stripe-test').checked = !!s.stripeTest;
  // Reminders are off until the publisher deliberately arms them — this one
  // sends email to customers, so it must never arrive switched on.
  const rem = reminderSettings(s);
  if ($('ivs-remind-auto')) $('ivs-remind-auto').checked = rem.auto;
  if ($('ivs-remind-days')) $('ivs-remind-days').value = String(rem.days);
  if ($('ivs-remind-msg')) $('ivs-remind-msg').value = rem.message;
  openM('invoice-settings');
}
async function saveInvoiceSettings() {
  const prev = reminderSettings(getInvoiceSettings());
  const wantsAuto = $('ivs-remind-auto') ? !!$('ivs-remind-auto').checked : false;
  const next = reminderSettings({
    remindAuto: wantsAuto,
    remindDays: $('ivs-remind-days') ? $('ivs-remind-days').value : '',
    remindMsg: $('ivs-remind-msg') ? $('ivs-remind-msg').value : '',
  });

  // Switching this on is the one setting here that reaches other people. Say
  // how many customers hear from you as a result BEFORE saving it, because the
  // answer on a shop with a year of unpaid invoices on file is not "none".
  if (next.auto && !prev.auto) {
    const pending = invoicesAwaitingReminder(next.days).length;
    const ok = await confirmDialog(
      describeReminderArming({ count: pending, days: next.days }),
      { okLabel: pending ? `Yes, chase ${pending}` : 'Turn on', title: 'Automatic reminders' },
    );
    if (!ok) { if ($('ivs-remind-auto')) $('ivs-remind-auto').checked = false; return; }
  }

  saveInvoiceSettingsObj({
    name: $('ivs-name').value.trim(),
    email: $('ivs-email').value.trim(),
    addr: $('ivs-addr').value.trim(),
    vat: $('ivs-vat').value.trim(),
    web: $('ivs-web').value.trim(),
    terms: $('ivs-terms').value.trim(),
    footer: $('ivs-footer').value.trim(),
    bank: $('ivs-bank').value.trim(),
    stripeKey: $('ivs-stripe-key') ? $('ivs-stripe-key').value.trim() : '',
    stripeAuto: $('ivs-stripe-auto') ? !!$('ivs-stripe-auto').checked : true,
    stripeTest: $('ivs-stripe-test') ? !!$('ivs-stripe-test').checked : false,
    remindAuto: next.auto,
    remindDays: next.days,
    remindMsg: next.message,
  });
  closeM('invoice-settings');
  showToast('✓ Invoice settings saved');
  // Don't make the publisher wait an hour to see the thing they just switched
  // on do something. Nothing is sent outside the weekday daytime window either
  // way — the sweep decides that, not this call.
  if (next.auto && !prev.auto) sweepPaymentReminders();
}

// ── STRIPE DYNAMIC PAYMENT LINK (exact-amount Checkout per invoice) ─────
// The zero-decimal currency list lives in lib/invoice-payments.js — this file
// held two byte-identical copies of it and the payment judge needed a third.
// Getting it wrong is a factor of a hundred, not a rounding error.

async function createStripePaymentLinkForInvoice(invoice) {
  const settings = getInvoiceSettings();
  const key = (settings.stripeKey || '').trim();
  if (!key) throw new Error('Stripe key not set — open Invoice Settings to add one');
  if (!/^(rk|sk)_/.test(key)) throw new Error("That doesn't look like a Stripe restricted/secret key (expected rk_… or sk_…)");

  const book = BOOKS[activeBook] || getBook();
  // prefer the stored ISO code; fall back to symbol→code lookup
  const curCode = (invoice.currencyCode || getBookCurrencyCode({ currency: invoice.currency || book.currency }) || 'EUR').toLowerCase();
  const isZeroDec = isZeroDecimalCurrency(curCode);
  const total = Number(invoice.total || 0);
  const amount = isZeroDec ? Math.round(total) : Math.round(total * 100);
  if (amount < 50 && !isZeroDec) throw new Error('Amount too small for Stripe (minimum 0.50)');
  if (amount < 1) throw new Error('Amount must be greater than zero');

  const description = `${invoice.num} — ${invoice.storeName || 'Consignment store'} (${book.title || 'Book'})`;

  // 1. Create a Price (with inline product_data — Stripe creates the product on the fly)
  const priceParams = new URLSearchParams();
  priceParams.set('unit_amount', String(amount));
  priceParams.set('currency', curCode);
  priceParams.set('product_data[name]', description.slice(0, 250));
  priceParams.set('nickname', invoice.num);
  // attach metadata to the price so it shows up in the Stripe dashboard
  priceParams.set('metadata[invoice_num]', invoice.num || '');
  priceParams.set('metadata[store_name]', invoice.storeName || '');
  priceParams.set('metadata[book_id]', book.id || '');


  // 2. Create the Payment Link
  const linkParams = new URLSearchParams();
  linkParams.set('line_items[0][quantity]', '1');
  linkParams.set('metadata[invoice_num]', invoice.num || '');
  linkParams.set('metadata[store_id]', String(invoice.storeId || ''));
  linkParams.set('metadata[store_name]', invoice.storeName || '');
  linkParams.set('metadata[book_id]', book.id || '');
  linkParams.set('payment_intent_data[description]', description.slice(0, 350));
  linkParams.set('payment_intent_data[metadata][invoice_num]', invoice.num || '');
  linkParams.set('payment_intent_data[metadata][store_name]', invoice.storeName || '');
  linkParams.set('payment_intent_data[statement_descriptor_suffix]', (invoice.num || 'Invoice').replace(/[^A-Za-z0-9\- ]/g, '').slice(0, 22));
  linkParams.set('allow_promotion_codes', 'false');
  linkParams.set('billing_address_collection', 'auto');

  const { price, link } = await createStripePriceAndLink(key, priceParams, linkParams);

  return {
    url: link.url,
    paymentLinkId: link.id,
    priceId: price.id,
    amount, currency: curCode,
    livemode: !!link.livemode,
    createdAt: Date.now(),
  };
}

async function deactivateStripePaymentLink(paymentLinkId) {
  const key = (getInvoiceSettings().stripeKey || '').trim();
  if (!key || !paymentLinkId) return;
  try {
    const params = new URLSearchParams();
    params.set('active', 'false');
    await fetch(`https://api.stripe.com/v1/payment_links/${encodeURIComponent(paymentLinkId)}`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
  } catch (e) { /* best effort */ }
}

function invoicesVisibleHere() {
  // Publisher only, single-book view only (invoice numbering is per-book)
  return !!window.IS_PUBLISHER && !isAuthor() && activeBook && activeBook !== 'all';
}

// ── Invoices span books ──────────────────────────────────────────────────
// One invoice can bill several titles, but it is stored in a single book's
// state. These two resolve an invoice by id wherever it actually lives, so
// viewing, editing, paying or deleting it works identically from any title it
// covers — and so the save lands on the book that holds it, not on whichever
// book happens to be open. See ./lib/invoices.js for the matching rules.
function locateInvoice(id) {
  return findInvoiceAcrossBooks(states, id, activeBook);
}

// The state object holding `id`, plus the book id to persist. Falls back to the
// active book so callers can stay a single code path when the id is unknown.
function invoiceHome(id) {
  const hit = locateInvoice(id);
  if (!hit) return { inv: null, bookId: activeBook, s: getState() };
  return { inv: hit.inv, bookId: hit.ownerBookId, s: states[hit.ownerBookId] || getState() };
}

function renderInvoices() {
  const section = $('invoices-section');
  if (!section) return;
  if (!invoicesVisibleHere()) { section.style.display = 'none'; applyConSection(); return; }
  section.style.display = '';
  applyConSection();

  const book = getBook(), cur = book.currency, list = $('invoices-list'), summary = $('inv-summary');
  // An invoice bills a store, and one invoice can list several titles. Gather
  // every invoice that charges for THIS book — the ones it holds itself plus
  // the ones another title holds but that bill this one too — so a multi-title
  // invoice is reachable from each title on it, not just the one it was
  // written from.
  const rows = invoicesForBook(states, BOOK_LIST, activeBook, isTestBookId);
  // ⚡ Bolt Optimization: Use string comparison instead of localeCompare for sorting ISO "YYYY-MM-DD" dates
  rows.sort((a, b) => { const dA = a.inv.date || ''; const dB = b.inv.date || ''; return dA > dB ? -1 : (dA < dB ? 1 : ((b.inv.createdAt || 0) - (a.inv.createdAt || 0))); });
  const invs = rows.map(r => r.inv);
  setConTabCount('invoices', invs.length);

  // Mark overdue automatically (visual only, not persisted)
  const todayStr = today();
  // Never written onto the stored invoice (it would be saved and outlive a paid/cancelled status).
  const overdueIds = new Set();
  for (const inv of invs) {
    delete inv._overdue; // clear any flag an older version saved
    if (inv.status === 'sent' && inv.dueDate && inv.dueDate < todayStr) overdueIds.add(inv.id);
  }

  // Summary line
  // ⚡ Bolt Optimization: Calculate outstanding, paid, and drafts in a single pass instead of iterating over the `invs` array three times.
  // Totals are kept per currency: an invoice in another currency is never added into the book's.
  const outByCur = new Map(), paidByCur = new Map();
  let drafts = 0, shared = 0;
  const addTo = (m, i) => { const c = i.currency || cur; m.set(c, (m.get(c) || 0) + (i.total || 0)); };
  for (const r of rows) {
    const i = r.inv;
    if (r.shared) shared++;
    if (i.status === 'sent') addTo(outByCur, i);
    else if (i.status === 'paid') addTo(paidByCur, i);
    else if (i.status === 'draft') drafts++;
  }
  const sumText = m => m.size ? [...m].map(([c, v]) => fmt(v, c)).join(' + ') : fmt(0, cur);
  // One figure per span, so a phone can stack them. The separators are kept in
  // the DOM (hidden on a phone) so the line reads the same everywhere.
  const sumParts = [`${invs.length} total`, `${sumText(outByCur)} outstanding`, `${sumText(paidByCur)} collected`];
  if (drafts) sumParts.push(`${drafts} draft${drafts > 1 ? 's' : ''}`);
  if (shared) sumParts.push(`${shared} shared with another title`);
  summary.replaceChildren(...sumParts.flatMap((text, i) => {
    const part = document.createElement('span');
    part.className = 'inv-sum-part';
    part.textContent = text;
    if (!i) return [part];
    const sep = document.createElement('span');
    sep.className = 'inv-sum-sep';
    sep.setAttribute('aria-hidden', 'true');
    sep.textContent = ' · ';
    return [sep, part];
  }));

  if (!invs.length) {
    list.innerHTML = '<div class="empty-state"><div class="e-icon">📄</div>No invoices yet. Click <strong>+ New invoice</strong> to bill a consignment store — or anyone else who owes you.<div style="margin-top:12px;"><button class="btn gold" onclick="openCreateInvoice()">+ New invoice</button></div></div>';
    return;
  }

  list.innerHTML = rows.map(({ inv, ownerBookId }) => {
    const statusLabel = overdueIds.has(inv.id) ? 'OVERDUE' : (inv.status || 'draft').toUpperCase();
    const statusCls = overdueIds.has(inv.id) ? 'overdue' : (inv.status || 'draft');
    const due = inv.dueDate ? fmtD(inv.dueDate) : '—';
    const stripeChip = isDynamicStripeLink(inv)
      ? `<span class="chip-status gold sm" title="Dynamic Stripe Checkout · exact amount">💳 Stripe</span>`
      : '';
    // Name the other titles on the invoice so a shared one reads as one bill
    // covering several books, not as a stray record filed under the wrong title.
    const others = otherBookTitles(inv, ownerBookId, activeBook, BOOK_LIST);
    const sharedChip = others.length
      ? `<span class="chip-status gray sm" title="This invoice also bills: ${escapeHtml(others.join(', '))}">＋ ${escapeHtml(others.join(' · '))}</span>`
      : '';
    // An invoice carries its own currency, and a shared one may well be priced
    // in a different one than the book being viewed — show what it actually bills.
    const invCur = inv.currency || cur;
    // On a bill covering several titles, the headline total is what the shop
    // pays for all of them — so say what this title's share of it is, rather
    // than leaving the whole amount to read as this book's earnings.
    const share = others.length ? invoiceShareForBook(inv, ownerBookId, activeBook, BOOK_LIST) : null;
    const shareLine = share
      ? `<div class="inv-c-store-meta" style="margin-top:2px;">${escapeHtml(book.title)}'s share: <strong class="mono-num">${fmt(share.total, invCur)}</strong></div>`
      : '';
    // Say when a bill went to somebody who isn't a consignment store, so a
    // direct sale isn't read as a shop that owes money on the shelf.
    const personChip = invoiceBillToMode(inv) === BILL_TO_PERSON
      ? `<span class="chip-status gray sm" title="Billed to a person, not a consignment store">\u{1F464} Person</span>`
      : '';
    // What has been said to this customer about this bill, where the bill is
    // listed — so a reminder is never sent twice by hand, and a promise to pay
    // is visible without opening anything.
    const remState = invoiceReminderState(inv);
    const isSettled = inv.status === 'paid' || inv.status === 'cancelled';
    let chaseChip = '';
    if (!isSettled && remState.snoozedUntil && today() <= remState.snoozedUntil) {
      chaseChip = `<span class="chip-status gray sm" title="They said they would pay by then — no reminder goes out before it">\u{1F4C5} Promised ${escapeHtml(fmtD(remState.snoozedUntil))}</span>`;
    } else if (!isSettled && remState.lastStatus === 'failed') {
      chaseChip = `<span class="chip-status red sm" title="The reminder email did not go out — open the invoice to try again">\u{23F0} Reminder failed</span>`;
    } else if (remState.count) {
      const when = remState.lastAt ? fmtD(new Date(remState.lastAt).toISOString().slice(0, 10)) : '';
      chaseChip = `<span class="chip-status gray sm" title="A payment reminder was emailed to this customer">\u{23F0} Chased${when ? ' ' + escapeHtml(when) : ''}</span>`;
    }
    // Chasing from the list, where the unpaid bills already are. The invoice
    // view has had this button for a while, but getting to it means opening
    // the one row you were already looking at — so the follow-up for a bill
    // that has gone quiet is one press from the list it is listed on.
    // Drafts are excluded deliberately: nobody has been billed yet, so there
    // is nothing to chase them about.
    const chaseEmail = String(inv.storeEmail || '').trim();
    const chaseBtn = inv.status === 'sent'
      ? (chaseEmail
        ? `<button class="btn sm gold" id="inv-chase-${escapeHtml(inv.id)}" onclick="remindInvoiceFromList('${inv.id}')" title="Email ${escapeHtml(chaseEmail)} a follow-up about ${escapeHtml(inv.num)}, with a link to pay it">⏰ ${remState.count ? 'Chase again' : 'Remind'}</button>`
        : `<button class="btn sm" disabled title="No email address on this invoice — add one and you can chase it from here">⏰ Remind</button>`)
      : '';
    return `<div class="invoice-card">
      <div class="inv-c-num">${escapeHtml(inv.num)}${stripeChip}${personChip}${chaseChip}${sharedChip}</div>
      <div class="inv-c-store">${escapeHtml(inv.storeName) || '—'}<div class="inv-c-store-meta">${[inv.storeEmail, inv.storeCity].filter(Boolean).map(escapeHtml).join(' · ') || '—'}</div>${shareLine}</div>
      <div class="inv-c-cell">Issued<strong>${fmtD(inv.date)}</strong></div>
      <div class="inv-c-cell">Due<strong>${due}</strong></div>
      <div class="inv-c-cell amt">Total<strong>${fmt(inv.total || 0, invCur)}</strong></div>
      <div class="inv-c-actions">
        <span class="inv-status ${statusCls}">${statusLabel}</span>
        <div class="inv-c-btns">
          ${chaseBtn}
          <button class="btn sm" onclick="viewInvoice('${inv.id}')">View</button>
          <button class="btn sm ink" onclick="openCreateInvoice(null,'${inv.id}')">Edit</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ── invoice editor state ────────────────────────────────────────────────
let invoiceCtx = null; // { editingId, items: [{description,qty,unitPrice}] }

function openCreateInvoice(storeId, editingId, { copyFrom = null } = {}) {
  // Edit the invoice where it lives. Opening a shared invoice from a title that
  // doesn't own it must still edit the one stored copy — including its store
  // list and currency, which belong to the owning book, not the one on screen.
  const hit = editingId ? locateInvoice(editingId) : null;
  if (editingId && !hit) { showToast('Invoice not found', 'err'); return; }
  // A copy is written into the same book as its original, so the store it
  // bills is on that book's store list and the copy files beside it.
  const source = !editingId && copyFrom ? locateInvoice(copyFrom) : null;
  const ownerBookId = hit ? hit.ownerBookId : (source ? source.ownerBookId : activeBook);
  const s = states[ownerBookId] || getState(), book = BOOKS[ownerBookId] || getBook();
  // Populate store dropdown
  const sel = $('inv-store');
  sel.innerHTML = '<option value="">— Select store —</option>' + (s.stores || []).map(st => `<option value="${st.id}">${escapeHtml(st.name)}${st.city ? ' · ' + escapeHtml(st.city) : ''}</option>`).join('');

  // set currency dropdown — default to book currency
  const bookCurCode = getBookCurrencyCode(book);
  if ($('inv-currency')) {
    putCurrencyFirst($('inv-currency'), bookCurCode);
    setSelectCurrency($('inv-currency'), bookCurCode);
  }
  $('inv-discount-sym').textContent = getSym(bookCurCode);

  if (editingId) {
    const inv = hit.inv;
    const items = JSON.parse(JSON.stringify(inv.items || []));
    // Settle each line's title before the pickers render, so an invoice written
    // before the picker existed opens showing the title it is actually billed
    // against rather than defaulting every line to the issuing book.
    for (const it of items) it.bookId = lineItemBookId(it, ownerBookId, invoiceBookOptions());
    invoiceCtx = { editingId, ownerBookId, items };
    $('inv-edit-title').textContent = `Edit ${inv.num}`;
    // Reopen the invoice on the side it was written on: a bill addressed to a
    // person by hand must come back as those typed-in details, not as an empty
    // store picker that silently drops the recipient on the next save.
    const mode = invoiceBillToMode(inv);
    fillInvoicePersonForm(mode === BILL_TO_PERSON ? billToPersonFrom(inv) : null);
    setInvoiceBillToMode(mode, { silent: true });
    sel.value = mode === BILL_TO_PERSON ? '' : (inv.storeId || '');
    $('inv-num').value = inv.num || '';
    $('inv-date').value = inv.date || today();
    $('inv-due').value = inv.dueDate || '';
    if (inv.discountType === 'percent') setInvoiceDiscountUI('percent', inv.discountRate || 0);
    else setInvoiceDiscountUI('flat', inv.discount || 0);
    $('inv-tax').value = inv.taxRate ? String(inv.taxRate) : '';
    $('inv-paylink').value = inv.paymentLink || '';
    $('inv-notes').value = inv.notes || '';
    $('inv-terms').value = inv.terms || '';
    $('inv-delete-btn').style.display = '';
    // A draft can stay a draft; anything already sent, paid or cancelled can't
    // be quietly pulled back to one from here.
    invoiceCtx.originalStatus = inv.status || 'draft';
    $('inv-save-draft-btn').style.display = invoiceCtx.originalStatus === 'draft' ? '' : 'none';
    // restore invoice's own currency
    const invCurCode = normalizeCurrencyCode(inv.currency || bookCurCode, bookCurCode);
    if ($('inv-currency')) setSelectCurrency($('inv-currency'), invCurCode);
    $('inv-discount-sym').textContent = getSym(invCurCode);
  } else {
    invoiceCtx = { editingId: null, ownerBookId, items: [] };
    $('inv-edit-title').textContent = 'New invoice';
    // A fresh invoice starts on the common case — billing a store — with the
    // hand-typed fields wiped so nothing carries over from the last one.
    fillInvoicePersonForm(null);
    setInvoiceBillToMode(BILL_TO_STORE, { silent: true });
    sel.value = storeId ? String(storeId) : '';
    // Starts on this book's own numbering; refreshAutoInvoiceNumber moves it to
    // the neutral prefix if a second title is added before the invoice is saved.
    invoiceCtx.autoNum = nextInvoiceNumber([ownerBookId]);
    $('inv-num').value = invoiceCtx.autoNum;
    $('inv-date').value = today();
    // default due date = 30 days from today
    $('inv-due').value = localDayPlus(30);
    // Percent first: it is the discount publishers reach for most (a store's
    // trade discount), so the box is ready for "40" without a mode change.
    setInvoiceDiscountUI('percent', 0);
    $('inv-tax').value = '';
    $('inv-paylink').value = '';
    const settings = getInvoiceSettings();
    $('inv-notes').value = '';
    $('inv-terms').value = settings.terms || 'Net 30. Payment via Stripe, PayPal, or bank transfer.';
    $('inv-delete-btn').style.display = 'none';
    $('inv-save-draft-btn').style.display = '';
    if (source) fillInvoiceEditorFromCopy(source.inv, sel);
    else if (storeId) prefillFromPendingSales(storeId);
    else addInvoiceItem();
  }
  syncInvoiceDueChips();
  renderInvoiceItems();
  recalcInvoiceTotals();
  openM('invoice-edit');
}

// "Duplicate": a new invoice carrying the original's customer, lines, discount,
// tax, currency, notes and terms — with today's date, a fresh number and no
// payment link (a Stripe link is for the old invoice's exact amount). Lines
// that were consignment sales lose their link to those sales, since the
// original invoice is still the one billing them.
function fillInvoiceEditorFromCopy(srcInv, sel) {
  const copy = duplicateInvoiceContent(srcInv);
  invoiceCtx.items = copy.items;
  invoiceCtx.copiedFrom = srcInv.num || '';
  $('inv-edit-title').textContent = srcInv.num ? `New invoice (copy of ${srcInv.num})` : 'New invoice (copy)';
  if (copy.billTo === BILL_TO_PERSON) {
    fillInvoicePersonForm(copy.person);
    setInvoiceBillToMode(BILL_TO_PERSON, { silent: true });
  } else {
    setInvoiceBillToMode(BILL_TO_STORE, { silent: true });
    sel.value = copy.storeId != null ? String(copy.storeId) : '';
    onInvoiceStoreChange();
  }
  setInvoiceDiscountUI(copy.discountType, copy.discountValue);
  $('inv-tax').value = copy.taxRate ? String(copy.taxRate) : '';
  $('inv-notes').value = copy.notes;
  if (copy.terms) $('inv-terms').value = copy.terms;
  if (copy.currencyCode && $('inv-currency')) {
    setSelectCurrency($('inv-currency'), copy.currencyCode);
    $('inv-discount-sym').textContent = getSym(getInvoiceCurrency());
  }
  // Keep the original's gap between issue and due date ("Net 15" stays Net 15).
  const gap = daysBetween(srcInv.date, srcInv.dueDate);
  if (gap != null && gap >= 0) $('inv-due').value = dueDateFromTerms($('inv-date').value, gap);
  refreshAutoInvoiceNumber();
  if (copy.linkedSalesDropped) {
    showToast(`Copied ${copy.items.length} line${copy.items.length === 1 ? '' : 's'} — they are no longer tied to the consignment sales on ${srcInv.num || 'the original'}`, 'ok', 4500);
  }
}

function duplicateInvoiceFromView() {
  if (!currentViewInvoiceId) return;
  const id = currentViewInvoiceId;
  const hit = locateInvoice(id);
  if (!hit) { showToast('Invoice not found', 'err'); return; }
  closeM('invoice-view');
  setTimeout(() => openCreateInvoice(null, null, { copyFrom: id }), 60);
}

// ── due-date shortcuts ──────────────────────────────────────────────────
// "30 days" sets the due date from the issue date, and moves with it if the
// issue date changes afterwards. Typing a due date by hand lights up whichever
// shortcut it happens to match, or none.
const INV_TERMS_PHRASE = /^(?:net\s*\d+|due\s+on\s+receipt)\b\.?/i;

function invoiceDueTermPhrase(days) {
  return days === 0 ? 'Due on receipt.' : `Net ${days}.`;
}

function syncInvoiceDueChips() {
  const days = daysBetween($('inv-date')?.value, $('inv-due')?.value);
  if (invoiceCtx) invoiceCtx.dueTermDays = days;
  document.querySelectorAll('#m-invoice-edit [data-due-days]').forEach(btn => {
    btn.setAttribute('aria-pressed', String(days != null && Number(btn.dataset.dueDays) === days));
  });
}

function applyInvoiceDueTerm(days) {
  const issue = $('inv-date').value || today();
  if (!$('inv-date').value) $('inv-date').value = issue;
  $('inv-due').value = dueDateFromTerms(issue, days);
  // Keep the written terms saying the same thing as the date — a bill that is
  // due in 15 days must not still print "Net 30" underneath.
  const termsEl = $('inv-terms');
  if (termsEl) {
    const t = termsEl.value.trim();
    if (!t) termsEl.value = invoiceDueTermPhrase(days);
    else if (INV_TERMS_PHRASE.test(t)) termsEl.value = t.replace(INV_TERMS_PHRASE, invoiceDueTermPhrase(days));
  }
  syncInvoiceDueChips();
}

function onInvoiceIssueDateChange() {
  const days = invoiceCtx ? invoiceCtx.dueTermDays : null;
  if (days != null && days >= 0 && $('inv-date').value) $('inv-due').value = dueDateFromTerms($('inv-date').value, days);
  syncInvoiceDueChips();
}

function onInvoiceDueDateChange() {
  syncInvoiceDueChips();
}

// Every invoice on record, across all books. A neutral-prefixed number is
// shared between titles, so its sequence has to be counted over the whole set
// rather than one book's list.
function allInvoicesEverywhere() {
  const out = [];
  for (const bid of Object.keys(states || {})) {
    if (isTestBookId(bid)) continue;
    for (const inv of ((states[bid] || {}).invoices || [])) out.push(inv);
  }
  return out;
}

// The number prefix for an invoice covering `bookIds`. One title keeps that
// title's own code; more than one gets the business's initials instead, because
// a bill charging for two books should not be numbered after just one of them.
function invoicePrefixForBooks(bookIds) {
  if (Array.isArray(bookIds) && bookIds.length > 1) {
    return neutralInvoicePrefix(getInvoiceSettings().name || 'Lyricalmyrical Books');
  }
  const bid = (bookIds && bookIds[0]) || activeBook;
  const book = BOOKS[bid] || getBook();
  return (book.id || 'BOOK').slice(0, 6).toUpperCase();
}

function nextInvoiceNumber(bookIds) {
  const s = getState();
  const year = new Date().getFullYear();
  const prefix = invoicePrefixForBooks(bookIds);
  // The per-book counter is a floor for that book's own prefix only; a shared
  // prefix is counted purely from the numbers already issued under it.
  const seqFloor = prefix === ((getBook().id || 'BOOK').slice(0, 6).toUpperCase()) ? (s.invoiceSeq || 0) : 0;
  const seq = Math.max(seqFloor + 1, nextInvoiceSeq(allInvoicesEverywhere(), prefix, year));
  return buildInvoiceNumber(prefix, year, seq);
}

// Keep an unsaved invoice's number in step with the titles it covers: adding a
// second title to a draft should move it off the first title's numbering. Only
// ever touches a number this function itself put there — the moment the
// publisher types their own, it is left alone, and a saved invoice never gets
// renumbered behind a shop that already has the old number.
function refreshAutoInvoiceNumber() {
  if (!invoiceCtx || invoiceCtx.editingId) return;
  const el = $('inv-num');
  if (!el || (invoiceCtx.autoNum && el.value.trim() !== invoiceCtx.autoNum)) return;
  const ownerBookId = invoiceCtx.ownerBookId || activeBook;
  const ids = deriveInvoiceBookIds({ items: invoiceCtx.items }, ownerBookId, BOOK_LIST);
  const next = nextInvoiceNumber(ids);
  if (next === el.value.trim()) return;
  el.value = next;
  invoiceCtx.autoNum = next;
}

// ── who the invoice bills ───────────────────────────────────────────────
// The editor addresses a bill either to a consignment store already on the
// shop list, or to a person typed in by hand. Both write the same recipient
// fields, so everything downstream — the invoice list, the printed page, the
// emailed copy, the PDF — is unchanged by which side was used.
const INV_PERSON_FIELDS = ['name', 'email', 'phone', 'address', 'city', 'region', 'postal', 'country'];

function currentInvoiceBillToMode() {
  const el = $('inv-billto-mode');
  return invoiceBillToMode({ billTo: el ? el.value : BILL_TO_STORE });
}

// Read the hand-typed recipient out of the form.
function readInvoicePersonForm() {
  const out = {};
  for (const f of INV_PERSON_FIELDS) {
    const el = $('inv-person-' + f);
    out[f] = el ? el.value : '';
  }
  return out;
}

// Put a recipient back into the form — on reopening a hand-typed invoice, and
// with a blank one when a new invoice starts.
function fillInvoicePersonForm(person) {
  const p = person || {};
  for (const f of INV_PERSON_FIELDS) {
    const el = $('inv-person-' + f);
    if (el) el.value = p[f] || '';
  }
}

function setInvoiceBillToMode(mode, { silent = false } = {}) {
  const next = invoiceBillToMode({ billTo: mode });
  const hidden = $('inv-billto-mode');
  if (hidden) hidden.value = next;
  const person = next === BILL_TO_PERSON;

  const storeGroup = $('inv-billto-store-group');
  const personGroup = $('inv-billto-person-group');
  const personDetails = $('inv-person-details');
  if (storeGroup) storeGroup.hidden = person;
  if (personGroup) personGroup.hidden = !person;
  if (personDetails) personDetails.hidden = !person;

  for (const [id, on] of [['inv-billto-tab-store', !person], ['inv-billto-tab-person', person]]) {
    const btn = $(id);
    if (!btn) continue;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
  }

  const hint = $('inv-billto-hint');
  if (hint) {
    hint.textContent = person
      ? 'Type the buyer\u2019s details by hand — nothing is added to your store list.'
      : 'Pick a consignment store you already work with.';
  }

  // Importing unpaid consignment sales only means anything for a store: a
  // hand-typed buyer has no ledger of shipments and sales behind them.
  const importBtn = $('inv-import-pending-btn');
  if (importBtn) {
    importBtn.disabled = person;
    importBtn.title = person
      ? 'Only for consignment stores — a hand-typed buyer has no pending sales to pull.'
      : 'Pull all unpaid consignment sales for the selected store';
  }

  // Leaving store mode clears the store selection and its details card, so a
  // half-chosen store can't quietly end up on a bill addressed to a person.
  if (person) {
    const sel = $('inv-store');
    if (sel) sel.value = '';
    const preview = $('inv-store-preview');
    if (preview) { preview.style.display = 'none'; preview.innerHTML = ''; }
  }

  if (!silent) {
    const focusEl = person ? $('inv-person-name') : $('inv-store');
    if (focusEl) { try { focusEl.focus(); } catch { /* focus is a nicety, never a blocker */ } }
    refreshUnsavedMarkers();
  }
}

function onInvoiceStoreChange() {
  // No automatic refill — user might be editing. Just keep selection.
  // ── #9: Autocomplete billing details preview ────────────────────────────
  const storeId = Number($('inv-store').value);
  const preview = $('inv-store-preview');
  if (!preview) return;
  if (!storeId) { preview.style.display = 'none'; preview.innerHTML = ''; return; }
  const st = (getState().stores || []).find(s => s.id === storeId);
  if (!st) { preview.style.display = 'none'; return; }

  // Auto-populate Terms if empty
  const termsEl = $('inv-terms');
  if (termsEl && !termsEl.value.trim() && st.terms) {
    termsEl.value = st.terms;
  }

  // Build preview lines
  const lines = [
    st.contact ? `<strong>Contact:</strong> ${escapeHtml(st.contact)}` : '',
    st.email ? `<strong>Email:</strong> ${escapeHtml(st.email)}` : '',
    st.phone ? `<strong>Phone:</strong> ${escapeHtml(st.phone)}` : '',
    st.address ? `<strong>Address:</strong> ${escapeHtml(st.address)}` : '',
    [st.city, st.region, st.postal].filter(Boolean).length
      ? `<strong>City:</strong> ${escapeHtml([st.city, st.region, st.postal].filter(Boolean).join(', '))}` : '',
    st.country ? `<strong>Country:</strong> ${escapeHtml(st.country)}` : '',
    typeof st.rate === 'number' ? `<strong>Commission rate:</strong> ${st.rate}%` : '',
    st.terms ? `<strong>Default terms:</strong> ${escapeHtml(st.terms)}` : '',
  ].filter(Boolean);

  if (lines.length) {
    preview.innerHTML = lines.join('<br>');
    preview.style.display = 'block';
  } else {
    preview.style.display = 'none';
  }
}

function getInvoiceCurrency() {
  const sel = $('inv-currency');
  if (sel && sel.value) return sel.value;
  return getBookCurrencyCode(getBook());
}

function onInvoiceCurrencyChange() {
  const code = getInvoiceCurrency();
  $('inv-discount-sym').textContent = getSym(code);
  renderInvoiceItems();
  recalcInvoiceTotals();
}

function addInvoiceItem(description = '', qty = 1, unitPrice = 0) {
  // A new line bills the book issuing the invoice until the publisher says
  // otherwise, which is the common case and keeps the picker from starting blank.
  invoiceCtx.items.push({ description, qty, unitPrice, discountPct: 0, bookId: invoiceCtx.ownerBookId || activeBook });
  renderInvoiceItems();
  recalcInvoiceTotals();
}

function removeInvoiceItem(idx) {
  invoiceCtx.items.splice(idx, 1);
  renderInvoiceItems();
  recalcInvoiceTotals();
}

function updateInvoiceItem(idx, field, value) {
  const it = invoiceCtx.items[idx]; if (!it) return;
  if (field === 'description') it.description = value;
  else if (field === 'bookId') {
    it.bookId = value || null;
    // Picking a title on a line that has no price yet fills in that book's
    // list price (and its name, if the line is blank) — as long as the book is
    // priced in the invoice's currency, so a CA$ price never lands on a € bill.
    if (fillInvoiceLineFromBook(it)) { renderInvoiceItems(); recalcInvoiceTotals(); refreshAutoInvoiceNumber(); return; }
  }
  else if (field === 'discountPct') it.discountPct = clampPercent(value);
  // A negative quantity or price would quietly turn the invoice into a credit.
  else it[field] = Math.max(0, parseFloat(value) || 0);
  // Re-render only the amount cell for performance
  const row = document.querySelector(`#inv-items-body [data-i="${idx}"]`);
  const amtEl = row && row.querySelector('.inv-item-amt');
  if (amtEl) amtEl.textContent = fmt(invoiceLineAmount(it), getSym(getInvoiceCurrency()));
  const wasEl = row && row.querySelector('.inv-item-was');
  if (wasEl) wasEl.textContent = clampPercent(it.discountPct) > 0 ? fmt(invoiceLineGross(it), getSym(getInvoiceCurrency())) : '';
  // Which titles the invoice covers follows the picker and the descriptions, so
  // keep the "filed under" line — and the invoice number — honest as they change.
  if (field === 'description' || field === 'bookId') {
    renderInvoiceBooksHint();
    refreshAutoInvoiceNumber();
  }
  recalcInvoiceTotals();
}

function fillInvoiceLineFromBook(it) {
  if (!it || !it.bookId || (Number(it.unitPrice) || 0) > 0) return false;
  const book = BOOKS[it.bookId];
  const price = Number(book && book.listPrice) || 0;
  if (!book || price <= 0) return false;
  if (getBookCurrencyCode(book) !== getInvoiceCurrency()) return false;
  it.unitPrice = price;
  if (!String(it.description || '').trim()) it.description = book.title || '';
  showToast(`Filled in the list price of ${book.title || 'that title'}`, 'ok', 1800);
  return true;
}

// The titles a line item can be billed against. Test books never appear — an
// invoice is a real document going to a real shop.
function invoiceBookOptions() {
  return BOOK_LIST.filter(b => b && b.id && !isTestBook(b) && !isTestBookId(b.id));
}

function renderInvoiceItems() {
  const body = $('inv-items-body'), code = getInvoiceCurrency(), cur = getSym(code);
  renderInvoiceAddBookChips();
  if (!invoiceCtx.items.length) {
    body.innerHTML = `<div class="inv-lines-empty">Nothing on this invoice yet — tap one of your books below, or <strong>+ Add a blank line</strong>.</div>`;
    renderInvoiceBooksHint();
    return;
  }
  const ownerBookId = invoiceCtx.ownerBookId || activeBook;
  const books = invoiceBookOptions();
  body.innerHTML = invoiceCtx.items.map((it, i) => {
    // Show what the line is actually billed against, whether that was picked
    // outright or read from the description, so the row and the invoice's
    // filing always agree. A line pointing at a title that is no longer on the
    // shelf falls back to the issuing book — and is rewritten to match, so the
    // dropdown can never display one title while the invoice files under another.
    let selected = lineItemBookId(it, ownerBookId, books);
    if (!books.some(b => b.id === selected)) { selected = ownerBookId; it.bookId = ownerBookId; }
    const opts = books.map(b => `<option value="${escapeHtml(b.id)}"${b.id === selected ? ' selected' : ''}>${escapeHtml(b.title)}</option>`).join('');
    const pct = clampPercent(it.discountPct);
    return `<div class="inv-item-row" data-i="${i}" onkeydown="onInvoiceLineKey(event, ${i})">
    <div class="inv-item-top">
      <span class="inv-item-num" aria-hidden="true">${i + 1}</span>
      <label class="inv-item-field"><span class="inv-item-lbl">Book</span><select class="inv-item-book" data-f="bookId" title="Which title this line bills for" onchange="updateInvoiceItem(${i},'bookId',this.value)">${opts}</select></label>
      <button type="button" class="inv-item-remove" onclick="removeInvoiceItem(${i})" title="Remove this line" aria-label="Remove line ${i + 1}">×</button>
    </div>
    <label class="inv-item-field inv-item-desc"><span class="inv-item-lbl">Description (printed on the invoice)</span><input type="text" data-f="description" value="${escapeHtml(it.description || '')}" placeholder="e.g. ${escapeHtml(getBook().title || '')} — consignment sale, Sept 2026" oninput="updateInvoiceItem(${i},'description',this.value)"></label>
    <div class="inv-item-nums">
      <label class="inv-item-field"><span class="inv-item-lbl">Copies</span><input class="num" type="number" data-f="qty" min="0" step="1" inputmode="numeric" value="${Number(it.qty) || 0}" onfocus="this.select()" oninput="updateInvoiceItem(${i},'qty',this.value)"></label>
      <label class="inv-item-field"><span class="inv-item-lbl">Price each</span><span class="inv-item-prefix"><i>${escapeHtml(cur)}</i><input class="num" type="number" data-f="unitPrice" min="0" step="0.01" inputmode="decimal" value="${(Number(it.unitPrice) || 0).toFixed(2)}" onfocus="this.select()" oninput="updateInvoiceItem(${i},'unitPrice',this.value)"></span></label>
      <label class="inv-item-field" title="A percentage off this one line — e.g. 40 for a trade discount"><span class="inv-item-lbl">Discount</span><span class="inv-item-suffix"><input class="num inv-item-disc" type="text" data-f="discountPct" inputmode="decimal" autocomplete="off" placeholder="0" value="${pct > 0 ? pct : ''}" onfocus="this.select()" oninput="updateInvoiceItem(${i},'discountPct',this.value)"><i>%</i></span></label>
      <div class="inv-item-field inv-item-total"><span class="inv-item-lbl">Line total</span><span class="inv-item-amt">${fmt(invoiceLineAmount(it), cur)}</span><span class="inv-item-was" aria-label="Before the line discount">${pct > 0 ? fmt(invoiceLineGross(it), cur) : ''}</span></div>
    </div>
  </div>`;
  }).join('');
  renderInvoiceBooksHint();
}

// One button per book: tap it and a line for that title appears with its
// list price already filled in (when the book is priced in this invoice's
// currency), ready for the number of copies.
function renderInvoiceAddBookChips() {
  const wrap = $('inv-add-book-chips');
  if (!wrap) return;
  const books = invoiceBookOptions();
  if (!books.length) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = `<span class="inv-chip-row-label">Add a book</span>` + books.map(b =>
    `<button type="button" class="preset-chip-btn inv-chip" onclick="addInvoiceBookLine('${escapeHtml(b.id)}')">+ ${escapeHtml(b.title)}</button>`).join('');
}

function addInvoiceBookLine(bookId) {
  if (!invoiceCtx) return;
  const book = BOOKS[bookId];
  const it = { description: (book && book.title) || '', qty: 1, unitPrice: 0, discountPct: 0, bookId };
  const price = Number(book && book.listPrice) || 0;
  if (book && price > 0 && getBookCurrencyCode(book) === getInvoiceCurrency()) it.unitPrice = price;
  // A single untouched blank line (the one a new invoice starts with) is
  // replaced rather than left sitting empty above the book that was picked.
  const only = invoiceCtx.items.length === 1 ? invoiceCtx.items[0] : null;
  if (only && !String(only.description || '').trim() && !(Number(only.unitPrice) > 0) && !only._ledgerId) invoiceCtx.items = [];
  invoiceCtx.items.push(it);
  renderInvoiceItems();
  recalcInvoiceTotals();
  refreshAutoInvoiceNumber();
  focusLastInvoiceLine(it.unitPrice > 0 ? 'qty' : 'unitPrice');
}

function focusLastInvoiceLine(field) {
  const rows = document.querySelectorAll('#inv-items-body .inv-item-row');
  const el = rows.length && rows[rows.length - 1].querySelector(`[data-f="${field}"]`);
  if (el) { try { el.focus(); el.scrollIntoView({ block: 'nearest' }); } catch { /* focus is a nicety */ } }
}

// Enter in a line's last box starts the next line, so a run of titles can be
// typed without reaching for the mouse.
function onInvoiceLineKey(ev, idx) {
  if (ev.key !== 'Enter' || ev.target.tagName !== 'INPUT') return;
  ev.preventDefault();
  if (idx === invoiceCtx.items.length - 1) { addInvoiceItem(); focusLastInvoiceLine('description'); return; }
  const next = document.querySelector(`#inv-items-body [data-i="${idx + 1}"] [data-f="description"]`);
  if (next) next.focus();
}

// Say out loud which titles this invoice will be filed under. A line item is
// matched to a title either because it was imported from that book's sales or
// because its description names the book — so if a hand-typed line spells a
// title differently, the publisher sees the omission here rather than
// discovering later that the invoice is missing from one of its books.
function renderInvoiceBooksHint() {
  const el = $('inv-books-hint');
  if (!el || !invoiceCtx) return;
  const ownerBookId = invoiceCtx.ownerBookId || activeBook;
  const ids = deriveInvoiceBookIds({ items: invoiceCtx.items }, ownerBookId, BOOK_LIST);
  const titles = ids.map(id => (BOOKS[id] || {}).title).filter(Boolean);
  if (titles.length <= 1) {
    el.innerHTML = `Filed under <strong>${escapeHtml(titles[0] || (getBook().title || 'this title'))}</strong>. Set a line's <em>Title</em> to bill another book on this same invoice.`;
    return;
  }
  el.innerHTML = `Filed under <strong>${titles.map(escapeHtml).join('</strong>, <strong>')}</strong> — this invoice appears in each of those titles' Invoices lists, and is numbered for the business rather than one title.`;
}

// ── the invoice-wide discount ───────────────────────────────────────────
// One box and a %/amount toggle. Switching the toggle keeps the number that
// was typed and reads it the other way — someone who typed 15 with the toggle
// on € almost always meant 15%, not "convert €15 into a percentage".
function getInvoiceDiscountType() {
  return $('inv-discount-type')?.value === 'flat' ? 'flat' : 'percent';
}

function setInvoiceDiscountUI(type, value) {
  const t = type === 'flat' ? 'flat' : 'percent';
  $('inv-discount-type').value = t;
  const n = Number(value) || 0;
  $('inv-discount-input').value = n > 0 ? String(parseFloat(n.toFixed(2))) : '';
  syncInvoiceDiscountControls();
}

function syncInvoiceDiscountControls() {
  const t = getInvoiceDiscountType();
  for (const [id, on] of [['inv-disc-mode-percent', t === 'percent'], ['inv-disc-mode-flat', t === 'flat']]) {
    const btn = $(id);
    if (!btn) continue;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-checked', on ? 'true' : 'false');
  }
  const input = $('inv-discount-input');
  if (input) {
    input.placeholder = t === 'percent' ? 'e.g. 15' : 'e.g. 10.00';
    input.setAttribute('aria-label', t === 'percent' ? 'Discount, in percent' : 'Discount, as an amount');
  }
  const { value } = parseDiscountEntry(input ? input.value : '', t);
  document.querySelectorAll('#m-invoice-edit [data-disc-pct]').forEach(btn => {
    const pct = Number(btn.dataset.discPct);
    const on = pct === 0 ? !(value > 0) : (t === 'percent' && value === pct);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

function onDiscountTypeChange(type) {
  const next = type === 'flat' || type === 'percent' ? type : (getInvoiceDiscountType() === 'flat' ? 'percent' : 'flat');
  $('inv-discount-type').value = next;
  const input = $('inv-discount-input');
  // Strip a symbol the other mode left behind ("15%" → "15") so the box shows
  // a plain number in the mode that is now selected.
  if (input && input.value.trim()) {
    const { value } = parseDiscountEntry(input.value, next);
    input.value = value > 0 ? String(value) : '';
  }
  syncInvoiceDiscountControls();
  recalcInvoiceTotals();
}

function onDiscountInput() {
  const input = $('inv-discount-input');
  const parsed = parseDiscountEntry(input.value, getInvoiceDiscountType());
  // "15%" or "€10" typed into the box flips the toggle to match.
  if (parsed.explicit && parsed.type !== getInvoiceDiscountType()) $('inv-discount-type').value = parsed.type;
  syncInvoiceDiscountControls();
  recalcInvoiceTotals();
}

function applyDiscountPreset(pct) {
  setInvoiceDiscountUI('percent', pct);
  recalcInvoiceTotals();
}

// Say in money what the discount takes off, so a percentage is never a guess.
function renderInvoiceDiscountReadout(totals, cur) {
  const el = $('inv-disc-readout');
  if (!el) return;
  const input = $('inv-discount-input');
  const entered = parseDiscountEntry(input ? input.value : '', totals.discountType).value;
  el.classList.remove('is-warn');
  if (!(entered > 0)) { el.textContent = ''; return; }
  if (totals.subtotal <= 0) {
    el.textContent = 'Add a line with a price and the discount will be worked out here.';
    return;
  }
  if (totals.discountType === 'percent') {
    const capped = entered > 100 ? ' (a discount can go up to 100%)' : '';
    el.innerHTML = `${escapeHtml(String(totals.discountRate))}% off ${escapeHtml(fmt(totals.subtotal, cur))} takes off <strong>${escapeHtml(fmt(totals.discount, cur))}</strong> — leaving ${escapeHtml(fmt(totals.subtotal - totals.discount, cur))} before tax${escapeHtml(capped)}.`;
    if (capped) el.classList.add('is-warn');
    return;
  }
  const pct = totals.subtotal > 0 ? (totals.discount / totals.subtotal) * 100 : 0;
  if (entered > totals.subtotal) {
    el.innerHTML = `That's more than the ${escapeHtml(fmt(totals.subtotal, cur))} being billed, so it's held at <strong>${escapeHtml(fmt(totals.discount, cur))}</strong> (100% off).`;
    el.classList.add('is-warn');
    return;
  }
  el.innerHTML = `Takes off <strong>${escapeHtml(fmt(totals.discount, cur))}</strong> — about ${escapeHtml(String(parseFloat(pct.toFixed(1))))}% of ${escapeHtml(fmt(totals.subtotal, cur))}.`;
}

function recalcInvoiceTotals() {
  const cur = getSym(getInvoiceCurrency());
  const type = getInvoiceDiscountType();
  const entry = parseDiscountEntry($('inv-discount-input') ? $('inv-discount-input').value : '', type);
  const totals = computeInvoiceTotals({
    items: invoiceCtx.items,
    discountType: entry.type,
    discountValue: entry.value,
    taxRate: $('inv-tax').value,
  });

  $('inv-sub-val').textContent = fmt(totals.subtotal, cur);
  $('inv-disc-val').textContent = totals.discount ? '−' + fmt(totals.discount, cur) : fmt(0, cur);
  $('inv-tax-val').textContent = fmt(totals.tax, cur);
  $('inv-total-val').textContent = fmt(totals.total, cur);
  renderInvoiceDiscountReadout(totals, cur);

  return totals;
}

function prefillFromPendingSales(forceStoreId) {
  // Pull from the book that owns the invoice being edited — for a shared invoice
  // opened from another title, its store and ledger both live in the owner.
  const ownerBookId = (invoiceCtx && invoiceCtx.ownerBookId) || activeBook;
  const s = states[ownerBookId] || getState(), book = BOOKS[ownerBookId] || getBook();
  // Pending sales come out of a store's consignment ledger, so there is nothing
  // to pull for a bill addressed to a person typed in by hand.
  if (currentInvoiceBillToMode() === BILL_TO_PERSON) {
    showToast('Pending sales only apply to consignment stores', 'warn');
    return;
  }
  const storeId = forceStoreId ? Number(forceStoreId) : Number($('inv-store').value);
  if (!storeId) { showToast('Pick a store first', 'warn'); return; }
  $('inv-store').value = String(storeId);
  const store = (s.stores || []).find(st => st.id === storeId);
  if (!store) return;
  // pull all unpaid, un-voided Sale ledger entries for that store
  const pending = (s.ledger || []).filter(e => e.storeId === storeId && e.type === 'Sale' && !e.voided && e.status !== 'paid');
  if (!pending.length) {
    showToast('No unpaid consignment sales for this store', 'warn');
    if (!invoiceCtx.items.length) addInvoiceItem();
    return;
  }
  // group by month
  invoiceCtx.items = pending.map(e => ({
    description: `${book.title} — consignment sale${e.date ? ' · ' + fmtD(e.date) : ''} (qty ${e.qty} @ ${(100 - e.rate).toFixed(0)}% net of ${book.currency}${book.listPrice} retail)`,
    qty: e.qty,
    unitPrice: e.qty ? (e.amountDue / e.qty) : 0,
    _ledgerId: e.id,
    // Stamp the title outright so the invoice's reach never depends on the
    // description text still spelling the title the same way.
    bookId: ownerBookId,
  }));
  renderInvoiceItems();
  recalcInvoiceTotals();
  showToast(`✓ Imported ${pending.length} pending sale${pending.length > 1 ? 's' : ''}`);
}

function saveInvoice(status) {
  // Write to the book that HOLDS this invoice, not whichever title is open. A
  // multi-title invoice is reachable from every book it bills, so editing one
  // from a book that doesn't own it must still update the single stored copy
  // instead of pushing a duplicate into the book being viewed.
  const ownerBookId = (invoiceCtx && invoiceCtx.ownerBookId) || activeBook;
  const s = states[ownerBookId] || getState(), book = BOOKS[ownerBookId] || getBook();
  // Either a store off the shop list or a recipient typed in by hand — both end
  // up in the same recipient fields, so only the check differs.
  const billToMode = currentInvoiceBillToMode();
  let store = null, person = null;
  if (billToMode === BILL_TO_PERSON) {
    person = readInvoicePersonForm();
    if (!String(person.name || '').trim()) {
      showToast('Enter the name this invoice is billed to', 'err');
      fieldError('inv-person-name', 'Who is this bill for?');
      return;
    }
  } else {
    const storeId = Number($('inv-store').value);
    if (!storeId) { showToast('Choose a store to bill', 'err'); return; }
    store = (s.stores || []).find(st => st.id === storeId);
    if (!store) { showToast('Store not found', 'err'); return; }
  }
  if (!invoiceCtx.items.length) { showToast('Add at least one line item', 'err'); return; }

  const totals = recalcInvoiceTotals();
  if (totals.total <= 0) { showToast('Invoice total must be greater than zero', 'err'); return; }

  // The titles this invoice bills, needed before the number so a multi-title
  // invoice is numbered after the business rather than after one of its books.
  const coveredBookIds = deriveInvoiceBookIds({ items: invoiceCtx.items }, ownerBookId, BOOK_LIST);
  const num = ($('inv-num').value || '').trim() || nextInvoiceNumber(coveredBookIds);
  const date = $('inv-date').value || today();
  const dueDate = $('inv-due').value || '';
  // Use the currency selected in the editor (ISO code → symbol for storage, consistent with book.currency pattern)
  const invoiceCurCode = getInvoiceCurrency();
  const invoiceCurSym = getSym(invoiceCurCode); // e.g. "US$", "€"

  const payload = {
    id: invoiceCtx.editingId || ('inv-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7)),
    num,
    ...billToPayload(billToMode, { store, person }),
    date, dueDate,
    items: invoiceCtx.items.map(it => {
      const line = { description: it.description || '', qty: parseFloat(it.qty) || 0, unitPrice: parseFloat(it.unitPrice) || 0, _ledgerId: it._ledgerId || null, bookId: it.bookId || null };
      const pct = clampPercent(it.discountPct);
      if (pct > 0) line.discountPct = pct;
      return line;
    }),
    subtotal: totals.subtotal,
    discount: totals.discount,
    discountType: totals.discountType || 'flat',
    discountRate: totals.discountRate || 0,
    taxRate: totals.taxRate,
    tax: totals.tax,
    total: totals.total,
    currency: invoiceCurSym,  // stored as symbol (€, CA$, US$…) consistent with book.currency
    currencyCode: invoiceCurCode, // ISO code stored alongside for Stripe
    paymentLink: $('inv-paylink').value.trim() || '',
    notes: $('inv-notes').value.trim(),
    terms: $('inv-terms').value.trim(),
    status,
    createdAt: invoiceCtx.editingId ? ((s.invoices || []).find(i => i.id === invoiceCtx.editingId)?.createdAt || Date.now()) : Date.now(),
    updatedAt: Date.now(),
  };
  // Record every title this invoice bills, so it appears under each of them —
  // the owning book plus any title a line item is stamped with or names in its
  // description. Stamped here rather than only derived on read so a later title
  // rename can't quietly drop a book off an invoice already sent.
  payload.bookIds = deriveInvoiceBookIds(payload, ownerBookId, BOOK_LIST);

  let oldStripeLinkId = null;
  // Capture the ledger ids this invoice billed BEFORE we overwrite it, so we can
  // clear back-links that were dropped from the line items during an edit.
  let oldLedgerIds = [];
  if (invoiceCtx.editingId) {
    const idx = s.invoices.findIndex(i => i.id === invoiceCtx.editingId);
    if (idx >= 0) {
      // preserve paid metadata if existing
      const old = s.invoices[idx];
      oldLedgerIds = (old.items || []).map(it => it._ledgerId).filter(Boolean);
      // Fixing a typo on a paid (or cancelled) invoice must not reopen it as
      // money owed — that would put it back on the chase list.
      if (old.status === 'paid' || old.status === 'cancelled') payload.status = old.status;
      payload.paidAt = old.paidAt || null;
      payload.paidMethod = old.paidMethod || null;
      if (old.payment) payload.payment = old.payment;
      // What was already said to this customer, and any date they promised to
      // pay by. Editing an invoice must not wipe the chase history — losing it
      // would let the same bill be chased a second time as if for the first.
      if (Array.isArray(old.reminders) && old.reminders.length) payload.reminders = old.reminders;
      if (old.remindAfter) payload.remindAfter = old.remindAfter;
      // Stripe settlement stamps: without them a later refund/chargeback can't be matched
      // to this invoice, and the sweep would re-note a short payment it already recorded.
      if (old.stripeChargeId) payload.stripeChargeId = old.stripeChargeId;
      if (Array.isArray(old.stripePartPayments) && old.stripePartPayments.length) payload.stripePartPayments = old.stripePartPayments;
      // preserve Stripe link only if amount/currency unchanged
      const amountChanged = (Number(old.total || 0).toFixed(2) !== Number(payload.total || 0).toFixed(2))
        || (old.currency !== payload.currency);
      if (old.stripe && !amountChanged) {
        payload.stripe = old.stripe;
      } else if (old.stripe) {
        // amount changed → invalidate old link (will deactivate below)
        oldStripeLinkId = old.stripe.paymentLinkId;
        // The edit form was prefilled with the old Stripe URL; don't keep printing the dead link.
        if (payload.paymentLink && payload.paymentLink === (old.stripe.url || old.paymentLink)) payload.paymentLink = '';
      }
      s.invoices[idx] = payload;
    } else {
      s.invoices.push(payload);
    }
  } else {
    s.invoices = s.invoices || [];
    s.invoices.push(payload);
    // Bump the book's own counter only for a number issued under that book's
    // prefix. A neutral, multi-title number belongs to the shared sequence, and
    // folding it in here would burn numbers out of this book's run.
    const mt = /-(\d+)$/.exec(num);
    if (mt && invoiceNumberPrefix(num) === ((book.id || 'BOOK').slice(0, 6).toUpperCase())) {
      s.invoiceSeq = Math.max(s.invoiceSeq || 0, parseInt(mt[1], 10));
    }
  }

  // ── Stamp ledger ↔ invoice back-links (covers create AND edit re-pointing).
  // Clear links for ledger ids that were dropped from this invoice on edit…
  const newLedgerIds = (payload.items || []).map(it => it._ledgerId).filter(Boolean);
  for (const oldId of oldLedgerIds) {
    if (!newLedgerIds.includes(oldId)) stampLedgerInvoiceLink(s, oldId, null);
  }
  // …then point each current line item's ledger sale at this invoice. Decision #3:
  // if a sale is already on a DIFFERENT live invoice, warn but proceed (last writer
  // wins — the ledger tracks the most-recent invoice link).
  const ledger = ledgerById(s);
  for (const id of newLedgerIds) {
    const le = ledger.get(id);
    if (le && le.invoiceId && le.invoiceId !== payload.id) {
      const other = (s.invoices || []).find(i => i.id === le.invoiceId);
      if (other && other.status !== 'cancelled')
        showToast(`⚠ A sale was already on invoice ${other.num} — re-billing on ${payload.num}`, 'warn', 4000);
    }
    stampLedgerInvoiceLink(s, id, payload);
  }

  // Push the now-current invoice number onto every consignment row this save
  // touched (newly linked, re-numbered, or just-unlinked) so the Google Sheet's
  // Invoice column tracks the change. The mirror is canonicalised in the ledger,
  // so one upsert per affected ledger Sale keeps the sheet honest.
  if (sheetsUrl) {
    const affected = new Set([...oldLedgerIds, ...newLedgerIds]);
    for (const id of affected) {
      const le = ledger.get(id);
      if (le && le.sheetsId && !le.voided) syncToSheets(consignmentSyncPayload(book, le));
    }
  }

  saveState(ownerBookId);
  closeM('invoice-edit');
  renderInvoices();
  renderLedger();
  renderHist();
  showToast(payload.status === 'draft' ? '✓ Draft saved' : '✓ Invoice saved');

  // Stripe Payment Link: auto-create on finalize (or regenerate after edit).
  // Never for a draft, and never for an invoice that is already paid or cancelled.
  const settings = getInvoiceSettings();
  const shouldAutoStripe = payload.status === 'sent' && settings.stripeAuto !== false && !!settings.stripeKey && !payload.stripe;
  if (oldStripeLinkId) deactivateStripePaymentLink(oldStripeLinkId);

  if (shouldAutoStripe) {
    showToast('Creating Stripe Payment Link…', 'ok', 1800);
    createStripePaymentLinkForInvoice(payload).then(stripe => {
      // Re-resolve by id: the publisher may have switched titles while the link
      // was being created, and the invoice lives in its owning book either way.
      const hit = locateInvoice(payload.id);
      if (!hit) return;
      const inv = hit.inv;
      inv.stripe = stripe;
      inv.paymentLink = stripe.url; // also set as the primary payment link so QR/etc. use it
      saveState(hit.ownerBookId);
      renderInvoices();
      setTimeout(() => viewInvoice(payload.id), 60);
      showToast(`✓ Stripe link ready — ${fmt(payload.total, payload.currency)} owed`);
    }).catch(err => {
      console.error('Stripe link creation failed:', err);
      showToast('Stripe link failed: ' + err.message, 'err', 5000);
      setTimeout(() => viewInvoice(payload.id), 60);
    });
  } else {
    setTimeout(() => viewInvoice(payload.id), 80);
  }
}

async function regenerateStripeLinkFromView() {
  if (!currentViewInvoiceId) return;
  const { inv, bookId } = invoiceHome(currentViewInvoiceId);
  if (!inv) return;
  const settings = getInvoiceSettings();
  if (!settings.stripeKey) {
    if (await confirmDialog('No Stripe key configured yet. Open Invoice Settings to add one?', { okLabel: 'Open settings' })) {
      closeM('invoice-view');
      setTimeout(openInvoiceTemplateSettings, 80);
    }
    return;
  }
  const oldId = inv.stripe?.paymentLinkId;
  const btn = $('inv-stripe-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Creating…'; }
  try {
    const stripe = await createStripePaymentLinkForInvoice(inv);
    if (oldId) deactivateStripePaymentLink(oldId);
    inv.stripe = stripe;
    inv.paymentLink = stripe.url;
    saveState(bookId);
    renderInvoices();
    viewInvoice(currentViewInvoiceId);
    showToast(`✓ Stripe link ready — ${fmt(inv.total, inv.currency)} owed`);
  } catch (e) {
    console.error(e);
    showToast('Stripe: ' + e.message, 'err', 5500);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💳 Stripe link'; }
  }
}

async function deleteInvoice() {
  if (!invoiceCtx || !invoiceCtx.editingId) return;
  // Delete from the book that holds it — filtering the active book's list would
  // leave a shared invoice in place while appearing to remove it.
  const { inv, bookId, s } = invoiceHome(invoiceCtx.editingId);
  if (!inv) return;
  if (!(await confirmDialog(`Delete invoice ${inv.num}? This cannot be undone.`, { okLabel: 'Delete invoice', danger: true }))) return;
  // Clear the back-links on every ledger sale this invoice billed, so the ledger
  // and history no longer point at a deleted invoice.
  for (const it of (inv.items || [])) {
    if (it._ledgerId) stampLedgerInvoiceLink(s, it._ledgerId, null);
  }
  s.invoices = (s.invoices || []).filter(i => i.id !== invoiceCtx.editingId);
  // A deleted invoice must not stay payable through its Stripe link.
  if (inv.status !== 'paid' && inv.stripe?.paymentLinkId) deactivateStripePaymentLink(inv.stripe.paymentLinkId);
  saveState(bookId);
  closeM('invoice-edit');
  renderInvoices();
  renderLedger();
  renderHist();
  showToast('✓ Invoice deleted');
}

// ── invoice view (printable) ────────────────────────────────────────────
let currentViewInvoiceId = null;

// What each title on this invoice is worth — the publisher's own breakdown of a
// bill the shop pays as one amount. Shown above the invoice preview and left off
// the printed document, which is the shop's copy and has no use for it.
// Single-title invoices show nothing: the total already is that title's total.
function renderInvoiceSplitPanel(inv, ownerBookId) {
  const el = $('inv-split-panel');
  if (!el) return;
  const split = invoiceBookSplit(inv, ownerBookId, BOOK_LIST);
  if (split.length < 2) { el.style.display = 'none'; el.innerHTML = ''; return; }

  const cur = inv.currency || (BOOKS[ownerBookId] || getBook()).currency;
  const rows = split.map(r => `<div style="display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:var(--stroke-hair) solid var(--line);">
      <span style="color:var(--text2);">${escapeHtml(r.title)}<span style="color:var(--text3);font-size:var(--text-xs);margin-left:6px;">${Math.round(r.share * 100)}%</span></span>
      <span class="mono-num" style="font-weight:600;white-space:nowrap;">${fmt(r.total, cur)}</span>
    </div>`).join('');

  el.style.display = '';
  el.innerHTML = `<div style="background:var(--cream);border:var(--stroke-hair) solid var(--line);border-radius:var(--r3);padding:14px 18px;margin-bottom:18px;">
      <div style="font-size:var(--text-2xs);font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--text3);margin-bottom:8px;">What each title earned on this invoice</div>
      ${rows}
      <div style="display:flex;justify-content:space-between;gap:12px;padding:8px 0 0;">
        <span style="color:var(--text3);font-size:var(--text-sm);">Invoice total</span>
        <span class="mono-num" style="font-weight:700;white-space:nowrap;">${fmt(inv.total || 0, cur)}</span>
      </div>
      <div style="font-size:var(--text-xs);color:var(--text3);line-height:1.6;margin-top:8px;">Any discount and tax are shared out in proportion to each title's lines, so these add up to the invoice total. Not shown on the copy the shop receives.</div>
    </div>`;
}

function viewInvoice(id) {
  // Resolve across books: a multi-title invoice is opened from whichever title
  // the publisher is looking at, but only one book actually stores it.
  const home = invoiceHome(id);
  const inv = home.inv;
  if (!inv) { showToast('Invoice not found', 'err'); return; }
  currentViewInvoiceId = id;
  renderInvoiceSplitPanel(inv, home.bookId);
  $('invoice-print-area').innerHTML = renderInvoicePaperHTML(inv, { showChase: true });
  // Paid invoices show a non-clickable "✓ Paid" badge; unpaid ones keep the
  // clickable gold "✓ Mark paid" action. (Same element is reused across
  // invoices, so set the full state both ways.)
  const mp = $('inv-mark-paid-btn');
  if (mp) {
    const paid = inv.status === 'paid';
    mp.style.display = '';
    mp.disabled = paid;
    // A payment recorded in another currency (or short of the total) says
    // what actually arrived; a plain one just reads "Paid".
    const pay = paid && inv.payment ? inv.payment : null;
    mp.textContent = paid ? (pay ? `✓ Paid ${fmt(pay.amount, pay.currency)}` : '✓ Paid') : '✓ Mark paid';
    mp.title = pay && pay.date ? `Received ${fmtD(pay.date)}` : '';
    if (paid) {
      mp.classList.remove('gold');
      mp.style.background = '#e0f5ea';
      mp.style.color = '#1d7a4a';
      mp.style.cursor = 'default';
      mp.style.opacity = '1';
    } else {
      mp.classList.add('gold');
      mp.style.background = '';
      mp.style.color = '';
      mp.style.cursor = '';
      mp.style.opacity = '';
    }
  }
  // Chasing somebody for a bill they have already settled is the one mistake
  // this whole feature must never make — so on a paid or withdrawn invoice the
  // reminder actions are not merely discouraged, they are gone.
  const settled = inv.status === 'paid' || inv.status === 'cancelled';
  for (const id of ['inv-remind-btn', 'inv-snooze-btn']) {
    const btn = $(id);
    if (btn) btn.style.display = settled ? 'none' : '';
  }
  const remindBtn = $('inv-remind-btn');
  if (remindBtn && !settled) {
    const chased = invoiceReminderState(inv).count;
    remindBtn.textContent = chased ? '⏰ Remind again' : '⏰ Remind now';
  }
  openM('invoice-view');
  // Render QR if QRCode library is available
  setTimeout(() => {
    const qrEl = document.querySelector('#invoice-print-area .inv-qr');
    const url = effectivePaymentLink(inv);
    if (qrEl && url && typeof QRCode !== 'undefined') {
      qrEl.innerHTML = '';
      new QRCode(qrEl, { text: url, width: 104, height: 104, colorDark: '#0e0c0a', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
    }
  }, 30);
}

// The book an invoice belongs to, which is not always the one on screen: a
// multi-title invoice is viewable from every title it bills, but its payment
// links and branding come from the book that issued it.
function invoiceOwnerBook(inv) {
  const hit = inv && inv.id ? locateInvoice(inv.id) : null;
  return (hit && BOOKS[hit.ownerBookId]) || BOOKS[activeBook] || getBook();
}

function effectivePaymentLink(inv) {
  const book = invoiceOwnerBook(inv);
  const acceptedMethods = getAcceptedPaymentMethodsForBook(book.id);

  if (inv.stripe && inv.stripe.url && acceptedMethods.includes('stripe')) return inv.stripe.url;

  let url = '';
  if (inv.paymentLink) {
    const isStripe = /buy\.stripe\.com/i.test(inv.paymentLink);
    const isPaypal = /paypal/i.test(inv.paymentLink);
    const isInterac = /^[^\s@]+@[^\s@]+$/.test(inv.paymentLink);
    if ((isStripe && acceptedMethods.includes('stripe')) ||
      (isPaypal && acceptedMethods.includes('paypal')) ||
      (isInterac && acceptedMethods.includes('interac'))) {
      url = inv.paymentLink;
    }
  }

  if (!url) url = acceptedBookPaymentLink(book, acceptedMethods);

  if (!url) return '';

  try {
    if (/buy\.stripe\.com/i.test(url)) {
      const u = new URL(url);
      if (!u.searchParams.has('client_reference_id')) u.searchParams.set('client_reference_id', inv.num);
      if (inv.storeEmail && !u.searchParams.has('prefilled_email')) u.searchParams.set('prefilled_email', inv.storeEmail);
      url = u.toString();
    }
  } catch (e) { }
  return url;
}

function isDynamicStripeLink(inv) { return !!(inv && inv.stripe && inv.stripe.url); }

// `showChase` is the publisher's own view of the invoice. The same paper is
// also what gets downloaded, printed and emailed to the customer, and how many
// times you have chased them is not something to hand them a note about — so it
// is opt-in, and only the on-screen preview opts in.
function renderInvoicePaperHTML(inv, { showChase = false } = {}) {
  const settings = getInvoiceSettings();
  // The issuing book, so a shared invoice prints the same document whichever
  // title it was opened from rather than picking up the viewer's accent.
  const book = invoiceOwnerBook(inv);
  const cur = inv.currency || book.currency;
  const payUrl = effectivePaymentLink(inv);
  const todayStr = today();
  const overdue = inv.status === 'sent' && inv.dueDate && inv.dueDate < todayStr;
  const statusLabel = overdue ? 'OVERDUE' : (inv.status || 'draft').toUpperCase();
  const statusCls = overdue ? 'overdue' : (inv.status || 'draft');

  const accent = book.accent || '#c8913a';
  // A "Disc." column only appears when a line actually has its own discount,
  // so an ordinary invoice prints exactly as it always has.
  const lineDisc = invoiceHasLineDiscounts(inv.items);
  const itemsHtml = (inv.items || []).map(it => `<tr>
    <td>${escapeHtml(it.description || '—')}</td>
    <td class="r">${(it.qty || 0)}</td>
    <td class="r">${formatInvoiceUnitPrice(it.unitPrice, getSym(cur))}</td>
    ${lineDisc ? `<td class="r">${clampPercent(it.discountPct) > 0 ? `${clampPercent(it.discountPct)}%` : '—'}</td>` : ''}
    <td class="r"><strong>${fmt(invoiceLineAmount(it), cur)}</strong></td>
  </tr>`).join('');

  const acceptedMethods = getAcceptedPaymentMethodsForBook(book.id);
  const payMethodsLabel = [
    acceptedMethods.includes('stripe') && payUrl && /buy\.stripe\.com/i.test(payUrl) ? 'Stripe' : null,
    acceptedMethods.includes('paypal') && payUrl && /paypal/i.test(payUrl) ? 'PayPal' : null,
    acceptedMethods.includes('interac') && payUrl && /^[^\s@]+@[^\s@]+$/.test(payUrl) ? 'Interac e-Transfer' : null,
    settings.bank ? 'Bank transfer' : null,
  ].filter(Boolean).join(' · ') || 'See payment instructions below';

  // ⚡ Bolt Optimization: Calculate total item quantity upfront using a single imperative loop instead of two separate reduce calls in the template literal
  let totalQty = 0;
  for (const it of (inv.items || [])) totalQty += (it.qty || 0);
  const settlesLine = '';

  // The chase record, shown where the invoice is read.
  const chase = invoiceReminderState(inv);
  const chaseNote = (() => {
    if (!showChase) return '';
    if (inv.status === 'paid' || inv.status === 'cancelled') return '';
    if (chase.snoozedUntil && today() <= chase.snoozedUntil) {
      return `<div class="inv-meta-sub no-print" style="margin-top:4px;">📅 Promised to pay by ${escapeHtml(fmtD(chase.snoozedUntil))}</div>`;
    }
    if (chase.lastStatus === 'failed') {
      return `<div class="inv-meta-sub no-print" style="margin-top:4px;">⏰ The last reminder could not be sent</div>`;
    }
    if (!chase.count) return '';
    const when = chase.lastAt ? fmtD(new Date(chase.lastAt).toISOString().slice(0, 10)) : '';
    return `<div class="inv-meta-sub no-print" style="margin-top:4px;">⏰ Reminded ${chase.count === 1 ? 'once' : `${chase.count} times`}${when ? `, last on ${escapeHtml(when)}` : ''}</div>`;
  })();
  const divergedNote = inv.ledgerDivergedAt
    ? `<div class="inv-meta-sub" style="margin-top:6px;color:var(--red);font-weight:600;">⚠ ledger changed since invoiced — reopen to re-import amounts</div>`
    : '';

  const dyn = isDynamicStripeLink(inv);
  const testBadge = (dyn && inv.stripe.livemode === false) ? `<span style="display:inline-block;margin-left:8px;background:var(--red-bg);color:var(--red);font-size:var(--text-3xs);font-weight:700;letter-spacing:.16em;text-transform:uppercase;padding:3px 8px;border-radius:var(--r-pill);">Test mode</span>` : '';
  const dynBadge = dyn ? `<div style="display:inline-flex;align-items:center;gap:6px;background:var(--surface-inverse);color:var(--gold-text);font-size:var(--text-3xs);font-weight:700;letter-spacing:.18em;text-transform:uppercase;padding:5px 12px;border-radius:var(--r-pill);margin-bottom:10px;">✓ Stripe checkout · exact amount${testBadge ? ' ' : ''}${testBadge}</div>` : '';
  const payCopy = dyn
    ? `Click below to pay <strong>${fmt(inv.total || 0, cur)}</strong> via Stripe Checkout.`
    : `Click below to pay <strong>${fmt(inv.total || 0, cur)}</strong> securely, or scan the QR with your phone.`;

  // An Interac e-Transfer address is an email, not a page. Putting it in an
  // href made it a RELATIVE link, so the Pay button on a customer's invoice
  // navigated to a path that does not exist. Show the address to send to
  // instead, and only ever link something with a real scheme.
  const payHref = followableUrl(payUrl);

  const payFallback = payUrl ? (payHref
    ? `
    <p class="inv-pay-fallback">Pay online: <a href="${escapeHtml(payHref)}" target="_blank" rel="noopener">${escapeHtml(payUrl)}</a></p>`
    : `
    <p class="inv-pay-fallback">Send an Interac e-Transfer to: <strong>${escapeHtml(payUrl)}</strong></p>`) : '';

  const payBlock = payUrl ? `
    <section class="inv-pay"${payHref ? ` data-pdf-link="${escapeHtml(payHref)}"` : ''} style="--book-accent:${accent};">
      <div class="inv-pay-info">
        ${dynBadge}
        <h3>Pay this invoice</h3>
        <p>${payCopy}</p>
        ${payHref
    ? `<a class="pay-btn" href="${escapeHtml(payHref)}" target="_blank" rel="noopener">Pay ${fmt(inv.total || 0, cur)} →</a>`
    : `<p class="inv-pay-address">Send <strong>${fmt(inv.total || 0, cur)}</strong> by Interac e-Transfer to<br><strong>${escapeHtml(payUrl)}</strong></p>`}
        <div class="pay-methods">${payMethodsLabel}</div>
      </div>
      <div class="inv-qr"></div>
    </section>
    ${payFallback}` : '';

  const bankBlock = settings.bank ? `
    <div class="inv-notes-block">
      <h4>Bank transfer details</h4>
      <div>${escapeHtml(settings.bank)}</div>
    </div>` : '';

  return `<div style="--book-accent:${accent};">
    <header class="inv-head">
      <div class="inv-brand">
        <h1>${escapeHtml(settings.name || 'Lyricalmyrical Books')}</h1>
        <div class="inv-addr">${escapeHtml(settings.addr || '')}${settings.email ? '\n' + escapeHtml(settings.email) : ''}${settings.web ? '\n' + escapeHtml(settings.web) : ''}${settings.vat ? '\nVAT/Tax ID: ' + escapeHtml(settings.vat) : ''}</div>
      </div>
      <div class="inv-id">
        <div class="inv-word">Invoice</div>
        <div class="inv-num">${escapeHtml(inv.num)}</div>
        <div><span class="inv-status ${statusCls}">${statusLabel}</span></div>
      </div>
    </header>

    <section class="inv-meta-grid">
      <div>
        <label>Billed to</label>
        <strong>${escapeHtml(inv.storeName || '—')}</strong>
        <div class="inv-meta-sub">${[inv.storeContact, inv.storeEmail, inv.storePhone, inv.storeAddress, [inv.storeCity, inv.storeRegion, inv.storePostal].filter(Boolean).join(', '), inv.storeCountry].filter(Boolean).map(escapeHtml).join('\n')}</div>
      </div>
      <div>
        <label>Issue date</label>
        <strong>${fmtD(inv.date)}</strong>
        ${inv.dueDate ? `<div class="inv-meta-sub">Due ${fmtD(inv.dueDate)}</div>` : ''}
      </div>
      <div>
        <label>Amount due</label>
        <strong style="color:${statusCls === 'paid' ? '#1d7a4a' : '#0e0c0a'};font-size:var(--text-lg);">${fmt(inv.total || 0, cur)}</strong>
        <div class="inv-meta-sub">${totalQty} item${totalQty === 1 ? '' : 's'}</div>
        ${settlesLine}
        ${chaseNote}
        ${divergedNote}
      </div>
    </section>

    <table class="inv-items">
      <thead><tr><th>Description</th><th class="r">Qty</th><th class="r">Unit price</th>${lineDisc ? '<th class="r">Disc.</th>' : ''}<th class="r">Amount</th></tr></thead>
      <tbody>${itemsHtml}</tbody>
    </table>

    <div class="inv-totals">
      <div class="tr"><span>Subtotal</span><span class="val">${fmt(inv.subtotal || 0, cur)}</span></div>
      ${(inv.discount || 0) > 0 ? `<div class="tr"><span>Discount${inv.discountType === 'percent' && inv.discountRate ? ` (${inv.discountRate}%)` : ''}</span><span class="val">−${fmt(inv.discount, cur)}</span></div>` : ''}
      ${(inv.taxRate || 0) > 0 ? `<div class="tr"><span>Tax (${inv.taxRate}%)</span><span class="val">${fmt(inv.tax || 0, cur)}</span></div>` : ''}
      <div class="grand"><div class="tr" style="padding:0;color:inherit;"><span>Total due</span><span class="val">${fmt(inv.total || 0, cur)}</span></div></div>
    </div>

    ${payBlock}

    <div class="inv-notes">
      ${inv.notes ? `<div class="inv-notes-block"><h4>Notes</h4><div>${escapeHtml(inv.notes)}</div></div>` : ''}
      ${inv.terms ? `<div class="inv-notes-block"><h4>Terms</h4><div>${escapeHtml(inv.terms)}</div></div>` : ''}
      ${bankBlock}
    </div>

    <div class="inv-foot">${escapeHtml(settings.footer || 'Thank you for stocking our books.')}</div>
  </div>`;
}

function editInvoiceFromView() {
  if (!currentViewInvoiceId) return;
  closeM('invoice-view');
  setTimeout(() => openCreateInvoice(null, currentViewInvoiceId), 60);
}

/** How the invoice was settled, when the caller has nothing better to say. */
function invoicePaidMethod(inv, book) {
  return isDynamicStripeLink(inv) ? 'Stripe Checkout'
    : (inv.paymentLink && /buy\.stripe\.com/i.test(inv.paymentLink)) ? 'Stripe'
      : (inv.paymentLink && /paypal/i.test(inv.paymentLink)) ? 'PayPal'
        : ((book || {}).stripeLink ? 'Stripe' : 'Other');
}

/**
 * Mark one invoice paid — the whole write-chain, and nothing else.
 *
 * Headless on purpose: no confirm dialog, no `currentViewInvoiceId`, no
 * re-render, so it can be called for an invoice nobody is looking at. The modal
 * keeps its confirmation and its refresh and delegates the writes here; the
 * background Stripe sweep calls the same function.
 *
 * That matters more than it looks. There were already two independent writers of
 * `inv.status = 'paid'` — this path and maybeAutoPayInvoiceForLedger — and a
 * third by copy-paste is exactly how the invoice and the store's owed balance
 * quietly stop agreeing with each other. One writer, several callers.
 *
 * `chargeId` stamps the Stripe charge that settled it. That stamp is the durable
 * idempotency marker: the browser's own memory of handled charges is per-device
 * localStorage, so on a second device it would happily settle the same invoice
 * again. The invoice travels with the stamp.
 *
 * Renders are left to the caller so a sweep settling three invoices repaints
 * once rather than three times. Returns true when it changed something.
 */
function applyInvoicePaid(inv, bookId, s, { method = '', chargeId = '', paidAt = Date.now() } = {}) {
  if (!inv || !s) return false;
  inv.status = 'paid';
  inv.paidAt = paidAt;
  inv.paidMethod = method || invoicePaidMethod(inv, BOOKS[bookId]);
  if (chargeId) inv.stripeChargeId = chargeId;
  // best-effort: deactivate the Stripe Payment Link so it can't be paid twice
  if (inv.stripe?.paymentLinkId) deactivateStripePaymentLink(inv.stripe.paymentLinkId);
  // settle any linked pending ledger entries via the canonical helper, so the
  // ledger row, store owed, and hist mirror paidState all flip together.
  const ledger = ledgerById(s);
  for (const it of (inv.items || [])) {
    if (it._ledgerId) {
      const e = ledger.get(it._ledgerId);
      if (e) settleLedgerSalePaid(s, e);
    }
  }
  saveState(bookId);
  return true;
}

// Asks what actually arrived (amount, currency, date, rate) — the same form
// a single sale uses — then settles the invoice and its linked sales.
async function markInvoicePaidFromView() {
  if (!currentViewInvoiceId) return;
  // Settle against the book that holds the invoice: its linked consignment
  // sales live in that book's ledger, so paying from another title has to reach
  // the same rows it would have from the title the invoice was written on.
  const { inv, bookId } = invoiceHome(currentViewInvoiceId);
  if (!inv || inv.status === 'paid') return;
  openConsignPayment({ kind: 'invoice', id: inv.id, bookId });
}

function printInvoice() {
  if (!currentViewInvoiceId) return;
  const inv = invoiceHome(currentViewInvoiceId).inv;
  if (!inv) return;
  // Print the self-contained invoice document (its own clean stylesheet — no app
  // chrome, scripts, or print-isolation CSS) via a hidden, off-screen iframe.
  // An iframe can't be blocked like a popup and prints only its own document, so
  // "Save as PDF" renders the invoice instead of a blank page. buildStandalone-
  // InvoiceHTML captures the live QR. Falls back to a popup, then window.print().
  const html = buildStandaloneInvoiceHTML(inv);
  let iframe;
  try {
    iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    // Real page-sized dimensions but parked off-screen: some engines print a
    // blank page from a 0×0 or visibility:hidden frame, so size it and hide it
    // by position instead.
    iframe.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;height:1123px;border:0;';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow.document;
    doc.open(); doc.write(html); doc.close();
    const triggerPrint = () => {
      try { iframe.contentWindow.focus(); iframe.contentWindow.print(); }
      catch (e) { printInvoiceViaPopup(html); }
      finally { setTimeout(() => { try { iframe.remove(); } catch (e) { } }, 1500); }
    };
    // Wait for the doc (and its embedded QR/image + fonts) to settle, otherwise
    // the QR/styles may be missing in the PDF.
    if (iframe.contentWindow.document.readyState === 'complete') {
      setTimeout(triggerPrint, 250);
    } else {
      iframe.addEventListener('load', () => setTimeout(triggerPrint, 250), { once: true });
    }
  } catch (e) {
    if (iframe) { try { iframe.remove(); } catch (_) { } }
    printInvoiceViaPopup(html);
  }
}

// Last-resort print path: open the standalone invoice doc in a new tab and print
// it. Used when the hidden-iframe route is unavailable (e.g. sandboxed frames).
function printInvoiceViaPopup(html) {
  const w = window.open('', '_blank');
  if (!w) {
    // Popup blocked too — fall back to printing the page (the @media print CSS
    // in index.html isolates #m-invoice-view) and nudge toward Download instead.
    showToast('Allow popups to print, or use “Download” and print the saved file.', 'warn');
    window.print();
    return;
  }
  w.document.open(); w.document.write(html); w.document.close();
  const go = () => { try { w.focus(); w.print(); } catch (e) { } };
  if (w.document.readyState === 'complete') setTimeout(go, 250);
  else w.addEventListener('load', () => setTimeout(go, 250), { once: true });
}

function copyInvoicePayLink() {
  if (!currentViewInvoiceId) return;
  const inv = invoiceHome(currentViewInvoiceId).inv;
  if (!inv) return;
  const url = effectivePaymentLink(inv);
  if (!url) { showToast('No payment link set for this book or invoice', 'warn'); return; }
  navigator.clipboard.writeText(url).then(
    () => showToast('✓ Payment link copied'),
    () => showToast('Could not copy — your browser blocked it', 'err')
  );
}

function invoiceEmailPlainText(inv) {
  const settings = getInvoiceSettings();
  const cur = inv.currency || getBook().currency;
  const payUrl = effectivePaymentLink(inv);
  return [
    `Hi ${inv.storeContact || inv.storeName || 'there'},`,
    ``,
    `Your invoice ${inv.num} for ${fmt(inv.total || 0, cur)} is below. Issued ${fmtD(inv.date)}${inv.dueDate ? ', due ' + fmtD(inv.dueDate) : ''}.`,
    payUrl ? `` : null,
    payUrl ? `Pay securely online${isDynamicStripeLink(inv) ? ' (exact amount via Stripe)' : ''}: ${payUrl}` : null,
    inv.notes ? `` : null,
    inv.notes ? `Notes: ${inv.notes}` : null,
    ``,
    `Thank you,`,
    settings.name || 'Lyricalmyrical Books',
  ].filter(v => v !== null).join('\n');
}

// Gmail compose URLs only support plain-text bodies. To make invoice emails look
// like the invoice itself, copy a rich, inline-styled email (greeting + invoice
// card + pay button) to the clipboard, then open Gmail with just recipient and
// subject filled so the user can paste the formatted invoice into the message.
function buildInvoiceEmailHTML(inv) {
  const settings = getInvoiceSettings();
  const cur = inv.currency || getBook().currency;
  const payUrl = effectivePaymentLink(inv);
  const accent = (BOOKS[activeBook] || getBook()).accent || '#c8913a';
  const contact = escapeHtml(inv.storeContact || inv.storeName || 'there');
  const lineDisc = invoiceHasLineDiscounts(inv.items);
  const items = (inv.items || []).map(it => `
    <tr>
      <td style="padding:12px 10px;border-bottom:1px solid #f1eadc;color:#1a1814;">${escapeHtml(it.description || '—')}</td>
      <td align="right" style="padding:12px 10px;border-bottom:1px solid #f1eadc;color:#1a1814;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${it.qty || 0}</td>
      <td align="right" style="padding:12px 10px;border-bottom:1px solid #f1eadc;color:#1a1814;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${formatInvoiceUnitPrice(it.unitPrice, getSym(cur))}</td>
      ${lineDisc ? `<td align="right" style="padding:12px 10px;border-bottom:1px solid #f1eadc;color:#1a1814;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${clampPercent(it.discountPct) > 0 ? `${clampPercent(it.discountPct)}%` : '—'}</td>` : ''}
      <td align="right" style="padding:12px 10px;border-bottom:1px solid #f1eadc;color:#1a1814;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:700;">${fmt(invoiceLineAmount(it), cur)}</td>
    </tr>`).join('');
  const billedTo = [inv.storeContact, inv.storeEmail, inv.storePhone, inv.storeAddress, [inv.storeCity, inv.storeRegion, inv.storePostal].filter(Boolean).join(', '), inv.storeCountry]
    .filter(Boolean).map(escapeHtml).join('<br>');
  const notes = [
    inv.notes ? `<div style="margin-top:16px;"><div style="font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#6b6459;font-weight:700;margin-bottom:4px;">Notes</div><div style="white-space:pre-wrap;">${escapeHtml(inv.notes)}</div></div>` : '',
    inv.terms ? `<div style="margin-top:16px;"><div style="font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#6b6459;font-weight:700;margin-bottom:4px;">Terms</div><div style="white-space:pre-wrap;">${escapeHtml(inv.terms)}</div></div>` : '',
  ].join('');
  return `
<div style="margin:0;padding:0;background:#f7f2e9;color:#1a1814;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:760px;margin:0 auto;padding:24px 14px;">
    <p style="font-size:16px;line-height:1.55;margin:0 0 16px;">Hi ${contact},</p>
    <p style="font-size:15px;line-height:1.55;margin:0 0 22px;">Here is invoice <strong>${escapeHtml(inv.num)}</strong> for <strong>${fmt(inv.total || 0, cur)}</strong>. It is also ready to print or save as a PDF from the invoice screen.</p>
    <div style="background:#ffffff;border:1px solid #eadfca;border-radius:12px;overflow:hidden;box-shadow:0 8px 28px rgba(14,12,10,.10);">
      <div style="height:7px;background:${escapeHtml(accent)};"></div>
      <div style="padding:30px 34px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-bottom:26px;">
          <tr>
            <td style="vertical-align:top;">
              <div style="font-family:Georgia,'Times New Roman',serif;font-size:28px;font-weight:700;color:#0e0c0a;line-height:1.1;">${escapeHtml(settings.name || 'Lyricalmyrical Books')}</div>
              <div style="font-size:12px;line-height:1.55;color:#756e64;margin-top:10px;white-space:pre-wrap;">${escapeHtml(settings.addr || '')}${settings.email ? '<br>' + escapeHtml(settings.email) : ''}${settings.web ? '<br>' + escapeHtml(settings.web) : ''}</div>
            </td>
            <td align="right" style="vertical-align:top;white-space:nowrap;">
              <div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;color:${escapeHtml(accent)};letter-spacing:.16em;text-transform:uppercase;font-weight:700;">Invoice</div>
              <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;font-weight:700;margin-top:8px;">${escapeHtml(inv.num)}</div>
            </td>
          </tr>
        </table>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border-top:1px solid #eadfca;border-bottom:1px solid #eadfca;margin-bottom:22px;">
          <tr>
            <td style="padding:16px 12px 16px 0;vertical-align:top;width:45%;"><div style="font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#6b6459;font-weight:700;margin-bottom:6px;">Billed to</div><div style="font-weight:700;">${escapeHtml(inv.storeName || '—')}</div><div style="font-size:12px;line-height:1.5;color:#756e64;margin-top:4px;">${billedTo}</div></td>
            <td style="padding:16px 12px;vertical-align:top;"><div style="font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#6b6459;font-weight:700;margin-bottom:6px;">Issue date</div><div style="font-weight:700;">${fmtD(inv.date)}</div>${inv.dueDate ? `<div style="font-size:12px;color:#756e64;margin-top:4px;">Due ${fmtD(inv.dueDate)}</div>` : ''}</td>
            <td align="right" style="padding:16px 0 16px 12px;vertical-align:top;"><div style="font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#6b6459;font-weight:700;margin-bottom:6px;">Amount due</div><div style="font-size:22px;font-weight:800;color:#0e0c0a;">${fmt(inv.total || 0, cur)}</div></td>
          </tr>
        </table>
        <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-bottom:18px;">
          <thead><tr><th align="left" style="padding:0 10px 9px;border-bottom:1px solid #eadfca;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#6b6459;">Description</th><th align="right" style="padding:0 10px 9px;border-bottom:1px solid #eadfca;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#6b6459;">Qty</th><th align="right" style="padding:0 10px 9px;border-bottom:1px solid #eadfca;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#6b6459;">Unit price</th>${lineDisc ? '<th align="right" style="padding:0 10px 9px;border-bottom:1px solid #eadfca;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#6b6459;">Disc.</th>' : ''}<th align="right" style="padding:0 10px 9px;border-bottom:1px solid #eadfca;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#6b6459;">Amount</th></tr></thead>
          <tbody>${items}</tbody>
        </table>
        <table role="presentation" align="right" width="300" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-bottom:22px;">
          <tr><td style="padding:6px 12px;color:#4a443c;">Subtotal</td><td align="right" style="padding:6px 12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${fmt(inv.subtotal || 0, cur)}</td></tr>
          ${(inv.discount || 0) > 0 ? `<tr><td style="padding:6px 12px;color:#4a443c;">Discount${inv.discountType === 'percent' && inv.discountRate ? ` (${inv.discountRate}%)` : ''}</td><td align="right" style="padding:6px 12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">−${fmt(inv.discount, cur)}</td></tr>` : ''}
          ${(inv.taxRate || 0) > 0 ? `<tr><td style="padding:6px 12px;color:#4a443c;">Tax (${inv.taxRate}%)</td><td align="right" style="padding:6px 12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${fmt(inv.tax || 0, cur)}</td></tr>` : ''}
          <tr><td style="padding:14px 12px;background:#0e0c0a;color:#f7f2e9;border-radius:6px 0 0 6px;font-weight:800;">Total due</td><td align="right" style="padding:14px 12px;background:#0e0c0a;color:#f0c060;border-radius:0 6px 6px 0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:18px;font-weight:800;">${fmt(inv.total || 0, cur)}</td></tr>
        </table>
        <div style="clear:both;"></div>
        ${payUrl ? `<div style="background:#faf6ec;border:1px solid #eadfca;border-radius:10px;padding:18px 20px;margin:16px 0 20px;"><div style="font-family:Georgia,'Times New Roman',serif;font-size:18px;font-weight:700;margin-bottom:6px;">Pay this invoice</div><div style="font-size:13px;line-height:1.5;color:#675f55;margin-bottom:14px;">${followableUrl(payUrl)
    ? `Pay <strong>${fmt(inv.total || 0, cur)}</strong> securely online${isDynamicStripeLink(inv) ? ' via Stripe Checkout' : ''}.`
    : `Pay <strong>${fmt(inv.total || 0, cur)}</strong> by Interac e-Transfer.`}</div>${followableUrl(payUrl)
    ? `<a href="${escapeHtml(followableUrl(payUrl))}" style="display:inline-block;background:#0e0c0a;color:#f0c060;text-decoration:none;border-radius:999px;padding:11px 22px;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;">Pay ${fmt(inv.total || 0, cur)} →</a>`
    : `<div style="font-size:14px;line-height:1.5;color:#0e0c0a;">Send by Interac e-Transfer to <strong>${escapeHtml(payUrl)}</strong></div>`}<div style="font-size:11px;line-height:1.4;color:#6b6459;margin-top:10px;word-break:break-all;">${escapeHtml(payUrl)}</div></div>` : ''}
        ${notes}
        <div style="text-align:center;font-size:12px;color:#6b6459;margin-top:24px;font-style:italic;">${escapeHtml(settings.footer || 'Thank you for stocking our books.')}</div>
      </div>
    </div>
    <p style="font-size:15px;line-height:1.55;margin:22px 0 0;">Thank you,<br>${escapeHtml(settings.name || 'Lyricalmyrical Books')}</p>
  </div>
</div>`;
}

async function copyInvoiceEmailToClipboard(inv) {
  const html = buildInvoiceEmailHTML(inv);
  const text = invoiceEmailPlainText(inv);
  if (navigator.clipboard && window.ClipboardItem) {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      })
    ]);
    return true;
  }
  if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return false; }
  throw new Error('Clipboard unavailable');
}

async function emailInvoice() {
  if (!currentViewInvoiceId) return;
  const inv = invoiceHome(currentViewInvoiceId).inv;
  if (!inv) return;
  const settings = getInvoiceSettings();
  const subject = `Invoice ${inv.num} — ${settings.name || 'Lyricalmyrical Books'}`;
  const to = inv.storeEmail || '';
  let richCopied = false;
  try {
    richCopied = await copyInvoiceEmailToClipboard(inv);
  } catch (e) {
    showToast('Could not copy the formatted invoice email. Your browser may have blocked clipboard access.', 'warn');
  }
  // Still download the one-page invoice file as a backup attachment / PDF source,
  // but the email body itself is now the formatted invoice copied above.
  downloadInvoiceHTML({ silent: true });
  const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}`;
  const w = window.open(gmailUrl, '_blank');
  const msg = richCopied
    ? '✓ Formatted invoice email copied. Paste into Gmail compose, then attach the downloaded invoice if you want.'
    : '✓ Plain invoice text copied. Paste into Gmail compose, then attach the downloaded invoice if you want.';
  if (w) {
    try { w.opener = null; } catch (e) { }
    showToast(msg);
  } else {
    const mailtoUrl = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(invoiceEmailPlainText(inv))}`;
    window.location.href = mailtoUrl;
    showToast('Popup blocked — opened your mail app with the plain invoice text instead.');
  }
}
// Pulls just the .invoice-paper visual styles from the live page so the
// standalone invoice document stays pixel-identical to the on-screen preview
// without duplicating ~60 lines of CSS in JS. We deliberately grab only the
// invoice-scoped rules — NOT the whole <head> — because copying document.head
// dragged in the app's print-isolation rule (`body > *:not(#m-invoice-view)
// {display:none}`), which has no #m-invoice-view to match in this standalone doc
// and so blanked the entire page in the PDF. Cross-origin sheets (Google Fonts)
// throw on .cssRules access and are skipped — their fonts come via the <link>.
function collectInvoicePaperCss() {
  const out = [];
  for (const sheet of Array.from(document.styleSheets || [])) {
    let rules;
    try { rules = sheet.cssRules; } catch (e) { continue; }
    if (!rules) continue;
    for (const rule of Array.from(rules)) {
      // Plain style rules scoped to the invoice paper; @media/@font-face blocks
      // (no selectorText) are skipped — we supply our own clean print rules.
      if (rule.selectorText && rule.selectorText.includes('.invoice-paper')) {
        out.push(rule.cssText);
      }
    }
  }
  return out.join('\n');
}

// Returns the invoice paper's inner HTML with the live QR (drawn to a <canvas>
// at view time) inlined as a PNG <img>, so it survives outside the live preview
// (standalone file, print window, or rasterized PDF).
/**
 * The QR box's tappable-in-a-PDF attribute, or nothing.
 *
 * Only ever a real, followable payment page: an Interac e-Transfer "link" is
 * an email address, and the QR for one is an instruction to send money from
 * your banking app, not somewhere to be sent on tapping.
 */
function qrLinkAttr(inv) {
  const url = pdfSafeLinkUrl(followableUrl(effectivePaymentLink(inv)));
  return url ? ` data-pdf-link="${escapeHtml(url)}"` : '';
}

function invoicePaperBodyWithQR(inv) {
  let bodyInner = renderInvoicePaperHTML(inv);
  const liveQr = document.querySelector('#invoice-print-area .inv-qr canvas');
  if (liveQr) {
    try {
      // data-pdf-link, not an href: this is a picture of a link, and wrapping
      // it in an anchor would change how the paper prints and emails. The PDF
      // builder reads the attribute and lays a tappable rectangle over the
      // code, so a customer reading on a phone — the one device that cannot
      // scan its own screen — can still get to the payment page.
      bodyInner = bodyInner.replace(
        '<div class="inv-qr"></div>',
        `<div class="inv-qr"${qrLinkAttr(inv)}><img src="${liveQr.toDataURL('image/png')}" width="104" height="104" alt="Scan to pay" style="display:block;"></div>`
      );
    } catch (e) { }
  }
  return bodyInner;
}

// The invoice paper's inner HTML with its OWN QR drawn in, for the invoices
// with nobody looking at them — a reminder sent from the background sweep, or
// a test-send, has no open invoice view to borrow a live canvas from the way
// invoicePaperBodyWithQR does. Mirrors the QR draw in viewInvoice() (the QRCode
// library, not a live view) into a detached node instead.
function invoicePaperBodyWithHeadlessQR(inv) {
  let bodyInner = renderInvoicePaperHTML(inv);
  const payUrl = effectivePaymentLink(inv);
  if (!payUrl || typeof QRCode === 'undefined') return bodyInner;
  let qrHolder;
  try {
    qrHolder = document.createElement('div');
    qrHolder.style.cssText = 'position:fixed;left:-9999px;top:0;';
    document.body.appendChild(qrHolder);
    new QRCode(qrHolder, { text: payUrl, width: 104, height: 104, colorDark: '#0e0c0a', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
    const canvas = qrHolder.querySelector('canvas');
    if (canvas) {
      bodyInner = bodyInner.replace(
        '<div class="inv-qr"></div>',
        `<div class="inv-qr"${qrLinkAttr(inv)}><img src="${canvas.toDataURL('image/png')}" width="104" height="104" alt="Scan to pay" style="display:block;"></div>`
      );
    }
  } catch (e) { /* the PDF still carries the link as text — the QR is a nicety */ }
  finally { if (qrHolder) { try { qrHolder.remove(); } catch (e) { } } }
  return bodyInner;
}

// Builds a fully self-contained invoice document with the Stripe pay link embedded
// (clickable button + scannable QR + plain-text URL) that survives PDF export and
// email-client styling — so the link is never dropped when the invoice is sent.
function buildStandaloneInvoiceHTML(inv) {
  const bodyInner = invoicePaperBodyWithQR(inv);

  // Only the font stylesheets/preconnects are carried over from the page; the
  // rest of the document is our own clean, print-safe CSS.
  const fontLinks = Array.from(document.querySelectorAll('link[rel="stylesheet"], link[rel="preconnect"]'))
    .filter(l => /fonts\.(googleapis|gstatic)\.com/.test(l.href || ''))
    .map(l => l.outerHTML).join('\n');

  const css = `
    *{box-sizing:border-box;}
    html,body{margin:0;padding:0;}
    body{background:#f0ece4;padding:40px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;}
    .invoice-paper{background:#fff;} /* token-ok: standalone document, no :root loaded */
    ${collectInvoicePaperCss()}
    .invoice-paper .inv-pay{display:flex !important;}
    @page{margin:0.4in !important;}
    @media print{
      html,body{background:#fff !important;margin:0 !important;padding:0 !important;} /* token-ok: standalone document */
      body{padding:0 !important;}
      .invoice-paper{
        box-shadow:none !important;
        border-radius:0 !important;
        max-width:none !important;
        padding: 20px 30px !important;
        margin: 0 !important;
      }
      .invoice-paper::before{display:none !important;}
      .invoice-paper .inv-head{margin-bottom: 16px !important;}
      .invoice-paper .inv-meta-grid{margin-bottom: 16px !important; padding: 10px 0 !important; gap: 12px !important;}
      .invoice-paper .inv-items{margin-bottom: 12px !important;}
      .invoice-paper .inv-items th{padding-bottom: 6px !important;}
      .invoice-paper .inv-items td{padding: 8px 12px !important;}
      .invoice-paper .inv-totals{margin-bottom: 16px !important;}
      .invoice-paper .inv-totals .tr{padding: 4px 12px !important;}
      .invoice-paper .inv-totals .grand{margin-top: 4px !important; padding: 10px 12px !important;}
      .invoice-paper .inv-pay{margin-bottom: 16px !important; padding: 12px 16px !important; gap: 12px !important; display:flex !important; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important;}
      .invoice-paper .inv-pay .pay-btn{display:inline-block !important; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important;}
      .invoice-paper .inv-pay .inv-qr{padding: 6px !important;}
      .invoice-paper .inv-pay .inv-qr img,
      .invoice-paper .inv-pay .inv-qr canvas { width: 80px !important; height: 80px !important; }
      .invoice-paper .inv-pay-fallback{margin: -8px 2px 12px !important;}
      .invoice-paper .inv-notes{padding-top: 10px !important;}
      .invoice-paper .inv-notes .inv-notes-block{margin-bottom: 8px !important;}
      .invoice-paper .inv-foot{margin-top: 12px !important;}
    }
  `;

  const head = `<meta charset="utf-8"><title>Invoice ${escapeHtml(inv.num || '')}</title>${fontLinks}<style>${css}</style>`;
  const body = `<body><div class="invoice-paper">${bodyInner}</div></body>`;
  return `<!doctype html><html><head>${head}</head>${body}</html>`;
}

function downloadInvoiceHTML(opts) {
  if (!currentViewInvoiceId) return;
  const inv = invoiceHome(currentViewInvoiceId).inv;
  if (!inv) return;
  const html = buildStandaloneInvoiceHTML(inv);
  downloadText(html, `${inv.num}.html`, 'text/html');
  if (!(opts && opts.silent)) {
    showToast(effectivePaymentLink(inv)
      ? '✓ Invoice downloaded with the Stripe pay link embedded — attach it or print to PDF.'
      : '✓ Invoice downloaded (open & print to PDF).');
  }
}

// jsPDF + html2canvas are ~0.5 MB combined, so they're only fetched the first
// time the user actually exports a PDF (not on every page load).
async function ensurePdfLibs() {
  if (!(window.jspdf && window.jspdf.jsPDF)) {
    await loadExternalScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  }
  if (!window.html2canvas) {
    await loadExternalScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
  }
}

// pdf.js, lazily, for the one job nothing else can do: rasterising a PDF
// receipt so it can be *seen* in a printed report. Same CDN-on-demand pattern
// as ensurePdfLibs — it is never fetched on load, and offline it simply
// rejects, which callers treat as "list this receipt instead of showing it".
const PDFJS_VERSION = '3.11.174';
async function ensurePdfJs() {
  if (!window.pdfjsLib) {
    await loadExternalScript(`https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.js`);
  }
  if (!window.pdfjsLib) throw new Error('pdf.js unavailable');
  try {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;
  } catch (e) { /* worker src is best-effort; pdf.js falls back to the main thread */ }
  return window.pdfjsLib;
}

// The shared core of every invoice PDF this app produces: render `bodyInner`
// (the invoice paper's HTML, QR already burned in one way or another) into an
// off-screen node inside THIS document so the app's already-loaded fonts apply
// (correct typography even offline), rasterize with html2canvas, and place the
// result into an A4 jsPDF — paginated if the invoice is tall enough to need
// it. Returns the unsaved jsPDF instance; what happens to it (saved to disk,
// or read back out as base64 for an email attachment) is the caller's job.
/**
 * Every link on the paper, measured while it is still real HTML.
 *
 * Has to run before html2canvas: once the paper is a photograph there is
 * nothing left to measure. Positions come back relative to the paper's own
 * top-left corner, so they survive the holder being parked off-screen.
 *
 * The QR box carries its URL on a data attribute rather than an href — it is a
 * picture of a link, not a link — so that tapping the QR on a phone screen
 * does what pointing a camera at it would.
 */
function invoicePdfLinkRects(paperEl) {
  const out = [];
  if (!paperEl || typeof paperEl.getBoundingClientRect !== 'function') return out;
  const base = paperEl.getBoundingClientRect();
  const nodes = paperEl.querySelectorAll('a[href], [data-pdf-link]');
  for (const el of nodes) {
    const url = pdfSafeLinkUrl(el.getAttribute('data-pdf-link') || el.getAttribute('href'));
    if (!url) continue;
    const box = el.getBoundingClientRect();
    if (!box.width || !box.height) continue;
    out.push({ x: box.left - base.left, y: box.top - base.top, w: box.width, h: box.height, url });
  }
  // Biggest first, so a broad catch-all region (the whole pay box) is laid
  // down before the precise targets inside it (the button, the QR). Where two
  // annotations overlap, a reader generally takes the later one, and the
  // specific one is the one whose tooltip and highlight should win. They point
  // at the same page either way, so the worst case is cosmetic — but only if
  // the order is deliberate rather than however the markup happened to nest.
  out.sort((a, b) => (b.w * b.h) - (a.w * a.h));
  return out;
}

async function buildInvoiceJsPdf(bodyInner) {
  await ensurePdfLibs();

  const holder = document.createElement('div');
  holder.setAttribute('aria-hidden', 'true');
  holder.style.cssText = 'position:fixed;left:-9999px;top:0;width:780px;background:#fff;'; /* token-ok: rasterised into a printed PDF — must not follow the theme */
  holder.innerHTML = `<div class="invoice-paper" style="box-shadow:none;border-radius:0;max-width:none;">${bodyInner}</div>`;
  document.body.appendChild(holder);
  try {
    try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (e) { }

    const paper = holder.firstElementChild;
    // Measured before the photograph is taken, and after the fonts have
    // settled — a link measured against a fallback font sits over the wrong
    // words once the real one loads and reflows the line.
    const paperWidth = paper.getBoundingClientRect().width;
    const linkRects = invoicePdfLinkRects(paper);

    const canvas = await window.html2canvas(paper, {
      scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false
    });

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
    const margin = 24;
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgW = pageW - margin * 2;
    const imgH = canvas.height * (imgW / canvas.width);
    const imgData = canvas.toDataURL('image/png');
    const contentH = pageH - margin * 2;

    if (imgH <= contentH) {
      pdf.addImage(imgData, 'PNG', margin, margin, imgW, imgH);
    } else {
      // Taller than one page: place the full image and shift it up per page so
      // each page shows the next slice (content outside the page is clipped).
      let heightLeft = imgH, position = margin;
      pdf.addImage(imgData, 'PNG', margin, position, imgW, imgH);
      heightLeft -= contentH;
      while (heightLeft > 0) {
        position = margin - (imgH - heightLeft);
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', margin, position, imgW, imgH);
        heightLeft -= contentH;
      }
    }

    // The image is a picture of the paper, links and all — flat, unselectable
    // and untappable. Lay the real links back over it as PDF annotations, so
    // the Pay button and the written-out URL do on the emailed invoice what
    // they do on screen. Scale is points-per-CSS-pixel of the paper itself,
    // which is independent of how sharp the photograph above is.
    const linkScale = paperWidth > 0 ? imgW / paperWidth : 0;
    const placements = pdfLinkPlacements(linkRects, {
      scale: linkScale,
      margin,
      contentHeight: contentH,
      pageCount: pdf.internal.getNumberOfPages(),
    });
    if (placements.length) {
      const lastPage = pdf.internal.getNumberOfPages();
      for (const spot of placements) {
        pdf.setPage(spot.page);
        pdf.link(spot.x, spot.y, spot.w, spot.h, { url: spot.url });
      }
      // Leave the cursor where the drawing left it, rather than on whichever
      // page happened to carry the last link.
      pdf.setPage(lastPage);
    }

    return pdf;
  } finally {
    holder.remove();
  }
}

/**
 * The invoice PDF, headless — built the same way as a downloaded PDF, but for
 * an invoice nobody has open: a reminder sent from the background sweep, or
 * the settings "send me a test reminder" button, both fire for an invoice
 * that may not be the one on screen. Returns `{ filename, mimeType, base64 }`,
 * or null on any failure — best-effort, since a reminder should still reach
 * the customer with its payment link even if the PDF render fails.
 */
async function buildInvoicePdfAttachment(inv) {
  try {
    const pdf = await buildInvoiceJsPdf(invoicePaperBodyWithHeadlessQR(inv));
    const dataUri = pdf.output('datauristring');
    const base64 = dataUri.split(',')[1] || '';
    if (!base64) return null;
    return { filename: `${inv.num || 'invoice'}.pdf`, mimeType: 'application/pdf', base64 };
  } catch (e) {
    console.warn('Could not build the invoice PDF for a reminder email', e);
    return null;
  }
}

// One-click, true PDF download — no browser print dialog. Falls back to the
// print/Save-as-PDF flow if the libraries can't be loaded.
async function downloadInvoicePDF() {
  if (!currentViewInvoiceId) return;
  const inv = invoiceHome(currentViewInvoiceId).inv;
  if (!inv) return;
  const btn = $('inv-pdf-btn');
  const prevLabel = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '… Building PDF'; }

  try {
    const pdf = await buildInvoiceJsPdf(invoicePaperBodyWithQR(inv));
    pdf.save(`${inv.num || 'invoice'}.pdf`);
    showToast('✓ PDF downloaded');
  } catch (e) {
    console.error('PDF export failed:', e);
    showToast('Could not build the PDF — opening the print dialog instead.', 'warn');
    printInvoice();
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = prevLabel; }
  }
}

export {
  ensurePdfJs,
  addInvoiceBookLine,
  addInvoiceItem,
  applyDiscountPreset,
  applyInvoiceDueTerm,
  applyInvoicePaid,
  buildInvoiceEmailHTML,
  buildInvoicePdfAttachment,
  buildStandaloneInvoiceHTML,
  collectInvoicePaperCss,
  copyInvoiceEmailToClipboard,
  copyInvoicePayLink,
  createStripePaymentLinkForInvoice,
  currentViewInvoiceId,
  deactivateStripePaymentLink,
  deleteInvoice,
  downloadInvoiceHTML,
  downloadInvoicePDF,
  duplicateInvoiceFromView,
  editInvoiceFromView,
  effectivePaymentLink,
  emailInvoice,
  ensurePdfLibs,
  focusLastInvoiceLine,
  getInvoiceCurrency,
  getInvoiceSettings,
  invoiceEmailPlainText,
  invoiceHome,
  invoiceOwnerBook,
  invoicePaperBodyWithQR,
  invoicesVisibleHere,
  isDynamicStripeLink,
  markInvoicePaidFromView,
  nextInvoiceNumber,
  onDiscountInput,
  onDiscountTypeChange,
  onInvoiceCurrencyChange,
  onInvoiceDueDateChange,
  onInvoiceIssueDateChange,
  onInvoiceLineKey,
  onInvoiceStoreChange,
  openCreateInvoice,
  openInvoiceTemplateSettings,
  prefillFromPendingSales,
  printInvoice,
  printInvoiceViaPopup,
  recalcInvoiceTotals,
  regenerateStripeLinkFromView,
  removeInvoiceItem,
  renderInvoiceItems,
  renderInvoicePaperHTML,
  renderInvoices,
  saveInvoice,
  saveInvoiceSettings,
  saveInvoiceSettingsObj,
  setInvoiceBillToMode,
  updateInvoiceItem,
  viewInvoice,
};
