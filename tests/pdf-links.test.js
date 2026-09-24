import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractDecl, mainJs } from './helpers/extract-decl.js';
import { pdfLinkPlacements, pdfSafeLinkUrl } from '../src/lib/pdf-links.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexHtml = readFileSync(path.join(__dirname, '../index.html'), 'utf8');

// The invoice PDF is a photograph of the paper, so every link on it arrives at
// the customer flat: not clickable, not tappable, on a phone not even
// selectable to copy. These cover the annotations laid back over the image.

// A4 at 72dpi, with the builder's own 24pt margin.
const PAGE = { margin: 24, contentHeight: 841.89 - 48 };
const PAY = 'https://buy.stripe.com/oow3cu1E6eWs8iI2Mw3oA1w';

describe('placing a link on a rasterized page', () => {
  it('converts browser pixels into points, offset by the page margin', () => {
    // A 780px-wide paper placed 547.28pt wide: a hair over 0.7pt per pixel.
    const scale = 547.28 / 780;
    const [spot] = pdfLinkPlacements(
      [{ x: 100, y: 200, w: 180, h: 40, url: PAY }],
      { scale, ...PAGE, pageCount: 1 },
    );
    expect(spot.page).toBe(1);
    expect(spot.x).toBeCloseTo(24 + 100 * scale, 4);
    expect(spot.y).toBeCloseTo(24 + 200 * scale, 4);
    expect(spot.w).toBeCloseTo(180 * scale, 4);
    expect(spot.h).toBeCloseTo(40 * scale, 4);
    expect(spot.url).toBe(PAY);
  });

  it('follows the link onto whichever page shows that slice of the image', () => {
    // The slicing is what makes this worth its own function: the image is
    // placed once per page and shifted up, so a link far down the paper is at
    // the TOP of a later page, not below the bottom of the first one.
    const scale = 1;
    const secondPageTop = PAGE.contentHeight + 10;
    const [spot] = pdfLinkPlacements(
      [{ x: 0, y: secondPageTop, w: 100, h: 20, url: PAY }],
      { scale, ...PAGE, pageCount: 3 },
    );
    expect(spot.page).toBe(2);
    expect(spot.y).toBeCloseTo(24 + 10, 4);
  });

  it('lands the very first pixel of a page on that page, not the one before', () => {
    const [spot] = pdfLinkPlacements(
      [{ x: 0, y: PAGE.contentHeight, w: 100, h: 20, url: PAY }],
      { scale: 1, ...PAGE, pageCount: 2 },
    );
    expect(spot.page).toBe(2);
    expect(spot.y).toBeCloseTo(24, 4);
  });

  it('splits a link straddling a page break so both halves are tappable', () => {
    // The customer taps the half they can see; an annotation on the other
    // page is no use to them.
    const spots = pdfLinkPlacements(
      [{ x: 0, y: PAGE.contentHeight - 10, w: 100, h: 30, url: PAY }],
      { scale: 1, ...PAGE, pageCount: 2 },
    );
    expect(spots.map(s => s.page)).toEqual([1, 2]);
    expect(spots[0].h).toBeCloseTo(10, 4);
    expect(spots[1].h).toBeCloseTo(20, 4);
    expect(spots[1].y).toBeCloseTo(24, 4);
    for (const s of spots) expect(s.url).toBe(PAY);
  });

  it('never annotates a page the document does not have', () => {
    const spots = pdfLinkPlacements(
      [{ x: 0, y: PAGE.contentHeight * 5, w: 100, h: 20, url: PAY }],
      { scale: 1, ...PAGE, pageCount: 2 },
    );
    expect(spots).toEqual([]);
  });

  it('drops what cannot be tapped or measured', () => {
    const spots = pdfLinkPlacements([
      { x: 0, y: 10, w: 0, h: 20, url: PAY },          // no width
      { x: 0, y: 10, w: 100, h: 0, url: PAY },         // no height
      { x: 0, y: 10, w: 100, h: 20, url: '' },         // no link
      { x: NaN, y: 10, w: 100, h: 20, url: PAY },      // unmeasured
      { x: 0, y: 10, w: -50, h: 20, url: PAY },        // measured backwards
      null,
    ], { scale: 1, ...PAGE, pageCount: 1 });
    expect(spots).toEqual([]);
  });

  it('returns nothing rather than NaN rectangles when the page is unknown', () => {
    const rect = [{ x: 0, y: 0, w: 100, h: 20, url: PAY }];
    expect(pdfLinkPlacements(rect, { scale: 0, ...PAGE })).toEqual([]);
    expect(pdfLinkPlacements(rect, { scale: 1, margin: 24, contentHeight: 0 })).toEqual([]);
    expect(pdfLinkPlacements(rect, {})).toEqual([]);
    expect(pdfLinkPlacements(undefined, { scale: 1, ...PAGE })).toEqual([]);
  });
});

describe('which URLs become annotations', () => {
  it('takes the schemes a PDF reader can actually open', () => {
    expect(pdfSafeLinkUrl(PAY)).toBe(PAY);
    expect(pdfSafeLinkUrl('http://example.com/pay')).toBe('http://example.com/pay');
    expect(pdfSafeLinkUrl('mailto:shop@example.com')).toBe('mailto:shop@example.com');
    expect(pdfSafeLinkUrl('tel:+14165551234')).toBe('tel:+14165551234');
    expect(pdfSafeLinkUrl('  https://example.com/pay  ')).toBe('https://example.com/pay');
  });

  it('refuses anything that could run when a customer taps it', () => {
    // The payment link is publisher-entered text that ends up in a document
    // sent to other people — a flat link is a far better failure than a live
    // script in somebody's PDF reader.
    expect(pdfSafeLinkUrl('javascript:alert(1)')).toBe('');
    expect(pdfSafeLinkUrl('JavaScript:alert(1)')).toBe('');
    expect(pdfSafeLinkUrl('file:///etc/passwd')).toBe('');
    expect(pdfSafeLinkUrl('data:text/html,<script>alert(1)</script>')).toBe('');
    expect(pdfSafeLinkUrl('blob:https://example.com/abc')).toBe('');
    // An Interac address is not a page, and must not become a link.
    expect(pdfSafeLinkUrl('shop@example.com')).toBe('');
    expect(pdfSafeLinkUrl('')).toBe('');
    expect(pdfSafeLinkUrl(null)).toBe('');
  });
});

describe('the invoice PDF builder', () => {
  const build = () => extractDecl('buildInvoiceJsPdf', mainJs);

  it('measures the links before the paper becomes a photograph', () => {
    const fn = build();
    const measured = fn.indexOf('invoicePdfLinkRects(paper)');
    const shot = fn.indexOf('await window.html2canvas(');
    expect(measured).toBeGreaterThan(-1);
    expect(shot).toBeGreaterThan(measured);
    // And after the fonts settle, or the boxes sit over the wrong words.
    expect(fn.indexOf('document.fonts.ready')).toBeLessThan(measured);
  });

  it('lays the real links back over the image', () => {
    const fn = build();
    expect(fn).toContain('pdfLinkPlacements(linkRects');
    expect(fn).toContain('pdf.link(spot.x, spot.y, spot.w, spot.h, { url: spot.url })');
    expect(fn).toContain('pdf.setPage(spot.page)');
  });

  it('scales by the paper, not by the sharpness of the photograph', () => {
    // html2canvas's scale:2 makes a crisper picture of the same paper; using
    // it here would put every link at half position.
    const fn = build();
    expect(fn).toContain('imgW / paperWidth');
    expect(fn).not.toMatch(/scale:\s*linkScale[^]*canvas\.width/);
  });

  it('leaves the page cursor where the drawing left it', () => {
    expect(build()).toContain('pdf.setPage(lastPage)');
  });
});

describe('what gets measured on the paper', () => {
  const fn = () => extractDecl('invoicePdfLinkRects', mainJs);

  it('finds both the real links and the QR box', () => {
    expect(fn()).toContain("querySelectorAll('a[href], [data-pdf-link]')");
    expect(fn()).toContain('data-pdf-link');
  });

  it('runs every URL past the allow-list before it becomes an annotation', () => {
    expect(fn()).toContain('pdfSafeLinkUrl(');
  });

  it('skips anything with no box on the page', () => {
    expect(fn()).toContain('if (!box.width || !box.height) continue;');
  });

  it('lays the big catch-all region down before the precise targets inside it', () => {
    // The pay box, the button and the QR overlap. Where two annotations cover
    // the same spot a reader generally takes the later one, and the specific
    // one is the one whose highlight should win — so the order has to be
    // deliberate rather than however the markup happened to nest.
    expect(fn()).toContain('out.sort((a, b) => (b.w * b.h) - (a.w * a.h));');
  });
});

describe('the pay box as a whole', () => {
  const paper = () => extractDecl('renderInvoicePaperHTML', mainJs);

  it('is tappable end to end, not just on the button glyphs', () => {
    // A customer aiming at "Pay CA$60.00" on a phone should not have to hit
    // the text itself — the whole panel is what reads as the thing to press.
    expect(paper()).toContain('<section class="inv-pay"${payHref ? ` data-pdf-link="${escapeHtml(payHref)}"` : \'\'}');
  });

  it('is not a link when there is nowhere to send them', () => {
    // An Interac e-Transfer address renders the same panel with no payHref:
    // an address to send money TO is not somewhere to be sent on tapping.
    const fn = paper();
    const at = fn.indexOf('data-pdf-link="${escapeHtml(payHref)}"');
    expect(at).toBeGreaterThan(-1);
    expect(fn.slice(at - 40, at)).toContain('payHref ?');
  });

  it('still keeps the button and the QR as their own targets', () => {
    // The catch-all is a safety net, not a replacement: a reader that shows a
    // tooltip should show it on the button a customer aimed at.
    expect(paper()).toContain('<a class="pay-btn"');
    expect(extractDecl('qrLinkAttr', mainJs)).toContain('data-pdf-link=');
  });
});

describe('the QR code in an emailed invoice', () => {
  it('is tappable, for the one screen that cannot scan itself', () => {
    for (const name of ['invoicePaperBodyWithQR', 'invoicePaperBodyWithHeadlessQR']) {
      expect(extractDecl(name, mainJs), `${name} should mark the QR box`)
        .toContain('qrLinkAttr(inv)');
    }
  });

  it('only ever points at a real payment page', () => {
    // An Interac e-Transfer "link" is an email address to send money to, not
    // somewhere a customer should be sent on tapping.
    const fn = extractDecl('qrLinkAttr', mainJs);
    expect(fn).toContain('pdfSafeLinkUrl(followableUrl(effectivePaymentLink(inv)))');
    expect(fn).toContain('escapeHtml(url)');
  });

  it('leaves the on-screen and printed invoice as it was', () => {
    // A data attribute, not an anchor: wrapping the QR in a link would change
    // how the paper prints and how it renders in an email client.
    expect(extractDecl('qrLinkAttr', mainJs)).toContain('data-pdf-link=');
    expect(indexHtml).not.toContain('<a class="inv-qr"');
  });
});
