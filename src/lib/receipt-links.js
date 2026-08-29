// Opening a receipt that is already filed.
//
// A receipt reference is one of two quite different things wearing the same
// field. An `https://…` reference is a real URL a browser can follow. A
// `local://receipts/foo.pdf` reference is not a URL at all — it is a path into
// the folder the publisher connected, and only the app can resolve it. Putting
// one in an <a href> produces a link that looks perfectly normal and does
// absolutely nothing when clicked, which is exactly how the shipping ledger's
// reference link came to be dead for every counter receipt.
//
// This module is the single place that tells the two apart, so a caller cannot
// forget which kind it is holding.

const LOCAL_PREFIX = 'local://';

/**
 * Classify a stored receipt reference.
 *
 * `kind` is 'local' for a file in the connected folder (open it through
 * viewLocalReceipt, never an href), 'url' for something a browser can follow,
 * and 'none' when there is nothing attached.
 */
export function receiptLinkTarget(receipt) {
  const ref = String(receipt ?? '').trim();
  if (!ref) return { kind: 'none', path: '', href: '' };
  if (ref.startsWith(LOCAL_PREFIX)) {
    return { kind: 'local', path: ref.slice(LOCAL_PREFIX.length), href: '' };
  }
  // Anything that is not an http(s) or data reference cannot be followed
  // either — treat an unknown scheme as unopenable rather than rendering a
  // link that silently fails. `javascript:` is the reason this is a strict
  // allow-list and not a "not local, therefore fine" check.
  if (/^(https?:|data:|blob:)/i.test(ref)) return { kind: 'url', path: ref, href: ref };
  return { kind: 'none', path: ref, href: '' };
}

/**
 * A value safe to put in an href, or '' when it is not one.
 *
 * The same allow-list `receiptLinkTarget` applies, exposed on its own for the
 * other stored fields that reach an anchor — a tracking URL, an invoice
 * payment link. Two failure modes it closes, both seen in this codebase:
 *
 *  - A value with no scheme at all. An Interac e-Transfer address is an email,
 *    not a URL, and `href="pay@example.com"` is a RELATIVE link: clicking it
 *    navigates the page to a path that does not exist. On a customer's invoice
 *    that is the Pay button going nowhere.
 *  - A `javascript:` value. Any stored field that becomes an href is a place
 *    someone's typed text gets executed, so the check is an allow-list rather
 *    than a "not local, therefore fine" test.
 */
export function followableUrl(value) {
  const ref = String(value ?? '').trim();
  if (!ref) return '';
  return /^(https?:|mailto:|data:|blob:)/i.test(ref) ? ref : '';
}

/** True when this receipt can actually be opened by some route. */
export function receiptIsOpenable(receipt) {
  return receiptLinkTarget(receipt).kind !== 'none';
}
