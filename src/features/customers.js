// Customers — the Customers tab: the de-duplicated buyer list and its filters,
// the opt-out (suppression) list, the curated mailing list, and in-app email
// campaigns (drafts, test sends, the paced send loop and its retry list).
//
// Lifted out of src/main.js as one unit. Everything it needs from the app is
// imported explicitly below. main.js and this module import from each other
// (as do this module and features/opencall.js); that cycle is fine because
// nothing here reads an imported name at module-evaluation time — the
// top-level statements are constants, empty state and one window assignment,
// and every other export is a hoisted function declaration called later, from
// a click handler or from main.js after start-up.
//
// MAILING_LIST and _customerSuppress are exported as live bindings for the
// backup writer in main.js to read. An importer cannot reassign them, so the
// backup restore goes through _setMailingList / _setCustomerSuppress instead.
//
// eslint's no-undef (an error, checked in CI) is what keeps the import list
// honest: an identifier that isn't imported fails the build rather than
// throwing at click time.
import {
  $,
  BOOKS,
  BOOK_LIST,
  codeToSymbol,
  fetchStripePaymentsForReconcile,
  getAllAppliedIds,
  getReconStripeKey,
  orders,
  renderCustomersStat,
  sheetsUrl,
  showToast,
  states,
  today,
} from '../main.js';
import { parseMarkdownToHtml, renderOpenCall } from './opencall.js';
import { confirmDialog } from '../lib/modal.js';
import { escapeHtml } from '../lib/html.js';
import { toCsv } from '../lib/csv.js';
import { downloadCsv } from '../lib/download.js';
import { fmtD, getBookCurrencyCode, normalizeCurrencyCode } from '../lib/money.js';
import { describeCustomerFilters, joinFilterLabels } from '../lib/customer-segment.js';

// ── CUSTOMERS / MAILING LIST ────────────────────────────────────────────────
// Aggregates every buyer we can identify into one de-duplicated contact list
// keyed by email. Local order history + scanned-but-unapplied website orders
// work fully offline; a one-tap Stripe pull enriches the list with card buyers
// who may never have been reconciled by hand. Spend is best-effort (kept per
// currency, never mixed) — the Tax Centre remains the source of truth for money.
const CUSTOMER_STRIPE_KEY = 'lm-customer-stripe';
const CUSTOMER_SUPPRESS_KEY = 'lm-customer-suppress';
let _customerFilter = '';
let _customerBookFilter = '';      // bookId to segment by; '' = all books
let _customerSuppress = new Set(); // lowercased emails opted out of mailing
let _customerStripeDepth = 5;      // Stripe pull depth, in pages of 100
let _customerStripeMaybeMore = false;

// Opt-out (suppression) list — Firestore-backed so an unsubscribe on one device
// is honoured everywhere, with a localStorage fallback so it still works offline.
function _isCustomerSuppressed(email) { return _customerSuppress.has(_custEmailKey(email)); }
async function loadCustomerSuppression() {
  try {
    const stored = await window._fbLoadSettings('customerSuppress');
    if (stored && Array.isArray(stored.emails)) { _customerSuppress = new Set(stored.emails.map(_custEmailKey)); return; }
  } catch (_) { }
  try {
    const local = JSON.parse(localStorage.getItem(CUSTOMER_SUPPRESS_KEY) || '[]');
    if (Array.isArray(local)) _customerSuppress = new Set(local.map(_custEmailKey));
  } catch (_) { }
}
async function _persistCustomerSuppression() {
  const emails = Array.from(_customerSuppress);
  await window._fbSaveSettings('customerSuppress', { emails });
  try { localStorage.setItem(CUSTOMER_SUPPRESS_KEY, JSON.stringify(emails)); } catch (_) { }
}
async function toggleCustomerSuppress(encEmail) {
  const key = _custEmailKey(decodeURIComponent(encEmail));
  if (!key) return;
  if (_customerSuppress.has(key)) _customerSuppress.delete(key); else _customerSuppress.add(key);
  renderCustomers(); renderOpenCall();
  await _persistCustomerSuppression();
}
function setCustomerBookFilter(v) { _customerBookFilter = v || ''; renderCustomers(); }

// ── Curated mailing list ─────────────────────────────────────────────────────
// A persistent, editable subscriber list (Firestore-backed) layered on top of
// the auto-discovered buyers: add anyone by hand, bulk-add the buyers we found,
// or flip on auto-add so new buyers join by themselves. Copy / Export / Email
// here always act on this curated list, minus anyone who has unsubscribed.
const MAILING_LIST_KEY = 'lm-mailing-list';
let MAILING_LIST = { subs: {}, autoAdd: false };

function mailingSubsArray() {
  // ⚡ Bolt Optimization: Use string comparison instead of localeCompare for sorting ISO "YYYY-MM-DD" dates
  return Object.values(MAILING_LIST.subs || {}).sort((a, b) => {
    const dA = a.added || '';
    const dB = b.added || '';
    return dA > dB ? -1 : (dA < dB ? 1 : 0);
  });
}
function mailingListHas(email) { return !!MAILING_LIST.subs[_custEmailKey(email)]; }

async function loadMailingList() {
  let data = null;
  data = await window._fbLoadSettings('mailingList');
  if (!data) { try { data = JSON.parse(localStorage.getItem(MAILING_LIST_KEY) || 'null'); } catch (_) { } }
  if (data && typeof data === 'object') {
    MAILING_LIST = { subs: (data.subs && typeof data.subs === 'object') ? data.subs : {}, autoAdd: !!data.autoAdd };
  }
}
async function _persistMailingList() {
  await window._fbSaveSettings('mailingList', MAILING_LIST);
  try { localStorage.setItem(MAILING_LIST_KEY, JSON.stringify(MAILING_LIST)); } catch (_) { }
}

// Upsert one subscriber. Returns true only when a brand-new entry is created.
function _mailingUpsert(email, name, source) {
  const key = _custEmailKey(email);
  if (!key) return false;
  const existing = MAILING_LIST.subs[key];
  if (existing) {
    if (name && name.length > (existing.name || '').length) existing.name = name;
    return false;
  }
  MAILING_LIST.subs[key] = { email: String(email).trim(), name: String(name || '').trim(), source: source || 'Manual', added: today() };
  return true;
}

async function addManualSubscriber() {
  const nameEl = $('ml-add-name'), emailEl = $('ml-add-email');
  const email = (emailEl?.value || '').trim();
  const name = (nameEl?.value || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { showToast('Enter a valid email address', 'warn'); return; }
  if (_isCustomerSuppressed(email)) { showToast('That address has unsubscribed — re-subscribe it first', 'warn'); return; }
  const isNew = _mailingUpsert(email, name, 'Manual');
  if (emailEl) emailEl.value = '';
  if (nameEl) nameEl.value = '';
  await _persistMailingList();
  renderMailingList(); renderCustomers(); renderOpenCall();
  showToast(isNew ? '✓ Added to mailing list' : 'Already on the list — name updated');
}

async function addBuyerToMailingList(encEmail) {
  const email = decodeURIComponent(encEmail);
  if (_isCustomerSuppressed(email)) { showToast('That buyer has unsubscribed', 'warn'); return; }
  const rec = buildCustomerList().find(r => _custEmailKey(r.email) === _custEmailKey(email));
  const isNew = _mailingUpsert(email, rec?.name || '', 'Buyer');
  if (isNew) await _persistMailingList();
  renderMailingList(); renderCustomers(); renderOpenCall();
  showToast(isNew ? '✓ Added to mailing list' : 'Already on your list');
}

async function removeFromMailingList(encEmail) {
  const key = _custEmailKey(decodeURIComponent(encEmail));
  if (!MAILING_LIST.subs[key]) return;
  delete MAILING_LIST.subs[key];
  await _persistMailingList();
  renderMailingList(); renderCustomers(); renderOpenCall();
}

// Merge every non-suppressed discovered buyer into the list. Returns count added.
function _mailingMergeBuyers(list) {
  let added = 0;
  (list || buildCustomerList()).forEach(r => {
    if (_isCustomerSuppressed(r.email)) return;
    if (_mailingUpsert(r.email, r.name, 'Buyer')) added++;
  });
  return added;
}

async function addAllBuyersToMailingList() {
  const added = _mailingMergeBuyers();
  if (added) await _persistMailingList();
  renderMailingList(); renderCustomers(); renderOpenCall();
  showToast(added ? `✓ Added ${added} buyer${added === 1 ? '' : 's'} to your mailing list` : 'All buyers are already on your list');
}

function exportMailingListCsv() {
  const subscribers = (MAILING_LIST && MAILING_LIST.subscribers) || [];
  if (!subscribers.length) {
    showToast('Mailing list is empty', 'warn');
    return;
  }
  const headers = ['Name', 'Email', 'Source', 'Added'];
  const rows = subscribers.map(sub => [
    `"${(sub.name || '').replace(/"/g, '""')}"`,
    `"${(sub.email || '').replace(/"/g, '""')}"`,
    `"${(sub.source || 'Manual').replace(/"/g, '""')}"`,
    `"${(sub.addedAt || '').replace(/"/g, '""')}"`
  ]);
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mailing-list-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`✓ Exported ${subscribers.length} subscribers to CSV`);
}

async function toggleMailingAutoAdd(cb) {
  MAILING_LIST.autoAdd = !!(cb && cb.checked);
  let added = 0;
  if (MAILING_LIST.autoAdd) added = _mailingMergeBuyers();
  await _persistMailingList();
  renderMailingList(); renderCustomers(); renderOpenCall();
  showToast(MAILING_LIST.autoAdd
    ? `Auto-add on — new buyers join automatically${added ? ` (added ${added} now)` : ''}`
    : 'Auto-add off');
}

// When auto-add is on, fold any newly discovered buyers in (persist only if changed).
function _mailingAutoSync(list) {
  if (!MAILING_LIST.autoAdd) return;
  if (_mailingMergeBuyers(list) > 0) _persistMailingList();
}

function renderMailingList() {
  const body = $('ml-body');
  if (!body) return;
  const cb = $('ml-autoadd');
  if (cb) cb.checked = !!MAILING_LIST.autoAdd;
  const subs = mailingSubsArray();
  // Use imperative counting to eliminate array allocation and reduce GC pressure
  let unsub = 0;
  for (const s of subs) {
    if (_isCustomerSuppressed(s.email)) unsub++;
  }
  const countEl = $('ml-count');
  if (countEl) countEl.textContent = `${subs.length} subscriber${subs.length === 1 ? '' : 's'}` + (unsub ? ` · ${unsub} unsubscribed (excluded from sends)` : '');
  body.innerHTML = subs.length
    ? subs.map(s => {
      const sup = _isCustomerSuppressed(s.email);
      const emailCell = sup
        ? `<span style="text-decoration:line-through;color:var(--text3);">${escapeHtml(s.email)}</span> <span class="pill gray" style="font-size:var(--text-2xs);">unsubscribed</span>`
        : `<a href="mailto:${escapeHtml(s.email)}" style="color:var(--gold2);">${escapeHtml(s.email)}</a>`;
      return `<tr${sup ? ' style="opacity:.55;"' : ''}>
          <td class="lead-cell">${escapeHtml(s.name) || '<span style="color:var(--text4);/* faint-ok: em-dash placeholder */">—</span>'}</td>
          <td>${emailCell}</td>
          <td class="date-cell">${s.added ? fmtD(s.added) : '—'}</td>
          <td><span class="pill gray" style="font-size:var(--text-2xs);">${escapeHtml(s.source || 'Manual')}</span></td>
          <td><button class="btn sm cust-action-btn" onclick="removeFromMailingList('${encodeURIComponent(s.email)}')" title="Remove from mailing list">Remove</button></td>
        </tr>`;
    }).join('')
    : `<tr class="sys-empty-row"><td colspan="5">
        <div class="empty-state sys-empty" style="padding: 2.5rem 1.5rem;">
          <div class="e-icon" aria-hidden="true">✉️</div>
          <strong>Your mailing list is empty</strong>
          <span>Start building your reader list by adding subscribers manually above, or automatically populate it with every customer discovered across your sales channels.</span>
          <div class="sys-empty-actions" style="margin-top: 1rem; display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
            <button class="btn gold lg" onclick="addAllBuyersToMailingList()">↓ Add all discovered buyers</button>
            <button class="btn lg" onclick="focusMailingListAdd()">＋ Add manually</button>
          </div>
        </div>
      </td></tr>`;
}

function focusMailingListAdd() {
  const el = $('ml-add-email') || $('ml-add-name');
  if (el) {
    el.focus();
    if (typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
}

// Email / copy helpers shared by the derived segment and the curated list.
function _uniqueMailable(records) {
  // ⚡ Bolt Optimization: Loop Fusion
  // Combined .filter() and .map() into a single pass to eliminate intermediate array allocations
  const emails = new Set();
  for (const r of records) {
    if (!_isCustomerSuppressed(r.email)) {
      emails.add(r.email);
    }
  }
  return Array.from(emails);
}
// Open Gmail's web compose with the addresses pre-filled as BCC. Chunks past a
// safe URL length so a big list opens what it can and copies the rest.
function _openGmailBcc(emails, label) {
  if (!emails.length) { showToast(`No mailable addresses${label ? ' (' + label + ')' : ''}`, 'warn'); return; }
  const BUDGET = 1600;
  const chunks = []; let cur = [];
  emails.forEach(e => {
    if (cur.length && encodeURIComponent([...cur, e].join(',')).length > BUDGET) { chunks.push(cur); cur = []; }
    cur.push(e);
  });
  if (cur.length) chunks.push(cur);
  window.open('https://mail.google.com/mail/?view=cm&fs=1&bcc=' + encodeURIComponent(chunks[0].join(',')), '_blank', 'noopener');
  if (chunks.length > 1) {
    _custFallbackCopy(emails.join(', '));
    showToast(`Opened Gmail with ${chunks[0].length} of ${emails.length}. Full list copied — send in batches (Gmail caps recipients per email).`, 'warn');
  } else {
    showToast(`Opened Gmail · ${emails.length} recipient${emails.length === 1 ? '' : 's'} in BCC`);
  }
}
function emailCustomerSegment() { _openGmailBcc(_uniqueMailable(_custApplyFilter(buildCustomerList())), 'current segment'); }
function emailMailingList() { _openGmailBcc(_uniqueMailable(mailingSubsArray()), 'mailing list'); }
function copyMailingListEmails() {
  const emails = _uniqueMailable(mailingSubsArray());
  if (!emails.length) { showToast('No mailable emails on your list', 'warn'); return; }
  const done = () => showToast(`✓ Copied ${emails.length} email${emails.length === 1 ? '' : 's'}`);
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(emails.join(', ')).then(done).catch(() => { _custFallbackCopy(emails.join(', ')); done(); });
  else { _custFallbackCopy(emails.join(', ')); done(); }
}
function exportMailingListCSV() {
  const subs = mailingSubsArray().filter(s => !_isCustomerSuppressed(s.email));
  if (!subs.length) { showToast('No mailable subscribers to export', 'warn'); return; }
  const rows = [['Name', 'Email', 'Source', 'Added']];
  subs.forEach(s => rows.push([s.name || '', s.email, s.source || '', s.added || '']));
  downloadCsv(toCsv(rows), `lyrical-mailing-list-${today()}.csv`);
  showToast(`✓ Exported ${subs.length} subscriber${subs.length === 1 ? '' : 's'}`);
}

function _loadCustomerStripeCache() {
  try { return JSON.parse(localStorage.getItem(CUSTOMER_STRIPE_KEY) || '[]'); }
  catch (_) { return []; }
}
function _saveCustomerStripeCache(rows) {
  try { localStorage.setItem(CUSTOMER_STRIPE_KEY, JSON.stringify(rows || [])); } catch (_) { }
}

// Stable dedup key for a buyer — lowercased, trimmed email.
function _custEmailKey(email) { return String(email || '').trim().toLowerCase(); }

function _custUpsert(map, email, name) {
  const key = _custEmailKey(email);
  if (!key) return null;
  let rec = map.get(key);
  if (!rec) {
    rec = {
      email: String(email).trim(), name: '', orders: 0, units: 0,
      books: new Set(), bookIds: new Set(), channels: new Set(), sources: new Set(),
      spend: {}, first: '', last: ''
    };
    map.set(key, rec);
  }
  const nm = String(name || '').trim();
  if (nm && nm.length > rec.name.length) rec.name = nm; // keep the fullest name seen
  return rec;
}
function _custAddSpend(rec, cur, amt) {
  const c = normalizeCurrencyCode(cur || '', '') || String(cur || '').toUpperCase();
  const n = Number(amt);
  if (!c || !isFinite(n) || n === 0) return;
  rec.spend[c] = (rec.spend[c] || 0) + n;
}
function _custTouchDate(rec, date) {
  const d = String(date || '').slice(0, 10);
  if (!d) return;
  if (!rec.first || d < rec.first) rec.first = d;
  if (!rec.last || d > rec.last) rec.last = d;
}

// Build the de-duplicated buyer list from every available source.
function buildCustomerList() {
  const map = new Map();
  let noEmail = 0;

  // 1) Order history across every book (authoritative, works offline).
  Object.keys(states).forEach(bid => {
    const bk = BOOKS[bid];
    const bookCur = bk ? normalizeCurrencyCode(getBookCurrencyCode(bk), 'CAD') : 'CAD';
    const bookTitle = bk?.title || bid;
    (states[bid].hist || []).forEach(h => {
      if (h.voided || h.gratuity || h.chan === 'Gratuity') return;
      const email = h.shipEmail || h.email || '';
      if (!_custEmailKey(email)) { noEmail++; return; }
      const rec = _custUpsert(map, email, h.shipName || h.customer || '');
      rec.orders++;
      rec.units += Number(h.qty) || 0;
      rec.books.add(bookTitle);
      rec.bookIds.add(bid);
      if (h.chan) rec.channels.add(h.chan);
      const isStripe = typeof h.sheetsId === 'string' && h.sheetsId.startsWith('stripe-');
      rec.sources.add(isStripe ? 'Stripe' : (h.chan === 'Website' ? 'Website' : (h.chan || 'Order')));
      const payCur = h.payment?.currency ? normalizeCurrencyCode(h.payment.currency, bookCur) : bookCur;
      const payAmt = h.payment?.amount != null ? h.payment.amount : (Number(h.qty) || 0) * (Number(h.price) || 0);
      _custAddSpend(rec, payCur, payAmt);
      _custTouchDate(rec, h.date);
    });
  });

  // 2) Scanned website orders not yet applied — still real buyers. Skip any
  //    whose order number is already in history to avoid double-counting.
  const applied = (typeof getAllAppliedIds === 'function') ? getAllAppliedIds() : new Set();
  (typeof orders !== 'undefined' ? orders : []).forEach(o => {
    if (!_custEmailKey(o.email)) return;
    if (applied.has(o.orderNum) || applied.has(o.id)) return;
    const rec = _custUpsert(map, o.email, o.customer || o.shipName || '');
    rec.orders++;
    rec.units += Number(o.qty) || 0;
    const bk = o.bookId && BOOKS[o.bookId] ? BOOKS[o.bookId] : null;
    if (bk) {
      rec.books.add(bk.title);
      rec.bookIds.add(o.bookId);
      _custAddSpend(rec, normalizeCurrencyCode(getBookCurrencyCode(bk), 'CAD'), (Number(o.qty) || 0) * (Number(o.price) || bk.listPrice || 0));
    }
    rec.channels.add('Website');
    rec.sources.add('Website');
    _custTouchDate(rec, o.date);
  });

  // 3) Stripe pull cache — discover/enrich card buyers. Only add counts + spend
  //    for buyers we don't already know locally, so payments already reconciled
  //    into history aren't double-counted.
  _loadCustomerStripeCache().forEach(p => {
    if (p.refunded || !_custEmailKey(p.email)) return;
    const existed = map.has(_custEmailKey(p.email));
    const rec = _custUpsert(map, p.email, p.customer || '');
    rec.sources.add('Stripe');
    _custTouchDate(rec, p.date);
    if (!existed) {
      rec.orders++;
      _custAddSpend(rec, p.currency, p.amount);
    }
  });

  const list = Array.from(map.values());
  // ⚡ Bolt Optimization: Use string comparison instead of localeCompare for sorting ISO "YYYY-MM-DD" dates
  list.sort((a, b) => {
    const dA = a.last || '';
    const dB = b.last || '';
    return dA > dB ? -1 : (dA < dB ? 1 : 0);
  }); // most recent first
  list._noEmail = noEmail;
  return list;
}

function _custSpendStr(spend) {
  return Object.keys(spend).sort().map(c => {
    const sym = (typeof codeToSymbol === 'function' ? codeToSymbol(c) : '') || (c + ' ');
    return `${sym}${spend[c].toFixed(2)}`;
  }).join(' · ');
}

function _custApplyFilter(list) {
  let out = list;
  if (_customerBookFilter) out = out.filter(r => r.bookIds.has(_customerBookFilter));
  if (_customerChannelFilter) {
    out = out.filter(r => {
      if (_customerChannelFilter === 'Stripe') return r.sources.has('Stripe');
      return r.channels.has(_customerChannelFilter);
    });
  }
  if (_customerSpendFilter) {
    const min = Number(_customerSpendFilter);
    out = out.filter(r => {
      let sum = 0;
      Object.keys(r.spend || {}).forEach(c => {
        const amt = r.spend[c] || 0;
        if (c === 'USD') sum += amt * 1.35;
        else if (c === 'EUR') sum += amt * 1.48;
        else if (c === 'GBP') sum += amt * 1.75;
        else sum += amt;
      });
      return sum >= min;
    });
  }
  if (_customerOrdersFilter === 'repeat') {
    out = out.filter(r => r.orders >= 2);
  } else if (_customerOrdersFilter === 'single') {
    out = out.filter(r => r.orders === 1);
  }
  const q = _customerFilter.trim().toLowerCase();
  if (q) out = out.filter(r => (r.name || '').toLowerCase().includes(q) || (r.email || '').toLowerCase().includes(q));
  return out;
}

// The mailing-safe slice: what's on screen, minus anyone who has opted out.
function _custMailable(all) {
  return _custApplyFilter(all).filter(r => !_isCustomerSuppressed(r.email));
}

function _custSyncBookFilterOptions() {
  const sel = $('cust-book-filter');
  if (!sel) return;
  const want = '<option value="">All books</option>' +
    BOOK_LIST.map(b => `<option value="${escapeHtml(b.id)}">${escapeHtml(b.title)}</option>`).join('');
  if (sel.dataset.sig !== want) { sel.innerHTML = want; sel.dataset.sig = want; }
  sel.value = _customerBookFilter;
}

// ── Advanced Customer Filters state and setters
let _customerChannelFilter = '';
let _customerSpendFilter = '';
let _customerOrdersFilter = '';

function setCustomerChannelFilter(v) { _customerChannelFilter = v || ''; renderCustomers(); }
function setCustomerSpendFilter(v) { _customerSpendFilter = v || ''; renderCustomers(); }
function setCustomerOrdersFilter(v) { _customerOrdersFilter = v || ''; renderCustomers(); }

// The five filters as one object, so the chip row, the empty state and the
// "any filter on?" check all read the same shape instead of each repeating the
// same five-way OR. Read-only snapshot — the module-level lets stay the truth.
function _custFilterState() {
  return {
    search: _customerFilter,
    bookId: _customerBookFilter,
    channel: _customerChannelFilter,
    spend: _customerSpendFilter,
    orders: _customerOrdersFilter,
  };
}

// Active filters, already phrased for a human. BOOK_LIST is the catalogue the
// book <select> was populated from, so the chip shows the title the owner
// picked rather than the id stored behind it.
function _custActiveFilters() {
  return describeCustomerFilters(_custFilterState(), {
    bookTitle: (id) => (BOOK_LIST.find(b => b.id === id) || {}).title || '',
  });
}

// Drop one filter by the id describeCustomerFilters() stamped on its chip.
function clearCustomerFilter(id) {
  if (id === 'search') {
    _customerFilter = '';
    const box = $('cust-search');
    if (box) box.value = '';
  } else if (id === 'book') { _customerBookFilter = ''; }
  else if (id === 'channel') { _customerChannelFilter = ''; }
  else if (id === 'spend') { _customerSpendFilter = ''; }
  else if (id === 'orders') { _customerOrdersFilter = ''; }
  else { return; }
  renderCustomers();
}

// Back to everyone. The selects are re-synced from state by the renderer, but
// the search box is an uncontrolled input, so it has to be cleared by hand.
function clearCustomerFilters() {
  _customerFilter = '';
  _customerBookFilter = '';
  _customerChannelFilter = '';
  _customerSpendFilter = '';
  _customerOrdersFilter = '';
  const box = $('cust-search');
  if (box) box.value = '';
  renderCustomers();
}

/**
 * The strip between the filter panel and the segment actions. It exists to
 * answer one question before the owner presses Copy / Export / Email: who is
 * actually in this segment right now? Hidden entirely when nothing is
 * filtered — an always-on bar saying "no filters" is noise that trains people
 * to stop reading it.
 */
function _renderCustFilterBar(shown, total, activeFilters) {
  const bar = $('cust-active-filters');
  if (!bar) return;
  const active = Array.isArray(activeFilters) ? activeFilters : _custActiveFilters();
  if (!active.length) {
    bar.hidden = true;
    bar.innerHTML = '';
    return;
  }
  const chips = active.map(f => {
    const safe = escapeHtml(f.label);
    return `<span class="pile-chip is-filter">${safe}<button type="button" class="pile-chip-x" `
      + `aria-label="Remove filter ${safe}" title="Remove this filter" `
      + `onclick="clearCustomerFilter('${escapeHtml(f.id)}')">✕</button></span>`;
  }).join('');
  const n = Number(shown) || 0;
  const all = Number(total) || 0;
  bar.hidden = false;
  bar.innerHTML = `
    <span class="seg-filter-lead">
      <span class="seg-filter-icon" aria-hidden="true">⌕</span>
      Copy, export and email will reach
      <strong class="mono-num">${n}</strong> of <strong class="mono-num">${all}</strong>
      buyer${all === 1 ? '' : 's'}
    </span>
    <span class="seg-filter-chips">${chips}</span>
    <button type="button" class="btn sm" onclick="clearCustomerFilters()">✕ Clear all filters</button>`;
}

// ── Email Typo Correction
let _lastMailingCorrection = '';

function checkMailingEmailTypo(val) {
  const suggestEl = $('ml-add-email-correction');
  if (!suggestEl) return;
  const correction = suggestEmailTypo(val);
  if (correction) {
    _lastMailingCorrection = correction;
    suggestEl.style.display = 'inline-block';
    suggestEl.className = 'email-suggest-correction';
    suggestEl.innerHTML = `Did you mean <strong style="text-decoration:underline;">${escapeHtml(correction)}</strong>?`;
  } else {
    _lastMailingCorrection = '';
    suggestEl.style.display = 'none';
  }
}

function suggestEmailTypo(email) {
  const m = email.trim().toLowerCase().match(/^([^@]+)@([^@]+)$/);
  if (!m) return null;
  const user = m[1];
  const domain = m[2];
  const common = {
    'gamil.com': 'gmail.com', 'gmail.co': 'gmail.com', 'gmail.con': 'gmail.com', 'gmail.cm': 'gmail.com',
    'yahoo.co': 'yahoo.com', 'yahoo.cm': 'yahoo.com',
    'hotmail.co': 'hotmail.com', 'hotmail.cm': 'hotmail.com',
    'outlook.co': 'outlook.com', 'outlook.cm': 'outlook.com'
  };
  if (common[domain]) return user + '@' + common[domain];
  return null;
}

function applyMailingEmailCorrection() {
  const emailEl = $('ml-add-email');
  if (emailEl && _lastMailingCorrection) {
    emailEl.value = _lastMailingCorrection;
    _lastMailingCorrection = '';
    const suggestEl = $('ml-add-email-correction');
    if (suggestEl) suggestEl.style.display = 'none';
    showToast('Email corrected!');
  }
}

// ── In-App Email Campaigns (Newsletters)
const CAMPAIGNS_KEY = 'lm-campaigns';
let CAMPAIGNS = [];
let activeCustomersSubTab = 'audience';

async function loadCampaigns() {
  let data = null;
  data = await window._fbLoadSettings('campaigns');
  if (!data) { try { data = JSON.parse(localStorage.getItem(CAMPAIGNS_KEY) || '[]'); } catch (_) { } }
  if (Array.isArray(data)) {
    CAMPAIGNS = data;
  } else {
    CAMPAIGNS = [];
  }
}

async function _persistCampaigns() {
  await window._fbSaveSettings('campaigns', CAMPAIGNS);
  try { localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(CAMPAIGNS)); } catch (_) { }
}

function switchCustomersSubTab(subTabName) {
  activeCustomersSubTab = subTabName;
  const subTabs = ['audience', 'mailing', 'campaign'];
  subTabs.forEach(tab => {
    const btn = document.getElementById('btn-custtab-' + tab);
    const sec = document.getElementById('cust-sec-' + tab);
    if (btn && sec) {
      if (tab === subTabName) {
        btn.classList.add('active');
        sec.style.display = 'block';
      } else {
        btn.classList.remove('active');
        sec.style.display = 'none';
      }
    }
  });

  if (subTabName === 'audience') {
    renderCustomersAudience();
  } else if (subTabName === 'mailing') {
    renderMailingList();
  } else if (subTabName === 'campaign') {
    renderCampaigns();
  }
}

function renderCustomers() {
  switchCustomersSubTab(activeCustomersSubTab);
}

function renderCustomersAudience() {
  const body = $('cust-body');
  if (!body) return;
  _custSyncBookFilterOptions();

  const chanSel = $('cust-channel-filter');
  if (chanSel) chanSel.value = _customerChannelFilter;
  const spendSel = $('cust-spend-filter');
  if (spendSel) spendSel.value = _customerSpendFilter;
  const ordersSel = $('cust-orders-filter');
  if (ordersSel) ordersSel.value = _customerOrdersFilter;

  const all = buildCustomerList();
  renderCustomersStat(all);
  _mailingAutoSync(all);
  const list = _custApplyFilter(all);
  // Use imperative counting to eliminate array allocation and reduce GC pressure
  let suppressedShown = 0;
  for (const r of list) {
    if (_isCustomerSuppressed(r.email)) suppressedShown++;
  }

  const activeFilters = _custActiveFilters();
  _renderCustFilterBar(list.length, all.length, activeFilters);

  const summary = $('cust-summary');
  if (summary) {
    const srcSet = new Set();
    all.forEach(r => r.sources.forEach(s => srcSet.add(s)));
    const srcStr = Array.from(srcSet).sort().join(', ') || '—';
    const filtered = activeFilters.length;
    summary.textContent = `${all.length} customer${all.length === 1 ? '' : 's'} with email`
      + (filtered ? ` · ${list.length} shown` : '')
      + (suppressedShown ? ` · ${suppressedShown} unsubscribed (excluded from export)` : '')
      + (all._noEmail ? ` · ${all._noEmail} order${all._noEmail === 1 ? '' : 's'} had no email` : '')
      + ` · from ${srcStr}`;
  }

  body.innerHTML = list.length
    ? list.map(r => {
      const sup = _isCustomerSuppressed(r.email);
      const emailCell = sup
        ? `<span style="text-decoration:line-through;color:var(--text3);">${escapeHtml(r.email)}</span> <span class="pill gray" style="font-size:var(--text-2xs);">unsubscribed</span>`
        : `<a href="mailto:${escapeHtml(r.email)}" style="color:var(--gold2);">${escapeHtml(r.email)}</a>`;
      const onList = mailingListHas(r.email);
      const listBtn = sup
        ? ''
        : (onList
          ? `<button class="btn sm cust-action-btn" disabled title="Already on your mailing list" style="opacity:.55;">✓ On list</button>`
          : `<button class="btn sm gold cust-action-btn" onclick="addBuyerToMailingList('${encodeURIComponent(r.email)}')" title="Add to your mailing list">＋ List</button>`);
      const supBtn = `<button class="btn sm cust-action-btn" onclick="toggleCustomerSuppress('${encodeURIComponent(r.email)}')" title="${sup ? 'Allow emailing this buyer again' : 'Exclude from Copy emails & CSV export'}">${sup ? 'Re-subscribe' : 'Unsubscribe'}</button>`;
      return `<tr${sup ? ' style="opacity:.55;"' : ''}>
        <td class="lead-cell">${escapeHtml(r.name) || '<span style="color:var(--text4);/* faint-ok: em-dash placeholder */">—</span>'}</td>
        <td>${emailCell}</td>
        <td class="r">${r.orders}</td>
        <td class="r">${r.units || '—'}</td>
        <td class="text-cell"><span>${escapeHtml(Array.from(r.books).join(', ')) || '—'}</span></td>
        <td class="r money-cell">${_custSpendStr(r.spend) || '—'}</td>
        <td class="date-cell">${r.last ? fmtD(r.last) : '—'}</td>
        <td>${Array.from(r.sources).map(s => `<span class="pill gray" style="font-size:var(--text-2xs);">${escapeHtml(s)}</span>`).join(' ')}</td>
        <td><div style="display:flex;gap:6px;flex-wrap:wrap;">${listBtn}${supBtn}</div></td>
      </tr>`;
    }).join('')
    : `<tr class="sys-empty-row"><td colspan="9">${_custEmptyHtml(all.length, activeFilters)}</td></tr>`;
}

/**
 * What the buyer table shows when it has no rows. Two genuinely different
 * situations, and telling them apart is the whole point:
 *
 *   • Filters are on → the buyers exist, they are just hidden. Naming the
 *     filters and offering one button back is the difference between a dead end
 *     and a two-second recovery — and it warns that Copy/Export/Email would
 *     reach nobody at all right now.
 *   • Nothing on record → an onboarding moment, so it points at the two ways
 *     buyers actually arrive rather than restating that the table is empty.
 */
function _custEmptyHtml(total, activeFilters) {
  const active = Array.isArray(activeFilters) ? activeFilters : [];
  if (active.length) {
    const clause = escapeHtml(joinFilterLabels(active));
    const n = Number(total) || 0;
    return `<div class="empty-state sys-empty">
      <div class="e-icon" aria-hidden="true">🔍</div>
      <strong>No buyers match these filters</strong>
      <span>You have <strong class="mono-num">${n}</strong> buyer${n === 1 ? '' : 's'} on record, but none of them match ${clause}. Copy, export and email would reach nobody until you widen this.</span>
      <div class="sys-empty-actions">
        <button class="btn gold lg" onclick="clearCustomerFilters()">✕ Show all buyers</button>
      </div>
    </div>`;
  }
  return `<div class="empty-state sys-empty">
    <div class="e-icon" aria-hidden="true">👥</div>
    <strong>No buyers with an email yet</strong>
    <span>Everyone who buys from you lands here the moment an email address is attached — apply a website order, take a checkout with an email on it, or pull your past buyers across from Stripe.</span>
    <div class="sys-empty-actions">
      <button class="btn gold lg" onclick="customerPullStripe()">↻ Pull buyers from Stripe</button>
      <button class="btn lg" onclick="switchTab('pos')">💳 Open checkout</button>
    </div>
  </div>`;
}

function openCampaignWizard(presets = null) {
  if (presets) {
    $('c-draft-id').value = presets.draftId || '';
    $('c-subject').value = presets.subject || '';
    if (presets.email) {
      const segmentSel = $('c-segment');
      if (segmentSel) {
        const prevTemp = segmentSel.querySelector('option[data-temp="true"]');
        if (prevTemp) prevTemp.remove();

        const tempOpt = document.createElement('option');
        tempOpt.value = 'single-target:' + presets.email;
        tempOpt.textContent = `Single Recipient (${presets.email})`;
        tempOpt.setAttribute('data-temp', 'true');
        segmentSel.appendChild(tempOpt);
        segmentSel.value = tempOpt.value;
      }
    } else {
      $('c-segment').value = presets.segment || 'all-curated';
    }
    $('c-replyto').value = presets.replyTo || 'lyricalmyricalbooks@gmail.com';
    $('c-body').value = presets.body || '';
    $('campaign-wizard-title').textContent = presets.title || 'Create New Email Campaign';
  } else {
    $('c-draft-id').value = '';
    $('c-subject').value = '';
    const segmentSel = $('c-segment');
    if (segmentSel) {
      const prevTemp = segmentSel.querySelector('option[data-temp="true"]');
      if (prevTemp) prevTemp.remove();
      segmentSel.value = 'all-curated';
    }
    $('c-replyto').value = 'lyricalmyricalbooks@gmail.com';
    $('c-body').value = '';
    $('campaign-wizard-title').textContent = 'Create New Email Campaign';
  }
  $('campaign-wizard-card').style.display = 'block';
  updateCampaignPreview();
  updateCampaignModeStatus();
  window.scrollTo({ top: $('campaign-wizard-card').offsetTop - 20, behavior: 'smooth' });
}

function closeCampaignWizard() {
  $('campaign-wizard-card').style.display = 'none';
}

function updateCampaignModeStatus() {
  const isDev = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  const forceMock = $('c-force-mock')?.checked;
  const dot = $('c-mode-indicator-dot');
  const text = $('c-mode-indicator-text');
  const row = document.querySelector('.campaign-mode-row');

  if (!dot || !text) return;

  if (row) {
    row.classList.remove('is-mock', 'is-warn', 'is-live');
  }

  if (forceMock) {
    dot.style.backgroundColor = 'var(--status-active, var(--amber))';
    text.innerHTML = 'Simulation Mode: Emails will be simulated and logged locally';
    if (row) {
      row.classList.add('is-mock');
      row.style.background = 'var(--surface-sunken)';
      row.style.borderColor = 'var(--status-active-border, var(--border-default))';
    }
  } else if (isDev && !sheetsUrl) {
    dot.style.backgroundColor = 'var(--status-active, var(--amber))';
    text.innerHTML = 'Mock Mode: No Google Sheet connected. Emails will be logged locally';
    if (row) {
      row.classList.add('is-mock');
      row.style.background = 'var(--surface-sunken)';
      row.style.borderColor = 'var(--status-active-border, var(--border-default))';
    }
  } else if (!sheetsUrl) {
    dot.style.backgroundColor = 'var(--status-critical, var(--red))';
    text.innerHTML = 'Warning: No Google Sheet connected. Sending will fail';
    if (row) {
      row.classList.add('is-warn');
      row.style.background = 'var(--status-critical-bg)';
      row.style.borderColor = 'var(--status-critical)';
    }
  } else {
    dot.style.backgroundColor = 'var(--status-positive, var(--green))';
    text.innerHTML = `Live Mode: Emails will send via connected Google Sheet (${new URL(sheetsUrl).hostname})`;
    if (row) {
      row.classList.add('is-live');
      row.style.background = 'var(--status-positive-bg)';
      row.style.borderColor = 'var(--status-positive)';
    }
  }
}

function onForceMockChange() {
  updateCampaignModeStatus();
}

function insertTemplateTag(tag) {
  const textarea = $('c-body');
  if (!textarea) return;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  textarea.value = text.substring(0, start) + tag + text.substring(end);
  textarea.focus();
  textarea.selectionStart = textarea.selectionEnd = start + tag.length;
  updateCampaignPreview();
}

function updateCampaignPreview() {
  const subject = $('c-subject').value || '(No Subject)';
  const bodyVal = $('c-body').value || '';
  const previewPane = $('c-preview-pane');
  if (!previewPane) return;

  const formattedBody = bodyVal
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>')
    .replace(/\{\{name\}\}/g, '<strong>John Doe</strong>')
    .replace(/\{\{email\}\}/g, '<strong>john.doe@example.com</strong>');

  previewPane.innerHTML = `
    <div style="font-family: 'Outfit', 'Plus Jakarta Sans', 'Inter', sans-serif; background: #faf9f6; padding: 20px; border-radius: 8px;">
      <div style="background: white; border: 1px solid var(--border); border-radius: 8px; padding: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
        <div style="font-size: 13px; color: #63605c; border-bottom: 1px solid #eee; padding-bottom: 8px; margin-bottom: 16px;">
          <strong>Subject:</strong> ${escapeHtml(subject)}
        </div>
        <div style="font-size: 15px; color: #333; line-height: 1.6; min-height: 150px; white-space: pre-line;">
          ${formattedBody}
        </div>
        <div style="font-size: 11px; color: #63605c; border-top: 1px dashed #eee; margin-top: 24px; padding-top: 12px; line-height: 1.4;">
          You are receiving this email because you are a valued customer of Lyricalmyrical Books.<br>
          <a href="#" style="color: #8a5815; text-decoration: underline;">Unsubscribe</a> from this list.
        </div>
      </div>
    </div>
  `;
}

function onCampaignSegmentChange() {
  // Option to trigger recount of matching subscribers
}

function getSegmentRecipients(segmentName) {
  const allDiscovered = buildCustomerList();
  const curated = mailingSubsArray().filter(s => !_isCustomerSuppressed(s.email));

  if (segmentName.startsWith('single-target:')) {
    const email = segmentName.split(':')[1];
    const existing = curated.find(s => s.email === email) || allDiscovered.find(c => c.email === email);
    return [{ name: existing?.name || '', email: email }];
  }

  if (segmentName === 'all-curated') {
    return curated;
  }
  if (segmentName === 'repeat') {
    return allDiscovered.filter(r => r.orders >= 2 && !_isCustomerSuppressed(r.email));
  }
  if (segmentName === 'high-spend') {
    return allDiscovered.filter(r => {
      let sum = 0;
      Object.keys(r.spend || {}).forEach(c => {
        const amt = r.spend[c] || 0;
        if (c === 'USD') sum += amt * 1.35;
        else if (c === 'EUR') sum += amt * 1.48;
        else if (c === 'GBP') sum += amt * 1.75;
        else sum += amt;
      });
      return sum >= 50 && !_isCustomerSuppressed(r.email);
    });
  }
  if (segmentName === 'all-discovered') {
    return allDiscovered.filter(r => !_isCustomerSuppressed(r.email));
  }
  return [];
}

async function saveCampaignDraft() {
  const subject = $('c-subject').value.trim();
  const body = $('c-body').value.trim();
  const segment = $('c-segment').value;
  const replyTo = $('c-replyto').value.trim();
  const id = $('c-draft-id').value || 'c-' + Date.now();

  if (!subject) { showToast('Subject line is required to save draft', 'warn'); return; }

  const idx = CAMPAIGNS.findIndex(c => c.id === id);
  const camp = {
    id,
    subject,
    body,
    segment,
    replyTo,
    status: 'draft',
    createdAt: today(),
    stats: null
  };

  if (idx >= 0) {
    CAMPAIGNS[idx] = camp;
  } else {
    CAMPAIGNS.unshift(camp);
  }

  await _persistCampaigns();
  renderCampaigns();
  closeCampaignWizard();
  showToast('✓ Campaign draft saved');
}

async function editCampaignDraft(id) {
  const camp = CAMPAIGNS.find(c => c.id === id);
  if (!camp) return;

  $('c-draft-id').value = camp.id;
  $('c-subject').value = camp.subject;
  $('c-segment').value = camp.segment;
  $('c-replyto').value = camp.replyTo || 'lyricalmyricalbooks@gmail.com';
  $('c-body').value = camp.body;

  $('campaign-wizard-title').textContent = 'Edit Campaign Draft';
  $('campaign-wizard-card').style.display = 'block';
  updateCampaignPreview();
  window.scrollTo({ top: $('campaign-wizard-card').offsetTop - 20, behavior: 'smooth' });
}

async function deleteCampaign(id) {
  const ok = await confirmDialog('Are you sure you want to delete this campaign?', { danger: true });
  if (!ok) return;

  CAMPAIGNS = CAMPAIGNS.filter(c => c.id !== id);
  await _persistCampaigns();
  renderCampaigns();
  showToast('Campaign deleted');
}

async function sendSingleEmailViaBackend(to, subject, body, replyTo, htmlBody = null, threadId = null, captureThread = false, attachments = null) {
  const useResend = localStorage.getItem('lm-oc-use-resend') === 'true';
  const resendKey = localStorage.getItem('lm-resend-api-key') || '';
  const resendFrom = localStorage.getItem('lm-resend-from') || '';

  // Configured "send as" identity (a verified Gmail alias + display name) for
  // valid SPF/DKIM on a custom domain. Applied server-side only when the alias
  // is actually verified, so an empty/stale value is harmless.
  const fromAlias = localStorage.getItem('lm-oc-fromalias') || '';
  const fromName = localStorage.getItem('lm-oc-fromname') || '';

  const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  // Replying into — or capturing — a Gmail thread only works through the Apps
  // Script Gmail webhook; a transactional provider (Resend) can't touch the
  // owner's Gmail threads. So when threading is involved, never route via Resend.
  const needsGmailThread = !!threadId || captureThread;
  const canUseLocalBackend = isLocal && (useResend || !sheetsUrl);
  const baseUrl = canUseLocalBackend ? 'http://localhost:8787' : '';

  let finalHtmlBody = htmlBody;
  let finalPlainBody = body;

  if (body.includes('<') && !htmlBody) {
    finalHtmlBody = body;
    // Strip tags repeatedly: one pass can leave a tag behind when tags are
    // nested inside each other (e.g. "<scr<b>ipt>").
    let stripped = body, prev;
    do { prev = stripped; stripped = stripped.replace(/<[^>]*>/g, ''); } while (stripped !== prev);
    finalPlainBody = stripped.replace(/[<>]/g, '');
  } else if (!finalHtmlBody) {
    finalHtmlBody = parseMarkdownToHtml(body);
  }

  if (useResend && resendKey && resendFrom && !isLocal) {
    console.warn('Browser-stored Resend keys can only be used with the local backend. Falling back to the connected Google Apps Script sender.');
  }

  if (useResend && resendKey && resendFrom && isLocal && !needsGmailThread) {
    const res = await fetch(baseUrl + '/api/campaign/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (localStorage.getItem('lm-auth-token') || ''),
        'X-Resend-Api-Key': resendKey,
        'X-Resend-From': resendFrom
      },
      body: JSON.stringify({ to, subject, body: finalPlainBody, htmlBody: finalHtmlBody, replyTo, simulated: false, threadId })
    });
    if (!res.ok) {
      const errText = await res.text();
      let errMsg = 'Send failed';
      try {
        const errJson = JSON.parse(errText);
        errMsg = errJson.error || errMsg;
      } catch (_) {
        errMsg = errText || errMsg;
      }
      throw new Error(errMsg);
    }
    return await res.json();
  }

  const forceMock = $('c-force-mock')?.checked;
  if (forceMock || (canUseLocalBackend && !sheetsUrl)) {
    const res = await fetch(baseUrl + '/api/campaign/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (localStorage.getItem('lm-auth-token') || '')
      },
      body: JSON.stringify({ to, subject, body: finalPlainBody, htmlBody: finalHtmlBody, replyTo, simulated: true, threadId, captureThread })
    });
    if (!res.ok) throw new Error(await res.text());
    return await res.json();
  } else {
    if (!sheetsUrl) throw new Error('Google Sheets/Webhook not connected. Please connect your sheet first.');
    const payload = {
      version: 2,
      action: 'sendcampaignemail',
      payload: {
        to, subject, body: finalPlainBody, htmlBody: finalHtmlBody, replyTo, threadId, captureThread, fromAlias, fromName,
        // A file (currently just the invoice PDF on a payment reminder) to
        // attach — [{filename, mimeType, base64}]. Only the real Apps Script
        // path knows how to attach it (v43+); the local mock backend above
        // never sends real mail, so there's nothing worth wiring it into there.
        attachments: attachments && attachments.length ? attachments : undefined,
      }
    };
    const res = await fetch(sheetsUrl, {
      method: 'POST',
      mode: 'cors',
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Sheets connection failed');
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  }
}

async function sendTestEmailCampaign() {
  const subject = $('c-subject').value.trim();
  const body = $('c-body').value.trim();
  const replyTo = $('c-replyto').value.trim();
  const testEmail = $('c-test-email').value.trim();

  if (!subject) { showToast('Subject line is required', 'warn'); return; }
  if (!testEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(testEmail)) { showToast('Enter a valid test email address', 'warn'); return; }

  showToast('Sending test email...');
  try {
    const personalizedBody = body
      .replace(/\{\{name\}\}/g, 'Test Recipient')
      .replace(/\{\{email\}\}/g, testEmail);

    await sendSingleEmailViaBackend(testEmail, '[TEST] ' + subject, personalizedBody, replyTo);
    showToast('✓ Test email sent successfully!');
  } catch (e) {
    showToast('Send failed: ' + e.message, 'err');
  }
}

let _campaignSendingActive = false;
let _campaignSendingIndex = 0;
let _campaignSendingRecipients = [];
let _campaignSuccessCount = 0;
let _campaignFailCount = 0;

function cancelCampaignSending() {
  _campaignSendingActive = false;
  $('c-send-log-console').innerHTML += '<div style="color:var(--red);">[CANCELLED] Sending process aborted by user.</div>';
  $('c-send-cancel-btn').disabled = true;
}

async function sendCampaignLaunch() {
  const subject = $('c-subject').value.trim();
  const body = $('c-body').value.trim();
  const segment = $('c-segment').value;
  const replyTo = $('c-replyto').value.trim();
  const draftId = $('c-draft-id').value;

  if (!subject) { showToast('Subject line is required', 'warn'); return; }

  const recs = getSegmentRecipients(segment);
  if (!recs.length) { showToast('Selected segment has no recipients', 'warn'); return; }

  const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  const invalidRecs = recs.filter(r => !r.email || !emailRegex.test(r.email.trim()));

  if (invalidRecs.length > 0) {
    const invalidList = invalidRecs.map(r => `${r.name || 'Unnamed'} (${r.email || 'no email'})`).join(', ');
    const proceed = await confirmDialog(
      `Warning: ${invalidRecs.length} recipient(s) have invalid email addresses and will fail:\n\n${invalidList.substring(0, 300)}${invalidList.length > 300 ? '...' : ''}\n\nDo you want to proceed anyway?`,
      { danger: true }
    );
    if (!proceed) return;
  }

  const ok = await confirmDialog(`Are you sure you want to send this campaign to ${recs.length} recipient(s)?`);
  if (!ok) return;

  $('c-send-overlay').classList.add('active');
  $('c-send-progress-fill').style.width = '0%';
  $('c-send-progress-text').textContent = `Sending 0 of ${recs.length} emails...`;
  $('c-send-log-console').innerHTML = `<div>[START] Launching campaign to ${recs.length} recipients.</div>`;
  $('c-send-cancel-btn').disabled = false;

  _campaignSendingActive = true;
  _campaignSendingIndex = 0;
  _campaignSendingRecipients = recs;
  _campaignSuccessCount = 0;
  _campaignFailCount = 0;

  closeCampaignWizard();

  setTimeout(() => sendNextCampaignEmail(subject, body, replyTo, draftId), 100);
}

async function sendNextCampaignEmail(subject, body, replyTo, draftId) {
  if (!_campaignSendingActive) {
    finishCampaignSend(subject, body, replyTo, draftId, true);
    return;
  }

  if (_campaignSendingIndex >= _campaignSendingRecipients.length) {
    finishCampaignSend(subject, body, replyTo, draftId, false);
    return;
  }

  const rec = _campaignSendingRecipients[_campaignSendingIndex];
  const to = rec.email;
  const name = rec.name || 'Customer';

  $('c-send-progress-text').textContent = `Sending ${_campaignSendingIndex + 1} of ${_campaignSendingRecipients.length} emails...`;
  const pct = Math.round((_campaignSendingIndex / _campaignSendingRecipients.length) * 100);
  $('c-send-progress-fill').style.width = pct + '%';

  try {
    const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    if (!to || !emailRegex.test(to.trim())) {
      throw new Error('Invalid email address format');
    }
    const personalizedBody = body
      .replace(/\{\{name\}\}/g, name)
      .replace(/\{\{email\}\}/g, to);

    await sendSingleEmailViaBackend(to, subject, personalizedBody, replyTo);
    _campaignSuccessCount++;
    $('c-send-log-console').innerHTML += `<div style="color:#a9ffaf;">✓ Sent to ${escapeHtml(to)} (${escapeHtml(name)})</div>`;
  } catch (e) {
    _campaignFailCount++;
    $('c-send-log-console').innerHTML += `<div style="color:#f87171;" class="campaign-log-fail" data-index="${_campaignSendingIndex}">✕ Failed for ${escapeHtml(to)}: ${escapeHtml(e.message)} <button class="btn sm" onclick="retryCampaignEmail(${_campaignSendingIndex})" style="padding:2px 6px;font-size:10px;margin-left:8px;line-height:1.2;height:auto;width:auto;display:inline-block;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.3);color:white;cursor:pointer;">Retry</button></div>`;
  }

  const consoleEl = $('c-send-log-console');
  if (consoleEl) consoleEl.scrollTop = consoleEl.scrollHeight;

  _campaignSendingIndex++;
  setTimeout(() => sendNextCampaignEmail(subject, body, replyTo, draftId), 150);
}

async function finishCampaignSend(subject, body, replyTo, draftId, wasAborted) {
  _campaignSendingActive = false;
  $('c-send-progress-fill').style.width = '100%';
  $('c-send-progress-text').textContent = wasAborted ? 'Sending Aborted' : 'Campaign Completed!';

  $('c-send-log-console').innerHTML += `
    <div style="font-weight:bold;margin-top:8px;" id="c-send-finished-summary">[FINISHED] Success: ${_campaignSuccessCount} · Failed: ${_campaignFailCount}</div>
  `;

  const btn = $('c-send-cancel-btn');
  btn.textContent = '✕ Close Window';
  btn.disabled = false;
  btn.onclick = () => {
    $('c-send-overlay').classList.remove('active');
    btn.onclick = cancelCampaignSending;
    btn.textContent = '✕ Abort Send';
  };

  CAMPAIGNS = CAMPAIGNS.filter(c => c.id !== draftId);

  const sentCampaign = {
    id: 'c-sent-' + Date.now(),
    subject,
    body,
    segment: $('c-segment').value,
    replyTo,
    status: 'sent',
    createdAt: today(),
    sentAt: today() + ' ' + new Date().toTimeString().slice(0, 5),
    stats: {
      total: _campaignSendingRecipients.length,
      success: _campaignSuccessCount,
      failed: _campaignFailCount
    }
  };

  CAMPAIGNS.unshift(sentCampaign);
  await _persistCampaigns();
  renderCampaigns();
  showToast(wasAborted ? 'Campaign send aborted' : '✓ Campaign sent successfully!');
}

async function retryCampaignEmail(idx) {
  const rec = _campaignSendingRecipients[idx];
  if (!rec) return;

  const to = rec.email;
  const name = rec.name || 'Customer';
  const subject = $('c-subject').value.trim();
  const body = $('c-body').value.trim();
  const replyTo = $('c-replyto').value.trim();

  const consoleEl = $('c-send-log-console');
  if (!consoleEl) return;
  const failLines = consoleEl.querySelectorAll('.campaign-log-fail');
  let targetLine = null;
  for (const line of failLines) {
    if (parseInt(line.getAttribute('data-index')) === idx) {
      targetLine = line;
      break;
    }
  }

  if (targetLine) {
    targetLine.style.color = 'var(--text3)';
    targetLine.innerHTML = `⏳ Retrying for ${escapeHtml(to)}...`;
  }

  try {
    const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    if (!to || !emailRegex.test(to.trim())) {
      throw new Error('Invalid email address format');
    }
    const personalizedBody = body
      .replace(/\{\{name\}\}/g, name)
      .replace(/\{\{email\}\}/g, to);

    await sendSingleEmailViaBackend(to, subject, personalizedBody, replyTo);

    _campaignSuccessCount++;
    _campaignFailCount--;

    if (targetLine) {
      targetLine.style.color = '#a9ffaf';
      targetLine.className = '';
      targetLine.innerHTML = `✓ Sent to ${escapeHtml(to)} (${escapeHtml(name)}) (Retried)`;
    }

    updateCampaignSendFinishedSummary();
  } catch (e) {
    if (targetLine) {
      targetLine.style.color = '#f87171';
      targetLine.innerHTML = `✕ Failed for ${escapeHtml(to)}: ${escapeHtml(e.message)} <button class="btn sm" onclick="retryCampaignEmail(${idx})" style="padding:2px 6px;font-size:var(--text-2xs);margin-left:8px;line-height:1.2;height:auto;width:auto;display:inline-block;background:rgba(255,255,255,0.15);border:var(--stroke-hair) solid rgba(255,255,255,0.3);color:white;cursor:pointer;">Retry</button>`;
    }
  }
}

function updateCampaignSendFinishedSummary() {
  const summaryEl = $('c-send-finished-summary');
  if (summaryEl) {
    summaryEl.innerHTML = `[FINISHED] Success: ${_campaignSuccessCount} · Failed: ${_campaignFailCount}`;
  }
}

async function renderCampaigns() {
  const draftsList = $('campaign-drafts-list');
  const sentList = $('campaign-sent-list');
  if (!draftsList || !sentList) return;

  const drafts = CAMPAIGNS.filter(c => c.status === 'draft');
  const sent = CAMPAIGNS.filter(c => c.status === 'sent');

  draftsList.innerHTML = drafts.length
    ? drafts.map(c => `
      <div class="campaign-row">
        <div class="campaign-info">
          <div class="campaign-title-row">
            <span class="campaign-subject">${escapeHtml(c.subject)}</span>
            <span class="pill amber" style="font-size:var(--text-3xs);">Draft</span>
          </div>
          <div class="campaign-meta-info">Created: ${escapeHtml(fmtD(c.createdAt))} · Target: ${escapeHtml(c.segment)}</div>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="btn sm cust-action-btn" onclick="editCampaignDraft('${escapeHtml(c.id)}')">Edit</button>
          <button class="btn sm cust-action-btn" onclick="deleteCampaign('${escapeHtml(c.id)}')">Delete</button>
        </div>
      </div>
    `).join('')
    : `<div class="empty-state sys-empty" style="padding:2rem 1.5rem;">
        <div class="e-icon" aria-hidden="true">📝</div>
        <strong>No saved drafts</strong>
        <span>Draft campaigns to announce new book releases, discounts, or author events before sending them out.</span>
        <div class="sys-empty-actions" style="margin-top:1rem;display:flex;justify-content:center;">
          <button class="btn gold lg" onclick="openCampaignWizard()">＋ Create Campaign</button>
        </div>
      </div>`;

  sentList.innerHTML = sent.length
    ? sent.map(c => `
      <div class="campaign-row">
        <div class="campaign-info">
          <div class="campaign-title-row">
            <span class="campaign-subject">${escapeHtml(c.subject)}</span>
            <span class="pill green" style="font-size:var(--text-3xs);">Sent</span>
          </div>
          <div class="campaign-meta-info">Sent: ${escapeHtml(c.sentAt || fmtD(c.createdAt))} · Segment: ${escapeHtml(c.segment)}</div>
        </div>
        <div class="campaign-kpis">
          <div class="campaign-kpi-item">
            <span>Sent</span>
            <strong>${Number(c.stats ? c.stats.success : 0) || 0}</strong>
          </div>
          ${c.stats && c.stats.failed ? `
          <div class="campaign-kpi-item">
            <span style="color:var(--status-critical, var(--red));">Failed</span>
            <strong style="color:var(--status-critical, var(--red));">${Number(c.stats.failed) || 0}</strong>
          </div>` : ''}
          <button class="btn sm cust-action-btn" onclick="deleteCampaign('${escapeHtml(c.id)}')" title="Delete from history" aria-label="Delete campaign ${escapeHtml(c.subject || '')} from history" style="margin-left:8px;">✕</button>
        </div>
      </div>
    `).join('')
    : `<div class="empty-state sys-empty" style="padding:2rem 1.5rem;">
        <div class="e-icon" aria-hidden="true">📣</div>
        <strong>No sent campaigns yet</strong>
        <span>Broadcast history and delivery statistics will appear here after your first newsletter or announcement send.</span>
        <div class="sys-empty-actions" style="margin-top:1rem;display:flex;justify-content:center;">
          <button class="btn gold lg" onclick="openCampaignWizard()">＋ Compose first campaign</button>
        </div>
      </div>`;
}

// ⚡ Bolt Optimization: Debounce the buyer-search re-render. Each keystroke was
// synchronously re-running buildCustomerList() — a full scan of every book's
// order history, unapplied website orders, and the Stripe pull cache — plus a
// full innerHTML rebuild of the buyer table. Typing a short name (e.g. "sarah")
// fired that whole pipeline 5 times; waiting for a short pause in typing runs
// it once instead, with no change to the final filtered result.
let _custFilterDebounceTimer = null;
function filterCustomers(v) {
  _customerFilter = v || '';
  clearTimeout(_custFilterDebounceTimer);
  _custFilterDebounceTimer = setTimeout(renderCustomers, 180);
}

async function customerPullStripe() {
  const btn = $('cust-stripe-btn');
  const status = $('cust-stripe-status');
  const key = (typeof getReconStripeKey === 'function') ? getReconStripeKey() : '';
  if (!key) {
    if (status) status.innerHTML = '<span style="color:var(--amber);">No Stripe key saved yet — add one in the Payments or Tax Centre tab, then pull again.</span>';
    showToast('Add your Stripe key in Payments first', 'warn');
    return;
  }
  const moreBtn = $('cust-stripe-more-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Pulling…'; }
  if (moreBtn) moreBtn.disabled = true;
  if (status) status.textContent = `Fetching buyers from Stripe (up to ${_customerStripeDepth * 100} most recent payments)…`;
  try {
    const payments = await fetchStripePaymentsForReconcile(_customerStripeDepth);

    // ⚡ Bolt Optimization: Loop Fusion
    // Combined .filter() and .map() into a single pass to eliminate intermediate array allocations
    const slim = [];
    for (const p of payments) {
      if (_custEmailKey(p.email)) {
        slim.push({
          email: p.email, customer: p.customer || '', amount: p.amount,
          currency: p.currency, date: p.date, refunded: !!p.refunded,
        });
      }
    }

    _saveCustomerStripeCache(slim);
    // If we filled the page budget, older payments probably remain.
    _customerStripeMaybeMore = payments.length >= _customerStripeDepth * 100 && _customerStripeDepth < 50;
    const uniq = new Set(slim.map(p => _custEmailKey(p.email))).size;
    if (status) status.innerHTML = `<span style="color:var(--green);">✓ Pulled ${uniq} buyer${uniq === 1 ? '' : 's'} with an email from ${payments.length} Stripe payment${payments.length === 1 ? '' : 's'}.</span>`
      + (_customerStripeMaybeMore ? ' <span style="color:var(--text3);">Older buyers may remain — use “Load older”.</span>' : '');
    renderCustomers();
  } catch (e) {
    const msg = String(e.message || e);
    if (status) status.innerHTML = `<span style="color:var(--red);">Error: ${escapeHtml(msg)}</span>`;
    showToast('Stripe pull failed: ' + msg, 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '↻ Pull buyers from Stripe'; }
    if (moreBtn) { moreBtn.disabled = false; moreBtn.style.display = _customerStripeMaybeMore ? '' : 'none'; }
  }
}

// Reach further back through Stripe history, 5 pages (~500 payments) at a time.
async function customerPullDeeper() {
  _customerStripeDepth = Math.min(50, _customerStripeDepth + 5);
  await customerPullStripe();
}

function copyCustomerEmails() {
  const emails = Array.from(new Set(_custMailable(buildCustomerList()).map(r => r.email)));
  if (!emails.length) { showToast('No mailable emails here (unsubscribed are excluded)', 'warn'); return; }
  const text = emails.join(', ');
  const done = () => showToast(`✓ Copied ${emails.length} email${emails.length === 1 ? '' : 's'}`);
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => { _custFallbackCopy(text); done(); });
  } else { _custFallbackCopy(text); done(); }
}
function _custFallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); } catch (_) { }
  ta.remove();
}

function exportCustomersCSV() {
  // Export exactly what's filtered on screen, minus anyone who unsubscribed —
  // so a re-import into a newsletter tool can't re-add opted-out buyers.
  const list = _custMailable(buildCustomerList());
  if (!list.length) { showToast('Nothing to export in this view (unsubscribed are excluded)', 'warn'); return; }
  const rows = [['Name', 'Email', 'Orders', 'Units', 'Books', 'Channels', 'First Order', 'Last Order', 'Spend', 'Sources']];
  list.forEach(r => rows.push([
    r.name, r.email, r.orders, r.units || '',
    Array.from(r.books).join('; '), Array.from(r.channels).join('; '),
    r.first || '', r.last || '', _custSpendStr(r.spend), Array.from(r.sources).join('; '),
  ]));
  downloadCsv(toCsv(rows), `lyrical-customers-${today()}.csv`);
  showToast(`✓ Exported ${list.length} customer${list.length === 1 ? '' : 's'}`);
}

// Backup restore (restoreSystemBackup in main.js) replaces these two wholesale.
function _setMailingList(value) { MAILING_LIST = value; }
function _setCustomerSuppress(value) { _customerSuppress = value; }

export {
  MAILING_LIST,
  _customerSuppress,
  _setMailingList,
  _setCustomerSuppress,
  _isCustomerSuppressed,
  loadCustomerSuppression,
  _persistCustomerSuppression,
  toggleCustomerSuppress,
  setCustomerBookFilter,
  mailingSubsArray,
  mailingListHas,
  loadMailingList,
  _persistMailingList,
  _mailingUpsert,
  addManualSubscriber,
  addBuyerToMailingList,
  removeFromMailingList,
  _mailingMergeBuyers,
  addAllBuyersToMailingList,
  toggleMailingAutoAdd,
  _mailingAutoSync,
  renderMailingList,
  focusMailingListAdd,
  _uniqueMailable,
  _openGmailBcc,
  emailCustomerSegment,
  emailMailingList,
  copyMailingListEmails,
  exportMailingListCsv,
  exportMailingListCSV,
  _loadCustomerStripeCache,
  _saveCustomerStripeCache,
  _custEmailKey,
  _custUpsert,
  _custAddSpend,
  _custTouchDate,
  buildCustomerList,
  _custSpendStr,
  _custApplyFilter,
  _custMailable,
  _custSyncBookFilterOptions,
  setCustomerChannelFilter,
  setCustomerSpendFilter,
  setCustomerOrdersFilter,
  _custFilterState,
  _custActiveFilters,
  clearCustomerFilter,
  clearCustomerFilters,
  _renderCustFilterBar,
  checkMailingEmailTypo,
  suggestEmailTypo,
  applyMailingEmailCorrection,
  loadCampaigns,
  _persistCampaigns,
  switchCustomersSubTab,
  renderCustomers,
  renderCustomersAudience,
  _custEmptyHtml,
  openCampaignWizard,
  closeCampaignWizard,
  updateCampaignModeStatus,
  onForceMockChange,
  insertTemplateTag,
  updateCampaignPreview,
  onCampaignSegmentChange,
  getSegmentRecipients,
  saveCampaignDraft,
  editCampaignDraft,
  deleteCampaign,
  sendSingleEmailViaBackend,
  sendTestEmailCampaign,
  cancelCampaignSending,
  sendCampaignLaunch,
  sendNextCampaignEmail,
  finishCampaignSend,
  retryCampaignEmail,
  updateCampaignSendFinishedSummary,
  renderCampaigns,
  filterCustomers,
  customerPullStripe,
  customerPullDeeper,
  copyCustomerEmails,
  _custFallbackCopy,
  exportCustomersCSV,
};
