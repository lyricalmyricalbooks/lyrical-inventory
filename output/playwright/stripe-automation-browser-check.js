async (page) => {
  await page.reload();
  await page.setViewportSize({width:1440,height:900});
  const rates = page.getByRole('spinbutton', {name:'Automatic exchange rate'});
  await rates.first().waitFor();
  await page.getByRole('status').filter({hasText:'Reference rate'}).first().waitFor();
  if (await rates.first().inputValue() !== '1.55') throw new Error('Automatic rate missing');
  const numbers = page.getByRole('textbox',{name:'Order #'});
  if (await numbers.first().inputValue() !== 'STRIPE-PreviewAbCd42') throw new Error('Order number missing');
  await page.screenshot({path:'output/playwright/stripe-auto-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'Switch theme'}).click();
  await page.setViewportSize({width:390,height:844});
  if (await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth)) throw new Error('Phone horizontal overflow');
  await page.screenshot({path:'output/playwright/stripe-auto-phone-dark.png',fullPage:true});
  await rates.first().fill('1.6');
  await page.getByRole('status').filter({hasText:'Your exchange rate'}).waitFor();
  await page.getByRole('button',{name:'Record sale',exact:true}).first().click();
  const history = await page.locator('#history').textContent();
  const rows = JSON.parse(history);
  if (rows.length!==1 || rows[0].num!=='STRIPE-PreviewAbCd42' || rows[0].payment.amount!==40 || rows[0].payment.convertedTotal!==64 || rows[0].payment.rateSource!=='manual') throw new Error('Recorded sale mismatch');
  await page.reload();
  await page.getByRole('button',{name:'Group payments'}).click();
  await page.getByRole('status').filter({hasText:'per payment'}).waitFor();
  await page.getByRole('button',{name:'Record all 2',exact:true}).click();
  const group = JSON.parse(await page.locator('#history').textContent());
  if (group.length!==2 || new Set(group.map(row=>row.num)).size!==2 || group.some(row=>row.payment.convertedTotal!==62)) throw new Error('Grouped sale mismatch');
  return {desktop:true,phoneDark:true,manualOverride:true,sale:rows[0],groupedSales:group.map(row=>({num:row.num,amount:row.payment.amount,convertedTotal:row.payment.convertedTotal}))};
}
