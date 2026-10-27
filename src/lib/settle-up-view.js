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

// The sale behind a held line ends in one of three ways, and the publisher
// says which. Shared by the ledger and the pending-transfers list so the two
// can never offer different choices.
export function settleByHandMenu(t, cur, { quiet = false } = {}) {
  const amt = transferAmount(t);
  return `<details class="settle-chooser">
               <summary class="${quiet ? 'ps-ledger-link' : 'btn sm outline'}">${quiet ? 'Settle' : 'Settle by hand'} <span aria-hidden="true">▾</span></summary>
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

// A quiet "Mark received" for one receipt the author paid. Only for the
// publisher: it takes that receipt out of the sum.
function markReceivedButton(item, ctx) {
  return ctx.canAct && item.id != null
    ? `<button type="button" class="btn sm outline ps-ledger-mark" data-action="settleUp.markExpenseReceived" data-id="${escapeHtml(String(item.id))}" title="Only if you paid this one back on its own. It then comes out of the sum.">✓ Mark received</button>`
    : '';
}

// The records behind one line — each held sale, each unpaid receipt — as a
// compact list: date, what, copies, amount, and for the publisher a quiet
// link that settles that one record on its own. Where they stand is said once
// on the line above, not repeated on every record. Folded behind a toggle so
// the statement stays short; a single receipt sits on its own line instead.
function ledgerItems(r, model, cur, ctx, listId) {
  let rows = [];
  if (r.key === 'held') {
    rows = (ctx.transfers || []).map(t => {
      const amt = transferAmount(t);
      return `<li class="ps-ledger-item">
        <span class="ps-ledger-when">${fmtD(t.date) === '—' ? '' : escapeHtml(fmtD(t.date))}</span>
        <span class="ps-ledger-what">${escapeHtml([t.num, t.chan].filter(Boolean).join(' · '))}</span>
        <span class="ps-ledger-qty">${escapeHtml(transferQtyLabel(t))}</span>
        <span class="ps-ledger-amt">${amt == null ? 'Amount missing, check this sale' : escapeHtml(fmt(amt, cur))}</span>
        <span class="ps-ledger-do">${ctx.canAct ? settleByHandMenu(t, cur, { quiet: true }) : ''}</span>
      </li>`;
    });
  } else if (r.key === 'expenses' && (r.items || []).length > 1) {
    rows = r.items.map(i => `<li class="ps-ledger-item">
        <span class="ps-ledger-when"></span>
        <span class="ps-ledger-what">${escapeHtml(i.label)}</span>
        <span class="ps-ledger-qty"></span>
        <span class="ps-ledger-amt">${escapeHtml(fmt(i.amount, cur))}</span>
        <span class="ps-ledger-do">${markReceivedButton(i, ctx)}</span>
      </li>`);
  }
  if (!rows.length) return '';
  const n = rows.length;
  const noun = r.key === 'held' ? (n === 1 ? 'sale' : 'sales') : 'receipts';
  return `<button type="button" class="ps-ledger-toggle" data-action="settleUp.toggleItems" aria-expanded="false" aria-controls="${listId}">Show the ${n === 1 ? '' : `${n} `}${noun} <span aria-hidden="true">▾</span></button>
      <ul class="ps-ledger-items" id="${listId}" hidden>${rows.join('')}</ul>`;
}

// Where a line stands, said once, as one pill.
function lineState(r, model, ctx) {
  const n = r.key === 'held' ? (ctx.transfers || []).length : r.key === 'expenses' ? (r.items || []).length : 0;
  const wait = (word, count) => `<span class="pill amber ps-ledger-wait">⏳ ${count > 1 ? `all ${count} ` : ''}${word}</span>`;
  if (r.key === 'held') return n ? wait('awaiting transfer', n) : '';
  if (r.key === 'expenses') return n ? wait('awaiting payment', n) : '';
  if (r.key === 'royalties') return model.author ? 'Accrued · nothing for you to do' : 'Accrued · nothing to confirm';
  return '';
}

function ledgerBody(model, cur, ctx) {
  let k = 0;
  const line = (sign, r) => {
    const detail = r.detail
      ? escapeHtml(r.detail.replace('{gross}', fmt(model.heldGross, cur)).replace('{share}', fmt(model.heldShare, cur)))
      : '';
    // One receipt reads as the line itself: its date and name under the
    // label, its button on the line, nothing left floating below.
    const single = r.key === 'expenses' && (r.items || []).length === 1 ? r.items[0] : null;
    const sub = [single ? escapeHtml(single.label) : detail, lineState(r, model, ctx)].filter(Boolean).join(' · ');
    const items = ledgerItems(r, model, cur, ctx, `artist-settlement-items-${ctx.id}-${k++}`);
    const act = single ? markReceivedButton(single, ctx) : '';
    return `<div class="ps-ledger-line">
        <span class="ps-ledger-sign" aria-hidden="true">${sign}</span>
        <div class="ps-ledger-text"><span class="ps-ledger-label">${escapeHtml(r.label)}</span>${sub ? `<small class="ps-ledger-detail">${sub}</small>` : ''}</div>
        <span class="ps-ledger-amt is-line">${fmt(r.amount, cur)}</span>
        ${act ? `<div class="ps-ledger-act">${act}</div>` : ''}
      </div>${items ? `<div class="ps-ledger-records">${items}</div>` : ''}`;
  };
  const group = (side, sign) => side.rows.length ? `<section class="ps-ledger-group" aria-label="${escapeHtml(side.title)}">
        <div class="ps-ledger-group-head"><span>${escapeHtml(side.title)}</span><span class="ps-ledger-sub-total">${fmt(side.total, cur)}</span></div>
        ${side.rows.map(r => line(sign, r)).join('')}
      </section>` : '';
  const [first, second] = ledgerSides(model);
  return group(first, '+') + group(second, '−');
}

// The statement ledger: the answer first, as one big figure with the one
// button that acts on it; then each line once — what it is, where it stands,
// the amount on the right — grouped by who owes whom with a subtotal each,
// the records behind a line listed compactly under it, and the total at the
// foot.
// opts: { bookId, cur, date, payLinkReady, canRecord, hasWork, reviewError, pendingSync, statement, transfers,
//         actions, notice, more }
// actions: extra buttons beside Record / Share (the author's Pay button, a
// payment-link ask); notice: one line under the figure; more: the folded
// extras at the foot of the card (how the artist is paid, past payments).
export function settleUpHtml(model, opts) {
  const { bookId, cur, date = '', payLinkReady = false, canRecord = false, hasWork = false, reviewError = false, pendingSync = 0, statement = '', transfers = [], actions = '', notice = '', more = '' } = opts;
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
        <div class="ps-stat-sub">${equation} · ${model.direction === 'settled' ? 'the two sides cancel out' : 'one payment clears both sides'}</div>
        ${notice ? `<p class="ps-ledger-notice">${notice}</p>` : ''}
      </div>
      <div class="ps-payout-actions ps-receipt-actions">
        ${record ? `<button type="button" class="btn gold sys-target" id="artist-settlement-record-button-${id}"
          aria-expanded="false" aria-controls="artist-settlement-form-${id}"
          onclick="toggleArtistSettlementForm('${id}')">${model.recordLabel}</button>` : ''}
        ${actions}
        <button type="button" class="btn ${record || actions ? 'tx' : ''} sys-target" onclick="shareArtistSettlement('${id}')">${model.author ? 'Copy statement' : 'Share statement'}</button>
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
    <div class="ps-ledger" aria-label="How the amount adds up">
      ${ledgerBody(model, cur, { canAct: canRecord && !model.author, transfers, id })}
    </div>
    <div class="ps-ledger-foot">
      ${syncNote}
      ${overpaidNote}
      ${leftOutNote}
      ${stripeNote}
      ${reviewError && canRecord ? '<p class="ps-payout-preview is-warn">An earlier settlement needs review. Check the payment history below and undo the wrong one before recording another.</p>' : ''}
      ${more}
      <details class="ps-settle-preview">
        <summary>Preview the statement <span aria-hidden="true">▾</span></summary>
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
