// Quick log: say (or type) what happened — "log a gratuity for the Hound" —
// check the card, press Log it.
//
// Nothing is saved until the publisher presses Log it. The sentence is read on
// the phone first (src/lib/quick-log.js: instant, free, works with no signal);
// only a sentence that reader can't make out confidently goes to the AI the
// publisher set up in Settings › AI and receipts, through the same chain the
// receipt scanner uses. Either way the result is the same editable card.
//
// Each entry is saved by the same function its own form uses —
// recordGratuity and writeOrderToLedger (sales-ledger.js), recordBusinessExpense
// (tax-entries.js) — so a spoken gift and a typed one can never land
// differently, and they share the offline queue and Sheet sync. Undo reverses
// them the way the app always does: a sale or gift is voided (stock back, its
// expense with it, the Sheet row queued for deletion), an expense removed.
//
// Publisher only: the button is hidden for authors, and every entry point
// checks again. Loaded on first use, so it costs nothing at start-up.

import {
  TAX_CENTER,
  isAuthor,
  renderHist,
  saveState,
  showToast,
  switchBook,
  switchTab,
  today,
} from '../main.js';
import { BOOKS, states, activeBook, withActiveBook } from '../core/store.js';
import { recordGratuity, voidHistEntry, writeOrderToLedger } from './sales-ledger.js';
import { TC_CATEGORIES, _tcGuessCategory, recordBusinessExpense } from './tax-entries.js';
import { renderTaxCenter, saveTaxCenter } from './taxcentre.js';
import { renderExpenses } from './receipts.js';
import { updateDash } from './dashboard.js';
import { registerActions } from '../lib/actions.js';
import { anyAiReady } from '../lib/claude-chat.js';
import { findExpenseRule } from '../lib/expense-rules.js';
import { escapeHtml } from '../lib/html.js';
import { closeM, openM } from '../lib/modal.js';
import { buildPaymentMeta, fmt } from '../lib/money.js';
import {
  QUICK_LOG_AI_SCHEMA, SALE_CHANNELS, checkQuickLogEntry, describeEntry, entriesFromAi,
  quickLogAiPrompt, readConfidently, readQuickLog,
} from '../lib/quick-log.js';
import '../styles/quick-log.css';

const MODAL = 'quick-log';
const CURRENCIES = ['CAD', 'USD', 'EUR', 'GBP'];

/** Everything on the card right now. */
const QL = {
  text: '',
  entries: [],
  /** 'idle' | 'listening' | 'reading' | 'review' | 'logged' */
  phase: 'idle',
  note: '',
  /** What Log it saved, for Undo: [{ kind: 'hist', bookId, num } | { kind: 'expense', id }] */
  logged: [],
  busy: false,
};

let recognition = null;
let wired = false;

const $ = (id) => document.getElementById(id);

// ── Reading ────────────────────────────────────────────────────────────────

function baseCurrency() {
  return String(TAX_CENTER.settings?.baseCurrency || 'CAD').toUpperCase();
}

/** An expense description → its category: the owner's own rules first, then the built-in keywords. */
function categorize(desc) {
  const hit = findExpenseRule(TAX_CENTER.expenseRules, { description: desc }, { allowed: TC_CATEGORIES });
  return hit?.category || _tcGuessCategory(desc) || '';
}

function readContext() {
  return { books: BOOKS, today: today(), activeBookId: activeBook, baseCurrency: baseCurrency(), categorize, categories: TC_CATEGORIES };
}

/** The unit cost a gifted copy is expensed at: what the Log Gratuity form pre-fills. */
function unitCost(bookId) {
  const book = BOOKS[bookId];
  if (!book) return 0;
  return Math.round(((Number(book.productionCost) || 0) / (Number(book.maxPrint) || 1)) * 100) / 100;
}

async function askAi(text) {
  const ctx = readContext();
  const { readWithAppAi } = await import('./receipts.js');
  const out = await readWithAppAi([{ text: quickLogAiPrompt(text, ctx) }], { schema: QUICK_LOG_AI_SCHEMA, maxOutputTokens: 2048 });
  let answer = null;
  try { answer = JSON.parse(String(out?.text || '').replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch { answer = null; }
  return entriesFromAi(answer, ctx);
}

/**
 * Read the sentence into entries: on the phone first, the AI only when the
 * phone's reading is unsure and an AI is set up and reachable. A failed AI
 * read falls back to whatever the phone made of it, so the card still opens.
 */
async function readSentence(text) {
  const said = String(text || '').trim();
  if (!said) { QL.note = 'Say or type what happened first.'; render(); return; }
  QL.text = said;
  const local = readQuickLog(said, readContext());
  let entries = local.entries;
  let note = '';
  if (!readConfidently(local)) {
    const aiReady = anyAiReady(TAX_CENTER.settings);
    const online = typeof navigator === 'undefined' || navigator.onLine !== false;
    if (aiReady && online) {
      QL.phase = 'reading'; QL.note = 'Working out the rest of that…'; render();
      try {
        const fromAi = await askAi(said);
        if (fromAi.length) entries = fromAi;
        else if (!entries.length) note = 'Nothing to log was found in that. Try something like "gratuity for the Hound".';
      } catch (e) {
        console.warn('Quick log: the AI reader failed', e);
        note = entries.length ? 'The AI reader could not be reached, so check what was read below.' : 'That could not be read just now. Try saying it more simply, or open the full form.';
      }
    } else if (!entries.length) {
      note = online
        ? 'That could not be read. Try something like "gratuity for the Hound", or set up an AI key in Settings › AI and receipts for longer sentences.'
        : 'No signal, so only simple sentences can be read. Try "gratuity for the Hound" or "sold 2 Hound for 25 each".';
    } else if (local.unread.length) {
      note = `Not understood: "${local.unread.join('", "')}". Check the rest below.`;
    }
  }
  QL.entries = entries.map(e => ({ ...e, include: true }));
  QL.phase = QL.entries.length ? 'review' : 'idle';
  QL.note = note;
  render();
}

// ── Listening ──────────────────────────────────────────────────────────────

function speechApi() {
  return typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition || null) : null;
}

function stopListening() {
  try { recognition?.stop(); } catch { /* already stopped */ }
}

function startListening() {
  const SR = speechApi();
  if (!SR) {
    QL.note = 'This browser can\'t listen. Type it instead, or use the microphone on your keyboard.';
    render();
    $('ql-text')?.focus();
    return;
  }
  if (QL.phase === 'listening') { stopListening(); return; }
  const rec = new SR();
  recognition = rec;
  rec.lang = (typeof navigator !== 'undefined' && navigator.language) || 'en-CA';
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  let finalText = '';
  let failed = false;
  rec.onresult = (ev) => {
    let interim = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const r = ev.results[i];
      if (r.isFinal) finalText += r[0].transcript;
      else interim += r[0].transcript;
    }
    const box = $('ql-text');
    if (box) box.value = (finalText + interim).trim();
  };
  rec.onerror = (ev) => {
    failed = true;
    const why = ev?.error;
    QL.note = why === 'not-allowed' || why === 'service-not-allowed'
      ? 'The microphone is blocked for this app. Allow it in your browser\'s site settings, or type instead.'
      : why === 'no-speech' ? 'Nothing was heard. Tap the microphone and try again.'
        : why === 'network' ? 'Listening needs a connection on this device. Type it instead; simple sentences still work offline.'
          : why === 'aborted' ? '' : 'Listening stopped. Try again, or type it instead.';
  };
  rec.onend = () => {
    recognition = null;
    if (QL.phase === 'listening') QL.phase = QL.entries.length ? 'review' : 'idle';
    const heard = (finalText || $('ql-text')?.value || '').trim();
    if (!failed && heard) { readSentence(heard); return; }
    render();
  };
  QL.phase = 'listening';
  QL.note = 'Listening… say what happened, like "gratuity for the Hound".';
  render();
  try { rec.start(); } catch (e) {
    console.warn('Quick log: could not start listening', e);
    QL.phase = 'idle';
    QL.note = 'Listening could not start. Type it instead.';
    render();
  }
}

// ── The card ───────────────────────────────────────────────────────────────

const TYPE_LABEL = { gratuity: 'Gratuity', sale: 'Sale', expense: 'Expense' };

/** Each entry's checks, counting copies already claimed by rows above it on the card. */
function checkAll() {
  const pending = {};
  return QL.entries.map(e => {
    const result = e.include ? checkQuickLogEntry(e, { books: BOOKS, states, today: today(), pendingQty: pending }) : { blocking: [], notes: [] };
    if (e.include && e.type !== 'expense' && e.bookId) pending[e.bookId] = (pending[e.bookId] || 0) + (Number(e.qty) || 1);
    if (e.include && e.type === 'gratuity' && e.expense && e.bookId && !unitCost(e.bookId)) {
      result.notes.push('This book has no production cost yet, so the gift will be logged without an expense.');
    }
    return result;
  });
}

function bookOptions(selected) {
  const list = Object.values(BOOKS).filter(b => b?.id).sort((a, b) => String(a.title).localeCompare(String(b.title)));
  return `<option value=""${selected ? '' : ' selected'}>Pick a book</option>`
    + list.map(b => `<option value="${escapeHtml(b.id)}"${b.id === selected ? ' selected' : ''}>${escapeHtml(b.title)}</option>`).join('');
}

const opts = (values, selected, labels = {}) => values.map(v => `<option value="${escapeHtml(v)}"${v === selected ? ' selected' : ''}>${escapeHtml(labels[v] ?? v)}</option>`).join('');

function field(i, f, label, control) {
  const id = `ql-${i}-${f}`;
  return `<div class="form-group ql-field"><label for="${id}">${label}</label>${control.replace('{id}', id).replace('{attrs}', `data-on-change="ql.field" data-i="${i}" data-f="${f}"`)}</div>`;
}

function entryFields(e, i) {
  if (e.type === 'expense') {
    const curs = CURRENCIES.includes(e.currency) ? CURRENCIES : [e.currency, ...CURRENCIES];
    return [
      field(i, 'amount', 'Amount', `<input type="number" id="{id}" {attrs} inputmode="decimal" min="0" step="0.01" value="${e.amount ?? ''}" placeholder="0.00">`),
      field(i, 'currency', 'Currency', `<select id="{id}" {attrs}>${opts(curs, e.currency)}</select>`),
      field(i, 'description', 'What for', `<input type="text" id="{id}" {attrs} maxlength="120" value="${escapeHtml(e.description || '')}" placeholder="e.g. postage">`),
      field(i, 'category', 'Category', `<select id="{id}" {attrs}>${opts(TC_CATEGORIES, e.category)}</select>`),
      field(i, 'date', 'Date', `<input type="date" id="{id}" {attrs} value="${escapeHtml(e.date || today())}" max="${today()}">`),
    ].join('');
  }
  const common = [
    field(i, 'bookId', 'Book', `<select id="{id}" {attrs}>${bookOptions(e.bookId)}</select>`),
    field(i, 'qty', 'Copies', `<input type="number" id="{id}" {attrs} inputmode="numeric" min="1" step="1" value="${Number(e.qty) || 1}">`),
  ];
  if (e.type === 'gratuity') {
    const cost = unitCost(e.bookId);
    return [
      ...common,
      field(i, 'pile', 'Whose copies', `<select id="{id}" {attrs}>${opts(['publisher', 'author'], e.pile, { publisher: "Publisher's pile", author: "Author's pile" })}</select>`),
      field(i, 'recipient', 'Given to', `<input type="text" id="{id}" {attrs} maxlength="60" value="${escapeHtml(e.recipient || '')}" placeholder="optional">`),
      field(i, 'date', 'Date', `<input type="date" id="{id}" {attrs} value="${escapeHtml(e.date || today())}" max="${today()}">`),
      `<label class="ql-include ql-toggle"><input type="checkbox" data-on-change="ql.field" data-i="${i}" data-f="expense"${e.expense ? ' checked' : ''}><span>Also book it as a marketing expense${cost && e.bookId ? ` (${escapeHtml(fmt(cost, BOOKS[e.bookId]?.currency))} a copy)` : ''}</span></label>`,
    ].join('');
  }
  const book = BOOKS[e.bookId];
  return [
    ...common,
    field(i, 'price', 'Price each', `<input type="number" id="{id}" {attrs} inputmode="decimal" min="0" step="0.01" value="${e.price ?? ''}" placeholder="${book ? escapeHtml(Number(book.listPrice || 0).toFixed(2)) + ' (list)' : 'list price'}">`),
    field(i, 'channel', 'Where', `<select id="{id}" {attrs}>${opts(SALE_CHANNELS, e.channel)}</select>`),
    field(i, 'payment', 'Paid by', `<select id="{id}" {attrs}>${opts(['', 'Cash', 'Card'], e.payment || '', { '': 'Not said' })}</select>`),
    field(i, 'date', 'Date', `<input type="date" id="{id}" {attrs} value="${escapeHtml(e.date || today())}" max="${today()}">`),
  ].join('');
}

function entryHtml(e, i, check) {
  const many = QL.entries.length > 1;
  const money = (e.type === 'sale' || e.type === 'expense') && e.include;
  return `<section class="ql-entry${e.include ? '' : ' is-skipped'}${check.blocking.length ? ' needs-you' : ''}" aria-label="${escapeHtml(TYPE_LABEL[e.type])} ${i + 1}">
    <div class="ql-entry-head">
      <span class="pill ${e.type === 'gratuity' ? 'gray' : e.type === 'sale' ? 'green' : 'amber'}">${TYPE_LABEL[e.type]}</span>
      <span class="ql-entry-line">${escapeHtml(describeEntry(e, BOOKS, fmt))}</span>
      ${many ? `<label class="ql-include"><input type="checkbox" data-on-change="ql.include" data-i="${i}"${e.include ? ' checked' : ''}> Log this</label>` : ''}
    </div>
    ${e.include ? `<div class="ql-fields">${entryFields(e, i)}</div>` : ''}
    ${check.blocking.map(t => `<p class="ql-check is-block" role="alert">${escapeHtml(t)}</p>`).join('')}
    ${check.notes.map(t => `<p class="ql-check">${escapeHtml(t)}</p>`).join('')}
    ${money && !check.blocking.length ? '<p class="ql-check is-money">Money is involved. Worth a second look.</p>' : ''}
  </section>`;
}

function render() {
  const body = $('ql-body');
  const foot = $('ql-foot');
  if (!body || !foot) return;
  const listening = QL.phase === 'listening';
  const reading = QL.phase === 'reading';
  const mic = $('ql-mic');
  if (mic) {
    mic.classList.toggle('is-listening', listening);
    mic.setAttribute('aria-pressed', String(listening));
    mic.setAttribute('aria-label', listening ? 'Stop listening' : 'Speak');
    mic.title = listening ? 'Stop listening' : 'Speak';
    mic.hidden = QL.phase === 'logged';
  }
  const input = $('ql-input-row');
  if (input) input.hidden = QL.phase === 'logged';
  const read = $('ql-read');
  if (read) read.disabled = listening || reading;
  const note = $('ql-note');
  if (note) { note.textContent = QL.note; note.hidden = !QL.note; }

  if (QL.phase === 'logged') {
    body.innerHTML = `<div class="ql-done" role="status">
      <p class="ql-done-head">Logged ${QL.logged.length === 1 ? '1 entry' : `${QL.logged.length} entries`}.</p>
      <ul class="ql-done-list">${QL.logged.map(l => `<li>${escapeHtml(l.line)}</li>`).join('')}</ul>
      <p class="ql-done-hint">Made a mistake? Undo takes it straight back out.</p>
    </div>`;
    foot.innerHTML = `<button type="button" class="btn" data-action="ql.undo"${QL.busy ? ' disabled' : ''}>Undo</button>
      <button type="button" class="btn" data-action="ql.again">Log another</button>
      <button type="button" class="btn gold" data-action="ql.close">Done</button>`;
    return;
  }

  if (!QL.entries.length) {
    body.innerHTML = reading ? '<p class="ql-empty" aria-busy="true">Reading…</p>' : `<div class="ql-empty">
      <p>Tap the microphone and say what happened, or type it. For example:</p>
      <ul class="ql-examples">
        <li>Gratuity for the Hound</li>
        <li>Sold two Altrove at the fair for 25 each, cash</li>
        <li>Spent 18 dollars on postage yesterday</li>
      </ul>
      <p class="ql-empty-foot">You'll see exactly what will be logged before anything is saved.</p>
    </div>`;
    foot.innerHTML = '<button type="button" class="btn" data-action="ql.close">Cancel</button>';
    return;
  }

  const checks = checkAll();
  const chosen = QL.entries.filter(e => e.include);
  const blocked = checks.some(c => c.blocking.length);
  body.innerHTML = QL.entries.map((e, i) => entryHtml(e, i, checks[i])).join('');
  const single = QL.entries.length === 1;
  foot.innerHTML = `${single ? '<button type="button" class="btn ql-full" data-action="ql.fullForm">Open full form</button>' : ''}
    <button type="button" class="btn" data-action="ql.close">Cancel</button>
    <button type="button" class="btn gold" data-action="ql.log"${(!chosen.length || blocked || QL.busy) ? ' disabled' : ''}>${QL.busy ? 'Logging…' : chosen.length > 1 ? `Log ${chosen.length}` : 'Log it'}</button>`;
}

// ── Saving and undoing ─────────────────────────────────────────────────────

/** Repaint the screens a save can change; a repaint that fails must not look like a failed save. */
function repaint({ expenses = false, tax = false } = {}) {
  for (const fn of [renderHist, updateDash, expenses && renderExpenses, tax && renderTaxCenter]) {
    if (typeof fn !== 'function') continue;
    try { fn(); } catch (err) { setTimeout(() => { throw err; }, 0); }
  }
}

async function saveEntry(e, i) {
  if (e.type === 'gratuity') {
    const expenseEach = e.expense ? unitCost(e.bookId) : 0;
    const done = await recordGratuity(e.bookId, { qty: e.qty, ref: e.recipient || '', notes: 'Quick log', date: e.date, gratSource: e.pile, expenseEach });
    if (!done.ok) throw new Error(`Not enough copies of ${BOOKS[e.bookId]?.title || 'that book'} on hand`);
    return { kind: 'hist', bookId: e.bookId, num: done.row.num, expensed: !!done.expense };
  }
  if (e.type === 'sale') {
    const book = BOOKS[e.bookId];
    const qty = Math.max(1, parseInt(e.qty, 10) || 1);
    const price = e.price == null || e.price === '' ? Number(book.listPrice) || 0 : Number(e.price);
    if ((states[e.bookId]?.stock ?? 0) < qty) throw new Error(`Not enough copies of ${book.title} on hand`);
    // The same row the order form writes for a publisher's own sale.
    const notes = [e.payment ? `Paid by ${e.payment.toLowerCase()}` : '', 'Quick log', 'Payment directly to publisher'].filter(Boolean).join(' · ');
    const num = `MAN-${Date.now()}${i ? `-${i}` : ''}`;
    writeOrderToLedger(e.bookId, { num, chan: e.channel || 'In Person', qty, price, notes, payment: buildPaymentMeta({ book, qty, unitPrice: price }), enteredBy: 'Publisher', date: e.date });
    return { kind: 'hist', bookId: e.bookId, num };
  }
  const { entry } = await recordBusinessExpense({ desc: String(e.description).trim(), cat: e.category || 'Other', currency: e.currency || baseCurrency(), amount: Number(e.amount), date: e.date });
  return { kind: 'expense', id: entry.id };
}

async function logAll() {
  if (QL.busy || isAuthor()) return;
  const checks = checkAll();
  if (checks.some(c => c.blocking.length)) { render(); return; }
  const chosen = QL.entries.filter(e => e.include);
  if (!chosen.length) return;
  QL.busy = true; render();
  const logged = [];
  const failed = [];
  for (let i = 0; i < chosen.length; i++) {
    const e = chosen[i];
    try {
      const done = await saveEntry(e, i);
      logged.push({ ...done, line: describeEntry(e, BOOKS, fmt) });
    } catch (err) {
      console.error('Quick log: could not log', e, err);
      failed.push(err?.message || 'Could not be saved');
    }
  }
  QL.busy = false;
  repaint({ expenses: logged.some(l => l.expensed), tax: logged.some(l => l.kind === 'expense') });
  if (!logged.length) {
    QL.note = `Nothing was logged: ${failed.join('; ')}.`;
    render();
    return;
  }
  QL.logged = logged;
  QL.phase = 'logged';
  QL.note = failed.length ? `${failed.length} could not be logged: ${failed.join('; ')}.` : '';
  render();
  showToast(logged.length === 1 ? '✓ Logged' : `✓ ${logged.length} entries logged`);
}

async function undoAll() {
  if (QL.busy || !QL.logged.length) return;
  QL.busy = true; render();
  const touchedBooks = new Set();
  let expenses = false;
  let undone = 0;
  for (const l of QL.logged) {
    if (l.kind === 'hist') {
      const s = states[l.bookId], book = BOOKS[l.bookId];
      const row = s?.hist?.find(h => h.num === l.num && !h.voided);
      if (!row) continue;
      withActiveBook(l.bookId, () => voidHistEntry(s, book, row));
      row.voidedReason = 'Undone from Quick log';
      touchedBooks.add(l.bookId);
      undone++;
    } else {
      const list = TAX_CENTER.businessExpenses || [];
      const at = list.findIndex(x => x && x.id === l.id);
      if (at === -1) continue;
      list.splice(at, 1);
      expenses = true;
      undone++;
    }
  }
  for (const id of touchedBooks) saveState(id);
  if (expenses) saveTaxCenter();
  QL.busy = false;
  repaint({ expenses: true, tax: expenses });
  showToast(undone ? `Undone: ${undone === 1 ? '1 entry' : `${undone} entries`} taken back out` : 'Nothing left to undo', undone ? 'ok' : 'warn');
  // Back to the card as it was, so a misheard word can be fixed and logged again.
  QL.logged = [];
  QL.phase = QL.entries.length ? 'review' : 'idle';
  QL.note = undone ? 'Taken back out. Fix anything below and log it again, or cancel.' : '';
  render();
}

// ── Open full form: the regular form, already filled in ───────────────────

function setValue(id, value) {
  const el = $(id);
  if (!el) return;
  if (el.type === 'checkbox') el.checked = !!value;
  else el.value = value;
  el.dispatchEvent(new Event(el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input', { bubbles: true }));
}

function openFullForm() {
  const e = QL.entries[0];
  if (!e) return;
  closeQuickLog();
  if (e.type === 'expense') {
    switchTab('taxcenter');
    if (typeof window.switchTaxCenterSubTab === 'function') window.switchTaxCenterSubTab('ledger');
    setValue('tc-exp-desc', e.description || '');
    setValue('tc-exp-amount', e.amount ?? '');
    setValue('tc-exp-cur', e.currency || baseCurrency());
    setValue('tc-exp-date', e.date || today());
    const cat = $('tc-exp-cat');
    if (cat && e.category) { cat.value = e.category; cat.dataset.handPicked = '1'; }
    $('tc-exp-desc')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return;
  }
  if (e.bookId && e.bookId !== activeBook) switchBook(e.bookId);
  switchTab('manual');
  if (e.type === 'gratuity') {
    setValue('g-qty', Number(e.qty) || 1);
    setValue('g-ref', e.recipient || '');
    setValue('g-date', e.date || today());
    setValue('g-source', e.pile || 'publisher');
    if (e.expense) setValue('g-expense-cb', true);
    if (typeof window.toggleGratuityExpense === 'function' && e.expense) window.toggleGratuityExpense();
    $('man-gift-sect')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  } else {
    setValue('m-qty', Number(e.qty) || 1);
    if (e.price != null && e.price !== '') setValue('m-price', Number(e.price).toFixed(2));
    setValue('m-chan', e.channel || 'In Person');
    setValue('m-payment-type', 'Payment directly to publisher');
    if (e.payment) setValue('m-notes', `Paid by ${e.payment.toLowerCase()}`);
    $('m-qty')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}

// ── Wiring ─────────────────────────────────────────────────────────────────

/** A field on the card changed: store it as the right type and redraw the checks. */
function onField(el) {
  const e = QL.entries[Number(el.dataset.i)];
  if (!e) return;
  const f = el.dataset.f;
  if (f === 'expense') e.expense = el.checked;
  else if (f === 'qty') e.qty = Math.max(1, Math.min(999, parseInt(el.value, 10) || 1));
  else if (f === 'price' || f === 'amount') e[f] = el.value === '' ? null : Math.max(0, Number(el.value) || 0);
  else e[f] = el.value;
  if (f === 'bookId') { delete e.assumedBook; e.missing = el.value ? [] : ['book']; }
  if (f === 'description' && !e.categoryPicked) e.category = categorize(e.description) || e.category;
  if (f === 'category') e.categoryPicked = true;
  render();
}

function wire() {
  if (wired) return;
  wired = true;
  registerActions({
    'ql.listen': () => startListening(),
    'ql.read': () => readSentence($('ql-text')?.value || ''),
    'ql.field': el => onField(el),
    'ql.include': el => { const e = QL.entries[Number(el.dataset.i)]; if (e) { e.include = el.checked; render(); } },
    'ql.log': () => logAll(),
    'ql.undo': () => undoAll(),
    'ql.again': () => resetCard({ focus: true }),
    'ql.fullForm': () => openFullForm(),
    'ql.close': () => closeQuickLog(),
  });
  // Enter reads what was typed (Shift+Enter is a new line).
  $('ql-text')?.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); readSentence(ev.target.value); }
  });
  $(`m-${MODAL}`)?.addEventListener('modal-close', () => stopListening());
}

function resetCard({ focus = false } = {}) {
  QL.text = ''; QL.entries = []; QL.logged = []; QL.phase = 'idle'; QL.note = ''; QL.busy = false;
  const box = $('ql-text');
  if (box) box.value = '';
  render();
  if (focus) setTimeout(() => box?.focus(), 0);
}

/**
 * Open Quick log. `listen` starts the microphone straight away (the header
 * button does, where the browser can listen); otherwise the text box has focus.
 */
function openQuickLog({ listen = true } = {}) {
  if (isAuthor()) return;
  wire();
  if (QL.phase !== 'review') resetCard();
  openM(MODAL);
  const canListen = !!speechApi();
  const mic = $('ql-mic');
  if (mic) mic.title = canListen ? 'Speak' : 'This browser can\'t listen. Type instead.';
  if (listen && canListen && QL.phase === 'idle') startListening();
  else setTimeout(() => $('ql-text')?.focus(), 0);
}

function closeQuickLog() {
  stopListening();
  closeM(MODAL);
  // A finished log starts fresh next time; an unfinished card is kept, so a
  // stray tap outside doesn't lose what was said.
  if (QL.phase === 'logged') resetCard();
}

export { openQuickLog, closeQuickLog, readSentence, logAll, undoAll, QL as _quickLogState };
