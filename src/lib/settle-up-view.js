// The "Settle up" panel: one screen for when the author owes the publisher
// (cut of copies they sold and kept the cash for, other debts) at the same
// time as the publisher owes the author (unpaid earnings).
//
// The sums are describeArtistSettlement's; this only lays them out as one
// statement ledger: who owes whom in two groups with one subtotal each, the
// records behind each line with their own buttons, and the answer on top.
// Pure — no DOM, no app state — so the wording in both voices is testable.
import { roundCents, fmt, fmtD, transferAmount, transferQtyLabel } from './money.js';
import { escapeHtml } from './html.js';

// Does this account run toward the publisher at all? Only then is there
// anything to settle beyond an ordinary payout, which has its own form.
export function needsSettleUp(balance) {
  return !!balance && (balance.publisherHeld > 0.005 || balance.otherDebt > 0.005);
}

// `author` flips the voice: the same figures, read from the author's side.
export function settleUpModel(balance, { author = false } = {}) {
  const b = balance || {};
  const owesPub = [];
  if (b.publisherHeld > 0.005) owesPub.push({
    key: 'held',
    label: author ? "Publisher's cut of copies you sold" : 'Your cut of copies they sold',
    amount: b.publisherHeld,
    detail: author
      ? 'You collected {gross} and keep your {share} share'
      : 'They collected {gross} and keep their {share} share',
  });
  if (b.otherDebt > 0.005) owesPub.push({
    key: 'debt', label: author ? 'Other money you owe' : 'Other money they owe', amount: b.otherDebt,
  });
  if (b.overpaid > 0.005) owesPub.push({
    key: 'overpaid', label: 'Earlier overpayment', amount: b.overpaid,
  });
  const owesArtist = [];
  if (b.royaltiesOwed > 0.005) owesArtist.push({
    key: 'royalties', label: author ? 'Your unpaid earnings' : 'Their unpaid earnings', amount: b.royaltiesOwed,
  });
  // Receipts the author paid and is owed back: one line for the total, with
  // each receipt itemised under it so the figure can be checked by eye.
  const expenses = b.expenses || [];
  if (b.expensesOwed > 0.005) owesArtist.push({
    key: 'expenses',
    label: author ? 'Expenses you paid, owed back to you' : 'Expenses they paid, owed back',
    amount: b.expensesOwed,
    items: expenses.map(e => ({ id: e.id, label: [fmtD(e.date) === '—' ? '' : fmtD(e.date), e.desc || 'Expense'].filter(Boolean).join(' · '), amount: e.amount })),
  });
  const sum = rows => rows.reduce((t, r) => roundCents(t + r.amount), 0);
  const pubTotal = sum(owesPub), artistTotal = sum(owesArtist);
  const direction = b.direction || 'settled';
  const result = direction === 'to-publisher' ? (author ? 'You send the publisher' : 'Author sends you')
    : direction === 'to-artist' ? (author ? 'The publisher sends you' : 'You send the author')
    : 'Nothing to send';
  return {
    author, direction,
    amount: roundCents(b.amount || 0),
    heldGross: roundCents(b.heldGross || 0), heldShare: roundCents(b.heldShare || 0),
    left: { title: author ? 'You owe the publisher' : 'The author owes you', rows: owesPub, total: pubTotal },
    right: { title: author ? 'The publisher owes you' : 'You owe the author', rows: owesArtist, total: artistTotal },
    result,
    recordLabel: direction === 'to-publisher' ? 'Record payment received'
      : direction === 'to-artist' ? 'Record payment sent' : 'Record offset',
    overpaid: b.overpaid > 0.005,
    expensesOwed: roundCents(b.expensesOwed || 0),
    expensesLeftOut: b.expensesLeftOut || 0,
  };
}

// The figure for the headline card. Kept here so the card and the panel can
// never disagree about direction or wording.
export function settleUpHeadline(model, cur) {
  return {
    label: 'Net balance',
    value: fmt(model.amount, cur),
    sub: model.direction === 'settled' ? 'the two sides cancel out'
      : model.expensesOwed > 0.005 && model.direction === 'to-publisher'
        ? `${model.result.toLowerCase()} · after ${model.right.rows.some(r => r.key === 'royalties') ? 'earnings and ' : ''}${fmt(model.expensesOwed, cur)} of expenses come off`
      : model.expensesOwed > 0.005 ? `${model.result.toLowerCase()} · includes ${fmt(model.expensesOwed, cur)} of expenses owed back`
      : `${model.result.toLowerCase()} · after both sides are offset`,
  };
}

// The sale behind a held line ends in one of three ways, and the publisher
// says which. Shared by the ledger and the pending-transfers list so the two
// can never offer different choices.
export function settleByHandMenu(t, cur) {
  const amt = transferAmount(t);
  return `<details class="settle-chooser">
               <summary class="btn sm outline">Settle by hand <span aria-hidden="true">▾</span></summary>
               <div class="settle-menu" role="group" aria-label="How did this sale end?">
                 <p class="settle-q">How did this sale end?</p>
                 <button type="button" class="settle-opt" onclick="this.closest('details').open=false;markArtistTransferReceived(${t.id})">
                   <strong>They sent me the full ${escapeHtml(amt != null ? fmt(amt, cur) : 'amount')}</strong>
                   <span>All of it goes into your revenue. (Stripe payments do this for you automatically.)</span>
                 </button>
                 <button type="button" class="settle-opt" onclick="this.closest('details').open=false;settleArtistTransferKeepShare(${t.id})">
                   <strong>They kept their share and sent me my cut</strong>
                   <span>Their share counts as already paid to them. You'll see the exact split before confirming.</span>
                 </button>
                 <button type="button" class="settle-opt" onclick="this.closest('details').open=false;settleArtistTransferKeepAll(${t.id})">
                   <strong>They keep all of it</strong>
                   <span>You let them keep your cut too. The sale still counts, and the whole amount is recorded as paid to them.</span>
                 </button>
               </div>
             </details>`;
}

// The side that is paying sits first so the ledger reads top-down to its result.
function ledgerSides(model) {
  return model.direction === 'to-artist' ? [model.right, model.left] : [model.left, model.right];
}

// The sum under the big figure, one term per ledger line, so each number in
// the ledger can be found in it: "CA$555.48 − CA$312.55 − CA$28.17".
function ledgerEquation(model, cur) {
  const [first, second] = ledgerSides(model);
  const terms = [
    first.rows.map(r => fmt(r.amount, cur)).join(' + ') || fmt(0, cur),
    ...second.rows.map(r => fmt(r.amount, cur)),
  ];
  return `${terms.join(' − ')}${model.direction === 'settled' ? ` = ${fmt(0, cur)}` : ''}`;
}

const cell = (cls, html) => `<div class="ps-ledger-cell ${cls}" role="cell">${html}</div>`;
const statusHtml = (pill, tone, meta) =>
  `<span class="pill ${tone}">${pill}</span>${meta ? `<span class="ps-ledger-meta">${escapeHtml(meta)}</span>` : ''}`;

// The records behind one line: each held sale, each unpaid receipt. Every one
// says where it stands and, for the publisher, carries the button that
// settles it on its own.
// Every receipt gets its own row: on a profit-sharing book this is the only
// place its Mark received button lives.
function ledgerSubRows(r, model, cur, ctx) {
  const act = ctx.canAct;
  if (r.key === 'held') {
    return (ctx.transfers || []).map(t => {
      const amt = transferAmount(t);
      const meta = [t.num, fmtD(t.date) === '—' ? '' : fmtD(t.date), t.chan, transferQtyLabel(t)].filter(Boolean).join(' · ');
      return `<div class="ps-ledger-row is-sub" role="row">
        ${cell('is-what', `<span class="ps-ledger-meta">${amt == null ? 'Amount missing, check this sale' : `${escapeHtml(fmt(amt, cur))} held`}</span>`)}
        ${cell('is-status', statusHtml('⏳ Awaiting transfer', 'amber', meta))}
        ${cell('is-act', act ? settleByHandMenu(t, cur) : `<span class="ps-ledger-meta">${model.author ? 'In your one payment' : 'In the one payment'}</span>`)}
        ${cell('is-amt', '')}
      </div>`;
    }).join('');
  }
  if (r.key === 'expenses' && r.items?.length) {
    return r.items.map(i => `<div class="ps-ledger-row is-sub" role="row">
        ${cell('is-what', `<span class="ps-ledger-meta">${escapeHtml(i.label)}${r.items.length > 1 ? ` · ${escapeHtml(fmt(i.amount, cur))}` : ''}</span>`)}
        ${cell('is-status', statusHtml('⏳ Awaiting payment', 'amber', ''))}
        ${cell('is-act', act && i.id != null
          ? `<button type="button" class="btn sm gold" data-action="settleUp.markExpenseReceived" data-id="${escapeHtml(String(i.id))}" title="Only if you paid this one back on its own. It then comes out of the sum.">✓ Mark received</button>`
          : `<span class="ps-ledger-meta">${model.author ? 'Paid back with it' : 'Paid back in the one payment'}</span>`)}
        ${cell('is-amt', '')}
      </div>`).join('');
  }
  return '';
}

// Where a line stands when no record sits under it.
function lineStatus(r, model) {
  if (r.key === 'royalties') return statusHtml('Accrued', 'green', model.author ? 'Nothing for you to do' : 'Nothing to confirm');
  if (r.key === 'debt') return statusHtml('Recorded', 'gray', '');
  if (r.key === 'overpaid') return statusHtml('To recover', 'gray', '');
  return '';
}

function ledgerBody(model, cur, ctx) {
  const line = (sign, r) => {
    const detail = r.detail
      ? `<small class="ps-ledger-detail">${escapeHtml(r.detail.replace('{gross}', fmt(model.heldGross, cur)).replace('{share}', fmt(model.heldShare, cur)))}</small>`
      : '';
    const subs = ledgerSubRows(r, model, cur, ctx);
    return `<div class="ps-ledger-row" role="row">
        ${cell('is-what', `<span class="ps-ledger-label">${escapeHtml(r.label)}</span>${detail}`)}
        ${cell('is-status', subs ? '' : lineStatus(r, model))}
        ${cell('is-act', '')}
        ${cell('is-amt', `<span class="ps-ledger-amt">${sign} ${fmt(r.amount, cur)}</span>`)}
      </div>${subs}`;
  };
  const group = (side, sign) => side.rows.length ? `<div class="ps-ledger-group" role="row">
        <span role="cell">${escapeHtml(side.title)}</span><span role="cell" class="ps-ledger-sub-total">${fmt(side.total, cur)}</span>
      </div>${side.rows.map(r => line(sign, r)).join('')}` : '';
  const [first, second] = ledgerSides(model);
  return group(first, '+') + group(second, '−');
}

// The statement ledger: the answer first, as one big figure with the buttons
// that act on it; then every line with the same four columns — what it is,
// where it stands, what to do, the amount — grouped by who owes whom, each
// group with its subtotal, and the total at the foot.
// opts: { bookId, cur, date, payLinkReady, canRecord, hasWork, reviewError, pendingSync, statement, transfers }
export function settleUpHtml(model, opts) {
  const { bookId, cur, date = '', payLinkReady = false, canRecord = false, hasWork = false, reviewError = false, pendingSync = 0, statement = '', transfers = [] } = opts;
  const id = escapeHtml(String(bookId));
  const tone = model.direction === 'settled' ? 'is-settled' : 'is-due';
  const equation = ledgerEquation(model, cur);
  const syncNote = pendingSync > 0
    ? `<p class="ps-payout-preview is-warn">${pendingSync} change${pendingSync === 1 ? '' : 's'} on this device ${pendingSync === 1 ? "hasn't" : "haven't"} synced yet. Let them sync before agreeing the amount.</p>`
    : '<p class="ps-settle-note">Based on the records on this device. If another device has new sales or payments, let it sync first.</p>';
  const overpaidNote = model.overpaid && !model.author
    ? '<p class="ps-settle-note">This counts an earlier overpayment as money to recover. If you agreed to leave it as credit against future earnings, use the payout form instead.</p>'
    : '';
  const record = canRecord && hasWork && !reviewError;
  const leftOut = model.expensesLeftOut;
  const leftOutNote = leftOut > 0
    ? `<p class="ps-settle-note">${leftOut} unpaid expense${leftOut === 1 ? ' is' : 's are'} in another currency with no exchange rate to this book's, so ${leftOut === 1 ? "it isn't" : "they aren't"} in this sum. ${model.author ? 'Your publisher pays' : 'Pay'} ${leftOut === 1 ? 'it' : 'them'} back separately.</p>`
    : '';
  const stripeNote = payLinkReady && !model.author
    ? `<p class="ps-settle-note">Their app already shows a Stripe button for exactly ${fmt(model.amount, cur)}. If they pay with it, this records itself.</p>`
    : '';
  return `
  <div class="ps-settle ps-ledger-card" id="artist-settlement-${id}" role="region" aria-label="Settle up with the author">
    <div class="ps-settle-result ps-ledger-top ${tone}">
      <div class="ps-ledger-answer">
        <div class="ps-stat-label">${escapeHtml(model.result)}</div>
        <div class="ps-stat-val">${fmt(model.amount, cur)}</div>
        <div class="ps-stat-sub">${equation}</div>
        <p class="ps-receipt-kicker">${model.direction === 'settled' ? 'The two sides cancel out.' : 'One payment clears both sides.'}</p>
      </div>
      <div class="ps-payout-actions ps-receipt-actions">
        ${record ? `<button type="button" class="btn gold sys-target" id="artist-settlement-record-button-${id}"
          aria-expanded="false" aria-controls="artist-settlement-form-${id}"
          onclick="toggleArtistSettlementForm('${id}')">${model.recordLabel}</button>` : ''}
        <button type="button" class="btn ${record ? 'tx' : ''} sys-target" onclick="shareArtistSettlement('${id}')">${model.author ? 'Copy statement' : 'Share statement'}</button>
      </div>
    </div>
    ${record ? `<div id="artist-settlement-form-${id}" class="ps-payout-form ps-settle-form" hidden>
      <p class="ps-settle-note">Records the full ${fmt(model.amount, cur)} shown above and clears both sides${model.expensesOwed > 0.005 ? `, marking the ${fmt(model.expensesOwed, cur)} of expenses as paid back` : ''}. Only save once the payment has actually ${model.direction === 'to-publisher' ? 'arrived' : model.direction === 'to-artist' ? 'been sent' : 'been agreed'}.</p>
      <div class="ps-payout-fields">
        <div class="form-group"><label for="as-date-${id}">Payment date</label><input id="as-date-${id}" type="date" value="${escapeHtml(date)}"></div>
        <div class="form-group"><label for="as-method-${id}">Payment method (optional)</label><input id="as-method-${id}" placeholder="e-Transfer, cash…"></div>
        <div class="form-group"><label for="as-notes-${id}">Notes (optional)</label><input id="as-notes-${id}" placeholder="Payment reference or agreement"></div>
      </div>
      <div class="ps-payout-actions">
        <button type="button" class="btn gold" onclick="recordArtistSettlement('${id}')">Save settlement</button>
        <button type="button" class="btn tx" onclick="toggleArtistSettlementForm('${id}')">Cancel</button>
      </div>
    </div>` : ''}
    <div class="ps-ledger" role="table" aria-label="How the amount adds up">
      <div class="ps-ledger-head" role="row">
        <span role="columnheader">What</span><span role="columnheader">Where it stands</span><span role="columnheader">What to do</span><span role="columnheader">Amount</span>
      </div>
      ${ledgerBody(model, cur, { canAct: canRecord && !model.author, transfers })}
      <div class="ps-ledger-total" role="row">
        <span role="cell">${escapeHtml(model.result)}</span><span role="cell" class="ps-ledger-amt">= ${fmt(model.amount, cur)}</span>
      </div>
    </div>
    <div class="ps-ledger-foot">
      ${syncNote}
      ${overpaidNote}
      ${leftOutNote}
      ${stripeNote}
      ${reviewError && canRecord ? '<p class="ps-payout-preview is-warn">An earlier settlement needs review. Check the payment history below and undo the wrong one before recording another.</p>' : ''}
      <details class="ps-settle-preview">
        <summary>Preview the statement</summary>
        <label for="artist-settlement-text-${id}" class="sr-only">Statement for the author</label>
        <textarea id="artist-settlement-text-${id}" rows="11" readonly>${escapeHtml(statement)}</textarea>
      </details>
    </div>
    <div id="artist-settlement-feedback-${id}" class="ps-settle-note" role="status" aria-live="polite"></div>
  </div>`;
}

// How a recorded settlement paid the artist, for the payouts list. A
// settlement is a payout of earnings even when no cash went to the author:
// part of it is the share they kept from sales they collected, part came off
// what they owed. Its row shows that payout (the record's `amount`, the figure
// the list's total adds up), with the cash that actually moved as a detail —
// otherwise the rows and the total disagree.
//   balance : the settlement's stored balance; credit : the record's amount.
export function settlementPayoutSummary(balance, credit, money, { author = false } = {}) {
  const b = balance || {};
  const cashToArtist = b.direction === 'to-artist' ? roundCents(b.amount || 0) : 0;
  const expenses = roundCents(b.expensesOwed || 0);
  // Everything the publisher owed — earnings and expenses — that didn't go out
  // as cash was taken off what the author owed instead.
  const offset = Math.max(0, roundCents((b.royaltiesOwed || 0) + expenses - cashToArtist));
  const parts = [];
  if (b.heldShare > 0.005) parts.push(author ? `You kept ${money(b.heldShare)} of the sales money you collected` : `They kept ${money(b.heldShare)} of the sales money they collected`);
  if (expenses > 0.005) parts.push(author ? `${money(expenses)} of expenses you paid was paid back` : `${money(expenses)} of expenses they paid was paid back`);
  if (offset > 0.005) parts.push(author ? `${money(offset)} came off what you owed the publisher` : `${money(offset)} came off what they owed you`);
  if (cashToArtist > 0.005) parts.push(author ? `the publisher sent you ${money(cashToArtist)}` : `you sent them ${money(cashToArtist)}`);
  if (b.overpaid > 0.005) parts.push(`${money(b.overpaid)} of an earlier overpayment was recovered`);
  let detail = parts.length ? `${parts.join(', ')}.` : '';
  detail = detail.charAt(0).toUpperCase() + detail.slice(1);
  const cash = b.direction === 'to-publisher' ? (author ? `You sent the publisher ${money(b.amount)}.` : `They sent you ${money(b.amount)}.`)
    : b.direction === 'settled' ? 'No cash changed hands.' : '';
  const carried = b.royaltiesCarried > 0.005
    ? (author ? `${money(b.royaltiesCarried)} from newer sales is still owed to you.` : `${money(b.royaltiesCarried)} from newer sales is still owed to them.`)
    : '';
  return {
    title: credit < 0 ? 'Earlier overpayment recovered' : 'Earnings paid by settlement',
    amount: credit,
    detail: [detail, cash, carried].filter(Boolean).join(' '),
  };
}
