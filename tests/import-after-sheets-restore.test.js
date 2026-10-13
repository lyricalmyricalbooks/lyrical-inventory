import { beforeAll, expect, test, vi } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';

// The Google Sheets restore reuses the import pop-up and rewrites its confirm
// button as "Restore database (N rows)", which dropped the order count inside
// it. The next spreadsheet import then failed while filling in that count and
// told the owner "Could not read file" about a perfectly good file.
let app;
beforeAll(async () => {
  app = await loadApp({ books: [makeBook({ id: 'bk', title: 'Harbour Lights' })] });
}, 30000);

test('a spreadsheet import after a Sheets restore preview still reads the file', async () => {
  await app.resetBook('bk', {});
  app.window.switchBook('bk');
  // What the restore preview leaves behind on the shared confirm button.
  const btn = document.getElementById('import-confirm-btn');
  btn.setAttribute('onclick', 'confirmRestoreBookDataFromSheets()');
  btn.innerHTML = 'Restore database (3 rows)';

  const csv = 'Order #,Date,Channel,Qty,Unit price,Notes\nA-1,2026-10-01,Website,2,40,\nA-2,2026-10-02,Book Fair,1,40,\n';
  const file = new File([csv], 'orders.csv', { type: 'text/csv' });
  await app.window.handleImportFile({ target: { files: [file], value: '' } });
  await vi.waitFor(() => {
    expect(document.getElementById('import-summary').textContent).toContain('2 orders');
  }, { timeout: 3000, interval: 10 });

  expect(app.toast()).not.toMatch(/could not read/i);
  expect(btn.getAttribute('onclick')).toBe('confirmImport()');
  expect(btn.textContent).toMatch(/Import 2 orders/);
  expect(btn.disabled).toBe(false);
});
