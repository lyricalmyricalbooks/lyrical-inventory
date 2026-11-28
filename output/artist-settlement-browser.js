async (page) => {
  await page.evaluate(async () => {
    const app = await import('/src/main.js');
    const id = 'settlement-preview';
    app.BOOKS[id] = { ...Object.values(app.BOOKS)[0], id, title: 'Author settlement preview', currency: 'CA$', profitTiers: [{ label: 'Royalty', artistPct: 13 }] };
    app.states[id] = { hist: [{ qty: 1, price: 574.68, artistPending: true }, { qty: 1, price: 542.47 / 0.13 }], revenue: 542.47 / 0.13, artistPayouts: [{ amount: 274.71 }] };
    window.renderProfitSharingBreakdown(id);
    const block = document.getElementById('d-profit-sharing-block');
    document.body.replaceChildren(block);
    document.body.style.padding = '24px';
    block.style.display = 'block';
  });
  await page.getByRole('button', { name: 'Calculate author payment' }).click();
  const result = page.locator('#artist-settlement-settlement-preview');
  console.log(await result.innerText());
  await page.setViewportSize({ width: 1280, height: 1100 });
  await result.screenshot({ path: 'output/artist-settlement-desktop.png' });
  await page.setViewportSize({ width: 390, height: 1100 });
  await result.screenshot({ path: 'output/artist-settlement-phone.png' });
  console.log('phone overflow:', await result.evaluate(el => el.scrollWidth > el.clientWidth));
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; document.documentElement.classList.add('theme-dark'); });
  await result.screenshot({ path: 'output/artist-settlement-phone-dark.png' });
}
