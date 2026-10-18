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
import { frequencyLabel } from './recurring.js';
import { chargePeriodName } from './subscription-receipts.js';

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

export function doubleKey(expense) {
  return `double:${expense?.id ?? ''}`;
}

/**
 * What the review screen needs to know about a receipt that belongs to a
 * subscription charge (a match from lib/subscription-receipts.js), in words.
 * `null` when it doesn't belong to one.
 */
function subscriptionDetails(draft, result) {
  const m = result?.match;
  if (!m || m.paused) return null;
  const name = m.sub.desc || 'subscription';
  const chargeMoney = money(m.amount, m.currency);
  const receiptMoney = money(draft.amount, draft.currency);
  const amountMissing = !!draft.amountUnknown || !(Number(draft.amount) > 0);
  // A receipt from the right company for a different amount may be that charge
  // at another price — or a separate purchase (an Amazon order next to Prime).
  // Nothing is assumed: the owner says which, with no answer picked for them.
  const needsAnswer = !result.ambiguous && !m.covered && !m.amountMatches;
  // Using the receipt's own amount needs two amounts in one currency.
  const amountDiffers = needsAnswer && m.sameCurrency && !amountMissing;
  // A new price "from here on" only reads right from the newest charge.
  const canChangePrice = amountDiffers && (!m.posted || m.charge.monthKey >= (m.sub.lastInjected || ''));
  const answers = ['keep', ...(amountDiffers ? ['receipt'] : []), ...(canChangePrice ? ['price'] : [])];
  return {
    subId: m.subId,
    name,
    posted: m.posted,
    covered: m.covered,
    ambiguous: !!result.ambiguous,
    needsAnswer,
    answer: needsAnswer && answers.includes(draft.subscriptionAmount) ? draft.subscriptionAmount : '',
    amountDiffers,
    canChangePrice,
    period: chargePeriodName(m.charge.date),
    chargeDate: m.posted ? m.line.date : m.charge.date,
    dueDate: m.charge.date,
    chargeMoney,
    receiptMoney,
    amountMissing,
    sameCurrency: m.sameCurrency,
    currency: m.currency,
    cadence: frequencyLabel(m.sub.frequency),
    // Which subscription stays changeable while more than one fits, not only
    // until the first answer.
    choosable: result.candidates.length > 1,
    choices: result.candidates.map(c => ({
      subId: c.subId,
      label: `${c.sub.desc || 'Subscription'} · ${money(c.amount, c.currency)} ${c.posted ? 'on' : 'due'} ${c.posted ? c.line.date : c.charge.date}`,
    })),
  };
}

/** The reasons, steps and state for a receipt that belongs to a subscription charge. */
function subscriptionReceiptWords(draft, sub) {
  const reasons = [];
  const steps = [];
  const separate = 'If it really is a separate purchase, press “It’s a separate purchase” to file it on its own.';
  const attach = sub.posted
    ? 'Press “Attach as proof”. Nothing new goes into your books. The email is kept as proof for that charge.'
    : `Press “Attach as proof”. That charge goes into your books on its due date, ${sub.dueDate}, with the email as its proof, and the subscription will not add it again.`;
  if (sub.ambiguous) {
    const names = sub.choices.map(c => c.label.split(' · ')[0]);
    reasons.push(`It could be the charge of more than one of your subscriptions: ${names.join(' or ')}. Filing it on its own would count that cost twice.`);
    steps.push('Pick the subscription this receipt is for, under “Which subscription”.');
    steps.push('Then check the details and keep it as proof of that charge.');
    steps.push(separate);
    return { reasons, steps, state: REVIEW_STATE.needsYou };
  }
  if (sub.covered) {
    reasons.push(`${capitalize(sub.period)} of your ${sub.name} subscription (${sub.chargeMoney} on ${sub.chargeDate}) already has its receipt. This looks like a second copy.`);
    steps.push('Compare it with the receipt already kept on that charge.');
    steps.push('If it is the same one, press “Already in my books”. It leaves this list and nothing in your books changes.');
    steps.push(separate);
    return { reasons, steps, state: REVIEW_STATE.check };
  }
  if (sub.needsAnswer) {
    reasons.push(sub.posted
      ? `It looks like ${sub.period} of your ${sub.name} subscription (${sub.chargeMoney} on ${sub.chargeDate}), which is already counted in your books.`
      : `It looks like the bill for the next charge of your ${sub.name} subscription (${sub.chargeMoney}, due ${sub.dueDate}).`);
    if (sub.amountDiffers) reasons.push(`But the receipt says ${sub.receiptMoney}. It may be that charge at a different amount, or a separate purchase from the same company.`);
    else if (sub.amountMissing) reasons.push('But the amount could not be read from the email, so it cannot be checked against the charge.');
    else reasons.push(`But the receipt is in ${String(draft.currency || 'CAD').toUpperCase()} and the subscription is in ${sub.currency}, so the amounts cannot be compared.`);
    steps.push('Check the receipt against the charge.');
    steps.push('Choose what it is, under “What this receipt is”.');
    steps.push(attach);
    return { reasons, steps, state: sub.answer ? REVIEW_STATE.check : REVIEW_STATE.needsYou };
  }
  reasons.push(sub.posted
    ? `This is ${sub.period} of your ${sub.name} subscription (${sub.chargeMoney} on ${sub.chargeDate}). It is already counted in your books, so filing it again would count it twice.`
    : `This is the bill for the next charge of your ${sub.name} subscription (${sub.chargeMoney}, due ${sub.dueDate}). It has not been counted yet.`);
  steps.push('Check the vendor, date and amount against the receipt.');
  steps.push(attach);
  steps.push(separate);
  return { reasons, steps, state: REVIEW_STATE.ready };
}

function capitalize(text) {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

/**
 * One drafted receipt as a review item.
 *
 * The reasons are the ways filing it untouched could put something wrong in
 * the books — the same conditions isReadyToFile() uses, said in words.
 */
export function receiptReviewItem(draft = {}, { duplicate = false, index = 0, subscription = null, separateFrom = '' } = {}) {
  const sub = subscriptionDetails(draft, subscription);
  if (sub) return subscriptionReceiptItem(draft, sub, index);

  const reasons = [];
  const amountMissing = !!draft.amountUnknown || !(Number(draft.amount) > 0);
  const category = String(draft.category || '').trim();
  const paused = subscription?.match?.paused ? subscription.match.sub.desc : '';
  if (paused) reasons.push(`Your ${paused} subscription is paused, but this receipt says you were charged. Check that it was really cancelled. Filing this counts the charge on its own.`);
  if (separateFrom) reasons.push(`You said this is separate from your ${separateFrom} subscription, so filing it adds a new expense.`);
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
    subscription: null,
    separateFrom,
  };
}

/** A receipt that belongs to a subscription charge: kept as its proof, not filed beside it. */
function subscriptionReceiptItem(draft, sub, index) {
  const { reasons, steps, state } = subscriptionReceiptWords(draft, sub);
  const amountMissing = sub.amountMissing;
  const facts = [
    ['Vendor', draft.vendor || '—'],
    ['Date', draft.date || '—'],
    ['Amount', amountMissing ? 'Not read' : money(draft.amount, draft.currency)],
    ['Category', String(draft.category || '').trim() || '—'],
  ];
  if (!sub.ambiguous) {
    facts.push(['Subscription', `${sub.name} · ${sub.cadence}`]);
    facts.push(sub.posted ? ['In your books', `${sub.chargeMoney} on ${sub.chargeDate}`] : ['Next charge', `${sub.chargeMoney} due ${sub.dueDate} · not counted yet`]);
  }
  if (draft.emailFrom) facts.push(['From', draft.emailFrom]);
  if (draft.emailSubject) facts.push(['Email subject', draft.emailSubject]);
  return {
    key: receiptKey(draft, index),
    kind: 'receipt',
    state,
    icon: '🔁',
    title: draft.vendor || draft.description || 'Receipt',
    subtitle: `${amountMissing ? 'Amount not read' : money(draft.amount, draft.currency)} · ${sub.ambiguous ? 'which subscription?' : `${sub.name} subscription`}`,
    reasons,
    facts,
    steps,
    duplicate: false,
    index,
    subscription: sub,
    separateFrom: '',
  };
}

/**
 * An expense filed beside a subscription charge for the same payment
 * (a pair from findSubscriptionDoubles), as a review item.
 */
export function doubleReviewItem(pair = {}) {
  const { expense = {}, line = {}, sub = {} } = pair;
  const name = sub.desc || 'subscription';
  const amount = money(expense.origAmount ?? expense.amount, expense.origCurrency || expense.currency);
  const chargeMoney = money(line.amount, line.currency);
  const hasReceipt = !!((Array.isArray(expense.receiptFiles) && expense.receiptFiles.length) || expense.receipt);
  return {
    key: doubleKey(expense),
    kind: 'double',
    group: 'receipt',
    state: REVIEW_STATE.check,
    icon: '📑',
    title: expense.vendor || expense.desc || 'Expense',
    subtitle: `${amount} · counted twice?`,
    reasons: [
      `This expense (${amount} on ${expense.date || '—'}) looks like a second copy of ${chargePeriodName(line.date)} of your ${name} subscription (${chargeMoney} on ${line.date || '—'}). Right now your books count that cost twice.`,
    ],
    facts: [
      ['Expense', `${expense.desc || expense.vendor || 'Expense'} · ${amount} on ${expense.date || '—'}`],
      ['Its receipt', hasReceipt ? 'Kept on the expense' : 'None'],
      ['Subscription', `${name} · ${chargeMoney} on ${line.date || '—'}`],
    ],
    steps: [
      'Check that both are the same payment.',
      `Press “Merge them”. The extra expense is removed${hasReceipt ? ' and its receipt is kept on the subscription charge' : ''}, so the cost is counted once.`,
      'If they really are two different costs, press “They’re different”. Both stay, and this pair is not raised again.',
    ],
    expenseId: expense.id,
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
export function buildReviewQueue({
  receiptDrafts = [],
  isDuplicate = () => false,
  subscriptionMatch = () => null,
  labels = [],
  doubles = [],
} = {}) {
  const items = [];
  (Array.isArray(receiptDrafts) ? receiptDrafts : []).forEach((draft, index) => {
    if (!draft) return;
    const subscription = subscriptionMatch(draft);
    // A receipt the owner set apart from a subscription says which one, so the
    // choice can be seen and taken back.
    const separateFrom = draft.notSubscription ? (subscriptionMatch({ ...draft, notSubscription: false })?.match?.sub?.desc || '') : '';
    const keptWithCharge = !!subscription && !subscription.match?.paused;
    items.push(receiptReviewItem(draft, { duplicate: !keptWithCharge && !!isDuplicate(draft), index, subscription, separateFrom }));
  });
  (Array.isArray(doubles) ? doubles : []).forEach(pair => {
    if (pair?.expense) items.push(doubleReviewItem(pair));
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
  const doubles = list.filter(i => i.kind === 'double').length;
  const ready = list.filter(i => i.state === REVIEW_STATE.ready).length;
  const needsYou = list.filter(i => i.state === REVIEW_STATE.needsYou).length;
  const total = list.length;

  const parts = [];
  if (receipts) parts.push(`${receipts} ${plural(receipts, 'receipt', 'receipts')}`);
  if (doubles) parts.push(`${doubles} ${plural(doubles, 'cost', 'costs')} counted twice`);
  if (labels) parts.push(`${labels} shipping ${plural(labels, 'label', 'labels')}`);
  const what = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts.join('');

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
  return { total, receipts, labels, doubles, ready, needsYou, headline, detail };
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
