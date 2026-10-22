// @vitest-environment jsdom
// The edit-expense sheet lists a saved receipt as a link that opens the file
// from the receipts folder. Its file name goes into an inline onclick, so a
// name with a quote or a backslash must reach viewLocalReceipt unchanged
// instead of breaking out of the handler.
import { beforeAll, describe, expect, it } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';

let app;
beforeAll(async () => {
  app = await loadApp({ books: [makeBook({ id: 'harbour' })] });
}, 30000);

describe('edit-expense receipt link', () => {
  it('opens a receipt whose file name has quotes and a backslash', () => {
    const name = `Receipts/O'Brien "fair" \\ stall.jpg`;
    app.main.TAX_CENTER.businessExpenses = [
      { id: 'e1', date: '2026-10-01', desc: 'Table fee', cat: 'Events & Exhibitions', amount: 40, currency: 'CAD', receipt: `local://${name}` },
    ];
    const opened = [];
    app.window.viewLocalReceipt = (path) => { opened.push(path); };
    app.window.openEditExpense('businessExpense', null, 'e1');
    const link = document.querySelector('#edit-exp-receipts-preview a');
    expect(link).not.toBeNull();
    link.click();
    expect(opened).toEqual([name]);
  });
});
