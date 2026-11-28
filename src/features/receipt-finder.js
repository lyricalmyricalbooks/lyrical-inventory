import { escapeHtml as esc } from '../lib/html.js';
import { emailDay, emailSenderName as senderName, receiptQuery, normalizeFoundReceipt, receiptProblems, receiptReviewStatus, receiptReviewReasons, receiptMoney, receiptSkipReason, receiptWaitReason, RECEIPT_STATUSES } from '../lib/receipt-finder.js';
import { senderDomain, senderRule, normalizeSenderRules, withSenderRule, senderSuggestions, craRecordGaps, spotCheckAccuracy, sameOrderElsewhere } from '../lib/receipt-signals.js';
import { createReceiptFinderClient, extractFoundReceipts, decodeGmailBase64, checkReceiptFinderService, testReceiptAiService, describeAiTest, systemicReceiptFailure, receiptDailySchedule, describeDailySweep, fetchReceiptLink } from '../lib/receipt-finder-client.js';
import { createReceiptFinderStore } from '../lib/receipt-finder-store.js';
import { flushReceiptOutbox } from '../lib/receipt-finder-outbox.js';
import { downloadBlob } from '../lib/download.js';
import { localDayPlus } from '../lib/calendar-day.js';
import { matchDraftsToBank, bankSourceName, BANK_LOCAL_KEY } from '../lib/bank-match.js';
import { withTimeLimit } from '../lib/time-limit.js';
import '../styles/receipt-finder.css';

const LABELS = { all: 'All', ready: 'Ready', review: 'Needs review', duplicate: 'Duplicates', queued: 'Waiting to file', imported: 'Filed', ignored: 'Dismissed' };
// The three piles the screen is organised around. Each receipt status belongs
// to exactly one, so a receipt is never shown in two places or in none.
const PILES = {
  ready: { label: 'Ready to file', statuses: ['ready', 'queued'] },
  needs: { label: 'Needs you', statuses: ['review', 'duplicate'] },
  aside: { label: 'Not receipts', statuses: ['ignored'] },
  filed: { label: 'Filed', statuses: ['imported'] },
};

const emptyState = () => ({ drafts: [], emails: {}, scans: {}, endpoint: '', account: '', lastScan: '', pageToken: '', lastQuery: '', lastEndpoint: '', lastHalt: '', lastReport: null, senderRules: { never: [], always: [] }, linksDone: [] });

// Emails are read a few at a time rather than one after another. The AI call
// dominates each one, so this is the difference between a scan that takes a
// couple of minutes and one that takes twenty. Kept low on purpose: the script
// allows 30 extractions a minute and a burst would simply hit that wall.
const SCAN_CONCURRENCY = 3;

// Bumped whenever what decides "this email holds no receipt" changes — the
// search, the pre-check or the reading instructions. An email an older reader
// found nothing in is read once more under the new one instead of being skipped
// for good as "already checked"; one that did yield a receipt never is.
// 4: the subject, sender and date were never read before (every email came
// through blank), so the quick set-aside check judged each one on its body alone.
const READER_VERSION = 4;
const RENDER_INTERVAL_MS = 200;

let deps, host, state = emptyState(), uid = '', accessToken = '', tokenExpiresAt = 0;
let controller = null, busy = false, flushing = false, flushAgain = false, scanTotal = 0, scanDone = 0, scanSkipped = 0, scanCached = 0, scanFiled = 0;
// Message ids this scan must not pay to read: already filed as an expense by
// any route (this finder, the no-AI Gmail import, the Gmail add-on), or
// already holding a found receipt. Built once per scan, not once per email.
let knownMessages = null;
let filter = 'auto', resultQuery = '', saveChain = Promise.resolve(), saveScheduled = false;
let initialized = false, restore = Promise.resolve(), serviceReadyFor = '', serviceProblem = null;
let statusCache = null, cachedExpenses = null, renderTimer = 0, haltReason = '', dailySweep = null;
// Inbox or settings; which receipt fills the panel; whether the panel may pick
// the first receipt itself (until the publisher closes one on purpose).
let view = 'inbox', autoPick = true, bankMatches = null;
// Keys deleted since the last write. The saved copy is merged rather than
// replaced (two open tabs must not undo each other), so a deletion has to be
// named to reach storage — see mergeFinderSnapshot.
const removedEmails = new Set(), removedScans = new Set();
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
  if (!statusCache) return reviewStatus(draft, deps.expenses());
  let value = statusCache.get(draft);
  if (value === undefined) { value = reviewStatus(draft, cachedExpenses); statusCache.set(draft, value); }
  return value;
}

// A store's order confirmation and its receipt for the same order are two
// emails. With the same order number, only the earlier one is filed.
function reviewStatus(draft, expenses) {
  const status = receiptReviewStatus(draft, expenses);
  if ((status === 'ready' || status === 'review') && sameOrderElsewhere(draft, state.drafts)) return 'duplicate';
  return status;
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
  if (!tokenLive()) return state.account ? 'Reconnect Gmail' : 'Connect Gmail';
  return 'Disconnect Gmail';
}

// The header already says when Gmail was last checked. Weeks without a scan
// while Gmail sat disconnected means receipts are piling up unread, so that
// one case is spelled out, with the click that fixes it.
function staleScanNote() {
  const when = new Date(state.lastScan);
  if (!Number.isFinite(when.getTime()) || tokenLive()) return '';
  const days = Math.floor((Date.now() - when.getTime()) / 86400000);
  return days >= 7 ? `Gmail was last checked ${days} days ago, so newer receipts haven’t been looked at yet. Reconnect Gmail, then check again.` : '';
}

function renderConnection() {
  const bar = host?.querySelector('[data-conn-bar]');
  if (bar) {
    bar.dataset.state = tokenLive() ? 'on' : state.account ? 'lapsed' : 'off';
    bar.querySelector('[data-conn-title]').textContent = tokenLive()
      ? `Connected to ${state.account}`
      : state.account ? 'Gmail needs a quick reconnect' : 'Gmail is not connected';
  }
  const pill = document.getElementById('email-account-pill');
  if (pill) {
    // Says the same thing as the connection bar below it, never something else.
    pill.textContent = tokenLive() ? `● ${state.account}` : state.account ? '○ Reconnect Gmail' : '○ Gmail not connected';
    pill.className = `pill ${tokenLive() ? 'green' : 'gray'} email-connected-pill`;
    const actionHint = tokenLive()
      ? 'Connected to Gmail. Click to disconnect on this device.'
      : state.account
        ? 'Gmail needs a reconnect. Click to reconnect.'
        : 'Gmail is not connected. Click to connect.';
    pill.title = actionHint;
    pill.setAttribute('aria-label', actionHint);
  }
  const button = host?.querySelector('[data-action="connect"]');
  if (button) {
    button.textContent = connectionLabel();
    button.disabled = busy;
    button.className = tokenLive() ? 'btn sm ink finder-conn-btn' : 'btn sm gold finder-conn-btn';
  }
  const note = host?.querySelector('[data-conn-note]');
  if (note) {
    note.textContent = tokenLive()
      ? `Read-only, until ${new Date(tokenExpiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. The app can never send, delete or change mail.`
      : state.account
        ? `Access for ${state.account} has run out. One click reconnects — Google will not ask you to approve it again.`
        : 'Read-only: the app looks through your mail for receipts and can never send, delete or change anything.';
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
  host.removeEventListener('toggle', onToggle, true);
  host.innerHTML = `
    <div class="rf" data-rf data-rf-view="${view}">
    <header class="rf-head">
      <div class="rf-head-text">
        <p class="rf-crumb" data-rf-crumb><button type="button" class="rf-crumb-link" data-rf-view-btn="inbox">Receipts</button> <span aria-hidden="true">›</span> Settings</p>
        <h3 class="rf-title" data-rf-title tabindex="-1">Receipts</h3>
        <p class="rf-statusline"><span class="finder-dot is-ok" data-rf-dot aria-hidden="true"></span><span data-rf-statusline></span></p>
      </div>
      <div class="rf-head-actions">
        <label class="rf-search"><span class="sr-only">Search found receipts</span>
          <svg class="rf-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path></svg>
          <input type="search" class="ledger-filter-input" data-result-search placeholder="Search shop, invoice number or note"></label>
        <button type="button" class="btn rf-settings-btn" data-rf-view-btn="settings" aria-label="Receipt finder settings">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"></path></svg>
          <span class="rf-settings-word">Settings</span></button>
        <button type="button" class="btn finder-stop-btn" data-action="cancel" hidden>Stop</button>
        <button type="button" class="btn gold finder-day-btn" data-action="scan-day">Check yesterday’s mail</button>
      </div>
    </header>
    <div class="finder-conn-bar" data-conn-bar>
      <span class="finder-conn-dot" aria-hidden="true"></span>
      <div class="finder-conn-text">
        <strong class="finder-conn-title" data-conn-title>Gmail</strong>
        <span class="finder-conn-note" data-conn-note></span>
      </div>
      <button type="button" class="btn sm gold finder-conn-btn" data-action="connect">Connect Gmail</button>
    </div>
    <div class="finder-gate finder-next" data-finder-gate hidden></div>
    <div data-finder-alert></div>
    <div class="rf-progress-wrap">
      <div class="finder-progress" data-finder-progress hidden>
        <div class="finder-progress-track"><div class="finder-progress-fill" data-progress-fill style="width:0%"></div></div>
        <span class="finder-progress-text" data-progress-text></span>
      </div>
      <p class="finder-progress-now" data-progress-now aria-live="off"></p>
      <p class="finder-status" data-finder-status role="status" aria-live="polite">${state.lastScan ? esc(staleScanNote()) : 'Check yesterday’s mail, or search a longer period in Settings. Nothing is filed until you approve it.'}</p>
      <div data-finder-report></div>
    </div>
    <div class="rf-inbox" data-rf-inbox>
      <div class="rf-tiles" data-rf-tiles></div>
      <div class="finder-results-head" data-finder-results-head>
        <div class="finder-tabs finder-piles rf-tabs" data-finder-tabs role="group" aria-label="Show receipts by pile"></div>
        <div data-finder-errors></div>
        <div class="finder-listbar" data-finder-listbar>
          <label class="finder-select"><input type="checkbox" data-select-all> Select all ready</label>
          <button type="button" class="btn sm" data-action="retry">Retry pending imports</button>
        </div>
      </div>
      <div class="rf-work" data-rf-work>
        <div class="rf-colhead" aria-hidden="true"><span></span><span>Shop</span><span>Date</span><span class="rf-num">Total</span><span>Why it waits</span><span></span></div>
        <div class="finder-list" data-finder-list></div>
        <div class="rf-pane-empty" data-rf-pane-empty><p>Pick a receipt to see it here.</p></div>
      </div>
      <div class="finder-actionbar" data-finder-actionbar>
        <button type="button" class="btn" data-action="next" hidden>Check the next 25 emails</button>
        <span data-selected-count class="finder-count"></span>
        <button type="button" class="btn gold" data-action="import">File selected</button>
      </div>
    </div>
    <div class="rf-settings" data-rf-settings>
      <p class="rf-settings-lede">Everything that runs on its own, in one place. Nothing here needs looking at day to day.</p>
      <div class="rf-cards">
        <section class="rf-card" aria-labelledby="rf-s-gmail">
          <h4 id="rf-s-gmail">Gmail</h4>
          <div class="rf-line finder-auto"><p>Check Gmail every hour, even with the app closed<br><span class="rf-muted finder-auto-note" data-daily-note>Checking…</span></p>
            <label class="rf-switch"><input type="checkbox" role="switch" data-daily-toggle><span class="sr-only">Check Gmail every hour</span><span class="rf-switch-ui" aria-hidden="true"></span></label></div>
          <div class="rf-line"><p>Receipts behind a “view your receipt” link<br><span class="rf-muted">Downloaded for you. Sign-in pages are left for you below.</span></p></div>
          <div data-finder-links></div>
        </section>
        <section class="rf-card finder-search" aria-labelledby="rf-s-scan">
          <h4 id="rf-s-scan">Search old mail</h4>
          <p class="rf-muted">Pick a period. Mail already read is skipped, so a long period costs nothing extra.</p>
          <div class="finder-period" role="group" aria-label="Search a longer period">
            <button type="button" class="finder-period-btn" data-preset="0" aria-pressed="false">Today</button>
            <button type="button" class="finder-period-btn" data-preset="7" aria-pressed="false">7 days</button>
            <button type="button" class="finder-period-btn" data-preset="30" aria-pressed="true">30 days</button>
            <button type="button" class="finder-period-btn" data-preset="90" aria-pressed="false">3 months</button>
            <button type="button" class="finder-period-btn" data-preset="custom" aria-pressed="false">Pick dates…</button>
          </div>
          <details class="finder-more" data-more-filters>
            <summary>Narrow it down: keyword, sender, exact dates, PDFs only</summary>
            <div class="finder-narrow">
              <label class="finder-query-wrap" for="finder-query">
                <span class="sr-only">Shop, supplier or keyword</span>
                <input type="search" id="finder-query" autocomplete="off" placeholder="Shop, supplier or keyword (blank for every receipt)">
              </label>
              <div class="finder-presets" role="group" aria-label="Only look for">
                <button type="button" class="filter-chip" data-toggle="attachments" aria-pressed="false">Has a PDF or photo</button>
                <button type="button" class="filter-chip" data-toggle="invoices" aria-pressed="false">Invoices and bills</button>
                <button type="button" class="filter-chip" data-toggle="shipping" aria-pressed="false">Shipping costs</button>
              </div>
              <div class="finder-filters">
                <div class="form-group finder-sender"><label for="finder-sender">Only from this sender</label>
                  <input type="text" id="finder-sender" inputmode="email" autocomplete="off" placeholder="supplier@example.com"></div>
                <div class="form-group finder-date-from"><label for="finder-from">From</label>
                  <input type="date" id="finder-from" value="${localDayPlus(-30)}"></div>
                <div class="form-group finder-date-to"><label for="finder-to">Through</label>
                  <input type="date" id="finder-to"></div>
              </div>
              <button type="button" class="btn gold finder-scan-btn" data-action="scan">Find receipts</button>
            </div>
          </details>
        </section>
        <section class="rf-card" aria-labelledby="rf-s-senders">
          <h4 id="rf-s-senders">Senders</h4>
          <p class="rf-muted">The hourly check and your own searches follow these lists.</p>
          <div data-rf-senders></div>
        </section>
        <section class="rf-card finder-health" data-finder-health aria-labelledby="rf-s-health">
          <h4 id="rf-s-health">How well it reads</h4>
          <div class="rf-line"><p class="finder-health-item" data-health-reader></p>
            <button type="button" class="btn sm finder-test-btn" data-action="test-reader">Test the reader</button></div>
          <p class="rf-muted finder-health-item finder-accuracy" data-health-accuracy hidden></p>
        </section>
      </div>
    </div>
    </div>`;
  host.addEventListener('click', onClick);
  host.addEventListener('change', onChange);
  host.addEventListener('toggle', onToggle, true);
  const accountPill = document.getElementById('email-account-pill');
  if (accountPill && accountPill.dataset.rfConnectWired !== '1') {
    accountPill.dataset.rfConnectWired = '1';
    accountPill.addEventListener('click', () => {
      if (!busy && active()) toggleConnection().catch(report);
    });
  }
  host.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const row = event.target.closest?.('details[data-draft][open]');
    if (row?.querySelector(':scope > .finder-review:popover-open')) { row.open = false; row.querySelector('summary')?.focus(); }
  });
  host.querySelector('[data-result-search]').addEventListener('input', event => {
    resultQuery = event.target.value.toLowerCase(); render();
  });
  // Enter in any search field runs the search, as it would anywhere else.
  host.querySelectorAll('#finder-query, #finder-sender').forEach(input => input.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); scan(false).catch(report); }
  }));
  // Typing an exact date means the quick period no longer describes the search.
  host.querySelectorAll('#finder-from, #finder-to').forEach(input => input.addEventListener('input', () => markPeriod('custom')));
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
  const pile = currentPile();
  const statuses = PILES[pile]?.statuses || [pile];
  return state.drafts
    .filter(draft => (pile === 'all' || statuses.includes(statusOf(draft)))
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
  if (!tokenLive() && !state.account) {
    steps.push({ title: 'Connect Gmail',
      body: 'Use the “Connect Gmail” button above to give the app read-only access, so it can look through your mail for receipts.' });
  }
  if (!activeEndpoint()) {
    steps.push({ title: 'Connect your Google Sheet', body: 'The finder reads receipts through the same Google script that syncs your sheet. Set that up once in the “Connect your Google Sheet” tab and this step disappears.' });
  } else if (serviceProblem && serviceProblem.level !== 'warn') {
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
  gate.innerHTML = `<span class="finder-next-num" aria-hidden="true">${steps.length}</span><div class="finder-next-body"><h4 class="finder-gate-hed">${esc(heading)}</h4><ol class="finder-gate-steps">${steps.map(step => `
    <li><strong>${esc(step.title)}</strong><span>${esc(step.body)}</span>
      ${step.action ? `<button type="button" class="btn gold sm" data-action="${esc(step.action)}">${esc(step.cta)}</button>` : ''}</li>`).join('')}</ol></div>`;
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

// One line on whether the reader is set up, with a coloured dot. A problem the
// app is already working around (a spent script key while the app's own key
// covers it) belongs here, not in a numbered card that blocks the screen.
function renderHealth() {
  const item = host.querySelector('[data-health-reader]');
  if (!item) return;
  const warn = serviceProblem?.level === 'warn';
  const blocked = serviceProblem && !warn;
  const tone = blocked ? 'bad' : warn ? 'warn' : 'ok';
  const text = blocked ? 'Receipt reader needs setting up — see above'
    : warn ? 'Your Sheet script’s AI key has a problem — the app’s own key is covering it'
      : 'Receipt reader ready';
  item.innerHTML = `<i class="finder-dot is-${tone}" aria-hidden="true"></i><span>${esc(text)}</span>${warn && serviceProblem.steps?.[0] ? `<details class="finder-health-more"><summary>How to fix</summary><p>${esc(serviceProblem.steps[0])}</p></details>` : ''}`;
}

// Which pile is showing. Until the publisher picks one, open on whatever needs
// them: problems first, then receipts ready to file.
function currentPile(counts = pileCounts()) {
  if (filter !== 'auto') return filter;
  if (counts.needs) return 'needs';
  if (counts.ready) return 'ready';
  return counts.aside ? 'aside' : 'ready';
}

function pileCounts() {
  const counts = { ready: 0, needs: failureGroups().reduce((sum, group) => sum + group.keys.length, 0), aside: setAsideEmails().length, filed: 0 };
  state.drafts.forEach(draft => {
    const status = statusOf(draft);
    const pile = Object.keys(PILES).find(key => PILES[key].statuses.includes(status));
    if (pile) counts[pile]++;
  });
  return counts;
}

function renderPiles(counts, pile) {
  const hints = {
    ready: 'Approve and file them',
    needs: 'Couldn’t be read, or need a check',
    aside: 'Missing a receipt? It will be here',
    filed: 'Already in your expenses',
  };
  return ['needs', 'ready', 'filed', 'aside'].filter(key => key !== 'filed' || counts.filed).map(key => `<button type="button" class="finder-pile tone-${key}${pile === key ? ' active' : ''}${counts[key] ? '' : ' is-zero'}" data-status="${key}" aria-pressed="${pile === key}">
      <span class="finder-pile-top"><span class="finder-pile-name">${PILES[key].label}</span><span class="finder-pile-count">${counts[key]}</span></span>
      <span class="finder-pile-hint">${hints[key]}</span></button>`).join('');
}

// Each row of the last scan's report, in the order the publisher cares about:
// what needs them, what was found, then what was passed over and why.
const REPORT_WORDS = {
  failed: ['Couldn’t be read', 'bad'],
  found: ['New receipt found', 'ok'],
  'link-only': ['Receipt only behind a link', 'bad'],
  waiting: ['Already found, waiting in your piles', 'ok'],
  'found-before': ['Already found in an earlier scan', 'ok'],
  filed: ['Already in your expenses', 'ok'],
  dismissed: ['You dismissed this receipt earlier', 'muted'],
  aside: ['Not a receipt', 'muted'],
  'aside-before': ['Not a receipt (checked before)', 'muted'],
};
const REPORT_ORDER = Object.keys(REPORT_WORDS);

function renderReport() {
  const slot = host.querySelector('[data-finder-report]');
  if (!slot) return;
  const last = state.lastReport;
  const rows = (last?.rows || []).filter(row => row.key?.startsWith(state.account + ':'));
  if (busy || !rows.length) { slot.replaceChildren(); return; }
  const wasOpen = !!slot.querySelector('details[open]');
  const sorted = [...rows].sort((a, b) => REPORT_ORDER.indexOf(a.outcome) - REPORT_ORDER.indexOf(b.outcome));
  const tally = REPORT_ORDER.map(outcome => [outcome, rows.filter(row => row.outcome === outcome).length]).filter(([, n]) => n);
  const when = new Date(last.at);
  const whenText = Number.isFinite(when.getTime()) ? when.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
  slot.innerHTML = `<details class="finder-report"${wasOpen ? ' open' : ''}>
    <summary><span class="finder-report-sum">What this scan did${whenText ? ` <span class="finder-report-when">${esc(whenText)}</span>` : ''}</span>
      <span class="finder-report-tally">${esc(tally.map(([outcome, n]) => `${n} ${REPORT_WORDS[outcome][0].toLowerCase()}`).join(' · '))}</span></summary>
    <ul class="finder-report-list">${sorted.map(row => `
      <li class="finder-report-row is-${REPORT_WORDS[row.outcome]?.[1] || 'muted'}">
        <span class="finder-report-what"><strong>${esc(row.label || 'Email without a subject')}</strong>${row.detail ? `<small>${esc(row.detail)}</small>` : ''}</span>
        <span class="finder-report-outcome">${esc(REPORT_WORDS[row.outcome]?.[0] || row.outcome)}</span>
        <a class="finder-report-open" href="${esc(gmailLink(row.key))}" target="_blank" rel="noopener noreferrer" aria-label="Open in Gmail: ${esc((row.label || 'email').slice(0, 80))}">Open</a>
      </li>`).join('')}</ul>
  </details>`;
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
  host.querySelector('[data-progress-text]').textContent = `${scanDone} of ${scanTotal} emails read`;
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
  const canRetry = !busy && tokenLive();
  return `<details class="finder-failures"${groups.length <= 3 ? ' open' : ''}>
    <summary><span class="finder-failures-sum">Why ${total} email${total === 1 ? '' : 's'} couldn’t be read</span>
      <span class="finder-failures-hint">${groups.length === 1 ? 'One reason' : `${groups.length} reasons`}</span></summary>
    <ul class="finder-failures-list">${groups.map(group => `
      <li class="finder-failure">
        <span class="pill amber mono-num">${group.keys.length}</span>
        <p>${esc(group.reason)}</p>
        <button type="button" class="btn sm" data-retry-reason="${esc(group.reason)}" ${canRetry ? '' : 'disabled'}>Try ${group.keys.length === 1 ? 'it' : 'these'} again</button>
      </li>`).join('')}</ul>
    <p class="finder-failures-foot">${tokenLive() ? '' : 'Reconnect Gmail above to try these again. '}Emails that can’t be read are never filed, and never charged twice — trying again only re-reads the ones listed here.</p>
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
    alert.className = 'finder-alert finder-next is-warn';
    // Retrying needs Gmail. Offering the button while disconnected used to
    // answer one click with one "Reconnect Gmail" toast per failed email.
    const canRetry = !busy && tokenLive();
    const subject = failures === 1 ? Object.values(state.scans).find(scan => scan.error)?.subject : '';
    alert.innerHTML = `<span class="finder-next-num" aria-hidden="true">${failures}</span>
      <div class="finder-next-body"><h4>${failures === 1 ? 'One email couldn’t be read.' : `${failures} emails couldn’t be read.`} ${tokenLive() ? 'Try again.' : 'Reconnect Gmail above, then try again.'}</h4>
      <p>${subject ? `“${esc(subject)}” — ` : ''}${groups.length > 1 ? `${groups.length} different reasons, listed under “Needs you” below.` : esc(groups[0].reason)}</p>
      ${state.lastHalt && !busy ? `<p class="finder-alert-note">The last scan also stopped early: ${esc(state.lastHalt)}</p>` : ''}</div>
      <div class="finder-next-actions"><button type="button" class="btn gold sm" data-action="retry-failed" ${canRetry ? '' : 'disabled'} title="${canRetry ? 'Read these emails again' : 'Reconnect Gmail first'}">Try all again</button>
      <button type="button" class="btn sm" data-action="clear-failures" ${busy ? 'disabled' : ''}>Clear these</button></div>`;
  } else if (state.lastHalt && !busy) {
    // Why the last scan stopped early. The status line said it once and was
    // overwritten by the next message; this stays until a scan gets through.
    alert.className = 'finder-alert finder-next is-warn';
    alert.innerHTML = `<span class="finder-next-num" aria-hidden="true">!</span>
      <div class="finder-next-body"><h4>The last scan stopped early.</h4>
      <p>${esc(state.lastHalt)} Nothing was marked as unreadable — the next scan picks up where this one stopped.</p></div>`;
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

// The receipt panel sits beside the list only when there is room for both.
const wide = () => (host?.clientWidth || 0) >= 900;

// The bank check keeps a copy of its charges on this device. Matching the
// waiting receipts against it shows what each was paid with, and how many
// charges still have no receipt at all. Nothing here reaches the network.
function loadBankMatches() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(`${BANK_LOCAL_KEY}:${uid}`) || 'null'); } catch { saved = null; }
  const lines = Array.isArray(saved?.lines) ? saved.lines : [];
  if (!lines.length) return null;
  const from = localDayPlus(-90);
  const result = matchDraftsToBank(lines, cachedExpenses || deps.expenses(), state.drafts, { links: saved.links || {}, from });
  return { ...result, lines: lines.length };
}

function setView(next) {
  view = next === 'settings' ? 'settings' : 'inbox';
  const root = host?.querySelector('[data-rf]');
  if (root) root.dataset.rfView = view;
}

function statusLine() {
  if (busy) return 'Reading your mail now…';
  const parts = [];
  if (dailySweep?.enabled) parts.push('Gmail checked every hour');
  else if (tokenLive()) parts.push('Gmail connected');
  else parts.push(state.account ? 'Gmail needs a reconnect' : 'Gmail not connected');
  const when = new Date(state.lastScan);
  if (state.lastScan && Number.isFinite(when.getTime())) parts.push(`last ${when.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`);
  return parts.join(' · ');
}

function tile(label, value, sub, tone = '', action = '') {
  return `<div class="rf-tile${tone ? ` is-${tone}` : ''}"><span class="rf-tile-label">${esc(label)}</span>
    <strong class="rf-tile-value">${esc(String(value))}</strong><span class="rf-tile-sub">${action || esc(sub)}</span></div>`;
}

function sumText(drafts) {
  const byCurrency = new Map();
  drafts.forEach(draft => { if (typeof draft.amount === 'number') byCurrency.set(draft.currency || 'CAD', (byCurrency.get(draft.currency || 'CAD') || 0) + draft.amount); });
  if (!byCurrency.size) return 'nothing yet';
  const [first] = [...byCurrency.entries()].sort((a, b) => b[1] - a[1]);
  return `${money(Math.round(first[1] * 100) / 100, first[0])}${byCurrency.size > 1 ? ` + ${byCurrency.size - 1} more currenc${byCurrency.size === 2 ? 'y' : 'ies'}` : ''}`;
}

function renderView(piles) {
  setView(view);
  const settings = view === 'settings';
  host.querySelector('[data-rf-title]').textContent = settings ? 'Where receipts come from' : 'Receipts';
  host.querySelector('[data-rf-crumb]').hidden = !settings;
  host.querySelector('[data-rf-statusline]').textContent = statusLine();
  host.querySelector('[data-rf-dot]').className = `finder-dot is-${tokenLive() ? 'ok' : state.account ? 'warn' : 'off'}`;
  const settingsButton = host.querySelector('.rf-settings-btn');
  settingsButton.setAttribute('aria-pressed', String(settings));
  settingsButton.querySelector('.rf-settings-word').textContent = settings ? 'Done' : 'Settings';
  settingsButton.setAttribute('aria-label', settings ? 'Done with settings, back to receipts' : 'Receipt finder settings');
  const senders = host.querySelector('[data-rf-senders]');
  senders.innerHTML = renderSenderLists() || '<p class="rf-muted">No senders on either list yet. When you dismiss the same shop a few times, it is offered here.</p>';
  const ready = state.drafts.filter(draft => PILES.ready.statuses.includes(statusOf(draft)));
  const needs = state.drafts.filter(draft => PILES.needs.statuses.includes(statusOf(draft)));
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const filedNow = state.drafts.filter(draft => statusOf(draft) === 'imported' && (draft.updatedAt || 0) >= monthStart.getTime()).length;
  const score = spotCheckAccuracy(state.drafts);
  const bankTile = bankMatches
    ? tile('No receipt yet', bankMatches.missing.length, '', bankMatches.missing.length ? 'red' : '',
      `<button type="button" class="rf-tile-link" data-rf-bank>${bankMatches.missing.length ? 'See the bank charges' : 'Every charge has one'}</button>`)
    : tile('No receipt yet', '—', '', '', '<button type="button" class="rf-tile-link" data-rf-bank>Add a bank statement</button>');
  host.querySelector('[data-rf-tiles]').innerHTML = [
    tile('Ready to file', ready.length, sumText(ready)),
    tile('Needs you', piles.needs, needs.length ? sumText(needs) : piles.needs ? 'emails to read again' : 'all clear', piles.needs ? 'amber' : ''),
    bankTile,
    tile('Filed this month', filedNow, score.checked ? `${score.percent}% read right on spot checks` : 'by the finder'),
  ].join('');
}

function render() {
  if (!host?.querySelector('[data-finder-list]') || !active()) return;
  if (renderTimer) { clearTimeout(renderTimer); renderTimer = 0; }
  statusCache = new Map(); cachedExpenses = deps.expenses();
  try {
    renderConnection();
    renderGate();
    renderDailySweep();
    renderHealth();
    renderProgress();
    renderReport();
    renderLinkOnly();
    renderAccuracy();
    const counts = Object.fromEntries(RECEIPT_STATUSES.map(status => [status, 0]));
    state.drafts.forEach(draft => { counts.all++; counts[statusOf(draft)]++; });
    renderAlert(counts);
    // One row of status tabs replaces the three big count tiles that used to
    // sit above a second row of chips doing the same filtering. Ready and
    // Needs review are the two piles the publisher works through, so they are
    // always offered; the rest appear only once something is in them.
    const piles = pileCounts();
    const pile = currentPile(piles);
    host.querySelector('[data-finder-results-head]').hidden = !counts.all && !piles.needs && !piles.aside;
    host.querySelector('.finder-listbar [data-action="retry"]').hidden = !counts.queued;
    host.querySelector('[data-finder-listbar]').hidden = pile !== 'ready' && pile !== 'all';
    host.querySelector('[data-finder-tabs]').innerHTML = renderPiles(piles, pile);
    const drafts = visibleDrafts();
    bankMatches = loadBankMatches();
    renderView(piles);
    const openIds = new Set(Array.from(host.querySelectorAll('details[data-draft][open]'), el => el.dataset.draft));
    // On a wide screen the panel beside the list is never left blank while
    // there is something to look at: it opens the first receipt in the pile.
    if (autoPick && wide() && (pile === 'needs' || pile === 'ready') && drafts.length && !drafts.some(draft => openIds.has(draft.id))) openIds.add(drafts[0].id);
    host.querySelector('[data-finder-list]').innerHTML = drafts.length
      ? drafts.map(draft => renderDraft(draft, openIds.has(draft.id))).join('')
      : renderEmpty();
    host.querySelector('[data-rf-pane-empty]').hidden = !drafts.length || drafts.some(draft => openIds.has(draft.id));
    host.querySelectorAll('details[data-draft][open]').forEach(syncSheet);
    host.querySelector('[data-rf-work]').classList.toggle('is-empty', !drafts.length);
    host.querySelector('[data-finder-errors]').innerHTML = pile === 'needs' ? renderFailures() : pile === 'aside' ? renderSetAside() : '';
    if (pile === 'aside') queueMicrotask(() => labelSetAside().catch(() => {}));
    const ready = drafts.filter(draft => statusOf(draft) === 'ready');
    const all = host.querySelector('[data-select-all]');
    all.checked = ready.length > 0 && ready.every(draft => draft.selected);
    all.indeterminate = ready.some(draft => draft.selected) && !all.checked;
    all.disabled = ready.length === 0;
    const selected = state.drafts.filter(draft => draft.selected && statusOf(draft) === 'ready').length;
    host.querySelector('[data-selected-count]').textContent = selected
      ? `${selected} ready to file`
      : counts.ready ? 'Tick the receipts you want to file' : 'Nothing is ready to file yet';
    // The bar only earns its place when there is something to file or more
    // mail to check; with neither it was a disabled button under an empty list.
    host.querySelector('[data-finder-actionbar]').hidden = !counts.ready && !counts.queued && !state.pageToken;
    host.querySelector('[data-action="import"]').disabled = !selected || busy;
    host.querySelector('[data-action="scan"]').disabled = busy;
    host.querySelector('[data-action="test-reader"]').disabled = busy;
    host.querySelectorAll('[data-action="scan-day"]').forEach(button => { button.disabled = busy; });
    host.querySelectorAll('.finder-period [data-preset]').forEach(button => { button.disabled = busy; });
    host.querySelector('[data-action="cancel"]').hidden = !busy;
    host.querySelector('[data-action="next"]').hidden = !state.pageToken;
    host.querySelector('[data-action="next"]').disabled = busy;
  } finally { statusCache = null; cachedExpenses = null; }
}

function renderEmpty() {
  const pile = currentPile();
  if (pile === 'needs' && failureGroups().length) return '';
  if (pile === 'aside' && setAsideEmails().length) return '';
  if (state.drafts.length && pile !== 'all') {
    const words = { ready: ['Nothing to file right now', 'Receipts the finder is sure about land here, ready for one click.'],
      needs: ['Nothing needs you', 'Emails that couldn’t be read, and receipts worth a second look, land here.'],
      aside: ['Nothing set aside', 'Emails the finder decided weren’t receipts land here, so you can read one again.'],
      filed: ['Nothing filed yet', 'Receipts you file appear here.'] }[pile];
    if (words) return `<div class="empty-state"><h4>${words[0]}</h4><p>${words[1]}</p></div>`;
  }
  if (state.drafts.length) {
    return `<div class="empty-state"><div class="e-icon" aria-hidden="true">🔍</div><h4>Nothing matches this view</h4>
      <p>Choose All, or clear the search box, to see your other receipts again.</p>
      <button type="button" class="btn" data-action="show-all">Show all receipts</button></div>`;
  }
  // A scan whose emails were all already filed, dismissed or not receipts
  // found plenty, just nothing new. Saying "no receipts in that period" next to
  // a report listing them read as the finder being broken.
  if (state.lastScan && state.lastReport?.rows?.some(row => row.key?.startsWith(state.account + ':'))) {
    return `<div class="empty-state"><h4>Nothing new to file</h4>
      <p>The last scan didn’t turn up any new receipts. “What this scan did” above shows what happened to each email it checked.</p></div>`;
  }
  if (state.lastScan) {
    return `<div class="empty-state"><div class="e-icon" aria-hidden="true">📭</div><h4>No receipts in that period</h4>
      <p>That search found no invoices or receipts. Try a longer period, or clear the keyword box to search more widely.</p>
      <button type="button" class="btn gold" data-preset="90">Widen to 3 months</button></div>`;
  }
  return `<div class="empty-state"><div class="e-icon" aria-hidden="true">🧾</div><h4>Your receipts will appear here</h4>
    <p>Scan a period to pull invoices and receipts out of your mail — including the ones inside PDFs and photos.</p>
    <button type="button" class="btn gold" data-action="scan-day">Scan yesterday</button></div>`;
}

const shortDay = iso => {
  const day = iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00`) : null;
  return day && Number.isFinite(day.getTime()) ? day.toLocaleDateString([], { month: 'short', day: 'numeric' }) : '';
};
function money(amount, currency) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return '—';
  try { return new Intl.NumberFormat('en-CA', { style: 'currency', currency: currency || 'CAD' }).format(amount); } catch { return `${currency || '?'} ${amount.toFixed(2)}`; }
}

// Everything the receipt's panel asks the publisher to check, in one list.
function checkList(draft, status, locked, source) {
  const items = [...receiptProblems(draft)];
  if (!locked && !draft.reviewed && status !== 'duplicate') items.push(...receiptReviewReasons(draft));
  if (draft.filledFromEmail?.length && !draft.reviewed && !locked) items.push(filledNote(draft.filledFromEmail));
  if (draft.error) items.push(draft.error);
  (source?.fileParts || []).forEach(file => { if (file.skipped) items.push(file.skipped); });
  // Held only because the reader was unsure: say so, or the panel would ask
  // for a check without saying what to check.
  if (!items.length && status === 'review' && !draft.reviewed) items.push('The reader wasn’t sure about this one. Compare the total, date and shop with the receipt.');
  return [...new Set(items)];
}

function bankLine(draft) {
  const hit = bankMatches?.byDraft.get(draft.id);
  if (!hit) {
    return bankMatches?.lines ? `<p class="rf-bank is-none"><span class="finder-dot is-off" aria-hidden="true"></span>No bank charge for this amount yet</p>` : '';
  }
  const where = bankSourceName(hit.line.source);
  return `<p class="rf-bank ${hit.sure ? 'is-sure' : 'is-maybe'}">${hit.sure
    ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"></path></svg>'
    : '<span class="finder-dot is-warn" aria-hidden="true"></span>'}
    <span>${hit.sure ? 'Paid' : 'Maybe paid'} ${esc(shortDay(hit.line.date))} on ${esc(where)}${hit.sure ? ', same amount' : ` (${esc(hit.why.toLowerCase())})`}</span></p>`;
}

function renderDraft(draft, open) {
  const status = statusOf(draft), locked = ['imported', 'queued', 'ignored'].includes(status);
  const source = state.emails[`${draft.account}:${draft.messageId}`];
  const field = (key, label, type = 'text', wide = false) => {
    const warn = !locked && ((key === 'supplierTaxNumber' && craRecordGaps(draft).some(gap => gap.review && /GST/.test(gap.text)))
      || (key === 'amount' && (draft.amount === null || draft.amount === 0)) || (key === 'vendor' && !draft.vendor?.trim()));
    return `<label class="${wide ? 'rf-wide' : ''}${type === 'number' ? ' rf-numfield' : ''}">${label}<input data-field="${key}" type="${type}" ${type === 'number' ? 'step="0.01" inputmode="decimal"' : ''} ${warn ? 'class="is-warn" aria-invalid="true"' : ''} value="${esc(String(draft[key] ?? ''))}" ${locked ? 'disabled' : ''}></label>`;
  };
  const checks = checkList(draft, status, locked, source);
  const why = receiptWaitReason(draft, status);
  const domain = senderDomain(draft.from);
  const canNever = domain && senderRule(draft.from, senderRules()) !== 'never';
  const files = (source?.fileParts || []).filter(file => file.base64);
  const total = money(draft.amount, draft.currency);
  const fileable = !locked && status !== 'duplicate' && !receiptProblems(draft).length;
  const vendor = draft.vendor || 'Shop needs a name';
  return `<details class="finder-draft is-${status}" name="rf-receipt" data-draft="${esc(draft.id)}" ${open ? 'open' : ''}>
    <summary class="rf-row"><span class="rf-ini" aria-hidden="true">${esc((draft.vendor || '?').trim().charAt(0).toUpperCase() || '?')}</span>
      <span class="finder-vendor">${esc(vendor)}<small>${esc(draft.reference || draft.description || 'Receipt details')}${draft.attachments?.length ? `<span class="finder-att" title="Attachments kept with this receipt"> · ${draft.attachments.length} file${draft.attachments.length === 1 ? '' : 's'}</span>` : ''}</small></span>
      <span class="finder-date">${esc(shortDay(draft.date) || 'No date')}</span>
      <span class="finder-money">${esc(total)}</span>
      <span class="rf-why"><span class="pill ${why.tone}" title="${esc(why.text)}">${esc(why.text)}</span>${status !== 'review' && status !== 'duplicate' ? '' : `<span class="sr-only">${LABELS[status]}</span>`}</span>
      ${!locked ? '<button type="button" class="btn sm sys-target finder-draft-x" data-dismiss title="Not a receipt — dismiss it" aria-label="Dismiss this receipt">✕</button>' : '<span></span>'}</summary>
    <div class="finder-review" popover="manual">
      <div class="rf-detail-head">
        <button type="button" class="rf-back" data-rf-close aria-label="Back to receipts"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"></path></svg></button>
        <div class="rf-detail-title"><h4>${esc(vendor)}</h4><p>${esc([shortDay(draft.date), draft.reference, LABELS[status]].filter(Boolean).join(' · '))}</p></div>
        <strong class="rf-detail-total">${esc(total)}</strong>
      </div>
      <div class="rf-detail-body">
        <div class="rf-doc">
          <span class="rf-doc-thumb" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><path d="M14 3v6h6"></path></svg></span>
          <span class="rf-doc-text"><strong>${esc(files[0]?.name || draft.attachments?.[0]?.name || 'The email itself')}</strong><span>${esc([draft.receiptLink ? 'From the receipt link' : source?.subject ? 'From the email' : '', shortDay(source?.date ? emailDay(source.date) : '')].filter(Boolean).join(' · ') || draft.account)}</span></span>
          <span class="rf-doc-actions">${files.map(file => `<button type="button" class="btn sm" data-download="${(source.fileParts || []).indexOf(file)}">Download${files.length > 1 ? ` ${esc(file.name)}` : ''}</button>`).join('')}
            <a class="btn sm" href="https://mail.google.com/mail/u/?authuser=${encodeURIComponent(draft.account)}#all/${encodeURIComponent(draft.messageId)}" target="_blank" rel="noopener noreferrer">Open in Gmail</a></span>
        </div>
        ${checks.length ? `<div class="rf-check finder-reasons" role="note"><strong>Check ${checks.length === 1 ? '1 thing' : `${checks.length} things`}</strong><ul>${checks.map(text => `<li>${esc(text)}</li>`).join('')}</ul></div>` : ''}
        ${status === 'duplicate' ? duplicateNote(draft) : ''}
        <div class="finder-edit-grid rf-fields">${field('vendor', 'Shop or supplier', 'text', true)}
          ${field('supplierTaxNumber', 'Seller’s GST/HST number', 'text', true)}
          ${field('amount', 'Total', 'number')}${field('currency', 'Currency')}
          ${field('subtotal', 'Subtotal', 'number')}${field('tax', 'Tax', 'number')}
          ${field('date', 'Invoice date', 'date')}
          <label>Category<select data-field="category" ${locked ? 'disabled' : ''}>${deps.categories.map(category => `<option ${category === draft.category ? 'selected' : ''}>${esc(category)}</option>`).join('')}</select></label>
          ${field('reference', 'Invoice or receipt number')}${field('shipping', 'Shipping', 'number')}
          ${field('description', 'What was bought', 'text', true)}
          ${field('dueDate', 'Due date', 'date')}
          <label>Payment<select data-field="paymentStatus" ${locked ? 'disabled' : ''}>${['unknown', 'paid', 'unpaid', 'refunded'].map(value => `<option ${value === draft.paymentStatus ? 'selected' : ''}>${value}</option>`).join('')}</select></label></div>
        ${bankLine(draft)}
        ${craReminders(draft)}
        <details class="rf-more"><summary>Line items (${draft.lineItems.length})</summary>
          <div class="finder-items">${draft.lineItems.map((item, index) => `<div class="finder-item" data-line="${index}">
            <label>Description<input data-line-field="description" value="${esc(item.description)}" ${locked ? 'disabled' : ''}></label>
            ${[['quantity', 'Quantity'], ['unitPrice', 'Unit price'], ['amount', 'Line total']].map(([key, label]) => `<label>${label}<input type="number" step="any" inputmode="decimal" data-line-field="${key}" value="${esc(String(item[key] ?? ''))}" ${locked ? 'disabled' : ''}></label>`).join('')}
            ${!locked ? '<button type="button" class="btn sm" data-remove-line>Remove line</button>' : ''}</div>`).join('')}</div>
          ${!locked ? '<button type="button" class="btn sm" data-add-line>Add line item</button>' : ''}</details>
        <details class="rf-more"><summary>Original email</summary><p class="rf-muted">${esc(source?.from || draft.account)} · ${esc(source?.subject || '')}</p>
          <pre class="finder-email">${esc(source?.body || draft.sourceSnippet || 'Email not saved')}</pre></details>
        ${draft.taxLines?.length ? `<p class="finder-note">Tax charged: ${esc(draft.taxLines.map(line => `${line.name || 'Tax'}${line.rate != null ? ` ${line.rate}%` : ''} ${line.amount != null ? line.amount.toFixed(2) : '?'}`).join(' · '))}</p>` : ''}
        ${draft.history?.length ? `<p class="finder-note">Changed by you: ${esc([...new Set(draft.history.map(h => FIELD_WORDS[h.field] || h.field))].join(', '))}</p>` : ''}
        <div class="finder-toolbar rf-meta">
          ${!locked ? `<label class="finder-select"><input type="checkbox" data-reviewed ${draft.reviewed ? 'checked' : ''}> I checked it against the receipt</label>` : ''}
          <label class="finder-select"><input type="checkbox" data-select ${draft.selected ? 'checked' : ''} ${status !== 'ready' ? 'disabled' : ''}> Include in “File selected”</label>
          <span class="finder-meta">Read with ${Math.round(draft.confidence * 100)}% confidence · ${esc(draft.paymentStatus)} · ${esc(draft.documentType)}</span>
        </div>
      </div>
      ${!locked ? `<div class="rf-detail-foot">
        <button type="button" class="btn" data-dismiss>Not a receipt</button>
        ${canNever ? `<button type="button" class="btn quiet rf-never" data-never="${esc(domain)}" title="Never read emails from ${esc(domain)}">Never read this shop</button>` : ''}
        <button type="button" class="btn gold rf-file" data-file-one ${fileable && !busy ? '' : 'disabled'} title="${fileable ? 'File this receipt as an expense' : 'Fix what is listed above first'}">Looks right, file it</button>
      </div>` : status === 'queued' && draft.error ? `<div class="rf-detail-foot">
        <button type="button" class="btn" data-unqueue>Edit again</button>
        <button type="button" class="btn gold" data-action="retry" ${busy || flushing ? 'disabled' : ''}>Try filing again</button>
      </div>` : status === 'ignored' ? `<div class="rf-detail-foot"><button type="button" class="btn" data-restore>Restore receipt</button>
        ${canNever ? `<button type="button" class="btn" data-never="${esc(domain)}">Never read emails from ${esc(domain)}</button>` : ''}</div>` : ''}
    </div></details>`;
}

const FIELD_WORDS = { vendor: 'vendor', reference: 'invoice number', description: 'description', date: 'date', dueDate: 'due date',
  currency: 'currency', amount: 'total', subtotal: 'subtotal', tax: 'tax', shipping: 'shipping', category: 'category',
  paymentStatus: 'payment status', supplierTaxNumber: 'GST/HST number', lineItems: 'line items' };

function duplicateNote(draft) {
  const other = sameOrderElsewhere(draft, state.drafts);
  const why = other
    ? `Same order number as the receipt from ${esc(other.vendor || 'this store')}${other.date ? ` dated ${esc(other.date)}` : ''} in another email. Only one is filed.`
    : 'Matches a saved expense. This receipt will not be imported again.';
  return `<div class="finder-warning finder-dup"><p>${why}</p><button type="button" class="btn sm" data-not-duplicate>It’s a different purchase</button></div>`;
}

function craReminders(draft) {
  const notes = craRecordGaps(draft).filter(gap => !gap.review);
  return notes.length ? `<p class="finder-note">${esc(notes.map(gap => gap.text).join(' '))}</p>` : '';
}

function filledNote(fields) {
  const names = fields.map(field => ({ vendor: 'vendor', date: 'invoice date' }[field] || field));
  return `The AI couldn’t find the ${names.join(' or ')}, so ${names.length === 1 ? 'it was' : 'they were'} taken from the email’s ${fields.map(field => field === 'date' ? 'send date' : 'sender').join(' and ')}.`;
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
        if (JSON.stringify(draft[key] ?? null) !== JSON.stringify(value ?? null)) noteEdit(draft, key, draft[key], value);
        draft[key] = value;
      }
      if (el.dataset.lineField) {
        const item = draft.lineItems[Number(el.closest('[data-line]').dataset.line)];
        const key = el.dataset.lineField;
        const value = key === 'description' ? el.value : key === 'quantity'
          ? (el.value === '' ? null : Number(el.value)) : receiptMoney(el.value);
        if (item[key] !== value) noteEdit(draft, 'lineItems', item[key], value);
        item[key] = value;
      }
    }
    await persist(); render();
  } catch (error) { report(error); }
}

// Who changed what, kept on the receipt: the record of a correction, and how
// a spot check knows whether the reader had it right.
function noteEdit(draft, field, from, to) {
  draft.editedFields = [...new Set([...(draft.editedFields || []), field])];
  draft.history = [...(draft.history || []), { at: new Date().toISOString(), field, from: from ?? null, to: to ?? null }].slice(-50);
}

function markPeriod(preset) {
  host.querySelectorAll('.finder-period [data-preset]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.preset === preset));
  });
}

function applyPreset(preset) {
  markPeriod(preset);
  if (preset === 'custom') {
    // The exact dates live in the "Sender and exact dates" drawer; picking
    // them opens it and puts the cursor where the typing starts.
    const more = host.querySelector('[data-more-filters]');
    more.open = true;
    host.querySelector('#finder-from').focus();
    return;
  }
  host.querySelector('#finder-from').value = localDayPlus(-Number(preset));
  host.querySelector('#finder-to').value = '';
}

// Opening a receipt fills the panel; closing the open one on purpose stops the
// panel from picking another until the pile changes.
// On a phone the open receipt covers the screen. The panel it sits in is a
// size container, which would trap a fixed sheet inside it, so the receipt is
// raised to the top layer as a popover instead, and lowered when it closes.
function syncSheet(row) {
  const sheet = row.querySelector(':scope > .finder-review');
  if (!sheet?.showPopover) return;
  const raised = sheet.matches(':popover-open');
  if (row.open && !wide() && (host?.clientWidth || 0) < 640) { if (!raised) sheet.showPopover(); }
  else if (raised) sheet.hidePopover();
}

function onToggle(event) {
  const row = event.target;
  if (row instanceof HTMLElement && row.matches('details[data-aside]')) { asideOpen = row.open; return; }
  if (!(row instanceof HTMLElement) || !row.matches('details[data-draft]')) return;
  const empty = host?.querySelector('[data-rf-pane-empty]');
  syncSheet(row);
  if (row.open) { if (empty) empty.hidden = true; return; }
  if (!host.querySelector('details[data-draft][open]')) {
    autoPick = false;
    if (empty) empty.hidden = !host.querySelector('details[data-draft]');
  }
}

async function onClick(event) {
  const button = event.target.closest('button');
  if (!button) return;
  try {
    if (!active()) throw new Error('Publisher access required');
    if (button.dataset.status) { filter = button.dataset.status; autoPick = true; render(); return; }
    if (button.dataset.rfViewBtn) {
      setView(view === 'settings' && button.dataset.rfViewBtn === 'settings' ? 'inbox' : button.dataset.rfViewBtn);
      render(); host.querySelector('[data-rf-title]')?.focus?.(); return;
    }
    if (button.hasAttribute('data-rf-bank')) { window.switchEmailImportTab?.('bank'); return; }
    if (button.hasAttribute('data-rf-close')) {
      const row = button.closest('details[data-draft]');
      if (row) { row.open = false; autoPick = false; row.querySelector('summary')?.focus(); }
      return;
    }
    if (button.dataset.preset) {
      applyPreset(button.dataset.preset);
      if (button.dataset.preset !== 'custom' && tokenLive()) setView('inbox');
      // A period button is a scan button: picking "7 days" means "look through
      // the last 7 days". Before Gmail is connected it only sets the period.
      if (button.dataset.preset !== 'custom' && tokenLive()) { await scan(false); return; }
      return;
    }
    if (button.dataset.toggle) {
      const pressed = button.getAttribute('aria-pressed') !== 'true';
      button.setAttribute('aria-pressed', String(pressed)); button.classList.toggle('active', pressed); return;
    }
    const draft = state.drafts.find(row => row.id === button.closest('[data-draft]')?.dataset.draft);
    if (draft && button.hasAttribute('data-restore')) { draft.status = 'draft'; draft.updatedAt = Date.now(); await persist(); render(); return; }
    if (draft && button.hasAttribute('data-unqueue') && draft.status === 'queued') {
      draft.status = 'draft'; draft.error = ''; draft.updatedAt = Date.now();
      await persist(); render();
      announce('Moved back to review so you can edit or dismiss it.');
      return;
    }
    if (draft && button.hasAttribute('data-not-duplicate')) {
      draft.notDuplicate = true; draft.updatedAt = Date.now(); await persist(); render();
      announce('Kept as a separate purchase. It now waits with your other receipts.'); return;
    }
    if (button.dataset.never) {
      // From an open receipt it also sets this one aside, which is what
      // "never read this shop" means for the receipt in front of you.
      if (draft && !['queued', 'imported', 'ignored'].includes(draft.status)) { draft.status = 'ignored'; draft.selected = false; draft.updatedAt = Date.now(); autoPick = true; await persist(); }
      await setSenderRule(button.dataset.never, 'never'); render(); return;
    }
    if (draft && button.hasAttribute('data-file-one')) { await fileOne(draft); return; }
    if (button.dataset.forgetSender) { await setSenderRule(button.dataset.forgetSender, ''); return; }
    if (button.dataset.linkDone) {
      state.linksDone = [...new Set([...(state.linksDone || []), button.dataset.linkDone])].slice(-200);
      await persist(); render(); return;
    }
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
      draft.status = 'ignored'; draft.selected = false; draft.updatedAt = Date.now(); autoPick = true; await persist(); render(); return;
    }
    if (button.dataset.reread) { await rereadSetAside(button.dataset.reread); return; }
    if (button.dataset.asideClear) { await clearSetAside([button.dataset.asideClear]); return; }
    if (button.hasAttribute('data-aside-more')) { asideAll = !asideAll; render(); return; }
    if (button.hasAttribute('data-aside-clear-all')) {
      const keys = setAsideEmails().map(row => row.key);
      if (deps.confirm && !(await deps.confirm(`Remove all ${keys.length} emails from this list? They stay in Gmail and are never read again. Your receipts are not touched.`))) return;
      await clearSetAside(keys); return;
    }
    if (button.dataset.retryReason) { await retryFailedEmails(button.dataset.retryReason); return; }
    switch (button.dataset.action) {
      case 'connect': await toggleConnection(); break;
      case 'use-sheets': await useSheetsScript(); break;
      case 'clear-failures': await clearRecordedFailures(); break;
      case 'scan': setView('inbox'); await scan(false); break;
      case 'test-reader': await testReader(); break;
      case 'scan-day': await scanOneDay(-1); break;
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
      case 'show-all': filter = 'auto'; resultQuery = ''; host.querySelector('[data-result-search]').value = ''; render(); break;
    }
  } catch (error) { report(error); }
}

// "Looks right, file it": the publisher has checked this one receipt, so it
// counts as reviewed and goes straight to filing, and the panel moves on to
// the next receipt in the pile.
async function fileOne(draft) {
  if (['queued', 'imported', 'ignored'].includes(draft.status)) return;
  draft.reviewed = true; draft.updatedAt = Date.now();
  if (statusOf(draft) !== 'ready') {
    await persist(); render();
    throw new Error(receiptProblems(draft)[0] || 'This receipt can’t be filed yet. Check what is listed on it.');
  }
  draft.status = 'queued'; draft.selected = false; autoPick = true;
  await persist(); render();
  announce(`${draft.vendor || 'Receipt'} saved for filing. It syncs when you are connected.`);
  await resumeReceiptImports();
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
  // A scan stopped by the lapsed connection is answered by reconnecting.
  if (/Gmail/.test(state.lastHalt)) state.lastHalt = '';
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
// The trigger lives in the publisher's Apps Script, so its own answer is the
// only truthful source for whether the daily scan is armed.
async function loadDailySweep(endpoint, report) {
  if (report && !report.capabilities?.receiptDailySweep) { dailySweep = null; return; }
  try {
    const idToken = await deps.user()?.getIdToken?.();
    dailySweep = await receiptDailySchedule({ endpoint, idToken, op: 'status' });
    // The publisher asked for an hourly check (2026-11-26). A script new enough
    // to report how often it runs, still set to once a day, is moved over.
    if (dailySweep?.enabled && dailySweep.every === 'day') {
      dailySweep = await receiptDailySchedule({ endpoint, idToken, op: 'set', enabled: true, hour: dailySweep.hour ?? 5, every: 'hour' });
    }
  } catch { dailySweep = null; }
  loadSenderRules().catch(() => {});
}

// The "never read" and "always read" sender lists live in Firestore so the
// hourly check in the Sheet script follows them too; a copy is kept with the
// mailbox so they still apply offline.
let senderRulesLoaded = '';
const senderRules = () => normalizeSenderRules(state.senderRules);
async function loadSenderRules() {
  if (senderRulesLoaded === uid || typeof window._fbLoadSettings !== 'function') return;
  senderRulesLoaded = uid;
  const saved = await window._fbLoadSettings('receiptSenders');
  if (saved && active()) { state.senderRules = normalizeSenderRules(saved); await persist(); render(); }
}

async function setSenderRule(domain, kind) {
  state.senderRules = withSenderRule(state.senderRules, domain, kind);
  await persist();
  render();
  if (typeof window._fbSaveSettings === 'function') await window._fbSaveSettings('receiptSenders', state.senderRules);
  announce(kind === 'never'
    ? `Emails from ${domain} will not be read for receipts, here or in the hourly check.`
    : `Emails from ${domain} will be read again.`);
}

async function setDailySweep(enabled) {
  const endpoint = activeEndpoint();
  if (!endpoint) throw new Error('Connect your Google Sheet script first');
  const idToken = await deps.user()?.getIdToken?.();
  dailySweep = await receiptDailySchedule({ endpoint, idToken, op: 'set', enabled, hour: dailySweep?.hour ?? 5, every: 'hour' });
  render();
  announce(enabled
    ? 'Gmail is now checked every hour, even with the app closed. Anything found waits in Tax Centre › Import from Email for your review.'
    : 'The hourly check is off. Receipts are only found when you scan by hand.');
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

// What the set-aside list shows for an email it no longer keeps a copy of.
const emailLabel = email => ({ subject: email.subject || '', from: email.from || '', date: emailDay(email.date) });

// How long one email may take before it is set aside as "took too long" and
// the scan moves on. Without a limit, one Gmail call or AI answer that never
// came back froze the whole scan on "Reading 1 of 3" with no way to tell.
const GMAIL_LIMIT_MS = 30 * 1000;
const AI_LIMIT_MS = 2 * 60 * 1000;
const TOO_SLOW_GMAIL = 'Gmail took more than 30 seconds to send this email. Read it again.';
const TOO_SLOW_AI = 'The AI took more than 2 minutes to read this email, so it was skipped. Read it again, or check the reader with “Test the reader”.';

// What each reader is doing right now, for the live line under the progress
// bar. Keyed by email so three parallel readers each get their own line.
const reading = new Map();
let readingTicker = 0;
function stage(key, text, label) {
  const entry = reading.get(key) || { label: '', since: Date.now() };
  if (label !== undefined) entry.label = label;
  entry.text = text; entry.since = Date.now();
  reading.set(key, entry);
  paintReading();
}
function paintReading() {
  const node = host?.querySelector('[data-progress-now]');
  if (!node) return;
  const now = Date.now();
  node.textContent = [...reading.values()].slice(0, SCAN_CONCURRENCY).map(entry => {
    const secs = Math.floor((now - entry.since) / 1000);
    const name = entry.label ? `“${entry.label.slice(0, 60)}”` : 'An email';
    return `${name}: ${entry.text}${secs >= 3 ? ` (${secs} s)` : ''}`;
  }).join('\n');
}
function startReadingTicker() {
  reading.clear();
  clearInterval(readingTicker);
  readingTicker = setInterval(paintReading, 1000);
}
function stopReadingTicker() {
  clearInterval(readingTicker); readingTicker = 0; reading.clear(); paintReading();
}

// What happened to every email the last scan looked at, so a scan that ends
// with nothing ready says why instead of looking broken. Kept in memory and
// saved with the mailbox; only the latest scan's.
let scanReport = null;
function note(key, outcome, label, detail = '') {
  if (!scanReport) return;
  scanReport.rows = scanReport.rows.filter(row => row.key !== key);
  scanReport.rows.push({ key, outcome, label: String(label || '').slice(0, 160), detail: String(detail || '').slice(0, 300) });
}

async function readCandidate(id, signal, endpoint, force = false) {
  const owner = uid, account = state.account, key = `${account}:${id}`;
  // A halt raised by another reader must stop this one before it spends
  // anything, not after its own request comes back.
  if (signal.aborted) throw new DOMException('Stopped', 'AbortError');
  // An email read by an earlier scan is skipped rather than paid for twice —
  // but it still counts towards this scan's progress, or the bar stalls.
  const prior = state.scans[key];
  if (!force && prior?.done && (prior.count > 0 || prior.reader === READER_VERSION)) {
    note(key, prior.count > 0 ? 'found-before' : 'aside-before', prior.subject, prior.count > 0 ? '' : SET_ASIDE_WHY[prior.skipped] || 'read, but no receipt found in it');
    scanDone++; scanCached++; scheduleRender(); return;
  }
  // Deliberately not recorded as scanned: if that expense is later deleted,
  // the next scan should find the receipt again.
  const known = knownMessages?.get(key);
  if (known) { note(key, known.kind, known.label); scanDone++; scanFiled++; scheduleRender(); return; }
  let email = state.emails[key];
  try {
    if (!email) {
      stage(key, 'opening the email', prior?.subject || '');
      email = await withTimeLimit(GMAIL_LIMIT_MS, signal, TOO_SLOW_GMAIL, child => client.message(id, account, child));
    }
    if (signal.aborted || !active() || owner !== uid) throw new DOMException('Stopped', 'AbortError');
    const label = email.subject || senderName(email.from) || '';
    // No amount in the text and nothing attached: it cannot be a receipt, so it
    // is not worth an AI read. Most of a broad search is mail like this.
    // A publisher who asked for this email to be read again has already judged
    // it worth the read, so the quick set-aside rules do not apply.
    const rule = senderRule(email.from, senderRules());
    const skipReason = force ? '' : rule === 'never' ? 'sender' : rule === 'always' ? '' : receiptSkipReason(email);
    if (skipReason) {
      dropEmail(key);
      state.scans[key] = { done: true, ...emailLabel(email), count: 0, skipped: skipReason, reader: READER_VERSION };
      note(key, 'aside', label, SET_ASIDE_WHY[skipReason]);
      scanSkipped++;
      await persist();
      scanDone++; scheduleRender();
      return;
    }
    // Attachments are fetched together rather than one after another; a receipt
    // email routinely carries several and they are independent downloads.
    if (email.fileParts.length) {
      stage(key, `downloading ${email.fileParts.length === 1 ? 'the attachment' : `${email.fileParts.length} attachments`}`, label);
      await withTimeLimit(GMAIL_LIMIT_MS * 2, signal, TOO_SLOW_GMAIL, child => Promise.all(email.fileParts.map(file => client.attachment(id, file, child))));
    }
    if (signal.aborted || !active() || owner !== uid) throw new DOMException('Stopped', 'AbortError');
    state.emails[key] = email;
    await persist(); // Source bytes must survive before the AI result does.
    const useAppAi = deps.hasAppAi?.();
    stage(key, useAppAi ? 'the AI is reading it' : 'your Sheet script’s AI is reading it', label);
    const idToken = useAppAi ? undefined : await deps.user().getIdToken();
    let result = await withTimeLimit(AI_LIMIT_MS, signal, TOO_SLOW_AI, child => extractFoundReceipts({ endpoint,
      idToken, email, signal: child, readAi: useAppAi ? deps.readAi : undefined }));
    if (signal.aborted || !active() || owner !== uid) throw new DOMException('Stopped', 'AbortError');
    // Nothing in the email but a "view your receipt" link: download what the
    // link points at through the Sheet script and read that. Only a link that
    // cannot be had (a sign-in page) is left on the list to open by hand.
    let linkMiss = '';
    if (!result.receipts.length && !email.fileParts.length && email.receiptLink && endpoint) {
      stage(key, 'downloading the receipt from its link', label);
      const linked = await withTimeLimit(GMAIL_LIMIT_MS * 2, signal, TOO_SLOW_GMAIL, async child => fetchReceiptLink({ endpoint,
        idToken: idToken || await deps.user().getIdToken(), link: email.receiptLink, signal: child }));
      if (signal.aborted || !active() || owner !== uid) throw new DOMException('Stopped', 'AbortError');
      if (linked.reason) linkMiss = linked.reason;
      else {
        const withLink = linked.file
          ? { ...email, fileParts: [linked.file] }
          : { ...email, body: `${String(email.body || '').slice(0, 8000)}\n\nReceipt page linked from this email:\n${linked.text}` };
        stage(key, 'the AI is reading the linked receipt', label);
        const again = await withTimeLimit(AI_LIMIT_MS, signal, TOO_SLOW_AI, child => extractFoundReceipts({ endpoint,
          idToken, email: withLink, signal: child, readAi: useAppAi ? deps.readAi : undefined }));
        if (signal.aborted || !active() || owner !== uid) throw new DOMException('Stopped', 'AbortError');
        if (again.receipts.length) {
          result = { ...again, receipts: again.receipts.map(raw => ({ ...raw, fromLink: email.receiptLink })) };
          // The file is kept with the email so it is filed with the receipt.
          if (linked.file) email.fileParts = [{ ...linked.file, fromLink: true }];
        } else linkMiss = 'the downloaded page had no receipt on it';
      }
    }
    result.receipts.forEach((raw, index) => {
      const draft = normalizeFoundReceipt(raw, email, index);
      // The owner's sorting rules win, then how this shop has been filed
      // before, as on the scan forms.
      const learned = deps.ruleCategory?.(draft.vendor, draft.description) || deps.habitCategory?.(draft.vendor) || '';
      if (learned) draft.category = learned;
      else if (!deps.categories.includes(draft.category)) draft.category = deps.inferCategory(draft.vendor, draft.description);
      if (!state.drafts.some(row => row.id === draft.id)) state.drafts.push(draft);
    });
    // An email with no receipt in it will never be looked at again, so its
    // saved body and attachment bytes are dead weight. Dropping them keeps the
    // saved mailbox — and therefore every later save — from growing with every
    // scan of a mostly-ordinary inbox.
    if (!result.receipts.length) dropEmail(key);
    // No receipt in the email itself, but a "view your receipt" link: the
    // receipt exists, just not here. Listed to download rather than dropped.
    const linkOnly = !result.receipts.length && !email.fileParts.length && email.receiptLink ? email.receiptLink : '';
    state.scans[key] = { done: true, ...emailLabel(email), count: result.receipts.length, reader: READER_VERSION, ...(linkOnly ? { receiptLink: linkOnly } : {}) };
    note(key, result.receipts.length ? 'found' : linkOnly ? 'link-only' : 'aside', label, result.receipts.length
      ? result.receipts.map(raw => [raw.vendor, raw.amount != null && raw.currency ? `${raw.currency} ${raw.amount}` : ''].filter(Boolean).join(' ')).join('; ')
      : linkOnly ? `the receipt is behind a link that could not be downloaded (${linkMiss || 'no Sheet script'}); it is listed above to open` : 'the AI read it and found no receipt');
    await persist();
  } catch (error) {
    if (error.name === 'AbortError' || !active() || uid !== owner) throw error;
    // Every remaining email would fail the same way and spend another request
    // doing it. One exhausted allowance used to become 77 failed emails, and a
    // lapsed Gmail connection 86. Neither is the email's fault, so neither is
    // recorded against it: the next scan simply reads it again.
    const systemic = systemicReceiptFailure(error);
    note(key, 'failed', email?.subject || senderName(email?.from) || '', systemic || error.message);
    if (systemic) {
      if (!haltReason) haltReason = systemic;
      controller?.abort();
    } else {
      state.scans[key] = { error: error.message, ...(email ? emailLabel(email) : {}), subject: email?.subject || id, endpoint };
      await persist();
    }
  } finally {
    reading.delete(key); paintReading();
  }
  scanDone++;
  scheduleRender();
}

// An expense already filed from an email, or a receipt the finder already
// holds, is not read again. The report says which, by name: "already in your
// expenses" for a receipt that is merely waiting in a pile was wrong.
function buildKnownMessages() {
  const account = state.account, known = new Map();
  for (const expense of deps.expenses() || []) {
    if (expense?.emailMsgId && (!expense.emailAccount || expense.emailAccount === account)) {
      known.set(`${account}:${expense.emailMsgId}`, { kind: 'filed', label: expense.vendor || expense.desc || '' });
    }
  }
  for (const draft of state.drafts) {
    const key = `${account}:${draft.messageId}`;
    if (draft.account === account && !known.has(key)) {
      known.set(key, { kind: draft.status === 'ignored' ? 'dismissed' : draft.status === 'imported' ? 'filed' : 'waiting', label: draft.vendor || '' });
    }
  }
  return known;
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

// The one-day scan: yesterday by default, the day most receipts are waiting
// from. Sets the exact dates so the status line and a "next 25" page describe
// the same search.
async function scanOneDay(offset) {
  if (busy) return;
  markPeriod('');
  host.querySelector('#finder-from').value = localDayPlus(offset);
  host.querySelector('#finder-to').value = localDayPlus(offset);
  await scan(false);
}

async function scan(nextPage) {
  if (busy) return;
  if (!tokenLive()) throw new Error(state.account ? 'Reconnect Gmail to scan — it only takes a click.' : 'Connect Gmail first');
  if (!state.endpoint && !deps.hasAppAi?.() && !deps.service?.()) throw new Error('Save an AI key or connect your Google Sheet script before scanning');
  if (!navigator.onLine) throw new Error('Reconnect to scan Gmail. Saved receipts are available offline.');
  const value = id => host.querySelector('#' + id).value;
  if (value('finder-from') && value('finder-to') && value('finder-from') > value('finder-to')) throw new Error('From date must be before the end date');
  const pressed = key => host.querySelector(`[data-toggle="${key}"]`).getAttribute('aria-pressed') === 'true';
  const query = nextPage ? state.lastQuery : receiptQuery({ query: value('finder-query'), after: value('finder-from'), before: value('finder-to'),
    sender: value('finder-sender'), attachments: pressed('attachments'), categories: ['invoices', 'shipping'].filter(pressed) });
  // Claimed before the capability check, which is a network round trip: a
  // second click during it would otherwise start a second scan.
  busy = true; controller = new AbortController(); const signal = controller.signal;
  scanTotal = 0; scanDone = 0; scanSkipped = 0; scanCached = 0; scanFiled = 0; haltReason = '';
  knownMessages = buildKnownMessages();
  scanReport = { at: new Date().toISOString(), rows: [] };
  startReadingTicker();
  const before = state.drafts.length;
  const failedBefore = Object.values(state.scans).filter(item => item.error).length;
  render();
  try {
    const endpoint = await ensureServiceReady();
    announce('Finding candidate emails…');
    const page = await client.list(query, nextPage ? state.pageToken : '', signal);
    const messages = page.messages || [];
    scanTotal = messages.length;
    announce(messages.length ? `Found ${messages.length} email${messages.length === 1 ? '' : 's'} that could be receipts. Reading them now…` : '');
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
      scanFiled ? `${scanFiled} ${scanFiled === 1 ? 'was' : 'were'} already found or filed.` : '',
      scanSkipped ? `${scanSkipped} ${scanSkipped === 1 ? 'was a delivery note or had' : 'were delivery notes or had'} no amount, so no AI was spent on ${scanSkipped === 1 ? 'it' : 'them'}.` : '',
      scanCached ? `${scanCached} ${scanCached === 1 ? 'was' : 'were'} already checked in an earlier scan.` : '',
      failed > 0 ? `${failed} could not be read — see “Needs you”.` : '',
      'Each email is listed under “What this scan did”.',
      state.pageToken ? 'There are more emails to check — use “Check the next 25 emails”.' : '',
    ].filter(Boolean).join(' '));
  } catch (error) {
    if (error.name === 'AbortError') {
      if (haltReason) { state.lastHalt = haltReason; await persist().catch(() => {}); }
      announce(haltReason
        ? `Scan stopped after the first failure, so nothing more was spent on it. ${haltReason}`
        : 'Scan stopped. Everything already read has been saved; scan again to carry on.');
    } else throw error;
  } finally {
    stopReadingTicker();
    if (scanReport) { state.lastReport = scanReport; scanReport = null; persist().catch(() => {}); }
    busy = false; controller = null; knownMessages = null; scanTotal = 0; scanDone = 0; render();
  }
}

// All the failures in one pass, a few at a time like a scan — not one scan per
// email, which re-checked the service and repainted the screen 86 times and,
// while Gmail was disconnected, answered one click with 86 error toasts.
async function retryFailedEmails(reason = '') {
  if (busy) return;
  if (!tokenLive()) throw new Error('Reconnect Gmail first, then try these again.');
  const prefix = state.account + ':';
  const keys = Object.entries(state.scans)
    .filter(([key, scan]) => scan.error && (!reason || scan.error === reason) && key.startsWith(prefix))
    .map(([key]) => key);
  if (!keys.length) throw new Error('These emails belong to a different Gmail account. Connect that account to try them again.');
  await rereadEmails(keys, { force: false });
}

// Emails the finder looked at and set aside as not being receipts — either the
// quick check found no amount in them, or the AI read them and found nothing.
// Either judgement can be wrong, and without a way back a real receipt that was
// wrongly set aside stayed missing for good.
const SET_ASIDE_SHOWN = 30;
const SET_ASIDE_FOLDED = 5;
let asideOpen = false, asideAll = false;
const SET_ASIDE_WHY = {
  'no-amount': 'no price found in it',
  notification: 'looked like a shipping or account notice',
  sender: 'from a sender you chose never to read',
};

const senderOnly = from => String(from || '').replace(/\s*<[^>]*>\s*$/, '').replace(/^"|"$/g, '').trim();
const gmailLink = key => {
  const at = key.lastIndexOf(':');
  const account = key.slice(0, at), id = key.slice(at + 1);
  return `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(account)}#all/${encodeURIComponent(id)}`;
};

function setAsideEmails() {
  const prefix = state.account + ':';
  return Object.entries(state.scans)
    .filter(([key, scan]) => scan.done && !scan.error && !scan.count && !scan.cleared && key.startsWith(prefix))
    .map(([key, scan]) => ({ key, subject: scan.subject || '', from: senderOnly(scan.from), date: scan.date || '',
      why: SET_ASIDE_WHY[scan.skipped] || 'read, but no receipt found in it' }));
}

const dismissedCount = () => state.drafts.filter(draft => draft.status === 'ignored').length;

function renderSetAside() {
  const all = setAsideEmails();
  // The sender lists belong to this pile even before any email is set aside.
  if (!all.length) return renderSenderLists();
  const latest = all.slice(-SET_ASIDE_SHOWN).reverse();
  // Folded to a few rows: a long list of emails that are not receipts is
  // rarely what the publisher came for, so it never fills the page.
  const rows = asideAll ? latest : latest.slice(0, SET_ASIDE_FOLDED);
  const canRetry = !busy && tokenLive();
  const dismissed = dismissedCount();
  // The pile's count includes receipts the publisher dismissed, which are
  // listed under this block. Saying only "24 emails" beside a tile reading 26
  // looked like two emails had gone missing.
  const heading = `${all.length} email${all.length === 1 ? '' : 's'} set aside as not receipts`;
  return `<details class="finder-failures finder-setaside" data-aside ${asideOpen ? 'open' : ''}>
    <summary><span class="finder-failures-sum">${heading}</span>
      <span class="finder-failures-hint">${dismissed ? `plus ${dismissed} receipt${dismissed === 1 ? '' : 's'} you dismissed, below` : asideOpen ? 'Missing one? Read it again' : 'Show them'}</span></summary>
    <div class="finder-setaside-bar">
      <p>${tokenLive() ? 'Missing a receipt? Read that email again. Remove the rest to clear the list.' : 'Reconnect Gmail to read any of these again. You can still open them in Gmail, or remove them from this list.'}</p>
      ${tokenLive() ? '' : '<button type="button" class="btn sm gold" data-action="connect">Reconnect Gmail</button>'}
      <button type="button" class="btn sm" data-aside-clear-all>Clear all ${all.length}</button>
    </div>
    <ul class="finder-failures-list">${rows.map(row => {
      const title = row.subject || 'Subject not saved';
      const day = row.date ? new Date(row.date + 'T12:00:00') : null;
      const when = day && Number.isFinite(day.getTime()) ? day.toLocaleDateString([], { month: 'short', day: 'numeric' }) : '';
      const meta = [row.from, when, row.why].filter(Boolean).join(' · ');
      return `
      <li class="finder-failure">
        <p><strong class="${row.subject ? '' : 'finder-setaside-nosubject'}">${esc(title.slice(0, 120))}</strong><br><span class="finder-setaside-why">${esc(meta)}</span></p>
        <a class="btn sm finder-setaside-open" href="${esc(gmailLink(row.key))}" target="_blank" rel="noopener noreferrer" aria-label="Open in Gmail: ${esc(title.slice(0, 80))}">Open in Gmail</a>
        ${canRetry ? `<button type="button" class="btn sm" data-reread="${esc(row.key)}" aria-label="Read this email again: ${esc(title.slice(0, 80))}">Read again</button>` : ''}
        <button type="button" class="btn sm finder-setaside-x" data-aside-clear="${esc(row.key)}" aria-label="Remove from this list: ${esc(title.slice(0, 80))}" title="Remove from this list">✕</button>
      </li>`;
    }).join('')}</ul>
    <p class="finder-failures-foot">${latest.length > rows.length ? `<button type="button" class="btn sm" data-aside-more>Show all ${latest.length}</button> ` : asideAll && latest.length > SET_ASIDE_FOLDED ? '<button type="button" class="btn sm" data-aside-more>Show fewer</button> ' : ''}${all.length > SET_ASIDE_SHOWN && asideAll ? `Showing the latest ${SET_ASIDE_SHOWN}. ` : ''}Removing an email only takes it off this list. It stays in Gmail and is never read again.</p>
  </details>${renderSenderLists()}${dismissed ? `<h4 class="finder-dismissed-head">${dismissed} receipt${dismissed === 1 ? '' : 's'} you dismissed</h4>` : ''}`;
}

// Takes set-aside emails off the list. The scan record stays, marked cleared,
// so the email still counts as checked and is never paid for again.
async function clearSetAside(keys) {
  let changed = 0;
  for (const key of keys) {
    const scan = state.scans[key];
    if (scan?.done && !scan.cleared) { state.scans[key] = { ...scan, cleared: true }; changed++; }
  }
  if (!changed) return;
  await persist(); render();
  announce(changed === 1 ? 'Removed from the list.' : `${changed} emails removed from the list.`);
}

// Senders whose receipts keep being dismissed are offered as "never read",
// and the senders already on that list can be read again.
function renderSenderLists() {
  const rules = senderRules();
  const offers = senderSuggestions(state.drafts, rules).slice(0, 3);
  const never = rules.never.slice(0, 20);
  if (!offers.length && !never.length) return '';
  return `<div class="finder-senders">
    ${offers.map(row => `<div class="finder-sender-offer"><p>You dismissed ${row.dismissed} receipts from <strong>${esc(row.domain)}</strong> and filed none. Stop reading their emails?</p>
      <button type="button" class="btn sm" data-never="${esc(row.domain)}">Stop reading ${esc(row.domain)}</button></div>`).join('')}
    ${never.length ? `<p class="finder-senders-head">Never read for receipts:</p><ul class="finder-sender-list">${never.map(domain => `<li>${esc(domain)}
      <button type="button" class="btn sm" data-forget-sender="${esc(domain)}" aria-label="Read emails from ${esc(domain)} again">Read again</button></li>`).join('')}</ul>` : ''}
  </div>`;
}

// Emails whose receipt is only a "view your receipt" link, from this device's
// scans and from the hourly check, until marked done.
function linkOnlyRows() {
  const done = new Set(state.linksDone || []);
  const prefix = state.account + ':';
  const rows = Object.entries(state.scans)
    .filter(([key, scan]) => scan.done && scan.receiptLink && key.startsWith(prefix))
    .map(([key, scan]) => ({ id: key.slice(key.lastIndexOf(':') + 1), key, subject: scan.subject || '', from: senderOnly(scan.from), day: scan.date || '', link: scan.receiptLink }));
  for (const row of dailySweep?.linkOnly || []) {
    if (!row?.id || rows.some(r => r.id === row.id) || !/^https:\/\//.test(String(row.link || ''))) continue;
    rows.push({ id: String(row.id), key: `${state.account}:${row.id}`, subject: String(row.subject || ''), from: senderOnly(row.from), day: String(row.day || ''), link: String(row.link) });
  }
  return rows.filter(row => !done.has(row.id)).slice(0, 15);
}

function renderLinkOnly() {
  const slot = host.querySelector('[data-finder-links]');
  if (!slot) return;
  const rows = state.account ? linkOnlyRows() : [];
  if (!rows.length) { slot.replaceChildren(); return; }
  slot.innerHTML = `<details class="finder-failures finder-links" open>
    <summary><span class="finder-failures-sum">${rows.length === 1 ? 'One receipt needs downloading' : `${rows.length} receipts need downloading`}</span>
      <span class="finder-failures-hint">The link needs you to sign in, so it could not be downloaded for you</span></summary>
    <ul class="finder-failures-list">${rows.map(row => `<li class="finder-failure">
      <p><strong>${esc((row.subject || 'Subject not saved').slice(0, 120))}</strong><br><span class="finder-setaside-why">${esc([row.from, row.day].filter(Boolean).join(' · '))}</span></p>
      <a class="btn sm gold" href="${esc(row.link)}" target="_blank" rel="noopener noreferrer">Open the receipt</a>
      <a class="btn sm" href="${esc(gmailLink(row.key))}" target="_blank" rel="noopener noreferrer">Open email</a>
      <button type="button" class="btn sm" data-link-done="${esc(row.id)}">Done</button></li>`).join('')}</ul>
    <p class="finder-failures-foot">Save the receipt, then add it on the Scan a receipt screen. Press Done to clear it from this list.</p>
  </details>`;
}

function renderAccuracy() {
  const slot = host.querySelector('[data-health-accuracy]');
  if (!slot) return;
  const score = spotCheckAccuracy(state.drafts);
  slot.hidden = !score.checked;
  slot.textContent = score.checked ? `Reader accuracy: ${score.percent}% right on ${score.checked} spot check${score.checked === 1 ? '' : 's'}` : '';
}

// Emails set aside before the subject, sender and date were read show no
// subject at all. Those three headers are a tiny, AI-free Gmail read, so they
// are filled in once Gmail is connected, a few at a time and once per session.
const labelTried = new Set();
let labelling = false;
async function labelSetAside() {
  if (labelling || busy || !tokenLive() || !active()) return;
  const owner = uid, account = state.account;
  const keys = setAsideEmails().slice(-SET_ASIDE_SHOWN).filter(row => !row.subject && !labelTried.has(row.key)).map(row => row.key);
  if (!keys.length) return;
  labelling = true;
  keys.forEach(key => labelTried.add(key));
  let changed = 0;
  try {
    await runPool(keys, SCAN_CONCURRENCY, async key => {
      if (!tokenLive() || owner !== uid || account !== state.account) return;
      try {
        const email = await client.headers(key.slice(account.length + 1), account);
        const scan = state.scans[key];
        if (scan && !scan.subject && owner === uid) { Object.assign(scan, emailLabel(email)); changed++; }
      } catch { /* a missing or deleted email keeps its plain row */ }
    });
    if (changed && active() && owner === uid) { await persist(); render(); }
  } finally { labelling = false; }
}

async function rereadSetAside(key) {
  if (busy) return;
  if (!tokenLive()) throw new Error('Reconnect Gmail first, then read this again.');
  if (!state.scans[key] || !key.startsWith(state.account + ':')) throw new Error('That email belongs to a different Gmail account. Connect that account to read it again.');
  await rereadEmails([key], { force: true });
}

// The emails again, a few at a time like a scan — not one scan per email, which
// re-checked the service and repainted the screen 86 times and, while Gmail was
// disconnected, answered one click with 86 error toasts.
async function rereadEmails(keys, { force }) {
  const prefix = state.account + ':';
  // Claimed before the service check, a network round trip, so a second click
  // during it cannot start a second pass.
  busy = true; controller = new AbortController(); const signal = controller.signal;
  scanTotal = keys.length; scanDone = 0; scanSkipped = 0; scanCached = 0; haltReason = '';
  const total = keys.length;
  startReadingTicker();
  render();
  try {
    const endpoint = await ensureServiceReady();
    await runPool(keys, SCAN_CONCURRENCY, async key => {
      // A retry cut short (Stop, or a problem that halts the batch) leaves the
      // email exactly as listed before, rather than silently dropping it.
      const previous = state.scans[key];
      delete state.scans[key];
      try { await readCandidate(key.slice(prefix.length), signal, endpoint, force); }
      finally { if (!state.scans[key]) state.scans[key] = previous; }
    });
    state.lastHalt = '';
    await persist();
    const failing = keys.filter(key => state.scans[key]?.error).length;
    const found = keys.filter(key => state.scans[key]?.count > 0).length;
    announce(force
      ? (failing ? 'That email could not be read this time — the reason is listed above.'
        : found ? `Found ${found === 1 ? 'a receipt' : `${found} receipts`} in it — see the list above.` : 'Read again, and it still does not look like a receipt.')
      : failing
        ? `${total - failing} of ${total} read this time. ${failing} still could not be read.`
        : `All ${total} read this time.`);
  } catch (error) {
    if (error.name !== 'AbortError') throw error;
    if (haltReason) { state.lastHalt = haltReason; await persist().catch(() => {}); }
    announce(haltReason ? `Stopped retrying at the first failure, so nothing more was spent on it. ${haltReason}` : 'Stopped. Everything already read has been saved.');
  } finally { stopReadingTicker(); busy = false; controller = null; scanTotal = 0; scanDone = 0; render(); }
}

// One sample receipt, read end to end by the same reader a scan uses, so
// "is the AI working?" has a yes or no answer in a few seconds instead of a
// scan that finds nothing. Costs one AI read; touches no email.
const SAMPLE_RECEIPT = {
  id: 'sample', from: 'Sample Paper Co <billing@example.com>', subject: 'Your receipt from Sample Paper Co',
  body: 'Thank you for your order.\nReceipt #1001\nPrinter paper, 2 reams    $20.00\nHST    $2.60\nTotal paid: $22.60 CAD\nPaid by Visa ending 4242',
  fileParts: [],
};

async function testReader() {
  if (busy) return;
  const useAppAi = !!deps.hasAppAi?.();
  const endpoint = activeEndpoint();
  if (!useAppAi && !endpoint) throw new Error('Save an AI key in Settings › AI and receipts, or connect your Google Sheet script, then test again.');
  busy = true; render();
  const started = Date.now();
  const who = useAppAi ? 'the app’s own AI key' : 'your Google Sheet script';
  announce(`Testing the reader with a sample receipt, using ${who}…`);
  try {
    const idToken = useAppAi ? undefined : await deps.user().getIdToken();
    const sample = { ...SAMPLE_RECEIPT, account: state.account, date: new Date().toUTCString() };
    const result = await withTimeLimit(AI_LIMIT_MS, undefined, TOO_SLOW_AI, signal => extractFoundReceipts({
      endpoint, idToken, email: sample, signal, readAi: useAppAi ? deps.readAi : undefined }));
    const secs = Math.max(1, Math.round((Date.now() - started) / 1000));
    const total = result.receipts.map(raw => receiptMoney(raw.amount)).find(value => value !== null);
    announce(total === 22.6
      ? `The reader works. It read the sample receipt (total 22.60) in ${secs} seconds, using ${who}.`
      : `The reader answered in ${secs} seconds but did not find the sample’s total of 22.60, so real receipts may be missed. Try again; if it keeps happening, check the AI key in Settings › AI and receipts.`);
  } catch (error) {
    if (error.name === 'AbortError') return;
    announce(`The reader is not working: ${error.message}`);
  } finally { busy = false; render(); }
}

function stopReceiptFinder() { controller?.abort(); }

async function resumeReceiptImports() {
  if (!active() || !navigator.onLine) return;
  if (flushing) { flushAgain = true; return; }
  flushing = true;
  const owner = uid;
  let totalImported = 0;
  let totalFailed = 0;
  let firstError = '';
  try {
    do {
      flushAgain = false;
      const queuedBefore = new Set(state.drafts.filter(row => row.status === 'queued').map(row => row.id));
      await flushReceiptOutbox(state, {
        canSync: () => active() && uid === owner && navigator.onLine,
        expenses: deps.expenses, rate: deps.rate, commit: deps.commit, accept: deps.accept,
        subscription: deps.subscription,
        save: persist, render,
        files: async email => {
          const output = [];
          const body = new File([`From: ${email.from}\nSubject: ${email.subject}\nDate: ${email.date}\n\n${email.body}`], 'email.txt', { type: 'text/plain' });
          // An attachment the reader had to skip (over 12 MB, or it would not
          // download) has no bytes to file. It keeps its slot, empty, so the other
          // files still line up with their attachments — and it must not block the
          // receipt: the email body and the other files are filed, and the Gmail
          // link on the expense still leads to the original.
          const files = [{ file: body, name: 'email.txt' }, ...email.fileParts.map((part, index) => {
            if (!part.base64 || !/^(text\/plain|image\/|application\/pdf)$/i.test(String(part.mime || '').split(';')[0].trim())) {
              return { skipped: true, name: '' };
            }
            return { file: new File([decodeGmailBase64(part.base64)], part.name, { type: part.mime }), name: `${index}-${part.name.replace(/[^a-zA-Z0-9._-]/g, '_')}` };
          })];
          if (!email.savedFiles) email.savedFiles = {};
          for (const entry of files) {
            if (!active() || uid !== owner) throw new Error('Sign in as the same publisher to finish importing');
            if (entry.skipped) { output.push(''); continue; }
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
      for (const draft of state.drafts) {
        if (!queuedBefore.has(draft.id)) continue;
        if (draft.status === 'imported') totalImported++;
        else if (draft.status === 'queued' && draft.error) {
          totalFailed++;
          if (!firstError) firstError = draft.error;
        }
      }
    } while (flushAgain && active() && navigator.onLine);

    if (totalImported) {
      const msg = totalImported === 1 ? '✓ Receipt filed to your expenses' : `✓ ${totalImported} receipts filed to your expenses`;
      deps.toast(msg, 'ok');
      announce(msg);
    }
    if (totalFailed) {
      deps.toast(firstError || 'Some receipts could not be filed', 'err');
    }
  } catch (error) { report(error); }
  finally { flushing = false; flushAgain = false; render(); }
}

export { startReceiptFinder, mountReceiptFinder, stopReceiptFinder, resumeReceiptImports };
