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

/** True when this receipt can actually be opened by some route. */
export function receiptIsOpenable(receipt) {
  return receiptLinkTarget(receipt).kind !== 'none';
}
