// ── CLICKABLE LINKS ON A RASTERIZED PDF ─────────────────────────────────────
//
// The invoice PDF is a picture. The paper is laid out in HTML, photographed by
// html2canvas and placed into jsPDF as one PNG per page — which is what keeps
// it looking exactly like the invoice on screen, and is also why every link on
// it dies in the process. A customer opening the emailed PDF sees "Pay online:
// https://buy.stripe.com/…" in blue underlined text that cannot be tapped,
// cannot be clicked, and on a phone cannot even be selected to copy. The one
// thing the document exists to make easy is the one thing it prevents.
//
// A PDF carries links as annotations: rectangles on a page, each with a URL,
// laid over whatever is drawn underneath. So the fix is to measure where the
// links are while the paper is still real HTML, and re-lay those rectangles
// over the finished image. This module does the arithmetic half — turning
// browser pixels into PDF points, and working out which page each one lands on
// when the invoice runs longer than a page.
//
// Kept away from the DOM deliberately: the measuring needs a browser, but
// "which page does a link 900px down land on, and where" is exactly the part
// that is easy to get subtly wrong and impossible to eyeball in a finished PDF.

/** A finite, non-negative number, or null. */
function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Links a PDF should carry, and where.
 *
 * Takes rectangles measured in CSS pixels relative to the top-left of the
 * rendered paper, and returns rectangles in PDF points relative to the top-left
 * of the page they belong on.
 *
 * `scale` is points-per-CSS-pixel — the placed image's width in points divided
 * by the paper's width in pixels. Note that this is NOT html2canvas's own
 * scale: that one governs how sharp the photograph is, and cancels out here
 * entirely, since a crisper picture of the same paper is still the same size on
 * the page.
 *
 * The page maths mirrors how the image is placed: page 1 draws it at `margin`,
 * and each page after shifts it up by one content height so the next slice
 * shows. A link therefore sits at the same offset into the image on whichever
 * page shows that slice.
 *
 * A link straddling a page break comes back twice — the part visible on each
 * page — because the customer will tap whichever half they can see, and the
 * half on the far side of the break is not clickable by virtue of the same
 * annotation being on the wrong page.
 */
export function pdfLinkPlacements(rects, { scale, margin = 0, contentHeight, pageCount = 1 } = {}) {
  const k = num(scale);
  const top = num(margin) ?? 0;
  const span = num(contentHeight);
  const pages = Math.max(1, Math.floor(num(pageCount) ?? 1));
  if (!k || k <= 0 || !span || span <= 0) return [];

  const out = [];
  for (const rect of (rects || [])) {
    if (!rect || !rect.url) continue;
    const x = num(rect.x);
    const y = num(rect.y);
    const w = num(rect.w);
    const h = num(rect.h);
    // A zero-area link is untappable anyway, and a negative one is a
    // measurement that went wrong — neither belongs in the document.
    if (x === null || y === null || !w || !h || w <= 0 || h <= 0) continue;

    const left = top + x * k;
    const width = w * k;
    // Where the link sits measured down the whole image, before it is sliced.
    const startY = y * k;
    const endY = startY + h * k;
    if (endY <= 0) continue;

    const firstPage = Math.floor(Math.max(0, startY) / span) + 1;
    for (let page = firstPage; page <= pages; page++) {
      // The slice of the image this page shows, in image coordinates.
      const sliceTop = (page - 1) * span;
      const sliceEnd = sliceTop + span;
      if (startY >= sliceEnd) continue;
      if (endY <= sliceTop) break;
      const visibleTop = Math.max(startY, sliceTop);
      const visibleEnd = Math.min(endY, sliceEnd);
      const height = visibleEnd - visibleTop;
      // A sliver left by a page break is not a link anybody can hit; it just
      // leaves an invisible hotspot on the edge of the page.
      if (height < 1) continue;
      out.push({
        page,
        x: left,
        y: top + (visibleTop - sliceTop),
        w: width,
        h: height,
        url: rect.url,
      });
      if (endY <= sliceEnd) break;
    }
  }
  return out;
}

/**
 * The URLs worth turning into an annotation.
 *
 * `javascript:` is the reason this is a list of what's allowed rather than a
 * list of what isn't: an invoice's payment link is publisher-entered text, and
 * a PDF that can be made to run script when a customer taps it is a far worse
 * outcome than a link that stays flat. `data:` and `blob:` are followable in a
 * browser — that is why receipt-links.js accepts them — but they mean nothing
 * to a PDF reader opened outside one, so they are left as text here too.
 */
export function pdfSafeLinkUrl(value) {
  const ref = String(value ?? '').trim();
  if (!ref) return '';
  return /^(https?:\/\/|mailto:|tel:)/i.test(ref) ? ref : '';
}
