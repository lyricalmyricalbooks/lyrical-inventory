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
  saveCatalogWithDeletions,
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
import { _geminiNoteSpent, _geminiResting } from '../lib/gemini-quota.js';
import { friendlyOpenRouterError, runOpenRouterTurn } from '../lib/openrouter-chat.js';
import { closeIntelExchange, trimIntelHistory } from '../lib/intel-history.js';
import { EXPENSE_CATEGORIES } from './receipts.js';
import { _tcBuildLedger, _tcGetTripsSummaryAll, saveTaxCenter } from './taxcentre.js';

const THREAD_KEY = 'lm_intel_thread';
const DISCLOSURE_KEY = 'lm_intel_disclosure_v1';
const PROVIDER_KEY = 'lm_intel_provider';

// How much of the conversation is carried forward. Every earlier turn is
// re-sent on each question, tool results and all, so an unbounded thread would
// grow the request until it either costs the whole free-tier allowance or is
// refused outright. Eight turns holds up to four plain exchanges, fewer when an
// answer needed lookups: enough for a natural follow-up, while keeping every
// new question lean. The cut is only ever made where a question starts — see
// src/lib/intel-history.js for why a cut anywhere else breaks both providers.
const HISTORY_LIMIT = 8;

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
    // Re-trimmed on the way in: a thread saved before trimming respected
    // question boundaries may start halfway through a tool exchange.
    INTEL_HISTORY = trimIntelHistory(saved.history, HISTORY_LIMIT);
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
      history: trimIntelHistory(INTEL_HISTORY, HISTORY_LIMIT),
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

/**
 * Which model the publisher wants answering: 'auto' (Gemini, falling back to
 * the backup on its own — the long-standing behaviour), or a manual pin to
 * one or the other. A value naming a provider that isn't configured anymore
 * is treated as 'auto' rather than refusing to answer.
 */
function intelProviderPref() {
  try {
    const v = localStorage.getItem(PROVIDER_KEY);
    return v === 'gemini' || v === 'backup' ? v : 'auto';
  } catch (_) { return 'auto'; }
}

function setIntelProviderPref(value) {
  try { localStorage.setItem(PROVIDER_KEY, value === 'gemini' || value === 'backup' ? value : 'auto'); } catch (_) { /* still works this session */ }
  renderIntel();
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
    '- To change or fill in information, use proposeEdits. It changes nothing on its own: the publisher sees the list, can untick any row, and decides. Put every change from one request in a single call, look up the record ids with the read tools first, and tell them plainly what you have put up for approval and what you could not stage and why.',
    '- Never claim you have changed something. You stage changes; the publisher applies them.',
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
function toolTrace(names, msg) {
  const backup = msg && msg.via === 'backup'
    ? `<span class="intel-via">answered by your backup model${msg.viaModel ? ` (${escapeHtml(msg.viaModel)})` : ''}</span>`
    : '';
  if (!names || !names.length) return backup ? `<div class="intel-trace">${backup}</div>` : '';
  const label = [...new Set(names)].map(n => TOOL_LABELS[n] || n).join(', ');
  return `<div class="intel-trace">Checked: ${escapeHtml(label)}${backup ? ` · ${backup}` : ''}</div>`;
}

const TOOL_LABELS = {
  queryLedger: 'the money ledger',
  querySales: 'sales history',
  queryExpenses: 'expenses',
  queryEvents: 'fairs and trips',
  queryCatalog: 'the catalogue and stock',
  findAnomalies: 'record checks',
  proposeEdits: 'changes for you to approve',
};

/**
 * A failed turn gets its own card — a rose accent and a "Try again" button —
 * instead of reading as an ordinary answer. The question that failed travels
 * with it via a data attribute rather than a JS string literal, so an
 * apostrophe or quote in what the publisher typed can never break the button.
 */
function intelErrorHtml(msg) {
  return `<div class="intel-error">
      <div class="intel-error-body">${intelText(msg.text)}</div>
      <button type="button" class="btn gold sm sys-target" data-question="${escapeHtml(msg.question || '')}"
        onclick="retryIntelQuestion(this.dataset.question)" ${msg.question ? '' : 'disabled'}>Try again</button>
    </div>`;
}

function intelMessageHtml(msg, i) {
  const mine = msg.role === 'you';
  const isError = !mine && msg.isError;
  const body = mine ? escapeHtml(msg.text) : intelText(msg.text);
  return `<article class="intel-msg ${mine ? 'is-you' : 'is-app'}${isError ? ' is-error' : ''}" id="intel-msg-${i}">
      ${mine ? '' : '<div class="intel-msg-avatar" aria-hidden="true">L</div>'}
      <div class="intel-msg-content">
        <div class="intel-msg-who">${mine ? 'You' : 'Lyricalmyrical Intelligence'}</div>
        ${isError ? intelErrorHtml(msg) : `<div class="intel-msg-body">${body}</div>
        ${mine ? '' : toolTrace(msg.tools, msg)}
        ${mine ? '' : `<div class="intel-msg-actions">
          <button type="button" class="intel-msg-action" onclick="copyIntelAnswer(this)" aria-label="Copy this answer" title="Copy">⧉</button>
        </div>`}`}
        ${(msg.proposals || []).map(id => intelBatchHtml(INTEL_PROPOSALS.get(id))).join('')}
      </div>
    </article>`;
}

/**
 * A staged batch of changes, awaiting a yes or a no.
 *
 * Every row is shown with what it is now and what it would become, because the
 * publisher approving this has to be able to check the work — an assistant that
 * says "I have updated four books" and shows nothing is asking to be trusted
 * rather than read. Rows can be unticked individually: on a batch of twelve
 * ISBNs, one wrong entry should cost that one row, not the whole job.
 */
function intelBatchHtml(b) {
  if (!b) return '';
  const settled = b.status === 'applied' || b.status === 'dismissed';
  const live = b.items.filter(it => !b.skipped.includes(it.ref));
  const money = live.filter(it => it.risk === 'money').length;

  const pill = b.status === 'applied'
    ? '<span class="pill green">✓ Done</span>'
    : b.status === 'dismissed'
      ? '<span class="pill gray">✕ Left alone</span>'
      : `<span class="pill amber">● ${live.length} ${live.length === 1 ? 'change needs' : 'changes need'} your OK</span>`;

  const rows = b.items.map(it => {
    const off = b.skipped.includes(it.ref);
    const applied = b.status === 'applied' && !off;
    return `<tr class="intel-edit ${off ? 'is-off' : ''}">
        <td class="intel-edit-tick">${settled
          ? (applied ? '<span aria-label="changed">✓</span>' : '<span aria-label="not changed">—</span>')
          : `<button type="button" class="intel-tick ${off ? '' : 'is-on'}" role="switch" aria-checked="${off ? 'false' : 'true'}"
               aria-label="Include this change" onclick="toggleIntelEdit('${escapeHtml(b.id)}','${escapeHtml(it.ref)}')">${off ? '' : '✓'}</button>`}</td>
        <td class="intel-edit-what">
          <span class="intel-edit-record">${escapeHtml(it.record)}</span>
          <span class="intel-edit-field">${escapeHtml(it.fieldLabel)}${it.risk === 'money' ? ' <span class="intel-money-flag" title="This one changes money">$</span>' : ''}</span>
          ${it.book ? `<span class="intel-edit-book">${escapeHtml(it.book)}</span>` : ''}
        </td>
        <td class="intel-edit-was intel-fig">${escapeHtml(it.beforeText)}</td>
        <td class="intel-edit-now intel-fig"><strong>${escapeHtml(it.afterText)}</strong></td>
      </tr>
      ${it.sideEffect || it.reason ? `<tr class="intel-edit-note ${off ? 'is-off' : ''}"><td></td><td colspan="3">
        ${it.reason ? escapeHtml(it.reason) : ''}${it.reason && it.sideEffect ? ' · ' : ''}${it.sideEffect ? `Also, ${escapeHtml(it.sideEffect)}.` : ''}
      </td></tr>` : ''}`;
  }).join('');

  return `<div class="intel-proposal ${settled ? 'is-settled' : ''}" data-proposal="${escapeHtml(b.id)}">
      <div class="intel-proposal-head">
        ${pill}
        <strong>${escapeHtml(b.summary || 'Changes to your records')}</strong>
      </div>

      <table class="intel-edits"><tbody>${rows}</tbody></table>

      ${money && !settled ? `<p class="intel-proposal-warn">${money === 1 ? 'One of these changes' : `${money} of these changes`} affects money — prices, shares, amounts or a shop's commission. Worth a second look.</p>` : ''}
      ${(b.warnings || []).map(w => `<p class="intel-proposal-warn">${escapeHtml(w)}</p>`).join('')}
      ${(b.rejected || []).length ? `<details class="intel-rejected">
        <summary>${b.rejected.length} could not be prepared</summary>
        <ul>${b.rejected.map(r => `<li>${escapeHtml(r.reason)}</li>`).join('')}</ul>
      </details>` : ''}

      ${settled ? '' : `<div class="intel-proposal-actions">
        <button type="button" class="btn gold sm sys-target" onclick="applyIntelProposal('${escapeHtml(b.id)}')" ${live.length ? '' : 'disabled'}>
          ${live.length === 1 ? 'Make this change' : `Make these ${live.length} changes`}
        </button>
        <button type="button" class="btn ghost sm sys-target" onclick="dismissIntelProposal('${escapeHtml(b.id)}')">Leave everything as it is</button>
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
      <div class="intel-empty-mark" aria-hidden="true">✦</div>
      <strong>What would you like to understand?</strong>
      <span>Ask about sales, costs, fairs, stock, or something that looks wrong. Answers are grounded in your own records.</span>
    </div>`;
}

/**
 * The left rail: the same starter questions every time, plus a jump-list back
 * to whatever the publisher has already asked in this conversation.
 *
 * This is deliberately not a list of separate past conversations — the thread
 * is one ongoing conversation (THREAD_KEY holds exactly one), so "already
 * asked" jumps to where that question sits in the scrollback rather than
 * pretending to reopen a different chat.
 */
function intelRailHtml() {
  const quick = STARTERS
    .map(q => `<button type="button" class="intel-rail-btn sys-target" onclick="askIntelStarter(this)">${escapeHtml(q)}</button>`)
    .join('');

  const asked = [];
  INTEL_MESSAGES.forEach((m, i) => { if (m.role === 'you' && m.text) asked.push({ text: m.text, i }); });
  const recent = asked.length > 1
    ? asked.slice(-8).reverse()
      .map(({ text, i }) => `<button type="button" class="intel-rail-btn intel-rail-recent sys-target" data-target="intel-msg-${i}"
          onclick="scrollToIntelMessage(this.dataset.target)" title="${escapeHtml(text)}">${escapeHtml(text)}</button>`)
      .join('')
    : '';

  return `<div class="intel-rail-group">
      <h3 class="intel-rail-heading">Quick asks</h3>
      ${quick}
    </div>
    ${recent ? `<div class="intel-rail-group">
      <h3 class="intel-rail-heading">Already asked</h3>
      ${recent}
    </div>` : ''}`;
}

function intelPendingHtml() {
  return `<article class="intel-msg is-app is-thinking" aria-hidden="true">
      <div class="intel-msg-avatar">L</div>
      <div class="intel-msg-content">
        <div class="intel-msg-who">Lyricalmyrical Intelligence</div>
        <div class="intel-msg-body">
          <div class="skeleton-line" style="width:82%"></div>
          <div class="skeleton-line" style="width:64%"></div>
          <div class="skeleton-line" style="width:71%"></div>
        </div>
      </div>
    </article>`;
}

/** Why the composer is unavailable right now, or '' when it is fine. */
/** A saved key is enough; a custom model is optional. */
function backupProvider() {
  const key = TAX_CENTER?.settings?.openRouterKey?.trim();
  const model = TAX_CENTER?.settings?.openRouterModel?.trim() || 'openrouter/free';
  return key ? { key, model } : null;
}

function intelBlocker() {
  // Either provider is enough to answer a question. Requiring Google here would
  // mean a publisher whose Google key has been rotated or restricted cannot use
  // the panel at all, which is the exact situation the backup exists for.
  if (!TAX_CENTER?.settings?.geminiKey && !backupProvider()) {
    return 'Add your AI key in the Tax Centre settings and this panel can start answering questions.';
  }
  if (typeof navigator !== 'undefined' && navigator && navigator.onLine === false) {
    return 'You are offline. Everything already asked is still here, but a new question needs a connection.';
  }
  return '';
}

/**
 * The model picker, shown only when there's an actual choice to make — a
 * lone Gemini key has nothing to switch to. Auto is the long-standing
 * behaviour (Gemini, then the backup on failure); the other two pin every
 * question to one model until the publisher picks something else.
 */
function intelModelSwitchHtml() {
  const backup = backupProvider();
  if (!backup || !TAX_CENTER?.settings?.geminiKey) return '';
  const pref = intelProviderPref();
  const backupLabel = backup.model.length > 20 ? `${backup.model.slice(0, 19)}…` : backup.model;
  const pill = (value, text, title) => `<button type="button" class="intel-model-pill ${pref === value ? 'is-active' : ''}"
      role="radio" aria-checked="${pref === value}" title="${escapeHtml(title)}" onclick="setIntelProviderPref('${value}')">${escapeHtml(text)}</button>`;
  return pill('auto', 'Auto', 'Ask Gemini, and switch to your backup automatically if Gemini can’t answer')
    + pill('gemini', 'Gemini', 'Always ask Gemini')
    + pill('backup', backupLabel, `Always ask your backup model (${backup.model})`);
}

function renderIntel() {
  const thread = $i('intel-thread');
  if (!thread) return;
  if (isAuthor()) {
    thread.innerHTML = '';
    const rail = $i('intel-rail'); if (rail) rail.innerHTML = '';
    const modelSwitch = $i('intel-model-switch'); if (modelSwitch) modelSwitch.innerHTML = '';
    return;
  }

  const rail = $i('intel-rail');
  if (rail) rail.innerHTML = intelRailHtml();

  const modelSwitch = $i('intel-model-switch');
  if (modelSwitch) modelSwitch.innerHTML = intelModelSwitchHtml();

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

/**
 * Ask whichever model the publisher's picked (pref: 'auto' | 'gemini' |
 * 'backup' — the caller reads this from intelProviderPref()), or, on
 * 'auto', ask Google and only fall back to the backup if Google won't answer.
 *
 * On auto, this falls back on ANY Google failure, not only an exhausted
 * allowance. A rotated key, a restricted key, a switched-off API and an
 * outage all leave the publisher equally unable to ask a question, and a
 * backup that only covers one of those is a backup that is missing whenever
 * it is actually needed.
 *
 * A manual pick is a promise kept, not a preference: 'gemini' or 'backup'
 * means exactly that model answers or the question fails — silently trying
 * the other one would make the switcher a suggestion instead of a choice.
 *
 * A cancel is never a failure to fall back from: the publisher pressed stop, and
 * quietly asking somebody else instead is the opposite of what that means.
 */
async function askWithFallback(question, pref = 'auto') {
  const shared = {
    history: INTEL_HISTORY,
    userText: question,
    tools: INTEL_TOOL_SCHEMAS,
    ctx: intelContext(),
    systemInstruction: systemInstruction(),
    signal: intelAbort.signal,
  };
  const backup = backupProvider();
  const hasGemini = !!TAX_CENTER?.settings?.geminiKey;

  // A pin to a provider that's no longer configured (key removed since the
  // publisher chose it) degrades to auto rather than refusing to answer.
  if (pref === 'backup' && !backup) pref = 'auto';
  if (pref === 'gemini' && !hasGemini) pref = 'auto';

  // A failure here is tagged so the caller reaches for friendlyOpenRouterError
  // instead of the Gemini-specific friendlyChatError — an OpenRouter 401 read
  // through Gemini's own error patterns falls through to raw API text instead
  // of "the backup key was rejected".
  // On auto, a Google allowance already known to be spent (by this panel or by
  // a receipt scan — the account is shared) is not asked again until it resets:
  // it would only refuse, after a few seconds of backoff, before the backup
  // got the question anyway.
  const googleSpent = pref === 'auto' && hasGemini && !!backup && _geminiResting();
  if (pref === 'backup' || googleSpent) {
    if (googleSpent) setIntelStatus('Google’s allowance is used up for now — asking your backup model…');
    try {
      return await runOpenRouterTurn({ apiKey: backup.key, model: backup.model, ...shared });
    } catch (e) {
      if (e && e.name !== 'AbortError') e.__viaOpenRouter = true;
      throw e;
    }
  }

  if (hasGemini) {
    try {
      return await runIntelTurn({ apiKey: TAX_CENTER.settings.geminiKey, ...shared });
    } catch (e) {
      if (e && e.name === 'AbortError') throw e;
      _geminiNoteSpent(e);
      if (pref === 'gemini' || !backup) throw e;
      console.warn('Intelligence: Google failed, trying the backup model —', e && e.message);
      setIntelStatus('Google could not answer — asking the backup model…');
      try {
        return await runOpenRouterTurn({ apiKey: backup.key, model: backup.model, ...shared });
      } catch (backupErr) {
        if (backupErr && backupErr.name === 'AbortError') throw backupErr;
        // Both failed. Report both, because "it did not work" without saying
        // which half broke leaves nothing to act on.
        const combined = new Error(
          `${friendlyChatError(e)} — and the backup could not either: ${friendlyOpenRouterError(backupErr)}`
        );
        combined.__alreadyFriendly = true;
        throw combined;
      }
    }
  }

  // No Google key at all: the backup is not a fallback, it is the only option.
  if (!backup) throw new Error('No AI key is set');
  try {
    return await runOpenRouterTurn({ apiKey: backup.key, model: backup.model, ...shared });
  } catch (e) {
    if (e && e.name !== 'AbortError') e.__viaOpenRouter = true;
    throw e;
  }
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
    const out = await askWithFallback(question, intelProviderPref());

    const ids = [];
    for (const batch of out.proposals) {
      const id = `b${++proposalSeq}`;
      // `skipped` is the publisher's own unticking and lives with the batch, so
      // it survives a re-render and a reload the way the batch itself does.
      INTEL_PROPOSALS.set(id, { ...batch, id, status: 'open', skipped: [] });
      ids.push(id);
    }

    const text = out.text || (out.hitRoundCap
      ? 'I looked in several places but could not pull that together into an answer. Try asking about one thing at a time — a single book, or a single fair.'
      : 'I could not find an answer to that in your records.');

    INTEL_MESSAGES.push({
      role: 'app', text, at: Date.now(),
      tools: out.toolCalls.map(c => c.name),
      proposals: ids,
      // Only recorded when the backup answered. A figure from the backup model
      // and a figure from Google are not equally trustworthy, and the publisher
      // is entitled to know which one they are reading.
      ...(out.via === 'openrouter' ? { via: 'backup', viaModel: String(out.model || '') } : {}),
    });
    // The stored history always ends with the words the publisher actually saw,
    // and is only ever cut where a question starts: a cut between a tool call
    // and its result is refused outright by Google AND by the backup, which
    // used to make the next follow-up fail on both.
    INTEL_HISTORY = trimIntelHistory(closeIntelExchange(out.history, text), HISTORY_LIMIT);
    const staged = out.proposals.reduce((n, b) => n + (b.items ? b.items.length : 0), 0);
    setIntelStatus(staged
      ? `Answered, with ${staged} ${staged === 1 ? 'change' : 'changes'} for you to approve.`
      : 'Answered.');
  } catch (e) {
    if (e && e.name === 'AbortError') {
      setIntelStatus('Stopped.');
    } else {
      console.error('Intelligence turn failed', e);
      const friendly = e?.__alreadyFriendly ? e.message : (e?.__viaOpenRouter ? friendlyOpenRouterError(e) : friendlyChatError(e));
      INTEL_MESSAGES.push({
        role: 'app', at: Date.now(), tools: [], isError: true, question,
        text: `I could not answer that — ${friendly}.`,
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

/** Re-asks a failed question exactly as it was typed, as a new turn. */
function retryIntelQuestion(question) {
  if (!question || intelPending || isAuthor()) return;
  const input = $i('intel-input');
  if (!input) return;
  input.value = question;
  sendIntelMessage();
}

/** Copies one answer's plain text — never its markup — to the clipboard. */
async function copyIntelAnswer(btn) {
  const body = btn?.closest('.intel-msg-content')?.querySelector('.intel-msg-body');
  const text = body ? body.textContent.trim() : '';
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    showToast('Copied to your clipboard', 'ok', 1800);
  } catch (_) {
    showToast('Could not copy — your browser blocked it', 'warn', 3200);
  }
}

/** Jumps back to an earlier question in this same conversation and gives it a beat of highlight. */
function scrollToIntelMessage(id) {
  const el = id && document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.classList.add('intel-msg-flash');
  setTimeout(() => el.classList.remove('intel-msg-flash'), 1400);
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

// ── APPROVING CHANGES ────────────────────────────────────────────────────────

/** Untick one row without touching the rest of the batch. */
function toggleIntelEdit(batchId, ref) {
  const b = INTEL_PROPOSALS.get(batchId);
  if (!b || b.status !== 'open' || isAuthor()) return;
  const at = b.skipped.indexOf(ref);
  if (at === -1) b.skipped.push(ref); else b.skipped.splice(at, 1);
  saveIntelThread();
  renderIntel();
}

/** Where a record family's changes get saved, and under which key. */
function saveGroupFor(item) {
  const t = item.target;
  if (t === 'book') return { kind: 'catalog', key: 'catalog' };
  if (t === 'businessExpense' || t === 'tripBudget') return { kind: 'taxCenter', key: 'taxCenter' };
  return { kind: 'bookState', key: `book:${item.bookId}`, bookId: item.bookId };
}

/**
 * Find the live record an item names, right now.
 *
 * Deliberately re-resolved at apply time rather than held from when the batch
 * was staged: the thread survives a reload, so a change can outlive the record
 * it describes, and the publisher may have edited the same row on another
 * screen in between. Anything that has gone is reported and skipped rather than
 * recreated.
 */
function liveRecordFor(item) {
  if (item.target === 'book') return BOOKS[item.id] || null;
  if (item.target === 'businessExpense') {
    return (TAX_CENTER.businessExpenses || []).find(e => e && String(e.id) === String(item.id)) || null;
  }
  if (item.target === 'tripBudget') {
    if (!TAX_CENTER.tripBudgets || typeof TAX_CENTER.tripBudgets !== 'object') TAX_CENTER.tripBudgets = {};
    return TAX_CENTER.tripBudgets;
  }
  const list = item.target === 'store'
    ? (states[item.bookId]?.stores || [])
    : (states[item.bookId]?.expenses || []);
  return list.find(e => e && String(e.id) === String(item.id)) || null;
}

/**
 * Apply every ticked change in a batch.
 *
 * Two things this does that a naive loop would not. It saves ONCE per record
 * family rather than once per change — twenty ISBNs are one catalogue write,
 * not twenty — because each save is a network round trip and a merge, and doing
 * it twenty times is both slow and twenty chances to half-finish. And it applies
 * every change in memory first, then saves: if a save fails, the whole family's
 * changes fail together and are reported together, rather than leaving the
 * publisher guessing which half of a batch landed.
 */
async function applyIntelProposal(batchId) {
  const b = INTEL_PROPOSALS.get(batchId);
  if (!b || b.status !== 'open' || isAuthor()) return;

  const live = b.items.filter(it => !b.skipped.includes(it.ref));
  if (!live.length) return;

  const money = live.filter(it => it.risk === 'money');
  const ok = await confirmDialog(
    `This edits ${live.length === 1 ? 'a record' : 'records'} in your books. You can change ${live.length === 1 ? 'it' : 'them'} back any time from the screen ${live.length === 1 ? 'it lives' : 'they live'} on.`
    + (money.length ? `\n\n${money.length === 1 ? 'One change affects' : `${money.length} changes affect`} money — prices, shares, amounts or a shop's commission.` : ''),
    {
      title: live.length === 1 ? 'Make this change?' : `Make these ${live.length} changes?`,
      okLabel: live.length === 1 ? 'Make the change' : 'Make them all',
      danger: money.length > 0,
      // The facts go in aligned rows rather than a sentence, so what actually
      // changes is the easiest thing on the dialog to read. Capped, because a
      // dialog nobody can scroll to the bottom of is not a confirmation.
      details: live.slice(0, 12).map(it => [
        `${it.record} · ${it.fieldLabel}`,
        `${it.beforeText} → ${it.afterText}`,
      ]).concat(live.length > 12 ? [['…and more', `${live.length - 12} further changes`]] : []),
    }
  );
  if (!ok) return;

  const groups = new Map();
  const missing = [];
  for (const it of live) {
    const rec = liveRecordFor(it);
    if (!rec) { missing.push(it); continue; }
    const g = saveGroupFor(it);
    const bucket = groups.get(g.key) || { ...g, items: [] };
    bucket.items.push({ item: it, rec });
    groups.set(g.key, bucket);
  }

  // Everything in memory first, so a failed save fails a whole family together.
  for (const g of groups.values()) {
    for (const { item, rec } of g.items) {
      if (item.target === 'tripBudget') rec[item.mapKey || item.id] = item.after;
      else rec[item.field] = item.after;
      if (item.sidePatch) Object.assign(rec, item.sidePatch);
    }
  }

  const failed = [];
  let saved = 0;
  for (const g of groups.values()) {
    try {
      if (g.kind === 'catalog') await saveCatalogWithDeletions();
      else if (g.kind === 'taxCenter') await saveTaxCenter({ rethrow: true });
      else await saveState(g.bookId);
      saved += g.items.length;
    } catch (e) {
      console.error('Could not save changes for', g.key, e);
      failed.push(g);
    }
  }

  if (failed.length) {
    const n = failed.reduce((t, g) => t + g.items.length, 0);
    showToast(`${n} ${n === 1 ? 'change' : 'changes'} could not be saved — they are queued and will retry`, 'warn', 5200);
  }
  if (missing.length) {
    showToast(`${missing.length} ${missing.length === 1 ? 'record was' : 'records were'} no longer there, so ${missing.length === 1 ? 'it was' : 'they were'} skipped`, 'warn', 5000);
  }
  if (saved && !failed.length) {
    showToast(`${saved} ${saved === 1 ? 'change' : 'changes'} saved`, 'ok', 3200);
  }

  b.status = 'applied';
  b.skipped = [...b.skipped, ...missing.map(it => it.ref)];
  setIntelStatus(`${saved} of ${live.length} ${live.length === 1 ? 'change' : 'changes'} saved.`);
  saveIntelThread();
  renderIntel();

  // Every other screen rebuilds when it is navigated to, so the only one that
  // can be left showing a stale figure is the dashboard, which is also the one
  // most likely to be behind this panel.
  try {
    if (typeof window.updateDash === 'function') window.updateDash();
  } catch (_) { /* a refresh that fails must not undo a save that worked */ }
}

function dismissIntelProposal(batchId) {
  const b = INTEL_PROPOSALS.get(batchId);
  if (!b || b.status !== 'open') return;
  b.status = 'dismissed';
  saveIntelThread();
  setIntelStatus('Left as they are.');
  renderIntel();
}

loadIntelThread();

export {
  INTEL_PROPOSALS,
  acceptIntelDisclosure,
  askWithFallback,
  backupProvider,
  applyIntelProposal,
  askIntelStarter,
  clearIntelThread,
  copyIntelAnswer,
  dismissIntelProposal,
  intelBatchHtml,
  intelComposerKey,
  intelContext,
  intelText,
  renderIntel,
  retryIntelQuestion,
  scrollToIntelMessage,
  sendIntelMessage,
  setIntelProviderPref,
  stopIntelTurn,
  systemInstruction,
  toggleIntelEdit,
};
