// Big Cartel — the storefront integration: connection settings, product and
// order sync, order-to-catalog matching, the address preview and copy tools,
// and the shipping-paid sync back into the ledger.
//
// The third feature lifted out of src/main.js, after Open Call and Shipping.
// Functions moved verbatim; no logic changed.
//
// This module owns the four shipping-named functions the Shipping extraction
// deliberately left behind — prefillShippingFromBigCartelOrder,
// hydrateShippingDestinationPhone, syncBigCartelShippingPaid and
// triggerBigCartelShippingSync. They read the storefront's API and cache, so
// they belong to the storefront, not to shipping. Shipping now imports the
// handful it needs from here rather than from main.js.
//
// Cycles with both main.js and shipping.js. Safe for the reason asserted in
// tests/features-boundary.test.js: nothing here runs at module-evaluation
// time, so no import is read before it is initialised.
import {
  $,
  BOOKS,
  _reconFindPayment,
  _reconSession,
  applyOne,
  classifyStripePayment,
  commitRecoveredWebsiteOrder,
  escapeHTML,
  getReconMemory,
  getScanMemory,
  renderReconcile,
  saveReconMemory,
  saveScanMemory,
  scheduleRender,
  sheetsUrl,
  showToast,
  states,
  switchTab,
  syncToSheets,
} from '../main.js';
import { openM, closeM, confirmDialog } from '../lib/modal.js';
import {
  _shippoDestMasterList,
  autoLinkPostageForOrder,
  getFallbackShippingPhone,
  getShippingReconciliationOrders,
  renderShippingAnalysisHub,
  shippingPurchaseRowPayload,
} from './shipping.js';
import { escapeHtml } from '../lib/html.js';
import { resolveCountryCode } from '../lib/countries.js';
import { fmt, getBookCurrencyCode } from '../lib/money.js';
import { normalizeShippingOrderNumber } from '../lib/shipping-reconciliation.js';
import {
  bigCartelOrderNumber,
  buildBigCartelOrderEntry,
  describeGapSummary,
  findLedgerGaps,
  findRecoveredOrderConflicts,
  sameOrderNumber,
} from '../lib/bigcartel-ledger-gap.js';

function reconcileApplyBigCartel(idSafe) {
  const p = _reconFindPayment(idSafe);
  if (!p) return;
  const c = classifyStripePayment(p);
  if (c.scanned && typeof applyOne === 'function') {
    applyOne(c.scanned.id);
    const mem = getReconMemory();
    mem.recorded[p.id] = { bookId: c.scanned.bookId || '', num: c.ref, at: Date.now() };
    saveReconMemory(mem);
    _reconSession.logged++;
    renderReconcile();
  } else {
    showToast('Order not found in scan — record it manually below', 'warn');
  }
}

function extractBigCartelAddress(orderOrAttr = {}, orderId = '', included = []) {
  const attr = orderOrAttr.attributes || orderOrAttr;
  const relationships = orderOrAttr.relationships || {};

  // Big Cartel exposes the recipient phone under a dozen different keys depending on
  // whether we are reading a flat order, a nested address object, or an included resource.
  const pickPhone = (source) => {
    if (!source || typeof source !== 'object') return '';
    const candidates = [
      source.shipping_phone, source.shipping_phone_number, source.shipping_telephone,
      source.phone, source.phone_number, source.telephone, source.mobile,
      source.customer_phone, source.customer_phone_number,
      source.buyer_phone, source.buyer_phone_number,
      source.billing_phone, source.contact_phone
    ];
    const hit = candidates.find(v => v !== null && v !== undefined && String(v).trim() !== '');
    return hit ? String(hit).trim() : '';
  };

  // Check JSON:API included lookup
  let incName = '';
  let incPhone = '';
  let incCompany = '';
  let incStreet1 = '';
  let incStreet2 = '';
  let incCity = '';
  let incState = '';
  let incZip = '';
  let incCountry = '';

  const incList = Array.isArray(included) && included.length > 0
    ? included
    : ((typeof bigCartelData !== 'undefined' && bigCartelData && bigCartelData.included) || (typeof loadCachedBigCartelOrders === 'function' ? loadCachedBigCartelOrders()?.included || [] : []));

  // Collect every relationship that can carry contact details, not just the first one:
  // the phone usually lives on shipping_address while the name lives on customer.
  const contactRefs = [];
  ['shipping_address', 'customer', 'buyer', 'billing_address', 'contact'].forEach(key => {
    const ref = relationships[key] && relationships[key].data;
    if (Array.isArray(ref)) ref.forEach(r => { if (r && r.id) contactRefs.push(r); });
    else if (ref && ref.id) contactRefs.push(ref);
  });

  if (incList.length > 0 && contactRefs.length > 0) {
    contactRefs.forEach(ref => {
      // JSON:API ids are only unique per type, so match on type as well when both sides declare it.
      const matchInc = incList.find(i => i && String(i.id) === String(ref.id)
        && (!ref.type || !i.type || String(i.type) === String(ref.type)));
      if (!matchInc || !matchInc.attributes) return;
      const iA = matchInc.attributes;
      incName = incName || iA.name || iA.recipient_name || `${iA.first_name || ''} ${iA.last_name || ''}`.trim();
      incPhone = incPhone || pickPhone(iA);
      incCompany = incCompany || iA.company || iA.company_name || '';
      incStreet1 = incStreet1 || iA.address_1 || iA.street1 || iA.address1 || '';
      incStreet2 = incStreet2 || iA.address_2 || iA.street2 || iA.address2 || '';
      incCity = incCity || iA.city || '';
      incState = incState || iA.state || iA.province || '';
      incZip = incZip || iA.zip || iA.postal_code || '';
      incCountry = incCountry || iA.country_code || iA.country || '';
    });
  }

  // Last resort: an included customer/address resource that points back at this order.
  if (!incPhone && incList.length > 0) {
    const orderKey = String(orderId || orderOrAttr.id || '');
    const related = incList.find(i => {
      if (!i || !i.attributes || !pickPhone(i.attributes)) return false;
      if (!/customer|address|buyer|contact/i.test(String(i.type || ''))) return false;
      const orderRef = i.relationships && i.relationships.order && i.relationships.order.data;
      return !orderRef || !orderKey || String(orderRef.id) === orderKey;
    });
    if (related) incPhone = pickPhone(related.attributes);
  }

  const shippingAddrObj = attr.shipping_address || {};
  const customerObj = attr.customer || {};
  const buyerObj = attr.buyer || {};
  const billingAddrObj = attr.billing_address || {};

  const nameParts = [
    attr.shipping_name,
    shippingAddrObj.name,
    shippingAddrObj.recipient_name,
    (attr.shipping_first_name || attr.shipping_last_name) ? `${attr.shipping_first_name || ''} ${attr.shipping_last_name || ''}`.trim() : '',
    (shippingAddrObj.first_name || shippingAddrObj.last_name) ? `${shippingAddrObj.first_name || ''} ${shippingAddrObj.last_name || ''}`.trim() : '',
    attr.customer_name,
    attr.buyer_name,
    (attr.buyer_first_name || attr.buyer_last_name) ? `${attr.buyer_first_name || ''} ${attr.buyer_last_name || ''}`.trim() : '',
    (attr.customer_first_name || attr.customer_last_name) ? `${attr.customer_first_name || ''} ${attr.customer_last_name || ''}`.trim() : '',
    customerObj.name,
    (customerObj.first_name || customerObj.last_name) ? `${customerObj.first_name || ''} ${customerObj.last_name || ''}`.trim() : '',
    buyerObj.name,
    (buyerObj.first_name || buyerObj.last_name) ? `${buyerObj.first_name || ''} ${buyerObj.last_name || ''}`.trim() : '',
    attr.billing_name,
    billingAddrObj.name,
    (attr.billing_first_name || attr.billing_last_name) ? `${attr.billing_first_name || ''} ${attr.billing_last_name || ''}`.trim() : '',
    (attr.first_name || attr.last_name) ? `${attr.first_name || ''} ${attr.last_name || ''}`.trim() : '',
    attr.name,
    incName
  ].filter(Boolean);

  const recipientName = (nameParts[0] || attr.buyer_email || attr.customer_email || attr.email || 'Customer').trim();

  const phoneParts = [
    pickPhone(attr),
    pickPhone(shippingAddrObj),
    pickPhone(buyerObj),
    pickPhone(customerObj),
    pickPhone(billingAddrObj),
    incPhone
  ].filter(Boolean);

  const recipientPhone = (phoneParts[0] || '').toString().trim();

  const street1 = (attr.shipping_address_1 || attr.address_1 || attr.street1 || shippingAddrObj.address_1 || shippingAddrObj.street1 || incStreet1 || '').trim();
  const street2 = (attr.shipping_address_2 || attr.address_2 || attr.street2 || shippingAddrObj.address_2 || shippingAddrObj.street2 || incStreet2 || '').trim();
  const city = (attr.shipping_city || attr.city || shippingAddrObj.city || incCity || '').trim();
  const state = (attr.shipping_state || attr.state || attr.province || shippingAddrObj.state || incState || '').trim();
  const zip = (attr.shipping_zip || attr.zip || attr.postal_code || shippingAddrObj.zip || incZip || '').trim();
  const company = (attr.shipping_company || attr.company || shippingAddrObj.company || incCompany || '').trim();

  // Big Cartel spreads the country across several fields and not every order
  // carries the same ones, so each candidate is tried until one actually
  // resolves rather than taking the first that is merely non-empty. That
  // ordering mattered: `shipping_country_id` is a Big Cartel row number, and
  // preferring it meant a real country name sitting in the next field was never
  // read — which is how a Serbian order arrived with no usable country at all.
  const countryCandidates = [
    attr.shipping_country_code,
    attr.shipping_country_name,
    attr.shipping_country,
    shippingAddrObj.country_code,
    shippingAddrObj.country,
    incCountry,
    attr.shipping_country_id,
  ];
  let country = '';
  let rawCountry = '';
  for (const candidate of countryCandidates) {
    if (!candidate) continue;
    const resolved = resolveCountryCode(candidate);
    if (!rawCountry) rawCountry = typeof candidate === 'object' ? (candidate.name || candidate.code || '') : String(candidate);
    if (resolved) { country = resolved; break; }
  }

  return {
    orderNumber: orderId || orderOrAttr.id || '',
    name: recipientName,
    company: company,
    phone: recipientPhone,
    street1,
    street2,
    city,
    state,
    zip,
    country,
    // What the storefront actually said, kept even when it could not be placed
    // — the pickers show it so an unshippable order names its own problem
    // instead of quietly presenting as a US address.
    countryRaw: rawCountry,
  };
}

let bigCartelConfig = null;
let bigCartelData = { store: null, products: [], orders: [] };
let activeBigCartelSubTab = 'products';

async function loadBigCartelConfig() {
  if (bigCartelConfig) return bigCartelConfig;
  try {
    bigCartelConfig = await window._fbLoadSettings('bigCartelConfig') || { subdomain: '', username: '', password: '' };
    return bigCartelConfig;
  } catch (e) {
    console.error('Error loading Big Cartel settings:', e);
    return { subdomain: '', username: '', password: '' };
  }
}

async function renderBigCartelTab() {
  const config = await loadBigCartelConfig();
  $('bc-subdomain').value = config.subdomain || '';
  $('bc-username').value = config.username || '';
  $('bc-password').value = config.password || '';

  if (config.subdomain && config.username && config.password) {
    updateBigCartelConnectionUI(true, 'Configured (Test to Verify)');
    $('bc-status-dot').className = 'sync-dot amber'; // override to amber instead of green
  } else {
    updateBigCartelConnectionUI(false, 'Disconnected');
  }

  if (config.subdomain && config.username && config.password) {
    $('bc-dashboard-content').style.display = 'block';
    if (!bigCartelData.products.length && !bigCartelData.orders.length) {
      loadBigCartelData();
    } else {
      renderBigCartelStoreDetails(bigCartelData.store);
      renderBigCartelProducts(bigCartelData.products);
      renderBigCartelOrders(bigCartelData.orders);
    }
    // Paint whatever the last check found straight away, then refresh it in the
    // background. Opening this tab is the moment the publisher is asking "what
    // does the storefront say?", so a stale answer now beats a blank panel.
    renderBigCartelLedgerGaps();
    renderBigCartelGapBadge();
    autoCheckBigCartelLedgerGaps();
  } else {
    $('bc-dashboard-content').style.display = 'none';
  }
}

function updateBigCartelConnectionUI(isConnected, statusText = '') {
  const dot = $('bc-status-dot');
  const txt = $('bc-status-text');

  if (isConnected) {
    dot.className = 'bc-dot connected';
    txt.textContent = statusText || 'Connected';
  } else {
    dot.className = 'bc-dot disconnected';
    txt.textContent = statusText || 'Disconnected';
  }
}

async function fetchBigCartel(endpoint, accountId = '') {
  const config = await loadBigCartelConfig();
  if (!config.subdomain || !config.username || !config.password) {
    throw new Error('Big Cartel credentials are not fully configured.');
  }

  if (!sheetsUrl) {
    throw new Error('Google Sheets Connection is required to proxy Big Cartel API requests.');
  }

  if (endpoint && !accountId) {
    throw new Error('Big Cartel account ID is unavailable; reload the connected store and try again.');
  }

  const url = endpoint
    ? `https://api.bigcartel.com/v1/accounts/${encodeURIComponent(accountId)}/${endpoint}`
    : `https://api.bigcartel.com/v1/accounts`;

  const payload = {
    version: 2,
    action: 'proxybigcartel',
    eventId: 'bigcartel-' + Date.now(),
    payload: {
      url: url,
      username: config.username,
      password: config.password,
      method: 'GET'
    }
  };

  const res = await fetch(sheetsUrl, {
    method: 'POST',
    mode: 'cors',
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    throw new Error(`HTTP error! status: ${res.status}`);
  }

  const data = await res.json();
  if (data.error) {
    throw new Error(data.error);
  }

  if (data.code === undefined) {
    throw new Error("Your Apps Script webhook is out of date. Please go to the 'Connect your Google Sheet' tab, copy the latest script (v20+), and redeploy your webhook in Google Sheets.");
  }

  if (data.code !== 200) {
    let apiError = '';
    try {
      const parsed = JSON.parse(data.content || '{}');
      apiError = (parsed.errors || [])
        .map(error => error.detail || error.title || error.code)
        .filter(Boolean)
        .join('; ');
    } catch (_) {
      // Keep the HTTP status when Big Cartel returns a non-JSON error body.
    }
    throw new Error(`Big Cartel API returned status ${data.code}${apiError ? `: ${apiError}` : ''}`);
  }

  return JSON.parse(data.content);
}

async function testBigCartelConnection() {
  const subdomain = $('bc-subdomain').value.trim();
  const username = $('bc-username').value.trim();
  const password = $('bc-password').value.trim();

  if (!subdomain || !username || !password) {
    showToast('All credentials are required to test connection.', 'warn');
    return;
  }

  const testBtn = $('bc-test-btn');
  testBtn.disabled = true;
  testBtn.textContent = 'Testing...';
  updateBigCartelConnectionUI(false, 'Testing connection...');

  try {
    const url = `https://api.bigcartel.com/v1/accounts`;
    const payload = {
      version: 2,
      action: 'proxybigcartel',
      eventId: 'bigcartel-test-' + Date.now(),
      payload: {
        url: url,
        username: username,
        password: password,
        method: 'GET'
      }
    };

    if (!sheetsUrl) {
      throw new Error('Google Sheets Connection URL is not set in Settings -> Sheets.');
    }

    const res = await fetch(sheetsUrl, {
      method: 'POST',
      mode: 'cors',
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error(`Webhook error: ${res.status}`);

    const data = await res.json();
    if (!data || data.error) throw new Error(data ? data.error : 'Connection failed');
    if (data.code !== 200) throw new Error(`API error ${data.code}`);

    const content = JSON.parse(data.content);
    if (content.data && content.data.length > 0) {
      showToast('✓ Connection successful!', 'ok');
      updateBigCartelConnectionUI(true, 'Connection Successful');

      const storeInfo = content.data.find(acc => acc.attributes.subdomain === subdomain) || content.data[0];
      renderBigCartelStoreDetails(storeInfo);
    } else {
      throw new Error('No account found for credentials');
    }
  } catch (e) {
    console.error('Test connection failed:', e);
    showToast('Connection failed: ' + e.message, 'err');
    updateBigCartelConnectionUI(false, 'Connection Failed');
  } finally {
    testBtn.disabled = false;
    testBtn.textContent = 'Test Connection';
  }
}

async function saveBigCartelSettings() {
  const subdomain = $('bc-subdomain').value.trim();
  const username = $('bc-username').value.trim();
  const password = $('bc-password').value.trim();

  if (!subdomain || !username || !password) {
    showToast('All credentials are required to save.', 'warn');
    return;
  }

  const saveBtn = $('bc-save-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    const config = { subdomain, username, password };
    await window._fbSaveSettings('bigCartelConfig', config);
    bigCartelConfig = config;
    showToast('✓ Big Cartel credentials saved & synced', 'ok');

    $('bc-dashboard-content').style.display = 'block';
    updateBigCartelConnectionUI(true, 'Connected');

    loadBigCartelData();
  } catch (e) {
    console.error('Save failed:', e);
    showToast('Save failed: ' + e.message, 'err');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Settings';
  }
}

async function loadBigCartelData() {
  const container = $('bc-products-grid');
  const list = $('bc-orders-list');

  // Load cached orders for instant render
  if (activeBigCartelSubTab === 'orders') {
    const cached = loadCachedBigCartelOrders();
    if (cached && cached.orders && cached.orders.length > 0) {
      bigCartelData.orders = cached.orders;
      bigCartelData.included = cached.included || [];
      renderBigCartelOrders(bigCartelData.orders, bigCartelData.included);
    } else {
      list.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:3rem; color:var(--text3);">Loading orders from Big Cartel...</td></tr>';
    }
  } else {
    container.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:3rem; color:var(--text3);">Loading products from Big Cartel...</div>';
  }

  try {
    if (!bigCartelData.store) {
      const accountsRes = await fetchBigCartel('');
      if (accountsRes.data && accountsRes.data.length > 0) {
        const subdomain = (await loadBigCartelConfig()).subdomain;
        bigCartelData.store = accountsRes.data.find(acc => acc.attributes.subdomain === subdomain) || accountsRes.data[0];
        renderBigCartelStoreDetails(bigCartelData.store);
      }
    }

    if (activeBigCartelSubTab === 'products') {
      const productsRes = await fetchBigCartel('products', bigCartelData.store.id);
      bigCartelData.products = productsRes.data || [];
      renderBigCartelProducts(bigCartelData.products, productsRes.included);
    } else {
      const ordersRes = await fetchAllBigCartelOrders(bigCartelData.store.id);
      bigCartelData.orders = ordersRes.data || [];
      bigCartelData.included = ordersRes.included || [];
      cacheBigCartelOrders(bigCartelData.orders, bigCartelData.included);
      renderBigCartelOrders(bigCartelData.orders, bigCartelData.included);
      await syncBigCartelShippingPaid(bigCartelData.orders);
    }
  } catch (e) {
    console.error('Error loading Big Cartel data:', e);
    showToast('Failed to load Big Cartel data: ' + e.message, 'err');
    const msg = e.message === 'Failed to fetch'
      ? 'CORS error: Check Big Cartel API or browser extensions.'
      : e.message;
    if (activeBigCartelSubTab === 'products') {
      container.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:3rem; color:var(--red);">Failed to load products: ${escapeHtml(msg)}</div>`;
    } else {
      if (!bigCartelData.orders || bigCartelData.orders.length === 0) {
        list.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:3rem; color:var(--red);">Failed to load orders: ${escapeHtml(msg)}</td></tr>`;
      }
    }
  }
}

function renderBigCartelStoreDetails(store) {
  if (!store) return;
  $('bc-store-card').style.display = 'block';
  $('bc-store-name').textContent = store.attributes.store_name || store.attributes.subdomain;
  const planName = store.relationships?.plan?.data?.id || 'Platinum';
  const planClass = planName.toLowerCase();
  $('bc-store-plan').innerHTML = `<span class="plan-badge ${planClass}">${planName}</span>`;
  $('bc-store-currency').textContent = store.relationships?.currency?.data?.id || 'CAD';
  $('bc-store-email').textContent = store.attributes.contact_email || '—';

  const link = $('bc-store-url');
  link.href = store.attributes.url || `https://${store.attributes.subdomain}.bigcartel.com`;
  link.textContent = store.attributes.url || `${store.attributes.subdomain}.bigcartel.com`;
}

function renderBigCartelProducts(products, included = []) {
  const container = $('bc-products-grid');
  container.innerHTML = '';

  if (!products || products.length === 0) {
    container.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:3rem; color:var(--text3);">No products found in this store.</div>';
    return;
  }

  const imgLookup = {};
  const optLookup = {};
  if (included && included.length > 0) {
    included.forEach(item => {
      if (item.type === 'product_images') {
        imgLookup[item.id] = item.attributes.url;
      }
      if (item.type === 'product_options') {
        optLookup[item.id] = item.attributes;
      }
    });
  }

  products.forEach(p => {
    const attr = p.attributes || {};
    let imgUrl = attr.primary_image_url;
    if (!imgUrl && p.relationships?.images?.data?.length > 0) {
      const primaryImgId = p.relationships.images.data[0].id;
      imgUrl = imgLookup[primaryImgId];
    }
    imgUrl = imgUrl || 'public/logo.png';

    let statusClass = 'bc-badge active';
    let statusLabel = attr.status || 'active';
    if (attr.status === 'hidden') statusClass = 'bc-badge hidden';
    if (attr.status === 'sold_out') statusClass = 'bc-badge sold_out';

    let optionsListHtml = '';
    let totalStock = 0;
    let hasStockTracking = false;

    if (p.relationships?.options?.data?.length > 0) {
      p.relationships.options.data.forEach(optRef => {
        const opt = optLookup[optRef.id];
        if (opt) {
          const price = parseFloat(opt.price || attr.default_price || 0).toFixed(2);
          const quantity = opt.quantity != null ? opt.quantity : '∞';
          const sold = opt.sold || 0;
          if (opt.quantity != null) {
            totalStock += opt.quantity;
            hasStockTracking = true;
          }
          optionsListHtml += `
            <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text2); margin-top:2px; font-family:'DM Mono', monospace;">
              <span>${escapeHTML(opt.name || 'Default')}</span>
              <span>$${price} (Stock: ${quantity} | Sold: ${sold})</span>
            </div>
          `;
        }
      });
    }

    const price = parseFloat(attr.default_price || 0).toFixed(2);

    const card = document.createElement('div');
    card.className = 'bc-card';
    card.innerHTML = `
      <div class="bc-img-wrap">
        <img class="bc-img" src="${imgUrl}" alt="${escapeHTML(attr.name)}" loading="lazy">
      </div>
      <div class="bc-info">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
          <h3 class="bc-title">${escapeHTML(attr.name)}</h3>
          <span class="${statusClass}">${statusLabel}</span>
        </div>
        <div class="bc-price">$${price} CAD</div>
        <div style="border-top:1px dashed var(--border); padding-top:6px; margin-top:4px;">
          <div style="font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:var(--text3); margin-bottom:4px;">Pricing & Options</div>
          ${optionsListHtml}
        </div>
        <div class="bc-meta-row" style="margin-top:10px; font-size:11px;">
          <span>Category: ${escapeHTML((attr.category_names && attr.category_names[0]) || 'Books')}</span>
          <span>Stock: ${hasStockTracking ? totalStock : '∞'}</span>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

function extractBigCartelCustomerName(attr) {
  if (!attr) return '—';
  if (attr.customer_name && attr.customer_name.trim()) return attr.customer_name.trim();
  if (attr.buyer_name && attr.buyer_name.trim()) return attr.buyer_name.trim();
  if (attr.shipping_name && attr.shipping_name.trim()) return attr.shipping_name.trim();
  if (attr.billing_name && attr.billing_name.trim()) return attr.billing_name.trim();
  if (attr.name && attr.name.trim()) return attr.name.trim();
  
  const first = attr.buyer_first_name || attr.customer_first_name || attr.first_name || attr.shipping_first_name || '';
  const last = attr.buyer_last_name || attr.customer_last_name || attr.last_name || attr.shipping_last_name || '';
  const fullName = `${first} ${last}`.trim();
  if (fullName) return fullName;

  return attr.buyer_email || attr.customer_email || attr.email || '—';
}

function extractBigCartelOrderItems(order, included = [], customBooks = null) {
  if (!order) return '—';
  const attr = order.attributes || order;
  const items = [];

  const formatItemObj = (item) => {
    if (!item) return null;
    const itemAttr = item.attributes || item;
    const name = itemAttr.product_name ||
                 itemAttr.item_option_name ||
                 itemAttr.option_name ||
                 itemAttr.product_title ||
                 (itemAttr.product && (itemAttr.product.name || itemAttr.product.title)) ||
                 itemAttr.name ||
                 itemAttr.title ||
                 itemAttr.description;
    const qty = itemAttr.quantity || itemAttr.qty || 1;
    if (name) return `${escapeHTML(name)} x${qty}`;
    return null;
  };

  // 1. Direct array embedded on attributes or order object
  const rawItems = attr.line_items || attr.items || attr.order_items || attr.order_lines || attr.cart || attr.products;
  if (Array.isArray(rawItems) && rawItems.length > 0) {
    rawItems.forEach(item => {
      const formatted = formatItemObj(item);
      if (formatted) items.push(formatted);
    });
    if (items.length > 0) return items.join('<br>');
  }

  // 2. Build lookup index from JSON:API included array
  const itemLookup = {};
  if (Array.isArray(included) && included.length > 0) {
    included.forEach(inc => {
      if (inc && inc.id) {
        itemLookup[String(inc.id)] = inc;
      }
    });
  }

  const relItems = order.relationships?.items?.data ||
                   order.relationships?.line_items?.data ||
                   order.relationships?.order_items?.data ||
                   order.relationships?.products?.data || [];
  if (Array.isArray(relItems) && relItems.length > 0) {
    relItems.forEach(ref => {
      const incItem = itemLookup[String(ref.id)];
      if (incItem) {
        const formatted = formatItemObj(incItem);
        if (formatted) items.push(formatted);
      }
    });
    if (items.length > 0) return items.join('<br>');
  }

  // 3. Fallback: match order ID in included items attributes or relationships
  if (Array.isArray(included) && included.length > 0) {
    included.forEach(inc => {
      const orderRef = inc.relationships?.order?.data?.id || inc.attributes?.order_id || inc.order_id;
      if (String(orderRef) === String(order.id)) {
        const formatted = formatItemObj(inc);
        if (formatted) items.push(formatted);
      }
    });
    if (items.length > 0) return items.join('<br>');
  }

  // 4. Smart Price-Based Catalog Deduction Fallback
  const total = parseFloat(attr.total || 0);
  const tax = parseFloat(attr.tax_total || 0);
  const shipping = parseFloat(attr.shipping_total || 0);
  const netMerch = Math.max(0, total - tax - shipping);

  if (netMerch > 0) {
    const booksMap = customBooks || (typeof BOOKS !== 'undefined' ? BOOKS : {});
    const catalogBooks = Object.values(booksMap).filter(b => b && b.listPrice && parseFloat(b.listPrice) > 0);

    for (const book of catalogBooks) {
      const price = parseFloat(book.listPrice);
      if (price > 0) {
        const qtyRatio = netMerch / price;
        const roundedQty = Math.round(qtyRatio);
        if (Math.abs(qtyRatio - roundedQty) < 0.05 && roundedQty > 0) {
          items.push(`${escapeHTML(book.title)} x${roundedQty}`);
          break;
        }
      }
    }
    if (items.length > 0) return items.join('<br>');
  }

  return '—';
}

function matchBigCartelOrderToCatalog(order, included = [], customBooks = null) {
  const booksMap = customBooks || (typeof BOOKS !== 'undefined' ? BOOKS : {});
  const catalogBooks = Object.values(booksMap);
  const catalogTitles = catalogBooks.map(b => (b.title || '').toLowerCase().trim()).filter(Boolean);
  
  if (catalogTitles.length === 0) {
    return { matched: false, matchedBooks: [] };
  }

  const matchedBooks = [];

  const itemsText = extractBigCartelOrderItems(order, included, booksMap);
  if (itemsText && itemsText !== '—') {
    catalogBooks.forEach(b => {
      const titleLower = (b.title || '').toLowerCase().trim();
      if (titleLower && itemsText.toLowerCase().includes(titleLower)) {
        if (!matchedBooks.includes(b.title)) matchedBooks.push(b.title);
      }
    });
  }

  return {
    matched: matchedBooks.length > 0,
    matchedBooks: matchedBooks
  };
}

function formatBigCartelOrderAddress(order, included = []) {
  if (!order) return 'No address data available';
  const addr = extractBigCartelAddress(order, order.id, included);

  const lines = [addr.name];
  if (addr.company) lines.push(addr.company);
  if (addr.street1) lines.push(addr.street1);
  if (addr.street2) lines.push(addr.street2);

  const cityState = [addr.city, addr.state].filter(Boolean).join(', ');
  const cityStateZip = [cityState, addr.zip].filter(Boolean).join(' ');
  if (cityStateZip) lines.push(cityStateZip);
  if (addr.country) lines.push(addr.country);

  if (addr.phone) lines.push(`Phone: ${addr.phone}`);
  const attr = order.attributes || order;
  const email = attr.buyer_email || attr.customer_email || attr.email || '';
  if (email) lines.push(`Email: ${email}`);

  return lines.join('\n');
}

function copyBigCartelOrderAddress(orderId) {
  const orders = (bigCartelData && bigCartelData.orders && bigCartelData.orders.length > 0)
    ? bigCartelData.orders
    : (loadCachedBigCartelOrders()?.orders || []);
  const included = (bigCartelData && bigCartelData.included)
    ? bigCartelData.included
    : (loadCachedBigCartelOrders()?.included || []);

  const order = orders.find(o => String(o.id) === String(orderId));
  if (!order) {
    showToast('Order details not found', 'warn');
    return;
  }

  const text = formatBigCartelOrderAddress(order, included);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('✓ Shipping address copied to clipboard', 'ok');
    }).catch(() => {
      showToast('Failed to copy to clipboard', 'err');
    });
  } else {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('✓ Shipping address copied to clipboard', 'ok');
  }
}

function openBigCartelAddressPreview(orderId) {
  const orders = (bigCartelData && bigCartelData.orders && bigCartelData.orders.length > 0)
    ? bigCartelData.orders
    : (loadCachedBigCartelOrders()?.orders || []);
  const included = (bigCartelData && bigCartelData.included)
    ? bigCartelData.included
    : (loadCachedBigCartelOrders()?.included || []);

  const order = orders.find(o => String(o.id) === String(orderId));
  if (!order) {
    showToast('Order details not found', 'warn');
    return;
  }

  const attr = order.attributes || {};
  const addr = extractBigCartelAddress(order, orderId, included);
  const email = attr.buyer_email || attr.customer_email || attr.email || attr.shipping_email || '—';

  const subtitle = $('bc-addr-order-subtitle');
  const nameEl = $('bc-addr-name');
  const linesEl = $('bc-addr-lines');
  const phoneEl = $('bc-addr-phone');
  const emailEl = $('bc-addr-email');

  if (subtitle) subtitle.textContent = `Order #${orderId} • Placed ${attr.created_at ? new Date(attr.created_at).toLocaleDateString() : ''}`;
  if (nameEl) nameEl.textContent = addr.name;
  if (linesEl) {
    const addrParts = [addr.company, addr.street1, addr.street2, [addr.city, addr.state, addr.zip].filter(Boolean).join(', '), addr.country].filter(Boolean);
    linesEl.innerHTML = addrParts.join('<br>') || 'No street address provided';
  }
  if (phoneEl) phoneEl.textContent = `Phone: ${addr.phone || '—'}`;
  if (emailEl) emailEl.textContent = `Email: ${email}`;

  const copyBtn = $('bc-addr-copy-btn');
  if (copyBtn) {
    copyBtn.onclick = () => copyBigCartelOrderAddress(orderId);
  }

  const shipBtn = $('bc-addr-ship-btn');
  if (shipBtn) {
    shipBtn.onclick = () => {
      closeM('bc-address-preview');
      prefillShippingFromBigCartelOrder(orderId);
    };
  }

  openM('bc-address-preview');
}

function cacheBigCartelOrders(orders, included) {
  try {
    localStorage.setItem('lm-bigcartel-orders-cache', JSON.stringify({
      timestamp: Date.now(),
      orders: orders || [],
      included: included || []
    }));
  } catch (e) {
    console.warn('Failed to cache Big Cartel orders to localStorage', e);
  }
}

function loadCachedBigCartelOrders() {
  try {
    const raw = localStorage.getItem('lm-bigcartel-orders-cache');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function getBigCartelIncluded() {
  if (typeof bigCartelData !== 'undefined' && bigCartelData && Array.isArray(bigCartelData.included) && bigCartelData.included.length > 0) {
    return bigCartelData.included;
  }
  const cached = typeof loadCachedBigCartelOrders === 'function' ? loadCachedBigCartelOrders() : null;
  return (cached && cached.included) || [];
}

function getCachedBigCartelOrder(orderId) {
  const key = normalizeShippingOrderNumber(orderId) || String(orderId || '');
  const orders = (typeof bigCartelData !== 'undefined' && bigCartelData && bigCartelData.orders && bigCartelData.orders.length > 0)
    ? bigCartelData.orders
    : (loadCachedBigCartelOrders()?.orders || []);
  return orders.find(o => String(o.id) === String(orderId)
    || normalizeShippingOrderNumber(o.id) === key) || null;
}

/**
 * "Is this sale in my ledger?" — the one thing the orders table never said.
 *
 * Read off the last gap check rather than recomputed per row, so the table stays
 * cheap; when no check has run yet the badge is omitted entirely rather than
 * claiming an order is fine on no evidence.
 */
function ledgerBadgeHtml(order) {
  if (!_bcGapResult) return '';
  const num = bigCartelOrderNumber(order);
  if (!num) return '';
  if (isCancelledStatus(order)) return '';
  const missing = (_bcGapResult.missing || []).some(gap => sameOrderNumber(gap.num, num));
  return missing
    ? '<br><span class="bc-match-pill unmatched" title="This sale has never been recorded — no stock was deducted">⚠️ Not in ledger</span>'
    : '<br><span class="bc-match-pill matched" title="Recorded in your ledger">✓ In ledger</span>';
}

function renderBigCartelOrders(orders, included = []) {
  const list = $('bc-orders-list');
  list.innerHTML = '';

  if (!orders || orders.length === 0) {
    list.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:3rem; color:var(--text3);">No orders found.</td></tr>';
    return;
  }

  orders.forEach(o => {
    const attr = o.attributes || {};
    const dateStr = attr.created_at ? new Date(attr.created_at).toLocaleDateString() : '—';
    const customer = extractBigCartelCustomerName(attr);
    const email = attr.buyer_email || attr.customer_email || attr.email || attr.shipping_email || '';

    let statusPill = 'pill gray';
    if (attr.status === 'completed') statusPill = 'pill green';
    if (attr.status === 'pending') statusPill = 'pill gold';
    if (attr.status === 'cancelled') statusPill = 'pill red';

    const matchInfo = matchBigCartelOrderToCatalog(o, included);
    let matchPillHtml = '';
    if (matchInfo.matched) {
      matchPillHtml = `<br><span class="bc-match-pill matched" title="Matches catalog inventory">✓ Matched: ${escapeHTML(matchInfo.matchedBooks.join(', '))}</span>`;
    } else {
      matchPillHtml = `<br><span class="bc-match-pill unmatched" title="Product is not linked to catalog book">⚠️ Unmatched</span>`;
    }

    // Whether this sale is in the ledger at all — the fact the table never
    // showed. Buying a label for an order that was never recorded is how a sale
    // ends up with postage, a customer and no order behind it.
    matchPillHtml += ledgerBadgeHtml(o);

    const itemsHtml = extractBigCartelOrderItems(o, included) + matchPillHtml;

    const total = parseFloat(attr.total || 0).toFixed(2);
    const tax = parseFloat(attr.tax_total || 0).toFixed(2);
    const shipping = parseFloat(attr.shipping_total || 0).toFixed(2);

    const row = document.createElement('tr');
    row.innerHTML = `
      <td style="font-family:'DM Mono', monospace; font-size:11px;">#${escapeHTML(o.id)}</td>
      <td>${dateStr}</td>
      <td style="font-weight:600;"><a class="bc-customer-link" onclick="openBigCartelAddressPreview('${o.id}')" title="Click to view full shipping address">${escapeHTML(customer)}</a>${email ? `<br><span style="font-size:11px; color:var(--text3); font-weight:normal;">${escapeHTML(email)}</span>` : ''}</td>
      <td style="font-size:12px; line-height:1.45;">${itemsHtml}</td>
      <td class="r" style="font-family:'DM Mono', monospace;">$${tax}</td>
      <td class="r" style="font-family:'DM Mono', monospace;">$${shipping}</td>
      <td class="r" style="font-family:'DM Mono', monospace; font-weight:700; color:var(--gold);">$${total}</td>
      <td><span class="${statusPill}" style="font-size:10px; padding:3px 8px;">${attr.status || 'unknown'}</span></td>
      <td class="r" style="white-space:nowrap;">
        <button class="btn sm" onclick="copyBigCartelOrderAddress('${o.id}')" title="Copy recipient shipping address to clipboard" style="margin-right:4px;">
          📋 Copy
        </button>
        <button class="btn gold sm" onclick="prefillShippingFromBigCartelOrder('${o.id}')" style="margin:0; display:inline-flex; align-items:center; gap:4px;">
          <span>📦</span> Ship
        </button>
      </td>
    `;
    list.appendChild(row);
  });
}

function prefillShippingFromBigCartelOrder(orderId) {
  const orders = (bigCartelData && bigCartelData.orders && bigCartelData.orders.length > 0)
    ? bigCartelData.orders
    : (loadCachedBigCartelOrders()?.orders || []);
  const order = orders.find(o => String(o.id) === String(orderId));
  if (!order) {
    showToast('Order details not found', 'err');
    return;
  }

  const addr = extractBigCartelAddress(order, orderId, getBigCartelIncluded());

  // Populate the fields on the Shipping Tab
  $('st-name').value = addr.name;
  $('st-company').value = addr.company;
  $('st-phone').value = getFallbackShippingPhone(addr.phone);
  $('st-street1').value = addr.street1;
  $('st-street2').value = addr.street2;
  $('st-city').value = addr.city;
  $('st-state').value = addr.state;
  $('st-zip').value = addr.zip;

  // Set the country dropdown. A country the storefront sent but this app cannot
  // place is called out rather than quietly swapped for the United States —
  // buying a US label for an order bound elsewhere is worse than stopping.
  const countrySelect = $('st-country');
  if (countrySelect) {
    const optionExists = addr.country
      && Array.from(countrySelect.options).some(opt => opt.value === addr.country);
    if (optionExists) {
      countrySelect.value = addr.country;
    } else if (addr.countryRaw) {
      showToast(`“${addr.countryRaw}” isn’t a country we recognize — pick the destination country before buying a label.`, 'warn');
    }
  }

  // Link the order number to the shipping prefill dataset so reconciliation can trace it
  const select = $('ship-prefill-dest');
  if (select) {
    select.dataset.orderNumber = normalizeShippingOrderNumber(orderId);
    select.value = ''; // Clear select dropdown visual state
  }

  // Switch to the Shipping tab
  switchTab('shipping');

  if (!$('st-phone').value) {
    hydrateShippingDestinationPhone(orderId);
  }

  showToast(`✓ Populated shipping details for Order #${orderId}`);
}

function switchBigCartelSubTab(tabName) {
  activeBigCartelSubTab = tabName;

  const btnProducts = $('bc-btn-subtab-products');
  const btnOrders = $('bc-btn-subtab-orders');
  const secProducts = $('bc-sec-products');
  const secOrders = $('bc-sec-orders');

  if (tabName === 'products') {
    btnProducts.classList.add('active');
    btnOrders.classList.remove('active');
    secProducts.style.display = 'block';
    secOrders.style.display = 'none';
  } else {
    btnProducts.classList.remove('active');
    btnOrders.classList.add('active');
    secProducts.style.display = 'none';
    secOrders.style.display = 'block';
  }

  loadBigCartelData();
}

const BIG_CARTEL_ORDER_INCLUDES = 'items,customer,shipping_address';

function mergeBigCartelIncluded(target, incoming) {
  if (!Array.isArray(incoming) || incoming.length === 0) return target;
  const seen = new Set(target.map(i => `${i?.type || ''}:${i?.id || ''}`));
  incoming.forEach(item => {
    if (!item) return;
    const key = `${item.type || ''}:${item.id || ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    target.push(item);
  });
  return target;
}

async function fetchAllBigCartelOrders(storeId) {
  let allOrders = [];
  const allIncluded = [];
  let limit = 100;
  let offset = 0;
  let hasMore = true;
  let page = 1;
  let maxPages = 5;
  let includes = BIG_CARTEL_ORDER_INCLUDES;

  while (hasMore && page <= maxPages) {
    let res;
    try {
      res = await fetchBigCartel(`orders?include=${includes}&page[limit]=${limit}&page[offset]=${offset}`, storeId);
    } catch (e) {
      // Stores that reject the richer include list still need to load: retry with items only.
      if (includes !== 'items') {
        console.warn('Big Cartel rejected the extended include list, retrying with items only', e);
        includes = 'items';
        continue;
      }
      throw e;
    }
    if (res && res.data && res.data.length > 0) {
      allOrders = allOrders.concat(res.data);
      mergeBigCartelIncluded(allIncluded, res.included);
      if (res.data.length < limit) {
        hasMore = false;
      } else {
        offset += limit;
        page++;
      }
    } else {
      hasMore = false;
    }
  }
  return { data: allOrders, included: allIncluded };
}

async function fetchBigCartelOrderContact(orderId) {
  const rawId = String(orderId || '').trim().replace(/^#/, '');
  if (!rawId) return null;

  let accountId = bigCartelData?.store?.id || '';
  if (!accountId) {
    const accountsRes = await fetchBigCartel('');
    if (accountsRes?.data?.length) {
      const subdomain = (await loadBigCartelConfig()).subdomain;
      bigCartelData.store = accountsRes.data.find(acc => acc.attributes?.subdomain === subdomain) || accountsRes.data[0];
      accountId = bigCartelData.store?.id || '';
    }
  }
  if (!accountId) return null;

  return fetchBigCartel(`orders/${encodeURIComponent(rawId)}?include=customer,shipping_address`, accountId);
}

function rememberBigCartelDestinationPhone(orderId, phone) {
  const cleanPhone = getFallbackShippingPhone(phone);
  if (!cleanPhone) return;
  const key = normalizeShippingOrderNumber(orderId) || String(orderId || '');

  const stampOrder = (order) => {
    if (!order) return false;
    if (String(order.id) !== String(orderId) && normalizeShippingOrderNumber(order.id) !== key) return false;
    order.attributes = order.attributes || {};
    order.attributes.shipping_phone = order.attributes.shipping_phone || cleanPhone;
    return true;
  };

  if (typeof bigCartelData !== 'undefined' && Array.isArray(bigCartelData?.orders)) {
    bigCartelData.orders.forEach(stampOrder);
  }

  const cached = loadCachedBigCartelOrders();
  if (cached && Array.isArray(cached.orders)) {
    let touched = false;
    cached.orders.forEach(o => { if (stampOrder(o)) touched = true; });
    if (touched) cacheBigCartelOrders(cached.orders, cached.included || []);
  }

  // Keep the already-rendered picker entries in sync so re-selecting fills the phone.
  _shippoDestMasterList.forEach(item => {
    if (normalizeShippingOrderNumber(item.orderNumber) !== key) return;
    try {
      const addr = JSON.parse(item.value);
      if (getFallbackShippingPhone(addr.phone)) return;
      addr.phone = cleanPhone;
      item.value = JSON.stringify(addr);
    } catch (_) {
      // A malformed entry just misses the cache refresh; the live field is already filled.
    }
  });
}

async function hydrateShippingDestinationPhone(orderId) {
  const phoneEl = $('st-phone');
  if (!phoneEl || phoneEl.value.trim() || !orderId) return;
  const key = normalizeShippingOrderNumber(orderId);
  if (!key) return;

  try {
    const res = await fetchBigCartelOrderContact(orderId);
    const order = res?.data || getCachedBigCartelOrder(orderId);
    if (!order) return;

    const addr = extractBigCartelAddress(order, orderId, res?.included || getBigCartelIncluded());
    const phone = getFallbackShippingPhone(addr.phone);
    if (!phone) return;

    rememberBigCartelDestinationPhone(orderId, phone);

    // The user may have switched destination or typed a number while we were waiting.
    const select = $('ship-prefill-dest');
    if (select && normalizeShippingOrderNumber(select.dataset.orderNumber) !== key) return;
    if (phoneEl.value.trim()) return;

    phoneEl.value = phone;
    showToast('✓ Recipient phone pulled from Big Cartel');
  } catch (e) {
    console.warn('Big Cartel phone lookup failed', e);
  }
}

// ── ORDERS THE LEDGER NEVER RECEIVED ────────────────────────────────────
//
// The Gmail scan is a lossy intake path: a confirmation email can be filtered,
// deleted, or simply older than the scan window, and when it is, the sale exists
// nowhere in this app. No history row, no stock deduction, no destination for a
// label to link to. The storefront knew about it the whole time — this section
// is the comparison that turns that knowledge into a fix.
//
// Everything here is a thin shell around src/lib/bigcartel-ledger-gap.js, which
// holds the rules, and around commitRecoveredWebsiteOrder() in main.js, which
// already owns writing a website order to the ledger. No new ledger-mutation
// code lives here on purpose.

/** Storefront statuses that are not owed a ledger row. Mirrors the pure module's rule. */
function isCancelledStatus(order) {
  const status = String(order?.attributes?.status || '').trim().toLowerCase();
  return status === 'cancelled' || status === 'canceled' || status === 'voided' || status === 'abandoned';
}

const BC_GAP_CACHE_KEY = 'lm-bc-gap-cache';
const BC_GAP_DISMISSED_KEY = 'lm-bc-gap-dismissed';
const BC_GAP_MAX_AGE_MS = 6 * 60 * 60 * 1000;

let _bcGapResult = null;
let _bcGapConflicts = { renumber: [], duplicate: [] };
let _bcGapChecking = false;

function readBcGapDismissed() {
  try {
    const raw = JSON.parse(localStorage.getItem(BC_GAP_DISMISSED_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch (e) { return []; }
}

function writeBcGapDismissed(nums) {
  try { localStorage.setItem(BC_GAP_DISMISSED_KEY, JSON.stringify(nums)); } catch (e) { /* storage full or blocked */ }
}

function readBcGapCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(BC_GAP_CACHE_KEY) || 'null');
    if (!raw || !raw.checkedAt) return null;
    return raw;
  } catch (e) { return null; }
}

function writeBcGapCache(payload) {
  try { localStorage.setItem(BC_GAP_CACHE_KEY, JSON.stringify(payload)); } catch (e) { /* storage full or blocked */ }
}

/**
 * Every order number the app already accounts for.
 *
 * getShippingReconciliationOrders() already unions applied history across all
 * books with the not-yet-applied Gmail queue, which is exactly the set that
 * matters. The scan memory's applied list is added on top: it survives a book
 * being removed from view and records orders the publisher chose to record
 * without a history row surviving, so leaving it out would offer to add an
 * order for the second time.
 */
function bigCartelLedgerNumbers() {
  const nums = new Set();
  getShippingReconciliationOrders().forEach(order => {
    const num = normalizeShippingOrderNumber(order.num || order.orderNum);
    if (num) nums.add(num);
  });
  const mem = getScanMemory();
  (mem.appliedNums || []).forEach(value => {
    const num = normalizeShippingOrderNumber(value);
    if (num) nums.add(num);
  });
  return Array.from(nums);
}

/** Every website history row across every book, for the placeholder repair scan. */
function allWebsiteLedgerEntries() {
  const entries = [];
  Object.values(states).forEach(state => {
    (state?.hist || []).forEach(entry => {
      if (entry && entry.chan === 'Website') entries.push(entry);
    });
  });
  return entries;
}

/** Resolve the connected store once, so both the gap check and the shipping sync can use it. */
async function ensureBigCartelStore() {
  if (bigCartelData.store) return bigCartelData.store;
  const config = await loadBigCartelConfig();
  const accountsRes = await fetchBigCartel('');
  if (accountsRes.data && accountsRes.data.length > 0) {
    bigCartelData.store = accountsRes.data.find(acc => acc.attributes.subdomain === config.subdomain) || accountsRes.data[0];
  }
  if (!bigCartelData.store) throw new Error('Big Cartel store info not found.');
  return bigCartelData.store;
}

function bigCartelConfigured(config) {
  return !!(config && config.subdomain && config.username && config.password);
}

/**
 * Compare the storefront's orders against the ledger.
 *
 * `silent` is for the automatic check that runs when the app opens: it must
 * never interrupt with a toast or leave a spinner behind if the store is not
 * configured or the network is down. The button passes silent:false and gets
 * the full reporting.
 */
async function checkBigCartelLedgerGaps({ silent = false } = {}) {
  if (_bcGapChecking) return _bcGapResult;
  const config = await loadBigCartelConfig();
  if (!bigCartelConfigured(config)) {
    if (!silent) showToast('⚠️ Big Cartel is not configured. Add your credentials first.', 'warn');
    return null;
  }
  if (!sheetsUrl) {
    if (!silent) showToast('Connect Google Sheets first — it proxies the Big Cartel API.', 'warn');
    return null;
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    if (!silent) showToast('You are offline — showing the last check.', 'warn');
    return _bcGapResult;
  }

  _bcGapChecking = true;
  const btn = $('bc-gap-check-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Checking…'; }
  try {
    const store = await ensureBigCartelStore();
    const ordersRes = await fetchAllBigCartelOrders(store.id);
    const bcOrders = ordersRes.data || [];
    const included = ordersRes.included || [];
    bigCartelData.orders = bcOrders;
    cacheBigCartelOrders(bcOrders, included);

    _bcGapResult = findLedgerGaps(bcOrders, included, {
      ledgerNumbers: bigCartelLedgerNumbers(),
      books: BOOKS,
      dismissedNums: readBcGapDismissed(),
    });
    _bcGapConflicts = findRecoveredOrderConflicts(bcOrders, allWebsiteLedgerEntries());
    writeBcGapCache({ checkedAt: Date.now(), result: _bcGapResult, conflicts: _bcGapConflicts });

    renderBigCartelLedgerGaps();
    renderBigCartelGapBadge();
    if (!silent) {
      const n = _bcGapResult.missing.length;
      showToast(n
        ? `⚠️ ${n} Big Cartel order${n === 1 ? '' : 's'} missing from your ledger`
        : '✓ Every Big Cartel order is in your ledger', n ? 'warn' : 'ok');
    }
    return _bcGapResult;
  } catch (e) {
    console.error('Big Cartel ledger gap check failed:', e);
    if (!silent) showToast('Could not check Big Cartel: ' + e.message, 'err');
    return null;
  } finally {
    _bcGapChecking = false;
    if (btn) { btn.disabled = false; btn.textContent = 'Check for missing orders'; }
  }
}

/**
 * The automatic check, run once when the app has finished loading.
 *
 * Served from cache when a check ran recently, so switching tabs never costs a
 * round trip, and always silent — its whole job is to put a number on the tab
 * badge before anyone thinks to look.
 */
async function autoCheckBigCartelLedgerGaps() {
  const cached = readBcGapCache();
  if (cached?.result && (Date.now() - cached.checkedAt) < BC_GAP_MAX_AGE_MS) {
    // Restored whole, counts included, so the summary line still reports what
    // was actually checked rather than re-deriving it from the missing list.
    _bcGapResult = cached.result;
    _bcGapConflicts = cached.conflicts || { renumber: [], duplicate: [] };
    renderBigCartelLedgerGaps();
    renderBigCartelGapBadge();
    return;
  }
  await checkBigCartelLedgerGaps({ silent: true });
}

/** The count badge on the Big Cartel tab button and the Website orders strip. */
function renderBigCartelGapBadge() {
  const total = (_bcGapResult?.missing?.length || 0)
    + (_bcGapConflicts?.renumber?.length || 0)
    + (_bcGapConflicts?.duplicate?.length || 0);
  document.querySelectorAll('.bc-gap-badge').forEach(node => {
    node.textContent = total ? String(total) : '';
    node.hidden = !total;
  });
  const strip = $('web-bc-gap-strip');
  if (strip) {
    const missing = _bcGapResult?.missing?.length || 0;
    strip.hidden = !missing;
    if (missing) {
      const label = $('web-bc-gap-strip-text');
      if (label) {
        label.textContent = `${missing} Big Cartel order${missing === 1 ? '' : 's'} ${missing === 1 ? 'is' : 'are'} not in your ledger. Stock has not been deducted for ${missing === 1 ? 'it' : 'them'}.`;
      }
    }
  }
}

/** The catalogue as a list. BOOKS is already across the seam; BOOK_LIST would be a second name for the same data. */
function catalogBooks() {
  return Object.values(BOOKS).filter(book => book && book.id);
}

function gapBookOptions(selectedId) {
  return catalogBooks().map(book =>
    `<option value="${escapeHtml(book.id)}"${book.id === selectedId ? ' selected' : ''}>${escapeHtml(book.title)}</option>`
  ).join('');
}

function renderBigCartelLedgerGaps() {
  const panel = $('bc-gap-panel');
  if (!panel) return;
  const summary = $('bc-gap-summary');
  const list = $('bc-gap-list');
  const repairs = $('bc-gap-repairs');
  if (summary) summary.textContent = _bcGapResult ? describeGapSummary(_bcGapResult) : 'Not checked yet.';

  const missing = _bcGapResult?.missing || [];
  if (list) {
    list.innerHTML = missing.length
      ? missing.map(gapRowHtml).join('')
      : `<div class="empty-state" style="padding:1.5rem;">
           <div class="e-icon">✓</div>
           Every Big Cartel order is recorded in your ledger.
           <div style="font-size:11px;color:var(--text3);margin-top:6px;">Nothing to add. Run the check again after your next sale.</div>
         </div>`;
  }

  if (repairs) {
    const rows = [
      ..._bcGapConflicts.renumber.map(c => repairRowHtml(c, 'renumber')),
      ..._bcGapConflicts.duplicate.map(c => repairRowHtml(c, 'duplicate')),
    ];
    repairs.innerHTML = rows.join('');
    const wrap = $('bc-gap-repairs-wrap');
    if (wrap) wrap.hidden = !rows.length;
  }
}

function gapRowHtml(gap) {
  const idSafe = escapeHtml(gap.orderId || gap.num);
  const items = gap.lines.length
    ? gap.lines.map(line => `${escapeHtml(line.title)} ×${line.qty}`).join(', ')
    : 'No items listed by the storefront';
  // A book resolved from the price rather than the product name is a guess, and
  // a guess that moves stock has to say so before it is accepted.
  const guess = gap.confidence === 'price'
    ? '<span class="pill amber" style="font-size:10px;">Book guessed from price — check it</span>'
    : (gap.confidence === 'none' ? '<span class="pill red" style="font-size:10px;">Pick the book</span>' : '');
  return `<div class="bc-gap-row" data-order="${idSafe}">
    <div class="bc-gap-copy">
      <strong>${escapeHtml(gap.num)}</strong>
      <span>${escapeHtml(gap.date || 'Date unknown')} · ${escapeHtml(gap.customer || gap.email || 'Customer')}</span>
      <small>${escapeHtml(items)} · ${escapeHtml(fmt(gap.totalPaid || 0, 'CAD'))} paid</small>
      ${guess}
    </div>
    <div class="bc-gap-decision">
      <label for="bc-gap-book-${idSafe}">Book</label>
      <select id="bc-gap-book-${idSafe}" aria-label="Book sold on order ${escapeHtml(gap.num)}">${gapBookOptions(gap.bookId || catalogBooks()[0]?.id)}</select>
      <label for="bc-gap-qty-${idSafe}">Copies</label>
      <input id="bc-gap-qty-${idSafe}" type="number" min="1" step="1" value="${gap.qty || 1}" aria-label="Copies sold on order ${escapeHtml(gap.num)}">
      <div class="bc-gap-actions">
        <button class="btn sm" type="button" data-order="${idSafe}" onclick="dismissBigCartelGap(this.dataset.order)">Not a sale</button>
        <button class="btn gold sm" type="button" data-order="${idSafe}" onclick="addBigCartelOrderToLedger(this.dataset.order)">Add to ledger</button>
      </div>
    </div>
  </div>`;
}

function repairRowHtml(conflict, kind) {
  const isDuplicate = kind === 'duplicate';
  return `<div class="bc-gap-row bc-gap-repair" data-placeholder="${escapeHtml(conflict.placeholderNum)}">
    <div class="bc-gap-copy">
      <strong>${escapeHtml(conflict.placeholderNum)} → ${escapeHtml(conflict.realNum)}</strong>
      <span>${escapeHtml(conflict.customer || 'Customer')} · ${escapeHtml(conflict.date || 'Date unknown')}</span>
      <small>${isDuplicate
        ? 'This sale is recorded twice — once under a placeholder number and once properly. Stock was deducted twice.'
        : 'Recorded under a placeholder number. Renaming it to the real order number links it to the storefront and stops a second copy being added later.'}</small>
    </div>
    <div class="bc-gap-decision">
      <div class="bc-gap-actions">
        ${isDuplicate
          ? `<button class="btn danger-btn sm" type="button" data-placeholder="${escapeHtml(conflict.placeholderNum)}" onclick="voidPlaceholderDuplicate(this.dataset.placeholder)">Void the duplicate</button>`
          : `<button class="btn gold sm" type="button" data-placeholder="${escapeHtml(conflict.placeholderNum)}" data-real="${escapeHtml(conflict.realNum)}" onclick="renumberPlaceholderOrder(this.dataset.placeholder, this.dataset.real)">Use the real order number</button>`}
      </div>
    </div>
  </div>`;
}

function findGap(orderId) {
  return (_bcGapResult?.missing || []).find(gap =>
    String(gap.orderId) === String(orderId) || sameOrderNumber(gap.num, orderId)
  );
}

/**
 * Add one storefront order to the ledger.
 *
 * The write itself is commitRecoveredWebsiteOrder() in main.js — the same
 * function the shipping worklist's recovery uses, which already handles the
 * stock decrement, the channel stats, the history row, the applied-numbers
 * memory that stops a later Gmail scan double-applying, the Sheets rows, the
 * low-stock warning and the save. Only the entry differs, and that is built by
 * the pure module in the shape applyOne() writes.
 */
async function addBigCartelOrderToLedger(orderId) {
  const gap = findGap(orderId);
  if (!gap) { showToast('That order is no longer in the list — run the check again', 'warn'); return; }
  if (!catalogBooks().length) { showToast('Add a book to your catalogue first', 'warn'); return; }

  const idSafe = gap.orderId || gap.num;
  const bookId = $(`bc-gap-book-${idSafe}`)?.value || gap.bookId;
  const qty = Math.max(1, parseInt($(`bc-gap-qty-${idSafe}`)?.value || String(gap.qty || 1), 10) || 1);
  if (!bookId || !BOOKS[bookId]) { showToast('Choose which book was sold', 'warn'); return; }

  // Guard against the review list being stale: another device, or an earlier
  // click, may have recorded this order since the check ran. Adding it twice is
  // exactly the failure this feature exists to prevent.
  if (bigCartelLedgerNumbers().some(num => sameOrderNumber(num, gap.num))) {
    showToast(`${gap.num} is already in your ledger`, 'warn');
    _bcGapResult.missing = _bcGapResult.missing.filter(item => item !== gap);
    renderBigCartelLedgerGaps();
    renderBigCartelGapBadge();
    return;
  }

  const cached = getCachedBigCartelOrder(gap.orderId) || bigCartelData.orders.find(o => String(o.id) === String(gap.orderId));
  const address = cached ? extractBigCartelAddress(cached, gap.orderId, getBigCartelIncluded()) : {};
  const price = gap.unitPrice != null && gap.unitPrice > 0
    ? gap.unitPrice
    : Number(BOOKS[bookId]?.listPrice || 0);

  let entry;
  try {
    entry = commitRecoveredWebsiteOrder(bookId, { qty, price }, ({ stockAfter }) =>
      buildBigCartelOrderEntry(gap, {
        bookId, qty, price, stockAfter,
        address: { ...address, email: gap.email || address.email },
      }));
  } catch (error) {
    console.error('Big Cartel order add failed', error);
    showToast('Could not add that order. Please try again.', 'err');
    return;
  }

  _bcGapResult.missing = _bcGapResult.missing.filter(item => item !== gap);
  renderBigCartelLedgerGaps();
  renderBigCartelGapBadge();
  scheduleRender();

  // The order exists now, so a label that was stranded in the reconciliation
  // worklist may finally have something to point at. A failure to link is not a
  // failure to save — the order is in the ledger either way.
  let linked = 0;
  try {
    linked = await autoLinkPostageForOrder(entry);
  } catch (error) {
    console.warn('Postage auto-link after Big Cartel add failed', error);
  }
  showToast(linked
    ? `✓ ${entry.num} added and ${linked} label${linked === 1 ? '' : 's'} linked`
    : `✓ ${entry.num} added to ${BOOKS[bookId].title}`);
}

/** Set an order aside as "not a sale to record" without pretending it is in the ledger. */
async function dismissBigCartelGap(orderId) {
  const gap = findGap(orderId);
  if (!gap) return;
  const accepted = await confirmDialog(
    `Leave ${gap.num} out of your ledger?\n\nIt stays on Big Cartel and no stock is deducted. Use this for test orders or copies you handled another way.`,
    { title: 'Not a sale to record', okLabel: 'Leave it out' },
  );
  if (!accepted) return;
  const dismissed = readBcGapDismissed();
  if (!dismissed.includes(gap.num)) dismissed.push(gap.num);
  writeBcGapDismissed(dismissed);
  _bcGapResult.missing = _bcGapResult.missing.filter(item => item !== gap);
  _bcGapResult.skipped = (_bcGapResult.skipped || 0) + 1;
  renderBigCartelLedgerGaps();
  renderBigCartelGapBadge();
  showToast(`${gap.num} left out of the ledger`);
}

/** Put every set-aside order back in the review list. */
async function restoreBigCartelGaps() {
  const dismissed = readBcGapDismissed();
  if (!dismissed.length) { showToast('Nothing has been set aside', 'warn'); return; }
  writeBcGapDismissed([]);
  showToast(`Restored ${dismissed.length} set-aside order${dismissed.length === 1 ? '' : 's'}`);
  await checkBigCartelLedgerGaps({ silent: false });
}

function findLedgerEntryByNumber(num) {
  for (const [bookId, state] of Object.entries(states)) {
    const entry = (state?.hist || []).find(h => h && h.chan === 'Website' && sameOrderNumber(h.num, num));
    if (entry) return { bookId, state, entry };
  }
  return null;
}

/**
 * Give a placeholder row its real storefront order number.
 *
 * A `#RECOV-` row is a real sale carrying an invented number, which is what
 * made this whole situation confusing: the storefront's shipping sync could
 * never find it, its Google Sheets row was a separate row, and a later Gmail
 * scan turning up the real confirmation email would have applied the same sale
 * a second time. Renaming it — number and Sheets id together — collapses the
 * two identities back into one. The old Sheets row is deleted rather than
 * orphaned, or the spreadsheet would keep showing the sale twice.
 */
async function renumberPlaceholderOrder(placeholderNum, realNum) {
  const found = findLedgerEntryByNumber(placeholderNum);
  if (!found) { showToast('That order is no longer in your ledger', 'warn'); return; }
  if (findLedgerEntryByNumber(realNum)) {
    showToast(`${realNum} is already in your ledger — this looks like a duplicate instead`, 'warn');
    return;
  }
  const accepted = await confirmDialog(
    `Rename ${placeholderNum} to ${realNum}?\n\nThis is the same sale. Using the real order number links it to Big Cartel and stops a second copy being added later. Stock is not changed.`,
    { title: 'Use the real order number', okLabel: 'Rename it' },
  );
  if (!accepted) return;

  const { bookId, entry } = found;
  const book = BOOKS[bookId];
  const oldSheetsId = entry.sheetsId;
  const newNum = normalizeShippingOrderNumber(realNum) || realNum;

  entry.num = newNum;
  entry.sheetsId = 'bc-' + newNum.replace(/^#/, '').replace(/[^A-Za-z0-9-]/g, '');
  entry.notes = 'Big Cartel';
  delete entry.recoveredFromPostage;
  entry.renumberedFrom = placeholderNum;

  // Record the real number as seen, so a Gmail scan that finally turns up the
  // original confirmation email does not offer this sale as a new order.
  const mem = getScanMemory();
  if (!mem.appliedNums) mem.appliedNums = [];
  if (!mem.appliedNums.includes(newNum)) mem.appliedNums.push(newNum);
  saveScanMemory(mem);

  if (book) {
    if (oldSheetsId) {
      syncToSheets({ action: 'delete', type: 'order', book: book.title, sheetsId: oldSheetsId });
      syncToSheets({ action: 'delete', type: 'shipping', book: book.title, sheetsId: oldSheetsId + '-shipping' });
    }
    syncToSheets({
      type: 'order', book: book.title, date: entry.date, num: entry.num, chan: 'Website',
      qty: entry.qty, price: entry.price, total: entry.qty * entry.price, stockAfter: entry.after,
      notes: entry.notes, sheetsId: entry.sheetsId, currency: getBookCurrencyCode(book),
    });
    if (entry.shippingPaid > 0) {
      syncToSheets(shippingPurchaseRowPayload(book, getBookCurrencyCode(book), entry));
    }
  }

  await window.saveState(bookId);
  _bcGapConflicts.renumber = _bcGapConflicts.renumber.filter(c => c.placeholderNum !== placeholderNum);
  renderBigCartelLedgerGaps();
  renderBigCartelGapBadge();
  scheduleRender();
  try { await autoLinkPostageForOrder(entry); } catch (e) { console.warn('Postage relink after renumber failed', e); }
  showToast(`✓ ${placeholderNum} is now ${newNum}`);
}

/**
 * Void a placeholder row whose sale is also recorded properly.
 *
 * Stock was deducted twice for one sale, so one row has to go. The placeholder
 * is the one voided — the properly numbered row is the one the storefront, the
 * spreadsheet and any linked postage already agree on. Voiding rather than
 * deleting keeps the correction visible in the history.
 */
async function voidPlaceholderDuplicate(placeholderNum) {
  const found = findLedgerEntryByNumber(placeholderNum);
  if (!found) { showToast('That order is no longer in your ledger', 'warn'); return; }
  const { bookId, state, entry } = found;
  const book = BOOKS[bookId];
  const accepted = await confirmDialog(
    `Void ${placeholderNum}?\n\nThis sale is recorded twice, so ${entry.qty} cop${entry.qty === 1 ? 'y was' : 'ies were'} taken off your stock twice. Voiding this row puts ${entry.qty === 1 ? 'it' : 'them'} back and leaves the properly numbered order in place.`,
    { title: 'Void the duplicate', okLabel: 'Void it' },
  );
  if (!accepted) return;

  entry.voided = true;
  entry.voidedReason = `Duplicate of ${placeholderNum === entry.num ? 'the storefront order' : entry.num}`;
  state.stock = (Number(state.stock) || 0) + (Number(entry.qty) || 0);
  state.sold = Math.max(0, (Number(state.sold) || 0) - (Number(entry.qty) || 0));
  state.revenue = Math.max(0, (Number(state.revenue) || 0) - (Number(entry.qty) || 0) * (Number(entry.price) || 0));
  if (state.chStats && state.chStats['Website']) {
    const ch = state.chStats['Website'];
    ch.txns = Math.max(0, ch.txns - 1);
    ch.units = Math.max(0, ch.units - (Number(entry.qty) || 0));
    ch.revenue = Math.max(0, ch.revenue - (Number(entry.qty) || 0) * (Number(entry.price) || 0));
  }

  if (book && entry.sheetsId) {
    syncToSheets({ action: 'delete', type: 'order', book: book.title, sheetsId: entry.sheetsId });
    syncToSheets({ action: 'delete', type: 'shipping', book: book.title, sheetsId: entry.sheetsId + '-shipping' });
  }
  await window.saveState(bookId);
  _bcGapConflicts.duplicate = _bcGapConflicts.duplicate.filter(c => c.placeholderNum !== placeholderNum);
  renderBigCartelLedgerGaps();
  renderBigCartelGapBadge();
  scheduleRender();
  showToast(`✓ ${placeholderNum} voided — ${entry.qty} cop${entry.qty === 1 ? 'y' : 'ies'} back in stock`);
}

async function syncBigCartelShippingPaid(bcOrders) {
  if (!bcOrders || bcOrders.length === 0) return;

  let updateCount = 0;
  let missingCount = 0;
  const affectedBooks = new Set();

  bcOrders.forEach(bcOrder => {
    const bcId = bcOrder.id;
    const shippingPaid = parseFloat(bcOrder.attributes?.shipping_total || 0);
    let sawLedgerRow = false;

    Object.keys(states).forEach(bookId => {
      const s = states[bookId];
      if (s && Array.isArray(s.hist)) {
        s.hist.forEach(h => {
          if (h && h.chan === 'Website' && sameOrderNumber(h.num, bcId)) {
            sawLedgerRow = true;
            if (!h.manualShippingPaid && h.shippingPaid !== shippingPaid) {
              h.shippingPaid = shippingPaid;
              affectedBooks.add(bookId);
              updateCount++;

              const bookObj = BOOKS[bookId];
              if (bookObj) {
                syncToSheets({
                  type: 'order',
                  book: bookObj.title,
                  date: h.date,
                  num: h.num,
                  chan: h.chan || 'Website',
                  qty: h.qty,
                  price: h.price,
                  total: h.qty * h.price,
                  stockAfter: h.after,
                  notes: h.notes || 'Big Cartel',
                  sheetsId: h.sheetsId,
                  currency: getBookCurrencyCode(bookObj)
                });
                if (h.shippingPaid > 0) {
                  syncToSheets(shippingPurchaseRowPayload(bookObj, getBookCurrencyCode(bookObj), h));
                } else {
                  syncToSheets({ action: 'delete', type: 'shipping', book: bookObj.title, sheetsId: h.sheetsId + '-shipping' });
                }
              }
            }
          }
        });
      }
    });

    // A storefront order with no ledger row anywhere is a sale this app has
    // never recorded — no history, no stock deducted. This loop has always been
    // in a position to notice and always stayed silent, which is exactly how two
    // orders came to have shipping labels and no order behind them.
    if (!sawLedgerRow && !isCancelledStatus(bcOrder) && bigCartelOrderNumber(bcOrder)) missingCount++;
  });

  if (updateCount > 0) {
    for (const bookId of affectedBooks) {
      await window.saveState(bookId);
    }
    showToast(`✓ Auto-synced ${updateCount} shipping costs from Big Cartel`, 'ok');
    renderShippingAnalysisHub();
  }
  if (missingCount > 0) {
    showToast(`⚠️ ${missingCount} Big Cartel order${missingCount === 1 ? '' : 's'} ${missingCount === 1 ? 'is' : 'are'} not in your ledger — open Big Cartel to add ${missingCount === 1 ? 'it' : 'them'}`, 'warn');
  }
}

async function triggerBigCartelShippingSync() {
  const config = await loadBigCartelConfig();
  if (!config.subdomain || !config.username || !config.password) {
    showToast('⚠️ Big Cartel is not configured. Please set credentials in the Big Cartel tab.', 'warn');
    return;
  }

  const btn = document.getElementById('ship-bc-sync-btn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>🔄</span> Syncing...';
  }

  try {
    if (!bigCartelData.store) {
      const accountsRes = await fetchBigCartel('');
      if (accountsRes.data && accountsRes.data.length > 0) {
        bigCartelData.store = accountsRes.data.find(acc => acc.attributes.subdomain === config.subdomain) || accountsRes.data[0];
      }
    }

    if (!bigCartelData.store) {
      throw new Error('Big Cartel store info not found.');
    }

    const ordersRes = await fetchAllBigCartelOrders(bigCartelData.store.id);
    bigCartelData.orders = ordersRes.data || [];

    let updateCount = 0;
    let missingCount = 0;
    const affectedBooks = new Set();

    bigCartelData.orders.forEach(bcOrder => {
      const bcId = bcOrder.id;
      const shippingPaid = parseFloat(bcOrder.attributes?.shipping_total || 0);
      let sawLedgerRow = false;

      Object.keys(states).forEach(bookId => {
        const s = states[bookId];
        if (s && Array.isArray(s.hist)) {
          s.hist.forEach(h => {
            if (h && h.chan === 'Website' && sameOrderNumber(h.num, bcId)) {
              sawLedgerRow = true;
              if (!h.manualShippingPaid && h.shippingPaid !== shippingPaid) {
                h.shippingPaid = shippingPaid;
                affectedBooks.add(bookId);
                updateCount++;

                const bookObj = BOOKS[bookId];
                if (bookObj) {
                  syncToSheets({
                    type: 'order',
                    book: bookObj.title,
                    date: h.date,
                    num: h.num,
                    chan: h.chan || 'Website',
                    qty: h.qty,
                    price: h.price,
                    total: h.qty * h.price,
                    stockAfter: h.after,
                    notes: h.notes || 'Big Cartel',
                    sheetsId: h.sheetsId,
                    currency: getBookCurrencyCode(bookObj)
                  });
                  if (h.shippingPaid > 0) {
                    syncToSheets(shippingPurchaseRowPayload(bookObj, getBookCurrencyCode(bookObj), h));
                  } else {
                    syncToSheets({ action: 'delete', type: 'shipping', book: bookObj.title, sheetsId: h.sheetsId + '-shipping' });
                  }
                }
              }
            }
          });
        }
      });

      if (!sawLedgerRow && !isCancelledStatus(bcOrder) && bigCartelOrderNumber(bcOrder)) missingCount++;
    });

    if (updateCount > 0) {
      for (const bookId of affectedBooks) {
        await window.saveState(bookId);
      }
      showToast(`✓ Synced ${updateCount} shipping costs from Big Cartel`, 'ok');
      renderShippingAnalysisHub();
    } else if (!missingCount) {
      showToast('✓ Shipping costs are already up to date', 'ok');
    }

    // Never report "all up to date" over the top of orders that were never
    // recorded: that reading is what let two sales stay invisible.
    if (missingCount > 0) {
      showToast(`⚠️ ${missingCount} Big Cartel order${missingCount === 1 ? '' : 's'} ${missingCount === 1 ? 'is' : 'are'} not in your ledger — open Big Cartel to add ${missingCount === 1 ? 'it' : 'them'}`, 'warn');
      await checkBigCartelLedgerGaps({ silent: true });
    }
  } catch (e) {
    console.error('Error syncing Big Cartel shipping:', e);
    showToast('Failed to sync Big Cartel shipping: ' + e.message, 'err');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span>🔄</span> Sync Big Cartel Shipping';
    }
  }
}
export {
  addBigCartelOrderToLedger,
  autoCheckBigCartelLedgerGaps,
  checkBigCartelLedgerGaps,
  dismissBigCartelGap,
  renderBigCartelLedgerGaps,
  renumberPlaceholderOrder,
  restoreBigCartelGaps,
  voidPlaceholderDuplicate,
  reconcileApplyBigCartel,
  extractBigCartelAddress,
  loadBigCartelConfig,
  renderBigCartelTab,
  updateBigCartelConnectionUI,
  fetchBigCartel,
  testBigCartelConnection,
  saveBigCartelSettings,
  loadBigCartelData,
  renderBigCartelStoreDetails,
  renderBigCartelProducts,
  extractBigCartelCustomerName,
  extractBigCartelOrderItems,
  matchBigCartelOrderToCatalog,
  formatBigCartelOrderAddress,
  copyBigCartelOrderAddress,
  openBigCartelAddressPreview,
  cacheBigCartelOrders,
  loadCachedBigCartelOrders,
  getBigCartelIncluded,
  getCachedBigCartelOrder,
  renderBigCartelOrders,
  prefillShippingFromBigCartelOrder,
  switchBigCartelSubTab,
  mergeBigCartelIncluded,
  fetchAllBigCartelOrders,
  fetchBigCartelOrderContact,
  rememberBigCartelDestinationPhone,
  hydrateShippingDestinationPhone,
  syncBigCartelShippingPaid,
  triggerBigCartelShippingSync,
  bigCartelData,
};
