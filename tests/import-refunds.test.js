// Refund rows in an order-spreadsheet import. They used to be left out, so a
// refunded sale stayed sold (stock and revenue wrong) until voided by hand;
// and a refund written as one copy at a minus price went in as a sale.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { planImportRefunds } from '../src/lib/import-columns.js';
import { loadApp, makeBook } from './helpers/load-app.js';

describe('planImportRefunds', () => {
  const sale = (num, qty = 1, price = 30) => ({ num, qty, price });

  it('drops a sale refunded in the same file', () => {
    const plan = planImportRefunds([sale('A'), sale('B'), sale('A', -1)], []);
    expect(plan.sales.map(r => r.num)).toEqual(['B']);
    expect(plan.voidNums).toEqual([]);
  });

  it('voids a sale already in the book, including one written at a minus price', () => {
    const hist = [{ num: 'A', qty: 1 }, { num: 'B', qty: 2 }];
    const plan = planImportRefunds([sale('A', 1, -30), sale('B', -2)], hist);
    expect(plan.sales).toEqual([]);
    expect(plan.voidNums).toEqual(['A', 'B']);
  });

  it('leaves out a partial refund, an unknown order and a cancelled line', () => {
    const hist = [{ num: 'A', qty: 3 }];
    const plan = planImportRefunds([sale('A', -1), sale('Z', -1), sale('', -1), sale('C', 0)], hist);
    expect(plan.voidNums).toEqual([]);
    expect(plan).toMatchObject({ unmatched: 3, cancelled: 1, locked: 0 });
  });

  it('never voids a sale paid out to an author or matched to a website order', () => {
    const plan = planImportRefunds([sale('A', -1)], [{ num: 'A', qty: 1, artistSettlementId: 's1' }]);
    expect(plan.voidNums).toEqual([]);
    expect(plan.locked).toBe(1);
  });

  it('ignores voided history rows', () => {
    const plan = planImportRefunds([sale('A', -1)], [{ num: 'A', qty: 1, voided: true }]);
    expect(plan.voidNums).toEqual([]);
    expect(plan.unmatched).toBe(1);
  });
});

describe('importing refunds into a book', () => {
  let app;
  const st = () => app.main.states.bk;
  const head = 'Order #,Date,Channel,Qty,Unit price,Notes\n';

  async function importCsv(csv, name) {
    document.getElementById('import-summary').textContent = '';
    await app.window.handleImportFile({ target: { files: [new File([csv], name, { type: 'text/csv' })], value: '' } });
    await vi.waitFor(() => {
      expect(document.getElementById('import-summary').textContent).toMatch(/Found \d+ orders/);
    }, { timeout: 3000, interval: 10 });
  }

  beforeAll(async () => {
    app = await loadApp({ books: [makeBook({ id: 'bk', title: 'Harbour Lights' })] });
    await app.resetBook('bk', {});
    app.window.switchBook('bk');
  }, 30000);

  it('voids the refunded sale and undoing the import brings it back', async () => {
    await importCsv(`${head}R-1,2025-03-01,Website,1,40,\nR-2,2025-03-02,Website,1,40,\n`, 'march.csv');
    app.window.confirmImport();
    expect(st().sold).toBe(2);
    const stockBefore = st().stock;

    await importCsv(`${head}R-1,2025-03-05,Website,-1,40,refund\nR-3,2025-03-06,Website,1,40,\n`, 'march-2.csv');
    expect(document.getElementById('import-summary').textContent).toMatch(/1 refund in the file will void its sale/);
    app.window.confirmImport();
    const r1 = st().hist.find(h => h.num === 'R-1');
    expect(r1.voided).toBe(true);
    expect(st().sold).toBe(2); // R-2 and R-3
    expect(st().stock).toBe(stockBefore); // R-1's copy back, R-3's taken

    const id = st().hist.find(h => h.num === 'R-3').importId;
    const undoing = app.window.undoImport(id);
    await app.answerConfirm(true);
    await undoing;
    expect(st().hist.find(h => h.num === 'R-1').voided).toBe(false);
    expect(st().hist.find(h => h.num === 'R-3').voided).toBe(true);
    expect(st().sold).toBe(2); // R-1 and R-2
  });

  it('never imports a refund written at a minus price as a sale', async () => {
    await importCsv(`${head}M-1,2025-04-01,Website,1,25,\nM-1,2025-04-03,Website,1,-25,refund\nM-2,2025-04-04,Website,1,25,\n`, 'april.csv');
    app.window.confirmImport();
    expect(st().hist.some(h => h.num === 'M-1')).toBe(false);
    expect(st().hist.find(h => h.num === 'M-2').price).toBe(25);
  });
});
