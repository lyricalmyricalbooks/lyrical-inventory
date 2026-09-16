import { escapeHtml as esc } from '../lib/html.js';
import { receiptQuery, normalizeFoundReceipt, receiptProblems, receiptReviewStatus, receiptMoney, RECEIPT_STATUSES } from '../lib/receipt-finder.js';
import { createReceiptFinderClient, extractFoundReceipts, decodeGmailBase64, checkReceiptFinderService, FINDER_ENDPOINT_PATTERN } from '../lib/receipt-finder-client.js';
import { createReceiptFinderStore } from '../lib/receipt-finder-store.js';
import { flushReceiptOutbox } from '../lib/receipt-finder-outbox.js';
import { downloadBlob } from '../lib/download.js';
import '../styles/receipt-finder.css';

const LABELS = { all: 'All', ready: 'Ready', review: 'Needs review', duplicate: 'Duplicates', queued: 'Pending import', imported: 'Imported', ignored: 'Dismissed' };
const emptyState = () => ({ drafts: [], emails: {}, scans: {}, endpoint: '', account: '', lastScan: '', pageToken: '', lastQuery: '', lastEndpoint: '' });

// Emails are read a few at a time rather than one after another. The AI call
// dominates each one, so this is the difference between a scan that takes a
// couple of minutes and one that takes twenty. Kept low on purpose: the script
// allows 30 extractions a minute and a burst would simply hit that wall.
const SCAN_CONCURRENCY = 3;
const RENDER_INTERVAL_MS = 200;

let deps, host, state = emptyState(), uid = '', accessToken = '', tokenExpiresAt = 0;
let controller = null, busy = false, flushing = false, scanTotal = 0, scanDone = 0;
let filter = 'all', resultQuery = '', saveChain = Promise.resolve(), saveScheduled = false;
let initialized = false, restore = Promise.resolve(), serviceReadyFor = '', serviceProblem = null;
let statusCache = null, cachedExpenses = null, renderTimer = 0;
const store = createReceiptFinderStore();
const client = createReceiptFinderClient({ token: () => accessToken, onExpired: () => { forgetToken().catch(() => {}); } });
const active = () => uid && deps?.user()?.uid === uid && deps.publisher();
const tokenLive = () => !!accessToken && tokenExpiresAt > Date.now();

// The receipt reader now lives in the same Apps Script the app already uses for
// Google Sheets, so there is normally nothing to paste: fall back to that
// address, and only use a separately saved one when the publisher set it.
const activeEndpoint = () => state.endpoint || deps?.service?.() || '';

// Status is derived from every saved expense, so it is far too costly to
// recompute six times per draft per render. One map per render pass, thrown
// away immediately after, keeps it correct without the repeated scans.
function statusOf(draft) {
  if (!statusCache) return receiptReviewStatus(draft, deps.expenses());
  let value = statusCache.get(draft);
  if (value === undefined) { value = receiptReviewStatus(draft, cachedExpenses); statusCache.set(draft, value); }
  return value;
}

// Runs `fn` with one shared status map, for the bulk actions that would
// otherwise rescan every saved expense once per draft.
function withStatusCache(fn) {
  if (statusCache) return fn();
  statusCache = new Map(); cachedExpenses = deps.expenses();
  try { return fn(); } finally { statusCache = null; cachedExpenses = null; }
}

// Saves used to deep-clone the whole mailbox — every saved email body and every
// attachment's bytes — on each call, and a scan calls this twice per email. The
// clone grew with the mailbox, so scanning got slower the more it found. The
// write itself already snapshots, and a save that is merely scheduled can carry
// any later edit, so overlapping calls collapse into one write.
function persist() {
  if (!active()) return Promise.reject(new Error('Sign in as the same publisher to continue'));
  const savedUid = uid;
  if (saveScheduled) return saveChain;
  saveScheduled = true;
  saveChain = saveChain.catch(() => {}).then(() => {
    saveScheduled = false;
    if (!active() || uid !== savedUid) return undefined;
    return store.save(savedUid, state);
  });
  return saveChain;
}

function announce(text) {
  const node = host?.querySelector('[data-finder-status]');
  if (node) node.textContent = text;
}

async function forgetToken() {
  const owner = uid;
  accessToken = ''; tokenExpiresAt = 0;
  renderConnection();
  if (owner) await store.clearToken?.(owner);
}

function connectionLabel() {
  if (!tokenLive()) return state.account ? `Reconnect ${state.account}` : 'Connect Gmail';
  return 'Disconnect Gmail';
}

function renderConnection() {
  const pill = document.getElementById('email-account-pill');
  if (pill) {
    pill.textContent = tokenLive() ? `● ${state.account}` : '○ Gmail not connected';
    pill.className = `pill ${tokenLive() ? 'green' : 'gray'} email-connected-pill`;
  }
  const button = host?.querySelector('[data-action="connect"]');
  if (button) { button.textContent = connectionLabel(); button.disabled = busy; }
  const note = host?.querySelector('[data-conn-note]');
  if (note) {
    note.textContent = tokenLive()
      ? `Read-only access to ${state.account}. Stays connected until ${new Date(tokenExpiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`
      : state.account
        ? `Gmail access for ${state.account} has run out. Reconnecting takes one click — Google will not ask you to approve it again.`
        : 'Gmail is read-only: the app can read messages to find receipts and can never send, delete or change anything.';
  }
  const dot = host?.querySelector('[data-conn-pill]');
  if (dot) {
    dot.className = `pill ${tokenLive() ? 'green' : 'gray'}`;
    dot.textContent = tokenLive() ? '● Connected' : '○ Not connected';
  }
}

async function restoreToken() {
  if (!active()) return;
  const owner = uid;
  try {
    const saved = await store.loadToken?.(owner);
    if (!saved || uid !== owner) return;
    if (saved.token && saved.expiresAt > Date.now()) {
      accessToken = saved.token; tokenExpiresAt = saved.expiresAt;
      if (saved.account && !state.account) state.account = saved.account;
    } else {
      if (saved.account && !state.account) state.account = saved.account;
      await store.clearToken?.(owner);
    }
  } catch { /* no saved connection is a normal first run, not a failure */ }
}

async function startReceiptFinder(dependencies) {
  deps = dependencies;
  const nextUid = deps.user()?.uid || '';
  if (nextUid !== uid) {
    controller?.abort(); accessToken = ''; tokenExpiresAt = 0; state = emptyState(); uid = nextUid;
    serviceReadyFor = ''; host?.replaceChildren(); host = null;
    if (active()) {
      restore = store.load(uid).then(async saved => {
        if (active() && deps.user()?.uid === nextUid && saved) state = { ...emptyState(), ...saved };
        await restoreToken();
      });
    }
  }
  if (!initialized) {
    initialized = true;
    window.addEventListener('online', () => { resumeReceiptImports(); });
    window.addEventListener('offline', () => announce('Offline. Saved receipts can be reviewed and queued for import.'));
    // Reset immediately on auth changes; a former publisher must not keep a
    // token or mailbox view while an author is signed in on the same browser.
    window._fbOnAuthStateChanged?.(user => {
      if (user?.uid !== uid) {
        const owner = uid;
        controller?.abort(); accessToken = ''; tokenExpiresAt = 0; uid = ''; state = emptyState();
        serviceReadyFor = ''; host?.replaceChildren(); host = null;
        // Signing out must also drop the saved Gmail token from this device,
        // not just from memory.
        if (owner) store.clearToken?.(owner).catch(() => {});
      }
    });
  }
  await restore;
  // Restoring the outbox is cheap; uploading a backlog must not delay opening.
  resumeReceiptImports();
}

async function mountReceiptFinder(element, dependencies) {
  await startReceiptFinder(dependencies);
  if (!active()) throw new Error('Publisher access required');
  if (host === element && element.querySelector('[data-finder-list]')) { render(); return; }
  host = element;
  host.removeEventListener('click', onClick);
  host.removeEventListener('change', onChange);
  const from = new Date(); from.setDate(from.getDate() - 30);
  host.innerHTML = `
    <div class="finder-head">
      <div class="finder-head-text">
        <h3 class="section-hed">Find the receipts. Keep the records.</h3>
        <p>Scan Gmail, check the details, then file them into Business Expenses. Only the messages you scan are sent to your own Google script to be read.</p>
      </div>
      <div class="finder-conn">
        <span class="pill gray" data-conn-pill>○ Not connected</span>
        <button type="button" class="btn gold" data-action="connect">Connect Gmail</button>
      </div>
    </div>
    <p class="finder-conn-note" data-conn-note></p>
    <div class="finder-gate" data-finder-gate hidden></div>
    <section class="finder-search" aria-label="Search your mailbox">
      <div class="finder-presets" role="group" aria-label="Quick filters">
        <button type="button" class="filter-chip" data-preset="7">🕒 Past 7 days</button>
        <button type="button" class="filter-chip" data-preset="30">📅 Past 30 days</button>
        <button type="button" class="filter-chip" data-preset="90">🗓️ Past 3 months</button>
        <span class="finder-presets-sep" aria-hidden="true"></span>
        <button type="button" class="filter-chip" data-toggle="attachments" aria-pressed="false">📎 With attachments</button>
        <button type="button" class="filter-chip" data-toggle="invoices" aria-pressed="false">🧾 Invoices &amp; bills</button>
        <button type="button" class="filter-chip" data-toggle="shipping" aria-pressed="false">📦 Shipping costs</button>
      </div>
      <div class="finder-filters">
        <div class="form-group finder-query"><label for="finder-query">Keywords or Gmail search</label>
          <input type="search" id="finder-query" placeholder="Invoices, receipts, orders…"></div>
        <div class="form-group"><label for="finder-sender">Sender / vendor email</label>
          <input type="text" id="finder-sender" inputmode="email" placeholder="supplier@example.com"></div>
        <div class="form-group"><label for="finder-from">From date</label>
          <input type="date" id="finder-from" value="${from.toISOString().slice(0, 10)}"></div>
        <div class="form-group"><label for="finder-to">Through date</label>
          <input type="date" id="finder-to"></div>
      </div>
      <div class="finder-run">
        <button type="button" class="btn gold lg" data-action="scan">Find invoices &amp; receipts</button>
        <button type="button" class="btn" data-action="cancel" hidden>Stop scan</button>
        <span class="finder-run-hint">Reads up to 25 messages at a time.</span>
      </div>
      <div class="finder-progress" data-finder-progress hidden>
        <div class="finder-progress-track"><div class="finder-progress-fill" data-progress-fill style="width:0%"></div></div>
        <span class="finder-progress-text" data-progress-text></span>
      </div>
      <p data-finder-status role="status" aria-live="polite">${state.lastScan ? `Last scan: ${esc(new Date(state.lastScan).toLocaleString())}` : 'Pick a period, then scan. Nothing is filed until you approve it.'}</p>
    </section>
    <div data-finder-alert></div>
    <details class="finder-setup"><summary>Advanced: receipt reading service</summary><div class="form-group">
      <p>The finder reads receipts through the same Google Sheet script this app already uses. Leave the box below empty unless you run a separate Receipt Finder deployment.</p>
      <label for="finder-endpoint">Separate deployment address (optional)</label>
      <input type="url" id="finder-endpoint" value="${esc(state.endpoint)}" placeholder="https://script.google.com/macros/s/…/exec">
      <div class="finder-toolbar">
        <button class="btn" type="button" data-action="save-setup">Save address</button>
        <button class="btn" type="button" data-action="check-setup">Test connection</button>
        <button class="btn" type="button" data-action="forget">Clear saved finder data</button>
      </div>
      <div class="finder-check" data-finder-check role="status" aria-live="polite"></div>
    </div></details>
    <div data-finder-summary class="finder-summary"></div>
    <div class="finder-toolbar" data-finder-tabs role="group" aria-label="Filter receipt status"></div>
    <div class="finder-listbar">
      <label class="finder-select"><input type="checkbox" data-select-all> Select every ready receipt below</label>
      <input type="search" class="ledger-filter-input" data-result-search aria-label="Search found receipts" placeholder="Vendor, invoice number or description">
      <button type="button" class="btn" data-action="retry">Retry pending imports</button>
    </div>
    <div data-finder-list></div>
    <div data-finder-errors></div>
    <div class="finder-actionbar">
      <button type="button" class="btn" data-action="next" hidden>Scan next 25 emails</button>
      <span data-selected-count class="finder-count"></span>
      <button type="button" class="btn gold" data-action="import">Import selected</button>
    </div>`;
  host.addEventListener('click', onClick);
  host.addEventListener('change', onChange);
  host.querySelector('[data-result-search]').addEventListener('input', event => {
    resultQuery = event.target.value.toLowerCase(); render();
  });
  host.querySelector('#finder-query').addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); scan(false).catch(report); }
  });
  render();
}

function report(error) {
  if (error.name === 'AbortError') return;
  console.error('[receipt-finder]', error);
  announce(error.message || 'Receipt finder failed. Try again.');
  deps.toast(error.message || 'Receipt finder failed', 'err');
}

function visibleDrafts() {
  // Sorted so results read newest-first and stay in a stable order however the
  // scan's parallel readers happen to finish.
  return state.drafts
    .filter(draft => (filter === 'all' || statusOf(draft) === filter)
      && `${draft.vendor} ${draft.reference} ${draft.description}`.toLowerCase().includes(resultQuery))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.id.localeCompare(b.id));
}

function scheduleRender() {
  if (renderTimer) return;
  renderTimer = setTimeout(() => { renderTimer = 0; render(); }, RENDER_INTERVAL_MS);
}

// What still stands between the publisher and a scan, in the order they have to
// do it. Shown as a numbered card rather than hidden inside a disclosure —
// burying the one required setting is what made the finder look broken.
function gateSteps() {
  const steps = [];
  if (!tokenLive()) {
    steps.push({ title: state.account ? 'Reconnect Gmail' : 'Connect Gmail',
      body: state.account
        ? 'Your read-only access has run out for now. One click reconnects it.'
        : 'Give the app read-only access so it can look through your mail for receipts.',
      action: 'connect', cta: state.account ? 'Reconnect' : 'Connect Gmail' });
  }
  if (!activeEndpoint()) {
    steps.push({ title: 'Connect your Google Sheet', body: 'The finder reads receipts through the same Google script that syncs your sheet. Set that up once in the “Connect your Google Sheet” tab and this step disappears.' });
  } else if (serviceProblem) {
    // A saved address that the app cannot read blocks every scan. Telling the
    // publisher to "clear this address" while the field itself sits inside a
    // collapsed disclosure is not an instruction anyone can act on — so the
    // problem, and the button that fixes it, belong here at the top.
    const canFallBack = serviceProblem.fix === 'use-sheets' && state.endpoint && !!deps?.service?.();
    steps.push({ title: serviceProblem.headline,
      body: canFallBack
        ? 'You no longer need a separate script for this. Switch to the Google Sheet script you have already connected and this goes away.'
        : (serviceProblem.steps[0] || 'Open Advanced below to check the receipt reading service.'),
      action: canFallBack ? 'use-sheets' : '', cta: 'Use my Google Sheet script' });
  }
  return steps;
}

function renderGate() {
  const gate = host.querySelector('[data-finder-gate]');
  const steps = gateSteps();
  gate.hidden = steps.length === 0;
  if (!steps.length) { gate.replaceChildren(); return; }
  gate.innerHTML = `<h4 class="finder-gate-hed">Two quick things before the first scan</h4><ol class="finder-gate-steps">${steps.map(step => `
    <li><strong>${esc(step.title)}</strong><span>${esc(step.body)}</span>
      ${step.action ? `<button type="button" class="btn gold sm" data-action="${esc(step.action)}">${esc(step.cta)}</button>` : ''}</li>`).join('')}</ol>`;
}

function renderProgress() {
  const wrap = host.querySelector('[data-finder-progress]');
  wrap.hidden = !busy || !scanTotal;
  if (wrap.hidden) return;
  const percent = Math.round((scanDone / scanTotal) * 100);
  const fill = host.querySelector('[data-progress-fill]');
  fill.style.width = `${percent}%`;
  wrap.setAttribute('role', 'progressbar');
  wrap.setAttribute('aria-valuemin', '0');
  wrap.setAttribute('aria-valuemax', String(scanTotal));
  wrap.setAttribute('aria-valuenow', String(scanDone));
  host.querySelector('[data-progress-text]').textContent = `Reading ${scanDone} of ${scanTotal} emails`;
}

function renderAlert(counts) {
  const failures = Object.values(state.scans).filter(scan => scan.error).length;
  const alert = host.querySelector('[data-finder-alert]');
  if (failures) {
    alert.className = 'finder-alert is-warn';
    alert.innerHTML = `<span class="pill amber">● ${failures} to retry</span>
      <p>${failures === 1 ? 'One email' : `${failures} emails`} could not be read. Everything else was saved — the list under your receipts says what happened to each one.</p>
      <button type="button" class="btn sm" data-action="retry-failed">Try those again</button>
      <button type="button" class="btn sm" data-action="clear-failures">Clear these</button>`;
  } else if (counts.queued) {
    alert.className = 'finder-alert is-info';
    alert.innerHTML = `<span class="pill amber">● ${counts.queued} waiting</span>
      <p>${counts.queued === 1 ? 'One receipt is' : `${counts.queued} receipts are`} waiting to be filed. They finish on their own once you are back online.</p>`;
  } else {
    alert.className = ''; alert.replaceChildren();
  }
}

function render() {
  if (!host?.querySelector('[data-finder-list]') || !active()) return;
  if (renderTimer) { clearTimeout(renderTimer); renderTimer = 0; }
  statusCache = new Map(); cachedExpenses = deps.expenses();
  try {
    renderConnection();
    renderGate();
    renderProgress();
    const counts = Object.fromEntries(RECEIPT_STATUSES.map(status => [status, 0]));
    state.drafts.forEach(draft => { counts.all++; counts[statusOf(draft)]++; });
    renderAlert(counts);
    host.querySelector('[data-finder-summary]').innerHTML = [
      ['ready', '✓', 'Ready to import', 'Checked and good to file', true],
      ['review', '👀', 'Needs your review', 'Missing or uncertain details', false],
      ['imported', '📁', 'Filed in expenses', 'Already in Business Expenses', false],
    ].map(([key, icon, label, sub, lead]) => `<div class="finder-stat${lead ? ' is-lead' : ''} tone-${key}">
        <div class="finder-stat-icon" aria-hidden="true">${icon}</div>
        <div class="finder-stat-body"><span class="finder-stat-label">${label}</span>
          <strong class="finder-stat-val">${counts[key]}</strong>
          <span class="finder-stat-sub">${sub}</span></div></div>`).join('');
    host.querySelector('[data-finder-tabs]').innerHTML = RECEIPT_STATUSES.map(status => `<button type="button" class="filter-chip${filter === status ? ' active' : ''}" data-status="${status}" aria-pressed="${filter === status}">${LABELS[status]} <span class="mono-num">${counts[status]}</span></button>`).join('');
    const drafts = visibleDrafts();
    const openIds = new Set(Array.from(host.querySelectorAll('details[data-draft][open]'), el => el.dataset.draft));
    host.querySelector('[data-finder-list]').innerHTML = drafts.length
      ? drafts.map(draft => renderDraft(draft, openIds.has(draft.id))).join('')
      : renderEmpty();
    const errors = Object.entries(state.scans).filter(([, scan]) => scan.error);
    host.querySelector('[data-finder-errors]').innerHTML = errors.length ? `<details class="finder-errors"><summary>${errors.length} email${errors.length === 1 ? '' : 's'} need another attempt</summary>${errors.map(([key, scan]) => `<p>${esc(scan.subject || key)} — ${esc(scan.error)} <button type="button" class="btn sm" data-retry-email="${esc(key)}">Retry email</button></p>`).join('')}</details>` : '';
    const ready = drafts.filter(draft => statusOf(draft) === 'ready');
    const all = host.querySelector('[data-select-all]');
    all.checked = ready.length > 0 && ready.every(draft => draft.selected);
    all.indeterminate = ready.some(draft => draft.selected) && !all.checked;
    all.disabled = ready.length === 0;
    const selected = state.drafts.filter(draft => draft.selected && statusOf(draft) === 'ready').length;
    host.querySelector('[data-selected-count]').textContent = selected ? `${selected} selected` : 'Nothing selected yet';
    host.querySelector('[data-action="import"]').disabled = !selected || busy;
    host.querySelector('[data-action="scan"]').disabled = busy;
    host.querySelector('[data-action="cancel"]').hidden = !busy;
    host.querySelector('[data-action="next"]').hidden = !state.pageToken;
    host.querySelector('[data-action="next"]').disabled = busy;
  } finally { statusCache = null; cachedExpenses = null; }
}

function renderEmpty() {
  if (state.drafts.length) {
    return `<div class="empty-state"><div class="e-icon" aria-hidden="true">🔍</div><h4>Nothing matches this view</h4>
      <p>Choose All, or clear the search box, to see your other receipts again.</p>
      <button type="button" class="btn" data-action="show-all">Show all receipts</button></div>`;
  }
  if (state.lastScan) {
    return `<div class="empty-state"><div class="e-icon" aria-hidden="true">📭</div><h4>No receipts in that period</h4>
      <p>That search found no invoices or receipts. Try a longer period, or clear the keyword box to search more widely.</p>
      <button type="button" class="btn gold" data-preset="90">Widen to 3 months</button></div>`;
  }
  return `<div class="empty-state"><div class="e-icon" aria-hidden="true">🧾</div><h4>Your receipts will appear here</h4>
    <p>Scan a period to pull invoices and receipts out of your mail — including the ones inside PDFs and photos.</p>
    <button type="button" class="btn gold" data-action="scan">Scan the past 30 days</button></div>`;
}

function renderDraft(draft, open) {
  const status = statusOf(draft), locked = ['imported', 'queued', 'ignored'].includes(status);
  const source = state.emails[`${draft.account}:${draft.messageId}`];
  const field = (key, label, type = 'text') => `<label>${label}<input data-field="${key}" type="${type}" ${type === 'number' ? 'step="0.01" inputmode="decimal"' : ''} value="${esc(String(draft[key] ?? ''))}" ${locked ? 'disabled' : ''}></label>`;
  const problems = receiptProblems(draft);
  const skipped = (source?.fileParts || []).filter(file => file.skipped);
  return `<details class="finder-draft is-${status}" data-draft="${esc(draft.id)}" ${open ? 'open' : ''}>
    <summary><span class="finder-vendor">${esc(draft.vendor || 'Vendor needs review')}<small>${esc(draft.reference || draft.description || 'Receipt details')}</small></span>
      <span class="finder-money">${draft.amount === null ? '—' : esc(`${draft.currency || '?'} ${draft.amount.toFixed(2)}`)}</span>
      <span class="pill ${status === 'ready' || status === 'imported' ? 'green' : status === 'review' || status === 'duplicate' ? 'amber' : 'gray'}">${LABELS[status]}</span>
      <span class="finder-date">${esc(draft.date || 'Date unknown')}</span></summary>
    <div class="finder-review">
      <div class="finder-toolbar"><label class="finder-select"><input type="checkbox" data-select ${draft.selected ? 'checked' : ''} ${status !== 'ready' ? 'disabled' : ''}> Include in import</label>
        <span class="finder-meta">Confidence ${Math.round(draft.confidence * 100)}%</span>
        <span class="finder-meta">${esc(draft.paymentStatus)} · ${esc(draft.documentType)}</span></div>
      ${problems.length ? `<p class="finder-warning">${esc(problems.join('. '))}</p>` : ''}
      ${draft.error ? `<p class="finder-warning">${esc(draft.error)}</p>` : ''}
      ${skipped.length ? `<p class="finder-warning">${esc(skipped.map(file => file.skipped).join(' '))}</p>` : ''}
      ${status === 'duplicate' ? '<p class="finder-warning">Matches a saved expense. This receipt will not be imported again.</p>' : ''}
      <div class="finder-edit-grid">${field('vendor', 'Vendor')}${field('reference', 'Invoice / receipt number')}${field('description', 'Description')}
        ${field('date', 'Invoice date', 'date')}${field('dueDate', 'Due date', 'date')}${field('currency', 'Currency (ISO code)')}
        ${field('amount', 'Total', 'number')}${field('subtotal', 'Subtotal', 'number')}${field('tax', 'Tax', 'number')}${field('shipping', 'Shipping', 'number')}
        <label>Category<select data-field="category" ${locked ? 'disabled' : ''}>${deps.categories.map(category => `<option ${category === draft.category ? 'selected' : ''}>${esc(category)}</option>`).join('')}</select></label>
        <label>Payment status<select data-field="paymentStatus" ${locked ? 'disabled' : ''}>${['unknown', 'paid', 'unpaid', 'refunded'].map(value => `<option ${value === draft.paymentStatus ? 'selected' : ''}>${value}</option>`).join('')}</select></label></div>
      <details><summary>Line items (${draft.lineItems.length})</summary>
        <div class="finder-items">${draft.lineItems.map((item, index) => `<div class="finder-item" data-line="${index}">
          <label>Description<input data-line-field="description" value="${esc(item.description)}" ${locked ? 'disabled' : ''}></label>
          ${[['quantity', 'Quantity'], ['unitPrice', 'Unit price'], ['amount', 'Line total']].map(([key, label]) => `<label>${label}<input type="number" step="any" inputmode="decimal" data-line-field="${key}" value="${esc(String(item[key] ?? ''))}" ${locked ? 'disabled' : ''}></label>`).join('')}
          ${!locked ? '<button type="button" class="btn sm" data-remove-line>Remove line</button>' : ''}</div>`).join('')}</div>
        ${!locked ? '<button type="button" class="btn sm" data-add-line>Add line item</button>' : ''}</details>
      ${!locked ? `<label class="finder-select"><input type="checkbox" data-reviewed ${draft.reviewed ? 'checked' : ''}> I reviewed the source and corrected uncertain details</label>` : ''}
      <details><summary>Original email and attachments</summary><p>${esc(source?.from || draft.account)} · ${esc(source?.subject || '')}</p>
        <pre class="finder-email">${esc(source?.body || draft.sourceSnippet || 'Email not saved')}</pre>
        <a href="https://mail.google.com/mail/u/?authuser=${encodeURIComponent(draft.account)}#all/${encodeURIComponent(draft.messageId)}" target="_blank" rel="noopener noreferrer">Open original in Gmail</a>
        <div class="finder-toolbar">${(source?.fileParts || []).map((file, index) => file.base64 ? `<button type="button" class="btn sm" data-download="${index}">Download ${esc(file.name)}</button>` : '').join('')}</div></details>
      ${!locked ? '<button type="button" class="btn sm" data-dismiss>Dismiss receipt</button>' : ''}
      ${status === 'ignored' ? '<button type="button" class="btn sm" data-restore>Restore receipt</button>' : ''}
    </div></details>`;
}

async function onChange(event) {
  try {
    if (!active()) return;
    const el = event.target;
    if (el.hasAttribute('data-select-all')) {
      withStatusCache(() => visibleDrafts().forEach(draft => {
        if (statusOf(draft) === 'ready') { draft.selected = el.checked; draft.updatedAt = Date.now(); }
      }));
    } else {
      const id = el.closest('[data-draft]')?.dataset.draft;
      const draft = state.drafts.find(row => row.id === id);
      if (!draft) return;
      if (['queued', 'imported', 'ignored'].includes(draft.status)) return;
      draft.updatedAt = Date.now();
      if (el.hasAttribute('data-select')) draft.selected = el.checked;
      if (el.hasAttribute('data-reviewed')) { draft.reviewed = el.checked; draft.selected = el.checked; }
      if (el.dataset.field) {
        const key = el.dataset.field;
        let value = el.value;
        if (['amount', 'subtotal', 'tax', 'shipping'].includes(key)) value = receiptMoney(value);
        if (key === 'currency') value = value.trim().toUpperCase();
        if (key === 'lineItems') {
          value = JSON.parse(value);
          if (!Array.isArray(value) || value.some(item => !item || typeof item.description !== 'string'
            || ['quantity', 'unitPrice', 'amount'].some(k => item[k] != null && (typeof item[k] !== 'number' || !Number.isFinite(item[k]))))) {
            throw new Error('Line items must be an array with descriptions and numeric quantities / amounts');
          }
        }
        draft[key] = value;
      }
      if (el.dataset.lineField) {
        const item = draft.lineItems[Number(el.closest('[data-line]').dataset.line)];
        const key = el.dataset.lineField;
        item[key] = key === 'description' ? el.value : key === 'quantity'
          ? (el.value === '' ? null : Number(el.value)) : receiptMoney(el.value);
      }
    }
    await persist(); render();
  } catch (error) { report(error); }
}

function applyPreset(days) {
  const date = new Date(); date.setDate(date.getDate() - Number(days));
  host.querySelector('#finder-from').value = date.toISOString().slice(0, 10);
  host.querySelector('#finder-to').value = '';
}

async function onClick(event) {
  const button = event.target.closest('button');
  if (!button) return;
  try {
    if (!active()) throw new Error('Publisher access required');
    if (button.dataset.status) { filter = button.dataset.status; render(); return; }
    if (button.dataset.preset) {
      applyPreset(button.dataset.preset);
      // The widen-the-search button inside an empty result set is only useful
      // if it actually runs the wider search.
      if (button.closest('.empty-state')) { await scan(false); return; }
      host.querySelectorAll('[data-preset]').forEach(chip => chip.classList.toggle('active', chip === button));
      return;
    }
    if (button.dataset.toggle) {
      const pressed = button.getAttribute('aria-pressed') !== 'true';
      button.setAttribute('aria-pressed', String(pressed)); button.classList.toggle('active', pressed); return;
    }
    const draft = state.drafts.find(row => row.id === button.closest('[data-draft]')?.dataset.draft);
    if (draft && button.hasAttribute('data-restore')) { draft.status = 'draft'; draft.updatedAt = Date.now(); await persist(); render(); return; }
    if (draft && !['queued', 'imported', 'ignored'].includes(draft.status)) {
      if (button.hasAttribute('data-add-line')) { draft.lineItems.push({ description: '', quantity: null, unitPrice: null, amount: null }); draft.updatedAt = Date.now(); await persist(); render(); return; }
      if (button.hasAttribute('data-remove-line')) { draft.lineItems.splice(Number(button.closest('[data-line]').dataset.line), 1); draft.updatedAt = Date.now(); await persist(); render(); return; }
    }
    if (button.hasAttribute('data-download') && draft) {
      const file = state.emails[`${draft.account}:${draft.messageId}`]?.fileParts[Number(button.dataset.download)];
      if (!file?.base64) throw new Error('Attachment is not saved. Scan this email again.');
      downloadBlob(new Blob([decodeGmailBase64(file.base64)], { type: file.mime }), file.name); return;
    }
    if (button.hasAttribute('data-dismiss') && draft) { draft.status = 'ignored'; draft.selected = false; draft.updatedAt = Date.now(); await persist(); render(); return; }
    if (button.dataset.retryEmail) { await scanEmailRetry(button.dataset.retryEmail); return; }
    switch (button.dataset.action) {
      case 'connect': await toggleConnection(); break;
      case 'save-setup':
        state.endpoint = host.querySelector('#finder-endpoint').value.trim();
        if (state.endpoint && !FINDER_ENDPOINT_PATTERN.test(state.endpoint)) throw new Error('Enter a valid Apps Script deployment address, or leave the box empty to use your Google Sheet script');
        serviceReadyFor = '';
        await persist(); announce(state.endpoint ? 'Separate deployment address saved.' : 'Using your connected Google Sheet script.'); await runSetupCheck(); break;
      case 'check-setup': await runSetupCheck(); break;
      case 'use-sheets': await useSheetsScript(); break;
      case 'clear-failures': await clearRecordedFailures(); break;
      case 'scan': await scan(false); break;
      case 'next': await scan(true); break;
      case 'cancel': controller?.abort(); break;
      case 'retry': await resumeReceiptImports(); break;
      case 'retry-failed': await retryFailedEmails(); break;
      case 'import':
        withStatusCache(() => state.drafts.forEach(draft => {
          if (draft.selected && statusOf(draft) === 'ready') { draft.status = 'queued'; draft.selected = false; draft.updatedAt = Date.now(); }
        }));
        await persist(); render(); announce('Selected receipts saved for import. They will sync when connected.');
        await resumeReceiptImports(); break;
      case 'show-all': filter = 'all'; resultQuery = ''; host.querySelector('[data-result-search]').value = ''; render(); break;
      case 'forget':
        if (busy || flushing) throw new Error('Stop the scan and wait for imports to finish first');
        if (!await deps.confirm('Remove saved receipt drafts and source files from this device? Already imported expenses are kept.', { title: 'Clear finder data' })) return;
        await store.clear(uid); state = { ...emptyState(), endpoint: state.endpoint, account: state.account }; await persist(); render();
        announce('Saved finder drafts and source copies removed from this device. This cannot be undone here.'); break;
    }
  } catch (error) { report(error); }
}

async function toggleConnection() {
  if (tokenLive()) {
    await forgetToken();
    announce('Gmail disconnected on this device. Saved receipts remain available.');
    render(); return;
  }
  const granted = await window._fbConnectReceiptGmail();
  // Older builds handed back a bare token string; treat that as a full hour.
  const token = typeof granted === 'string' ? granted : granted?.token;
  const expiresAt = typeof granted === 'string' ? Date.now() + 55 * 60 * 1000 : Number(granted?.expiresAt) || 0;
  if (!token) throw new Error('Google did not grant Gmail access');
  accessToken = token; tokenExpiresAt = expiresAt;
  if (!active()) { accessToken = ''; tokenExpiresAt = 0; return; }
  state.account = (await client.profile()).emailAddress.toLowerCase();
  await persist();
  // Remembering the grant is the whole point: without this the publisher had to
  // reconnect Gmail on every visit, even seconds after the last one.
  await store.saveToken?.(uid, { token, expiresAt, account: state.account });
  render();
  announce(`Connected to ${state.account} with read-only access. You will stay connected on this device.`);
}

// Drops the saved separate deployment address so the finder falls back to the
// Google Sheet script. This is the whole remedy for a publisher still pointed
// at the retired standalone Receipt Finder.
async function useSheetsScript() {
  const sheets = deps?.service?.();
  if (!sheets) throw new Error('Connect your Google Sheet first, in the “Connect your Google Sheet” tab.');
  state.endpoint = '';
  serviceReadyFor = ''; serviceProblem = null;
  const field = host?.querySelector('#finder-endpoint');
  if (field) field.value = '';
  await persist();
  announce('Now using your Google Sheet script to read receipts.');
  await runSetupCheck();
  render();
}

async function clearRecordedFailures() {
  let dropped = 0;
  for (const [key, scan] of Object.entries(state.scans)) {
    if (scan.error) { delete state.scans[key]; dropped++; }
  }
  await persist(); render();
  announce(dropped ? `Cleared ${dropped} earlier failure${dropped === 1 ? '' : 's'}. Those emails will be read again on the next scan.` : 'There were no failures to clear.');
}

function paintSetupCheck(result) {
  serviceProblem = result.level === 'ready' ? null : result;
  const panel = host?.querySelector('[data-finder-check]');
  if (!panel) return;
  const pill = { ready: 'green', warn: 'amber', error: 'red' }[result.level];
  const glyph = { ready: '✓', warn: '●', error: '✕' }[result.level];
  const label = { ready: 'Ready', warn: 'Almost ready', error: 'Not ready' }[result.level];
  const canFallBack = result.fix === 'use-sheets' && state.endpoint && !!deps?.service?.();
  panel.className = `finder-check is-${result.level}`;
  panel.innerHTML = `<p><span class="pill ${pill}">${glyph} ${label}</span> ${esc(result.headline)}</p>`
    + (result.steps.length ? `<ol>${result.steps.map(step => `<li>${esc(step)}</li>`).join('')}</ol>` : '')
    + (canFallBack ? '<div class="finder-toolbar"><button type="button" class="btn gold sm" data-action="use-sheets">Use my Google Sheet script</button></div>' : '');
}

// Reads the deployment's own setup report so a missing key is named here,
// before a scan spends Gmail requests and paid AI calls on every email.
async function runSetupCheck() {
  const panel = host?.querySelector('[data-finder-check]');
  const button = host?.querySelector('[data-action="check-setup"]');
  if (!panel) return;
  const typed = host.querySelector('#finder-endpoint').value.trim();
  const endpoint = typed || activeEndpoint();
  if (button) button.disabled = true;
  panel.className = 'finder-check';
  panel.innerHTML = '<div class="skeleton-line"></div>';
  try {
    const result = await checkReceiptFinderService({ endpoint });
    paintSetupCheck(result);
    if (result.level === 'ready') { serviceReadyFor = endpoint; await dropFailuresFromOtherService(endpoint); }
    announce(result.level === 'ready' ? 'Receipt service is set up and ready to scan.' : `Receipt service is not ready yet. ${result.headline}`);
  } catch (error) {
    if (error.name === 'AbortError') { panel.replaceChildren(); return; }
    serviceProblem = { level: 'error', headline: error.message, steps: [] };
    panel.className = 'finder-check is-error';
    panel.innerHTML = `<p><span class="pill red">✕ Not ready</span> ${esc(error.message)}</p>`;
  } finally {
    if (button) button.disabled = false;
    // The gate at the top mirrors this panel, so it has to be repainted too —
    // the panel itself lives inside a disclosure the publisher may never open.
    render();
  }
}

// An unknown action on an older Google Sheet deployment falls through to its
// row-writing path, which would append junk to the publisher's spreadsheet. The
// deployment has to confirm it can read receipts before a single email is sent.
// Per-email failures belong to whichever service produced them. Once the
// publisher switches services, those failures say nothing about the new one —
// leaving them on screen turns a solved problem into a standing alarm, and
// leaving them in the record stops the emails being read again.
async function dropFailuresFromOtherService(endpoint) {
  if (state.lastEndpoint === endpoint) return;
  let dropped = 0;
  for (const [key, scan] of Object.entries(state.scans)) {
    if (scan.error && scan.endpoint !== endpoint) { delete state.scans[key]; dropped++; }
  }
  state.lastEndpoint = endpoint;
  await persist();
  if (dropped) render();
}

async function ensureServiceReady() {
  const endpoint = activeEndpoint();
  if (!endpoint) throw new Error('Connect your Google Sheet first — the finder reads receipts through that same script.');
  if (serviceReadyFor === endpoint) return endpoint;
  announce('Checking your receipt reading service…');
  const result = await checkReceiptFinderService({ endpoint });
  paintSetupCheck(result);
  render();
  if (result.level !== 'ready') throw new Error(`${result.headline} ${result.steps[0] || ''}`.trim());
  serviceReadyFor = endpoint;
  await dropFailuresFromOtherService(endpoint);
  return endpoint;
}

async function readCandidate(id, signal, endpoint) {
  const owner = uid, account = state.account, key = `${account}:${id}`;
  // An email read by an earlier scan is skipped rather than paid for twice —
  // but it still counts towards this scan's progress, or the bar stalls.
  if (state.scans[key]?.done) { scanDone++; scheduleRender(); return; }
  let email = state.emails[key];
  try {
    if (!email) email = await client.message(id, account, signal);
    // Attachments are fetched together rather than one after another; a receipt
    // email routinely carries several and they are independent downloads.
    await Promise.all(email.fileParts.map(file => client.attachment(id, file, signal)));
    if (signal.aborted || !active() || owner !== uid) throw new DOMException('Stopped', 'AbortError');
    state.emails[key] = email;
    await persist(); // Source bytes must survive before the AI result does.
    const result = await extractFoundReceipts({ endpoint, idToken: await deps.user().getIdToken(), email, signal });
    if (signal.aborted || !active() || owner !== uid) throw new DOMException('Stopped', 'AbortError');
    result.receipts.forEach((raw, index) => {
      const draft = normalizeFoundReceipt(raw, email, index);
      if (!deps.categories.includes(draft.category)) draft.category = deps.inferCategory(draft.vendor, draft.description);
      if (!state.drafts.some(row => row.id === draft.id)) state.drafts.push(draft);
    });
    // An email with no receipt in it will never be looked at again, so its
    // saved body and attachment bytes are dead weight. Dropping them keeps the
    // saved mailbox — and therefore every later save — from growing with every
    // scan of a mostly-ordinary inbox.
    if (!result.receipts.length) delete state.emails[key];
    state.scans[key] = { done: true, subject: email.subject, count: result.receipts.length };
    await persist();
  } catch (error) {
    if (error.name === 'AbortError' || !active() || uid !== owner) throw error;
    state.scans[key] = { error: error.message, subject: email?.subject || id, endpoint };
    await persist();
  }
  scanDone++;
  scheduleRender();
}

// Runs `worker` over `items` a few at a time. One rejection (only an abort can
// reach here — readCandidate records its own failures) stops the batch without
// leaving the other runners' rejections unhandled.
async function runPool(items, limit, worker) {
  let index = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) await worker(items[index++]);
  });
  const settled = await Promise.allSettled(runners);
  const failed = settled.find(entry => entry.status === 'rejected');
  if (failed) throw failed.reason;
}

async function scan(nextPage) {
  if (busy) return;
  if (!tokenLive()) throw new Error(state.account ? 'Reconnect Gmail to scan — it only takes a click.' : 'Connect Gmail first');
  if (!navigator.onLine) throw new Error('Reconnect to scan Gmail. Saved receipts are available offline.');
  const value = id => host.querySelector('#' + id).value;
  if (value('finder-from') && value('finder-to') && value('finder-from') > value('finder-to')) throw new Error('From date must be before the end date');
  const pressed = key => host.querySelector(`[data-toggle="${key}"]`).getAttribute('aria-pressed') === 'true';
  const query = nextPage ? state.lastQuery : receiptQuery({ query: value('finder-query'), after: value('finder-from'), before: value('finder-to'),
    sender: value('finder-sender'), attachments: pressed('attachments'), category: pressed('shipping') ? 'shipping' : pressed('invoices') ? 'invoices' : '' });
  // Claimed before the capability check, which is a network round trip: a
  // second click during it would otherwise start a second scan.
  busy = true; controller = new AbortController(); const signal = controller.signal;
  scanTotal = 0; scanDone = 0;
  const before = state.drafts.length;
  const failedBefore = Object.values(state.scans).filter(item => item.error).length;
  render();
  try {
    const endpoint = await ensureServiceReady();
    announce('Finding candidate emails…');
    const page = await client.list(query, nextPage ? state.pageToken : '', signal);
    const messages = page.messages || [];
    scanTotal = messages.length;
    render();
    if (!messages.length) {
      state.pageToken = page.nextPageToken || ''; state.lastQuery = query; state.lastScan = new Date().toISOString();
      await persist();
      announce('No emails matched that search. Try a longer period, a different keyword, or turn off the filter chips.');
      return;
    }
    await runPool(messages, SCAN_CONCURRENCY, message => readCandidate(message.id, signal, endpoint));
    // Commit the next cursor only after this page finishes, so Stop never skips emails.
    state.pageToken = page.nextPageToken || ''; state.lastQuery = query; state.lastScan = new Date().toISOString();
    await persist();
    const found = state.drafts.length - before;
    const failed = Object.values(state.scans).filter(item => item.error).length - failedBefore;
    announce([
      found ? `Found ${found} receipt${found === 1 ? '' : 's'} in ${messages.length} emails.` : `Read ${messages.length} emails — none of them held a receipt.`,
      failed > 0 ? `${failed} could not be read; use “Try those again”.` : '',
      state.pageToken ? 'There are more emails to check — use “Scan next 25 emails”.' : '',
    ].filter(Boolean).join(' '));
  } catch (error) {
    if (error.name === 'AbortError') announce('Scan stopped. Everything already read has been saved; scan again to carry on.');
    else throw error;
  } finally { busy = false; controller = null; scanTotal = 0; scanDone = 0; render(); }
}

async function retryFailedEmails() {
  const keys = Object.entries(state.scans).filter(([, scan]) => scan.error).map(([key]) => key);
  for (const key of keys) {
    if (busy) break;
    await scanEmailRetry(key).catch(report);
  }
}

async function scanEmailRetry(key) {
  if (busy) return;
  if (!tokenLive()) throw new Error('Reconnect Gmail to retry');
  if (!key.startsWith(state.account + ':')) throw new Error('Connect the original Gmail account to retry this email');
  const endpoint = await ensureServiceReady();
  busy = true; controller = new AbortController(); render();
  try {
    delete state.scans[key];
    await readCandidate(key.slice(state.account.length + 1), controller.signal, endpoint);
  } finally { busy = false; controller = null; render(); }
}

function stopReceiptFinder() { controller?.abort(); }

async function resumeReceiptImports() {
  if (flushing || !active() || !navigator.onLine) return;
  flushing = true;
  const owner = uid;
  try {
    await flushReceiptOutbox(state, {
      canSync: () => active() && uid === owner && navigator.onLine,
      expenses: deps.expenses, rate: deps.rate, commit: deps.commit, accept: deps.accept,
      save: persist, render,
      files: async email => {
        const output = [];
        const body = new File([`From: ${email.from}\nSubject: ${email.subject}\nDate: ${email.date}\n\n${email.body}`], 'email.txt', { type: 'text/plain' });
        const files = [{ file: body, name: 'email.txt' }, ...email.fileParts.map((part, index) => {
          if (!part.base64) throw new Error(`Original attachment missing: ${part.name}`);
          return { file: new File([decodeGmailBase64(part.base64)], part.name, { type: part.mime }), name: `${index}-${part.name.replace(/[^a-zA-Z0-9._-]/g, '_')}` };
        })];
        if (!email.savedFiles) email.savedFiles = {};
        for (const entry of files) {
          if (!active() || uid !== owner) throw new Error('Sign in as the same publisher to finish importing');
          if (!email.savedFiles[entry.name]) {
            let timer;
            try {
              const path = `email-imports/${encodeURIComponent(email.account)}/${email.id}/${entry.name}`;
              email.savedFiles[entry.name] = await Promise.race([
                deps.upload(entry.file, path),
                new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Receipt upload timed out. Retry pending imports.')), 45000); }),
              ]);
              if (!email.savedFiles[entry.name]) throw new Error('Receipt upload did not return a file link');
            } finally { clearTimeout(timer); }
            await persist();
          }
          output.push(email.savedFiles[entry.name]);
        }
        return output;
      },
    });
  } catch (error) { report(error); }
  finally { flushing = false; render(); }
}

export { startReceiptFinder, mountReceiptFinder, stopReceiptFinder, resumeReceiptImports };
