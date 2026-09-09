// The Intelligence panel — ask the books a question in plain English.
//
// Everything the model is told comes from tools that wrap the app's own
// aggregations (src/lib/publisher-intel-tools.js), so an answer here and the
// screen it came from cannot disagree about a figure. The model never sees the
// Firestore documents, only tool results, and it cannot write: a correction it
// suggests is staged as a card the publisher approves, and the write then goes
// through the ordinary save path with its offline queue and merge intact.
//
// Publisher only. The tab is hidden for authors and switchTab redirects them,
// but the boundary that actually matters is firestore.rules — settings/taxCenter
// (the key AND every business expense) is on the publisher-only denylist there,
// so an author session cannot read any of this whatever the UI does.

import {
  BOOKS,
  TAX_CENTER,
  attentionInput,
  isAuthor,
  recognizedRevenueOf,
  saveState,
  showToast,
  states,
} from '../main.js';
import { escapeHtml } from '../lib/html.js';
import { confirmDialog } from '../lib/modal.js';
import { buildAttentionSignals } from '../lib/attention-signals.js';
import { INTEL_TOOL_SCHEMAS } from '../lib/publisher-intel-tools.js';
import { friendlyChatError, runIntelTurn } from '../lib/gemini-chat.js';
import { EXPENSE_CATEGORIES } from './receipts.js';
import { _tcBuildLedger, _tcGetTripsSummaryAll, saveTaxCenter } from './taxcentre.js';

const THREAD_KEY = 'lm_intel_thread';
const DISCLOSURE_KEY = 'lm_intel_disclosure_v1';

// How much of the conversation is carried forward. Every earlier turn is
// re-sent on each question, tool results and all, so an unbounded thread would
// grow the request until it either costs the whole free-tier allowance or is
// refused outright. Twelve entries is roughly six exchanges — enough for
// "and what about last year?" to still make sense.
const HISTORY_LIMIT = 12;

// Displayed messages, and the Gemini turns behind them. Kept apart on purpose:
// the transcript is what the publisher reads, the history is what the model is
// re-sent, and they are not the same shape.
let INTEL_MESSAGES = [];
let INTEL_HISTORY = [];
const INTEL_PROPOSALS = new Map();
let intelPending = false;
let intelAbort = null;
let proposalSeq = 0;

const $i = (id) => document.getElementById(id);

// ── PERSISTENCE ──────────────────────────────────────────────────────────────

function loadIntelThread() {
  try {
    const saved = JSON.parse(localStorage.getItem(THREAD_KEY) || 'null');
    if (!saved) return;
    INTEL_MESSAGES = Array.isArray(saved.messages) ? saved.messages : [];
    INTEL_HISTORY = Array.isArray(saved.history) ? saved.history : [];
    for (const p of (Array.isArray(saved.proposals) ? saved.proposals : [])) {
      if (p && p.id) INTEL_PROPOSALS.set(p.id, p);
    }
    proposalSeq = INTEL_PROPOSALS.size;
  } catch (_) {
    // A corrupt thread is not worth blocking the panel over — start a fresh one.
    INTEL_MESSAGES = []; INTEL_HISTORY = [];
  }
}

function saveIntelThread() {
  try {
    localStorage.setItem(THREAD_KEY, JSON.stringify({
      messages: INTEL_MESSAGES.slice(-40),
      history: INTEL_HISTORY.slice(-HISTORY_LIMIT),
      proposals: [...INTEL_PROPOSALS.values()].slice(-20),
    }));
  } catch (_) {
    // Private browsing, or a full quota. The thread still works for this
    // session; only its survival across a reload is lost.
  }
}

function disclosureAccepted() {
  try { return localStorage.getItem(DISCLOSURE_KEY) === 'yes'; } catch (_) { return false; }
}

// ── THE CONTEXT THE TOOLS READ ───────────────────────────────────────────────

/**
 * Assemble everything the tools need, from what the app already has loaded.
 *
 * No Firestore read happens here. loadAllBooks() has already hydrated `states`,
 * and the tax centre is in memory, which is why the read half of this panel
 * keeps working with no connection.
 */
function intelContext() {
  let tripsSummary = {};
  let attentionSignals = null;
  try { tripsSummary = _tcGetTripsSummaryAll() || {}; } catch (_) { tripsSummary = {}; }
  try { attentionSignals = buildAttentionSignals(attentionInput()); } catch (_) { attentionSignals = null; }
  return {
    books: BOOKS,
    states,
    taxCenter: TAX_CENTER,
    tripsSummary,
    attentionSignals,
    expenseCategories: EXPENSE_CATEGORIES,
    buildLedger: (year) => _tcBuildLedger(year),
    recognizedRevenue: (s) => recognizedRevenueOf(s),
    now: new Date(),
  };
}

function systemInstruction() {
  const today = new Date().toISOString().slice(0, 10);
  const titles = Object.entries(BOOKS).map(([id, b]) => `${id} = ${b.title}`).join('; ');
  return [
    'You answer questions about a small independent book publisher\'s own business records.',
    `Today is ${today}. The books in the catalogue are: ${titles || 'none yet'}.`,
    '',
    'Rules you must follow:',
    '- Never state a figure you have not read from a tool in this conversation. If a tool cannot answer, say so plainly.',
    '- Amounts are only comparable within one currency. Never add two currencies together. queryLedger is the only tool whose figures are all Canadian dollars; every other tool reports each row in its own currency.',
    '- A consignment sale earns the publisher a cut after the shop\'s commission, not the shelf price. The tools already report the cut; do not recalculate it.',
    '- When you give a total, say what it covers and over what dates. If a result says it was truncated, say how many rows it actually matched.',
    '- To find things filed wrongly, call findAnomalies. Report exactly what it returns. Never decide for yourself that something looks miscategorised.',
    '- You may stage a fix with proposeCorrection, one expense per call, and only for something findAnomalies reported. It changes nothing — the publisher sees it as a card and decides. Tell them you have put it there for approval.',
    '',
    'Write the way you would speak to the shop owner: short, concrete, no jargon, no code, no field names. Lead with the answer, then the couple of numbers behind it. Plain sentences and short bullet lists only.',
  ].join('\n');
}

// ── RENDERING ────────────────────────────────────────────────────────────────

/**
 * Model output is untrusted text and is escaped before anything else happens.
 *
 * Deliberately NOT parseMarkdownToHtml() from main.js: that one restores
 * `<span style>` and `<mark style>` from its input on purpose, which is right
 * for the Open Call template editor where the publisher wrote the text, and
 * wrong here where a remote service did. This only ever emits tags it wrote
 * itself, so nothing in the model's reply can become markup.
 */
function intelText(raw) {
  return escapeHtml(String(raw == null ? '' : raw))
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/^[-•]\s+/gm, '· ')
    .replace(/\n/g, '<br>');
}

/**
 * What the answer was worked out from, in the publisher's words.
 *
 * Shown on every answer rather than hidden behind a toggle: an assistant that
 * says "you made $4,120 at the fairs" is worth exactly as much as the reader's
 * confidence that it looked rather than guessed.
 */
function toolTrace(names) {
  if (!names || !names.length) return '';
  const label = [...new Set(names)].map(n => TOOL_LABELS[n] || n).join(', ');
  return `<div class="intel-trace">Checked: ${escapeHtml(label)}</div>`;
}

const TOOL_LABELS = {
  queryLedger: 'the money ledger',
  querySales: 'sales history',
  queryExpenses: 'expenses',
  queryEvents: 'fairs and trips',
  queryCatalog: 'the catalogue and stock',
  findAnomalies: 'record checks',
  proposeCorrection: 'a suggested fix',
};

function intelMessageHtml(msg) {
  const mine = msg.role === 'you';
  const body = mine ? escapeHtml(msg.text) : intelText(msg.text);
  return `<article class="intel-msg ${mine ? 'is-you' : 'is-app'}">
      <div class="intel-msg-who">${mine ? 'You' : 'Your books'}</div>
      <div class="intel-msg-body">${body}</div>
      ${mine ? '' : toolTrace(msg.tools)}
      ${(msg.proposals || []).map(id => intelProposalHtml(INTEL_PROPOSALS.get(id))).join('')}
    </article>`;
}

function intelProposalHtml(p) {
  if (!p) return '';
  const where = p.scope === 'business' ? 'Business expenses' : (p.book || 'Book expenses');
  const settled = p.status === 'applied' || p.status === 'dismissed';
  const field = p.field === 'cat' ? 'Category' : 'Trip';
  return `<div class="intel-proposal ${settled ? 'is-settled' : ''}" data-proposal="${escapeHtml(p.id)}">
      <div class="intel-proposal-head">
        <span class="pill ${p.status === 'applied' ? 'green' : p.status === 'dismissed' ? 'gray' : 'amber'}">
          ${p.status === 'applied' ? '✓ Changed' : p.status === 'dismissed' ? '✕ Left alone' : '● Needs your OK'}
        </span>
        <strong>${escapeHtml(p.description || 'This expense')}</strong>
      </div>
      <dl class="intel-proposal-diff">
        <dt>Where</dt><dd>${escapeHtml(where)} · ${escapeHtml(p.date || 'no date')}</dd>
        <dt>Amount</dt><dd class="intel-fig">${escapeHtml(p.currency || '')} ${Number(p.amount || 0).toFixed(2)}</dd>
        <dt>${escapeHtml(field)} now</dt><dd>${escapeHtml(p.before || '—')}</dd>
        <dt>Change to</dt><dd><strong>${escapeHtml(p.after || '')}</strong></dd>
      </dl>
      ${p.reason ? `<p class="intel-proposal-why">${escapeHtml(p.reason)}</p>` : ''}
      ${settled ? '' : `<div class="intel-proposal-actions">
        <button type="button" class="btn gold sm sys-target" onclick="applyIntelProposal('${escapeHtml(p.id)}')">Make this change</button>
        <button type="button" class="btn ghost sm sys-target" onclick="dismissIntelProposal('${escapeHtml(p.id)}')">Leave it as it is</button>
      </div>`}
    </div>`;
}

const STARTERS = [
  'How am I doing this year?',
  'What did each fair cost me, and did it pay off?',
  'Is anything filed under the wrong category?',
  'Which book is closest to covering its printing cost?',
];

function intelEmptyHtml() {
  return `<div class="empty-state sys-empty intel-empty">
      <div class="e-icon" aria-hidden="true">💬</div>
      <strong>Ask your books anything</strong>
      <span>Questions about sales, costs, fairs, stock or anything that looks wrong. Every answer is worked out from your own records — nothing is guessed.</span>
      <div class="intel-starters">
        ${STARTERS.map(q => `<button type="button" class="btn ghost sm sys-target intel-starter" onclick="askIntelStarter(this)">${escapeHtml(q)}</button>`).join('')}
      </div>
    </div>`;
}

function intelPendingHtml() {
  return `<article class="intel-msg is-app is-thinking" aria-hidden="true">
      <div class="intel-msg-who">Your books</div>
      <div class="intel-msg-body">
        <div class="skeleton-line" style="width:82%"></div>
        <div class="skeleton-line" style="width:64%"></div>
        <div class="skeleton-line" style="width:71%"></div>
      </div>
    </article>`;
}

/** Why the composer is unavailable right now, or '' when it is fine. */
function intelBlocker() {
  if (!TAX_CENTER?.settings?.geminiKey) {
    return 'Add your AI key in the Tax Centre settings and this panel can start answering questions.';
  }
  if (typeof navigator !== 'undefined' && navigator && navigator.onLine === false) {
    return 'You are offline. Everything already asked is still here, but a new question needs a connection.';
  }
  return '';
}

function renderIntel() {
  const thread = $i('intel-thread');
  if (!thread) return;
  if (isAuthor()) { thread.innerHTML = ''; return; }

  const gate = $i('intel-disclosure');
  if (gate) gate.hidden = disclosureAccepted();

  const blocker = intelBlocker();
  const notice = $i('intel-notice');
  if (notice) {
    notice.hidden = !blocker;
    notice.textContent = blocker;
  }

  const input = $i('intel-input');
  const send = $i('intel-send');
  const stop = $i('intel-stop');
  // The composer is permanent markup and is only ever enabled or disabled here.
  // Rebuilding it would drop the caret out of a half-typed question.
  if (input) input.disabled = !!blocker || intelPending;
  if (send) send.disabled = !!blocker || intelPending;
  if (stop) stop.hidden = !intelPending;

  const clear = $i('intel-clear');
  if (clear) clear.hidden = INTEL_MESSAGES.length === 0;

  thread.innerHTML = INTEL_MESSAGES.length
    ? INTEL_MESSAGES.map(intelMessageHtml).join('') + (intelPending ? intelPendingHtml() : '')
    : (intelPending ? intelPendingHtml() : intelEmptyHtml());

  if (INTEL_MESSAGES.length || intelPending) {
    thread.scrollTop = thread.scrollHeight;
  }
}

/**
 * The status line is a permanent node outside the rebuilt thread — a live
 * region replaced wholesale announces nothing.
 */
function setIntelStatus(text) {
  const el = $i('intel-status');
  if (el) el.textContent = text;
}

// ── ASKING ───────────────────────────────────────────────────────────────────

/**
 * Enter sends, Shift+Enter makes a new line.
 *
 * A named handler rather than an expression in the attribute: the composer is
 * the one control on this screen somebody will use every time, and an inline
 * expression is the kind of thing that silently stops working when a name
 * changes, with nothing to catch it.
 */
function intelComposerKey(e) {
  if (!e || e.key !== 'Enter' || e.shiftKey) return;
  e.preventDefault();
  sendIntelMessage();
}

function askIntelStarter(btn) {
  const input = $i('intel-input');
  if (!input || !btn) return;
  input.value = btn.textContent.trim();
  sendIntelMessage();
}

async function sendIntelMessage() {
  if (intelPending || isAuthor()) return;
  const input = $i('intel-input');
  const question = (input?.value || '').trim();
  if (!question) return;

  const blocker = intelBlocker();
  if (blocker) { showToast(blocker, 'warn', 4200); return; }
  if (!disclosureAccepted()) {
    showToast('Have a read of the note above first, then tap "I understand".', 'warn', 4200);
    return;
  }

  input.value = '';
  INTEL_MESSAGES.push({ role: 'you', text: question, at: Date.now() });
  intelPending = true;
  intelAbort = new AbortController();
  setIntelStatus('Working it out…');
  renderIntel();

  try {
    const out = await runIntelTurn({
      apiKey: TAX_CENTER.settings.geminiKey,
      history: INTEL_HISTORY,
      userText: question,
      tools: INTEL_TOOL_SCHEMAS,
      ctx: intelContext(),
      systemInstruction: systemInstruction(),
      signal: intelAbort.signal,
    });

    const ids = [];
    for (const p of out.proposals) {
      const id = `p${++proposalSeq}`;
      INTEL_PROPOSALS.set(id, { ...p, id, status: 'open' });
      ids.push(id);
    }

    const text = out.text || (out.hitRoundCap
      ? 'I looked in several places but could not pull that together into an answer. Try asking about one thing at a time — a single book, or a single fair.'
      : 'I could not find an answer to that in your records.');

    INTEL_MESSAGES.push({
      role: 'app', text, at: Date.now(),
      tools: out.toolCalls.map(c => c.name),
      proposals: ids,
    });
    INTEL_HISTORY = out.history.slice(-HISTORY_LIMIT);
    setIntelStatus(ids.length
      ? `Answered, with ${ids.length} suggested ${ids.length === 1 ? 'change' : 'changes'} for you to approve.`
      : 'Answered.');
  } catch (e) {
    if (e && e.name === 'AbortError') {
      setIntelStatus('Stopped.');
    } else {
      console.error('Intelligence turn failed', e);
      INTEL_MESSAGES.push({
        role: 'app', at: Date.now(), tools: [],
        text: `I could not answer that — ${friendlyChatError(e)}.`,
      });
      setIntelStatus('That question could not be answered.');
    }
  } finally {
    intelPending = false;
    intelAbort = null;
    saveIntelThread();
    renderIntel();
  }
}

function stopIntelTurn() {
  if (intelAbort) intelAbort.abort();
}

async function clearIntelThread() {
  if (!INTEL_MESSAGES.length) return;
  const ok = await confirmDialog(
    'Clear this conversation?\n\nThe questions and answers go from this screen. Nothing in your records changes, '
    + 'and any change you already approved stays approved.',
    { title: 'Clear conversation', okLabel: 'Clear it' }
  );
  if (!ok) return;
  INTEL_MESSAGES = []; INTEL_HISTORY = []; INTEL_PROPOSALS.clear(); proposalSeq = 0;
  saveIntelThread();
  setIntelStatus('Conversation cleared.');
  renderIntel();
}

function acceptIntelDisclosure() {
  try { localStorage.setItem(DISCLOSURE_KEY, 'yes'); } catch (_) { /* nothing to do */ }
  const gate = $i('intel-disclosure');
  if (gate) gate.hidden = true;
  renderIntel();
  $i('intel-input')?.focus();
}

// ── APPROVING A CHANGE ───────────────────────────────────────────────────────

/**
 * Apply one staged correction.
 *
 * The write deliberately goes through saveTaxCenter()/saveState() rather than
 * touching Firestore: those are what carry the offline queue and the three-way
 * merge, so a change approved on a train lands the same way one approved at a
 * desk does. The record is re-found by id at this moment rather than trusted
 * from when it was staged — the thread survives a reload, and the row could
 * have been edited or removed in between.
 */
async function applyIntelProposal(id) {
  const p = INTEL_PROPOSALS.get(id);
  if (!p || p.status !== 'open' || isAuthor()) return;

  const field = p.field === 'cat' ? 'category' : 'trip';
  const ok = await confirmDialog(
    `This edits a record in your books. You can change it back any time from the Expenses screen.`,
    {
      title: `Change the ${field} on this expense?`,
      okLabel: 'Make the change',
      // The facts go in the aligned rows rather than the sentence, so the one
      // thing worth checking — what it is now, what it becomes — is the easiest
      // thing on the dialog to read.
      details: [
        ['Expense', p.description || '—'],
        ['Where', p.scope === 'business' ? 'Business expenses' : (p.book || 'Book expenses')],
        ['Date', p.date || '—'],
        ['Amount', `${p.currency || ''} ${Number(p.amount || 0).toFixed(2)}`.trim()],
        [`${field === 'category' ? 'Category' : 'Trip'} now`, p.before || '—'],
        ['Change to', p.after || '—'],
      ],
    }
  );
  if (!ok) return;

  try {
    const list = p.scope === 'business'
      ? (TAX_CENTER.businessExpenses || [])
      : (states[p.bookId]?.expenses || []);
    const target = list.find(e => e && String(e.id) === String(p.expenseId));
    if (!target) {
      showToast('That expense is no longer there, so nothing was changed', 'warn', 4200);
      p.status = 'dismissed'; saveIntelThread(); renderIntel();
      return;
    }
    target[p.field] = p.after;

    if (p.scope === 'business') await saveTaxCenter({ rethrow: true });
    else await saveState(p.bookId);

    p.status = 'applied';
    showToast(`Changed to “${p.after}”`, 'ok', 3200);
    setIntelStatus(`Changed to ${p.after}.`);
  } catch (e) {
    console.error('Could not apply correction', e);
    showToast('Could not save that change — it has been left as it was', 'err', 5000);
    return;
  } finally {
    saveIntelThread();
    renderIntel();
  }
}

function dismissIntelProposal(id) {
  const p = INTEL_PROPOSALS.get(id);
  if (!p || p.status !== 'open') return;
  p.status = 'dismissed';
  saveIntelThread();
  setIntelStatus('Left as it is.');
  renderIntel();
}

loadIntelThread();

export {
  INTEL_PROPOSALS,
  acceptIntelDisclosure,
  applyIntelProposal,
  askIntelStarter,
  clearIntelThread,
  dismissIntelProposal,
  intelComposerKey,
  intelContext,
  intelText,
  renderIntel,
  sendIntelMessage,
  stopIntelTurn,
  systemInstruction,
};
