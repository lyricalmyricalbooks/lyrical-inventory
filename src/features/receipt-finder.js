import { escapeHtml as esc } from '../lib/html.js';
import { receiptQuery, normalizeFoundReceipt, receiptProblems, receiptReviewStatus, receiptMoney, receiptWorthReading, RECEIPT_STATUSES } from '../lib/receipt-finder.js';
import { createReceiptFinderClient, extractFoundReceipts, decodeGmailBase64, checkReceiptFinderService, testReceiptAiService, describeAiTest, systemicReceiptFailure, receiptDailySchedule, describeDailySweep } from '../lib/receipt-finder-client.js';
import { createReceiptFinderStore } from '../lib/receipt-finder-store.js';
import { flushReceiptOutbox } from '../lib/receipt-finder-outbox.js';
import { downloadBlob } from '../lib/download.js';
import '../styles/receipt-finder.css';

const LABELS = { all: 'All', ready: 'Ready', review: 'Needs review', duplicate: 'Duplicates', queued: 'Pending import', imported: 'Imported', ignored: 'Dismissed' };
const emptyState = () => ({ drafts: [], emails: {}, scans: {}, endpoint: '', account: '', lastScan: '', pageToken: '', lastQuery: '', lastEndpoint: '', lastHalt: '', gmailOff: false });

// Emails are read a few at a time rather than one after another. The AI call
// dominates each one, so this is the difference between a scan that takes a
// couple of minutes and one that takes twenty. Kept low on purpose: the script
// allows 30 extractions a minute and a burst would simply hit that wall.
const SCAN_CONCURRENCY = 3;

// Bumped whenever what decides "this email holds no receipt" changes — the
// search, the pre-check or the reading instructions. An email an older reader
// found nothing in is read once more under the new one instead of being skipped
// for good as "already checked"; one that did yield a receipt never is.
const READER_VERSION = 2;
const RENDER_INTERVAL_MS = 200;

let deps, host, state = emptyState(), uid = '', accessToken = '', tokenExpiresAt = 0;
let controller = null, busy = false, flushing = false, scanTotal = 0, scanDone = 0, scanSkipped = 0, scanCached = 0;
let filter = 'all', resultQuery = '', saveChain = Promise.resolve(), saveScheduled = false;
let initialized = false, restore = Promise.resolve(), serviceReadyFor = '', serviceProblem = null;
let statusCache = null, cachedExpenses = null, renderTimer = 0, haltReason = '', dailySweep = null;
// Keys deleted since the last write. The saved copy is merged rather than
// replaced (two open tabs must not undo each other), so a deletion has to be
// named to reach storage — see mergeFinderSnapshot.
const removedEmails = new Set(), removedScans = new Set();
const store = createReceiptFinderStore();
const client = createReceiptFinderClient({ token: () => accessToken, onExpired: () => { forgetToken().catch(() => {}); } });
const active = () => uid && deps?.user()?.uid === uid && deps.publisher();
const tokenLive = () => !!accessToken && tokenExpiresAt > Date.now();
// "Connected" is the publisher's choice, not the age of Google's pass. The pass
// a browser app is given lasts an hour and cannot be renewed in the background,
// which used to flip the panel to "Reconnect Gmail" every hour. Now it stays
// connected until they press Disconnect, and the pass is renewed as a scan
// starts — a Google window that opens and closes by itself at most.
const gmailLinked = () => tokenLive() || (!!state.account && !state.gmailOff);
// A page of 25 emails can take a few minutes, so a pass about to lapse is
// renewed before the scan rather than dying halfway through it.
const RENEW_WITHIN_MS = 10 * 60 * 1000;

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
  saveChain = saveChain.catch(() => {}).then(async () => {
    saveScheduled = false;
    if (!active() || uid !== savedUid) return undefined;
    const removed = { emails: [...removedEmails], scans: [...removedScans] };
    await store.save(savedUid, removed.emails.length || removed.scans.length ? { ...state, removed } : state);
    // Only what this write carried is settled; anything removed meanwhile
    // stays pending for the next one.
    removed.emails.forEach(key => removedEmails.delete(key));
    removed.scans.forEach(key => removedScans.delete(key));
    return undefined;
  });
  return saveChain;
}

function dropEmail(key) {
  delete state.emails[key];
  removedEmails.add(key);
}

function dropScan(key) {
  delete state.scans[key];
  removedScans.add(key);
}

// A different publisher's pending deletions must never be applied to this one's
// saved mailbox.
function resetRemovals() {
  removedEmails.clear(); removedScans.clear();
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
  // The address lives in the note underneath. Spelled out on the button it
  // made a banner-width, all-caps label that read as shouting.
  return gmailLinked() ? 'Disconnect Gmail' : 'Connect Gmail';
}

function renderConnection() {
  const pill = document.getElementById('email-account-pill');
  if (pill) {
    pill.textContent = gmailLinked() ? `● ${state.account}` : '○ Gmail not connected';
    pill.className = `pill ${gmailLinked() ? 'green' : 'gray'} email-connected-pill`;
  }
  const button = host?.querySelector('[data-action="connect"]');
  if (button) {
    button.textContent = connectionLabel();
    button.disabled = busy;
    // Disconnecting is the rare action, so it is the quiet button; connecting
    // is the one the panel is waiting for.
    button.className = gmailLinked() ? 'btn sm finder-conn-btn' : 'btn sm gold finder-conn-btn';
  }
  const note = host?.querySelector('[data-conn-note]');
  if (note) {
    note.textContent = gmailLinked()
      ? `Connected to ${state.account}, read-only. It stays connected: when Google needs to renew access, a small Google window may open for a moment as you scan, then close by itself.`
      : state.account
        ? `Gmail is disconnected on this device. Connect it again whenever you want to scan ${state.account}.`
        : 'Gmail is read-only: the app can read messages to find receipts and can never send, delete or change anything.';
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
  // An empty user here means "not resolved yet", not "signed out" — this runs
  // on every modal open and on every book reload, and treating a momentary gap
  // as a sign-out aborted whatever scan was running and wiped the mailbox view.
  // Real sign-out arrives on the auth callback below, which still clears both.
  if (!nextUid && uid) return;
  if (nextUid !== uid) {
    controller?.abort(); accessToken = ''; tokenExpiresAt = 0; state = emptyState(); uid = nextUid; resetRemovals();
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
        controller?.abort(); accessToken = ''; tokenExpiresAt = 0; uid = ''; state = emptyState(); resetRemovals();
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
  host.removeEventListener('keydown', onKeyDown);
  const from = new Date(); from.setDate(from.getDate() - 30);
  host.innerHTML = `
    <div class="finder-head">
      <div class="finder-head-text">
        <h4 class="finder-subhead">Scan your mailbox for receipts and line items</h4>
        <p class="finder-subcopy">Search Gmail, check extracted details, and file directly into Business Expenses. Read-only access.</p>
      </div>
      <div class="finder-conn">
        <button type="button" class="btn sm gold finder-conn-btn" data-action="connect">Connect Gmail</button>
      </div>
    </div>
    <p class="finder-conn-note" data-conn-note></p>
    <div class="finder-gate" data-finder-gate hidden></div>
    <section class="finder-search" aria-label="Search your mailbox">
      <div class="finder-filters">
        <div class="form-group finder-query"><label for="finder-query">Keywords or Gmail search</label>
          <input type="search" id="finder-query" placeholder="Leave blank for all receipts, or name a shop"></div>
        <div class="form-group finder-sender"><label for="finder-sender">Sender / vendor email</label>
          <input type="text" id="finder-sender" inputmode="email" placeholder="supplier@example.com"></div>
        <div class="form-group finder-date-from"><label for="finder-from">From date</label>
          <input type="date" id="finder-from" value="${from.toISOString().slice(0, 10)}"></div>
        <div class="form-group finder-date-to"><label for="finder-to">Through date</label>
          <input type="date" id="finder-to"></div>
      </div>
      <div class="finder-search-tools">
        <div class="finder-presets" role="group" aria-label="Quick filters">
          <button type="button" class="filter-chip" data-preset="7">🕒 Past 7 days</button>
          <button type="button" class="filter-chip" data-preset="30">📅 Past 30 days</button>
          <button type="button" class="filter-chip" data-preset="90">🗓️ Past 3 months</button>
          <span class="finder-presets-sep" aria-hidden="true"></span>
          <button type="button" class="filter-chip" data-toggle="attachments" aria-pressed="false">📎 With attachments</button>
          <button type="button" class="filter-chip" data-toggle="invoices" aria-pressed="false">🧾 Invoices &amp; bills</button>
          <button type="button" class="filter-chip" data-toggle="shipping" aria-pressed="false">📦 Shipping costs</button>
        </div>
        <div class="finder-run">
          <button type="button" class="btn gold lg" data-action="scan">Find invoices &amp; receipts</button>
          <button type="button" class="btn" data-action="cancel" hidden>Stop scan</button>
          <span class="finder-run-hint">Reads up to 25 messages at a time.</span>
        </div>
      </div>
      <div class="finder-auto">
        <label class="finder-select"><input type="checkbox" data-daily-toggle> Find receipts automatically, every morning</label>
        <span class="finder-auto-note" data-daily-note>Checking…</span>
      </div>
      <div class="finder-progress" data-finder-progress hidden>
        <div class="finder-progress-track"><div class="finder-progress-fill" data-progress-fill style="width:0%"></div></div>
        <span class="finder-progress-text" data-progress-text></span>
      </div>
      <p data-finder-status role="status" aria-live="polite">${state.lastScan ? `Last scan: ${esc(new Date(state.lastScan).toLocaleString())}` : 'Pick a period, then scan. Nothing is filed until you approve it.'}</p>
    </section>
    <div data-finder-alert></div>
    <div data-finder-errors></div>
    <div data-finder-summary class="finder-summary"></div>
    <div class="finder-toolbar" data-finder-tabs role="group" aria-label="Filter receipt status"></div>
    <div class="finder-listbar" data-finder-listbar>
      <label class="finder-select"><input type="checkbox" data-select-all> Select every ready receipt below</label>
      <input type="search" class="ledger-filter-input" data-result-search aria-label="Search found receipts" placeholder="Vendor, invoice number or description">
      <button type="button" class="btn" data-action="retry">Retry pending imports</button>
    </div>
    <div data-finder-list></div>
    <div class="finder-actionbar">
      <button type="button" class="btn" data-action="next" hidden>Scan next 25 emails</button>
      <span data-selected-count class="finder-count"></span>
      <button type="button" class="btn gold" data-action="import">Import selected</button>
    </div>`;
  host.addEventListener('click', onClick);
  host.addEventListener('change', onChange);
  host.addEventListener('keydown', onKeyDown);
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
  // A lapsed connection is already explained, with its one-click fix, in the
  // connection bar directly above. Repeating it here as a numbered step made
  // three separate notices say "reconnect" on one screen.
  if (!gmailLinked()) {
    steps.push({ title: 'Connect Gmail',
      body: 'Use the “Connect Gmail” button above to give the app read-only access, so it can look through your mail for receipts.' });
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
        : (serviceProblem.steps[0] || 'Try scanning again once this is fixed.'),
      action: canFallBack ? 'use-sheets' : '', cta: 'Use my Google Sheet script' });
  }
  return steps;
}

function renderGate() {
  const gate = host.querySelector('[data-finder-gate]');
  const steps = gateSteps();
  gate.hidden = steps.length === 0;
  if (!steps.length) { gate.replaceChildren(); return; }
  // gateSteps() never pushes more than two entries, so this never has to
  // spell out a bigger number.
  const count = steps.length === 1 ? 'One quick thing' : 'Two quick things';
  const heading = `${count} before ${state.lastScan ? 'you scan again' : 'your first scan'}`;
  gate.innerHTML = `<h4 class="finder-gate-hed">${esc(heading)}</h4><ol class="finder-gate-steps">${steps.map(step => `
    <li><strong>${esc(step.title)}</strong><span>${esc(step.body)}</span>
      ${step.action ? `<button type="button" class="btn gold sm" data-action="${esc(step.action)}">${esc(step.cta)}</button>` : ''}</li>`).join('')}</ol>`;
}

function renderDailySweep() {
  const toggle = host.querySelector('[data-daily-toggle]');
  const note = host.querySelector('[data-daily-note]');
  if (!toggle || !note) return;
  const wrap = toggle.closest('.finder-auto');
  // Only offered where the deployment can actually run it — an older script has
  // no trigger to arm, and a dead switch is worse than no switch.
  if (!dailySweep) { if (wrap) wrap.hidden = true; return; }
  if (wrap) wrap.hidden = false;
  toggle.checked = !!dailySweep.enabled;
  toggle.disabled = busy;
  note.textContent = describeDailySweep(dailySweep);
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

// One row per REASON, not per email. A scan that trips the same AI-key problem
// 86 times used to print 86 identical retry buttons under the results, which
// buried the single thing the publisher could actually act on.
function failureGroups() {
  const groups = new Map();
  Object.entries(state.scans).forEach(([key, scan]) => {
    if (!scan.error) return;
    const entry = groups.get(scan.error) || { reason: scan.error, keys: [] };
    entry.keys.push(key);
    groups.set(scan.error, entry);
  });
  return [...groups.values()].sort((a, b) => b.keys.length - a.keys.length);
}

function renderFailures() {
  const groups = failureGroups();
  if (!groups.length) return '';
  const total = groups.reduce((sum, group) => sum + group.keys.length, 0);
  const canRetry = !busy && gmailLinked();
  return `<details class="finder-failures"${groups.length <= 3 ? ' open' : ''}>
    <summary><span class="finder-failures-sum">Why ${total} email${total === 1 ? '' : 's'} couldn’t be read</span>
      <span class="finder-failures-hint">${groups.length === 1 ? 'One reason' : `${groups.length} reasons`}</span></summary>
    <ul class="finder-failures-list">${groups.map(group => `
      <li class="finder-failure">
        <span class="pill amber mono-num">${group.keys.length}</span>
        <p>${esc(group.reason)}</p>
        <button type="button" class="btn sm" data-retry-reason="${esc(group.reason)}" ${canRetry ? '' : 'disabled'}>Try ${group.keys.length === 1 ? 'it' : 'these'} again</button>
      </li>`).join('')}</ul>
    <p class="finder-failures-foot">${gmailLinked() ? '' : 'Connect Gmail above to try these again. '}Emails that can’t be read are never filed, and never charged twice — trying again only re-reads the ones listed here.</p>
  </details>`;
}

function renderAlert(counts) {
  const failed = Object.values(state.scans).filter(scan => scan.error);
  const failures = failed.length;
  const alert = host.querySelector('[data-finder-alert]');
  if (failures) {
    // Naming the reason here is the whole point. Saying only "could not be
    // read" and putting the cause in a collapsed list below the results left
    // the publisher staring at a count with no way to know what to do — and
    // the most common cause, a rejected AI key, is something only they can fix.
    const groups = failureGroups();
    alert.className = 'finder-alert is-warn';
    // Retrying needs Gmail. Offering the button while disconnected used to
    // answer one click with one "Reconnect Gmail" toast per failed email.
    const canRetry = !busy && gmailLinked();
    alert.innerHTML = `<span class="pill amber">● ${failures} couldn’t be read</span>
      <p>${failures === 1 ? 'One email' : `${failures} emails`} could not be read${groups.length > 1 ? `, for ${groups.length} different reasons — listed just below.` : `. ${esc(groups[0].reason)}`}${gmailLinked() ? '' : ' Connect Gmail above to try them again.'}</p>
      <button type="button" class="btn sm" data-action="retry-failed" ${canRetry ? '' : 'disabled'} title="${canRetry ? 'Read these emails again' : 'Connect Gmail first'}">Try all again</button>
      <button type="button" class="btn sm" data-action="clear-failures" ${busy ? 'disabled' : ''}>Clear these</button>
      ${state.lastHalt && !busy ? `<p class="finder-alert-note">The last scan also stopped early: ${esc(state.lastHalt)}</p>` : ''}`;
  } else if (state.lastHalt && !busy) {
    // Why the last scan stopped early. The status line said it once and was
    // overwritten by the next message; this stays until a scan gets through.
    alert.className = 'finder-alert is-warn';
    alert.innerHTML = `<span class="pill amber">● Scan stopped early</span>
      <p>${esc(state.lastHalt)} Nothing was marked as unreadable — the next scan picks up where this one stopped.</p>`;
  } else if (counts.queued) {
    // "They finish on their own once you are back online" is only true of a
    // receipt that is waiting for a connection. One that failed for a reason —
    // a missing exchange rate, an upload or storage refusal — never will, and
    // saying otherwise left it sitting in the queue with nobody told why.
    const stuck = state.drafts.filter(draft => draft.status === 'queued' && draft.error);
    alert.className = `finder-alert ${stuck.length ? 'is-warn' : 'is-info'}`;
    alert.innerHTML = stuck.length
      ? `<span class="pill amber">● ${counts.queued} not filed yet</span>
        <p>${stuck.length === 1 ? 'One receipt' : `${stuck.length} receipts`} could not be filed. ${esc(stuck[0].error)}</p>
        <button type="button" class="btn sm" data-action="retry" ${busy || flushing ? 'disabled' : ''}>Try filing again</button>`
      : `<span class="pill amber">● ${counts.queued} waiting</span>
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
    renderDailySweep();
    renderProgress();
    const counts = Object.fromEntries(RECEIPT_STATUSES.map(status => [status, 0]));
    state.drafts.forEach(draft => { counts.all++; counts[statusOf(draft)]++; });
    renderAlert(counts);
    host.querySelector('[data-finder-summary]').innerHTML = [
      ['ready', '✓', 'Ready to import', 'Checked and good to file', true],
      ['review', '👀', 'Needs your review', 'Missing or uncertain details', false],
      ['imported', '📁', 'Filed in expenses', 'Already in Business Expenses', false],
    ].map(([key, icon, label, sub, lead]) => `<div class="finder-stat${lead ? ' is-lead' : ''}${counts[key] ? '' : ' is-zero'} tone-${key}${filter === key ? ' is-active-filter' : ''}" data-status="${key}" role="button" tabindex="0" title="Filter by ${label}">
        <div class="finder-stat-icon" aria-hidden="true">${icon}</div>
        <div class="finder-stat-body"><span class="finder-stat-label">${label}</span>
          <strong class="finder-stat-val">${counts[key]}</strong>
          <span class="finder-stat-sub">${sub}</span></div></div>`).join('');
    // Seven chips reading "0" was most of the toolbar. Only statuses with
    // something in them are offered, plus All and whichever one is selected.
    const chips = RECEIPT_STATUSES.filter(status => status === 'all' || status === filter || counts[status]);
    host.querySelector('[data-finder-tabs]').hidden = !counts.all;
    host.querySelector('[data-finder-listbar]').hidden = !counts.all;
    host.querySelector('.finder-listbar [data-action="retry"]').hidden = !counts.queued;
    host.querySelector('[data-finder-tabs]').innerHTML = chips.map(status => `<button type="button" class="filter-chip${filter === status ? ' active' : ''}" data-status="${status}" aria-pressed="${filter === status}">${LABELS[status]} <span class="mono-num">${counts[status]}</span></button>`).join('');
    const drafts = visibleDrafts();
    const openIds = new Set(Array.from(host.querySelectorAll('details[data-draft][open]'), el => el.dataset.draft));
    host.querySelector('[data-finder-list]').innerHTML = drafts.length
      ? drafts.map(draft => renderDraft(draft, openIds.has(draft.id))).join('')
      : renderEmpty();
    host.querySelector('[data-finder-errors]').innerHTML = renderFailures();
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
      <span class="finder-date">${esc(draft.date || 'Date unknown')}</span>
      ${!locked ? '<button type="button" class="btn sm sys-target finder-draft-x" data-dismiss title="Not a receipt — dismiss it" aria-label="Dismiss this receipt">✕</button>' : '<span></span>'}</summary>
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
      ${status === 'ignored' ? '<button type="button" class="btn sm" data-restore>Restore receipt</button>' : ''}
    </div></details>`;
}

async function onChange(event) {
  try {
    if (!active()) return;
    const el = event.target;
    if (el.hasAttribute('data-daily-toggle')) { await setDailySweep(el.checked); return; }
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

async function onKeyDown(event) {
  if (event.key === 'Enter' || event.key === ' ') {
    const stat = event.target.closest('.finder-stat[data-status]');
    if (stat) {
      event.preventDefault();
      filter = stat.dataset.status;
      render();
    }
  }
}

async function onClick(event) {
  const statCard = event.target.closest('.finder-stat[data-status]');
  if (statCard) {
    try {
      if (!active()) throw new Error('Publisher access required');
      filter = statCard.dataset.status;
      render();
      return;
    } catch (error) { report(error); return; }
  }
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
    if (button.hasAttribute('data-dismiss') && draft) {
      // The button lives inside the row's <summary> now, so a plain click
      // would also toggle the row open — this is the one place that has to
      // be stopped explicitly.
      event.preventDefault();
      draft.status = 'ignored'; draft.selected = false; draft.updatedAt = Date.now(); await persist(); render(); return;
    }
    if (button.dataset.retryReason) { await retryFailedEmails(button.dataset.retryReason); return; }
    switch (button.dataset.action) {
      case 'connect': await toggleConnection(); break;
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
    }
  } catch (error) { report(error); }
}

async function toggleConnection() {
  if (gmailLinked()) {
    state.gmailOff = true;
    await forgetToken();
    await persist();
    announce('Gmail disconnected on this device. Saved receipts remain available.');
    render(); return;
  }
  await grantGmail();
  announce(`Connected to ${state.account} with read-only access. It stays connected until you disconnect it.`);
}

// Google answers a blocked or closed window with a code, not a sentence.
function gmailWindowProblem(error) {
  const code = String(error?.code || '');
  if (code === 'auth/popup-blocked') return 'Your browser blocked Google’s window. Allow pop-ups for this site, then try again.';
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return 'Google’s window was closed before Gmail access was renewed. Try again and let it finish — it closes by itself.';
  }
  if (code === 'auth/user-mismatch') return 'Choose the same Google account you sign in to this app with.';
  return error?.message || 'Google did not grant Gmail access';
}

// Renews an old or lapsing pass. Called first thing in a click, before any
// other wait, because browsers only let a click open Google's window while
// that click is still fresh.
async function ensureGmail() {
  if (accessToken && tokenExpiresAt - Date.now() > RENEW_WITHIN_MS) return;
  announce('Renewing Gmail access…');
  await grantGmail();
}

async function grantGmail() {
  let granted;
  try { granted = await window._fbConnectReceiptGmail(); }
  catch (error) { throw new Error(gmailWindowProblem(error)); }
  // Older builds handed back a bare token string; treat that as a full hour.
  const token = typeof granted === 'string' ? granted : granted?.token;
  const expiresAt = typeof granted === 'string' ? Date.now() + 55 * 60 * 1000 : Number(granted?.expiresAt) || 0;
  if (!token) throw new Error('Google did not grant Gmail access');
  accessToken = token; tokenExpiresAt = expiresAt;
  if (!active()) { accessToken = ''; tokenExpiresAt = 0; return; }
  state.account = (await client.profile()).emailAddress.toLowerCase();
  state.gmailOff = false;
  // A scan stopped by the lapsed connection is answered by reconnecting.
  if (/Gmail/.test(state.lastHalt)) state.lastHalt = '';
  await persist();
  // Remembering the grant is the whole point: without this the publisher had to
  // reconnect Gmail on every visit, even seconds after the last one.
  await store.saveToken?.(uid, { token, expiresAt, account: state.account });
  render();
}

// Drops the saved separate deployment address so the finder falls back to the
// Google Sheet script. This is the whole remedy for a publisher still pointed
// at the retired standalone Receipt Finder.
// The trigger lives in the publisher's Apps Script, so its own answer is the
// only truthful source for whether the daily scan is armed.
async function loadDailySweep(endpoint, report) {
  if (report && !report.capabilities?.receiptDailySweep) { dailySweep = null; return; }
  try {
    dailySweep = await receiptDailySchedule({ endpoint, op: 'status' });
  } catch { dailySweep = null; }
}

async function setDailySweep(enabled) {
  const endpoint = activeEndpoint();
  if (!endpoint) throw new Error('Connect your Google Sheet script first');
  dailySweep = await receiptDailySchedule({ endpoint, op: 'set', enabled, hour: dailySweep?.hour ?? 5 });
  render();
  announce(enabled
    ? 'The daily scan is on. It reads the previous day’s mail each morning and leaves anything it finds here for you to review.'
    : 'The daily scan is off. Receipts are only found when you scan by hand.');
}

async function useSheetsScript() {
  const sheets = deps?.service?.();
  if (!sheets) throw new Error('Connect your Google Sheet first, in the “Connect your Google Sheet” tab.');
  state.endpoint = '';
  serviceReadyFor = ''; serviceProblem = null;
  await persist();
  announce('Now using your Google Sheet script to read receipts.');
  await runSetupCheck();
  render();
}

async function clearRecordedFailures() {
  let dropped = 0;
  for (const [key, scan] of Object.entries(state.scans)) {
    if (scan.error) { dropScan(key); dropped++; }
  }
  await persist(); render();
  announce(dropped ? `Cleared ${dropped} earlier failure${dropped === 1 ? '' : 's'}. Those emails will be read again on the next scan.` : 'There were no failures to clear.');
}

// The gate card is the only place this result is shown now — there is no
// separate settings panel to paint it into — so this just records it and
// leaves the actual rendering to renderGate() on the next render() call.
function paintSetupCheck(result) {
  serviceProblem = result.level === 'ready' ? null : result;
}

// Reads the deployment's own setup report so a missing key is named in the
// gate, before a scan spends Gmail requests and paid AI calls on every email.
// Only reachable from the "Use my Google Sheet script" fix in the gate now —
// there is no separate manual check button to trigger it from.
async function runSetupCheck() {
  const endpoint = activeEndpoint();
  try {
    if (deps.hasAppAi?.() && !endpoint) {
      paintSetupCheck({ level: 'ready', headline: 'App AI keys are saved. Scans use Gemini first, then OpenRouter.', steps: [] });
      announce('App AI keys are saved and ready to scan.');
      return;
    }
    let result = await checkReceiptFinderService({ endpoint });
    // Settings being present is not the same as them working. When the
    // deployment can prove it, make it actually call Gemini once — a key Google
    // refuses used to report Ready here and then fail one email at a time.
    if (result.level === 'ready' && result.report?.capabilities?.receiptSelfTest) {
      try {
        result = describeAiTest(await testReceiptAiService({ endpoint, idToken: await deps.user().getIdToken() }));
      } catch (error) {
        if (error.name === 'AbortError') throw error;
        result = { level: 'error', headline: error.message, steps: ['Check that you are online and that the deployment is still active.'] };
      }
    }
    // If the script's AI key is broken (402, 401, 403…) but the user has
    // working in-app keys, report a warning rather than a hard failure —
    // the app will use the in-app key automatically when scanning.
    if (result.blocksScan && deps.hasAppAi?.()) {
      serviceReadyFor = 'app-ai';
      paintSetupCheck({ level: 'warn',
        headline: 'Script AI key problem — scanning will use your in-app AI key instead.',
        steps: [result.steps?.[0] || result.headline] });
      announce('Script AI key has a problem, but your in-app AI key will be used for scanning.');
      await dropFailuresFromOtherService(endpoint);
      return;
    }
    paintSetupCheck(result);
    if (result.level === 'ready') { serviceReadyFor = endpoint; await dropFailuresFromOtherService(endpoint); }
    announce(result.level === 'ready' ? 'Receipt service is set up and ready to scan.' : `Receipt service is not ready yet. ${result.headline}`);
  } catch (error) {
    if (error.name === 'AbortError') return;
    serviceProblem = { level: 'error', headline: error.message, steps: [] };
  } finally {
    // The gate mirrors this check, so it has to be repainted here too.
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
    if (scan.error && scan.endpoint !== endpoint) { dropScan(key); dropped++; }
  }
  state.lastEndpoint = endpoint;
  await persist();
  if (dropped) render();
}

async function ensureServiceReady() {
  const endpoint = activeEndpoint();
  if (!endpoint && deps.hasAppAi?.()) {
    serviceReadyFor = 'app-ai';
    paintSetupCheck({ level: 'ready', headline: 'App AI keys are saved. Scans use Gemini first, then OpenRouter.', steps: [] });
    return '';
  }
  if (!endpoint) throw new Error('Connect your Google Sheet first — the finder reads receipts through that same script.');
  if (serviceReadyFor === endpoint || serviceReadyFor === 'app-ai') return endpoint;
  announce('Checking your receipt reading service…');
  let result = await checkReceiptFinderService({ endpoint });
  // Prove the key before spending a single Gmail read on it. Checking only that
  // the setting exists is what let a scan work through a mailbox failing every
  // email in turn against a key Google was never going to accept. One tiny call,
  // then cached for the rest of the session by serviceReadyFor.
  if (result.level === 'ready' && result.report?.capabilities?.receiptSelfTest) {
    result = describeAiTest(await testReceiptAiService({ endpoint, idToken: await deps.user().getIdToken() }));
  }
  // If the script's AI key is blocking (e.g. 402 depleted credits, 401 bad key)
  // but the user has working in-app AI keys, silently fall back to those rather
  // than throwing. The script is still used for email fetching; only the AI
  // extraction step moves client-side.
  if (result.blocksScan && deps.hasAppAi?.()) {
    serviceReadyFor = 'app-ai';
    paintSetupCheck({ level: 'warn',
      headline: 'Script AI key problem — using your in-app AI key instead.',
      steps: [result.steps?.[0] || result.headline] });
    render();
    await dropFailuresFromOtherService(endpoint);
    await loadDailySweep(endpoint, result.report);
    return endpoint;
  }
  paintSetupCheck(result);
  render();
  // Only a problem the publisher has to go and fix stops the scan. A spent
  // allowance clears by itself, so letting them try costs one request and may
  // well work; the scan halts on its own at the first refusal either way.
  if (result.level !== 'ready' && result.blocksScan !== false) throw new Error(`${result.headline} ${result.steps[0] || ''}`.trim());
  serviceReadyFor = endpoint;
  await dropFailuresFromOtherService(endpoint);
  await loadDailySweep(endpoint, result.report);
  return endpoint;
}

async function readCandidate(id, signal, endpoint) {
  const owner = uid, account = state.account, key = `${account}:${id}`;
  // A halt raised by another reader must stop this one before it spends
  // anything, not after its own request comes back.
  if (signal.aborted) throw new DOMException('Stopped', 'AbortError');
  // An email read by an earlier scan is skipped rather than paid for twice —
  // but it still counts towards this scan's progress, or the bar stalls.
  const prior = state.scans[key];
  if (prior?.done && (prior.count > 0 || prior.reader === READER_VERSION)) { scanDone++; scanCached++; scheduleRender(); return; }
  let email = state.emails[key];
  try {
    if (!email) email = await client.message(id, account, signal);
    if (signal.aborted || !active() || owner !== uid) throw new DOMException('Stopped', 'AbortError');
    // No amount in the text and nothing attached: it cannot be a receipt, so it
    // is not worth an AI read. Most of a broad search is mail like this.
    if (!receiptWorthReading(email)) {
      dropEmail(key);
      state.scans[key] = { done: true, subject: email.subject, count: 0, skipped: 'no-amount', reader: READER_VERSION };
      scanSkipped++;
      await persist();
      scanDone++; scheduleRender();
      return;
    }
    // Attachments are fetched together rather than one after another; a receipt
    // email routinely carries several and they are independent downloads.
    await Promise.all(email.fileParts.map(file => client.attachment(id, file, signal)));
    if (signal.aborted || !active() || owner !== uid) throw new DOMException('Stopped', 'AbortError');
    state.emails[key] = email;
    await persist(); // Source bytes must survive before the AI result does.
    const useAppAi = deps.hasAppAi?.();
    const result = await extractFoundReceipts({ endpoint,
      idToken: useAppAi ? undefined : await deps.user().getIdToken(), email, signal,
      readAi: useAppAi ? deps.readAi : undefined });
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
    if (!result.receipts.length) dropEmail(key);
    state.scans[key] = { done: true, subject: email.subject, count: result.receipts.length, reader: READER_VERSION };
    await persist();
  } catch (error) {
    if (error.name === 'AbortError' || !active() || uid !== owner) throw error;
    // Every remaining email would fail the same way and spend another request
    // doing it. One exhausted allowance used to become 77 failed emails, and a
    // lapsed Gmail connection 86. Neither is the email's fault, so neither is
    // recorded against it: the next scan simply reads it again.
    const systemic = systemicReceiptFailure(error);
    if (systemic) {
      if (!haltReason) haltReason = systemic;
      controller?.abort();
    } else {
      state.scans[key] = { error: error.message, subject: email?.subject || id, endpoint };
      await persist();
    }
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
  if (!gmailLinked()) throw new Error('Connect Gmail first');
  if (!state.endpoint && !deps.hasAppAi?.() && !deps.service?.()) throw new Error('Save an AI key or connect your Google Sheet script before scanning');
  if (!navigator.onLine) throw new Error('You are offline. Scan once you are back online — saved receipts still work offline.');
  const value = id => host.querySelector('#' + id).value;
  if (value('finder-from') && value('finder-to') && value('finder-from') > value('finder-to')) throw new Error('From date must be before the end date');
  const pressed = key => host.querySelector(`[data-toggle="${key}"]`).getAttribute('aria-pressed') === 'true';
  const query = nextPage ? state.lastQuery : receiptQuery({ query: value('finder-query'), after: value('finder-from'), before: value('finder-to'),
    sender: value('finder-sender'), attachments: pressed('attachments'), category: pressed('shipping') ? 'shipping' : pressed('invoices') ? 'invoices' : '' });
  // Claimed before the capability check, which is a network round trip: a
  // second click during it would otherwise start a second scan.
  busy = true; controller = new AbortController(); const signal = controller.signal;
  scanTotal = 0; scanDone = 0; scanSkipped = 0; scanCached = 0; haltReason = '';
  const before = state.drafts.length;
  const failedBefore = Object.values(state.scans).filter(item => item.error).length;
  render();
  try {
    await ensureGmail();
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
    state.lastHalt = '';
    await persist();
    const found = state.drafts.length - before;
    const failed = Object.values(state.scans).filter(item => item.error).length - failedBefore;
    announce([
      found ? `Found ${found} receipt${found === 1 ? '' : 's'} in ${messages.length} emails.` : `Checked ${messages.length} emails — none of them held a new receipt.`,
      scanSkipped ? `${scanSkipped} had no amount or attachment, so no AI was spent on ${scanSkipped === 1 ? 'it' : 'them'}.` : '',
      scanCached ? `${scanCached} ${scanCached === 1 ? 'was' : 'were'} already checked in an earlier scan.` : '',
      failed > 0 ? `${failed} could not be read — the reasons are listed above.` : '',
      state.pageToken ? 'There are more emails to check — use “Scan next 25 emails”.' : '',
    ].filter(Boolean).join(' '));
  } catch (error) {
    if (error.name === 'AbortError') {
      if (haltReason) { state.lastHalt = haltReason; await persist().catch(() => {}); }
      announce(haltReason
        ? `Scan stopped after the first failure, so nothing more was spent on it. ${haltReason}`
        : 'Scan stopped. Everything already read has been saved; scan again to carry on.');
    } else throw error;
  } finally { busy = false; controller = null; scanTotal = 0; scanDone = 0; render(); }
}

// All the failures in one pass, a few at a time like a scan — not one scan per
// email, which re-checked the service and repainted the screen 86 times and,
// while Gmail was disconnected, answered one click with 86 error toasts.
async function retryFailedEmails(reason = '') {
  if (busy) return;
  if (!gmailLinked()) throw new Error('Connect Gmail first, then try these again.');
  const prefix = state.account + ':';
  const keys = Object.entries(state.scans)
    .filter(([key, scan]) => scan.error && (!reason || scan.error === reason) && key.startsWith(prefix))
    .map(([key]) => key);
  if (!keys.length) throw new Error('These emails belong to a different Gmail account. Connect that account to try them again.');
  // Claimed before the service check, a network round trip, so a second click
  // during it cannot start a second pass.
  busy = true; controller = new AbortController(); const signal = controller.signal;
  scanTotal = keys.length; scanDone = 0; scanSkipped = 0; scanCached = 0; haltReason = '';
  const failedBefore = keys.length;
  render();
  try {
    await ensureGmail();
    const endpoint = await ensureServiceReady();
    await runPool(keys, SCAN_CONCURRENCY, async key => {
      // A retry cut short (Stop, or a problem that halts the batch) leaves the
      // email exactly as listed before, rather than silently dropping it.
      const previous = state.scans[key];
      delete state.scans[key];
      try { await readCandidate(key.slice(prefix.length), signal, endpoint); }
      finally { if (!state.scans[key]) state.scans[key] = previous; }
    });
    state.lastHalt = '';
    await persist();
    const stillFailing = keys.filter(key => state.scans[key]?.error).length;
    announce(stillFailing
      ? `${failedBefore - stillFailing} of ${failedBefore} read this time. ${stillFailing} still could not be read.`
      : `All ${failedBefore} read this time.`);
  } catch (error) {
    if (error.name !== 'AbortError') throw error;
    if (haltReason) { state.lastHalt = haltReason; await persist().catch(() => {}); }
    announce(haltReason ? `Stopped retrying at the first failure, so nothing more was spent on it. ${haltReason}` : 'Stopped. Everything already read has been saved.');
  } finally { busy = false; controller = null; scanTotal = 0; scanDone = 0; render(); }
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
