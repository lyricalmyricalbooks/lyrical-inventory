// Which receipts the inbox sweep found are complete enough to file in one tap.
//
// The sweep already reads receipts on its own and leaves them in a review
// table, deliberately never filing anything by itself. That is the right
// default, but it made the easy ones as much work as the hard ones: a Canada
// Post receipt with a clear amount and an obvious category still needed the
// modal opened, the row found and Import pressed. This decides which ones are
// easy, so the alert can offer to file just those with one press — still her
// decision, just not a chore.
//
// Pure: no DOM, no ledger, no network.

/** How sure the reader has to be of what it read before a receipt counts as easy. */
export const READY_CONFIDENCE = 0.8;

/**
 * Whether one drafted receipt can be filed without anyone looking at it again.
 *
 * Every condition is a way a one-tap file would go wrong: no amount means an
 * expense of nothing, 'Other' means the category was not really chosen, a low
 * confidence means the reader was unsure what it saw, and a likely duplicate
 * would put the same cost in the books twice.
 */
export function isReadyToFile(draft = {}, { duplicate = false } = {}) {
  if (!draft || duplicate) return false;
  if (draft.amountUnknown || !(Number(draft.amount) > 0)) return false;
  const category = String(draft.category || '').trim();
  if (!category || category === 'Other') return false;
  if (!(Number(draft.confidence) >= READY_CONFIDENCE)) return false;
  return !!String(draft.date || '').trim();
}

function money(draft) {
  const amount = Number(draft.amount) || 0;
  return `${String(draft.currency || 'CAD').toUpperCase()} ${amount.toFixed(2)}`;
}

function receiptLabel(draft) {
  return `${draft.vendor || draft.description || 'Receipt'} ${money(draft)} → ${draft.category}`;
}

/**
 * What the alert says after a sweep, and whether it offers the one-tap file.
 * The two easy ones it names are the ones she would be agreeing to, so she can
 * see what she is filing before she presses the button.
 */
export function describeReceiptSweep({ found = [], ready = [] } = {}) {
  const n = found.length;
  const r = ready.length;
  if (!n) return { title: '', detail: '', canFile: false };
  const title = `${n} new receipt${n === 1 ? '' : 's'} found in your inbox`;
  if (!r) {
    const flagged = found.filter(d => d && d.amountUnknown).length;
    return {
      title,
      canFile: false,
      detail: flagged
        ? `Waiting for you to review — ${flagged} need${flagged === 1 ? 's' : ''} an amount.`
        : 'Waiting for you to review.',
    };
  }
  const named = ready.slice(0, 2).map(receiptLabel).join('; ');
  const moreReady = r - Math.min(r, 2);
  const rest = n - r;
  let detail = `Ready to file: ${named}${moreReady > 0 ? `, and ${moreReady} more` : ''}.`;
  if (rest) detail += ` ${rest} other${rest === 1 ? '' : 's'} need${rest === 1 ? 's' : ''} a look first.`;
  return { title, detail, canFile: true, fileLabel: `File ${r === 1 ? 'it' : `these ${r}`}` };
}
