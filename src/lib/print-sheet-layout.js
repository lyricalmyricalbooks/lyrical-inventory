// Page-space maths for the two fair printouts (tally sheet + payment QR sheet).
// The font tiers in main.js pick the typography; these helpers size the parts
// that should actually grow or shrink with the number of books — tally rows and
// QR codes — from the space a printed page really has, so three books fill the
// page and forty books stay legible instead of a fixed size that's either lost
// in white space or runs off the sheet.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Letter landscape, 0.4in margins, at 96 CSS px per inch.
export const TALLY_PAGE_HEIGHT_PX = Math.round((8.5 - 0.8) * 96);
// Title, event/date line and grand-total box, plus a little slack for rounding.
const TALLY_CHROME_PX = 150;
const TALLY_MIN_ROW_PX = 30;
const TALLY_MAX_ROW_PX = 220;
const TALLY_MIN_PRICE_PX = 20;

/**
 * Row heights for the tally sheet. Rows share the page height evenly; once a
 * row would drop below a writable height the sheet flows onto more pages
 * rather than cramping every row.
 */
export function computeTallyRowHeights(numBooks, { includeNotes = false, thHeight = 32 } = {}) {
  const books = Math.max(1, numBooks | 0);
  const avail = TALLY_PAGE_HEIGHT_PX - TALLY_CHROME_PX - thHeight;
  const perBook = avail / books;
  if (!includeNotes) {
    const tally = Math.floor(clamp(perBook, TALLY_MIN_ROW_PX, TALLY_MAX_ROW_PX));
    return { tallyRowHeight: tally, priceRowHeight: 0, fitsOnePage: perBook >= TALLY_MIN_ROW_PX };
  }
  const tally = Math.floor(clamp(perBook * 0.65, TALLY_MIN_ROW_PX, TALLY_MAX_ROW_PX * 0.65));
  const price = Math.floor(clamp(perBook * 0.35, TALLY_MIN_PRICE_PX, 70));
  return {
    tallyRowHeight: tally,
    priceRowHeight: price,
    fitsOnePage: perBook >= TALLY_MIN_ROW_PX + TALLY_MIN_PRICE_PX,
  };
}

// Letter portrait at 96 CSS px per inch, minus the print margin.
const QR_PAGE_WIDTH_PX = 8.5 * 96;
const QR_PAGE_HEIGHT_PX = 11 * 96;
const QR_FOOTER_PX = 44;
const QR_MIN_FRAME_PX = 72;
const QR_MAX_FRAME_PX = 300;

/**
 * QR frame size for the payment sheet. Each card gets an equal share of the
 * page; the code takes whatever the card has left after its title, author,
 * price table and link. With "fit on one page" every row shares one page,
 * otherwise rows stop shrinking at a scannable size and continue overleaf.
 */
export function computeQrCardSize({
  count, cols, fitOnePage = false, marginIn = 0.25, headerPx = 90, priceRows = 0, hasAuthor = true,
}) {
  const n = Math.max(1, count | 0);
  const c = clamp(cols | 0 || 1, 1, n);
  const rows = Math.ceil(n / c);
  const margin = marginIn * 2 * 96;
  const gridW = QR_PAGE_WIDTH_PX - margin;
  const gridH = QR_PAGE_HEIGHT_PX - margin - headerPx - QR_FOOTER_PX;

  // Text under the code: number, title, author, prices and link, plus padding.
  // Scales down a touch on dense sheets where the fonts are smaller too.
  const density = rows >= 4 ? 0.7 : rows === 3 ? 0.8 : 1;
  const textPx = Math.round((70 + (hasAuthor ? 16 : 0) + (priceRows ? 16 + priceRows * 18 : 0)) * density);
  const padPx = Math.round(36 * density);

  const fitFrame = (r) => Math.min(gridW / c - padPx, gridH / r - textPx - padPx);
  let frame = fitFrame(rows);
  let rowsPerPage = rows;
  if (!fitOnePage && frame < QR_MIN_FRAME_PX) {
    // Find how many rows fit at the smallest scannable size, then spread those.
    rowsPerPage = Math.max(1, Math.floor(gridH / (QR_MIN_FRAME_PX + textPx + padPx)));
    frame = fitFrame(rowsPerPage);
  }
  const lo = fitOnePage ? 48 : QR_MIN_FRAME_PX;
  const frameSize = Math.floor(clamp(frame, lo, QR_MAX_FRAME_PX));
  return { frameSize, renderSize: frameSize - 16, rows, rowsPerPage, cols: c };
}

/** How many printed pages the tally sheet will take for this many books. */
export function estimateTallyPages(numBooks, { includeNotes = false, thHeight = 32 } = {}) {
  const books = Math.max(0, numBooks | 0);
  if (!books) return 0;
  const avail = TALLY_PAGE_HEIGHT_PX - TALLY_CHROME_PX - thHeight;
  const minPerBook = includeNotes ? TALLY_MIN_ROW_PX + TALLY_MIN_PRICE_PX : TALLY_MIN_ROW_PX;
  const perPage = Math.max(1, Math.floor(avail / minPerBook));
  return Math.ceil(books / perPage);
}

/** How many printed pages the QR sheet will take for this many cards. */
export function estimateQrPages({ count, cols, fitOnePage = false, priceRows = 0 }) {
  if (!(count > 0)) return 0;
  if (fitOnePage) return 1;
  const { rows, rowsPerPage } = computeQrCardSize({ count, cols, priceRows });
  return Math.ceil(rows / rowsPerPage);
}
