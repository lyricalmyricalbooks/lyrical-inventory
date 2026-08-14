// Receipt storage references — where a receipt's bytes actually live, and how
// to reason about the ones that aren't home yet.
//
// A receipt reference is a string stored on an expense. Two shapes matter:
//
//   local://Book_Title/2026-08-12_receipt.jpg   a file in the connected folder
//   https://…firebasestorage…/…                 a blob in cloud storage
//
// The connected folder is the destination; the cloud is a waiting room. The app
// writes a receipt straight to the folder whenever it can reach one, and falls
// back to the cloud when it can't — no folder picked yet, permission lapsed
// after a browser restart, or a device that simply isn't the publisher's
// machine. Nothing is dropped either way: reclaimCloudReceipts() in main.js
// walks the cloud-held ones back down to the folder once it is reachable, and
// deletes each cloud copy only after its local write has succeeded.
//
// Expenses carry receipts in two historical shapes — a single `receipt` string
// and a `receiptFiles` array — so everything here reads both and writes both.
// Callers never have to know which vintage an expense is.

// NOTE ON THE MODEL CHANGE
// This module used to treat cloud storage as a waiting room that had to be
// drained into the local folder, and counted anything sitting there as a
// "backlog" worth nagging about after two weeks. That was backwards, and the
// nagging was the visible symptom: a receipt held safely in the cloud is not a
// problem to be fixed, and the banner reported the normal, healthy state as a
// 95-day failure.
//
// The cloud is now the permanent home. The local folder is an export target the
// owner fills on demand. So what matters is no longer "how long has this waited"
// but "is every receipt actually reachable" — which is what summarizeReceiptStorage
// reports. The old CLOUD_RECEIPT_REMINDER_DAYS threshold is gone with the model
// that needed it.

// WHY THERE ARE TWO KINDS OF WEB LINK
// Treating every https:// reference as "a receipt sitting in our cloud, waiting
// to be moved" was wrong, and it produced a very confusing failure: 40 Shippo
// shipping labels were counted as a backlog, and every attempt to move them
// failed with `TypeError: Failed to fetch`.
//
// They were never in our storage. They are links to files on Shippo's servers,
// and a browser is not permitted to read another site's files directly — it can
// open them in a tab, but it cannot download the bytes. So no amount of retrying
// could ever have worked, and counting them as a backlog meant the app nagged
// about something it was incapable of doing.
//
// So: a receipt we hold in our own cloud storage can be downloaded, moved and
// deleted. An external link is somebody else's file — viewable, never movable.

/** A file in our own cloud storage: downloadable, movable, ours to delete. */
export function isOurCloudReceipt(ref) {
  return typeof ref === 'string' && /^https?:\/\//i.test(ref) && /firebasestorage/i.test(ref);
}

/**
 * Somebody else's file, linked rather than held — a Shippo label, a vendor's
 * invoice page. Openable in a tab; never downloadable by the browser.
 */
export function isExternalLink(ref) {
  return typeof ref === 'string' && /^https?:\/\//i.test(ref) && !/firebasestorage/i.test(ref);
}

/**
 * Any web link, ours or not.
 *
 * Kept for the places that only need "is this a file on disk or not", but
 * anything that intends to *download* must use isOurCloudReceipt instead.
 */
export function isCloudReceipt(ref) {
  return typeof ref === 'string' && /^https?:\/\//i.test(ref);
}

/** A receipt already filed in the connected folder. */
export function isLocalReceipt(ref) {
  return typeof ref === 'string' && ref.startsWith('local://');
}

/**
 * Every receipt reference on an expense, newest shape first.
 *
 * Mirrors how the ledger's receipt cell picks: a non-empty `receiptFiles` wins
 * outright, otherwise the legacy single `receipt`. Reading them in a different
 * order here would let this module act on a file the owner cannot see.
 */
export function receiptRefsOf(item) {
  if (!item) return [];
  const files = Array.isArray(item.receiptFiles)
    ? item.receiptFiles.filter(r => typeof r === 'string' && r)
    : [];
  if (files.length) return files;
  return (typeof item.receipt === 'string' && item.receipt) ? [item.receipt] : [];
}

/**
 * Write a new reference list back onto an expense, keeping both shapes in step.
 *
 * `receipt` stays the first entry because older screens and the CSV exports
 * still read that field alone; letting the two diverge is how a receipt becomes
 * invisible on one screen and present on another.
 */
export function writeReceiptRefs(item, refs) {
  const clean = (refs || []).filter(r => typeof r === 'string' && r);
  item.receiptFiles = clean;
  item.receipt = clean[0] || '';
  return item;
}

/**
 * The references this app can actually download and move — ours alone.
 *
 * Deliberately excludes external links. The reclaim walks this list, and
 * including a Shippo label here is what made 40 receipts fail identically and
 * for ever.
 */
export function cloudReceiptRefs(item) {
  return receiptRefsOf(item).filter(isOurCloudReceipt);
}

/** Links to files held elsewhere — viewable, not movable. */
export function externalLinkRefs(item) {
  return receiptRefsOf(item).filter(isExternalLink);
}

/** True when any of this expense's receipts is held in our cloud storage. */
export function hasCloudReceipt(item) {
  return receiptRefsOf(item).some(isOurCloudReceipt);
}

/**
 * An expense whose only proof is a link to somebody else's file.
 *
 * Worth surfacing on its own: a Shippo *label* proves a parcel was sent, not
 * that it was paid for, so these are the expenses most likely to be questioned
 * and the ones the Shippo invoice import exists to fix.
 */
export function hasOnlyExternalLinks(item) {
  const refs = receiptRefsOf(item);
  return refs.length > 0 && refs.every(isExternalLink);
}

/**
 * Force the `local://` prefix onto a folder-relative path.
 *
 * The ledger decides local-versus-web purely on this prefix, so a bare path
 * renders as a broken web link that opens nothing — the receipt is on disk the
 * whole time and the owner cannot get at it. Everything that produces a local
 * reference goes through here so that can't happen again.
 */
export function toLocalRef(pathOrRef) {
  if (!pathOrRef) return '';
  const s = String(pathOrRef);
  return s.startsWith('local://') ? s : `local://${s.replace(/^\/+/, '')}`;
}

/** Strip the prefix back off, for the file-resolving helpers that want a path. */
export function localRefPath(ref) {
  return isLocalReceipt(ref) ? ref.slice('local://'.length) : String(ref || '');
}

/**
 * When this expense's cloud wait started.
 *
 * `receiptCloudAt` is stamped at the moment of the fallback. Expenses that fell
 * back before that field existed have no stamp, so the expense date stands in —
 * it is never later than the upload and so never overstates how long something
 * has waited.
 */
export function cloudPendingSince(item) {
  if (!item || !hasCloudReceipt(item)) return null;
  const raw = item.receiptCloudAt || item.date || '';
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

/** Whole days this expense's receipt has been waiting in the cloud. */
export function daysWaiting(item, now = new Date()) {
  const since = cloudPendingSince(item);
  if (!since) return 0;
  return Math.max(0, Math.floor((now.getTime() - since.getTime()) / 86400000));
}

/**
 * Every expense that can own a receipt, paired with the subfolder its files
 * belong in: the Tax Centre's own business expenses, then each loaded book's.
 *
 * Pure and shared on purpose — the reclaim walks this to decide what to move,
 * and the Tax Centre summarises the same list to decide what to say is waiting.
 * When those two disagreed, the screen advertised a backlog the button then
 * refused to touch.
 *
 * Books whose load failed are skipped: their `expenses` is the empty default
 * standing in for data nobody has seen, not the book.
 */
export function receiptOwners(taxExpenses, bookStates, books) {
  const owners = [];

  (taxExpenses || []).forEach(exp => {
    if (exp) owners.push({ exp, subfolder: 'General', scope: 'tax' });
  });

  Object.keys(bookStates || {}).forEach(bid => {
    const state = bookStates[bid];
    if (!state || state._loadFailed || !Array.isArray(state.expenses)) return;
    const subfolder = (books && books[bid] && books[bid].title) || bid;
    state.expenses.forEach(exp => {
      if (exp) owners.push({ exp, subfolder, scope: 'book', bid });
    });
  });

  return owners;
}

/**
 * Whether this expense is a rent or lease payment that does not require
 * digital store receipts (governed instead by a lease agreement & bank records).
 */
export function isRentExpense(item) {
  if (!item || typeof item !== 'object') return false;
  if (item.isRent || item.receiptExempt) return true;
  const desc = String(item.desc || '').toLowerCase();
  const cat = String(item.cat || '').toLowerCase();
  const ref = String(item.ref || '').toLowerCase();

  if (cat === 'rent' || cat === 'studio rent' || cat === 'office rent' || cat === 'workspace rent') {
    return true;
  }

  const rentPattern = /\b(rent|rents|rental|lease|leases|leasing|tenancy|landlord)\b/i;
  return rentPattern.test(desc) || rentPattern.test(ref) || rentPattern.test(cat);
}

/**
 * Where the receipts actually are, as a neutral readout.
 *
 * Reports counts, not a verdict: receipts held in the cloud are safe, and
 * receipts filed locally are safe. The only genuinely bad state — an expense
 * with no receipt reference at all (excluding rent/lease payments) — is counted
 * separately, because that is the one an accountant will ask about.
 */
export function summarizeReceiptStorage(items) {
  let cloudExpenses = 0;
  let cloudFiles = 0;
  let localFiles = 0;
  let linkedFiles = 0;
  let linkOnlyExpenses = 0;
  let withReceipts = 0;
  let withoutReceipts = 0;
  let rentExpenses = 0;

  (items || []).forEach(item => {
    const refs = receiptRefsOf(item);
    if (!refs.length) {
      if (isRentExpense(item)) {
        rentExpenses++;
        return;
      }
      withoutReceipts++;
      return;
    }
    withReceipts++;
    const cloud = refs.filter(isOurCloudReceipt);
    if (cloud.length) cloudExpenses++;
    cloudFiles += cloud.length;
    localFiles += refs.filter(isLocalReceipt).length;
    linkedFiles += refs.filter(isExternalLink).length;
    if (hasOnlyExternalLinks(item)) linkOnlyExpenses++;
  });

  return {
    cloudExpenses, cloudFiles, localFiles, linkedFiles, linkOnlyExpenses,
    withReceipts, withoutReceipts, rentExpenses,
    // Files we actually hold. A link is not a file we have.
    totalFiles: cloudFiles + localFiles,
  };
}

/**
 * A filename that won't clobber something already in the folder.
 *
 * Local receipts are named `<date>_<original name>`, so two receipts saved on
 * the same day from files both called `receipt.jpg` collide — and a colliding
 * write truncates the first one. That is silent loss of a tax record, and it
 * gets far more likely during a reclaim, which writes a whole backlog at once.
 *
 * `exists` is injected so this stays testable without a real directory handle.
 */
export async function uniqueFileName(filename, exists) {
  const dot = filename.lastIndexOf('.');
  const stem = dot > 0 ? filename.slice(0, dot) : filename;
  const ext = dot > 0 ? filename.slice(dot) : '';

  if (!(await exists(filename))) return filename;
  for (let i = 2; i < 500; i++) {
    const candidate = `${stem}-${i}${ext}`;
    if (!(await exists(candidate))) return candidate;
  }
  return `${stem}-${Date.now()}${ext}`;
}
