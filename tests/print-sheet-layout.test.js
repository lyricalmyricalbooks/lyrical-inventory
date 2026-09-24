import { describe, it, expect } from 'vitest';
import { computeTallyRowHeights, computeQrCardSize } from '../src/lib/print-sheet-layout.js';

describe('tally sheet rows adapt to the number of books', () => {
  it('gives a short list tall rows and a long list shorter ones', () => {
    const three = computeTallyRowHeights(3).tallyRowHeight;
    const twelve = computeTallyRowHeights(12).tallyRowHeight;
    expect(three).toBeGreaterThan(twelve);
    expect(computeTallyRowHeights(1).tallyRowHeight).toBeLessThanOrEqual(220);
  });
  it('keeps rows writable and flows onto more pages when there are many books', () => {
    const r = computeTallyRowHeights(60);
    expect(r.tallyRowHeight).toBe(30);
    expect(r.fitsOnePage).toBe(false);
  });
  it('splits each book between tally and price rows when notes are on', () => {
    const r = computeTallyRowHeights(5, { includeNotes: true });
    expect(r.priceRowHeight).toBeGreaterThanOrEqual(20);
    expect(r.tallyRowHeight).toBeGreaterThan(r.priceRowHeight);
  });
});

describe('QR codes adapt to the number of books', () => {
  it('shrinks the code as more books share the page', () => {
    const one = computeQrCardSize({ count: 1, cols: 3 }).frameSize;
    const six = computeQrCardSize({ count: 6, cols: 3 }).frameSize;
    const twelve = computeQrCardSize({ count: 12, cols: 3 }).frameSize;
    expect(one).toBeGreaterThan(six);
    expect(six).toBeGreaterThan(twelve);
  });
  it('never goes below a scannable size unless forced onto one page', () => {
    expect(computeQrCardSize({ count: 40, cols: 3, priceRows: 3 }).frameSize).toBeGreaterThanOrEqual(72);
    const fit = computeQrCardSize({ count: 40, cols: 6, fitOnePage: true });
    expect(fit.frameSize).toBeGreaterThanOrEqual(48);
    expect(fit.rowsPerPage).toBe(fit.rows);
  });
  it('renders the code slightly inside its frame', () => {
    const r = computeQrCardSize({ count: 4, cols: 2 });
    expect(r.renderSize).toBe(r.frameSize - 16);
  });
});

describe('page estimates', () => {
  it('counts tally pages from the number of books', async () => {
    const { estimateTallyPages } = await import('../src/lib/print-sheet-layout.js');
    expect(estimateTallyPages(0)).toBe(0);
    expect(estimateTallyPages(8)).toBe(1);
    expect(estimateTallyPages(60)).toBeGreaterThan(1);
    expect(estimateTallyPages(15, { includeNotes: true })).toBeGreaterThanOrEqual(estimateTallyPages(15));
  });
  it('keeps a fit-on-one-page QR sheet to one page', async () => {
    const { estimateQrPages } = await import('../src/lib/print-sheet-layout.js');
    expect(estimateQrPages({ count: 40, cols: 3, fitOnePage: true })).toBe(1);
    expect(estimateQrPages({ count: 40, cols: 3, priceRows: 3 })).toBeGreaterThan(1);
    expect(estimateQrPages({ count: 0, cols: 3 })).toBe(0);
  });
});
