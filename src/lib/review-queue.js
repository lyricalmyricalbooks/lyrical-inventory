// Everything the app has found on its own that still needs a person to look.
//
// Receipts the inbox scan read, and shipping labels bought outside the app,
// both arrive the same way: the app does what it can, then leaves the last
// decision to the owner. Until now each landed in its own table somewhere in
// the Tax Centre, and the notification that announced it could only say "1 new
// receipt" and point at that table. This turns both into one list of review
// items, each saying what the app found, what it is unsure of, and exactly what
// to do next — the words the review screen prints.
//
// Pure: no DOM, no ledger writes, no network. The caller passes in what it
// already holds (the drafted receipts, the postage expenses) and a duplicate
// check, so nothing here can change a figure in the books.

import { isReadyToFile, READY_CONFIDENCE } from './receipt-ready.js';

/** How an item is judged: a quick win, a look, or something only the owner can supply. */
export const REVIEW_STATE = { ready: 'ready', check: 'check', needsYou: 'needs-you' };

const STATE_RANK = { 'needs-you': 0, check: 1, ready: 2 };

function money(amount, currency) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '';
  return `${String(currency || 'CAD').toUpperCase()} ${n.toFixed(2)}`;
}

function plural(n, one, many) {
  return n === 1 ? one : many;
}

/** A receipt's identity across reloads: its stable ref, else its email, else its position. */
export function receiptKey(draft, index = 0) {
  return `receipt:${draft?.ref || draft?.msgId || draft?._inboxId || `row-${index}`}`;
}

export function labelKey(expense) {
  return `label:${expense?.ref || ''}`;
}

/**
 * One drafted receipt as a review item.
 *
 * The reasons are the ways filing it untouched could put something wrong in
 * the books — the same conditions isReadyToFile() uses, said in words.
 */
export function receiptReviewItem(draft = {}, { duplicate = false, index = 0 } = {}) {
  const reasons = [];
  const amountMissing = !!draft.amountUnknown || !(Number(draft.amount) > 0);
  const category = String(draft.category || '').trim();
  if (duplicate) reasons.push('It looks like an expense already in your books (same date and amount). Filing it again would count the cost twice.');
  if (amountMissing) reasons.push('The amount could not be read from the email. Type it in from the receipt.');
  if (!category || category === 'Other') reasons.push('No clear category was found. Pick the one that fits.');
  if (!amountMissing && !(Number(draft.confidence) >= READY_CONFIDENCE)) reasons.push('The reader was not sure of what it saw. Compare the figures with the original receipt.');
  if (!String(draft.date || '').trim()) reasons.push('No date was found. Add the date on the receipt.');

  let state = REVIEW_STATE.check;
  if (amountMissing || !String(draft.date || '').trim()) state = REVIEW_STATE.needsYou;
  else if (isReadyToFile(draft, { duplicate })) state = REVIEW_STATE.ready;

  const vendor = draft.vendor || draft.description || 'Receipt';
  const facts = [
    ['Vendor', draft.vendor || '—'],
    ['Date', draft.date || '—'],
    ['Amount', amountMissing ? 'Not read' : money(draft.amount, draft.currency)],
    ['Category', category || '—'],
  ];
  if (draft.emailFrom) facts.push(['From', draft.emailFrom]);
  if (draft.emailSubject) facts.push(['Email subject', draft.emailSubject]);

  let steps;
  if (duplicate) {
    steps = [
      'Compare it with the matching expense already in your books.',
      'If it is the same purchase, press “Already in my books”. The receipt is kept with that expense and this one leaves the list.',
      'If it is not a business cost, press “Not needed”.',
    ];
  } else if (state === REVIEW_STATE.ready) {
    steps = [
      'Check the vendor, date and amount against the receipt.',
      `Press “File this receipt”. It goes into your books under ${category}, and the email is saved as its proof.`,
    ];
  } else {
    steps = [
      'Open the original receipt with the link under “What the app found”, if you want to check it.',
      'Fix anything marked in the boxes under “Check the details”.',
      'Press “File this receipt” when it looks right, or “Not needed” if it is not a business cost.',
    ];
  }

  return {
    key: receiptKey(draft, index),
    kind: 'receipt',
    state,
    icon: '🧾',
    title: vendor,
    subtitle: amountMissing ? 'Amount needed' : `${money(draft.amount, draft.currency)} · ${category || 'No category'}`,
    reasons,
    facts,
    steps,
    duplicate,
    index,
  };
}

/**
 * One shipping label bought outside the app as a review item.
 *
 * `needsAmount` and `needsOrder` are separate jobs, and a label can need both:
 * the amount decides the shipping cost in the books, the order decides which
 * sale it counts against.
 */
export function labelReviewItem(expense = {}, { needsAmount = false, needsOrder = false, suggestedOrder = '' } = {}) {
  const reasons = [];
  if (needsAmount) reasons.push('The confirmation did not give a reliable price. Check the carrier charge, then enter the amount.');
  if (needsOrder) {
    reasons.push(suggestedOrder
      ? `It has not been linked to an order yet. The app guesses ${suggestedOrder}.`
      : 'It has not been linked to an order yet, so its cost is not counted against any sale.');
  }
  const source = expense.postageSource === 'email' ? 'Shipping confirmation email'
    : expense.postageSource === 'canadapost' ? 'Canada Post account' : 'Imported label';
  const facts = [
    ['Found in', source],
    ['Date', expense.date || '—'],
    ['Amount', needsAmount ? 'Not read' : money(expense.amount, expense.currency)],
  ];
  if (expense.recipientName) facts.push(['Sent to', [expense.recipientName, expense.recipientPostal].filter(Boolean).join(' · ')]);
  if (expense.trackingNumber) facts.push(['Tracking', [expense.trackingCarrier, expense.trackingNumber].filter(Boolean).join(' ')]);
  if (expense.postageEmailFrom) facts.push(['From', expense.postageEmailFrom]);
  if (expense.postageEmailSubject) facts.push(['Email subject', expense.postageEmailSubject]);

  const steps = [];
  if (needsAmount) steps.push('Look at the carrier’s receipt for what you were charged. Press “Enter the amount” and type it in.');
  if (needsOrder) {
    steps.push(`Pick the order this label was for in the Order box${suggestedOrder ? ` (${suggestedOrder} is pre-picked)` : ''}, then press “Link to this order”. If the order is not listed, press “Add the missing order”.`);
    steps.push('If it was not for a website order (a hand sale, a personal parcel), press “Not a website order”. The cost stays in your books; it just stops asking.');
  }
  if (needsAmount) steps.push('If this label is not yours or was a mistake, press “Remove label”. It will not be imported again.');

  const state = needsAmount ? REVIEW_STATE.needsYou : REVIEW_STATE.check;
  const what = [needsAmount ? 'amount' : '', needsOrder ? 'order' : ''].filter(Boolean).join(' and ');
  return {
    key: labelKey(expense),
    kind: 'label',
    state,
    icon: '🏷️',
    title: expense.desc || 'Shipping label',
    subtitle: `${needsAmount ? 'Amount needed' : money(expense.amount, expense.currency)}${what ? ` · needs ${what}` : ''}`,
    reasons,
    facts,
    steps,
    needsAmount,
    needsOrder,
    ref: expense.ref,
  };
}

/**
 * Every item, the ones only the owner can settle first, quick wins last.
 *
 * `receiptDrafts` is the drafted list; `isDuplicate(draft)` says whether one
 * matches the books. `labels` is `[{ expense, needsAmount, needsOrder, suggestedOrder }]`
 * — the caller decides what counts as unfinished, so this and the worklists it
 * links to can never disagree about it.
 */
export function buildReviewQueue({ receiptDrafts = [], isDuplicate = () => false, labels = [] } = {}) {
  const items = [];
  (Array.isArray(receiptDrafts) ? receiptDrafts : []).forEach((draft, index) => {
    if (draft) items.push(receiptReviewItem(draft, { duplicate: !!isDuplicate(draft), index }));
  });
  (Array.isArray(labels) ? labels : []).forEach(entry => {
    if (entry?.expense) items.push(labelReviewItem(entry.expense, entry));
  });
  return items
    .map((item, order) => ({ item, order }))
    .sort((a, b) => (STATE_RANK[a.item.state] - STATE_RANK[b.item.state]) || (a.order - b.order))
    .map(({ item }) => item);
}

/** Counts and the one sentence the notification cards and the review screen share. */
export function summarizeReviewQueue(items = []) {
  const list = Array.isArray(items) ? items : [];
  const receipts = list.filter(i => i.kind === 'receipt').length;
  const labels = list.filter(i => i.kind === 'label').length;
  const ready = list.filter(i => i.state === REVIEW_STATE.ready).length;
  const needsYou = list.filter(i => i.state === REVIEW_STATE.needsYou).length;
  const total = list.length;

  const parts = [];
  if (receipts) parts.push(`${receipts} ${plural(receipts, 'receipt', 'receipts')}`);
  if (labels) parts.push(`${labels} shipping ${plural(labels, 'label', 'labels')}`);
  const what = parts.join(' and ');

  let headline = 'Nothing to review';
  let detail = 'Receipts and labels the app finds will wait here until you have looked at them.';
  if (total) {
    headline = `${what} to review`;
    const bits = [];
    if (needsYou) bits.push(`${needsYou} ${plural(needsYou, 'needs', 'need')} something from you`);
    if (ready) bits.push(`${ready} ${plural(ready, 'is', 'are')} ready to file`);
    const rest = total - needsYou - ready;
    if (rest) bits.push(`${rest} ${plural(rest, 'needs', 'need')} a quick check`);
    detail = `${bits.join(', ')}.`;
  }
  return { total, receipts, labels, ready, needsYou, headline, detail };
}

/**
 * Whether the work a logged notification pointed at is still waiting.
 *
 * A notification is a message from a moment ago; the work behind it may have
 * been finished since, on this screen or another. The history uses this so a
 * finished task stops offering a button and says "Done" instead.
 * Returns null for a notification that is not about review work at all.
 */
export function reviewTaskStillOpen(kind, summary = {}) {
  const id = String(kind || '');
  if (id === 'receipt-sweep' || id === 'todo:orders-receipts') return (summary.receipts || 0) > 0;
  if (id.startsWith('postage-sweep-') || id === 'shippo-labels' || id === 'todo:orders-labels') return (summary.labels || 0) > 0;
  return null;
}
