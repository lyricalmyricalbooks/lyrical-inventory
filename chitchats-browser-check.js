async (page) => {
  const base = 'http://127.0.0.1:5176';
  const stub = await (await page.request.get(base + '/tests/helpers/stubs/firebase-sdk.js')).text();
  await page.route('https://www.gstatic.com/firebasejs/**', route => route.fulfill({ contentType: 'application/javascript', body: stub }));
  await page.route('https://script.google.com/macros/s/chitchats-browser-fixture/exec', route => {
    const input = route.request().postDataJSON()?.payload || {};
    const shipment = { id: 'CCABC123', status: 'unpaid', rates: [{ postage_type: 'chit_chats_select', postage_description: 'Chit Chats Select', payment_amount: '9.68', delivery_time_description: 'Estimated delivery in 8 business days', tracking_type_description: 'Full tracking included' }] };
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, status: 200, data: input.method === 'POST' ? { shipment } : [] }) });
  });
  await page.goto(base);
  await page.waitForFunction(() => window.__firebaseStub?.authCallbacks?.length > 0);
  await page.evaluate(async () => {
    const main = await import('/src/main.js');
    window.ccQaMain = main;
    const book = { id: 'harbour', title: 'Harbour Lights', author: 'Ada Example', listPrice: 25, currency: 'CA$', maxPrint: 100, threshold: 5 };
    for (const key of Object.keys(window)) if (key.startsWith('_fb') && typeof window[key] === 'function') window[key] = async () => null;
    window._fbLoadCatalog = async () => ({ _deletedDefaults: ['altrove', 'hound', 'archaeology', 'sistema', 'nobody', 'collective'], harbour: book });
    window._fbLoadSettings = async () => null;
    window._fbSaveSettings = async () => true;
    window._fbSave = async () => ({ ok: true });
    window._fbWatch = () => () => {};
    window._useFirestoreGlobal = () => true;
    window._useFirestoreForBook = () => true;
    await window.__firebaseStub.authCallbacks.at(-1)({ email: 'lyricalmyricalbooks@gmail.com', uid: 'qa-publisher', getIdToken: async () => 'fake' });
    for (let tries = 0; tries < 250 && !main.states.harbour; tries++) await new Promise(resolve => setTimeout(resolve, 20));
    window.switchBook('harbour');
    main.TAX_CENTER.settings = { ccClientId: '123', ccToken: 'qa-fake', ccEnabled: true, ccTestMode: true };
    localStorage.setItem('lm-sheets-url', 'https://script.google.com/macros/s/chitchats-browser-fixture/exec');
    window.switchTab('shipping');
    for (const [id, value] of Object.entries({ 'st-name': 'Jane Example', 'st-street1': '1 Main St', 'st-city': 'Toronto', 'st-state': 'ON', 'st-zip': 'M1M1M1', 'st-country': 'CA', 'sp-qty': '1', 'sp-customs-value': '25', 'sp-customs-description': 'Books', 'sp-weight': '250', 'sp-weight-unit': 'g', 'sp-length': '20', 'sp-width': '15', 'sp-height': '2', 'sp-dim-unit': 'cm' })) document.getElementById(id).value = value;
  });
  await page.getByRole('button', { name: 'Chit Chats Rates', exact: true }).click();
  await page.locator('#chitchats-rates-card').getByText('9.68 CAD').waitFor();
  await page.locator('#chitchats-rates-card').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'C:/Users/julia/.codex/visualizations/2026/10/02/01a0f9f7-096a-71f1-9a08-fc28a430303c/chitchats-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#chitchats-rates-card').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'C:/Users/julia/.codex/visualizations/2026/10/02/01a0f9f7-096a-71f1-9a08-fc28a430303c/chitchats-phone.png' });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  if (overflow) throw new Error('Phone viewport overflows horizontally');
  await page.evaluate(() => { document.documentElement.setAttribute('data-theme', 'dark'); document.documentElement.classList.add('theme-dark'); });
  await page.screenshot({ path: 'C:/Users/julia/.codex/visualizations/2026/10/02/01a0f9f7-096a-71f1-9a08-fc28a430303c/chitchats-phone-dark.png' });
  console.log('Desktop and phone rate controls rendered; no horizontal overflow. All shipping responses are fixtures.');
}
