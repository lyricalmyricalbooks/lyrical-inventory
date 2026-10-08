// The "Settle up" panel: one screen for when the author owes the publisher
// (cut of copies they sold and kept the cash for, other debts) at the same
// time as the publisher owes the author (unpaid earnings).
//
// The sums are describeArtistSettlement's; this only lays them out as two
// facing columns with one total each, so the subtraction happens once, in the
// result bar, instead of a list that subtracts, subtotals and subtracts again.
// Pure — no DOM, no app state — so the wording in both voices is testable.
import { roundCents, fmt } from './money.js';
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
  };
}

// The figure for the headline card. Kept here so the card and the panel can
// never disagree about direction or wording.
export function settleUpHeadline(model, cur) {
  return {
    label: 'Net balance',
    value: fmt(model.amount, cur),
    sub: model.direction === 'settled' ? 'the two sides cancel out'
      : `${model.result.toLowerCase()} · after both sides are offset`,
  };
}

// Direction 1, "Receipt": the answer first, as one big figure, then the sum
// laid out like a till slip — the author's side added (+), your side taken
// away (−), a double rule, and the result (=). One primary action.
function slipLines(model, cur) {
  const line = (sign, r) => {
    const detail = r.detail
      ? `<small class="ps-slip-detail">${escapeHtml(r.detail.replace('{gross}', fmt(model.heldGross, cur)).replace('{share}', fmt(model.heldShare, cur)))}</small>`
      : '';
    return `<li class="ps-slip-line"><span class="ps-slip-label">${escapeHtml(r.label)}${detail}</span><span class="ps-slip-dots" aria-hidden="true"></span><span class="ps-slip-amt">${sign} ${fmt(r.amount, cur)}</span></li>`;
  };
  // The side that is paying sits first so the slip reads top-down to its result.
  const [first, second] = model.direction === 'to-artist' ? [model.right, model.left] : [model.left, model.right];
  return [...first.rows.map(r => line('+', r)), ...second.rows.map(r => line('−', r))].join('');
}

// opts: { bookId, cur, date, payLinkReady, canRecord, hasWork, reviewError, pendingSync, statement }
export function settleUpHtml(model, opts) {
  const { bookId, cur, date = '', payLinkReady = false, canRecord = false, hasWork = false, reviewError = false, pendingSync = 0, statement = '' } = opts;
  const id = escapeHtml(String(bookId));
  const tone = model.direction === 'settled' ? 'is-settled' : 'is-due';
  const [big, small] = model.direction === 'to-artist' ? [model.right.total, model.left.total] : [model.left.total, model.right.total];
  const equation = `${fmt(big, cur)} − ${fmt(small, cur)}${model.direction === 'settled' ? ` = ${fmt(0, cur)}` : ''}`;
  const syncNote = pendingSync > 0
    ? `<p class="ps-payout-preview is-warn">${pendingSync} change${pendingSync === 1 ? '' : 's'} on this device ${pendingSync === 1 ? "hasn't" : "haven't"} synced yet. Let them sync before agreeing the amount.</p>`
    : '<p class="ps-settle-note">Based on the records on this device. If another device has new sales or payments, let it sync first.</p>';
  const overpaidNote = model.overpaid && !model.author
    ? '<p class="ps-settle-note">This counts an earlier overpayment as money to recover. If you agreed to leave it as credit against future earnings, use the payout form instead.</p>'
    : '';
  const record = canRecord && hasWork && !reviewError;
  const stripeNote = payLinkReady && !model.author
    ? `<p class="ps-settle-note">Their app already shows a Stripe button for exactly ${fmt(model.amount, cur)}. If they pay with it, this records itself.</p>`
    : '';
  return `
  <div class="ps-settle ps-receipt" id="artist-settlement-${id}" role="region" aria-label="Settle up with the author">
    <div class="ps-settle-result ${tone}">
      <div class="ps-stat-label">${escapeHtml(model.result)}</div>
      <div class="ps-stat-val">${fmt(model.amount, cur)}</div>
      <div class="ps-stat-sub">${equation}</div>
      <p class="ps-receipt-kicker">${model.direction === 'settled' ? 'The two sides cancel out.' : 'One payment clears both sides.'}</p>
    </div>
    <ul class="ps-slip" aria-label="How the amount adds up">
      ${slipLines(model, cur)}
      <li class="ps-slip-line ps-slip-total"><span class="ps-slip-label">${escapeHtml(model.result)}</span><span class="ps-slip-dots" aria-hidden="true"></span><span class="ps-slip-amt">= ${fmt(model.amount, cur)}</span></li>
    </ul>
    ${syncNote}
    ${overpaidNote}
    ${stripeNote}
    ${reviewError && canRecord ? '<p class="ps-payout-preview is-warn">An earlier settlement needs review. Check the payment history below and undo the wrong one before recording another.</p>' : ''}
    <div class="ps-payout-actions ps-receipt-actions">
      ${record ? `<button type="button" class="btn gold sys-target" id="artist-settlement-record-button-${id}"
        aria-expanded="false" aria-controls="artist-settlement-form-${id}"
        onclick="toggleArtistSettlementForm('${id}')">${model.recordLabel}</button>` : ''}
      <button type="button" class="btn ${record ? 'tx' : ''} sys-target" onclick="shareArtistSettlement('${id}')">${model.author ? 'Copy statement' : 'Share statement'}</button>
    </div>
    <details class="ps-settle-preview">
      <summary>Preview the statement</summary>
      <label for="artist-settlement-text-${id}" class="sr-only">Statement for the author</label>
      <textarea id="artist-settlement-text-${id}" rows="11" readonly>${escapeHtml(statement)}</textarea>
    </details>
    ${record ? `<div id="artist-settlement-form-${id}" class="ps-payout-form ps-settle-form" hidden>
      <p class="ps-settle-note">Records the full ${fmt(model.amount, cur)} shown above and clears both sides. Only save once the payment has actually ${model.direction === 'to-publisher' ? 'arrived' : model.direction === 'to-artist' ? 'been sent' : 'been agreed'}.</p>
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
  const offset = Math.max(0, roundCents((b.royaltiesOwed || 0) - cashToArtist));
  const parts = [];
  if (b.heldShare > 0.005) parts.push(author ? `You kept ${money(b.heldShare)} of the sales money you collected` : `They kept ${money(b.heldShare)} of the sales money they collected`);
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
