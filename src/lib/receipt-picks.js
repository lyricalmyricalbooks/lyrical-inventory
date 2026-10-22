// The receipts picked on the expense form before it is logged.
//
// A file input forgets its last pick every time it is opened again, so a second
// "browse" used to replace the first receipt instead of adding to it. The form
// keeps its own running list here and only mirrors it back into the input, so
// picking, dropping and removing files all edit the same list.

/** The most receipts one expense takes from the form in one go. */
export const MAX_RECEIPT_PICKS = 10;

/** Same name, size and timestamp: the same file picked twice. */
export function receiptPickKey(file) {
  if (!file) return '';
  return `${file.name || ''}|${file.size ?? ''}|${file.lastModified ?? ''}`;
}

/**
 * Add newly picked files to the running list, skipping repeats and anything
 * past the cap. Returns the new list plus how many were turned away, so the
 * form can say why a file did not appear.
 */
export function mergeReceiptPicks(existing, added, max = MAX_RECEIPT_PICKS) {
  const list = Array.from(existing || []).filter(Boolean);
  const seen = new Set(list.map(receiptPickKey));
  let duplicates = 0;
  let overLimit = 0;
  for (const file of Array.from(added || [])) {
    if (!file) continue;
    const key = receiptPickKey(file);
    if (seen.has(key)) { duplicates++; continue; }
    if (list.length >= max) { overLimit++; continue; }
    seen.add(key);
    list.push(file);
  }
  return { files: list, duplicates, overLimit };
}

/** The list without the file at `index`. */
export function removeReceiptPick(existing, index) {
  return Array.from(existing || []).filter((_, i) => i !== index);
}

/**
 * Link labels for an expense's receipts in the ledger: "View" for a lone one,
 * "View 1", "View 2"… once there are several, so each stays tellable apart.
 */
export function receiptLinkLabel(index, total, base = 'View') {
  return total > 1 ? `${base} ${index + 1}` : base;
}
