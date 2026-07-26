// Browser file downloads.
//
// Handing the user a file takes six fiddly steps, and this app did them by hand
// in fifteen places. They had drifted apart: five never called
// revokeObjectURL at all and leaked the blob for the life of the tab (the
// inventory valuation and shipping ledger exports hold the whole file in
// memory), three revoked synchronously on the line after click(), and four
// skipped appending the anchor to the document, which older Firefox required
// before a click would register.

// Long enough that the browser has certainly started reading the blob, short
// enough that a few exports in a session don't accumulate. The synchronous
// revoke some callers used raced the download in Safari and Firefox; the value
// here is the longest any of the old copies waited.
const REVOKE_DELAY_MS = 1000;

/**
 * Save a Blob to the user's downloads as `filename`.
 * Always revokes the object URL, and always via the DOM so the click lands.
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  // Must be in the document for the click to dispatch in Firefox.
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}

/** Save a string as a text file of the given MIME type. */
export function downloadText(text, filename, mime = 'text/plain;charset=utf-8;') {
  downloadBlob(new Blob([text], { type: mime }), filename);
}

/**
 * Save an already-assembled CSV document.
 *
 * Takes the finished string rather than rows because several exports build
 * theirs incrementally with title lines, blank separator rows and a totals
 * footer — shapes that aren't a rectangular row array. Use toCsv() from csv.js
 * for the ones that are.
 */
export function downloadCsv(csv, filename) {
  downloadText(csv, filename, 'text/csv;charset=utf-8;');
}
