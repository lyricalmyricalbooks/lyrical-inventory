// ── WHAT NEEDS THE PUBLISHER'S ATTENTION ───────────────────────────────────
//
// One engine, two screens. The notifications rail on the landing page shows the
// urgent slice of what this returns; the To-do tab shows all of it, grouped.
// They are deliberately not two separate scans: built twice they would drift,
// and a shop owner reading "2 things need you" beside a to-do list holding four
// would stop trusting either.
//
// Everything here is DERIVED. Nothing is stored, nothing is dismissed, nothing
// is marked read. A signal exists exactly as long as the thing it describes is
// true, so restocking a book is what clears its low-stock warning — there is no
// second state to get out of step with the first, and nothing new to sync. That
// is also why this can run on every render without touching Firestore.
//
// The module is pure and takes everything it needs as arguments. Conditions the
// app already computes elsewhere against live connections (sync health,
// integration health, the deployed Apps Script version, pending author
// submissions) are passed IN as plain data rather than recomputed here, so this
// file never reaches for a global and stays trivially testable.
//
// One rule worth stating because it is easy to get backwards: only flag a gap
// that is genuinely detectable. `listPrice` and `threshold` silently default to
// 40 and 10 when left blank, so a never-entered value is indistinguishable from
// a deliberate one — flagging those would nag about books that are perfectly
// fine, which is how a to-do list teaches people to ignore it.

import { deriveOnHand } from './inventory.js';
import { calcArtistEarnings } from './earnings.js';
import { expenseMissingReceipt } from './receipt-storage.js';
import { fmt, getBookCurrencyCode } from './money.js';

/** The four buckets the To-do tab groups by, in display order. */
export const SIGNAL_GROUPS = ['stock', 'money', 'catalogue', 'setup'];

export const GROUP_LABELS = {
  stock: 'Stock & reordering',
  money: 'Money to chase',
  catalogue: 'Missing book details',
  setup: 'Setup & connections',
};

export const GROUP_ICONS = {
  stock: '📚',
  money: '💰',
  catalogue: '✍',
  setup: '⚙️',
};

/** Severity, most urgent first. `info` is a to-do; the other two also notify. */
const STATUS_RANK = { blocked: 0, warn: 1, info: 2 };

/** A signal at `blocked` or `warn` is urgent enough for the notifications rail. */
export function isUrgent(signal) {
  return signal.status === 'blocked' || signal.status === 'warn';
}

const num = (v) => Number(v) || 0;
const intOf = (v) => parseInt(v, 10) || 0;
const isoToday = () => new Date().toISOString().slice(0, 10);

// ── Where a signal gets fixed ──────────────────────────────────────────────
//
// Expressed as DATA — `{kind, bookId, tab}` — never as a snippet of JavaScript.
//
// The first version of this built strings like `switchBook('hound')` and the
// renderer dropped them straight into an onclick. That is unsafe in a way that
// is easy to miss: escapeHtml() keeps a value from breaking out of the
// ATTRIBUTE, but the browser decodes those entities before the JS engine ever
// sees the code, so a book id containing a quote would break out of the JS
// STRING and run. Book ids are free text typed into the Add-book form, so that
// is reachable. Describing the destination instead means nothing a publisher
// types can ever become executable.

/** Open a book, optionally landing on one of its tabs. */
function openBook(bookId, tab) {
  return { kind: 'book', bookId, tab: tab || '' };
}

/** Open a top-level tab that isn't tied to a book. */
function openTab(tab) {
  return { kind: 'tab', tab };
}

// ── Producers ──────────────────────────────────────────────────────────────
// Each takes (book, state, ctx) and pushes zero or more signals. Split up so a
// new condition is a new function rather than another branch in a long one.

function stockSignals(book, s, out) {
  const onHand = intOf(s.stock);
  const threshold = intOf(book.threshold);
  const printed = intOf(book.maxPrint);

  if (threshold > 0 && onHand <= threshold) {
    out.push({
      id: `stock-low:${book.id}`,
      group: 'stock',
      status: 'blocked',
      icon: '⚠',
      label: 'Stock running low',
      detail: `${book.title} is down to ${onHand} ${onHand === 1 ? 'copy' : 'copies'}${printed ? ` of ${printed} printed` : ''} — at or below the level you set for reordering.`,
      bookId: book.id,
      fix: { label: 'Open book', ...openBook(book.id) },
    });
  } else if (threshold > 0 && onHand <= threshold * 2) {
    out.push({
      id: `stock-getting-low:${book.id}`,
      group: 'stock',
      status: 'warn',
      icon: '📉',
      label: 'Stock getting low',
      detail: `${book.title} has ${onHand} copies left. Worth thinking about the next print run.`,
      bookId: book.id,
      fix: { label: 'Open book', ...openBook(book.id) },
    });
  }

  // The same comparison the per-book dashboard drift banner makes: the stored
  // count against what the records themselves add up to.
  const derived = deriveOnHand(s, book);
  if (Number.isFinite(derived) && derived !== onHand) {
    out.push({
      id: `stock-drift:${book.id}`,
      group: 'stock',
      status: 'warn',
      icon: '🧮',
      label: "Stock count doesn't match the records",
      detail: `${book.title} is recorded as ${onHand} on hand, but its sales and shipments add up to ${derived}. One of them needs a look.`,
      bookId: book.id,
      fix: { label: 'Review', ...openBook(book.id) },
    });
  }
}

function moneySignals(book, s, out, ctx) {
  const cur = getBookCurrencyCode(book);

  // Stores holding stock that owe money. One signal per book rather than per
  // store: a publisher with eight partners does not want eight rows saying the
  // same thing, and amountOwed is already in the book's own currency so this
  // never adds two currencies together.
  let owed = 0;
  let owingStores = 0;
  for (const st of (s.stores || [])) {
    const due = num(st.amountOwed);
    if (due > 0) { owed += due; owingStores++; }
  }
  if (owed > 0) {
    out.push({
      id: `money-consignment:${book.id}`,
      group: 'money',
      status: 'warn',
      icon: '🏪',
      label: 'A store owes you money',
      detail: `${owingStores} ${owingStores === 1 ? 'store owes' : 'stores owe'} you ${fmt(owed, cur)} for copies of ${book.title} they've sold.`,
      bookId: book.id,
      fix: { label: 'Open consignment', ...openBook(book.id, 'consignment') },
    });
  }

  // Overdue and unsent invoices.
  const today = ctx.today;
  let overdue = 0;
  let drafts = 0;
  for (const inv of (s.invoices || [])) {
    if (!inv) continue;
    const status = inv.status || 'draft';
    if (status === 'sent' && inv.dueDate && inv.dueDate < today) overdue++;
    else if (status === 'draft') drafts++;
  }
  if (overdue > 0) {
    out.push({
      id: `money-invoice-overdue:${book.id}`,
      group: 'money',
      status: 'blocked',
      icon: '📄',
      label: 'Invoice past its due date',
      detail: `${overdue} ${overdue === 1 ? 'invoice' : 'invoices'} for ${book.title} ${overdue === 1 ? 'is' : 'are'} past the date you asked to be paid by.`,
      bookId: book.id,
      fix: { label: 'Open invoices', ...openBook(book.id, 'consignment') },
    });
  }
  if (drafts > 0) {
    out.push({
      id: `money-invoice-draft:${book.id}`,
      group: 'money',
      status: 'info',
      icon: '✉',
      label: 'Invoice never sent',
      detail: `${drafts} ${drafts === 1 ? 'invoice is' : 'invoices are'} still a draft for ${book.title} — nobody has been asked to pay ${drafts === 1 ? 'it' : 'them'} yet.`,
      bookId: book.id,
      fix: { label: 'Open invoices', ...openBook(book.id, 'consignment') },
    });
  }

  // Expenses the artist paid for and hasn't been paid back.
  let owedToArtist = 0;
  let owedCount = 0;
  for (const e of (s.expenses || [])) {
    if (!e || e.received || e.gratuity) continue;
    owedToArtist += Math.abs(num(e.amount));
    owedCount++;
  }
  if (owedCount > 0) {
    out.push({
      id: `money-expenses:${book.id}`,
      group: 'money',
      status: 'warn',
      icon: '🧾',
      label: 'Expenses waiting to be paid back',
      detail: `${owedCount} ${owedCount === 1 ? 'expense' : 'expenses'} on ${book.title} totalling ${fmt(owedToArtist, cur)} ${owedCount === 1 ? 'has' : 'have'} not been reimbursed.`,
      bookId: book.id,
      fix: { label: 'Open expenses', ...openBook(book.id, 'expenses') },
    });
  }

  // The artist has asked to be paid.
  const requests = (s.payoutRequests || []).filter(r => r && !r.settled);
  if (requests.length) {
    const latest = requests[requests.length - 1];
    out.push({
      id: `money-payout-request:${book.id}`,
      group: 'money',
      status: 'blocked',
      icon: '🙋',
      label: 'Artist has asked to be paid',
      detail: `${book.author || 'The artist'} requested ${fmt(num(latest.amount), latest.currency || cur)} for ${book.title}.`,
      bookId: book.id,
      fix: { label: 'Open book', ...openBook(book.id) },
    });
  }
}

function catalogueSignals(book, s, out) {
  if (num(book.productionCost) <= 0) {
    out.push({
      id: `catalogue-cost:${book.id}`,
      group: 'catalogue',
      status: 'warn',
      icon: '💷',
      label: 'Production cost not entered',
      detail: `${book.title} has no printing cost recorded, so the app can't work out when it has paid for itself or what the artist is owed.`,
      bookId: book.id,
      fix: { label: 'Add cost', ...openBook(book.id) },
    });
  }

  const isbn = String(book.isbn || '').trim();
  if (!isbn || isbn === '—') {
    out.push({
      id: `catalogue-isbn:${book.id}`,
      group: 'catalogue',
      status: 'info',
      icon: '🔖',
      label: 'No ISBN recorded',
      detail: `${book.title} has no ISBN saved. Shops and distributors usually ask for one.`,
      bookId: book.id,
      fix: { label: 'Open book', ...openBook(book.id) },
    });
  }

  if (!String(book.stripeLink || '').trim()) {
    out.push({
      id: `catalogue-paylink:${book.id}`,
      group: 'catalogue',
      status: 'info',
      icon: '💳',
      label: 'No payment link',
      detail: `${book.title} has no payment link, so it can't be sold by QR code at an event.`,
      bookId: book.id,
      fix: { label: 'Open book', ...openBook(book.id) },
    });
  }

  // calcArtistEarnings returns null exactly when no tiers are configured — the
  // canonical "the split was never set up" signal.
  if (calcArtistEarnings(book, s) === null) {
    out.push({
      id: `catalogue-split:${book.id}`,
      group: 'catalogue',
      status: 'info',
      icon: '🤝',
      label: "Artist's share not set up",
      detail: `Nobody has said how ${book.title}'s takings are split, so the app can't tell you what ${book.author || 'the artist'} has earned.`,
      bookId: book.id,
      fix: { label: 'Set it up', ...openBook(book.id) },
    });
  }

  let missing = 0;
  for (const e of (s.expenses || [])) {
    if (expenseMissingReceipt(e)) missing++;
  }
  if (missing > 0) {
    out.push({
      id: `catalogue-receipts:${book.id}`,
      group: 'catalogue',
      status: 'warn',
      icon: '📎',
      label: 'Expenses with no receipt',
      detail: `${missing} ${missing === 1 ? 'expense' : 'expenses'} on ${book.title} ${missing === 1 ? 'has' : 'have'} nothing attached to back ${missing === 1 ? 'it' : 'them'} up at tax time.`,
      bookId: book.id,
      fix: { label: 'Open expenses', ...openBook(book.id, 'expenses') },
    });
  }
}

/**
 * Conditions that belong to the shop rather than to any one book. These arrive
 * already computed — the live checks that produce them talk to Google, Stripe
 * and the sync queue, none of which belongs behind a pure function.
 */
function setupSignals(ctx, out) {
  const sheets = ctx.sheets || {};
  if (sheets.connected && sheets.deployedVersion && sheets.expectedVersion
      && sheets.deployedVersion !== sheets.expectedVersion) {
    out.push({
      id: 'setup-sheets-version',
      group: 'setup',
      status: 'blocked',
      icon: '⟲',
      label: 'Google Sheet script is out of date',
      detail: `Your spreadsheet is running an older copy of the connection script (${sheets.deployedVersion} instead of ${sheets.expectedVersion}). Sales may not reach it correctly until it's updated.`,
      fix: { label: 'Open settings', ...openTab('sheets') },
    });
  } else if (!sheets.connected) {
    out.push({
      id: 'setup-sheets-missing',
      group: 'setup',
      status: 'info',
      icon: '📊',
      label: 'Google Sheet not connected',
      detail: 'Connecting a spreadsheet gives you a running copy of every sale outside the app.',
      fix: { label: 'Connect', ...openTab('sheets') },
    });
  }

  const sync = ctx.sync || {};
  const queued = intOf(sync.pending);
  if (sync.failed) {
    out.push({
      id: 'setup-sync-failed',
      group: 'setup',
      status: 'blocked',
      icon: '⚠',
      label: "Changes haven't saved",
      detail: `${queued || 'Some'} ${queued === 1 ? 'change is' : 'changes are'} stuck and haven't reached the cloud. They're safe on this device in the meantime.`,
      fix: { label: 'Try again', kind: 'retry-sync' },
    });
  } else if (sync.online === false && queued > 0) {
    out.push({
      id: 'setup-sync-offline',
      group: 'setup',
      status: 'warn',
      icon: '📡',
      label: 'Working offline',
      detail: `${queued} ${queued === 1 ? 'change is' : 'changes are'} waiting to upload. They'll go up on their own once you're back online.`,
    });
  }

  for (const integration of (ctx.integrations || [])) {
    if (!integration || !integration.failing) continue;
    out.push({
      id: `setup-integration:${integration.id}`,
      group: 'setup',
      status: 'warn',
      icon: '🔌',
      label: `${integration.label || integration.id} isn't answering`,
      detail: integration.detail || `The app couldn't reach ${integration.label || integration.id} on its last try.`,
    });
  }

  for (const sub of (ctx.submissions || [])) {
    if (!sub) continue;
    const count = intOf(sub.sales) + intOf(sub.expenses);
    if (count <= 0) continue;
    out.push({
      id: `setup-submissions:${sub.bookId}`,
      group: 'setup',
      status: 'blocked',
      icon: '📥',
      label: 'Author submissions waiting for you',
      detail: `${count} ${count === 1 ? 'entry' : 'entries'} from ${sub.bookTitle || 'an author'} ${count === 1 ? 'is' : 'are'} waiting to be approved before ${count === 1 ? 'it counts' : 'they count'} towards your figures.`,
      bookId: sub.bookId,
      fix: { label: 'Review', ...openBook(sub.bookId, 'history') },
    });
  }

  for (const call of (ctx.openCall || [])) {
    if (!call) continue;
    const waiting = intOf(call.waiting);
    if (waiting <= 0) continue;
    out.push({
      id: `setup-opencall:${call.bookId}`,
      group: 'setup',
      status: 'warn',
      icon: '📣',
      label: 'Contributors waiting on their next step',
      detail: `${waiting} ${waiting === 1 ? 'contributor' : 'contributors'} on ${call.bookTitle || 'an open call'} ${waiting === 1 ? 'is' : 'are'} waiting for you to move ${waiting === 1 ? 'them' : 'them'} along.`,
      bookId: call.bookId,
      fix: { label: 'Review', ...openBook(call.bookId, 'opencall') },
    });
  }
}

/**
 * Everything that wants the publisher's attention right now.
 *
 * @param {Object} input
 * @param {Array}  input.books        books to scan — the caller filters out test books
 * @param {Object} input.states       bookId → state
 * @param {Object} [input.sheets]     `{connected, deployedVersion, expectedVersion}`
 * @param {Object} [input.sync]       `{online, pending, failed}`
 * @param {Array}  [input.integrations] `[{id, label, failing, detail}]`
 * @param {Array}  [input.submissions]  `[{bookId, bookTitle, sales, expenses}]`
 * @param {string} [input.today]      'YYYY-MM-DD', for invoice due dates
 * @returns {{signals: Array, total: number, urgent: number, byGroup: Object}}
 *          `signals` is sorted most urgent first. A shop with nothing to do
 *          gets an empty array — that is what makes the panels self-clearing.
 */
export function buildAttentionSignals(input = {}) {
  const ctx = {
    today: input.today || isoToday(),
    sheets: input.sheets,
    sync: input.sync,
    integrations: input.integrations,
    submissions: input.submissions,
    openCall: input.openCall,
  };
  const states = input.states || {};
  const signals = [];

  for (const book of (input.books || [])) {
    if (!book || !book.id) continue;
    const s = states[book.id] || {};
    stockSignals(book, s, signals);
    moneySignals(book, s, signals, ctx);
    catalogueSignals(book, s, signals);
  }
  setupSignals(ctx, signals);

  // Most urgent first; within a severity keep collection order, which groups a
  // book's own signals together rather than interleaving the whole catalogue.
  signals.sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]);

  const byGroup = {};
  for (const group of SIGNAL_GROUPS) byGroup[group] = [];
  for (const signal of signals) {
    if (byGroup[signal.group]) byGroup[signal.group].push(signal);
  }

  return {
    signals,
    byGroup,
    total: signals.length,
    urgent: signals.filter(isUrgent).length,
  };
}
