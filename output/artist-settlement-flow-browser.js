async (page) => {
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.includes('firestore.googleapis.com') || url.includes('firebaseio.com') || url.includes('identitytoolkit.googleapis.com')) return route.abort();
    return route.continue();
  });
  await page.setViewportSize({ width: 1280, height: 1100 });
  await page.goto('http://127.0.0.1:5191/');
  await page.waitForFunction(() => typeof window.renderProfitSharingBreakdown === 'function');
  await page.evaluate(async () => {
    const app = await import('/src/main.js');
    const id = 'settlement-preview';
    const book = { ...Object.values(app.BOOKS)[0], id, title: 'Author settlement preview', author: 'Example Author', currency: 'CA$', profitTiers: [{ label: 'Royalty', artistPct: 13 }] };
    app.BOOKS[id] = book;
    app.BOOK_LIST.push(book);
    app.states[id] = { ...app.defaultState(book), hist: [
      { num: 'held', qty: 1, price: 574.68, artistPending: true, date: '2026-01-01', chan: 'Fair' },
      { num: 'paid', qty: 1, price: 542.47 / 0.13, date: '2025-12-01', chan: 'Shop' },
    ], revenue: 542.47 / 0.13, artistTransfers: [{ id: 't1', num: 'held', total: 574.68, qty: 1, price: 574.68, date: '2026-01-01', chan: 'Fair' }], artistPayouts: [{ id: 'p1', amount: 274.71, date: '2026-01-02' }] };
    window._fbSave = async (_, json) => { window.previewSaved = JSON.parse(json); return { ok: true }; };
    window._fbLoad = async bid => JSON.stringify(app.states[bid]);
    window._fbWatch = () => () => {};
    window.IS_PUBLISHER = true;
    window.switchBook(id);
    window.renderProfitSharingBreakdown(id);
  });
  const block = page.locator('#d-profit-sharing-block');
  await page.setViewportSize({ width: 1280, height: 1100 });
  let initialShow = block.getByRole('button', { name: 'Show', exact: true });
  if (await initialShow.isVisible()) await initialShow.click();
  await page.getByRole('button', { name: 'Calculate author payment', exact: true }).click();
  await page.getByRole('button', { name: 'Copy explanation', exact: true }).click();
  await page.getByRole('button', { name: 'Record payment received', exact: true }).click();
  await page.locator('#as-method-settlement-preview').fill('e-Transfer');
  await page.locator('#as-notes-settlement-preview').fill('Sample payment for browser verification');
  await page.locator('#artist-settlement-settlement-preview').screenshot({ path: 'output/artist-settlement-record-desktop.png' });
  await page.setViewportSize({ width: 390, height: 1100 });
  const show = block.getByRole('button', { name: 'Show', exact: true });
  if (await show.isVisible()) await show.click();
  await page.locator('#artist-settlement-settlement-preview').screenshot({ path: 'output/artist-settlement-record-phone.png' });
  await page.getByRole('button', { name: 'Save settlement', exact: true }).click();
  await page.locator('#m-confirm-ok').click();
  await page.waitForFunction(() => window.previewSaved?.artistPayouts.some(p => p.settlement));
  await block.screenshot({ path: 'output/artist-settlement-receipt-phone.png' });
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; document.documentElement.classList.add('theme-dark'); });
  await block.screenshot({ path: 'output/artist-settlement-receipt-phone-dark.png' });
  const saved = await page.evaluate(() => window.previewSaved.artistPayouts.find(p => p.settlement));
  if (saved.settlement.balance.amount !== 232.21 || saved.amount !== 342.47) throw new Error('Wrong settlement saved');
  await page.getByRole('button', { name: 'Undo settlement', exact: true }).click();
  await page.locator('#m-confirm-ok').click();
  await page.waitForFunction(() => window.previewSaved?.artistPayouts.some(p => p.settlement && p.voided));
  const after = await page.evaluate(() => ({ held: window.previewSaved.hist[0].artistPending, transfers: window.previewSaved.artistTransfers.length }));
  if (!after.held || after.transfers !== 1) throw new Error('Undo failed to restore held sale');
  initialShow = block.getByRole('button', { name: 'Show', exact: true });
  if (await initialShow.isVisible()) await initialShow.click();
  await page.getByRole('button', { name: 'Calculate author payment', exact: true }).click();
  const recalculated = await page.locator('#artist-settlement-settlement-preview .ps-stat-val').innerText();
  if (recalculated !== 'CA$232.21') throw new Error('Undo changed the balance');
  await block.screenshot({ path: 'output/artist-settlement-undone-phone-dark.png' });
  console.log('Verified: record 232.21 received, credit 342.47 retained earnings, undo restores 232.21 balance.');
}
