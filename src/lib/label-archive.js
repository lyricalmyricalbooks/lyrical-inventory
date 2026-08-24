// Keeping every label the publisher has bought, not just the last one.
//
// WHY THIS EXISTS
// A purchased label lives at a Canada Post artifact URL that needs credentials
// and a working connection to fetch. The app also holds the details of the last
// purchase so it can redraw that label as vector art with no network at all —
// but only the last one. Buy a second label and the first becomes unreachable
// the moment Canada Post is unreachable.
//
// That is the wrong way round for how the parcels actually get out. Labels are
// bought in a batch and printed in a batch, and a printer jam, a browser
// restart or a dropped connection between the two lands squarely in the gap.
// The postage is already paid; the label should not need the internet to come
// back.
//
// So each purchase is kept here — the shipment details, not the rendered file,
// because the details are what the vector generator needs and they are a
// fraction of the size of a PDF. Any past label can then be redrawn on demand
// while offline.
//
// Pure and storage-free so the retention rules can be tested directly; the
// localStorage read and write live in canadapost.js.

/**
 * How many purchases to keep.
 *
 * Sized for the real use: a publisher's mailing run is a handful of parcels,
 * and the reason to reach back is a reprint within a few days. Entries are
 * small — shipment details, not label files — so this is a comfortable cap
 * rather than a tight one.
 */
export const LABEL_ARCHIVE_LIMIT = 60;

/** Digits-only form used as the archive key. */
export function archiveKeyForPin(pin) {
  return String(pin || '').replace(/\D/g, '');
}

/**
 * Add a purchase, newest first, replacing any earlier entry for the same parcel.
 *
 * Re-buying after a failure produces a second record for one order; keying by
 * tracking PIN means the archive holds parcels rather than attempts. A context
 * with no usable PIN is not stored, since nothing could ever look it up again.
 */
export function addLabelToArchive(archive, context, limit = LABEL_ARCHIVE_LIMIT) {
  const list = Array.isArray(archive) ? archive : [];
  const key = archiveKeyForPin(context?.trackingPin);
  if (!key) return list.slice(0, limit);

  const entry = {
    ...context,
    archiveKey: key,
    archivedAt: context?.purchasedAt || new Date().toISOString(),
  };

  return [entry, ...list.filter(e => archiveKeyForPin(e?.trackingPin) !== key)].slice(0, limit);
}

/**
 * Find a stored purchase by tracking PIN, however it was punctuated.
 */
export function findArchivedLabel(archive, pin) {
  const key = archiveKeyForPin(pin);
  if (!key) return null;
  return (Array.isArray(archive) ? archive : []).find(e => archiveKeyForPin(e?.trackingPin) === key) || null;
}

/**
 * Drop anything that could not be redrawn, then apply the cap.
 *
 * An entry without a tracking PIN cannot be found again, and a simulated
 * shipment was never bought — keeping either would only offer the publisher a
 * label that means nothing.
 */
export function pruneLabelArchive(archive, limit = LABEL_ARCHIVE_LIMIT) {
  return (Array.isArray(archive) ? archive : [])
    .filter(e => e && archiveKeyForPin(e.trackingPin) && !e.isSimulated)
    .slice(0, limit);
}

/**
 * The archive as a list for display: newest first, with the fields a
 * "reprint a past label" picker needs.
 */
export function listArchivedLabels(archive) {
  return pruneLabelArchive(archive).map(e => ({
    pin: archiveKeyForPin(e.trackingPin),
    trackingPin: e.trackingPin,
    orderNum: e.orderNum || '',
    serviceName: e.serviceName || '',
    destinationName: e.destination?.name || '',
    destinationCountry: e.destination?.countryCode || '',
    declarationId: e.declarationId || '',
    purchasedAt: e.archivedAt || e.purchasedAt || '',
  }));
}
