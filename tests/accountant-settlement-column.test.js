// @vitest-environment jsdom
// The accountant exports mark a book expense an author settlement already paid
// back, so the cost and the repayment aren't counted twice at tax time.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';
import { settlementRepaidLookup } from '../src/lib/receipt-storage.js';

const BOOK = 'harbour';
let app;
beforeAll(async () => {
  app = await loadApp({ books: [makeBook({ id: BOOK })] });
}, 30000);

const settlement = (over = {}) => ({
  id: 'set-1', date: '2025-06-30', amount: 50, method: 'e-Transfer',
  settlement: {
    cur: 'CAD', expenses: [{ id: 'e-repaid' }],
    balance: { heldGross: 0, heldShare: 0, royaltiesOwed: 0, expensesOwed: 50, otherDebt: 0, overpaid: 0, direction: 'to-artist', amount: 50 },
  },
  ...over,
});

function captureCsv(run) {
  let csv = '';
  const OrigBlob = globalThis.Blob;
  vi.stubGlobal('Blob', class { constructor(parts) { csv = parts.join(''); } });
  URL.createObjectURL = () => 'blob:x';
  URL.revokeObjectURL = () => {};
  try { run(); } finally { vi.stubGlobal('Blob', OrigBlob); }
  return csv;
}

describe('settlementRepaidLookup', () => {
  it('gives the settlement date for a repaid book expense and nothing for anything else', () => {
    const lookup = settlementRepaidLookup({ [BOOK]: { artistPayouts: [settlement()] } });
    expect(lookup({ sourceType: 'bookExpense', sourceId: BOOK, itemId: 'e-repaid' })).toBe('2025-06-30');
    expect(lookup({ sourceType: 'bookExpense', sourceId: BOOK, itemId: 'e-other' })).toBe('');
    expect(lookup({ sourceType: 'businessExpense', sourceId: BOOK, itemId: 'e-repaid' })).toBe('');
  });

  it('ignores a voided settlement', () => {
    const lookup = settlementRepaidLookup({ [BOOK]: { artistPayouts: [settlement({ voided: true })] } });
    expect(lookup({ sourceType: 'bookExpense', sourceId: BOOK, itemId: 'e-repaid' })).toBe('');
  });
});

describe('the tax season export', () => {
  it('adds the column and dates only the expense the settlement paid back', async () => {
    await app.resetBook(BOOK, {
      expenses: [
        { id: 'e-repaid', date: '2025-05-01', cat: 'Printing', desc: 'Proofs', amount: 50 },
        { id: 'e-other', date: '2025-05-02', cat: 'Printing', desc: 'Posters', amount: 20 },
      ],
      artistPayouts: [settlement()],
    });
    document.getElementById('tc-year') || document.body.insertAdjacentHTML('beforeend', '<select id="tc-year"><option value="2025">2025</option></select>');
    document.getElementById('tc-year').value = '2025';
    const csv = captureCsv(() => app.window.downloadFullTaxSeasonExport());
    const lines = csv.split('\n');
    expect(lines).toContain('Date,Book/Entity,Category,Description,Amount (CAD),Receipt Link,Paid back in author settlement');
    const repaid = lines.find(l => l.includes('Proofs'));
    const other = lines.find(l => l.includes('Posters'));
    expect(repaid).toMatch(/,"?2025-06-30"?$/);
    expect(other.split(',')).toHaveLength(7);
    expect(other).toMatch(/,("")?$/);
  });
});
