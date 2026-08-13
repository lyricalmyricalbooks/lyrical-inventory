// Receipt filenames and folders — what a receipt is called once it is filed.
//
// Receipts arrive named by whatever produced them: `IMG_4021.HEIC` from a phone,
// `image.jpg` from an email attachment, `1699887766_scan.pdf` from cloud
// storage. Filed under those names, a folder of receipts is unsearchable and an
// accountant asking for "the Staples receipt from May" has to open them one at a
// time.
//
// So a filed receipt is named from the expense it belongs to — date first, so
// the folder sorts chronologically on its own — and filed under the year and
// category an accountant actually asks in:
//
//   receipts/2026/Office Supplies/2026-05-10_Staples_CAD-24.99.jpg
//
// Everything here is pure string work, kept apart from the file writing so the
// naming rules can be tested without a directory handle. The names must survive
// Windows, macOS and Linux alike, so the reserved set is the union of all three
// plus the Windows device names, and lengths are bounded well under the 255-byte
// limit every common filesystem shares.

/** Longest a single path segment may be, leaving room for a `-2` suffix. */
export const MAX_SEGMENT_LENGTH = 120;

/** Windows refuses these as filenames whatever the extension. */
const RESERVED_DEVICE_NAMES = new Set([
  'con', 'prn', 'aux', 'nul',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
]);

/** Control characters, which are legal in neither a filename nor a label. */
const CONTROL_CHARS = new RegExp('[\\u0000-\\u001f\\u007f]', 'g');

/** Combining marks left behind by NFKD once the base letter is recovered. */
const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g');

/** Reserved on Windows, and `/` would silently create a folder level. */
const RESERVED_PUNCTUATION = /[/\\:*?"<>|]/g;

/**
 * Make one path segment safe on every desktop filesystem.
 *
 * Accented letters are folded rather than stripped, so "Café Bleu" files as
 * "Cafe-Bleu" instead of losing the word entirely.
 */
function cleanWords(input) {
  let s = String(input == null ? '' : input);

  // Fold accents to their base letters before anything is discarded.
  try { s = s.normalize('NFKD').replace(COMBINING_MARKS, ''); } catch (_) { /* older engines */ }

  return s
    .replace(CONTROL_CHARS, ' ')
    .replace(RESERVED_PUNCTUATION, ' ')
    .replace(/[^\w\s.\-()&+]/g, ' ')          // anything else exotic
    .replace(/\s+/g, ' ')
    .trim();
}

function finishSegment(s, maxLength, joiner) {
  let out = s
    .replace(/\s/g, joiner)
    .replace(/-{2,}/g, '-')
    .replace(/^[-.\s]+/, '')                  // no leading dot: that means hidden
    .replace(/[-.\s]+$/, '');                 // trailing dots break on Windows

  if (out.length > maxLength) {
    out = out.slice(0, maxLength).replace(/[-.\s]+$/, '');
  }

  if (RESERVED_DEVICE_NAMES.has(out.toLowerCase())) out = `${out}-file`;
  return out;
}

/**
 * Make one filename segment safe on every desktop filesystem.
 *
 * Accented letters are folded rather than stripped, so "Café Bleu" files as
 * "Cafe-Bleu" instead of losing the word entirely. Spaces become hyphens here
 * because filenames get pasted into scripts, URLs and mail attachments.
 */
export function safeSegment(input, maxLength = MAX_SEGMENT_LENGTH) {
  return finishSegment(cleanWords(input), maxLength, '-');
}

/**
 * Same cleaning for a folder name, but spaces are kept.
 *
 * A folder is something the owner opens in Finder or Explorer and reads, so
 * "Office Supplies" beats "Office-Supplies"; nothing pastes a folder name into a
 * script the way it does a filename.
 */
export function safeFolderSegment(input, maxLength = MAX_SEGMENT_LENGTH) {
  return finishSegment(cleanWords(input), maxLength, ' ');
}

/** File extension from a filename, falling back to the MIME type. */
export function extensionFor(originalName = '', mimeType = '') {
  const dot = String(originalName).lastIndexOf('.');
  if (dot > 0) {
    const ext = String(originalName).slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (ext && ext.length <= 5) return ext;
  }
  const mime = String(mimeType).toLowerCase();
  if (mime.includes('pdf')) return 'pdf';
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('heic')) return 'heic';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('gif')) return 'gif';
  return 'bin';
}

/** `YYYY-MM-DD` from whatever the expense carries, or today. */
export function datePart(date, now = new Date()) {
  const raw = String(date || '').trim();
  const iso = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const parsed = raw ? new Date(raw) : null;
  if (parsed && !isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return now.toISOString().slice(0, 10);
}

/** The year a receipt files under — the tax year, so the expense date wins. */
export function yearPart(date, now = new Date()) {
  return datePart(date, now).slice(0, 4);
}

/**
 * Strip the bookkeeping noise the app itself appended to a description.
 *
 * Recurring charges carry " (Recurring)" and foreign-currency expenses carry
 * " (Paid USD 24.99)" — useful in the ledger, pure clutter in a filename where
 * the amount already appears.
 */
export function cleanDescription(desc) {
  return String(desc || '')
    .replace(/\s*\(Recurring\)\s*/gi, ' ')
    .replace(/\s*\(Paid\s+[A-Z]{3}\s+[\d.,]+\)\s*/gi, ' ')
    .trim();
}

/** `CAD-24.99`, the amount as it belongs in a filename. */
export function amountPart(amount, currency) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n === 0) return '';
  const code = safeSegment(String(currency || '').toUpperCase(), 5) || 'NA';
  return `${code}-${Math.abs(n).toFixed(2)}`;
}

/**
 * The filename a receipt is filed under.
 *
 * Date first so a folder listing is chronological without sorting, then what it
 * was for, then what it cost. Any piece that is missing is simply left out
 * rather than filed as "unknown", and a receipt with no usable detail at all
 * falls back to its original name so it is never nameless.
 */
export function receiptFileName(meta = {}, now = new Date()) {
  const {
    date, desc, amount, currency,
    originalName = '', mimeType = '', index = 0,
  } = meta;

  const parts = [datePart(date, now)];

  const description = safeSegment(cleanDescription(desc), 60);
  if (description) parts.push(description);

  const money = amountPart(amount, currency);
  if (money) parts.push(money);

  // Nothing but a date to go on — keep the original name so the file stays
  // identifiable rather than becoming one of many "2026-05-10.jpg".
  if (parts.length === 1) {
    const original = safeSegment(String(originalName).replace(/\.[^.]+$/, ''), 60);
    if (original) parts.push(original);
  }

  // Second and later attachments on one expense need to differ from the first.
  if (index > 0) parts.push(String(index + 1));

  const stem = safeSegment(parts.join('_'), MAX_SEGMENT_LENGTH) || datePart(date, now);
  return `${stem}.${extensionFor(originalName, mimeType)}`;
}

/**
 * Folder segments a receipt files under, below `receipts/`.
 *
 * Year then category, because that is the order the questions come in: an
 * accountant asks for a tax year first and a category second. Book-specific
 * expenses keep the book as a third level so a title's costs stay collectable.
 */
export function receiptFolderPath(meta = {}, now = new Date()) {
  const segments = [yearPart(meta.date, now)];

  const category = safeFolderSegment(meta.cat, 40);
  segments.push(category || 'Uncategorised');

  const book = safeFolderSegment(meta.book, 40);
  if (book) segments.push(book);

  return segments;
}

/** Full folder-relative path for a filed receipt, as stored in `local://` refs. */
export function receiptRelativePath(meta = {}, now = new Date()) {
  return [...receiptFolderPath(meta, now), receiptFileName(meta, now)].join('/');
}

/**
 * Describe the destination in the words the owner would use, for confirmation
 * dialogs and toasts: "2026 › Office Supplies".
 */
export function describeDestination(meta = {}, now = new Date()) {
  return receiptFolderPath(meta, now).join(' › ');
}
