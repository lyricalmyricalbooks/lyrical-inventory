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

function column(side, cur, model, cls) {
  const rows = side.rows.length ? side.rows.map(r => {
    const detail = r.detail
      ? `<span class="ps-settle-detail">${escapeHtml(r.detail.replace('{gross}', fmt(model.heldGross, cur)).replace('{share}', fmt(model.heldShare, cur)))}</span>`
      : '';
    return `<li class="ps-settle-line"><span class="ps-settle-line-label">${escapeHtml(r.label)}${detail}</span><span class="ps-settle-amt">${fmt(r.amount, cur)}</span></li>`;
  }).join('') : '<li class="ps-settle-line is-empty"><span class="ps-settle-line-label">Nothing</span><span class="ps-settle-amt">—</span></li>';
  return `<section class="ps-settle-col ${cls}" aria-label="${escapeHtml(side.title)}">
      <h4 class="ps-settle-col-title">${escapeHtml(side.title)}</h4>
      <ul class="ps-settle-lines">${rows}</ul>
      <div class="ps-settle-total"><span>Total</span><span class="ps-settle-amt">${fmt(side.total, cur)}</span></div>
    </section>`;
}

// opts: { bookId, cur, date, payLinkReady, canRecord, hasWork, reviewError, pendingSync, statement }
export function settleUpHtml(model, opts) {
  const { bookId, cur, date = '', payLinkReady = false, canRecord = false, hasWork = false, reviewError = false, pendingSync = 0, statement = '' } = opts;
  const id = escapeHtml(String(bookId));
  const tone = model.direction === 'settled' ? 'tone-green' : 'tone-gold';
  const equation = model.direction === 'settled'
    ? `${fmt(model.left.total, cur)} − ${fmt(model.right.total, cur)} = ${fmt(0, cur)}`
    : model.direction === 'to-publisher'
      ? `${fmt(model.left.total, cur)} − ${fmt(model.right.total, cur)}`
      : `${fmt(model.right.total, cur)} − ${fmt(model.left.total, cur)}`;
  const syncNote = pendingSync > 0
    ? `<p class="ps-payout-preview is-warn">${pendingSync} change${pendingSync === 1 ? '' : 's'} on this device ${pendingSync === 1 ? "hasn't" : "haven't"} synced yet. Let them sync before agreeing the amount.</p>`
    : '<p class="ps-settle-note">Based on the records on this device. If another device has new sales or payments, let it sync first.</p>';
  const overpaidNote = model.overpaid && !model.author
    ? '<p class="ps-settle-note">This counts an earlier overpayment as money to recover. If you agreed to leave it as credit against future earnings, use the payout form instead.</p>'
    : '';
  const record = canRecord && hasWork && !reviewError;
  const steps = `
    <ol class="ps-settle-steps">
      <li class="ps-settle-step">
        <span class="ps-settle-step-num" aria-hidden="true">1</span>
        <div class="ps-settle-step-body">
          <strong>${model.author ? 'Check the numbers' : 'Check the numbers above'}</strong>
          <span>${model.author ? 'This is what the publisher sees too.' : 'Each side is added up once; only the difference changes hands.'}</span>
        </div>
      </li>
      <li class="ps-settle-step">
        <span class="ps-settle-step-num" aria-hidden="true">2</span>
        <div class="ps-settle-step-body">
          <strong>${model.author ? 'Keep a copy' : 'Send the author the statement'}</strong>
          ${payLinkReady && !model.author ? `<span>Their app already shows a Stripe button for exactly ${fmt(model.amount, cur)}. If they pay with it, the settlement records itself.</span>` : ''}
          <div class="ps-payout-actions">
            <button type="button" class="btn sys-target" onclick="shareArtistSettlement('${id}')">${model.author ? 'Copy statement' : 'Share statement'}</button>
          </div>
          <details class="ps-settle-preview">
            <summary>Preview statement</summary>
            <label for="artist-settlement-text-${id}" class="sr-only">Statement for the author</label>
            <textarea id="artist-settlement-text-${id}" rows="11" readonly>${escapeHtml(statement)}</textarea>
          </details>
        </div>
      </li>
      ${record ? `<li class="ps-settle-step">
        <span class="ps-settle-step-num" aria-hidden="true">3</span>
        <div class="ps-settle-step-body">
          <strong>Record it once the money has moved</strong>
          <div class="ps-payout-actions">
            <button type="button" class="btn gold sys-target" id="artist-settlement-record-button-${id}"
              aria-expanded="false" aria-controls="artist-settlement-form-${id}"
              onclick="toggleArtistSettlementForm('${id}')">${model.recordLabel}</button>
          </div>
          <div id="artist-settlement-form-${id}" class="ps-payout-form ps-settle-form" hidden>
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
          </div>
        </div>
      </li>` : ''}
    </ol>`;
  return `
  <div class="ps-settle" id="artist-settlement-${id}" role="region" aria-label="Settle up with the author">
    <div class="ps-settle-head">
      <span class="sect sect-inline">Settle up</span>
      <span class="ps-settle-kicker">Money runs both ways — one payment clears it</span>
    </div>
    <div class="ps-settle-cols">
      ${column(model.left, cur, model, 'is-left')}
      ${column(model.right, cur, model, 'is-right')}
    </div>
    <div class="ps-stat-card ps-settle-result ${tone}">
      <div class="ps-stat-label">${escapeHtml(model.result)}</div>
      <div class="ps-stat-val">${fmt(model.amount, cur)}</div>
      <div class="ps-stat-sub">${equation}</div>
    </div>
    ${syncNote}
    ${overpaidNote}
    ${reviewError && canRecord ? '<p class="ps-payout-preview is-warn">An earlier settlement needs review. Check the payment history below and undo the wrong one before recording another.</p>' : ''}
    ${steps}
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
