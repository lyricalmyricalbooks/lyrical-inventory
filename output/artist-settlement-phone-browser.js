async (page) => {
  await page.getByRole('button', { name: 'Show', exact: true }).click();
  const result = page.locator('#artist-settlement-settlement-preview');
  console.log(await result.innerText());
  await result.screenshot({ path: 'output/artist-settlement-phone.png' });
  console.log('phone overflow:', await result.evaluate(el => el.scrollWidth > el.clientWidth));
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; document.documentElement.classList.add('theme-dark'); });
  await result.screenshot({ path: 'output/artist-settlement-phone-dark.png' });
}
