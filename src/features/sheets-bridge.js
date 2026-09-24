// Google Sheets bridge — everything that gets a sale, expense or order from
// the app into the publisher's spreadsheet: the offline write queue and its
// retry loop, the single-row and bulk sync paths, the "Sync all data" push,
// the sync log on the Sheets tab, the test/verify buttons, the publisher
// notification e-mails the Apps Script sends, and the lazily fetched copy of
// that script for the "Connect your Google Sheet" tab.
//
// Lifted out of src/main.js as one unit. main.js and this module import from
// each other; that cycle is fine because nothing here reads an imported name
// at module-evaluation time — the top-level statements are constants and the
// queue/log read back from localStorage, and every other export is a hoisted
// function declaration called later. The three listeners that drain the queue
// (coming back online, the tab becoming visible, the start-up resume) stay in
// main.js for the same reason, and the inline onclick handlers reach these
// through main.js's Object.assign(window, …) list as before.
//
// _sheetsQueue is exported as a live binding for main.js's start-up resume to
// read; only this module ever reassigns it.
import {
  $,
  BOOKS,
  EXPECTED_SCRIPT_VERSION,
  activeBook,
  checkSheetsVersion,
  defaultState,
  getBook,
  isAuthor,
  isTestBook,
  isTestBookId,
  notifyUrl,
  saveState,
  sheetsUrl,
  showToast,
  states,
  today,
} from '../main.js';
import { shippingPurchaseRowPayload } from './shipping.js';
import { simulatePostToSheets } from './sheets-simulator.js';
import { confirmDialog } from '../lib/modal.js';
import { cadEquivalentForSale, getBookCurrencyCode, normalizeCurrencyCode } from '../lib/money.js';
import { sheetLogLabel, sheetLogSummary, sortSheetPayloads } from '../lib/sheet-sync.js';

// Write one row and say what actually happened to it.
//
// This used to hand the row to syncToSheets with `book: 'Test'`. isTestBookId()
// treats any title containing "test" as the practice book, so syncToSheets
// dropped the row on the spot — and the button then announced "Test row sent"
// regardless. The one control the publisher had for checking the connection
// could not fail, because it never sent anything. It posts directly now, waits
// for the answer, and reports the sheet's own words when it refuses.
async function testSheets() {
  if (!sheetsUrl) { showToast('Connect your Google Sheet first', 'warn'); return; }
  const btn = document.querySelector('[onclick="testSheets()"]');
  const prev = btn ? btn.textContent : '';
  if (btn) { btn.textContent = 'Testing…'; btn.disabled = true; }
  const num = 'TEST-' + Date.now().toString().slice(-4);
  const payload = {
    action: 'add',
    type: 'order',
    book: 'Connection check',
    date: today(),
    num,
    chan: 'Test',
    qty: 0,
    price: 0,
    total: 0,
    stockAfter: 0,
    currency: 'CAD',
    notes: 'Connection test — safe to delete this row',
    sheetsId: 'conn-test-' + Date.now()
  };
  try {
    const res = await postToSheets({
      version: 2,
      eventId: payload.sheetsId,
      action: 'add',
      sentAt: new Date().toISOString(),
      payload
    }, sheetsUrl, { simulate: isTestBookId(activeBook) });
    if (res === 'unknown') {
      addSheetsLog('Connection check', 'Order', `${num} · Test · 0×`, 'unknown');
      showToast('Sent, but your browser could not read the reply — check the sheet for ' + num, 'warn', 6000);
    } else {
      addSheetsLog('Connection check', 'Order', `${num} · Test · 0×`, 'ok');
      showToast('✓ Connection works — row ' + num + ' is in your sheet');
    }
  } catch (e) {
    const why = (e && e.message) || 'the sheet did not answer';
    addSheetsLog('Connection check', 'Order', `${num} · Test · 0× [${why}]`, 'err');
    showToast('⚠ Test failed: ' + why, 'err', 8000);
  } finally {
    if (btn) { btn.textContent = prev || 'Test connection'; btn.disabled = false; }
  }
  checkSheetsVersion();
}
// Sheets delivery engine (rebuilt): durable queue + retry + deterministic event IDs
const SHEETS_QUEUE_KEY = 'lm-sheets-write-queue-v2';
const SHEETS_LOG_KEY = 'lm-sheets-log-v2';
const MAX_SHEETS_RETRIES = 6;
const RETRY_BASE_MS = 1200;
// A write that never answers used to park the queue forever: `fetch` has no
// default timeout, so one hung Apps Script call left `_sheetsWriting` true and
// every later row queued silently behind it. Nothing may take longer than this.
const SHEETS_WRITE_TIMEOUT_MS = 45000;
const SHEETS_BATCH_TIMEOUT_MS = 120000;
let _sheetsQueue = JSON.parse(localStorage.getItem(SHEETS_QUEUE_KEY) || '[]');
let _sheetsWriting = false;
let sheetsLog = JSON.parse(localStorage.getItem(SHEETS_LOG_KEY) || '[]');

// Both of these are called from inside the delivery loop, including from its
// error path. A QuotaExceededError thrown here used to escape `_processQueue`
// before it could release its lock, which stopped Sheets syncing altogether
// until the tab was reloaded. Losing the on-disk copy of the queue is bad;
// losing the ability to deliver anything at all is worse.
function persistSheetsQueue() {
  try {
    localStorage.setItem(SHEETS_QUEUE_KEY, JSON.stringify(_sheetsQueue));
  } catch (e) {
    console.warn('Could not persist the Sheets queue', e);
  }
}
function persistSheetsLog() {
  try {
    localStorage.setItem(SHEETS_LOG_KEY, JSON.stringify(sheetsLog));
  } catch (e) {
    // Trim the log and try once more — it is the expendable half of the pair.
    try {
      sheetsLog = sheetsLog.slice(0, 40);
      localStorage.setItem(SHEETS_LOG_KEY, JSON.stringify(sheetsLog));
    } catch (_) { /* give up on persisting history, keep delivering rows */ }
  }
}
function makeEventId() { return `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`; }

// Stamp a stable sheetsId on every existing record that lacks one so future
// edits/voids can be matched against the corresponding sheet row.
// Operates on the in-memory `states` object and persists each touched book.
async function backfillSheetsIds() {
  let hist = 0, ledger = 0, transfers = 0;
  const touched = new Set();
  for (const bookId of Object.keys(states || {})) {
    const s = states[bookId];
    if (!s) continue;
    let dirty = false;
    if (Array.isArray(s.hist)) {
      for (const h of s.hist) if (!h.sheetsId) { h.sheetsId = makeEventId(); hist++; dirty = true; }
    }
    if (Array.isArray(s.ledger)) {
      for (const e of s.ledger) if (!e.sheetsId) { e.sheetsId = makeEventId(); ledger++; dirty = true; }
    }
    if (Array.isArray(s.artistTransfers)) {
      for (const t of s.artistTransfers) if (!t.sheetsId) { t.sheetsId = makeEventId(); transfers++; dirty = true; }
    }
    if (dirty) touched.add(bookId);
  }
  await Promise.all(Array.from(touched).map(bookId => saveState(bookId)));
  return { hist, ledger, transfers, books: touched.size };
}

async function backfillAndResync() {
  if (!sheetsUrl) { showToast('Connect Google Sheets first', 'warn'); return; }
  if (!(await confirmDialog(
    'This repairs the Google Sheet in one pass:\n' +
    '1. Stamps a stable ID on every record missing one\n' +
    '2. Clears the sheet, then re-adds a clean copy of every live record\n\n' +
    'Result: duplicate rows disappear, CAD equivalents refill, and voided\n' +
    'entries drop off. Your app data is untouched. Continue?',
    { title: 'Repair legacy rows', okLabel: 'Continue' }
  ))) return;
  const counts = await backfillSheetsIds();
  showToast(`Stamped IDs on ${counts.hist + counts.ledger + counts.transfers} record(s) across ${counts.books} book(s)`);
  if (typeof pushAllToSheets === 'function') pushAllToSheets({ rebuild: true, skipConfirm: true });
}
function retryDelayMs(attempt) { return Math.min(60000, RETRY_BASE_MS * Math.pow(2, Math.max(0, attempt - 1))); }

// One POST with a hard deadline. `fetch` waits forever by default, and a
// forever-pending write is what stops the whole queue: the delivery loop cannot
// move to the next row until this settles.
async function fetchSheetsWithTimeout(url, payload, mode, timeoutMs) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    return await fetch(url, {
      method: 'POST',
      mode,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: payload,
      ...(controller ? { signal: controller.signal } : {})
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Deliver one payload to a Google Sheet.
 *
 * `opts.simulate` decides whether this goes to the mock spreadsheet, and the
 * caller must decide it. It used to be inferred from whichever book happened
 * to be open (`isTestBookId(activeBook)`), which meant opening the Test Profile
 * while real rows were still waiting sent those real rows into the simulator —
 * where the queue treated the mock's `{ ok: true }` as a successful write and
 * dropped them. Real sales were being silently swallowed and reported as
 * "Written". A queued row now carries its own destination.
 */
async function postToSheets(body, urlOverride, opts = {}) {
  const simulate = Object.prototype.hasOwnProperty.call(opts, 'simulate')
    ? !!opts.simulate
    : isTestBookId(activeBook);
  if (simulate) {
    return simulatePostToSheets(body);
  }
  const url = urlOverride || sheetsUrl;
  if (!url) throw new Error('No Google Sheet connected');
  const payload = JSON.stringify(body);
  const timeoutMs = opts.timeoutMs || SHEETS_WRITE_TIMEOUT_MS;

  let res;
  try {
    res = await fetchSheetsWithTimeout(url, payload, 'cors', timeoutMs);
  } catch (e) {
    // An abort is a real failure, not a CORS problem: retrying the same slow
    // request opaquely would only hang again, and the caller's retry/backoff is
    // the right place to deal with it.
    if (e && e.name === 'AbortError') {
      throw new Error(`Sheet did not respond within ${Math.round(timeoutMs / 1000)}s`);
    }
    // Nothing came back at all — a blocked request, a dropped connection, a
    // browser that refuses the cross-origin read. Only here is the opaque
    // no-cors path worth trying, and even then the result is 'unknown': sent,
    // but impossible to confirm.
    await fetchSheetsWithTimeout(url, payload, 'no-cors', timeoutMs);
    return 'unknown';
  }

  // A response came back, so we know what happened to this write. Whatever it
  // says is the truth about it, and it must never be re-sent blindly.
  //
  // This used to sit inside the try above, so a *successfully read* rejection —
  // `{ error: 'ReferenceError: ss is not defined' }`, which is what the backend
  // returned for every single row — threw, landed in the no-cors fallback, was
  // POSTed a second time, and came back as 'unknown'. The one thing the sheet
  // had actually told us, the reason it refused the row, was thrown away and
  // replaced with a shrug. Errors are surfaced now.
  if (!res.ok) throw new Error(`Sheet rejected the write (HTTP ${res.status})`);
  const data = await res.json().catch(() => null);
  if (data && data.error) throw new Error(data.error);
  if (data && data.ok) return data;
  return { ok: true };
}

async function notifyPublisherSubmission(kind, data, summary) {
  // Prefer the local Sheet URL (publisher device); fall back to the shared
  // endpoint loaded from cloud settings (artist devices that never set up the
  // Sheet) so the approval email fires no matter who submitted.
  const url = sheetsUrl || notifyUrl;
  if (!url) return;
  try {
    const book = (typeof getBook === 'function') ? getBook() : (BOOKS && BOOKS[activeBook]) || {};
    await postToSheets({
      version: 2,
      action: 'notifyPublisher',
      eventId: 'notify-' + Date.now(),
      payload: {
        action: 'notifyPublisher',
        kind,
        bookId: activeBook,
        bookTitle: book.title || activeBook || '',
        authorEmail: book.authorEmail || '',
        submittedAt: new Date().toISOString(),
        summary: summary || '',
        data
      }
    }, url);
  } catch (e) {
    // Don't fail silently: a misconfigured/stale endpoint means the publisher
    // never learns a submission is waiting. Surface it so it can be fixed.
    console.warn('notifyPublisher failed', e);
    showToast('⚠ Submitted, but could not alert the publisher by email', 'warn', 4000);
  }
}

// Publisher-only: fire a harmless notifyPublisher probe so the whole approval-
// email chain (Web App reachable + MailApp authorised + correct deployment) can
// be confirmed end-to-end without staging a real submission.
async function sendTestNotification() {
  const url = sheetsUrl || notifyUrl;
  if (!url) { showToast('Connect your Google Sheet first', 'warn'); return; }
  const btn = $('test-notify-btn');
  const prev = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
  try {
    const res = await postToSheets({
      version: 2,
      action: 'notifyPublisher',
      eventId: 'notify-test-' + Date.now(),
      payload: {
        action: 'notifyPublisher',
        kind: 'Test Notification',
        bookId: activeBook || '',
        bookTitle: 'Test — please ignore',
        authorEmail: '',
        submittedAt: new Date().toISOString(),
        summary: 'This is a test of the approval-notification email. If it reached your inbox, alerts are working.',
        data: { test: true }
      }
    }, url);
    if (res && res.ok && res.notified) {
      showToast('✓ Test email sent to lyricalmyricalbooks@gmail.com');
    } else {
      // no-cors fallback (res === 'unknown') can't read the response — the POST
      // went out but we can't confirm the send. Tell the user to check.
      showToast('Sent — check lyricalmyricalbooks@gmail.com to confirm', 'warn', 4500);
    }
  } catch (e) {
    showToast('⚠ Test failed: ' + (e.message || 'could not reach the notifier'), 'err', 5000);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = prev; }
  }
}

// Publisher-only: email the book's artist a payment request via the connected
// Apps Script Web App (free Gmail send — no API key in the client). Triggered
// by the "Email artist for payment" button on the per-book dashboard.
async function emailArtistForPayment() {
  if (isAuthor()) { showToast('Publisher only', 'warn'); return; }
  if (!activeBook || activeBook === 'all') { showToast('Open a book first', 'warn'); return; }
  if (!sheetsUrl) { showToast('Connect your Google Sheet first to send email', 'warn'); return; }
  const book = getBook();
  const to = (book.authorEmail || '').trim();
  if (!to) { showToast('No artist email on file for this book', 'warn'); return; }
  if (!confirm(`Send a payment-request email to ${to}?`)) return;
  const title = book.title || activeBook;
  const authorName = book.author || '';
  const currency = book.currency || 'CAD';
  const owedEl = $('d-owed');
  const amountDue = (owedEl && owedEl.textContent && owedEl.textContent !== '—') ? owedEl.textContent.trim() : '';
  const subject = `Payment request — ${title}`;
  const body = [
    `Hi${authorName ? ' ' + authorName : ''},`,
    '',
    `This is a friendly reminder regarding outstanding payments for "${title}".`,
    'When you have a moment, please log in to the inventory app and submit or forward any payments due so the ledger stays up to date.',
    '',
    'Thank you,',
    'Lyricalmyrical Books'
  ].join('\n');
  const btn = $('d-email-artist-btn');
  const prev = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
  try {
    await postToSheets({
      version: 2,
      action: 'emailAuthor',
      eventId: 'emailauthor-' + Date.now(),
      payload: { action: 'emailAuthor', to, authorName, bookId: activeBook, bookTitle: title, subject, body, amountDue, currency }
    });
    showToast('✓ Payment request sent to ' + to);
  } catch (e) {
    console.warn('emailAuthor failed', e);
    showToast('⚠ Could not send email', 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = prev; }
  }
}

// Re-arm the loop for whatever is still at the head of the queue, honouring
// that row's own backoff. Called from a `finally`, so a delivery that throws in
// an unexpected place still leaves the queue draining.
let _sheetsQueueTimer = null;
function _scheduleQueueDrain() {
  const next = _sheetsQueue[0];
  if (!next) return;
  if (_sheetsQueueTimer) clearTimeout(_sheetsQueueTimer);
  const wait = Math.max(250, (next.nextTryAt || 0) - Date.now());
  _sheetsQueueTimer = setTimeout(() => { _sheetsQueueTimer = null; _processQueue(); }, wait);
}

async function _processQueue() {
  if (_sheetsWriting || !_sheetsQueue.length || !navigator.onLine) return;

  const item = _sheetsQueue[0];
  // A row remembers the sheet it was destined for at the moment it was queued.
  // Rows left over from an older build carry no address; they fall back to the
  // real sheet rather than to whatever `sheetsUrl` currently points at, which
  // is the simulator whenever the Test Profile is open.
  const destination = item.url || realSheetsUrl();
  if (!item.simulated && !destination) return;

  // A row still inside its backoff window waits. Delivery used to start
  // immediately whenever anything new was enqueued, so a failing endpoint was
  // hammered at the rate the publisher typed rather than the rate it asked for.
  if (item.nextTryAt && item.nextTryAt > Date.now()) { _scheduleQueueDrain(); return; }

  _sheetsWriting = true;
  try {
    let resp;
    try {
      resp = await postToSheets({
        version: 2,
        eventId: item.id,
        action: item.payload && item.payload.action,
        sentAt: new Date().toISOString(),
        payload: item.payload
      }, destination, {
        simulate: !!item.simulated,
        timeoutMs: item.count > 1 ? SHEETS_BATCH_TIMEOUT_MS : SHEETS_WRITE_TIMEOUT_MS
      });
    } catch (e) {
      _recordSheetsFailure(item, e);
      return;
    }

    const replaced = resp && typeof resp.replaced === 'number' ? resp.replaced : 0;
    const removed = resp && typeof resp.removed === 'number' ? resp.removed : 0;
    const count = item.count || 1;
    let suffix = '';
    if (item.payload && (item.payload.action === 'delete' || item.payload.action === 'void')) {
      suffix = removed ? ` · removed ${removed}` : ' · row not found';
    } else if (replaced > 0) {
      suffix = ` · replaced ${replaced}`;
    }
    // The no-cors fallback returns an opaque response: the POST left the
    // browser, but nothing came back to say the sheet accepted it. Dropping the
    // row here on that basis is how a write that never landed came to be
    // reported as delivered. Retrying is safe — the backend replaces a row by
    // its stable id, so a duplicate send cannot produce a duplicate row — so an
    // unconfirmable write is a failure to retry, not a success to forget.
    if (resp === 'unknown') {
      _recordSheetsFailure(item, new Error('could not confirm the sheet received this row'));
      return;
    }
    addSheetsLog(item.book, item.type, item.summary + suffix, 'ok');
    _sheetsQueue.shift();
    persistSheetsQueue();
    updateBulkProgress(count);
  } finally {
    // Always, on every path. Leaving this set is what silently stopped Sheets
    // syncing for the rest of the session.
    _sheetsWriting = false;
    _scheduleQueueDrain();
  }
}

// Book one failed attempt against the head item, retiring it once it has had
// its full allowance so a single poison row cannot block the queue forever.
function _recordSheetsFailure(item, e) {
  item.attempts = (item.attempts || 0) + 1;
  item.lastError = (e && e.message) || 'network error';
  item.nextTryAt = Date.now() + retryDelayMs(item.attempts);
  if (item.attempts >= MAX_SHEETS_RETRIES) {
    // Say what went wrong, in the log, once. A row that silently disappears is
    // the failure mode this whole engine exists to prevent.
    addSheetsLog(item.book, item.type, `${item.summary} [gave up after ${MAX_SHEETS_RETRIES} tries · ${item.lastError}]`, 'err');
    _sheetsQueue.shift();
    persistSheetsQueue();
    updateBulkProgress(item.count || 1);
    return;
  }
  persistSheetsQueue();
  addSheetsLog(item.book, item.type, item.summary + ` [retry ${item.attempts}/${MAX_SHEETS_RETRIES}]`, 'retry');
}

function sheetPayloadWithBookAccent(payload) {
  if (!payload || payload.bookColor || !payload.book) return payload;
  const book = Object.values(BOOKS || {}).find(b => b && b.title === payload.book);
  return book && book.accent ? { ...payload, bookColor: book.accent } : payload;
}

// The publisher's actual Google Sheet, whichever book is open.
//
// Opening the Test Profile swaps `sheetsUrl` for a mock endpoint and parks the
// real one on `window._realSheetsUrl` (see switchBook). Anything that reads the
// bare global while that profile is open is reading the simulator's address.
function realSheetsUrl() {
  return window._realSheetsUrlSaved ? (window._realSheetsUrl || '') : sheetsUrl;
}

// Where a row queued right now should be delivered, decided once, at enqueue
// time rather than whenever the queue happens to reach it.
//
// Only real records ever get this far — syncToSheets drops test-book rows, and
// nothing seeds the mock spreadsheet through the queue — so a queued row always
// belongs to the real sheet. Resolving the address at delivery time is what let
// a visit to the Test Profile divert real sales into the simulator, where they
// were counted as written and dropped.
function sheetsDestination() {
  return { url: realSheetsUrl(), simulated: false };
}

function syncToSheets(payload) {
  if (!realSheetsUrl() || !payload) return;
  const bookIdent = payload.book || payload.bookId || payload.id;
  if ((bookIdent && isTestBookId(bookIdent)) || (payload.bookObj && isTestBook(payload.bookObj))) {
    return;
  }
  payload = sheetPayloadWithBookAccent(payload);
  // A postage row is not a consignment and a consignment is not a sale. The
  // single order/else ternary this replaced filed every non-order write under a
  // store partner, and summarised postage as "undefined · undefined · ×".
  const typeLabel = sheetLogLabel(payload);
  const summary = sheetLogSummary(payload);
  // Use the record's own sheetsId as the queue id so the backend can match
  // and replace the row; fall back to a fresh id for first-time writes.
  const queueId = payload.sheetsId || makeEventId();
  _sheetsQueue.push({
    id: queueId,
    payload,
    summary,
    book: payload.book,
    type: typeLabel,
    attempts: 0,
    nextTryAt: Date.now(),
    ...sheetsDestination()
  });
  persistSheetsQueue();
  addSheetsLog(payload.book, typeLabel, summary, 'queued');
  _processQueue();
}

function syncBatchToSheets(rows, label = 'Bulk sync') {
  if (!realSheetsUrl() || !Array.isArray(rows) || !rows.length) return;
  const filteredRows = rows.filter(row => {
    if (!row) return false;
    const bId = row.book || row.bookId || row.id;
    if (bId && isTestBookId(bId)) return false;
    if (row.bookObj && isTestBook(row.bookObj)) return false;
    return true;
  });
  if (!filteredRows.length) return;
  // Deliver each batch oldest-first so the sheet reads chronologically even
  // before the backend's own sort runs.
  const rowsWithAccents = sortSheetPayloads(filteredRows.map(row => sheetPayloadWithBookAccent(row)));
  const summary = `${label} · ${rows.length} record${rows.length === 1 ? '' : 's'}`;
  _sheetsQueue.push({
    id: 'batch-' + makeEventId(),
    payload: { action: 'batch', rows: rowsWithAccents },
    summary,
    book: 'All books',
    type: 'Batch',
    count: rows.length,
    attempts: 0,
    nextTryAt: Date.now(),
    ...sheetsDestination()
  });
  persistSheetsQueue();
  addSheetsLog('All books', 'Batch', summary, 'queued');
  _processQueue();
}

let _isBulkSync = false;
let _bulkTotal = 0;
let _bulkDone = 0;
// One batch is one Apps Script execution: it scans every managed tab for
// existing ids, deletes the rows it is replacing, appends the new ones and
// re-sorts. At 200 rows that regularly ran past the point where the browser
// gave up waiting, and the whole queue stalled behind the row that hung.
const SHEETS_BULK_BATCH_SIZE = 60;

// Cache the backend's advertised capabilities for this session so the rebuild
// flow can tell whether the deployed Apps Script understands the 'reset'
// action. An out-of-date backend would otherwise mistake the control message
// for a blank data row, so we only send it when support is confirmed.
let _sheetsCaps = null;
async function fetchSheetsCapabilities() {
  const isTest = isTestBookId(activeBook);
  if (isTest) {
    return { reset: true, batchSync: true };
  }
  if (_sheetsCaps) return _sheetsCaps;
  if (!sheetsUrl) return {};
  try {
    const res = await fetch(sheetsUrl);
    if (res.ok) {
      const data = await res.json().catch(() => null);
      // Only cache a backend that actually advertises capabilities. An older
      // deployment returns none — leave the cache empty so a retry after the
      // user redeploys can detect the new support without a page reload.
      if (data && data.capabilities) { _sheetsCaps = data.capabilities; return _sheetsCaps; }
    }
  } catch (_) { /* offline / CORS — treat as no advertised capabilities */ }
  return {};
}

// Build the Sheets payload for one in-app order (history) entry. Voided entries
// are never turned into rows — they are removed from the sheet instead.
function orderRowPayload(book, nativeCur, h) {
  const totalNative = h.qty * h.price;
  const cadEquiv = cadEquivalentForSale({ nativeCurrency: nativeCur, totalNative, payment: h.payment });
  return {
    type: 'order', book: book.title, date: h.date, num: h.num, chan: h.chan,
    qty: h.qty, price: h.price, total: totalNative, stockAfter: h.after,
    notes: h.notes || '',
    sheetsId: h.sheetsId || '',
    currency: nativeCur,
    paymentCurrency: normalizeCurrencyCode(h.payment?.currency || nativeCur, 'CAD'),
    paymentAmount: h.payment?.amount ?? totalNative,
    paymentRate: h.payment?.rate ?? '',
    convertedTotal: cadEquiv,
    status: 'OK'
  };
}

// Push every live record to Sheets.
//   • rebuild:true  → clear the managed sheets first (removes duplicates, stale
//     VOID rows and blank-CAD legacy rows), then re-add a clean copy. Requires a
//     backend that advertises the 'reset' capability; falls back to in-place.
//   • rebuild:false → in-place upsert by stable id; voided entries are deleted.
async function pushAllToSheets(opts = {}) {
  const { rebuild = false, skipConfirm = false } = opts;
  if (!sheetsUrl) { showToast('Connect Google Sheets first', 'warn'); return; }
  if (!skipConfirm) {
    const msg = rebuild
      ? 'Rebuild the Google Sheet from the app: this clears the current rows, then re-adds every live record so duplicates disappear, CAD equivalents refill, and voided entries drop off. Continue?'
      : 'This will enqueue all live records for all books, then deliver them with retry. Voided entries are removed from the sheet. Continue?';
    if (!(await confirmDialog(msg, { okLabel: 'Continue' }))) return;
  }

  const btn = $('push-all-btn');
  const bar = $('sync-progress-bar');
  const fill = $('sync-progress-fill');
  const stats = $('sync-stats');

  _isBulkSync = true;
  if (btn) { btn.disabled = true; btn.textContent = 'Queueing...'; }
  if (bar) bar.style.display = 'block';
  if (stats) stats.style.display = 'block';
  if (fill) fill.style.width = '0%';

  // A true rebuild needs the backend to clear managed sheets first. Only ask for
  // that when the deployed script advertises support.
  const caps = await fetchSheetsCapabilities();
  const canBatch = !!caps.batchSync;
  let willReset = false;
  if (rebuild) {
    willReset = !!caps.reset;
    if (!willReset) {
      showToast('Redeploy your Apps Script to enable a full rebuild — resyncing in place for now', 'warn', 5000);
    }
  }

  const control = [];
  if (willReset) control.push({ action: 'reset', type: 'control', book: 'Overview' });

  const toSync = [];
  const deletions = [];
  Object.keys(BOOKS).forEach(bid => {
    const book = BOOKS[bid];
    if (isTestBook(book) || isTestBookId(bid)) return;
    const s = states[bid] || defaultState(BOOKS[bid]);
    const nativeCur = normalizeCurrencyCode(getBookCurrencyCode(book), 'CAD');
    (s.hist || []).forEach(h => {
      if (h.consignmentLink) return; // ledger is the canonical row
      if (h.voided) {
        // A reset empties the sheet, so only the in-place path needs an explicit
        // delete to clear a previously-synced row.
        if (!willReset && h.sheetsId) {
          deletions.push({ action: 'delete', type: 'order', book: book.title, sheetsId: h.sheetsId });
          if ((Number(h.shippingPaid || 0) || 0) > 0) deletions.push({ action: 'delete', type: 'shipping', book: book.title, sheetsId: h.sheetsId + '-shipping' });
        }
        return;
      }
      toSync.push(orderRowPayload(book, nativeCur, h));
      if ((Number(h.shippingPaid || 0) || 0) > 0) toSync.push(shippingPurchaseRowPayload(book, nativeCur, h));
    });
    (s.ledger || []).forEach(e => {
      const ledgerCur = normalizeCurrencyCode(book.currency, 'CAD');
      if (e.voided) {
        if (!willReset && e.sheetsId) deletions.push({ action: 'delete', type: 'consignment', book: book.title, sheetsId: e.sheetsId });
        return;
      }
      const totalNative = e.amountDue || 0;
      const cadEquiv = cadEquivalentForSale({ nativeCurrency: ledgerCur, totalNative });
      toSync.push({
        type: 'consignment', book: book.title, date: e.date, store: e.storeName,
        event: e.type, qty: e.qty, rate: e.rate, amountDue: totalNative,
        notes: e.notes || '', status: e.status || 'OK',
        invoiceNum: e.invoiceNum || '',
        sheetsId: e.sheetsId || '',
        currency: ledgerCur,
        convertedTotal: cadEquiv
      });
    });
  });

  const queue = control.concat(deletions, toSync);
  _bulkTotal = queue.length;
  _bulkDone = 0;

  if (_bulkTotal === 0) {
    showToast('No records found to sync', 'warn');
    _isBulkSync = false;
    if (btn) { btn.disabled = false; btn.textContent = 'Sync all data'; }
    if (bar) bar.style.display = 'none';
    if (stats) stats.style.display = 'none';
    return;
  }

  if (stats) stats.textContent = `Queueing ${_bulkTotal} records...`;
  if (canBatch) {
    for (const row of control) syncToSheets(row);
    // Removals first (they clear the rows the additions replace), then the
    // additions oldest-first, so a rebuilt sheet comes back in date order
    // instead of in whichever order the books happened to be iterated.
    const dataRows = deletions.concat(sortSheetPayloads(toSync));
    for (let i = 0; i < dataRows.length; i += SHEETS_BULK_BATCH_SIZE) {
      syncBatchToSheets(dataRows.slice(i, i + SHEETS_BULK_BATCH_SIZE), rebuild ? 'Rebuild batch' : 'Sync batch');
    }
  } else {
    for (const row of control.concat(deletions, sortSheetPayloads(toSync))) syncToSheets(row);
  }
  if (btn) btn.textContent = canBatch ? 'Syncing batches...' : 'Syncing...';
}

function updateBulkProgress(done = 1) {
  if (!_isBulkSync) return;
  _bulkDone += done;
  const pct = Math.min(100, (_bulkDone / _bulkTotal) * 100);
  const fill = $('sync-progress-fill');
  const stats = $('sync-stats');
  const btn = $('push-all-btn');

  if (fill) fill.style.width = pct + '%';
  if (stats) stats.textContent = `Syncing: ${_bulkDone} / ${_bulkTotal} (${Math.round(pct)}%)`;

  if (_bulkDone >= _bulkTotal) {
    _isBulkSync = false;
    if (btn) { btn.disabled = false; btn.textContent = 'Sync all data'; }
    if (stats) stats.textContent = `✓ Queue processed: ${_bulkTotal} records.`;
    showToast(`✓ Sheets queue processed: ${_bulkTotal} records.`);
    setTimeout(() => {
      if (!_isBulkSync) {
        if ($('sync-progress-bar')) $('sync-progress-bar').style.display = 'none';
        if ($('sync-stats')) $('sync-stats').style.display = 'none';
      }
    }, 4000);
  }
}

function addSheetsLog(book, type, summary, status) {
  sheetsLog.unshift({ time: new Date().toLocaleTimeString(), book, type, summary, status });
  if (sheetsLog.length > 120) sheetsLog.pop();
  persistSheetsLog();
  renderSheetsLog();
}
let _syncLogPage = 0;
function renderSheetsLog() {
  const b = $('sheets-log-body');
  if (!b) return;
  if (!sheetsLog.length) {
    b.innerHTML = `
      <tr>
        <td colspan="5" style="padding:0;border:none;">
          <div class="empty-state sheets-empty-state" style="padding:var(--space-6) var(--space-4);text-align:center;">
            <div class="e-icon" aria-hidden="true">📊</div>
            <strong style="font-size:var(--text-base);font-weight:700;color:var(--content-primary);display:block;margin-bottom:var(--space-1);">No Sync Events Logged Yet</strong>
            <p style="font-size:var(--text-xs);color:var(--content-secondary);max-width:400px;margin:0 auto var(--space-3);line-height:var(--leading-snug);">Connect your Google Sheet webhook to synchronize catalog stock, sales orders, and financial ledger events live to your spreadsheet.</p>
            <div style="display:flex;justify-content:center;gap:var(--space-2);flex-wrap:wrap;">
              <button type="button" class="btn sm gold" onclick="testSheets()" style="min-height:var(--target-min);display:inline-flex;align-items:center;gap:6px;" title="Test connection to Google Sheets">
                <span aria-hidden="true">🔄</span>
                <span>Test Webhook Connection</span>
              </button>
            </div>
          </div>
        </td>
      </tr>
    `;
    return;
  }
  const PAGE_SIZE = 15;
  const totalPages = Math.ceil(sheetsLog.length / PAGE_SIZE);
  if (_syncLogPage >= totalPages) _syncLogPage = Math.max(0, totalPages - 1);
  const pageItems = sheetsLog.slice(_syncLogPage * PAGE_SIZE, (_syncLogPage + 1) * PAGE_SIZE);

  const labelFor = (st) => st === 'ok' ? 'Written' : st === 'unknown' ? 'Sent (unverified)' : st === 'queued' ? 'Queued' : st === 'retry' ? 'Retrying' : 'Failed';
  const classFor = (st) => st === 'ok' || st === 'unknown' ? 'ok' : st === 'queued' || st === 'retry' ? 'syncing' : 'err';
  const iconFor = (st) => st === 'ok' ? '✓' : st === 'unknown' ? '~' : st === 'queued' ? '…' : st === 'retry' ? '↻' : '⚠';

  let html = pageItems.map(l => `<tr>
      <td class="sheets-time tnum">${l.time}</td>
      <td class="sheets-book">${l.book}</td>
      <td><span class="sheets-type">${l.type}</span></td>
      <td class="sheets-summary">${l.summary}</td>
      <td>
        <span class="log-status ${classFor(l.status)}"></span>
        <span class="sheets-status ${classFor(l.status)}">${iconFor(l.status)} ${labelFor(l.status)}</span>
      </td>
    </tr>`).join('');

  if (totalPages > 1) {
    html += `<tr><td colspan="5" class="sheets-pager">
      <button class="btn sm" onclick="_syncLogPage=Math.max(0,_syncLogPage-1);renderSheetsLog()" ${_syncLogPage === 0 ? 'disabled' : ''}>← Prev</button>
      <span class="sheets-page-label">Page ${_syncLogPage + 1} of ${totalPages}</span>
      <button class="btn sm" onclick="_syncLogPage=Math.min(${totalPages - 1},_syncLogPage+1);renderSheetsLog()" ${_syncLogPage === totalPages - 1 ? 'disabled' : ''}>Next →</button>
    </td></tr>`;
  }
  b.innerHTML = html;
}
// The Apps Script source (~50 KB) is no longer embedded in index.html — it is
// fetched on demand the first time the "Connect your Google Sheet" tab opens,
// keeping that weight off every page load. Assigned via textContent so the raw
// source needs no HTML-escaping. _gasCodeLoaded guards against re-fetching.
let _gasCodeLoaded = false;
async function loadGasCode() {
  const scriptVerEl = $('gas-script-ver');
  if (scriptVerEl) scriptVerEl.textContent = EXPECTED_SCRIPT_VERSION;
  const scriptVerTagEl = $('gas-script-ver-tag');
  if (scriptVerTagEl) scriptVerTagEl.textContent = EXPECTED_SCRIPT_VERSION;
  const expectedEl = $('sheets-expected-version');
  if (expectedEl) expectedEl.textContent = EXPECTED_SCRIPT_VERSION;
  if (_gasCodeLoaded) return;
  const el = $('gas-code'); if (!el) return;
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}gas-code.txt?v=${encodeURIComponent(EXPECTED_SCRIPT_VERSION)}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    el.textContent = await res.text();
    _gasCodeLoaded = true;
  } catch (e) {
    el.textContent = 'Could not load the backend code. Check your connection and reopen this tab.';
    console.warn('[gas-code] load failed', e);
  }
}
function copyGasCode() {
  const el = $('gas-code');
  const text = el ? el.textContent : '';
  if (!_gasCodeLoaded || !text) { showToast('Code still loading — try again in a moment', 'warn'); return; }
  navigator.clipboard.writeText(text).then(() => {
    showToast('✓ Code copied to clipboard!');
    const btn = $('copy-gas-code-btn');
    if (btn) {
      const origHtml = btn.innerHTML;
      btn.innerHTML = '<span class="copy-gas-btn-icon" aria-hidden="true">✓</span><span class="copy-gas-btn-label">Copied!</span>';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.innerHTML = origHtml;
        btn.classList.remove('copied');
      }, 2000);
    }
  }).catch((err) => {
    console.error('[gas-code] copy failed', err);
    showToast('Failed to copy to clipboard', 'err');
  });
}
async function verifyUrl() {
  if (!sheetsUrl) return;
  const btn = $('verify-url-btn');
  if (btn) { btn.textContent = 'Verifying...'; btn.disabled = true; }

  try {
    // Try a GET request first to see if the endpoint is alive
    const res = await fetch(sheetsUrl);
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data.service === 'string' && data.service.indexOf('lyrical-sheets-webhook') === 0) {
        showToast(`✓ Connection verified: ${data.sheetName || 'Active'}`);
        addSheetsLog('System', 'Verify', 'Handshake successful', 'ok');

        // Version Check
        const deployedVer = data.scriptVersion || 'unknown';
        const warningEl = $('sheets-version-warning');
        const versionEl = $('sheets-deployed-version');
        if (warningEl) {
          if (deployedVer !== EXPECTED_SCRIPT_VERSION) {
            if (versionEl) versionEl.textContent = deployedVer;
            warningEl.style.display = 'block';
          } else {
            warningEl.style.display = 'none';
          }
        }
      } else {
        showToast('⚠ Unexpected response from URL', 'warn');
      }
    } else {
      // If GET fails but URL looks right, it might be a POST-only deployment or CORS
      showToast('Queuing test row (GET unverified)', 'warn');
    }
  } catch (e) {
    showToast('Queuing test row (Network check failed)', 'warn');
  }

  syncToSheets({
    type: 'order', book: 'Test', date: today(), num: 'VERIFY-' + Date.now().toString().slice(-4),
    chan: 'Verify URL', qty: 0, price: 0, total: 0, stockAfter: 0, notes: 'Verify URL button test'
  });

  setTimeout(() => { if (btn) { btn.textContent = '↗ Verify URL'; btn.disabled = false; } }, 1000);
}

export {
  _processQueue,
  _sheetsQueue,
  addSheetsLog,
  backfillAndResync,
  backfillSheetsIds,
  copyGasCode,
  emailArtistForPayment,
  fetchSheetsCapabilities,
  loadGasCode,
  makeEventId,
  notifyPublisherSubmission,
  orderRowPayload,
  persistSheetsLog,
  persistSheetsQueue,
  postToSheets,
  pushAllToSheets,
  renderSheetsLog,
  retryDelayMs,
  sendTestNotification,
  sheetPayloadWithBookAccent,
  syncBatchToSheets,
  syncToSheets,
  testSheets,
  updateBulkProgress,
  verifyUrl,
};
