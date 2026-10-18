// Review inbox — the one place the receipts and shipping labels the app found
// on its own are looked at, one at a time.
//
// Both used to end in a table somewhere in the Tax Centre, reached from a
// notification that could only say "1 new receipt". This is the screen those
// notifications now open. It lists what is waiting on the left; the pane on the
// right says what the app found, why it stopped, what to do in plain steps, and
// carries the buttons — so the owner never has to work out what a row means.
//
// It owns no data. Receipts are the same drafts the receipt table edits and are
// filed by the same routine; labels are the same postage expenses the shipping
// Tax Centre summary counts and are linked by the same function. What a person could do
// here they could do there, and the two can never disagree.
import '../styles/review-inbox.css';
import { escapeHtml } from '../lib/html.js';
import { closeM, confirmDialog, openM } from '../lib/modal.js';
import { PICKER_CURRENCIES } from '../lib/money.js';
import {
  REVIEW_STATE,
  buildReviewQueue,
  doubleKey,
  receiptKey,
  summarizeReviewQueue,
} from '../lib/review-queue.js';
import { $, isAuthor, refreshAttentionSurfaces, showToast } from '../main.js';
import {
  EXPENSE_CATEGORIES,
  discardReviewedReceipt,
  editReviewedReceipt,
  fileReviewedReceipts,
  openEmailReceiptImportModal,
  reviewableReceiptDrafts,
  settleSubscriptionDouble,
  subscriptionDoubleEntries,
} from './receipts.js';
import {
  discardImportedPostageExpense,
  labelReviewEntries,
  linkConfidentShippingMatchesNow,
  linkPostageToOrder,
  openPostageAmountEditor,
  openRecoverWebsiteOrder,
  postageOrderChoices,
  setAsideLabelFromReview,
} from './shipping.js';

/** Modals the inbox steps aside for; it comes back when they close. */
const HAND_OFF_MODALS = ['edit-expense', 'recover-website-order'];

const STATE_WORDS = {
  [REVIEW_STATE.needsYou]: { glyph: '!', word: 'Needs you' },
  [REVIEW_STATE.check]: { glyph: '●', word: 'Take a look' },
  [REVIEW_STATE.ready]: { glyph: '✓', word: 'Ready to file' },
};

let _filter = 'all';
let _selectedKey = '';
let _view = 'list';
let _busy = false;
let _returnToInbox = false;
let _wired = false;
// key → { item, draft?, entry?, pair? } for the render in front of the owner.
let _rows = new Map();
let _items = [];

function reviewInboxIsOpen() {
  const el = $('m-review-inbox');
  return !!el && el.style.display !== 'none' && !el.classList.contains('closing');
}

function isNarrow() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 720px)').matches;
}

/** What is waiting right now, for the inbox and for the landing page's counts. */
function reviewQueueSnapshot({ refresh = false } = {}) {
  const { drafts, isDuplicate, subscriptionMatch } = reviewableReceiptDrafts({ refresh });
  const entries = labelReviewEntries();
  const doubles = subscriptionDoubleEntries();
  const items = buildReviewQueue({ receiptDrafts: drafts, isDuplicate, subscriptionMatch, labels: entries, doubles });
  const rows = new Map();
  items.forEach(item => {
    if (item.kind === 'receipt') {
      const draft = drafts.find((d, i) => receiptKey(d, i) === item.key);
      rows.set(item.key, { item, draft });
    } else if (item.kind === 'double') {
      rows.set(item.key, { item, pair: doubles.find(p => doubleKey(p.expense) === item.key) });
    } else {
      rows.set(item.key, { item, entry: entries.find(e => e.expense.ref === item.ref) });
    }
  });
  return { items, rows, summary: summarizeReviewQueue(items) };
}

function visibleItems() {
  return _filter === 'all' ? _items : _items.filter(item => item.kind === _filter || item.group === _filter);
}

// ── Rendering ─────────────────────────────────────────────────────────────

function chipHtml(state) {
  const { glyph, word } = STATE_WORDS[state] || STATE_WORDS[REVIEW_STATE.check];
  return `<span class="ri-chip is-${escapeHtml(state)}"><span aria-hidden="true">${glyph}</span> ${word}</span>`;
}

function listHtml(items) {
  return items.map(item => `<li>
      <button type="button" class="ri-item is-${escapeHtml(item.state)}${item.key === _selectedKey ? ' is-selected' : ''}"
        data-ri-action="select" data-ri-key="${escapeHtml(item.key)}"
        aria-current="${item.key === _selectedKey ? 'true' : 'false'}">
        <span class="ri-item-ico" aria-hidden="true">${escapeHtml(item.icon)}</span>
        <span class="ri-item-main">
          <span class="ri-item-title">${escapeHtml(item.title)}</span>
          <span class="ri-item-sub">${escapeHtml(item.subtitle)}</span>
        </span>
        ${chipHtml(item.state)}
      </button>
    </li>`).join('');
}

function factsHtml(item, draft) {
  const rows = item.facts.filter(([label]) => item.kind !== 'receipt' || !['Vendor', 'Date', 'Amount', 'Category'].includes(label));
  const links = item.kind === 'receipt'
    ? (Array.isArray(draft?.receiptUrls) && draft.receiptUrls.length ? draft.receiptUrls : [draft?.receipt])
      .filter(url => /^https?:/i.test(String(url || '')))
      .map((url, i) => `<a class="ri-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Open the original receipt${i ? ` ${i + 1}` : ''} ↗</a>`)
      .join('')
    : '';
  if (!rows.length && !links) return '';
  return `<section class="ri-section">
      <h4>What the app found</h4>
      ${rows.length ? `<dl class="ri-facts">${rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>` : ''}
      ${links}
    </section>`;
}

function guideHtml(item) {
  const why = item.reasons.length
    ? `<ul class="ri-reasons">${item.reasons.map(r => `<li>${escapeHtml(r)}</li>`).join('')}</ul>`
    : '<p class="ri-plain">Everything needed is filled in, and nothing in your books matches it. Nothing is filed until you press the button.</p>';
  return `<section class="ri-section">
      <h4>Why it is here</h4>${why}
    </section>
    <section class="ri-section">
      <h4>What to do</h4>
      <ol class="ri-steps">${item.steps.map(step => `<li>${escapeHtml(step)}</li>`).join('')}</ol>
    </section>`;
}

function receiptFormHtml(item, draft) {
  const key = escapeHtml(item.key);
  const cats = [...new Set([...(EXPENSE_CATEGORIES || []), draft.category].filter(Boolean))];
  const curs = [...new Set([...PICKER_CURRENCIES, String(draft.currency || 'CAD').toUpperCase()])];
  const missingAmount = draft.amountUnknown || !(Number(draft.amount) > 0);
  const opt = (value, chosen) => `<option${value === chosen ? ' selected' : ''}>${escapeHtml(value)}</option>`;
  return `<section class="ri-section" data-autosave>
      <h4>Check the details</h4>
      <div class="ri-form">
        <label class="ri-field">Vendor
          <input type="text" data-ri-field="vendor" data-ri-key="${key}" value="${escapeHtml(draft.vendor || '')}" autocomplete="off">
        </label>
        <label class="ri-field">Date on the receipt
          <input type="date" data-ri-field="date" data-ri-key="${key}" value="${escapeHtml(draft.date || '')}">
        </label>
        <label class="ri-field">Amount paid
          <span class="ri-money">
            <select data-ri-field="currency" data-ri-key="${key}" aria-label="Currency">${curs.map(c => opt(c, String(draft.currency || 'CAD').toUpperCase())).join('')}</select>
            <input type="number" inputmode="decimal" step="0.01" min="0" data-ri-field="amount" data-ri-key="${key}"
              value="${missingAmount ? '' : Number(draft.amount).toFixed(2)}" placeholder="0.00"${missingAmount ? ' aria-invalid="true"' : ''}>
          </span>
        </label>
        <label class="ri-field">Category
          <select data-ri-field="category" data-ri-key="${key}">${draft.category ? '' : '<option value="" selected disabled>Choose a category…</option>'}${cats.map(c => opt(c, draft.category)).join('')}</select>
        </label>
      </div>
    </section>`;
}

/**
 * For a receipt that belongs to a subscription charge: which subscription,
 * when two fit, and which amount, when the receipt and the charge differ.
 */
function subscriptionFormHtml(item) {
  const sub = item.subscription;
  if (!sub) return '';
  const key = escapeHtml(item.key);
  // Both answers save as they change, like the boxes above, so they are
  // marked autosave and never read as unsaved work when the window closes.
  const picker = sub.choosable
    ? `<section class="ri-section" data-autosave>
      <h4>Which subscription</h4>
      <label class="ri-field">The subscription this receipt is for
        <select data-ri-field="subscriptionId" data-ri-key="${key}">
          ${sub.ambiguous ? '<option value="" selected disabled>Choose a subscription…</option>' : ''}
          ${sub.choices.map(c => `<option value="${escapeHtml(c.subId)}"${!sub.ambiguous && c.subId === sub.subId ? ' selected' : ''}>${escapeHtml(c.label)}</option>`).join('')}
        </select>
      </label>
    </section>`
    : '';
  if (!sub.needsAnswer) return picker;
  // Nothing is picked for the owner: a different amount from the right company
  // is as likely a separate purchase as this charge at another price.
  const chosen = sub.answer;
  const name = `ri-what-${item.index}`;
  const choice = (value, title, sub) => `<label class="ri-choice">
        <input type="radio" name="${escapeHtml(name)}" value="${value}" data-ri-field="subscriptionAmount" data-ri-key="${key}"${chosen === value ? ' checked' : ''}>
        <span class="ri-choice-body">
          <span class="ri-choice-title">${title}</span>
          <span class="ri-choice-sub">${sub}</span>
        </span>
      </label>`;
  const charge = sub.posted ? 'that charge' : 'the next charge';
  const options = [
    choice('keep', `Proof for ${charge} — keep ${escapeHtml(sub.chargeMoney)}`,
      'The charge stays as it is, with this receipt as its proof. Pick this when your books count a share of the bill, like the business part of the rent.'),
  ];
  if (sub.amountDiffers) {
    options.push(choice('receipt', `Proof for ${charge} — use ${escapeHtml(sub.receiptMoney)} this time`,
      `Just this once, like a bill with extra usage. Later charges stay at ${escapeHtml(sub.chargeMoney)}.`));
  }
  if (sub.canChangePrice) {
    options.push(choice('price', `Proof for ${charge} — the price is now ${escapeHtml(sub.receiptMoney)}`,
      'Use it for this charge and every charge after it.'));
  }
  options.push(choice('separate', 'A separate purchase',
    `Not your ${escapeHtml(sub.name)} subscription. It is filed on its own as a new expense.`));
  return `${picker}<section class="ri-section" data-autosave>
      <h4 id="ri-what-head">What this receipt is</h4>
      <div class="ri-choices" role="radiogroup" aria-labelledby="ri-what-head">${options.join('')}</div>
    </section>`;
}

function labelFormHtml(item, entry) {
  const key = escapeHtml(item.key);
  const parts = [];
  if (item.needsAmount) {
    parts.push(`<div class="ri-form-row">
        <div><strong>Postage amount</strong><span class="ri-hint">Not read from the confirmation.</span></div>
        <button type="button" class="btn gold sm" data-ri-action="amount" data-ri-key="${key}">Enter the amount</button>
      </div>`);
  }
  if (item.needsOrder) {
    const choices = postageOrderChoices();
    const suggested = entry?.suggestedOrder || '';
    const selectId = 'ri-order-select';
    parts.push(`<div class="ri-form-row is-stack">
        <label class="ri-field" for="${selectId}">Order this label was for
          <select id="${selectId}"${choices.length ? '' : ' disabled'}>
            <option value="">${choices.length ? 'Choose an order…' : 'No website orders on file'}</option>
            ${choices.map(c => `<option value="${escapeHtml(c.number)}"${c.number === suggested ? ' selected' : ''}>${escapeHtml(c.number)} · ${escapeHtml(c.name)}</option>`).join('')}
          </select>
        </label>
        <div class="ri-inline-actions">
          <button type="button" class="btn gold sm" data-ri-action="link" data-ri-key="${key}"${choices.length ? '' : ' disabled'}>Link to this order</button>
          <button type="button" class="btn sm" data-ri-action="addOrder" data-ri-key="${key}">Add the missing order</button>
          <button type="button" class="btn ghost sm" data-ri-action="setAside" data-ri-key="${key}">Not a website order</button>
        </div>
      </div>`);
  }
  return `<section class="ri-section"><h4>Finish it</h4>${parts.join('')}</section>`;
}

function receiptActionsHtml(item) {
  const key = escapeHtml(item.key);
  const blocked = item.state === REVIEW_STATE.needsYou;
  const sub = item.subscription;
  let primary = item.duplicate ? 'Already in my books' : 'File this receipt';
  if (sub) primary = sub.covered ? 'Already in my books' : 'Attach as proof';
  let hint = 'Fill in the missing details above to file it.';
  if (sub?.ambiguous) hint = 'Choose the subscription above first.';
  else if (sub?.needsAnswer) hint = 'Choose what this receipt is above first.';
  return `<div class="ri-actions">
      <button type="button" class="btn gold" data-ri-action="file" data-ri-key="${key}"${blocked ? ' disabled' : ''}>${primary}</button>
      ${sub && !sub.needsAnswer ? `<button type="button" class="btn" data-ri-action="separate" data-ri-key="${key}">It’s a separate purchase</button>` : ''}
      ${item.separateFrom ? `<button type="button" class="btn ghost" data-ri-action="unseparate" data-ri-key="${key}">It’s part of ${escapeHtml(item.separateFrom)}</button>` : ''}
      <button type="button" class="btn danger-btn" data-ri-action="discard" data-ri-key="${key}">Not needed</button>
      ${blocked ? `<span class="ri-hint" role="note">${hint}</span>` : ''}
    </div>`;
}

function doubleActionsHtml(item) {
  const key = escapeHtml(item.key);
  return `<div class="ri-actions">
      <button type="button" class="btn gold" data-ri-action="merge" data-ri-key="${key}">Merge them</button>
      <button type="button" class="btn" data-ri-action="keepApart" data-ri-key="${key}">They’re different</button>
    </div>`;
}

function labelActionsHtml(item) {
  if (!item.needsAmount) return '';
  return `<div class="ri-actions">
      <button type="button" class="btn danger-btn sm" data-ri-action="removeLabel" data-ri-key="${escapeHtml(item.key)}">Remove label</button>
    </div>`;
}

const KIND_WORDS = {
  receipt: 'Receipt found in your inbox',
  double: 'Counted twice',
  label: 'Shipping label bought outside the app',
};

function detailHtml(item) {
  const row = _rows.get(item.key) || {};
  let form = '';
  let actions = '';
  if (item.kind === 'receipt') {
    form = receiptFormHtml(item, row.draft || {}) + subscriptionFormHtml(item);
    actions = receiptActionsHtml(item);
  } else if (item.kind === 'double') {
    actions = doubleActionsHtml(item);
  } else {
    form = labelFormHtml(item, row.entry);
    actions = labelActionsHtml(item);
  }
  return `<button type="button" class="ri-back btn ghost sm" data-ri-action="back">← Back to the list</button>
    <header class="ri-detail-head">
      <span class="ri-detail-ico" aria-hidden="true">${escapeHtml(item.icon)}</span>
      <div>
        <h3 id="ri-detail-title" tabindex="-1">${escapeHtml(item.title)}</h3>
        <p class="ri-kind">${KIND_WORDS[item.kind] || KIND_WORDS.label}</p>
      </div>
      <span data-ri-live>${chipHtml(item.state)}</span>
    </header>
    ${guideHtml(item)}
    ${form}
    ${factsHtml(item, row.draft)}
    ${actions}`;
}

function emptyDetailHtml(summary) {
  const clear = !summary.total;
  return `<div class="ri-empty">
      <div class="ri-empty-mark" aria-hidden="true">${clear ? '✓' : '←'}</div>
      <strong>${clear ? 'All caught up' : 'Pick one from the list'}</strong>
      <span>${clear
    ? 'Nothing is waiting for review. New receipts and shipping labels the app finds will show up here.'
    : 'Choose a receipt or label to see what the app found and what to do with it.'}</span>
    </div>`;
}

function renderReviewInbox({ focusDetail = false } = {}) {
  const host = $('m-review-inbox');
  if (!host) return;
  const snap = reviewQueueSnapshot({ refresh: false });
  _items = snap.items;
  _rows = snap.rows;
  const summary = snap.summary;

  let shown = visibleItems();
  if (!shown.length && _filter !== 'all') { _filter = 'all'; shown = visibleItems(); }
  if (!shown.some(item => item.key === _selectedKey)) {
    _selectedKey = !isNarrow() && shown[0] ? shown[0].key : '';
  }
  if (!_selectedKey) _view = 'list';

  $('ri-summary').textContent = summary.total ? `${summary.headline}. ${summary.detail}` : 'Nothing is waiting for review.';
  const counts = { all: summary.total, receipt: summary.receipts + summary.doubles, label: summary.labels };
  host.querySelectorAll('[data-ri-filter]').forEach(btn => {
    const on = btn.dataset.riFilter === _filter;
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-pressed', String(on));
    const count = btn.querySelector('.ri-count');
    if (count) count.textContent = String(counts[btn.dataset.riFilter] ?? 0);
  });

  $('ri-list').innerHTML = shown.length
    ? listHtml(shown)
    : '<li class="ri-list-empty">Nothing here.</li>';
  const selected = shown.find(item => item.key === _selectedKey);
  $('ri-detail').innerHTML = selected ? detailHtml(selected) : emptyDetailHtml(summary);
  host.querySelector('.ri-shell').dataset.view = selected ? _view : 'list';

  const readyReceipts = _items.filter(i => i.kind === 'receipt' && i.state === REVIEW_STATE.ready).length;
  const fileAll = $('ri-file-ready');
  if (fileAll) {
    fileAll.hidden = readyReceipts < 2;
    fileAll.textContent = `File all ${readyReceipts} ready receipts`;
  }
  const linkCertain = $('ri-link-certain');
  if (linkCertain) linkCertain.hidden = !_items.some(i => i.kind === 'label' && i.needsOrder);
  if (focusDetail && selected) $('ri-detail-title')?.focus({ preventScroll: false });
}

/** After a field is edited: refresh the list and the guidance, but leave the boxes being typed in alone. */
function renderAfterEdit() {
  const snap = reviewQueueSnapshot({ refresh: false });
  _items = snap.items;
  _rows = snap.rows;
  const shown = visibleItems();
  $('ri-list').innerHTML = listHtml(shown);
  $('ri-summary').textContent = snap.summary.total ? `${snap.summary.headline}. ${snap.summary.detail}` : 'Nothing is waiting for review.';
  const item = shown.find(i => i.key === _selectedKey);
  const detail = $('ri-detail');
  if (!item || !detail) return;
  detail.querySelector('[data-ri-live]').innerHTML = chipHtml(item.state);
  const sections = detail.querySelectorAll('.ri-section');
  if (sections.length >= 2) {
    const guide = document.createElement('div');
    guide.innerHTML = guideHtml(item);
    sections[0].replaceWith(guide.children[0]);
    sections[1].replaceWith(guide.children[0]);
  }
  const actions = detail.querySelector('.ri-actions');
  if (actions) {
    const holder = document.createElement('div');
    holder.innerHTML = receiptActionsHtml(item);
    actions.replaceWith(holder.children[0]);
  }
}

// ── Actions ───────────────────────────────────────────────────────────────

/** What decides the pane's shape for a subscription receipt, as one comparable string. */
function subscriptionShape(item) {
  const sub = item?.subscription;
  return JSON.stringify([
    sub ? [sub.subId, sub.ambiguous, sub.needsAnswer, sub.amountDiffers, sub.canChangePrice, sub.covered, sub.posted] : null,
    item?.separateFrom || '',
  ]);
}

function nextKeyAfter(key) {
  const shown = visibleItems();
  const at = shown.findIndex(item => item.key === key);
  const next = shown[at + 1] || shown[at - 1];
  return next && next.key !== key ? next.key : '';
}

async function afterChange(previousKey) {
  const upNext = nextKeyAfter(previousKey);
  const stillThere = reviewQueueSnapshot().rows.has(previousKey);
  _selectedKey = stillThere ? previousKey : (isNarrow() ? '' : upNext);
  if (!stillThere && isNarrow()) _view = 'list';
  renderReviewInbox({ focusDetail: !!_selectedKey && !isNarrow() });
  refreshAttentionSurfaces();
}

async function run(action, task) {
  if (_busy) return;
  _busy = true;
  try { await task(); } catch (error) {
    console.error(`[review-inbox] ${action} failed`, error);
    showToast('That did not work. Please try again.', 'err');
  } finally { _busy = false; }
}

function handOff(open) {
  _returnToInbox = true;
  closeM('review-inbox');
  open();
}

async function fileOne(key) {
  const row = _rows.get(key);
  if (!row?.draft) return;
  const { item, draft } = row;
  const sub = item.subscription;
  const counts = await fileReviewedReceipts([draft]);
  if (!counts) { showToast('That receipt is no longer waiting.', 'warn'); }
  else if (counts.held) showToast('It is still waiting — choose what it is first.', 'warn');
  else if (counts.attached) showToast(`Kept as proof for ${sub?.period || 'the charge'} of ${sub?.name || 'your subscription'}. Nothing was counted twice.`, 'ok');
  else if (counts.countedEarly) showToast(`Counted the ${sub?.name || 'subscription'} charge due ${sub?.dueDate || 'next'}, with this receipt as its proof.`, 'ok');
  else if (counts.imported) showToast(`Filed: ${item.title} — ${item.subtitle}`, 'ok');
  else if (counts.relinked) showToast('Receipt attached to the expense already in your books.', 'ok');
  else showToast('That one was already in your books, so nothing new was added.', 'ok');
  await afterChange(key);
}

async function fileAllReady() {
  const ready = _items.filter(i => i.kind === 'receipt' && i.state === REVIEW_STATE.ready);
  if (!ready.length) return;
  const list = ready.map(i => `• ${i.title} — ${i.subtitle}`).join('\n');
  const forSubs = ready.some(i => i.subscription);
  const ok = await confirmDialog(
    `File ${ready.length} receipts?\n\n${list}\n\nEach goes into your books under the category shown, with its email saved as proof.${forSubs ? ' A receipt for a subscription is kept with that charge instead, so nothing is counted twice.' : ''}`,
    { title: 'File the ready receipts', okLabel: `File ${ready.length}` },
  );
  if (!ok) return;
  const drafts = ready.map(i => _rows.get(i.key)?.draft).filter(Boolean);
  const counts = await fileReviewedReceipts(drafts);
  const done = counts ? counts.imported + counts.attached + counts.countedEarly : 0;
  showToast(counts ? `Filed ${done} receipt${done === 1 ? '' : 's'}.` : 'Those receipts are no longer waiting.', done ? 'ok' : 'warn');
  await afterChange(_selectedKey);
}

async function discardOne(key) {
  const row = _rows.get(key);
  if (!row?.draft) return;
  const ok = await confirmDialog(
    `Leave “${row.item.title}” out of your books?\n\nIt will not come back in this list. Nothing already in your books changes.`,
    { title: 'Not a business cost', okLabel: 'Leave it out', danger: true },
  );
  if (!ok) return;
  await discardReviewedReceipt(row.draft);
  await afterChange(key);
}

async function setSeparate(key, separate) {
  const draft = _rows.get(key)?.draft;
  if (!draft || !editReviewedReceipt(draft, 'notSubscription', separate)) return;
  renderReviewInbox({ focusDetail: true });
  refreshAttentionSurfaces();
}

async function mergeDouble(key) {
  const item = _rows.get(key)?.item;
  if (!item) return;
  const ok = await confirmDialog(
    `Merge “${item.title}” into the subscription charge?\n\nThe extra expense is removed and anything kept on it moves to the subscription charge. The cost is then counted once.`,
    { title: 'Counted twice', okLabel: 'Merge them' },
  );
  if (!ok) return;
  if (await settleSubscriptionDouble(item.expenseId, { merge: true })) showToast('Merged. That cost is now counted once.', 'ok');
  else showToast('That pair is no longer in your books, or the change could not be saved.', 'warn');
  await afterChange(key);
}

async function keepDoubleApart(key) {
  const item = _rows.get(key)?.item;
  if (!item) return;
  if (await settleSubscriptionDouble(item.expenseId, { merge: false })) showToast('Kept as two separate costs.', 'ok');
  else showToast('That pair is no longer in your books, or the change could not be saved.', 'warn');
  await afterChange(key);
}

async function linkOne(key) {
  const row = _rows.get(key);
  const number = $('ri-order-select')?.value;
  if (!row?.entry) return;
  if (!number) { showToast('Choose an order first.', 'warn'); return; }
  if (await linkPostageToOrder(row.entry.expense.ref, number)) await afterChange(key);
}

async function setAside(key) {
  const row = _rows.get(key);
  if (row?.entry && await setAsideLabelFromReview(row.entry.expense.ref)) await afterChange(key);
}

async function removeLabel(key) {
  const row = _rows.get(key);
  if (!row?.entry) return;
  await discardImportedPostageExpense(row.entry.expense.ref);
  await afterChange(key);
}

const ACTIONS = {
  select(key) {
    _selectedKey = key;
    _view = 'detail';
    renderReviewInbox({ focusDetail: true });
  },
  back() { _view = 'list'; renderReviewInbox(); },
  file: key => run('file', () => fileOne(key)),
  discard: key => run('discard', () => discardOne(key)),
  separate: key => run('separate', () => setSeparate(key, true)),
  unseparate: key => run('unseparate', () => setSeparate(key, false)),
  merge: key => run('merge', () => mergeDouble(key)),
  keepApart: key => run('keepApart', () => keepDoubleApart(key)),
  link: key => run('link', () => linkOne(key)),
  setAside: key => run('setAside', () => setAside(key)),
  removeLabel: key => run('removeLabel', () => removeLabel(key)),
  amount(key) {
    const ref = _rows.get(key)?.entry?.expense.ref;
    if (ref) handOff(() => openPostageAmountEditor(ref));
  },
  addOrder(key) {
    const ref = _rows.get(key)?.entry?.expense.ref;
    if (ref) handOff(() => openRecoverWebsiteOrder(ref));
  },
  fileAllReady: () => run('fileAllReady', fileAllReady),
  fullTable() { closeM('review-inbox'); openEmailReceiptImportModal({ review: true }); },
  linkCertain: () => run('linkCertain', async () => { await linkConfidentShippingMatchesNow(); await afterChange(_selectedKey); }),
  close() { closeM('review-inbox'); },
};

function wire() {
  if (_wired) return;
  _wired = true;
  const host = $('m-review-inbox');
  host.addEventListener('click', event => {
    const filterBtn = event.target.closest('[data-ri-filter]');
    if (filterBtn) { _filter = filterBtn.dataset.riFilter; _selectedKey = ''; _view = 'list'; renderReviewInbox(); return; }
    const btn = event.target.closest('[data-ri-action]');
    if (!btn || btn.disabled) return;
    const action = ACTIONS[btn.dataset.riAction];
    if (action) action(btn.dataset.riKey || '');
  });
  host.addEventListener('change', event => {
    const field = event.target.closest?.('[data-ri-field]');
    if (!field) return;
    const key = field.dataset.riKey;
    const draft = _rows.get(key)?.draft;
    const before = subscriptionShape(_rows.get(key)?.item);
    if (!draft || !editReviewedReceipt(draft, field.dataset.riField, field.value)) return;
    // An edit can change what the receipt is — a typed amount that now differs
    // from the subscription's, a subscription chosen. Then the whole pane is
    // redrawn, and the cursor goes back to the box that was changed.
    const after = subscriptionShape(reviewQueueSnapshot().rows.get(key)?.item);
    if (after === before) { renderAfterEdit(); return; }
    renderReviewInbox();
    const sel = `[data-ri-field="${CSS.escape(field.dataset.riField)}"][data-ri-key="${CSS.escape(key)}"]`;
    const again = host.querySelector(`${sel}:checked`) || host.querySelector(sel) || $('ri-detail-title');
    again?.focus?.();
  });
  // A hand-off comes back when the modal it opened closes. Capture, because the
  // close event does not bubble.
  document.addEventListener('modal-close', event => {
    if (!_returnToInbox || !HAND_OFF_MODALS.includes(String(event.target?.id || '').slice(2))) return;
    _returnToInbox = false;
    setTimeout(() => { openM('review-inbox'); renderReviewInbox(); refreshAttentionSurfaces(); }, 0);
  }, true);
}

/**
 * Open the inbox, on everything or just receipts or labels.
 * Callable from any screen; it floats over whatever is open.
 */
function openReviewInbox({ filter = 'all', key = '' } = {}) {
  if (!window.IS_PUBLISHER || isAuthor()) { showToast('Publisher access required', 'warn'); return; }
  wire();
  // Set aside at once rather than fading out, so it never sits behind the inbox.
  closeM('notifications');
  const notifications = $('m-notifications');
  if (notifications) notifications.style.display = 'none';
  _filter = filter === 'receipt' || filter === 'label' ? filter : 'all';
  _selectedKey = key;
  _view = key ? 'detail' : 'list';
  _returnToInbox = false;
  reviewableReceiptDrafts({ refresh: true });
  openM('review-inbox');
  renderReviewInbox({ focusDetail: false });
}

export {
  openReviewInbox,
  reviewQueueSnapshot,
  renderReviewInbox,
  reviewInboxIsOpen,
};
