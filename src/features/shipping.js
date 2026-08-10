// Shipping — Shippo label buying and rate quoting, the postage/expense
// reconciliation worklist, and the shipping analysis hub (P&L, carrier
// scorecard, region split, weight bands, ledger and insights).
//
// Lifted out of src/main.js as one unit, the same way Open Call was. The
// reconciliation rules already lived in lib/shipping-reconciliation.js; this is
// the API calls, the DOM and the state around them.
//
// Deliberately NOT included, because they belong to the Big Cartel integration
// rather than to shipping: prefillShippingFromBigCartelOrder,
// hydrateShippingDestinationPhone, syncBigCartelShippingPaid and
// triggerBigCartelShippingSync. Shipping should not own a storefront's fetch
// logic. getAllStores stays in main.js for the same reason in reverse — it is a
// consignment concept that shipping merely reads.
//
// The cycle with main.js is safe for the reason set out in
// tests/features-boundary.test.js: nothing here runs at module-evaluation
// time. eslint's no-undef, an error in CI, keeps the import list below honest.
import {
  $,
  BOOKS,
  BOOK_LIST,
  TAX_CENTER,
  _fxRateCache,
  activeBook,
  addLog,
  closeM,
  confirmDialog,
  fetchHistoricalRate,
  fetchLiveRate,
  getAllStores,
  getBook,
  getState,
  isAuthor,
  normalizeCountryCode,
  openM,
  orders,
  renderExpenses,
  renderHist,
  renderOrders,
  saveReceiptToLocalFile,
  saveState,
  sheetsUrl,
  showToast,
  states,
  today,
} from '../main.js';
import {
  extractBigCartelAddress,
  getBigCartelIncluded,
  loadCachedBigCartelOrders,
  hydrateShippingDestinationPhone,
  bigCartelData,
} from './bigcartel.js';
import { renderTaxCenter, saveTaxCenter } from './taxcentre.js';
import { escapeHtml } from '../lib/html.js';
import { csvCell } from '../lib/csv.js';
import { downloadCsv } from '../lib/download.js';
import { fmt, fmtD, roundCents, cadEquivalentForSale } from '../lib/money.js';
import {
  applyShippoExpenseEnrichments,
  enrichShippoExpense,
  linkedShippingSummary,
  normalizeShippingOrderNumber,
  persistManualShippingLink,
  stageShippoExpenseEnrichment,
} from '../lib/shipping-reconciliation.js';
import {
  ADDRESS_FIELD_LABELS,
  SHIPPO_ADDRESSES_V1_URL,
  SHIPPO_VALIDATE_V2_URL,
  addressFromOrder,
  addressSignature,
  addressValidationBlocker,
  buildAddressValidationQuery,
  buildLegacyValidationPayload,
  countryFallbackWarning,
  describeShippoError,
  isDeliverable,
  normalizeAddressVerification,
  orderAddressPatch,
  persistableVerification,
  storedVerificationIsCurrent,
  verificationVerdict,
} from '../lib/address-verification.js';

function getShippingReconciliationOrders() {
  const byNumber = new Map();
  Object.values(states).forEach(state => (state?.hist || []).forEach(history => {
    const number = normalizeShippingOrderNumber(history.num);
    if (number && history.chan === 'Website' && !history.voided) byNumber.set(number, history);
  }));
  (orders || []).forEach(order => {
    const number = normalizeShippingOrderNumber(order.orderNum || order.num);
    if (number && !byNumber.has(number)) byNumber.set(number, { ...order, num: number });
  });
  return Array.from(byNumber.values());
}

function renderOrderShippingSummary(order) {
  const expenses = (TAX_CENTER.businessExpenses || []).filter(expense => String(expense?.ref || '').startsWith('shippo:'));
  const summary = linkedShippingSummary(order, expenses, 1);
  const customerPaidVal = summary.customerPaid ?? Number(order.shippingPaid || order.shipping_total || 0);
  const parts = [];
  if (customerPaidVal > 0) {
    parts.push(`Shipping paid ${fmt(customerPaidVal, 'CAD')}`);
  }
  if (summary.postageBase == null && !order.shipped) {
    parts.push(summary.linkedCount ? 'Postage linked' : 'Postage not linked');
  }
  return parts.length ? `<span class="subtext-mute">${escapeHtml(parts.join(' · '))}</span>` : '';
}

async function backfillShipping() {
  const log = 'log-web';
  const btn = $('backfill-shipping-btn');
  if (!sheetsUrl) {
    showToast('Connect Google Sheets first to scan Gmail', 'warn');
    return;
  }
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Scanning…'; }
  addLog(log, '🔁 Re-scanning Gmail for missing shipping info…', 'ok');

  const daysBack = parseInt(localStorage.getItem('lm-scan-days') || '30');
  let parsed = null;
  try {
    const destUrl = sheetsUrl + (sheetsUrl.includes('?') ? '&' : '?') + 'action=scanGmail&daysBack=' + daysBack;
    const res = await fetch(destUrl, { method: 'GET', mode: 'cors' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    parsed = await res.json();
    if (!parsed || !parsed.ok) throw new Error(parsed?.error || 'Server returned failure');
  } catch (e) {
    addLog(log, `❌ Backfill scan failed: ${e.message}`, 'err');
    if (btn) { btn.disabled = false; btn.textContent = 'Backfill shipping info'; }
    return;
  }

  const norm = (v) => {
    const raw = String(v || '').trim();
    if (!raw) return '';
    const hit = raw.match(/#?[a-z0-9]+-[a-z0-9-]+/i);
    if (hit) {
      const upper = hit[0].toUpperCase();
      return upper.startsWith('#') ? upper : `#${upper}`;
    }
    return raw.toUpperCase();
  };

  const lookup = new Map();
  for (const o of (parsed.orders || [])) {
    const key = norm(o.orderNum);
    if (key && !lookup.has(key)) lookup.set(key, o);
  }

  const fields = ['shipName', 'shipEmail', 'shipAddr1', 'shipAddr2',
    'shipCity', 'shipProvince', 'shipPostal', 'shipCountry'];
  let updated = 0;
  let stillMissing = 0;
  const touchedBooks = new Set();

  for (const bookId of Object.keys(states)) {
    const st = states[bookId];
    if (!st || !Array.isArray(st.hist)) continue;
    for (const h of st.hist) {
      if (h.chan !== 'Website' || h.voided) continue;
      const incompleteAddress = !h.shipName || !h.shipAddr1 || !h.shipCity || !h.shipPostal;
      const incompleteFinancials = !Number(h.shippingPaid || 0) || !Number(h.totalPaid || 0);
      const incomplete = incompleteAddress || incompleteFinancials;
      if (!incomplete) continue;
      const match = lookup.get(norm(h.num));
      if (!match) { stillMissing++; continue; }
      let changed = false;
      for (const f of fields) {
        const incoming = (match[f] || (f === 'shipName' ? match.customer : '') || (f === 'shipEmail' ? match.email : '') || '').trim();
        if (incoming && !h[f]) { h[f] = incoming; changed = true; }
      }
      const financialFields = ['subtotal', 'discountCode', 'discountAmount', 'discountSource',
        'merchandisePaid', 'shippingMethod', 'shippingPaid', 'taxPaid', 'totalPaid'];
      for (const f of financialFields) {
        if (match[f] === undefined || match[f] === null) continue;
        const incoming = f === 'discountCode' || f === 'discountSource' || f === 'shippingMethod'
          ? String(match[f] || '')
          : Number(match[f]) || 0;
        if (h[f] !== incoming) { h[f] = incoming; changed = true; }
      }
      if (match.merchandisePaid !== undefined && Number(h.qty) > 0) {
        const netPrice = Math.round((Number(match.merchandisePaid) / Number(h.qty)) * 100) / 100;
        if (h.price !== netPrice) { h.price = netPrice; changed = true; }
      }
      if (changed) {
        updated++;
        touchedBooks.add(bookId);
      } else {
        stillMissing++;
      }
    }
  }

  await Promise.all(Array.from(touchedBooks).map(bookId => saveState(bookId)));
  renderHist();

  if (updated > 0) {
    addLog(log, `✓ Backfilled shipping info on ${updated} order(s).`, 'ok');
    showToast(`✓ Updated ${updated} order${updated === 1 ? '' : 's'}`);
  } else {
    addLog(log, `📭 No orders updated. ${stillMissing} order(s) still missing info — Gmail email may be older than the ${daysBack}-day scan window or has no parseable address.`, 'warn');
    showToast('No orders updated', 'warn');
  }

  if (btn) { btn.disabled = false; btn.textContent = 'Backfill shipping info'; }
}

function _toggleShippingPanel() { }  // no-op, kept for safety

let _labelOrderIndex = null;

function openLabelModal(histIndex) {
  _labelOrderIndex = histIndex;
  const h = getState().hist[histIndex];
  const book = getBook();
  $('shipping-label-order-info').textContent = `${h.num} · ${book.title} × ${h.qty} · ${fmtD(h.date)}`;
  $('sl-name').value = h.shipName || '';
  $('sl-email').value = h.shipEmail || '';
  $('sl-addr1').value = h.shipAddr1 || '';
  $('sl-addr2').value = h.shipAddr2 || '';
  $('sl-city').value = h.shipCity || '';
  $('sl-province').value = h.shipProvince || '';
  $('sl-postal').value = h.shipPostal || '';
  $('sl-country').value = h.shipCountry || 'Canada';
  updateShippedStatusUI(h);
  openM('shipping-label');
}

function updateShippedStatusUI(h) {
  const status = $('sl-shipped-status');
  const toggleBtn = $('sl-toggle-shipped-btn');
  if (!status || !toggleBtn) return;
  if (h.shipped) {
    status.style.display = '';
    status.innerHTML = `✓ Shipped${h.shippedDate ? ' on ' + fmtD(h.shippedDate) : ''}`;
    toggleBtn.style.display = '';
    toggleBtn.textContent = 'Mark as not shipped';
  } else {
    status.style.display = 'none';
    toggleBtn.style.display = '';
    toggleBtn.textContent = 'Mark as shipped';
  }
}

function toggleShipped() {
  if (_labelOrderIndex == null) return;
  const h = getState().hist[_labelOrderIndex];
  if (h.shipped) {
    delete h.shipped;
    delete h.shippedDate;
  } else {
    h.shipped = true;
    h.shippedDate = today();
  }
  saveState(activeBook);
  updateShippedStatusUI(h);
  renderHist();
}

function printShippingLabel() {
  const h = getState().hist[_labelOrderIndex];

  // Save address to history entry so it's remembered next time
  h.shipName = $('sl-name').value.trim();
  h.shipEmail = $('sl-email').value.trim();
  h.shipAddr1 = $('sl-addr1').value.trim();
  h.shipAddr2 = $('sl-addr2').value.trim();
  h.shipCity = $('sl-city').value.trim();
  h.shipProvince = $('sl-province').value.trim();
  h.shipPostal = $('sl-postal').value.trim();
  h.shipCountry = $('sl-country').value.trim();
  if (!h.shipped) {
    h.shipped = true;
    h.shippedDate = today();
  }
  saveState(activeBook);
  renderHist();

  const ship = {
    name: h.shipName, addr1: h.shipAddr1, addr2: h.shipAddr2,
    city: h.shipCity, province: h.shipProvince, postal: h.shipPostal, country: h.shipCountry
  };

  const fromLines = ['Lyricalmyrical Books', '456 Montrose Ave', 'Toronto, ON  M6G 3H1', 'Canada'];

  const cityLine = [ship.city, ship.province].filter(Boolean).join(', ');
  const cityPostal = [cityLine, ship.postal].filter(Boolean).join('  ');
  const toLines = [ship.addr1, ship.addr2, cityPostal].filter(Boolean);
  const country = (ship.country || '').toUpperCase();

  const esc = escapeHtml;

  const labelHTML = `
  <div class="label">
    <section class="to">
      <div class="kicker">Ship To</div>
      <div class="to-name">${esc(ship.name || '')}</div>
      <div class="to-lines">
        ${toLines.map(l => `<div>${esc(l)}</div>`).join('')}
      </div>
      ${country ? `<div class="to-country">${esc(country)}</div>` : ''}
    </section>

    <section class="from">
      <div class="kicker">From</div>
      <div class="from-lines">
        ${fromLines.map(l => `<div>${esc(l)}</div>`).join('')}
      </div>
    </section>
  </div>`;

  const styles = `
    @page { margin: 0; size: 4in 6in; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { background: #fff; color: #111; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
      font-size: 11pt;
    }
    .label {
      width: 4in; height: 6in;
      display: flex; flex-direction: column;
      color: #111;
    }

    .kicker {
      font-size: 7pt; font-weight: 800;
      letter-spacing: .22em; text-transform: uppercase;
      color: #111; margin-bottom: 8px;
      padding-bottom: 4px;
      border-bottom: 1.5px solid #111;
    }

    .to {
      flex: 1;
      padding: 0.28in 0.3in 0.18in;
    }
    .to-name {
      font-size: 19pt; font-weight: 800;
      letter-spacing: -.01em; line-height: 1.1;
      margin-bottom: 8px;
    }
    .to-lines { font-size: 12pt; line-height: 1.38; color: #111; }
    .to-country {
      margin-top: 8px;
      font-size: 13pt; font-weight: 800;
      letter-spacing: .06em;
    }

    .from {
      padding: 0.18in 0.3in 0.28in;
      border-top: 1px solid #111;
    }
    .from .kicker { border-bottom: none; padding-bottom: 0; margin-bottom: 4px; color: #666; }
    .from-lines { font-size: 8.5pt; line-height: 1.45; color: #444; }

    @media print {
      body { padding: 0; }
      .label { box-shadow: none; }
    }
  `;

  const win = window.open('', '_blank', 'width=620,height=720');
  win.document.write(`<!DOCTYPE html><html><head><title>Label — ${esc(h.num)}</title>
    <meta charset="utf-8">
    <style>${styles}</style>
    </head><body>${labelHTML}</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 350);
  closeM('shipping-label');
}

function shippingPurchaseRowPayload(book, nativeCur, h) {
  const amount = Number(h.shippingPaid || 0) || 0;
  return {
    type: 'shipping',
    book: book.title,
    date: h.date,
    num: h.num,
    chan: 'Website shipping',
    qty: '',
    price: '',
    total: amount,
    stockAfter: h.after,
    notes: `Customer shipping paid${h.num ? ` on ${h.num}` : ''}`,
    sheetsId: (h.sheetsId || `ship-${String(h.num || '').replace(/^#/, '').replace(/[^A-Za-z0-9-]/g, '')}`) + '-shipping',
    currency: nativeCur,
    paymentCurrency: nativeCur,
    paymentAmount: amount,
    convertedTotal: cadEquivalentForSale({ nativeCurrency: nativeCur, totalNative: amount }),
    status: 'OK'
  };
}

const _rateCostCache = new Map();

async function getShippoTxCost(tx, token) {
  if (tx.rate && typeof tx.rate === 'object') {
    return { amount: parseFloat(tx.rate.amount), currency: String(tx.rate.currency || 'USD').toUpperCase() };
  }
  if (tx.rate_amount != null || tx.amount != null) {
    return {
      amount: parseFloat(tx.rate_amount != null ? tx.rate_amount : tx.amount),
      currency: String(tx.rate_currency || tx.currency || 'USD').toUpperCase()
    };
  }
  if (tx.rate && typeof tx.rate === 'string') {
    if (_rateCostCache.has(tx.rate)) return _rateCostCache.get(tx.rate);
    try {
      const r = await fetch(`https://api.goshippo.com/rates/${tx.rate}`, {
        headers: { Authorization: `ShippoToken ${token}`, 'Content-Type': 'application/json' }
      });
      if (r.ok) {
        const rate = await r.json();
        const out = { amount: parseFloat(rate.amount), currency: String(rate.currency || 'USD').toUpperCase() };
        _rateCostCache.set(tx.rate, out);
        return out;
      }
    } catch (_) { /* fall through to NaN */ }
  }
  return { amount: NaN, currency: 'USD' };
}

async function saveShippoLabelLocally(labelUrl, txId) {
  if (!labelUrl || typeof saveReceiptToLocalFile !== 'function') return null;
  try {
    const r = await fetch(labelUrl);
    if (!r.ok) return null;
    const blob = await r.blob();
    const ext = (blob.type && blob.type.includes('png')) ? 'png'
      : (/\.png(\?|$)/i.test(labelUrl) ? 'png' : 'pdf');
    const file = new File([blob], `shippo_${txId}.${ext}`, { type: blob.type || 'application/pdf' });
    return await saveReceiptToLocalFile(file, 'Shippo');
  } catch (_) {
    return null;
  }
}

async function fetchShippoTransactionsPageAPI(token, page) {
  const url = `https://api.goshippo.com/transactions/?page=${page}&results=100&expand[]=rate`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `ShippoToken ${token}`,
      'Content-Type': 'application/json'
    }
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`Shippo API error ${resp.status}${txt ? `: ${txt.slice(0, 140)}` : ''}`);
  }
  return resp.json();
}

async function fetchShippoObject(token, resource, id) {
  if (!id) return {};
  const resp = await fetch(`https://api.goshippo.com/${resource}/${encodeURIComponent(id)}`, {
    headers: { Authorization: `ShippoToken ${token}`, 'Content-Type': 'application/json' },
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Shippo ${resource} lookup ${resp.status}${text ? `: ${text.slice(0, 140)}` : ''}`);
  }
  return resp.json();
}

async function fetchShippoContext(token, tx) {
  let shipment = tx.shipment && typeof tx.shipment === 'object' ? tx.shipment : {};
  const shipmentId = typeof tx.shipment === 'string' ? tx.shipment : shipment.object_id;
  if (shipmentId && !shipment.address_to) {
    shipment = await fetchShippoObject(token, 'shipments', shipmentId);
  }

  // Shippo sometimes returns address_to as a string ID
  if (typeof shipment.address_to === 'string') {
    try {
      shipment.address_to = await fetchShippoObject(token, 'addresses', shipment.address_to);
    } catch (e) {
      console.warn('Failed to fetch shipment.address_to', e);
    }
  }

  let shippoOrder = tx.order && typeof tx.order === 'object' ? tx.order : {};
  const orderId = typeof tx.order === 'string' ? tx.order : (shippoOrder.object_id || shipment.order);
  if (orderId && !shippoOrder.order_number) {
    shippoOrder = await fetchShippoObject(token, 'orders', orderId);
  }

  // Shippo sometimes returns to_address as a string ID
  if (typeof shippoOrder.to_address === 'string') {
    try {
      shippoOrder.to_address = await fetchShippoObject(token, 'addresses', shippoOrder.to_address);
    } catch (e) {
      console.warn('Failed to fetch shippoOrder.to_address', e);
    }
  }

  return { shipment, shippoOrder };
}

function renderShippingReconciliationWorklist() {
  const list = $('shipping-reconciliation-list');
  const count = $('shipping-reconciliation-count');
  if (!list || !count || isAuthor()) return;
  const panel = list.closest('.shipping-reconciliation');
  const openButton = $('shipping-reconciliation-open');
  if (panel?.dataset.closed === 'true') {
    panel.style.display = 'none';
    if (openButton) openButton.style.display = '';
    return;
  }
  if (panel) panel.style.display = '';
  if (openButton) openButton.style.display = 'none';
  const expenses = (TAX_CENTER.businessExpenses || []).filter(expense =>
    String(expense?.ref || '').startsWith('shippo:') &&
    expense.shippingMatchStatus !== 'matched' && expense.shippingMatchStatus !== 'dismissed'
  );
  const knownOrders = getShippingReconciliationOrders();
  count.textContent = `${expenses.length} to review`;
  if (!expenses.length) {
    list.innerHTML = '<div class="shipping-reconciliation-empty">All imported postage is linked to an order.</div>';
    return;
  }

  list.innerHTML = expenses.map(expense => {
    const domId = String(expense.ref).replace(/[^A-Za-z0-9_-]/g, '-');
    const suggested = normalizeShippingOrderNumber(expense.shippingSuggestedOrderNumber);
    const options = knownOrders.map(order => {
      const number = normalizeShippingOrderNumber(order.num || order.orderNum);
      return `<option value="${escapeHtml(number)}"${number === suggested ? ' selected' : ''}>${escapeHtml(number)} · ${escapeHtml(order.shipName || order.customer || 'Customer')}</option>`;
    }).join('');
    const context = [expense.recipientName, expense.recipientPostal, expense.trackingUrl ? 'Tracking saved' : ''].filter(Boolean).join(' · ');
    return `<div class="shipping-reconciliation-row">
      <div class="shipping-reconciliation-copy">
        <strong>${fmt(expense.amount || 0, expense.currency || 'CAD')}</strong>
        <span>${escapeHtml(expense.date || 'Date unavailable')} · ${escapeHtml(context || 'Recipient unavailable')}</span>
        <small>${escapeHtml(expense.shippingMatchStatus || 'unmatched')}</small>
      </div>
      <label for="${domId}">Order</label>
      <select id="${domId}" aria-label="Order for postage expense"><option value="">Select an order</option>${options}</select>
      <button class="btn gold sm" type="button" data-ref="${escapeHtml(expense.ref)}" onclick="linkShippingExpense(this.dataset.ref)">Link postage</button>
    </div>`;
  }).join('');
}

function closeShippingReconciliation() {
  const panel = document.querySelector('.shipping-reconciliation');
  if (!panel) return;
  panel.dataset.closed = 'true';
  renderShippingReconciliationWorklist();
}

function openShippingReconciliation() {
  const panel = document.querySelector('.shipping-reconciliation');
  if (!panel) return;
  delete panel.dataset.closed;
  renderShippingReconciliationWorklist();
}

async function clearShippingReconciliationList() {
  const expenses = (TAX_CENTER.businessExpenses || []).filter(expense =>
    String(expense?.ref || '').startsWith('shippo:') &&
    expense.shippingMatchStatus !== 'matched' && expense.shippingMatchStatus !== 'dismissed'
  );
  if (!expenses.length) {
    showToast('The reconciliation list is already clear', 'warn');
    return;
  }
  const accepted = await confirmDialog(
    `Dismiss ${expenses.length} unmatched Shippo postage item${expenses.length === 1 ? '' : 's'} from this list?\n\n` +
    'The expenses will stay in your Shipping & Postage ledger.',
    { title: 'Clear shipping reconciliation list', okLabel: 'Clear list' },
  );
  if (!accepted) return;
  const priorStatuses = expenses.map(expense => ({ expense, hadStatus: Object.prototype.hasOwnProperty.call(expense, 'shippingMatchStatus'), status: expense.shippingMatchStatus }));
  expenses.forEach(expense => { expense.shippingMatchStatus = 'dismissed'; });
  try {
    await saveTaxCenter({ rethrow: true });
  } catch (error) {
    priorStatuses.forEach(({ expense, hadStatus, status }) => {
      if (hadStatus) expense.shippingMatchStatus = status;
      else delete expense.shippingMatchStatus;
    });
    console.error('Shipping reconciliation clear failed', error);
    showToast('Could not clear the reconciliation list. Please try again.', 'err');
    return;
  }
  renderShippingReconciliationWorklist();
  showToast(`Cleared ${expenses.length} reconciliation item${expenses.length === 1 ? '' : 's'}`);
}

async function linkShippingExpense(ref) {
  const expense = (TAX_CENTER.businessExpenses || []).find(item => String(item.ref) === String(ref));
  if (!expense) { showToast('Shipping expense was not found', 'err'); return; }
  const domId = String(expense.ref).replace(/[^A-Za-z0-9_-]/g, '-');
  const number = normalizeShippingOrderNumber($(domId)?.value);
  if (!number) { showToast('Choose an order before linking postage', 'warn'); return; }
  try {
    await persistManualShippingLink(expense, number, () => saveTaxCenter({ rethrow: true }));
  } catch (error) {
    console.error('Shipping link save failed', error);
    renderShippingReconciliationWorklist();
    showToast('Could not save the shipping link. Please try again.', 'err');
    return;
  }
  renderShippingReconciliationWorklist();
  renderOrders();
  renderHist();
  renderTaxCenter();
  showToast(`Postage linked to ${number}`);
}

async function processShippoTxToExpense(tx, token, txId, ref, importedCount, context, knownOrders) {
  const { amount, currency } = await getShippoTxCost(tx, token);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const dateRaw = tx.object_created || tx.object_updated || '';
  const date = /^\d{4}-\d{2}-\d{2}/.test(dateRaw) ? dateRaw.slice(0, 10) : today();

  let fxRate = currency === 'CAD' ? 1 : 0;
  if (currency !== 'CAD') {
    try { const historical = await fetchHistoricalRate(currency, 'CAD', date); fxRate = historical?.rate || 0; } catch (_) { /* continue */ }
    if (!fxRate) {
      try { const live = await fetchLiveRate(currency, 'CAD'); fxRate = live?.rate || 0; } catch (_) { /* continue */ }
    }
    if (!fxRate) fxRate = _fxRateCache[`${currency}_CAD`] || 0;
  }
  const fxMissing = !fxRate;

  const labelUrl = tx.label_url || '';
  const localReceipt = labelUrl ? await saveShippoLabelLocally(labelUrl, txId) : null;

  const expense = {
    id: Date.now() + importedCount + 1,
    desc: `Shippo shipping label${tx.tracking_number ? ` #${tx.tracking_number}` : ''}`,
    cat: 'Shipping & Postage',
    currency,
    amount,
    origCurrency: currency,
    origAmount: amount,
    fxRate: fxMissing ? null : fxRate,
    baseAmount: fxMissing ? null : roundCents(amount * fxRate),
    fxMissing,
    date,
    ref,
    receipt: localReceipt || labelUrl,
    trackingUrl: tx.tracking_url_provider || '',
    trip: '',
  };
  return enrichShippoExpense(expense, tx, context.shipment, context.shippoOrder, knownOrders);
}

async function importShippoShippingFromApi() {
  const keyEl = $('tc-shippo-key');
  const statusEl = $('tc-shippo-status');
  const btn = $('tc-shippo-btn');
  const token = (keyEl?.value || '').trim();
  if (!token) { showToast('⚠ Enter your Shippo API token first', 'warn'); return; }

  if (!TAX_CENTER.settings) TAX_CENTER.settings = {};
  if (TAX_CENTER.settings.shippoKey !== token) {
    TAX_CENTER.settings.shippoKey = token;
    saveTaxCenter().catch(e => console.warn('Shippo key save failed', e));
  }

  btn.disabled = true;
  if (statusEl) statusEl.textContent = 'Fetching Shippo transactions…';

  if (!TAX_CENTER.businessExpenses) TAX_CENTER.businessExpenses = [];
  const existingExpensesByRef = new Map((TAX_CENTER.businessExpenses || [])
    .filter(expense => String(expense?.ref || '').startsWith('shippo:'))
    .map(expense => [String(expense.ref), expense]));
  const importedIds = new Set(Array.from(existingExpensesByRef.keys())
    .map(ref => ref.replace(/^shippo:/, ''))
    .filter(Boolean));
  const fetchedIds = new Set();
  const pendingExpenses = [];
  const stagedExistingEnrichments = [];
  const knownOrders = getShippingReconciliationOrders();
  let enrichedCount = 0;
  let contextFailureCount = 0;

  let imported = 0;
  let skipped = 0;
  let alreadyImported = 0; // already in the ledger from a prior run (deduped)
  let totalUsd = 0;
  let page = 1;
  let hasMore = true;

  try {
    while (hasMore && page <= 200) {
      // Shippo list transactions endpoint:
      //   GET /transactions with optional filters (rate, object_status,
      //   tracking_status, page, results). We intentionally avoid status
      //   query filters here so valid paid labels in non-default states
      //   still appear and can be imported.
      const json = await fetchShippoTransactionsPageAPI(token, page);
      const rows = json.results || [];
      const CHUNK_SIZE = 10;
      for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const chunk = rows.slice(i, i + CHUNK_SIZE);

        const chunkResults = await Promise.all(chunk.map(async (tx, chunkIdx) => {
          const result = { skipped: false, alreadyImported: false, staged: null, expense: null, txId: null, contextFailure: false, ref: null };
          const status = String(tx?.status || '').toUpperCase();
          if (!tx || status === 'REFUNDED' || status === 'ERROR' || status === 'INVALID') { result.skipped = true; return result; }
          const txId = String(tx.object_id || '').trim();
          if (!txId) { result.skipped = true; return result; }
          const ref = `shippo:${txId}`;
          result.txId = txId;
          result.ref = ref;

          if (fetchedIds.has(txId)) { result.alreadyImported = true; return result; }
          fetchedIds.add(txId);

          const existingExpense = existingExpensesByRef.get(ref);
          if (existingExpense && existingExpense.shippingMatchStatus === 'matched') {
            result.alreadyImported = true;
            return result;
          }

          let context = { shipment: {}, shippoOrder: {} };
          let contextLoaded = true;
          try {
            context = await fetchShippoContext(token, tx);
          } catch (error) {
            console.warn(`Shippo context lookup failed for ${txId}`, error);
            result.contextFailure = true;
            contextLoaded = false;
          }

          if (existingExpense) {
            const staged = stageShippoExpenseEnrichment(
              existingExpense, tx, context.shipment, context.shippoOrder, knownOrders, contextLoaded,
            );
            if (staged) result.staged = staged;
            result.alreadyImported = true;
            return result;
          }

          const expense = await processShippoTxToExpense(
            tx, token, txId, ref, imported + i + chunkIdx, context, knownOrders,
          );

          if (!expense) {
            result.skipped = true;
            return result;
          }

          result.expense = expense;
          return result;
        }));

        for (const res of chunkResults) {
          if (res.contextFailure) contextFailureCount++;
          if (res.skipped) { skipped++; continue; }
          if (res.alreadyImported) {
            alreadyImported++;
            if (res.staged) {
              const staged = res.staged;
              stagedExistingEnrichments.push(staged);
              enrichedCount++;
            }
            continue;
          }
          if (res.expense) {
            pendingExpenses.push(res.expense);
            existingExpensesByRef.set(res.ref, res.expense);
            importedIds.add(res.txId);
            imported++;
            if (res.expense.currency === 'USD') totalUsd += res.expense.amount;
          }
        }
      }
      hasMore = Boolean(json.next);
      page += 1;
      if (statusEl) statusEl.textContent = `Fetched ${imported + skipped} transactions…`;
    }

    if (imported > 0) {
      // Build a cost breakdown so the confirmation reflects what will actually
      // be written: total CAD, original amounts per currency, and date range.
      const totalCad = pendingExpenses.reduce((s, e) => s + (e.baseAmount || 0), 0);
      const byCur = {};
      for (const e of pendingExpenses) byCur[e.currency] = (byCur[e.currency] || 0) + (e.amount || 0);
      const curLines = Object.keys(byCur).sort()
        .map(c => `  • ${byCur[c].toFixed(2)} ${c}`).join('\n');
      const dates = pendingExpenses.map(e => e.date).filter(Boolean).sort();
      const range = dates.length ? `${dates[0]} → ${dates[dates.length - 1]}` : '—';

      const accept = await confirmDialog(
        `Add ${imported} new Shippo shipping cost${imported === 1 ? '' : 's'} to your master ledger?\n\n` +
        `Total: ${totalCad.toFixed(2)} CAD\n` +
        `Original amounts:\n${curLines}\n` +
        `Dates: ${range}\n` +
        (alreadyImported ? `Already in ledger (skipped): ${alreadyImported}\n` : '') +
        `\nOnly new labels are listed above — nothing is written until you confirm.`,
        { title: 'Import Shippo shipping costs', okLabel: 'Add to ledger' }
      );
      if (!accept) {
        if (stagedExistingEnrichments.length) {
          applyShippoExpenseEnrichments(stagedExistingEnrichments);
          TAX_CENTER.settings.shippoImportedObjectIds = Array.from(importedIds).slice(-10000);
          TAX_CENTER.settings.shippoLastImportAt = new Date().toISOString();
          await saveTaxCenter();
          renderTaxCenter();
        }
        if (statusEl) statusEl.textContent = `Found ${imported} new Shippo transactions (${totalCad.toFixed(2)} CAD). Import cancelled before ledger insertion.`;
        showToast(
          enrichedCount
            ? `New Shippo expense import cancelled; ${enrichedCount} existing expense${enrichedCount === 1 ? '' : 's'} reconciled`
            : 'Shippo import cancelled before insertion',
          enrichedCount ? 'ok' : 'warn',
        );
        return;
      }
    }

    applyShippoExpenseEnrichments(stagedExistingEnrichments);
    if (pendingExpenses.length > 0) TAX_CENTER.businessExpenses.unshift(...pendingExpenses.reverse());
    TAX_CENTER.settings.shippoImportedObjectIds = Array.from(importedIds).slice(-10000);
    TAX_CENTER.settings.shippoLastImportAt = new Date().toISOString();
    await saveTaxCenter();
    renderTaxCenter();
    const dupNote = alreadyImported ? ` ${alreadyImported} already imported.` : '';
    const enrichNote = enrichedCount ? ` ${enrichedCount} existing expense${enrichedCount === 1 ? '' : 's'} reconciled.` : '';
    const contextNote = contextFailureCount ? ` ${contextFailureCount} label${contextFailureCount === 1 ? '' : 's'} still need review because Shippo details could not load.` : '';
    const reconciliationNote = `${enrichNote}${contextNote}`;
    if (statusEl) statusEl.textContent = imported
      ? `Imported ${imported} new Shippo transactions.${dupNote}${skipped ? ` ${skipped} skipped.` : ''}${totalUsd ? ` USD imported: ${totalUsd.toFixed(2)}.` : ''}${reconciliationNote}`
      : `No new Shippo transactions to import.${dupNote}${skipped ? ` ${skipped} skipped.` : ''}${reconciliationNote}`;
    showToast(
      (imported
        ? `Imported ${imported} new Shippo expense${imported === 1 ? '' : 's'}`
        : (alreadyImported ? `No new Shippo expenses (${alreadyImported} already imported)` : 'No new Shippo expenses to import')) + reconciliationNote,
      imported || enrichedCount ? 'ok' : 'warn',
    );
  } catch (e) {
    console.error(e);
    if (statusEl) statusEl.textContent = `Error: ${e.message || e}`;
    showToast('⚠ Shippo import failed', 'err');
  } finally {
    btn.disabled = false;
  }
}

let shippoBaseSpecs = { length: 10, width: 8, height: 1, dim_unit: 'in', weight: 1.2, weight_unit: 'lb' };

const GENERIC_SHIP_SPECS = { length: 10, width: 8, height: 1, dim_unit: 'in', weight: 1.2, weight_unit: 'lb' };

// Measured specs for the catalog's own titles, keyed by book id. Keyed by id
// rather than matched against the title, because a rename used to drop a book
// silently back onto GENERIC_SHIP_SPECS and mis-rate every quote for it with no
// visible sign. Anything saved on the book record itself still wins over this;
// this is only the fallback for books whose ship fields were never filled in.
const BOOK_SHIP_PRESETS = {
  altrove: { length: 10, width: 8, height: 0.8, dim_unit: 'in', weight: 1.1, weight_unit: 'lb' },
  hound: { length: 12, width: 9, height: 1.2, dim_unit: 'in', weight: 2.2, weight_unit: 'lb' },
  archaeology: { length: 9, width: 7, height: 0.6, dim_unit: 'in', weight: 0.9, weight_unit: 'lb' },
  sistema: { length: 8, width: 6, height: 0.5, dim_unit: 'in', weight: 0.7, weight_unit: 'lb' },
  nobody: { length: 10, width: 8, height: 0.8, dim_unit: 'in', weight: 1.0, weight_unit: 'lb' },
  collective: { length: 10, width: 8, height: 0.8, dim_unit: 'in', weight: 1.2, weight_unit: 'lb' },
};

// Legacy title matching, kept only as a tertiary hop so a book copied to a new
// id under a known title still rates correctly. Never the reason a rename works.
const LEGACY_TITLE_PRESET_IDS = ['altrove', 'hound', 'archaeology', 'sistema', 'nobody', 'collective'];

// Returns the specs plus where they came from, so callers can tell the user when
// a quote is running on generic numbers rather than this book's real dimensions.
function resolveBookPresetSpecs(book) {
  if (!book) return { specs: { ...GENERIC_SHIP_SPECS }, source: 'generic' };

  // Prioritize custom specifications saved on the book
  if (book.shipLength && book.shipWidth && book.shipHeight && book.shipWeight) {
    return {
      source: 'book',
      specs: {
        length: book.shipLength,
        width: book.shipWidth,
        height: book.shipHeight,
        dim_unit: book.shipDimUnit || 'in',
        weight: book.shipWeight,
        weight_unit: book.shipWeightUnit || 'lb'
      },
    };
  }

  const byId = BOOK_SHIP_PRESETS[book.id];
  if (byId) return { specs: { ...byId }, source: 'preset' };

  const title = (book.title || '').toLowerCase();
  const legacyId = LEGACY_TITLE_PRESET_IDS.find(id => title.includes(id));
  if (legacyId) return { specs: { ...BOOK_SHIP_PRESETS[legacyId] }, source: 'preset' };

  return { specs: { ...GENERIC_SHIP_SPECS }, source: 'generic' };
}

function getBookPresetSpecs(book) {
  return resolveBookPresetSpecs(book).specs;
}

function initShippingTab() {
  const shippoKey = TAX_CENTER.settings?.shippoKey || '';
  const indicator = $('ship-key-indicator');
  const statusText = $('ship-key-status-text');
  const setupGroup = $('ship-key-setup-group');
  const activeGroup = $('ship-key-active-group');
  const maskedEl = $('ship-key-masked');

  if (shippoKey) {
    if (indicator) indicator.style.background = 'var(--green)';
    if (statusText) statusText.textContent = 'Shippo API Key Configured';
    if (setupGroup) setupGroup.style.display = 'none';
    if (activeGroup) activeGroup.style.display = 'flex';
    if (maskedEl) {
      const visible = shippoKey.length > 8 ? shippoKey.slice(0, 4) + '...' + shippoKey.slice(-4) : '••••••••';
      maskedEl.textContent = visible;
    }
  } else {
    if (indicator) indicator.style.background = 'var(--red)';
    if (statusText) statusText.textContent = 'Shippo API Key Required';
    if (setupGroup) setupGroup.style.display = 'flex';
    if (activeGroup) activeGroup.style.display = 'none';
  }

  // Load Saved Origin from localStorage
  const savedOrigin = {
    name: localStorage.getItem('lm-shippo-origin-name') || '',
    company: localStorage.getItem('lm-shippo-origin-company') || '',
    phone: localStorage.getItem('lm-shippo-origin-phone') || '',
    street1: localStorage.getItem('lm-shippo-origin-street1') || '',
    street2: localStorage.getItem('lm-shippo-origin-street2') || '',
    city: localStorage.getItem('lm-shippo-origin-city') || '',
    state: localStorage.getItem('lm-shippo-origin-state') || '',
    zip: localStorage.getItem('lm-shippo-origin-zip') || '',
    country: localStorage.getItem('lm-shippo-origin-country') || 'CA'
  };

  $('sf-name').value = savedOrigin.name || '';
  $('sf-company').value = savedOrigin.company || '';
  $('sf-phone').value = savedOrigin.phone || '';
  $('sf-street1').value = savedOrigin.street1 || '';
  $('sf-street2').value = savedOrigin.street2 || '';
  $('sf-city').value = savedOrigin.city || '';
  $('sf-state').value = savedOrigin.state || '';
  $('sf-zip').value = savedOrigin.zip || '';
  $('sf-country').value = savedOrigin.country || 'CA';

  // Populate pre-fill dropdowns
  const bcGroup = $('ship-prefill-bc-group');
  const storesGroup = $('ship-prefill-stores-group');
  const ordersGroup = $('ship-prefill-orders-group');

  if (bcGroup) {
    bcGroup.innerHTML = '';
    let bcOrders = (bigCartelData && bigCartelData.orders && bigCartelData.orders.length > 0)
      ? bigCartelData.orders
      : (loadCachedBigCartelOrders()?.orders || []);

    if (bcOrders.length === 0) {
      const opt = document.createElement('option');
      opt.disabled = true;
      opt.textContent = 'No Big Cartel orders found';
      bcGroup.appendChild(opt);
    } else {
      bcOrders.forEach(o => {
        // Pass the whole order: dropping `relationships` hides the included
        // customer/shipping_address resources that carry the phone number.
        const addrObj = extractBigCartelAddress(o, o.id, getBigCartelIncluded());
        const opt = document.createElement('option');
        opt.value = JSON.stringify(addrObj);
        opt.textContent = `Order #${o.id} - ${addrObj.name} (${addrObj.city || 'Local'}, ${addrObj.country})`;
        bcGroup.appendChild(opt);
      });
    }
  }

  if (storesGroup) {
    storesGroup.innerHTML = '';
    const stores = getAllStores();
    if (stores.length === 0) {
      const opt = document.createElement('option');
      opt.disabled = true;
      opt.textContent = 'No consignment stores found';
      storesGroup.appendChild(opt);
    } else {
      stores.forEach(st => {
        const rawPhone = st.phone || st.contactPhone || st.mobile || st.telephone || '';
        const addrObj = {
          name: st.contact || st.name,
          company: st.name,
          phone: getFallbackShippingPhone(rawPhone),
          street1: st.address || '',
          street2: '',
          city: st.city || '',
          state: st.region || '',
          zip: st.postal || '',
          country: normalizeCountryCode(st.country || 'CA')
        };
        const opt = document.createElement('option');
        opt.value = JSON.stringify(addrObj);
        opt.textContent = `${st.name} (${st.city || ''}, ${st.country || ''})`;
        storesGroup.appendChild(opt);
      });
    }
  }

  if (ordersGroup) {
    ordersGroup.innerHTML = '';
    const orders = getRecentShippingOrders();
    if (orders.length === 0) {
      const opt = document.createElement('option');
      opt.disabled = true;
      opt.textContent = 'No recent website orders found';
      ordersGroup.appendChild(opt);
    } else {
      orders.slice(0, 20).forEach(h => {
        const rawPhone = h.shipPhone || h.phone || h.contactPhone || h.buyerPhone || '';
        const addrObj = {
          orderNumber: h.num,
          name: h.shipName,
          company: '',
          phone: getFallbackShippingPhone(rawPhone),
          street1: h.shipAddr1,
          street2: h.shipAddr2 || '',
          city: h.shipCity,
          state: h.shipProvince,
          zip: h.shipPostal,
          country: normalizeCountryCode(h.shipCountry || 'CA')
        };
        const opt = document.createElement('option');
        opt.value = JSON.stringify(addrObj);
        opt.textContent = `${h.shipName} (${h.shipCity || ''}, ${h.shipCountry || ''}) - ${h.date || ''}`;
        ordersGroup.appendChild(opt);
      });
    }
  }

  // Populate book preset dropdown
  const presetSelect = $('ship-preset-book');
  if (presetSelect) {
    presetSelect.innerHTML = '<option value="">— Select book preset —</option>';
    BOOK_LIST.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.id;
      opt.textContent = b.title;
      presetSelect.appendChild(opt);
    });
  }

  // Reset quantity and load base specifications from current inputs
  const qtyInput = $('sp-qty');
  if (qtyInput) qtyInput.value = '1';
  shippoBaseSpecs = {
    length: parseFloat($('sp-length').value) || 10,
    width: parseFloat($('sp-width').value) || 8,
    height: parseFloat($('sp-height').value) || 1,
    dim_unit: $('sp-dim-unit').value || 'in',
    weight: parseFloat($('sp-weight').value) || 1.2,
    weight_unit: $('sp-weight-unit').value || 'lb'
  };
  renderCustomShippoDestPicker();
  bindDestinationVerificationWatchers();
  renderDestinationVerification();
  loadShippoIncotermPreference($('st-country')?.value || '');
  updateShippoCustomsTotalHint();
  renderShippingAnalysisHub();
}

function getFallbackShippingPhone(preferredPhone) {
  return (preferredPhone || '').toString().trim();
}

let _shippoDestMasterList = [];
let _shippoDestActiveCat = 'all';

function renderCustomShippoDestPicker() {
  const wrapper = $('custom-ship-dest-wrapper');
  if (!wrapper) return;

  const items = [];

  // 1. Big Cartel Orders
  let bcOrders = (bigCartelData && bigCartelData.orders && bigCartelData.orders.length > 0)
    ? bigCartelData.orders
    : (typeof loadCachedBigCartelOrders === 'function' ? loadCachedBigCartelOrders()?.orders || [] : []);

  const bcIncluded = getBigCartelIncluded();

  bcOrders.forEach(o => {
    const addrObj = extractBigCartelAddress(o, o.id, bcIncluded);

    items.push({
      category: 'bc',
      catLabel: 'Big Cartel',
      icon: '🛒',
      title: `Order #${o.id} · ${addrObj.name}`,
      sub: `${addrObj.street1 ? addrObj.street1 + ', ' : ''}${addrObj.city || 'Local'}${addrObj.state ? ', ' + addrObj.state : ''} ${addrObj.country}`,
      value: JSON.stringify(addrObj),
      orderNumber: o.id,
      missingPhone: !getFallbackShippingPhone(addrObj.phone),
      searchText: `order #${o.id} ${addrObj.name} ${addrObj.city} ${addrObj.state} ${addrObj.country} ${addrObj.street1}`.toLowerCase()
    });
  });

  // 2. Consignment Stores
  const stores = typeof getAllStores === 'function' ? getAllStores() : [];
  stores.forEach(st => {
    const rawPhone = st.phone || st.contactPhone || st.mobile || st.telephone || '';
    const addrObj = {
      name: st.contact || st.name,
      company: st.name,
      phone: getFallbackShippingPhone(rawPhone),
      street1: st.address || '',
      street2: '',
      city: st.city || '',
      state: st.region || '',
      zip: st.postal || '',
      country: normalizeCountryCode(st.country || 'CA')
    };

    items.push({
      category: 'stores',
      catLabel: 'Store',
      icon: '🏬',
      title: st.name,
      sub: `${st.address ? st.address + ', ' : ''}${st.city || ''} ${st.country || ''}`,
      value: JSON.stringify(addrObj),
      orderNumber: '',
      missingPhone: !getFallbackShippingPhone(addrObj.phone),
      searchText: `${st.name} ${st.contact || ''} ${st.city || ''} ${st.region || ''} ${st.country || ''}`.toLowerCase()
    });
  });

  // 3. Ledger Orders
  const recentOrders = typeof getRecentShippingOrders === 'function' ? getRecentShippingOrders() : [];
  recentOrders.slice(0, 20).forEach(h => {
    const rawPhone = h.shipPhone || h.phone || h.contactPhone || h.buyerPhone || '';
    const addrObj = {
      orderNumber: h.num,
      name: h.shipName,
      company: '',
      phone: getFallbackShippingPhone(rawPhone),
      street1: h.shipAddr1,
      street2: h.shipAddr2 || '',
      city: h.shipCity,
      state: h.shipProvince,
      zip: h.shipPostal,
      country: normalizeCountryCode(h.shipCountry || 'CA')
    };

    items.push({
      category: 'orders',
      catLabel: 'Order',
      icon: '📦',
      title: `${h.num ? 'Order #' + h.num + ' · ' : ''}${h.shipName}`,
      sub: `${h.shipAddr1 ? h.shipAddr1 + ', ' : ''}${h.shipCity || ''} ${h.shipCountry || ''}`,
      value: JSON.stringify(addrObj),
      orderNumber: h.num,
      missingPhone: !getFallbackShippingPhone(addrObj.phone),
      searchText: `${h.num || ''} ${h.shipName} ${h.shipCity || ''} ${h.shipCountry || ''}`.toLowerCase()
    });
  });

  _shippoDestMasterList = items;

  const countBadge = $('ship-dest-count-badge');
  if (countBadge) countBadge.textContent = `${items.length} destination${items.length === 1 ? '' : 's'}`;

  filterShippoDestMenu();
}

function setShippoDestMenuOpenState(isOpen) {
  const menu = $('custom-ship-dest-menu');
  const trigger = $('custom-ship-dest-trigger');
  const arrow = $('custom-ship-dest-arrow');
  const wrapper = $('custom-ship-dest-wrapper');
  const card = wrapper?.closest('.card');

  if (isOpen) {
    if (menu) menu.style.display = 'flex';
    if (trigger) trigger.classList.add('active');
    if (arrow) arrow.style.transform = 'rotate(180deg)';
    if (card) {
      card.style.position = 'relative';
      card.style.zIndex = '9999';
    }
    if (wrapper) wrapper.style.zIndex = '10000';
    const searchInput = $('custom-ship-dest-search');
    if (searchInput) searchInput.focus();
  } else {
    if (menu) menu.style.display = 'none';
    if (trigger) trigger.classList.remove('active');
    if (arrow) arrow.style.transform = 'rotate(0deg)';
    if (card) card.style.zIndex = '10';
    if (wrapper) wrapper.style.zIndex = '1000';
  }
}

function toggleShippoDestDropdown(e) {
  if (e) e.stopPropagation();
  const menu = $('custom-ship-dest-menu');
  if (!menu) return;
  const isOpen = menu.style.display === 'flex' || menu.style.display === 'block';
  setShippoDestMenuOpenState(!isOpen);
}

function setShippoDestCategoryFilter(cat, e) {
  if (e) e.stopPropagation();
  _shippoDestActiveCat = cat;
  const chips = document.querySelectorAll('#custom-ship-dest-chips .dest-chip');
  chips.forEach(chip => {
    if (chip.dataset.cat === cat) chip.classList.add('active');
    else chip.classList.remove('active');
  });
  filterShippoDestMenu();
}

function filterShippoDestMenu() {
  const searchInput = $('custom-ship-dest-search');
  const query = (searchInput?.value || '').toLowerCase().trim();
  const listContainer = $('custom-ship-dest-list');
  if (!listContainer) return;

  const filtered = _shippoDestMasterList.filter(item => {
    if (_shippoDestActiveCat !== 'all' && item.category !== _shippoDestActiveCat) return false;
    if (query && !item.searchText.includes(query)) return false;
    return true;
  });

  if (filtered.length === 0) {
    listContainer.innerHTML = `
      <div style="padding:16px;text-align:center;color:var(--text3);font-size:12px;">
        No matching addresses found.
      </div>`;
    return;
  }

  const selectedVal = $('ship-prefill-dest')?.value || '';
  const originCountry = normalizeCountryCode(localStorage.getItem('lm-shippo-origin-country') || 'CA');

  listContainer.innerHTML = filtered.map(item => {
    const isSelected = selectedVal === item.value;
    const masterIdx = _shippoDestMasterList.indexOf(item);
    // Carriers reject international labels without a recipient phone, so flag those rows up front.
    let destCountry = '';
    try { destCountry = JSON.parse(item.value).country || ''; } catch (_) { destCountry = ''; }
    const phoneWarning = (item.missingPhone && destCountry && destCountry !== originCountry)
      ? '<span class="custom-dest-item-warn" title="No recipient phone on file — required for international labels">⚠ no phone</span>'
      : '';
    return `
      <div class="custom-dest-item ${isSelected ? 'selected' : ''}" onclick="selectShippoDestCustomItem(${masterIdx}, event)">
        <div class="custom-dest-item-header">
          <span class="custom-dest-item-title">${item.icon} ${escapeHtml(item.title)}</span>
          <span class="custom-dest-item-badge ${item.category}">${escapeHtml(item.catLabel)}</span>
        </div>
        <div class="custom-dest-item-sub">${escapeHtml(item.sub)}${phoneWarning}</div>
      </div>`;
  }).join('');
}

function selectShippoDestCustomItem(idx, e) {
  if (e) e.stopPropagation();
  const item = _shippoDestMasterList[idx];
  if (!item) return;

  const nativeSelect = $('ship-prefill-dest');
  if (nativeSelect) {
    nativeSelect.value = item.value;
    nativeSelect.dataset.orderNumber = normalizeShippingOrderNumber(item.orderNumber);
  }

  const label = $('custom-ship-dest-label');
  const icon = $('custom-ship-dest-icon');
  const clearBtn = $('custom-ship-dest-clear');

  if (label) {
    label.textContent = item.title;
    label.style.color = 'var(--text)';
    label.style.fontWeight = '600';
  }
  if (icon) icon.textContent = item.icon;
  if (clearBtn) clearBtn.style.display = 'inline-block';

  // Trigger form population
  onShippoPreFillDestChange();

  // Close dropdown and reset z-indexes
  setShippoDestMenuOpenState(false);
}

function clearShippoDestSelection(e) {
  if (e) e.stopPropagation();
  const nativeSelect = $('ship-prefill-dest');
  if (nativeSelect) {
    nativeSelect.value = '';
    nativeSelect.dataset.orderNumber = '';
  }

  const label = $('custom-ship-dest-label');
  const icon = $('custom-ship-dest-icon');
  const clearBtn = $('custom-ship-dest-clear');

  if (label) {
    label.textContent = '— Search or select an address —';
    label.style.color = 'var(--text3)';
    label.style.fontWeight = 'normal';
  }
  if (icon) icon.textContent = '🔍';
  if (clearBtn) clearBtn.style.display = 'none';

  // Clear inputs
  $('st-name').value = '';
  $('st-company').value = '';
  $('st-phone').value = '';
  $('st-street1').value = '';
  $('st-street2').value = '';
  $('st-city').value = '';
  $('st-state').value = '';
  $('st-zip').value = '';
  $('st-country').value = 'US';
  onShippoDestCountryChange();
  dismissAddressVerification();
}

function getRecentShippingOrders() {
  const orders = [];
  const seen = new Set();
  Object.values(states).forEach(s => {
    if (s && Array.isArray(s.hist)) {
      s.hist.forEach(h => {
        if (h && h.shipName && h.shipAddr1 && !h.voided) {
          const key = `${h.shipName.trim()}|${h.shipAddr1.trim()}`.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            orders.push(h);
          }
        }
      });
    }
  });
  orders.sort((a, b) => {
    const da = a.date ? new Date(a.date) : new Date(0);
    const db = b.date ? new Date(b.date) : new Date(0);
    return db - da;
  });
  return orders;
}

function saveShippoApiKey() {
  const keyInput = $('ship-api-key-input');
  if (!keyInput) return;
  const token = keyInput.value.trim();
  if (!token) {
    showToast('⚠️ Enter a valid Shippo token', 'warn');
    return;
  }

  if (!TAX_CENTER.settings) {
    TAX_CENTER.settings = { baseCurrency: 'CAD', geminiKey: '' };
  }
  TAX_CENTER.settings.shippoKey = token;

  saveTaxCenter()
    .then(() => {
      showToast('✓ Shippo API key saved');
      keyInput.value = '';
      initShippingTab();
      // Sync to Tax Center UI if present
      const tcKeyEl = $('tc-shippo-key');
      if (tcKeyEl) tcKeyEl.value = token;
    })
    .catch(e => {
      console.error(e);
      showToast('❌ Failed to save API key', 'err');
    });
}

function editShippoApiKey() {
  const setupGroup = $('ship-key-setup-group');
  const activeGroup = $('ship-key-active-group');
  const keyInput = $('ship-api-key-input');

  if (setupGroup) setupGroup.style.display = 'flex';
  if (activeGroup) activeGroup.style.display = 'none';
  if (keyInput) {
    keyInput.value = TAX_CENTER.settings?.shippoKey || '';
    keyInput.focus();
  }
}

function onShippoPreFillDestChange() {
  const select = $('ship-prefill-dest');
  if (!select) return;
  if (!select.value) {
    select.dataset.orderNumber = '';
    return;
  }

  try {
    const addr = JSON.parse(select.value);
    select.dataset.orderNumber = normalizeShippingOrderNumber(addr.orderNumber);
    $('st-name').value = addr.name || '';
    $('st-company').value = addr.company || '';
    $('st-phone').value = getFallbackShippingPhone(addr.phone);
    $('st-street1').value = addr.street1 || '';
    $('st-street2').value = addr.street2 || '';
    $('st-city').value = addr.city || '';
    $('st-state').value = addr.state || '';
    $('st-zip').value = addr.zip || '';
    $('st-country').value = addr.country || 'US';
    onShippoDestCountryChange();
    // A verdict belongs to one address; loading a different one retires it.
    dismissAddressVerification();
    showToast('✓ Destination populated');

    // Older cached orders were fetched without the contact resources, so the phone
    // can still be missing here — ask Big Cartel for it directly.
    if (!$('st-phone').value && select.dataset.orderNumber) {
      hydrateShippingDestinationPhone(select.dataset.orderNumber);
    }
  } catch (e) {
    console.error('Failed to parse pre-fill address', e);
  }
}

// ─── Destination address verifier ─────────────────────────────────────────
//
// Backed by Shippo's address validation (the `ValidateAddress` operation in
// Shippo's MCP tool catalogue). It answers a graded verdict rather than a
// yes/no, so the UI shows the verdict, the reasons behind it, and the
// standardized address as an *offer* the publisher applies — Shippo's
// recommendation is authoritative about postal formatting, not about which
// apartment the buyer actually lives in, so it is never written silently.
//
// The parsing lives in lib/address-verification.js; what is here is the call,
// the DOM and the freshness rule.

// Last verdict, tied to the exact address text it was produced from. Anything
// that reads it must compare signatures first: a verdict for an address the
// publisher has since edited is worse than no verdict, because it vouches for
// text Shippo never saw.
let _destVerification = null;

/** Reads the destination form into the field names the verifier speaks. */
function readShippoDestinationAddress() {
  return {
    name: $('st-name')?.value.trim() || '',
    company: $('st-company')?.value.trim() || '',
    street1: $('st-street1')?.value.trim() || '',
    street2: $('st-street2')?.value.trim() || '',
    city: $('st-city')?.value.trim() || '',
    state: $('st-state')?.value.trim() || '',
    zip: $('st-zip')?.value.trim() || '',
    country: normalizeCountryCode($('st-country')?.value || '') || ($('st-country')?.value.trim() || ''),
  };
}

/** The cached verdict, but only while it still describes what is in the form. */
function currentDestinationVerification() {
  if (!_destVerification) return null;
  return _destVerification.signature === addressSignature(readShippoDestinationAddress())
    ? _destVerification
    : null;
}

/**
 * Calls Shippo's v2 validator and falls back to the legacy endpoint.
 *
 * v2 is the richer answer and the one worth having, but not every Shippo token
 * can reach it, and a verifier that simply fails on those accounts is a verifier
 * the publisher stops trusting. The legacy `/addresses/` endpoint with
 * `validate: true` has been answering for this app all along, so it is the
 * fallback rather than the error path — normalizeAddressVerification flattens
 * both into one shape, and the panel reports which one answered.
 */
async function fetchShippoAddressVerification(token, address) {
  const headers = { 'Authorization': `ShippoToken ${token}`, 'Content-Type': 'application/json' };
  const query = new URLSearchParams(buildAddressValidationQuery(address)).toString();
  let v2Note = '';
  // Held rather than thrown: a throw here would be caught by this function's
  // own catch and turn an outage into a second request against the same
  // service. It is rethrown below, past the fallback.
  let outage = null;

  try {
    const resp = await fetch(`${SHIPPO_VALIDATE_V2_URL}?${query}`, { headers });
    if (resp.ok) return normalizeAddressVerification(await resp.json(), address);
    const text = await resp.text().catch(() => '');
    // 401/403 = token not entitled to v2, 404/405 = endpoint not on this
    // account's API version, 400/501 = v2 rejected the shape. Each of those is
    // worth a second opinion from v1. Anything else (429, 5xx) is Shippo
    // rate-limiting or down, and v1 is the same service behind the same
    // limiter — retrying it would add load and report the outage twice.
    if ([400, 401, 403, 404, 405, 422, 501].includes(resp.status)) {
      // 422 included: v2's enum validation is stricter than v1's, so an input
      // v2 rejects outright is exactly the case worth a legacy second opinion.
      v2Note = describeShippoError(resp.status, text);
    } else {
      outage = new Error(describeShippoError(resp.status, text));
    }
  } catch (error) {
    v2Note = error.message || 'v2 validator unreachable';
  }
  if (outage) throw outage;

  const legacyResp = await fetch(SHIPPO_ADDRESSES_V1_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(buildLegacyValidationPayload(address)),
  });
  if (!legacyResp.ok) {
    const text = await legacyResp.text().catch(() => '');
    throw new Error(`${v2Note}; legacy validator also failed — ${describeShippoError(legacyResp.status, text)}`);
  }
  return normalizeAddressVerification(await legacyResp.json(), address);
}

const VERIFY_TONE_CLASS = {
  ok: 'ok',
  warn: 'warn',
  err: 'err',
};

function renderVerificationReasons(reasons) {
  if (!reasons.length) return '';
  const REASON_TONE = { error: 'err', warning: 'warn', correction: 'note' };
  return `<ul class="addr-verify-reasons">${reasons.map(reason => {
    const tone = REASON_TONE[reason.type] || 'info';
    return `<li class="addr-verify-reason ${tone}">
      <span class="addr-verify-reason-tag">${escapeHtml(reason.type || 'info')}</span>
      <span>${escapeHtml(reason.description)}</span>
    </li>`;
  }).join('')}</ul>`;
}

function renderVerificationCorrections(corrections) {
  if (!corrections.length) return '';
  return `<div class="addr-verify-corrections">
    <div class="addr-verify-corrections-head">
      <span>Shippo standardized ${corrections.length} field${corrections.length === 1 ? '' : 's'}</span>
      <button type="button" class="btn gold sm" onclick="applyVerifiedAddressCorrections()">Apply corrections</button>
    </div>
    <ul>${corrections.map(correction => `<li>
      <span class="addr-verify-field">${escapeHtml(correction.label)}</span>
      <span class="addr-verify-from">${escapeHtml(correction.from || '—')}</span>
      <span class="addr-verify-arrow" aria-hidden="true">→</span>
      <span class="addr-verify-to">${escapeHtml(correction.to)}</span>
    </li>`).join('')}</ul>
  </div>`;
}

/**
 * Draws whatever the verifier currently knows. Staleness is recomputed from the
 * live form on every call rather than tracked with a flag, so there is no way
 * for the panel to sit there claiming an edited address is deliverable.
 */
function renderDestinationVerification() {
  const panel = $('ship-dest-verify-panel');
  if (!panel) return;

  if (!_destVerification) {
    panel.hidden = true;
    panel.innerHTML = '';
    return;
  }

  if (_destVerification.pending) {
    panel.hidden = false;
    panel.className = 'addr-verify pending';
    panel.innerHTML = `<div class="addr-verify-skeleton" role="status" aria-live="polite">
      <span class="sr-only">Checking this address with Shippo…</span>
      <span class="addr-verify-skeleton-bar wide"></span>
      <span class="addr-verify-skeleton-bar"></span>
      <span class="addr-verify-skeleton-bar narrow"></span>
    </div>`;
    return;
  }

  const { result } = _destVerification;
  const verdict = verificationVerdict(result.status);
  const tone = VERIFY_TONE_CLASS[verdict.tone] || 'warn';
  const stale = _destVerification.signature !== addressSignature(readShippoDestinationAddress());

  const meta = [
    result.confidence?.score ? `${result.confidence.score} confidence` : '',
    result.addressType && result.addressType !== 'unknown' ? result.addressType : '',
    // Which validator answered matters when the verdicts differ in detail:
    // the legacy endpoint cannot report confidence or address type at all.
    result.source === 'v2' ? 'Shippo v2' : 'Shippo legacy',
  ].filter(Boolean).join(' · ');

  panel.hidden = false;
  panel.className = `addr-verify ${tone}${stale ? ' stale' : ''}`;
  panel.innerHTML = `
    <div class="addr-verify-head">
      <span class="addr-verify-badge ${tone}">${escapeHtml(verdict.icon)} ${escapeHtml(verdict.label)}</span>
      <span class="addr-verify-meta">${escapeHtml(meta)}</span>
      <button type="button" class="addr-verify-dismiss" onclick="dismissAddressVerification()" aria-label="Dismiss address check">×</button>
    </div>
    ${stale ? '<div class="addr-verify-stale-note">You have edited the address since this check — verify again before buying a label.</div>' : ''}
    <p class="addr-verify-summary">${escapeHtml(verdict.summary)}</p>
    ${renderVerificationReasons(result.reasons)}
    ${stale ? '' : renderVerificationCorrections(result.corrections)}
  `;
}

/** Re-renders so an edit flips the panel to its stale state as it is typed. */
function markDestinationVerificationStale() {
  if (_destVerification) renderDestinationVerification();
}

/**
 * Watches the destination fields so the panel can never outlive its address.
 * Bound once per element — initShippingTab runs on every visit to the tab.
 */
function bindDestinationVerificationWatchers() {
  ADDRESS_FIELD_LABELS.forEach(([field]) => {
    // The form's ids are the field names verbatim: st-name, st-street1, st-zip…
    const input = $(`st-${field}`);
    if (!input || input.dataset.verifyWatch === 'true') return;
    input.dataset.verifyWatch = 'true';
    input.addEventListener('input', markDestinationVerificationStale);
    input.addEventListener('change', markDestinationVerificationStale);
  });
}

/** Clears the panel — used by the dismiss button and by destination changes. */
function dismissAddressVerification() {
  _destVerification = null;
  renderDestinationVerification();
}

async function verifyDestinationAddress() {
  const shippoKey = TAX_CENTER.settings?.shippoKey || '';
  if (!shippoKey) {
    showToast('⚠️ Please configure your Shippo API Key first', 'warn');
    return;
  }

  const address = readShippoDestinationAddress();
  const blocker = addressValidationBlocker(address);
  if (blocker) {
    showToast(`⚠️ ${blocker}`, 'warn');
    return;
  }

  const button = $('ship-verify-btn');
  const priorLabel = button?.innerHTML;
  if (button) { button.disabled = true; button.innerHTML = 'Checking…'; }

  _destVerification = { signature: addressSignature(address), pending: true, result: null };
  renderDestinationVerification();

  try {
    const result = await fetchShippoAddressVerification(shippoKey, address);
    _destVerification = {
      signature: addressSignature(address),
      pending: false,
      result,
      address,
      at: new Date().toISOString(),
    };
    renderDestinationVerification();

    const verdict = verificationVerdict(result.status);
    const correctionNote = result.corrections.length
      ? ` — ${result.corrections.length} suggested correction${result.corrections.length === 1 ? '' : 's'}`
      : '';
    showToast(
      `${verdict.icon} ${verdict.label}${correctionNote}`,
      verdict.tone,
      result.status === 'valid' ? 4000 : 7000,
    );
  } catch (error) {
    console.error('Shippo address verification failed', error);
    _destVerification = null;
    renderDestinationVerification();
    showToast(`❌ Could not verify the address: ${error.message}`, 'err', 7000);
  } finally {
    if (button) { button.disabled = false; button.innerHTML = priorLabel ?? '🔍 Verify Address'; }
  }
}

/**
 * Writes Shippo's standardized fields into the destination form.
 *
 * Only the fields Shippo actually changed are touched, and only while the form
 * still holds the address that was verified — between rendering the panel and
 * clicking the button the publisher may have typed something, and overwriting
 * that with a stale recommendation would be a silent data loss.
 */
function applyVerifiedAddressCorrections() {
  const record = currentDestinationVerification();
  if (!record?.result?.corrections?.length) {
    showToast('That address check is out of date — verify again', 'warn');
    renderDestinationVerification();
    return;
  }

  const applied = [];
  record.result.corrections.forEach(correction => {
    const input = $(`st-${correction.field}`);
    if (!input) return;
    input.value = correction.to;
    applied.push(correction.label);
  });

  if (!applied.length) {
    showToast('No fields to update on this form', 'warn');
    return;
  }

  // The form now holds Shippo's own text, which is by definition what Shippo
  // recommended — so the verdict is re-pinned to it and the corrections list
  // collapses instead of offering the same changes a second time.
  const updated = readShippoDestinationAddress();
  _destVerification = {
    ...record,
    signature: addressSignature(updated),
    address: updated,
    result: { ...record.result, corrections: [], recommended: null },
  };
  onShippoDestCountryChange();
  renderDestinationVerification();
  showToast(`✓ Applied Shippo's standardized ${applied.length === 1 ? 'field' : 'fields'}: ${applied.join(', ')}`);
}

function onShippoBookPresetChange() {
  const select = $('ship-preset-book');
  if (!select || !select.value) return;

  const book = BOOKS[select.value];
  if (!book) return;

  const { specs, source } = resolveBookPresetSpecs(book);

  // Set quantity back to 1
  const qtyInput = $('sp-qty');
  if (qtyInput) qtyInput.value = '1';

  // Update inputs
  $('sp-length').value = specs.length;
  $('sp-width').value = specs.width;
  $('sp-height').value = specs.height;
  $('sp-dim-unit').value = specs.dim_unit;
  $('sp-weight').value = specs.weight;
  $('sp-weight-unit').value = specs.weight_unit;
  const customsValue = $('sp-customs-value');
  if (customsValue) customsValue.value = Math.max(1, parseFloat(book.listPrice || book.price || customsValue.value || 25)).toFixed(2);
  const customsDescription = $('sp-customs-description');
  if (customsDescription) customsDescription.value = `${book.title || 'Printed books'} - printed books`.slice(0, 80);
  const customsHs = $('sp-customs-hs');
  if (customsHs) customsHs.value = book.shipHsCode || '490199';

  // Update base specifications cache
  shippoBaseSpecs = {
    length: specs.length,
    width: specs.width,
    height: specs.height,
    dim_unit: specs.dim_unit,
    weight: specs.weight,
    weight_unit: specs.weight_unit
  };

  updateShippoCustomsTotalHint();

  if (source === 'generic') {
    showToast(`⚠ ${book.title} has no shipping specs — quoting on generic 10×8×1 in / 1.2 lb. Set its dimensions in the book editor.`, 'warn', 6000);
  } else {
    showToast(`✓ Package preset loaded: ${book.title}`);
  }
}

function isCanadaPostRate(rate) {
  const provider = String(rate?.provider || '').toLowerCase();
  return provider.includes('canada post') || provider.includes('canadapost') || provider.includes('postes canada');
}

function moneyAmount(rate) {
  const amount = parseFloat(rate?.amount);
  return Number.isFinite(amount) ? amount : Infinity;
}

function roundShippingCharge(amount) {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.ceil(amount) - 0.01;
}

function buildShippingChargePrediction(rates) {
  const usableRates = (rates || []).filter(r => Number.isFinite(moneyAmount(r))).sort((a, b) => moneyAmount(a) - moneyAmount(b));
  if (!usableRates.length) return null;

  const canadaPostRates = usableRates.filter(isCanadaPostRate);
  const benchmarkMode = $('sp-benchmark')?.value || 'canada_post';
  const handling = Math.max(0, parseFloat($('sp-handling')?.value) || 0);
  const margin = Math.max(0, parseFloat($('sp-margin')?.value) || 0);
  let benchmarkRate = usableRates[0];
  let benchmarkLabel = 'Cheapest returned rate';

  if (benchmarkMode === 'canada_post' && canadaPostRates.length) {
    benchmarkRate = canadaPostRates[0];
    benchmarkLabel = 'Cheapest Canada Post rate';
  } else if (benchmarkMode === 'median') {
    benchmarkRate = usableRates[Math.floor(usableRates.length / 2)];
    benchmarkLabel = 'Median returned rate';
  }

  const baseAmount = moneyAmount(benchmarkRate);
  const subtotal = baseAmount + handling;
  const recommended = roundShippingCharge(subtotal * (1 + margin));
  const cheapest = usableRates[0];
  const fastest = usableRates
    .filter(r => r.estimated_days !== null && r.estimated_days !== undefined)
    .sort((a, b) => parseInt(a.estimated_days) - parseInt(b.estimated_days))[0] || null;

  return {
    recommended,
    currency: benchmarkRate.currency || 'CAD',
    benchmarkRate,
    benchmarkLabel,
    handling,
    margin,
    canadaPostCount: canadaPostRates.length,
    cheapest,
    fastest
  };
}

function renderShippingChargePrediction(rates) {
  const card = $('ship-prediction-card');
  if (!card) return;
  const prediction = buildShippingChargePrediction(rates);
  if (!prediction) {
    card.style.display = 'none';
    card.innerHTML = '';
    return;
  }

  const benchmark = prediction.benchmarkRate;
  const fastest = prediction.fastest;
  const canadaPostNote = prediction.canadaPostCount
    ? `${prediction.canadaPostCount} Canada Post option${prediction.canadaPostCount === 1 ? '' : 's'} returned by Shippo.`
    : 'No Canada Post rate returned; prediction used your selected fallback.';

  card.innerHTML = `
    <div class="shipping-prediction-topline">
      <div>
        <div class="shipping-prediction-label">Recommended website charge</div>
        <div class="shipping-prediction-price">${prediction.recommended.toFixed(2)} ${escapeHtml(prediction.currency)}</div>
      </div>
      <span class="rate-badge cheapest">Prediction</span>
    </div>
    <div class="shipping-prediction-grid">
      <div><strong>${escapeHtml(prediction.benchmarkLabel)}</strong><span>${escapeHtml(benchmark.provider || 'Carrier')} · ${escapeHtml(benchmark.servicelevel?.name || 'Service')} · ${moneyAmount(benchmark).toFixed(2)} ${escapeHtml(benchmark.currency || prediction.currency)}</span></div>
      <div><strong>Buffer</strong><span>${prediction.handling.toFixed(2)} CAD handling + ${(prediction.margin * 100).toFixed(0)}% margin</span></div>
      <div><strong>Fastest option</strong><span>${fastest ? `${escapeHtml(fastest.provider || 'Carrier')} · ${fastest.estimated_days || '?'} day${parseInt(fastest.estimated_days) === 1 ? '' : 's'}` : 'No transit estimate returned'}</span></div>
    </div>
    <div class="shipping-prediction-note">${escapeHtml(canadaPostNote)} Use this as a pricing recommendation before publishing customer-facing flat rates.</div>
  `;
  card.style.display = 'block';
}

function isInternationalShipment(fromCountry, toCountry) {
  return normalizeCountryCode(fromCountry) !== normalizeCountryCode(toCountry);
}

function readShippoCustomsValue(id, fallback) {
  const value = $(id)?.value;
  return String(value || fallback).trim();
}

// Canada Post stopped accepting DDU for US-bound shipments on 2025-08-29: the
// rate call still returns Tracked Packet / Small Packet USA happily, and only
// the label purchase fails with "Service not available to US for DDU
// shipments". So the destination, not the rate list, has to pick the incoterm.
function resolveShippoIncoterm(destCountryCode) {
  const choice = String($('sp-incoterm')?.value || 'auto');
  if (choice !== 'auto') return choice;
  return normalizeCountryCode(destCountryCode) === 'US' ? 'DDP' : 'DDU';
}

const INCOTERM_PREF_PREFIX = 'lm-shippo-incoterm-';

// A deliberate DDU choice for, say, the UK should survive a reload the same way
// the saved origin does — but it is remembered per destination country, so it
// can never silently carry a non-DDP choice over to a US shipment.
function loadShippoIncotermPreference(destCountryCode) {
  const country = normalizeCountryCode(destCountryCode);
  if (!country) return;
  const select = $('sp-incoterm');
  if (!select) return;
  let stored = '';
  try { stored = localStorage.getItem(`${INCOTERM_PREF_PREFIX}${country}`) || ''; } catch (_) { /* private mode */ }
  const allowed = Array.from(select.options).map(option => option.value);
  select.value = allowed.includes(stored) ? stored : 'auto';
  renderShippoIncotermHint();
}

function saveShippoIncotermPreference(destCountryCode) {
  const country = normalizeCountryCode(destCountryCode);
  const choice = String($('sp-incoterm')?.value || 'auto');
  if (!country) return;
  try { localStorage.setItem(`${INCOTERM_PREF_PREFIX}${country}`, choice); } catch (_) { /* private mode */ }
}

function onShippoDestCountryChange() {
  loadShippoIncotermPreference($('st-country')?.value || '');
}

function onShippoIncotermChange() {
  saveShippoIncotermPreference($('st-country')?.value || '');
  renderShippoIncotermHint();
}

// The customs value input is per copy, but what Shippo declares is the line
// total. Show that total so the declared amount is visible before purchase
// rather than only discoverable in the API payload.
function updateShippoCustomsTotalHint() {
  const hint = $('sp-customs-total');
  if (!hint) return;
  const qty = Math.max(1, parseInt($('sp-qty')?.value, 10) || 1);
  const unitValue = Math.max(0.01, parseFloat($('sp-customs-value')?.value) || 25);
  hint.textContent = qty === 1
    ? `Declared to customs: ${unitValue.toFixed(2)} CAD`
    : `Declared to customs: ${qty} × ${unitValue.toFixed(2)} = ${(unitValue * qty).toFixed(2)} CAD`;
}

function renderShippoIncotermHint() {
  const hint = $('sp-incoterm-hint');
  if (!hint) return;
  const destCountry = normalizeCountryCode($('st-country')?.value || '');
  const originCountry = normalizeCountryCode($('sf-country')?.value || 'CA');
  if (!destCountry || !isInternationalShipment(originCountry, destCountry)) {
    hint.textContent = '';
    return;
  }
  const incoterm = resolveShippoIncoterm(destCountry);
  if (destCountry === 'US' && incoterm !== 'DDP') {
    hint.innerHTML = '<strong style="color:var(--red);">Canada Post rejects DDU labels to the US.</strong> Rates will still be quoted, but the purchase will fail — leave this on Auto or DDP for US destinations.';
  } else if (incoterm === 'DDP') {
    hint.textContent = 'DDP: duties and taxes are billed to you, not collected from the buyer on delivery.';
  } else {
    hint.textContent = `${incoterm}: the recipient pays any duties and taxes on delivery.`;
  }
}

function buildShippoCustomsDeclaration({ sfName, sfCountryCode, stCountryCode, spWeight, spWeightUnit }) {
  const quantity = Math.max(1, parseInt($('sp-qty')?.value, 10) || 1);
  const description = readShippoCustomsValue('sp-customs-description', 'Printed books');
  // sp-customs-value is the value of a single copy; Shippo's items[].value_amount
  // and net_weight are both totals for the line (quantity x per-unit).
  const unitValue = Math.max(0.01, parseFloat(readShippoCustomsValue('sp-customs-value', '25')) || 25);
  const hsCode = readShippoCustomsValue('sp-customs-hs', '490199');
  const originCountry = normalizeCountryCode(sfCountryCode) || 'CA';

  return {
    certify: true,
    certify_signer: sfName,
    contents_type: 'MERCHANDISE',
    contents_explanation: 'Printed books',
    non_delivery_option: 'RETURN',
    incoterm: resolveShippoIncoterm(stCountryCode),
    eel_pfc: 'NOEEI_30_37_a',
    items: [{
      description,
      quantity,
      net_weight: Math.max(0.01, spWeight).toFixed(2),
      mass_unit: spWeightUnit,
      value_amount: (unitValue * quantity).toFixed(2),
      value_currency: 'CAD',
      origin_country: originCountry,
      tariff_number: hsCode
    }]
  };
}

const SHIPPO_IGNORED_KEYS = new Set(['text', 'message', 'detail', 'error', 'source', 'carrier', 'provider', 'code']);

function collectShippoMessages(value, prefix = '') {
  const messages = [];
  if (!value) return messages;
  if (typeof value === 'string') return [prefix ? `${prefix}: ${value}` : value];

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      const label = prefix && typeof item !== 'string' ? `${prefix} ${i + 1}` : prefix;
      messages.push(...collectShippoMessages(item, label));
    }
    return messages;
  }

  if (typeof value === 'object') {
    const direct = value.text || value.message || value.detail || value.error;
    if (direct && typeof direct !== 'object') {
      const source = value.source || value.carrier || value.provider || value.code || prefix;
      messages.push(source ? `${source}: ${direct}` : String(direct));
    }
    for (const [key, item] of Object.entries(value)) {
      if (SHIPPO_IGNORED_KEYS.has(key)) continue;
      messages.push(...collectShippoMessages(item, prefix ? `${prefix}.${key}` : key));
    }
  }
  return messages;
}

function renderShippoDiagnostics(data, fallbackMessage) {
  const rawMessages = [];
  if (data) {
    rawMessages.push(...collectShippoMessages(data.messages, 'message'));
    rawMessages.push(...collectShippoMessages(data.object_messages, 'message'));
    if (data.address_from) {
      rawMessages.push(...collectShippoMessages(data.address_from.messages, 'origin'));
    }
    if (data.address_to) {
      rawMessages.push(...collectShippoMessages(data.address_to.messages, 'destination'));
    }
    if (data.parcels && Array.isArray(data.parcels)) {
      const parcelMessages = data.parcels.map(p => p?.messages).filter(Boolean);
      rawMessages.push(...collectShippoMessages(parcelMessages, 'parcel'));
    }
  }

  const uniqueMessages = Array.from(new Set(rawMessages.filter(Boolean)));

  let detailsHtml = '';
  if (uniqueMessages.length > 0) {
    let listItemsHtml = '';
    for (let i = 0; i < Math.min(uniqueMessages.length, 8); i++) {
      listItemsHtml += `<li>${escapeHtml(uniqueMessages[i])}</li>`;
    }
    detailsHtml = `<ul style="margin:12px 0 0; padding-left:18px; text-align:left; line-height:1.55;">${listItemsHtml}</ul>`;
  } else {
    detailsHtml = `<div style="margin-top:12px; font-size:12px; line-height:1.55;">${escapeHtml(fallbackMessage)}</div>`;
  }

  return `
    <div style="text-align:center; padding:3rem 1rem; color:var(--text3);">
      <div style="font-size:32px; margin-bottom:12px;">⚠️</div>
      <div>No rates were returned by Shippo.</div>
      ${detailsHtml}
      <div style="margin-top:12px; font-size:12px; line-height:1.55; color:var(--text3);">The API key was accepted because Shippo created a shipment response; this usually points to address validation, unsupported origin/destination service, package specs, or missing/enabled carrier accounts rather than a bad key.</div>
    </div>`;
}

async function buyShippoLabel(rateId, provider, serviceName, amount, currency) {
  const shippoKey = TAX_CENTER.settings?.shippoKey || '';
  if (!shippoKey) {
    showToast('⚠️ Please configure your Shippo API Key first', 'warn');
    return;
  }

  // A label bought for an address Shippo has already called undeliverable is
  // money spent on a parcel that comes back. The check only fires when the
  // publisher actually verified *this* address and Shippo rejected it — an
  // unverified destination buys as it always did, so the verifier adds a guard
  // rather than a gate.
  const verification = currentDestinationVerification();
  if (verification?.result && !isDeliverable(verification.result)) {
    const reason = verification.result.reasons[0]?.description || 'Shippo could not find this address.';
    const overridden = await confirmDialog(
      `Shippo says this destination is undeliverable.\n\n${reason}\n\nBuy the label anyway?`,
      { title: 'Undeliverable address', okLabel: 'Buy anyway', cancelLabel: 'Go back', danger: true },
    );
    if (!overridden) return;
  }

  const confirmed = await confirmDialog(`Confirm purchasing shipping label?\n\nCarrier: ${provider}\nService: ${serviceName}\nCost: ${amount} ${currency}`, {
    title: 'Purchase Shipping Label',
    okLabel: 'Purchase',
    cancelLabel: 'Cancel'
  });
  if (!confirmed) return;

  showToast('⚡ Purchasing label from Shippo...');

  try {
    const payload = {
      rate: rateId,
      async: false
    };

    const resp = await fetch('https://api.goshippo.com/transactions/', {
      method: 'POST',
      headers: {
        'Authorization': `ShippoToken ${shippoKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => null);
      throw new Error(err ? JSON.stringify(err) : `API Error ${resp.status}`);
    }

    const data = await resp.json();
    if (data.status !== 'SUCCESS') {
      const msgs = (data.messages || []).map(m => m.text).join('; ') || 'Transaction failed.';
      throw new Error(`Shippo returned status ${data.status}: ${msgs}`);
    }

    const labelUrl = data.label_url;
    const trackingNumber = data.tracking_number;
    const transactionId = data.object_id;

    if (labelUrl) {
      window.open(labelUrl, '_blank');
    }

    // Auto-mark prefilled order as Shipped
    const selectedOrderNumber = normalizeShippingOrderNumber($('ship-prefill-dest')?.dataset.orderNumber);
    if (selectedOrderNumber) {
      const s = getState();
      const histItem = s.hist.find(h => normalizeShippingOrderNumber(h.num) === selectedOrderNumber);
      if (histItem) {
        histItem.shipped = true;
        histItem.shippedDate = today();
        histItem.trackingNumber = trackingNumber || '';
        saveState(activeBook);
        renderHist();
      }
    }

    // Auto-log as expense. This has to land in TAX_CENTER.businessExpenses with
    // the same shape processShippoTxToExpense produces: that is the only ledger
    // the shipping P&L, carrier scorecard and reconciliation worklist read, and
    // it is also what the Shippo API import dedupes against by `ref`. Writing
    // to the per-book state.expenses instead left every in-app purchase
    // invisible to the analysis hub until a later import re-added it as a
    // second, duplicate line for the same transaction.
    const ref = 'shippo:' + transactionId;
    if (!TAX_CENTER.businessExpenses) TAX_CENTER.businessExpenses = [];
    if (!TAX_CENTER.settings) TAX_CENTER.settings = {};
    const alreadyLogged = TAX_CENTER.businessExpenses.some(e => String(e?.ref || '') === ref);

    if (!alreadyLogged) {
      const purchaseCurrency = String(currency || 'CAD').toUpperCase();
      const purchaseAmount = Number(amount);
      const date = today();

      let fxRate = purchaseCurrency === 'CAD' ? 1 : 0;
      if (purchaseCurrency !== 'CAD') {
        try { fxRate = (await fetchHistoricalRate(purchaseCurrency, 'CAD', date))?.rate || 0; } catch (_) { /* continue */ }
        if (!fxRate) {
          try { fxRate = (await fetchLiveRate(purchaseCurrency, 'CAD'))?.rate || 0; } catch (_) { /* continue */ }
        }
        if (!fxRate) fxRate = _fxRateCache[`${purchaseCurrency}_CAD`] || 0;
      }
      const fxMissing = !fxRate;

      const localReceipt = labelUrl ? await saveShippoLabelLocally(labelUrl, transactionId) : null;

      const expense = {
        id: Date.now(),
        desc: `Shippo shipping label${trackingNumber ? ` #${trackingNumber}` : ''} — ${provider} ${serviceName}`,
        cat: 'Shipping & Postage',
        currency: purchaseCurrency,
        amount: purchaseAmount,
        origCurrency: purchaseCurrency,
        origAmount: purchaseAmount,
        fxRate: fxMissing ? null : fxRate,
        baseAmount: fxMissing ? null : roundCents(purchaseAmount * fxRate),
        fxMissing,
        date,
        ref,
        receipt: localReceipt || labelUrl,
        trackingUrl: data.tracking_url_provider || '',
        trip: '',
      };

      // Reconcile against the order right here rather than waiting for the next
      // API import to link it. The transaction echoes the shipment metadata,
      // but the picker's own order number is the authoritative source, so pass
      // it through as the shipment metadata enrichShippoExpense reads.
      const shipmentContext = selectedOrderNumber ? { metadata: `order_number:${selectedOrderNumber}` } : {};
      TAX_CENTER.businessExpenses.unshift(
        enrichShippoExpense(expense, data, shipmentContext, {}, getShippingReconciliationOrders()),
      );
      TAX_CENTER.settings.shippoImportedObjectIds =
        Array.from(new Set([...(TAX_CENTER.settings.shippoImportedObjectIds || []), transactionId])).slice(-10000);
      await saveTaxCenter().catch(e => console.warn('Shippo label expense save failed', e));
      renderTaxCenter();
      renderShippingAnalysisHub();
    }
    renderExpenses();

    showToast(`✓ Label purchased! Tracking: ${trackingNumber || 'N/A'}`, 'ok', 6000);
  } catch (err) {
    console.error('Failed to buy Shippo label:', err);
    showToast(`❌ Purchase failed: ${err.message}`, 'err');
  }
}

async function calculateShippoRates() {
  const shippoKey = TAX_CENTER.settings?.shippoKey || '';
  if (!shippoKey) {
    showToast('⚠️ Please configure your Shippo API Key first', 'warn');
    return;
  }

  // Gather values
  const sfName = $('sf-name').value.trim();
  const sfCompany = $('sf-company').value.trim();
  const sfPhone = $('sf-phone').value.trim();
  const sfStreet1 = $('sf-street1').value.trim();
  const sfStreet2 = $('sf-street2').value.trim();
  const sfCity = $('sf-city').value.trim();
  const sfState = $('sf-state').value.trim();
  const sfZip = $('sf-zip').value.trim();
  const sfCountry = $('sf-country').value;
  const sfCountryCode = normalizeCountryCode(sfCountry);

  const stName = $('st-name').value.trim();
  const stCompany = $('st-company').value.trim();
  const stPhone = $('st-phone').value.trim();
  const stStreet1 = $('st-street1').value.trim();
  const stStreet2 = $('st-street2').value.trim();
  const stCity = $('st-city').value.trim();
  const stState = $('st-state').value.trim();
  const stZip = $('st-zip').value.trim();
  const stCountry = $('st-country').value;
  const stCountryCode = normalizeCountryCode(stCountry);

  const spLength = parseFloat($('sp-length').value) || 0;
  const spWidth = parseFloat($('sp-width').value) || 0;
  const spHeight = parseFloat($('sp-height').value) || 0;
  const spDimUnit = $('sp-dim-unit').value;
  const spWeight = parseFloat($('sp-weight').value) || 0;
  const spWeightUnit = $('sp-weight-unit').value;

  // Validation
  if (!sfName || !sfStreet1 || !sfCity || !sfZip) {
    showToast('⚠️ Origin address (Sender Name, Street, City, Zip) is required', 'warn');
    return;
  }
  if (!stName || !stStreet1 || !stCity || !stZip) {
    showToast('⚠️ Destination address (Recipient Name, Street, City, Zip) is required', 'warn');
    return;
  }
  if (spLength <= 0 || spWidth <= 0 || spHeight <= 0 || spWeight <= 0) {
    showToast('⚠️ Parcel dimensions and weight must be positive numbers', 'warn');
    return;
  }
  if (!sfCountryCode || !stCountryCode) {
    showToast('⚠️ Choose a supported origin and destination country before rating', 'warn');
    return;
  }

  const isInternational = isInternationalShipment(sfCountryCode, stCountryCode);
  if (isInternational && (!sfPhone || !stPhone)) {
    showToast('⚠️ International Shippo rates need sender and recipient phone numbers for customs/carrier rating', 'warn');
    return;
  }

  // Save Origin default if checked
  if ($('ship-save-origin').checked) {
    localStorage.setItem('lm-shippo-origin-name', sfName);
    localStorage.setItem('lm-shippo-origin-company', sfCompany);
    localStorage.setItem('lm-shippo-origin-phone', sfPhone);
    localStorage.setItem('lm-shippo-origin-street1', sfStreet1);
    localStorage.setItem('lm-shippo-origin-street2', sfStreet2);
    localStorage.setItem('lm-shippo-origin-city', sfCity);
    localStorage.setItem('lm-shippo-origin-state', sfState);
    localStorage.setItem('lm-shippo-origin-zip', sfZip);
    localStorage.setItem('lm-shippo-origin-country', sfCountryCode);
  }

  const placeholder = $('ship-results-placeholder');
  const loading = $('ship-results-loading');
  const list = $('ship-results-list');

  if (placeholder) placeholder.style.display = 'none';
  if (loading) loading.style.display = 'flex';
  if (list) list.style.display = 'none';
  renderShippingChargePrediction([]);

  try {
    const payload = {
      address_from: {
        name: sfName,
        company: sfCompany,
        phone: sfPhone,
        street1: sfStreet1,
        street2: sfStreet2,
        city: sfCity,
        state: sfState,
        zip: sfZip,
        country: sfCountryCode
      },
      address_to: {
        name: stName,
        company: stCompany,
        phone: stPhone,
        street1: stStreet1,
        street2: stStreet2,
        city: stCity,
        state: stState,
        zip: stZip,
        country: stCountryCode
      },
      parcels: [{
        length: spLength,
        width: spWidth,
        height: spHeight,
        distance_unit: spDimUnit,
        weight: spWeight,
        mass_unit: spWeightUnit
      }],
      async: false
    };

    const selectedOrderNumber = normalizeShippingOrderNumber($('ship-prefill-dest')?.dataset.orderNumber);
    if (selectedOrderNumber) payload.metadata = `order_number:${selectedOrderNumber.slice(0, 100)}`;

    if (isInternational) {
      payload.customs_declaration = buildShippoCustomsDeclaration({ sfName, sfCountryCode, stCountryCode, spWeight, spWeightUnit });
    }

    const resp = await fetch('https://api.goshippo.com/shipments/', {
      method: 'POST',
      headers: {
        'Authorization': `ShippoToken ${shippoKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (loading) loading.style.display = 'none';

    if (!resp.ok) {
      const errData = await resp.json().catch(() => null);
      let errMsg = `Shippo API Error ${resp.status}`;
      if (errData) {
        if (typeof errData === 'string') {
          errMsg += `: ${errData}`;
        } else if (Array.isArray(errData)) {
          errMsg += `: ${errData.join(', ')}`;
        } else {
          const errors = [];
          for (const [key, val] of Object.entries(errData)) {
            errors.push(`${key}: ${Array.isArray(val) ? val.join(', ') : JSON.stringify(val)}`);
          }
          errMsg += `<br><span style="font-size:12px; font-weight:normal; display:block; margin-top:8px;">${errors.join('<br>')}</span>`;
        }
      }
      if (list) {
        list.innerHTML = `<div class="card" style="border-color:var(--red); background:var(--red-bg); padding:1rem; color:var(--red); font-size:13px; font-weight:600; line-height:1.45;">${errMsg}</div>`;
        list.style.display = 'flex';
      }
      return;
    }

    const data = await resp.json();
    const rates = data.rates || [];

    if (rates.length === 0) {
      if (list) {
        list.innerHTML = renderShippoDiagnostics(data, 'Verify that the address locations are serviceable, package weight is correct, and at least one carrier account can rate this route.');
        list.style.display = 'flex';
      }
      return;
    }

    renderShippingChargePrediction(rates);

    // Sort rates by amount ascending to find the cheapest
    const sortedByPrice = [...rates].sort((a, b) => parseFloat(a.amount) - parseFloat(b.amount));
    const cheapestId = sortedByPrice[0]?.object_id;

    // Filter rates with estimated days to find the fastest
    const ratesWithDays = rates.filter(r => r.estimated_days !== null && r.estimated_days !== undefined);
    let fastestId = null;
    if (ratesWithDays.length > 0) {
      const sortedByDays = [...ratesWithDays].sort((a, b) => parseInt(a.estimated_days) - parseInt(b.estimated_days));
      fastestId = sortedByDays[0]?.object_id;
    }

    if (list) {
      list.innerHTML = sortedByPrice.map(r => {
        const logoUrl = r.provider_image_75 || '';
        const isCheapest = r.object_id === cheapestId;
        const isFastest = r.object_id === fastestId && !isCheapest;

        let badgesHtml = '';
        if (isCheapest) badgesHtml += '<span class="rate-badge cheapest">Cheapest</span>';
        if (isFastest) badgesHtml += '<span class="rate-badge fastest">Fastest</span>';
        if (isCanadaPostRate(r)) badgesHtml += '<span class="rate-badge canada-post">Canada Post</span>';

        const transitDays = r.estimated_days
          ? `${r.estimated_days} ${parseInt(r.estimated_days) === 1 ? 'day' : 'days'}`
          : '';
        const transitInfo = [transitDays, r.duration_terms].filter(Boolean).join(' · ');

        return `
          <div class="rate-card">
            <div class="rate-info">
              <div class="rate-logo">
                ${logoUrl ? `<img src="${logoUrl}" alt="${r.provider}">` : `<span style="font-size:9px; font-weight:700;">${r.provider.slice(0, 3)}</span>`}
              </div>
              <div class="rate-details">
                <div style="display:flex; align-items:center; gap:8px;">
                  <span class="rate-carrier">${escapeHtml(r.provider)}</span>
                  <div class="rate-badges">${badgesHtml}</div>
                </div>
                <div class="rate-service">${escapeHtml(r.servicelevel.name)}</div>
                ${transitInfo ? `<div class="rate-transit">${escapeHtml(transitInfo)}</div>` : ''}
              </div>
            </div>
            <div class="rate-price-area" style="display:flex; flex-direction:column; align-items:flex-end; gap:6px;">
              <div class="rate-price">${parseFloat(r.amount).toFixed(2)} ${escapeHtml(r.currency)}</div>
              <button class="btn gold sm" onclick="buyShippoLabel('${r.object_id}', '${escapeHtml(r.provider)}', '${escapeHtml(r.servicelevel.name)}', ${parseFloat(r.amount)}, '${escapeHtml(r.currency)}')" style="margin:0; padding:4px 8px; font-size:10px; font-weight:600; height:auto; line-height:1;">Buy Label</button>
            </div>
          </div>
        `;
      }).join('');
      list.style.display = 'flex';
    }

  } catch (err) {
    console.error(err);
    if (loading) loading.style.display = 'none';
    if (list) {
      list.innerHTML = `<div class="card" style="border-color:var(--red); background:var(--red-bg); padding:1rem; color:var(--red); font-weight:600; font-size:13px;">❌ Error fetching rates: ${escapeHtml(err.message)}</div>`;
      list.style.display = 'flex';
    }
  }
}

async function editPostageCost(bookId, orderIdentifier) {
  const s = states[bookId];
  if (!s || !s.hist) return;
  const h = s.hist.find(x => x.id === orderIdentifier || x.num === orderIdentifier);
  if (!h) return;

  const current = h.postagePaid || 0;
  const input = prompt(`Enter postage cost (shipping cost you paid) for order ${h.num} (in CAD):`, current);
  if (input === null) return;

  const val = Number(input);
  if (isNaN(val) || val < 0) {
    showToast('Invalid postage cost amount', 'err');
    return;
  }

  h.postagePaid = val;
  h.manualPostagePaid = true;
  await window.saveState(bookId);
  showToast('Postage cost updated', 'ok');
  renderShippingAnalysisHub();
}

async function unlinkManualPostage(bookId, orderIdentifier) {
  const s = states[bookId];
  if (!s || !s.hist) return;
  const h = s.hist.find(x => x.id === orderIdentifier || x.num === orderIdentifier);
  if (!h) return;

  delete h.postagePaid;
  delete h.manualPostagePaid;
  await window.saveState(bookId);
  showToast('Manual postage cleared', 'ok');
  renderShippingAnalysisHub();
}

async function dismissShippingAnalysisOrder(bookId, orderIdentifier) {
  const s = states[bookId];
  if (!s || !s.hist) return;
  const h = s.hist.find(x => x.id === orderIdentifier || x.num === orderIdentifier);
  if (!h) return;

  const ok = await confirmDialog(`Are you sure you want to dismiss order "${h.num}" from the shipping ledger and calculations? It will be hidden.`, {
    danger: false,
    okLabel: 'Dismiss Order'
  });
  if (!ok) return;

  h.excludeFromShipping = true;
  await window.saveState(bookId);
  showToast('Order dismissed from shipping', 'ok');
  renderShippingAnalysisHub();
}

async function restoreShippingAnalysisOrder(bookId, orderIdentifier) {
  const s = states[bookId];
  if (!s || !s.hist) return;
  const h = s.hist.find(x => x.id === orderIdentifier || x.num === orderIdentifier);
  if (!h) return;

  delete h.excludeFromShipping;
  await window.saveState(bookId);
  showToast('Order restored to shipping ledger', 'ok');
  renderShippingAnalysisHub();
}

function toggleAllShipAnalysisOrders(checked) {
  const checkboxes = document.querySelectorAll('.ship-order-checkbox');
  checkboxes.forEach(cb => cb.checked = checked);
  updateShipAnalysisBatchActionUI();
}

function updateShipAnalysisBatchActionUI() {
  const checkboxes = document.querySelectorAll('.ship-order-checkbox:checked');
  const batchActions = $('ship-analysis-batch-actions');
  if (!batchActions) return;
  if (checkboxes.length > 0) {
    batchActions.style.display = 'flex';
    $('ship-analysis-batch-count').textContent = checkboxes.length;
  } else {
    batchActions.style.display = 'none';
    $('selectAllShipOrders').checked = false;
  }
}

async function batchDismissShippingAnalysisOrders() {
  const checkboxes = document.querySelectorAll('.ship-order-checkbox:checked');
  if (checkboxes.length === 0) return;

  const ok = await confirmDialog(`Are you sure you want to dismiss ${checkboxes.length} selected orders from the calculations?`, {
    danger: false,
    okLabel: 'Dismiss Selected'
  });
  if (!ok) return;

  const updatesByBook = {};
  checkboxes.forEach(cb => {
    const [bookId, orderIdentifier] = cb.value.split('|');
    const s = states[bookId];
    if (s && s.hist) {
      const h = s.hist.find(x => x.id === orderIdentifier || x.num === orderIdentifier);
      if (h) {
        h.excludeFromShipping = true;
        updatesByBook[bookId] = true;
      }
    }
  });

  const promises = Object.keys(updatesByBook).map(bookId => window.saveState(bookId));
  await Promise.all(promises);

  showToast(`Dismissed ${checkboxes.length} orders`, 'ok');
  renderShippingAnalysisHub();
}

let shipAnalysisBookFilter = 'all';
let shipAnalysisMarginFilter = 'all';
let shipAnalysisCarrierFilter = 'all';
let shipAnalysisRegionFilter = 'all';
let shipAnalysisWeightFilter = 'all';
let shipAnalysisSearchQuery = '';
let shipAnalysisRecentlySavedOrderId = '';
let shipAnalysisCurrentPage = 1;
const SHIP_ANALYSIS_PAGE_SIZE = 10;

function toggleShipAnalysisCarrierFilter(carrier) {
  shipAnalysisCarrierFilter = shipAnalysisCarrierFilter === carrier ? 'all' : carrier;
  shipAnalysisCurrentPage = 1;
  renderShippingAnalysisHub();
}

function toggleShipAnalysisRegionFilter(region) {
  shipAnalysisRegionFilter = shipAnalysisRegionFilter === region ? 'all' : region;
  shipAnalysisCurrentPage = 1;
  renderShippingAnalysisHub();
}

function toggleShipAnalysisWeightFilter(weightBand) {
  shipAnalysisWeightFilter = shipAnalysisWeightFilter === weightBand ? 'all' : weightBand;
  shipAnalysisCurrentPage = 1;
  renderShippingAnalysisHub();
}

function clearAllShipAnalysisFilters() {
  shipAnalysisCarrierFilter = 'all';
  shipAnalysisRegionFilter = 'all';
  shipAnalysisWeightFilter = 'all';
  shipAnalysisBookFilter = 'all';
  shipAnalysisMarginFilter = 'all';
  shipAnalysisSearchQuery = '';
  shipAnalysisCurrentPage = 1;
  const bSel = $('ship-analysis-book-filter');
  if (bSel) bSel.value = 'all';
  const sInput = $('ship-analysis-search');
  if (sInput) sInput.value = '';
  renderShippingAnalysisHub();
}

function changeShipAnalysisPage(page) {
  shipAnalysisCurrentPage = page;
  renderShippingAnalysisHub();
}

function onShipAnalysisBookFilterChange() {
  const select = $('ship-analysis-book-filter');
  if (select) {
    shipAnalysisBookFilter = select.value;
  }
  shipAnalysisCurrentPage = 1;
  renderShippingAnalysisHub();
}

function setShipAnalysisMarginFilter(val) {
  shipAnalysisMarginFilter = val;
  shipAnalysisCurrentPage = 1;
  renderShippingAnalysisHub();
}

function onShipAnalysisSearch(val) {
  shipAnalysisSearchQuery = String(val || '').trim().toLowerCase();
  shipAnalysisCurrentPage = 1;
  renderShippingAnalysisHub();
}

async function onInlinePostageChange(inputEl) {
  const bookId = inputEl.dataset.bookId;
  const orderIdentifier = inputEl.dataset.orderId;
  const val = parseFloat(inputEl.value);

  if (isNaN(val) || val < 0) {
    showToast('Invalid postage cost amount', 'err');
    // Restore previous value
    renderShippingAnalysisHub();
    return;
  }

  const s = states[bookId];
  if (!s || !s.hist) return;
  const h = s.hist.find(x => x.id === orderIdentifier || x.num === orderIdentifier);
  if (!h) return;

  h.postagePaid = val;
  h.manualPostagePaid = true;
  await window.saveState(bookId);
  
  shipAnalysisRecentlySavedOrderId = orderIdentifier;
  showToast(`Postage cost updated for Order #${h.num}`, 'ok');
  renderShippingAnalysisHub();

  setTimeout(() => {
    shipAnalysisRecentlySavedOrderId = '';
  }, 1500);
}

async function confirmSuggestedShippoLink(orderNum, txRef) {
  const expense = (TAX_CENTER.businessExpenses || []).find(e => e.ref === txRef);
  if (!expense) {
    showToast('Shippo expense not found. Try re-syncing Shippo.', 'err');
    return;
  }
  try {
    await persistManualShippingLink(expense, orderNum, () => saveTaxCenter());
    showToast(`Linked ${orderNum} to ${txRef.replace('shippo:', '')} ✓`, 'success');
    renderShippingAnalysisHub();

    const row = document.getElementById(`shipping-ledger-row-${escapeHtml(orderNum)}`);
    if (row) {
      row.classList.add('flash-highlight');
      setTimeout(() => row.classList.remove('flash-highlight'), 2000);
    }
  } catch (err) {
    console.error('confirmSuggestedShippoLink failed', err);
    showToast('Could not save link. Please try again.', 'err');
  }
}

function openManualShippoLinkModal(orderNum) {
  const unlinkedExpenses = (TAX_CENTER.businessExpenses || []).filter(e =>
    String(e?.ref || '').startsWith('shippo:') &&
    e.shippingMatchStatus !== 'matched'
  );

  const rows = unlinkedExpenses.map(e => {
    const txId = e.ref.replace('shippo:', '');
    const amount = (Number(e.baseAmount) || Number(e.amount) || 0).toFixed(2);
    const recipient = escapeHtml(e.recipientName || 'Unknown recipient');
    const date = escapeHtml(e.date || '—');
    return `
      <tr class="shippo-link-row" data-ref="${escapeHtml(e.ref)}" data-name="${recipient.toLowerCase()}">
        <td class="mono">${txId.slice(0, 16)}…</td>
        <td>${recipient}</td>
        <td>${date}</td>
        <td style="text-align:right; font-weight:600;">CA$${amount}</td>
        <td style="text-align:right; width:60px;">
          <button class="manual-link-btn" onclick="doManualShippoLink('${escapeHtml(orderNum)}', '${escapeHtml(e.ref)}')">Link</button>
        </td>
      </tr>`;
  }).join('');

  const modalHtml = `
    <div id="manual-link-modal-backdrop" class="manual-link-backdrop" onclick="if(event.target===this)closeManualShippoLinkModal()">
      <div class="manual-link-modal">
        <div class="manual-link-header">
          <div>
            <div class="manual-link-eyebrow">Manual Shippo Link</div>
            <div class="manual-link-title">Link a postage label → <span>${escapeHtml(orderNum)}</span></div>
          </div>
          <button class="manual-link-close" onclick="closeManualShippoLinkModal()" aria-label="Close">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        <div class="manual-link-body">
          <input type="text" class="manual-link-search" placeholder="Search by recipient name…" oninput="filterManualShippoLinkRows(this.value)" />
          ${rows ? `
            <div class="manual-link-table-container">
              <table class="manual-link-table">
                <thead>
                  <tr>
                    <th>Shippo ID</th>
                    <th>Recipient</th>
                    <th>Date</th>
                    <th style="text-align:right;">Amount</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody id="manual-link-modal-rows">
                  ${rows}
                </tbody>
              </table>
            </div>` : `<div class="manual-link-empty">No unlinked Shippo labels found. Try syncing Shippo first.</div>`}
        </div>
      </div>
    </div>`;

  const backdrop = document.createElement('div');
  backdrop.innerHTML = modalHtml;
  document.body.appendChild(backdrop.firstElementChild);
}

function filterManualShippoLinkRows(query) {
  const tbody = $('manual-link-modal-rows');
  if (!tbody) return;
  const q = (query || '').toLowerCase().trim();
  tbody.querySelectorAll('.shippo-link-row').forEach(row => {
    const name = (row.dataset.name || '').toLowerCase();
    row.style.display = (!q || name.includes(q)) ? '' : 'none';
  });
}

async function doManualShippoLink(orderNum, txRef) {
  const expense = (TAX_CENTER.businessExpenses || []).find(e => e.ref === txRef);
  if (!expense) {
    showToast('Expense not found.', 'err');
    return;
  }
  try {
    await persistManualShippingLink(expense, orderNum, () => saveTaxCenter());
    showToast(`Linked ${orderNum} to ${txRef.replace('shippo:', '')} ✓`, 'success');
    closeManualShippoLinkModal();
    renderShippingAnalysisHub();

    const row = document.getElementById(`shipping-ledger-row-${escapeHtml(orderNum)}`);
    if (row) {
      row.classList.add('flash-highlight');
      setTimeout(() => row.classList.remove('flash-highlight'), 2000);
    }
  } catch (err) {
    console.error('doManualShippoLink failed', err);
    showToast('Could not save link. Please try again.', 'err');
  }
}

function closeManualShippoLinkModal() {
  const el = $('manual-link-modal-backdrop');
  if (el) el.remove();
}

async function unlinkShippoExpense(txRef) {
  const expense = (TAX_CENTER.businessExpenses || []).find(e => e.ref === txRef);
  if (!expense) {
    showToast('Expense not found.', 'err');
    return;
  }

  delete expense.shippingOrderNumber;
  delete expense.shippingMatchMethod;
  expense.shippingMatchStatus = 'unmatched';

  try {
    await saveTaxCenter();
    showToast(`Unlinked ${txRef.replace('shippo:', '')}`, 'ok');
    renderShippingAnalysisHub();
  } catch (err) {
    console.error('unlinkShippoExpense failed', err);
    showToast('Could not unlink. Please try again.', 'err');
  }
}

function getShipRecoMode() {
  return localStorage.getItem(`lm-ship-reco-mode-${shipAnalysisBookFilter}`) || 'blended';
}

function setShipRecoMode(val) {
  localStorage.setItem(`lm-ship-reco-mode-${shipAnalysisBookFilter}`, val);
}

function getShipRecoPercentile() {
  const val = localStorage.getItem(`lm-ship-reco-pct-${shipAnalysisBookFilter}`);
  return val ? parseInt(val, 10) : 75;
}

function setShipRecoPercentile(val) {
  localStorage.setItem(`lm-ship-reco-pct-${shipAnalysisBookFilter}`, val.toString());
}

function getShipWeightOverride() {
  return localStorage.getItem(`lm-ship-weight-override-${shipAnalysisBookFilter}`) || 'default';
}

function setShipWeightOverride(val) {
  localStorage.setItem(`lm-ship-weight-override-${shipAnalysisBookFilter}`, val);
}

function onShipInsightsToggle(isOpen) {
  localStorage.setItem(`lm-ship-insights-open-${shipAnalysisBookFilter}`, isOpen ? 'true' : 'false');
}

function onShipRecoModeChange(val) {
  setShipRecoMode(val);
  renderShippingAnalysisHub();
}

function onShipRecoPercentileChange(val) {
  setShipRecoPercentile(val);
  renderShippingAnalysisHub();
}

function onShipRecoWeightSelectChange(val) {
  if (val === 'custom') {
    setShipWeightOverride('1.0');
  } else {
    setShipWeightOverride(val);
  }
  renderShippingAnalysisHub();
}

function onShipRecoCustomWeightChange(val) {
  const parsed = Math.max(0.01, parseFloat(val) || 0.8);
  setShipWeightOverride(parsed.toString());
  renderShippingAnalysisHub();
}

function getPercentile(arr, pct) {
  if (!arr || arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((pct / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function getMean(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function getFallbackRates(region, w) {
  // Canada Post Solutions for Small Business / Tracked Packet rates
  if (w < 0.5) {
    if (region === 'ON') return { base: 12.50, addon: 3.50 };
    if (region === 'CA') return { base: 17.50, addon: 4.50 };
    if (region === 'US') return { base: 18.00, addon: 5.00 };
    return { base: 26.50, addon: 12.00 };
  } else if (w <= 1) {
    if (region === 'ON') return { base: 14.50, addon: 5.00 };
    if (region === 'CA') return { base: 20.00, addon: 6.50 };
    if (region === 'US') return { base: 22.50, addon: 8.50 };
    return { base: 35.00, addon: 15.00 };
  } else if (w <= 2) {
    if (region === 'ON') return { base: 17.00, addon: 8.00 };
    if (region === 'CA') return { base: 24.50, addon: 10.00 };
    if (region === 'US') return { base: 27.00, addon: 12.00 };
    return { base: 48.00, addon: 18.00 };
  } else {
    // For packages over 2 kg, Canada Post applies per-kg incremental rates above 2 kg
    const extraKg = Math.ceil(w - 2);
    if (region === 'ON') return { base: 21.00 + (extraKg - 1) * 2.50, addon: 10.00 };
    if (region === 'CA') return { base: 29.50 + (extraKg - 1) * 3.50, addon: 12.50 };
    if (region === 'US') return { base: 34.00 + (extraKg - 1) * 4.50, addon: 15.00 };
    return { base: 65.00 + (extraKg - 1) * 8.00, addon: 22.00 };
  }
}

function getSmartShippingRecommendations(allOrders, shippoExpenses, optWeightOverride) {
  const activeBookId = shipAnalysisBookFilter;
  let book = null;
  if (activeBookId !== 'all') {
    book = BOOK_LIST.find(b => b.id === activeBookId);
  }
  const bookWeightKg = getWeightInKg(1, book || BOOK_LIST[0]);
  
  const weightOverride = optWeightOverride || getShipWeightOverride();
  let weightKg = bookWeightKg;
  if (weightOverride === 'under_0.5') weightKg = 0.3;
  else if (weightOverride === '0.5_1') weightKg = 0.8;
  else if (weightOverride === '1_2') weightKg = 1.5;
  else if (weightOverride === 'over_2') weightKg = 2.5;
  else if (weightOverride !== 'default') {
    weightKg = parseFloat(weightOverride) || bookWeightKg;
  }
  
  let bandName = 'Under 0.5 kg';
  if (weightKg >= 2) bandName = 'Over 2 kg';
  else if (weightKg > 1) bandName = '1 - 2 kg';
  else if (weightKg >= 0.5) bandName = '0.5 - 1 kg';


  const regions = ['ON', 'CA', 'US', 'intl'];
  const results = {};

  regions.forEach(region => {
    const regOrders = allOrders.filter(o => {
      const country = normalizeCountryCode(o.shipCountry || 'US');
      const state = String(o.shipState || '').trim().toUpperCase();
      const isON = state === 'ON' || state === 'ONTARIO';

      if (region === 'ON') return country === 'CA' && isON;
      if (region === 'CA') return country === 'CA' && !isON;
      if (region === 'US') return country === 'US';
      return country !== 'CA' && country !== 'US';
    });

    const values = [];
    regOrders.forEach(o => {
      const orderNumber = normalizeShippingOrderNumber(o.num);
      const linked = orderNumber ? shippoExpenses.filter(e =>
        e.shippingMatchStatus === 'matched' && normalizeShippingOrderNumber(e.shippingOrderNumber) === orderNumber
      ) : [];
      const hasPostage = linked.length > 0 || !!o.manualPostagePaid;
      if (hasPostage) {
        const cost = o.manualPostagePaid
          ? (Number(o.postagePaid) || 0)
          : linked.reduce((sum, e) => sum + (Number(e.baseAmount) || Number(e.amount) || 0), 0);
        if (cost > 0) {
          values.push({ cost, qty: o.qty || 1 });
        }
      }
    });

    const N = values.length;
    const singleCosts = values.filter(v => v.qty === 1).map(v => v.cost);
    
    const pctFn = typeof getShipRecoPercentile === 'function' ? getShipRecoPercentile : () => 75;
    const pct = pctFn();

    let avgBase = null;
    let targetBase = null;
    let avgInc = null;

    if (singleCosts.length > 0) {
      avgBase = getMean(singleCosts);
      targetBase = getPercentile(singleCosts, pct);
    } else if (values.length > 0) {
      const perUnit = values.map(v => v.cost / v.qty);
      avgBase = getMean(perUnit);
      targetBase = getPercentile(perUnit, pct);
    }

    const multi = values.filter(v => v.qty > 1);
    if (multi.length > 0 && avgBase !== null) {
      const incs = multi.map(v => (v.cost - avgBase) / (v.qty - 1));
      avgInc = getMean(incs.filter(c => c > 0));
    }

    const fallback = getFallbackRates(region, weightKg);
    let recoBase = fallback.base;
    let recoAddon = fallback.addon;
    let confidence = 'Default';

    const recoMode = getShipRecoMode();
    if (recoMode === 'cpost') {
      recoBase = fallback.base;
      recoAddon = fallback.addon;
      confidence = 'Canada Post';
    } else {
      if (N >= 5) {
        recoBase = Math.round(targetBase);
        recoAddon = avgInc !== null ? Math.max(2, Math.round(avgInc)) : Math.round(recoBase * 0.4);
        confidence = 'High';
      } else if (N > 0) {
        const w = N / 5;
        const baseBlend = avgBase * w + fallback.base * (1 - w);
        const addBlend = (avgInc || fallback.addon) * w + fallback.addon * (1 - w);
        recoBase = Math.round(baseBlend);
        recoAddon = Math.round(addBlend);
        confidence = 'Medium';
      }
    }

    recoAddon = Math.max(1, recoAddon);

    results[region] = {
      recoBase,
      recoAddon,
      confidence,
      N,
      avgCost: N > 0 ? getMean(values.map(v => v.cost)) : null,
      p90Cost: N > 0 ? getPercentile(values.map(v => v.cost), 90) : null
    };
  });

  return { results, weightKg, bandName };
}

function updateManualShippingRates(region, type, val) {
  const s = getState();
  if (!s.shippingRates) {
    s.shippingRates = {
      ON: { base: 16.00, addon: 10.00 },
      CA: { base: 20.00, addon: 10.00 },
      US: { base: 25.00, addon: 10.00 },
      intl: { base: 25.00, addon: 10.00 }
    };
  }
  const floatVal = Math.max(0, parseFloat(val) || 0);
  s.shippingRates[region][type] = floatVal;
  saveState(activeBook);
  renderShippingAnalysisHub();
}

function applySmartShippingRates(region, base, addon) {
  const s = getState();
  if (!s.shippingRates) {
    s.shippingRates = {
      ON: { base: 16.00, addon: 10.00 },
      CA: { base: 20.00, addon: 10.00 },
      US: { base: 25.00, addon: 10.00 },
      intl: { base: 25.00, addon: 10.00 }
    };
  }
  s.shippingRates[region].base = base;
  s.shippingRates[region].addon = addon;
  saveState(activeBook);
  renderShippingAnalysisHub();
  showToast(`Applied recommended rates for ${region === 'ON' ? 'Ontario' : region === 'CA' ? 'Rest of Canada' : region === 'US' ? 'United States' : 'International'}`);
}

function buildShippingPnLHtml(allOrders, relevantExpenses, shippoExpenses, bookFilterOptions, marginFilterOptions, isPub) {
  // Calculate dynamic counts for Margin Health filters based on active Book Filter (using allOrders)
  let countAll = 0;
  let countLoss = 0;
  let countProfit = 0;
  let countMissing = 0;
  let countDismissed = 0;

  allOrders.forEach(o => {
    if (o.excludeFromShipping) {
      countDismissed++;
      return;
    }
    countAll++;

    const customerPaidBase = Number(o.shippingPaid) || 0;
    if (customerPaidBase === 0) {
      countMissing++;
    }

    const orderNumber = normalizeShippingOrderNumber(o.num);
    const linked = orderNumber ? shippoExpenses.filter(e =>
      e.shippingMatchStatus === 'matched' && normalizeShippingOrderNumber(e.shippingOrderNumber) === orderNumber
    ) : [];
    const hasPostage = linked.length > 0 || !!o.manualPostagePaid;
    if (hasPostage) {
      const postageCostCAD = o.manualPostagePaid
        ? (Number(o.postagePaid) || 0)
        : linked.reduce((sum, e) => sum + (Number(e.baseAmount) || Number(e.amount) || 0), 0);
      const margin = customerPaidBase - postageCostCAD;
      if (margin < 0) {
        countLoss++;
      } else {
        countProfit++;
      }
    }
  });

  // ── 1. Calculate P&L KPIs (Publisher view only) ──
  let pnlHtml = '';

  if (isPub) {
    const activeOrders = allOrders.filter(o => !o.excludeFromShipping);

    // Apply all interactive filters to compute current P&L totals
    const kpiOrders = activeOrders.filter(o => {
      // A. Margin health filter
      if (shipAnalysisMarginFilter !== 'all') {
        const customerPaidBase = Number(o.shippingPaid) || 0;
        const orderNumber = normalizeShippingOrderNumber(o.num);
        const linked = orderNumber ? shippoExpenses.filter(e =>
          e.shippingMatchStatus === 'matched' && normalizeShippingOrderNumber(e.shippingOrderNumber) === orderNumber
        ) : [];

        if (shipAnalysisMarginFilter === 'missing') {
          if (customerPaidBase !== 0) return false;
        } else {
          const hasPostage = linked.length > 0 || !!o.manualPostagePaid;
          if (!hasPostage) return false;

          const postageCostCAD = o.manualPostagePaid
            ? (Number(o.postagePaid) || 0)
            : linked.reduce((sum, e) => sum + (Number(e.baseAmount) || Number(e.amount) || 0), 0);
          const margin = customerPaidBase - postageCostCAD;

          if (shipAnalysisMarginFilter === 'loss' && margin >= 0) return false;
          if (shipAnalysisMarginFilter === 'profit' && margin < 0) return false;
        }
      }

      // B. Carrier filter
      if (shipAnalysisCarrierFilter !== 'all') {
        const orderNumber = normalizeShippingOrderNumber(o.num);
        const linked = orderNumber ? shippoExpenses.filter(e =>
          e.shippingMatchStatus === 'matched' && normalizeShippingOrderNumber(e.shippingOrderNumber) === orderNumber
        ) : [];
        const carrier = o.manualPostagePaid
          ? 'Manual Override'
          : (linked.length > 0 ? parseCarrierInfo(linked[0].desc).provider : 'Unlinked');
        if (carrier !== shipAnalysisCarrierFilter) return false;
      }

      // C. Region filter
      if (shipAnalysisRegionFilter !== 'all') {
        const destCountry = normalizeCountryCode(o.shipCountry || 'US');
        if (shipAnalysisRegionFilter === 'CA') {
          if (destCountry !== 'CA') return false;
        } else if (shipAnalysisRegionFilter === 'US') {
          if (destCountry !== 'US') return false;
        } else if (shipAnalysisRegionFilter === 'intl') {
          if (destCountry === 'CA' || destCountry === 'US') return false;
        }
      }

      // D. Weight filter
      if (shipAnalysisWeightFilter !== 'all') {
        const book = BOOK_LIST.find(b => b.id === o.bookId);
        const weightKg = getWeightInKg(o.qty || 1, book);
        let band = 'Over 2 kg';
        if (weightKg < 0.5) band = 'Under 0.5 kg';
        else if (weightKg <= 1) band = '0.5 - 1 kg';
        else if (weightKg <= 2) band = '1 - 2 kg';
        if (band !== shipAnalysisWeightFilter) return false;
      }

      return true;
    });

    const totalShippingIncome = kpiOrders.reduce((sum, o) => {
      return sum + (Number(o.shippingPaid) || 0);
    }, 0);

    let totalPostageCost = 0;
    kpiOrders.forEach(o => {
      const orderNumber = normalizeShippingOrderNumber(o.num);
      const linked = orderNumber ? relevantExpenses.filter(e =>
        e.shippingMatchStatus === 'matched' && normalizeShippingOrderNumber(e.shippingOrderNumber) === orderNumber
      ) : [];
      
      const cost = o.manualPostagePaid
        ? (Number(o.postagePaid) || 0)
        : linked.reduce((sum, e) => sum + (Number(e.baseAmount) || Number(e.amount) || 0), 0);
      totalPostageCost += cost;
    });

    const netMargin = totalShippingIncome - totalPostageCost;
    const marginClass = netMargin > 0 ? 'positive' : netMargin < 0 ? 'negative' : 'neutral';

    // Average markup calculation on linked orders
    let totalMarkupSum = 0;
    let markupCount = 0;
    kpiOrders.forEach(o => {
      const customerPaidBase = (Number(o.shippingPaid) || 0);
      const orderNumber = normalizeShippingOrderNumber(o.num);
      const linked = orderNumber ? shippoExpenses.filter(e =>
        e.shippingMatchStatus === 'matched' && normalizeShippingOrderNumber(e.shippingOrderNumber) === orderNumber
      ) : [];

      const hasPostage = linked.length > 0 || !!o.manualPostagePaid;
      if (hasPostage) {
        const cost = o.manualPostagePaid
          ? (Number(o.postagePaid) || 0)
          : linked.reduce((sum, e) => sum + (Number(e.baseAmount) || Number(e.amount) || 0), 0);
        if (cost > 0) {
          totalMarkupSum += ((customerPaidBase - cost) / cost) * 100;
          markupCount++;
        }
      }
    });
    const avgMarkup = markupCount > 0 ? (totalMarkupSum / markupCount) : 0;
    const avgMarkupText = markupCount > 0 ? `${avgMarkup > 0 ? '+' : ''}${avgMarkup.toFixed(1)}%` : '—';

    const matchedOrderNumbers = new Set(
      shippoExpenses
        .filter(e => e.shippingMatchStatus === 'matched')
        .map(e => normalizeShippingOrderNumber(e.shippingOrderNumber))
        .filter(Boolean)
    );
    const unmatchedCount = kpiOrders.filter(o => {
      if (o.manualPostagePaid) return false;
      return !matchedOrderNumbers.has(normalizeShippingOrderNumber(o.num));
    }).length;
    const linkedOrderCount = kpiOrders.length - unmatchedCount;

    pnlHtml = `
      <section class="shipping-pnl-dashboard" aria-labelledby="shipping-pnl-title">
        <header class="shipping-pnl-header">
          <div>
            <p class="shipping-pnl-eyebrow">Publisher finance</p>
            <h2 id="shipping-pnl-title">Shipping performance</h2>
            <p class="shipping-pnl-intro">Understand recovered shipping costs and resolve outstanding postage records.</p>
          </div>
          <div style="display:flex; flex-direction:column; align-items:flex-end; gap:8px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <button class="btn sm gold" id="ship-bc-sync-btn" onclick="triggerBigCartelShippingSync()" style="height:38px; padding:0 16px; display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:700; border-radius:99px; border:1px solid rgba(200,145,58,0.3); background:var(--gold-bg); color:var(--gold-text); cursor:pointer; transition:all 0.2s;">
                <span>🔄</span> Sync Big Cartel Shipping
              </button>
              <a class="shipping-pnl-action" href="#shipping-pnl-ledger">Review reconciliation</a>
            </div>
            <div class="shipping-pnl-header-meta" style="margin-top: 4px;">
              <span class="shipping-pnl-freshness">All recorded website orders</span>
            </div>
          </div>
        </header>
        <div class="shipping-pnl-toolbar">
          <div class="toolbar-group">
            <span class="toolbar-label">Book Filter</span>
            <div class="pill-select-wrapper">
              <select id="ship-analysis-book-filter" onchange="onShipAnalysisBookFilterChange()" class="pill-select-input">
                ${bookFilterOptions}
              </select>
              <span class="pill-select-arrow">▼</span>
            </div>
          </div>
          <div class="toolbar-group">
            <span class="toolbar-label">Margin Health</span>
            <div class="filter-segmented-control">
              <button type="button" class="filter-segmented-pill ${shipAnalysisMarginFilter === 'all' ? 'active' : ''}" onclick="setShipAnalysisMarginFilter('all')">
                All <span class="filter-pill-badge">${countAll}</span>
              </button>
              <button type="button" class="filter-segmented-pill loss ${shipAnalysisMarginFilter === 'loss' ? 'active' : ''}" onclick="setShipAnalysisMarginFilter('loss')">
                Losses <span class="filter-pill-badge">${countLoss}</span>
              </button>
              <button type="button" class="filter-segmented-pill profit ${shipAnalysisMarginFilter === 'profit' ? 'active' : ''}" onclick="setShipAnalysisMarginFilter('profit')">
                Profitable <span class="filter-pill-badge">${countProfit}</span>
              </button>
              <button type="button" class="filter-segmented-pill missing ${shipAnalysisMarginFilter === 'missing' ? 'active' : ''}" onclick="setShipAnalysisMarginFilter('missing')">
                Missing <span class="filter-pill-badge">${countMissing}</span>
              </button>
              <button type="button" class="filter-segmented-pill dismissed ${shipAnalysisMarginFilter === 'dismissed' ? 'active' : ''}" onclick="setShipAnalysisMarginFilter('dismissed')">
                Dismissed <span class="filter-pill-badge">${countDismissed}</span>
              </button>
            </div>
          </div>
          <div class="toolbar-group search-group">
            <span class="toolbar-label">Search</span>
            <div style="position:relative; display:inline-flex; align-items:center;">
              <input type="search" id="ship-analysis-search" placeholder="Order #, name..." value="${escapeHtml(shipAnalysisSearchQuery)}" oninput="onShipAnalysisSearch(this.value)" class="pill-search-input">
              <span class="pill-search-icon">🔍</span>
            </div>
          </div>
        </div>
        <div class="shipping-pnl-kpis">
          <article class="shipping-pnl-kpi">
            <span class="shipping-pnl-kpi-label">Shipping revenue</span>
            <strong>${totalShippingIncome.toFixed(2)} <small>CAD</small></strong>
            <span>Customer-paid shipping</span>
          </article>
          <article class="shipping-pnl-kpi">
            <span class="shipping-pnl-kpi-label">Postage cost</span>
            <strong>${totalPostageCost.toFixed(2)} <small>CAD</small></strong>
            <span>All imported Shippo labels</span>
          </article>
          <article class="shipping-pnl-kpi ${marginClass}">
            <span class="shipping-pnl-kpi-label">Net margin</span>
            <strong>${netMargin >= 0 ? '+' : ''}${netMargin.toFixed(2)} <small>CAD</small></strong>
            <span>Revenue less actual postage</span>
          </article>
          <article class="shipping-pnl-kpi">
            <span class="shipping-pnl-kpi-label">Link coverage</span>
            <strong>${linkedOrderCount} <small>/ ${kpiOrders.length} orders</small></strong>
            <span>${avgMarkupText} average markup on linked orders</span>
          </article>
        </div>
        <section class="shipping-pnl-attention" aria-labelledby="shipping-pnl-attention-title">
          <div>
            <p class="shipping-pnl-eyebrow">Needs attention</p>
            <h3 id="shipping-pnl-attention-title">Keep margins trustworthy</h3>
          </div>
          <div class="shipping-pnl-attention-item">
            <strong>${unmatchedCount}</strong>
            <span>Postage not linked</span>
          </div>
          <p>Unlinked orders show no settled postage or margin until a Shippo expense is matched.</p>
          <a href="#shipping-pnl-ledger">View ledger</a>
        </section>
      </section>
    `;
  } else {
    pnlHtml = `
      <div class="shipping-pnl-dashboard" style="margin-bottom: var(--shipping-pnl-space-4); overflow: hidden;">
        <header class="shipping-pnl-header" style="padding: var(--shipping-pnl-space-4) var(--shipping-pnl-space-5) var(--shipping-pnl-space-3);">
          <div>
            <span class="shipping-pnl-eyebrow" style="margin-bottom:4px;">Author finance</span>
            <h2 style="font-size: 1.8rem;">Shipping performance</h2>
          </div>
        </header>
        <div class="shipping-pnl-toolbar">
          <div class="toolbar-group">
            <span class="toolbar-label">Book Filter</span>
            <div class="pill-select-wrapper">
              <select id="ship-analysis-book-filter" onchange="onShipAnalysisBookFilterChange()" class="pill-select-input">
                ${bookFilterOptions}
              </select>
              <span class="pill-select-arrow">▼</span>
            </div>
          </div>
          <div class="toolbar-group">
            <span class="toolbar-label">Margin Health</span>
            <div class="filter-segmented-control">
              <button type="button" class="filter-segmented-pill ${shipAnalysisMarginFilter === 'all' ? 'active' : ''}" onclick="setShipAnalysisMarginFilter('all')">
                All <span class="filter-pill-badge">${countAll}</span>
              </button>
              <button type="button" class="filter-segmented-pill loss ${shipAnalysisMarginFilter === 'loss' ? 'active' : ''}" onclick="setShipAnalysisMarginFilter('loss')">
                Losses <span class="filter-pill-badge">${countLoss}</span>
              </button>
              <button type="button" class="filter-segmented-pill profit ${shipAnalysisMarginFilter === 'profit' ? 'active' : ''}" onclick="setShipAnalysisMarginFilter('profit')">
                Profitable <span class="filter-pill-badge">${countProfit}</span>
              </button>
              <button type="button" class="filter-segmented-pill missing ${shipAnalysisMarginFilter === 'missing' ? 'active' : ''}" onclick="setShipAnalysisMarginFilter('missing')">
                Missing <span class="filter-pill-badge">${countMissing}</span>
              </button>
              <button type="button" class="filter-segmented-pill dismissed ${shipAnalysisMarginFilter === 'dismissed' ? 'active' : ''}" onclick="setShipAnalysisMarginFilter('dismissed')">
                Dismissed <span class="filter-pill-badge">${countDismissed}</span>
              </button>
            </div>
          </div>
          <div class="toolbar-group search-group">
            <span class="toolbar-label">Search</span>
            <div style="position:relative; display:inline-flex; align-items:center;">
              <input type="search" id="ship-analysis-search" placeholder="Order #, name..." value="${escapeHtml(shipAnalysisSearchQuery)}" oninput="onShipAnalysisSearch(this.value)" class="pill-search-input">
              <span class="pill-search-icon">🔍</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }


  return pnlHtml;
}

function buildShippingCarrierScorecardHtml(allOrders, relevantExpenses) {
  // ── 2. Carrier Efficiency Scorecard ──
  const carrierStats = {};
  
  // A. Process linked Shippo expenses
  relevantExpenses.forEach(e => {
    const { provider, service } = parseCarrierInfo(e.desc);
    const cost = Number(e.baseAmount) || Number(e.amount) || 0;
    if (!carrierStats[provider]) {
      carrierStats[provider] = { count: 0, totalCost: 0, services: {} };
    }
    carrierStats[provider].count++;
    carrierStats[provider].totalCost += cost;

    if (!carrierStats[provider].services[service]) {
      carrierStats[provider].services[service] = { count: 0, totalCost: 0 };
    }
    carrierStats[provider].services[service].count++;
    carrierStats[provider].services[service].totalCost += cost;
  });

  // B. Process manual entries from active/relevant orders
  allOrders.forEach(o => {
    if (o.manualPostagePaid && !o.excludeFromShipping) {
      const cost = Number(o.postagePaid) || 0;
      const provider = 'Manual Override';
      const service = 'Manual';
      if (!carrierStats[provider]) {
        carrierStats[provider] = { count: 0, totalCost: 0, services: {} };
      }
      carrierStats[provider].count++;
      carrierStats[provider].totalCost += cost;

      if (!carrierStats[provider].services[service]) {
        carrierStats[provider].services[service] = { count: 0, totalCost: 0 };
      }
      carrierStats[provider].services[service].count++;
      carrierStats[provider].services[service].totalCost += cost;
    }
  });

  let carrierRows = '';
  Object.keys(carrierStats).forEach(provider => {
    const data = carrierStats[provider];
    const avg = data.count > 0 ? (data.totalCost / data.count) : 0;
    const isActive = (shipAnalysisCarrierFilter === provider);
    const rowClass = isActive ? 'active-insight-row' : '';
    carrierRows += `
      <tr class="insight-clickable-row ${rowClass}" onclick="toggleShipAnalysisCarrierFilter('${escapeHtml(provider)}')" title="Click to filter ledger by ${escapeHtml(provider)}">
        <td style="font-weight:600; color:var(--text2); display:flex; align-items:center; gap:8px;">
          ${isActive ? '<span class="insight-active-dot"></span>' : ''}
          ${escapeHtml(provider)}
        </td>
        <td style="text-align:center;">${data.count}</td>
        <td style="text-align:right;">${data.totalCost.toFixed(2)} CAD</td>
        <td style="text-align:right; font-weight:600;">${avg.toFixed(2)} CAD</td>
      </tr>
    `;
  });

  const carrierTableHtml = carrierRows
    ? `
      <table class="shipping-pnl-insight-table">
        <thead>
          <tr>
            <th style="text-align:left;">Carrier</th>
            <th style="text-align:center; width:80px;">Shipments</th>
            <th style="text-align:right; width:120px;">Total Cost</th>
            <th style="text-align:right; width:120px;">Avg/Package</th>
          </tr>
        </thead>
        <tbody>
          ${carrierRows}
        </tbody>
      </table>
    `
    : `<div class="empty-state" style="padding:1rem;">No carrier data logged.</div>`;


  return carrierTableHtml;
}

function buildShippingRegionSplitHtml(allOrders, shippoExpenses) {
  // ── 3. Domestic vs. International Margin Split ──
  let caCount = 0, caRevenue = 0, caCost = 0;
  let usCount = 0, usRevenue = 0, usCost = 0;
  let intlCount = 0, intlRevenue = 0, intlCost = 0;

  allOrders.forEach(o => {
    if (o.excludeFromShipping) return;
    const revenue = Number(o.shippingPaid) || 0;

    const orderNumber = normalizeShippingOrderNumber(o.num);
    const linked = orderNumber ? shippoExpenses.filter(e =>
      e.shippingMatchStatus === 'matched' && normalizeShippingOrderNumber(e.shippingOrderNumber) === orderNumber
    ) : [];
    
    const cost = o.manualPostagePaid
      ? (Number(o.postagePaid) || 0)
      : linked.reduce((sum, e) => sum + (Number(e.baseAmount) || Number(e.amount) || 0), 0);

    const destCountry = normalizeCountryCode(o.shipCountry || 'US');

    if (destCountry === 'CA') {
      caCount++;
      caRevenue += revenue;
      caCost += cost;
    } else if (destCountry === 'US') {
      usCount++;
      usRevenue += revenue;
      usCost += cost;
    } else {
      intlCount++;
      intlRevenue += revenue;
      intlCost += cost;
    }
  });

  const caMargin = caRevenue - caCost;
  const usMargin = usRevenue - usCost;
  const intlMargin = intlRevenue - intlCost;

  const isCaActive = (shipAnalysisRegionFilter === 'CA');
  const isUsActive = (shipAnalysisRegionFilter === 'US');
  const isIntlActive = (shipAnalysisRegionFilter === 'intl');
  const caRowClass = isCaActive ? 'active-insight-row' : '';
  const usRowClass = isUsActive ? 'active-insight-row' : '';
  const intlRowClass = isIntlActive ? 'active-insight-row' : '';

  const splitTableHtml = `
    <table class="shipping-pnl-insight-table">
      <thead>
        <tr>
          <th style="text-align:left;">Region</th>
          <th style="text-align:center; width:70px;">Orders</th>
          <th style="text-align:right; width:100px;">Charged</th>
          <th style="text-align:right; width:100px;">Actual Cost</th>
          <th style="text-align:right; width:100px;">Net Margin</th>
        </tr>
      </thead>
      <tbody>
        <tr class="insight-clickable-row ${caRowClass}" onclick="toggleShipAnalysisRegionFilter('CA')" title="Click to filter ledger by Canadian">
          <td style="font-weight:600; color:var(--text2); display:flex; align-items:center; gap:8px;">
            ${isCaActive ? '<span class="insight-active-dot"></span>' : ''}
            🇨🇦 Canadian
          </td>
          <td style="text-align:center;">${caCount}</td>
          <td style="text-align:right;">${caRevenue.toFixed(2)} CAD</td>
          <td style="text-align:right;">${caCost.toFixed(2)} CAD</td>
          <td style="text-align:right; font-weight:700; color:${caMargin >= 0 ? '#2e7d32' : 'var(--red)'};">${caMargin >= 0 ? '+' : ''}${caMargin.toFixed(2)} CAD</td>
        </tr>
        <tr class="insight-clickable-row ${usRowClass}" onclick="toggleShipAnalysisRegionFilter('US')" title="Click to filter ledger by USA">
          <td style="font-weight:600; color:var(--text2); display:flex; align-items:center; gap:8px;">
            ${isUsActive ? '<span class="insight-active-dot"></span>' : ''}
            🇺🇸 USA
          </td>
          <td style="text-align:center;">${usCount}</td>
          <td style="text-align:right;">${usRevenue.toFixed(2)} CAD</td>
          <td style="text-align:right;">${usCost.toFixed(2)} CAD</td>
          <td style="text-align:right; font-weight:700; color:${usMargin >= 0 ? '#2e7d32' : 'var(--red)'};">${usMargin >= 0 ? '+' : ''}${usMargin.toFixed(2)} CAD</td>
        </tr>
        <tr class="insight-clickable-row ${intlRowClass}" onclick="toggleShipAnalysisRegionFilter('intl')" title="Click to filter ledger by International">
          <td style="font-weight:600; color:var(--text2); display:flex; align-items:center; gap:8px;">
            ${isIntlActive ? '<span class="insight-active-dot"></span>' : ''}
            🌍 International
          </td>
          <td style="text-align:center;">${intlCount}</td>
          <td style="text-align:right;">${intlRevenue.toFixed(2)} CAD</td>
          <td style="text-align:right;">${intlCost.toFixed(2)} CAD</td>
          <td style="text-align:right; font-weight:700; color:${intlMargin >= 0 ? '#2e7d32' : 'var(--red)'};">${intlMargin >= 0 ? '+' : ''}${intlMargin.toFixed(2)} CAD</td>
        </tr>
      </tbody>
    </table>
  `;


  return splitTableHtml;
}

function buildShippingWeightBandHtml(allOrders, shippoExpenses) {
  // ── 4. Package Weight Band Cost Average ──
  const weightBands = {
    'Under 0.5 kg': { count: 0, totalCost: 0, totalRevenue: 0 },
    '0.5 - 1 kg': { count: 0, totalCost: 0, totalRevenue: 0 },
    '1 - 2 kg': { count: 0, totalCost: 0, totalRevenue: 0 },
    'Over 2 kg': { count: 0, totalCost: 0, totalRevenue: 0 }
  };

  allOrders.forEach(o => {
    if (o.excludeFromShipping) return;
    const book = BOOK_LIST.find(b => b.id === o.bookId);
    const weightKg = getWeightInKg(o.qty || 1, book);

    const orderNumber = normalizeShippingOrderNumber(o.num);
    const linked = orderNumber ? shippoExpenses.filter(e =>
      e.shippingMatchStatus === 'matched' && normalizeShippingOrderNumber(e.shippingOrderNumber) === orderNumber
    ) : [];

    const hasPostage = linked.length > 0 || !!o.manualPostagePaid;
    if (hasPostage) {
      const cost = o.manualPostagePaid
        ? (Number(o.postagePaid) || 0)
        : linked.reduce((sum, e) => sum + (Number(e.baseAmount) || Number(e.amount) || 0), 0);
      
      const revenue = Number(o.shippingPaid) || 0;

      let band = 'Over 2 kg';
      if (weightKg < 0.5) band = 'Under 0.5 kg';
      else if (weightKg <= 1) band = '0.5 - 1 kg';
      else if (weightKg <= 2) band = '1 - 2 kg';

      weightBands[band].count++;
      weightBands[band].totalCost += cost;
      weightBands[band].totalRevenue += revenue;
    }
  });

  let weightRows = '';
  Object.keys(weightBands).forEach(band => {
    const data = weightBands[band];
    const avg = data.count > 0 ? (data.totalCost / data.count) : 0;
    const margin = data.totalRevenue - data.totalCost;
    const isActive = (shipAnalysisWeightFilter === band);
    const rowClass = isActive ? 'active-insight-row' : '';
    weightRows += `
      <tr class="insight-clickable-row ${rowClass}" onclick="toggleShipAnalysisWeightFilter('${band}')" title="Click to filter ledger by ${band}">
        <td style="font-weight:600; color:var(--text2); display:flex; align-items:center; gap:8px;">
          ${isActive ? '<span class="insight-active-dot"></span>' : ''}
          ${band}
        </td>
        <td style="text-align:center;">${data.count}</td>
        <td style="text-align:right;">${data.totalCost.toFixed(2)} CAD</td>
        <td style="text-align:right; font-weight:600;">${avg.toFixed(2)} CAD</td>
        <td style="text-align:right; font-weight:700; color:${margin >= 0 ? '#2e7d32' : 'var(--red)'};">${margin >= 0 ? '+' : ''}
${margin.toFixed(2)} CAD</td>
      </tr>
    `;
  });

  const weightTableHtml = `
    <table class="shipping-pnl-insight-table">
      <thead>
        <tr>
          <th style="text-align:left;">Weight Band</th>
          <th style="text-align:center; width:65px;">Shipments</th>
          <th style="text-align:right; width:90px;">Total Cost</th>
          <th style="text-align:right; width:90px;">Avg Cost</th>
          <th style="text-align:right; width:90px;">Net Margin</th>
        </tr>
      </thead>
      <tbody>
        ${weightRows}
      </tbody>
    </table>
  `;


  return weightTableHtml;
}

// ─── Address verification from the shipping ledger ────────────────────────
//
// The same Shippo check as the Destination card, reachable from the worklist
// where undeliverable addresses actually surface. Two differences from the
// rate-form verifier, both because a ledger row is a stored order rather than
// a scratch form:
//
//   1. The verdict is persisted on the history entry, so it survives a reload
//      and the worklist can be worked through over days rather than in one
//      sitting. persistableVerification decides what is small enough to store.
//   2. Corrections write back to the order's own shipAddr* fields, which is
//      what makes the fix stick — the rate form's copy is discarded on reload.
//
// A stored verdict is keyed to the address it was produced from, so editing an
// order silently reverts it to unverified rather than leaving a stale ✓.

/**
 * A ledger order's address, with the country resolved to the ISO code Shippo's
 * country_code enum requires.
 *
 * Orders store whatever the Gmail parser or Big Cartel gave them — "Canada",
 * "United Kingdom" — while the Destination card normalizes on the way in. That
 * asymmetry is what made the ledger verifier 422 on real orders. Every read of
 * a ledger address goes through here so the signature that is stored, the one
 * that is compared, and the one that is sent are the same string.
 */
function ledgerOrderAddress(order) {
  const address = addressFromOrder(order);
  address.country = normalizeCountryCode(address.country);
  return address;
}

/** Finds the live history entry behind a ledger row. */
function findLedgerOrder(bookId, orderIdentifier) {
  const state = states[bookId];
  if (!state || !Array.isArray(state.hist)) return null;
  return state.hist.find(h => h.id === orderIdentifier || h.num === orderIdentifier) || null;
}

/**
 * Verifies one order and writes the verdict onto it.
 *
 * `save` is opt-out so the batch path can persist every touched book once at
 * the end rather than once per order — the same shape backfillShipping uses.
 */
async function verifyOrderAddressRecord(token, order, { save = true, bookId = '' } = {}) {
  const address = ledgerOrderAddress(order);
  const blocker = countryFallbackWarning(order.shipCountry, address.country)
    || addressValidationBlocker(address);
  if (blocker) return { skipped: true, blocker };

  const result = await fetchShippoAddressVerification(token, address);
  order.addrVerify = persistableVerification(result, addressSignature(address));
  if (save && bookId) await saveState(bookId);
  return { skipped: false, result };
}

async function verifyLedgerOrderAddress(bookId, orderIdentifier) {
  const token = TAX_CENTER.settings?.shippoKey || '';
  if (!token) {
    showToast('⚠️ Please configure your Shippo API Key first', 'warn');
    return;
  }
  const order = findLedgerOrder(bookId, orderIdentifier);
  if (!order) { showToast('That order could not be found', 'err'); return; }

  const cell = document.querySelector(`[data-verify-cell="${CSS.escape(`${bookId}|${orderIdentifier}`)}"]`);
  if (cell) cell.innerHTML = '<span class="ship-verify-pill checking">Checking…</span>';

  try {
    const { skipped, blocker, result } = await verifyOrderAddressRecord(token, order, { save: true, bookId });
    if (skipped) {
      showToast(`⚠️ ${order.num || 'Order'}: ${blocker}`, 'warn', 6000);
      renderShippingAnalysisHub();
      return;
    }
    const verdict = verificationVerdict(result.status);
    showToast(`${verdict.icon} ${order.num || 'Order'}: ${verdict.label}`, verdict.tone, result.status === 'valid' ? 4000 : 7000);
  } catch (error) {
    console.error('Ledger address verification failed', error);
    showToast(`❌ Could not verify ${order.num || 'this order'}: ${error.message}`, 'err', 7000);
  }
  renderShippingAnalysisHub();
}

/**
 * Verifies every selected row.
 *
 * Chunked rather than fired all at once: Shippo rate-limits, and a worklist
 * selection can easily be fifty orders. Failures are counted and reported
 * instead of aborting the run — one unreachable address should not cost the
 * publisher the other forty-nine verdicts.
 */
async function batchVerifyLedgerAddresses() {
  const token = TAX_CENTER.settings?.shippoKey || '';
  if (!token) {
    showToast('⚠️ Please configure your Shippo API Key first', 'warn');
    return;
  }

  const selected = Array.from(document.querySelectorAll('.ship-order-checkbox:checked'))
    .map(checkbox => {
      const [bookId, orderIdentifier] = checkbox.value.split('|');
      return { bookId, order: findLedgerOrder(bookId, orderIdentifier) };
    })
    .filter(entry => entry.order);
  if (!selected.length) { showToast('Select the orders you want to verify first', 'warn'); return; }

  const status = $('ship-analysis-batch-verify');
  const priorLabel = status?.innerHTML;
  if (status) { status.disabled = true; }

  const touchedBooks = new Set();
  let verified = 0;
  let skipped = 0;
  let failed = 0;
  let undeliverable = 0;
  const CHUNK_SIZE = 5;

  for (let i = 0; i < selected.length; i += CHUNK_SIZE) {
    if (status) status.innerHTML = `Verifying ${Math.min(i + CHUNK_SIZE, selected.length)}/${selected.length}…`;
    const chunk = selected.slice(i, i + CHUNK_SIZE);
    // Sequential by design: the awaits are the rate limiter.
    const outcomes = await Promise.all(chunk.map(async ({ bookId, order }) => {
      try {
        const outcome = await verifyOrderAddressRecord(token, order, { save: false });
        return { ...outcome, bookId };
      } catch (error) {
        console.warn(`Address verification failed for ${order.num}`, error);
        return { failed: true, bookId };
      }
    }));
    outcomes.forEach(outcome => {
      if (outcome.failed) { failed++; return; }
      if (outcome.skipped) { skipped++; return; }
      verified++;
      touchedBooks.add(outcome.bookId);
      if (!isDeliverable(outcome.result)) undeliverable++;
    });
  }

  try {
    await Promise.all(Array.from(touchedBooks).map(bookId => saveState(bookId)));
  } catch (error) {
    console.error('Saving batch address verifications failed', error);
    showToast('Verified, but the results could not be saved. Please try again.', 'err');
  }

  if (status) { status.disabled = false; status.innerHTML = priorLabel ?? '⌖ Verify addresses'; }

  const notes = [
    `Verified ${verified} address${verified === 1 ? '' : 'es'}`,
    undeliverable ? `${undeliverable} undeliverable` : '',
    skipped ? `${skipped} missing an address` : '',
    failed ? `${failed} failed` : '',
  ].filter(Boolean);
  showToast(notes.join(' · '), undeliverable || failed ? 'warn' : 'ok', 7000);
  renderShippingAnalysisHub();
}

/** Applies Shippo's standardized fields to the order record itself. */
async function applyLedgerAddressCorrections(bookId, orderIdentifier) {
  const order = findLedgerOrder(bookId, orderIdentifier);
  const stored = order?.addrVerify;
  if (!order || !stored?.corrections?.length) {
    showToast('There are no corrections to apply for that order', 'warn');
    return;
  }
  // The verdict is only about the address it was produced from. If the order
  // was edited since, the stored corrections describe text that is no longer
  // there, and applying them would reintroduce it.
  if (!storedVerificationIsCurrent(stored, ledgerOrderAddress(order))) {
    showToast('That address changed since it was checked — verify it again', 'warn');
    renderShippingAnalysisHub();
    return;
  }

  const preview = stored.corrections.map(c => `  ${c.label}: ${c.from || '—'} → ${c.to}`).join('\n');
  const accepted = await confirmDialog(
    `Apply Shippo's standardized address to ${order.num || 'this order'}?\n\n${preview}`,
    { title: 'Apply address corrections', okLabel: 'Apply to order' },
  );
  if (!accepted) return;

  const patch = orderAddressPatch(stored.corrections);
  Object.assign(order, patch);
  // The address now matches what Shippo recommended, so the verdict is re-pinned
  // to it and the corrections are spent rather than offered again.
  order.addrVerify = {
    ...stored,
    signature: addressSignature(ledgerOrderAddress(order)),
    corrections: [],
  };

  try {
    await saveState(bookId);
  } catch (error) {
    console.error('Saving corrected order address failed', error);
    showToast('Could not save the corrected address. Please try again.', 'err');
    return;
  }
  renderHist();
  renderShippingAnalysisHub();
  showToast(`✓ Updated ${Object.keys(patch).length} field${Object.keys(patch).length === 1 ? '' : 's'} on ${order.num || 'the order'}`);
}

/** The verify affordance for one ledger row: button, verdict pill, or both. */
function renderLedgerVerifyCell(order) {
  const key = `${order.bookId}|${order.id || order.num}`;
  const args = `'${escapeHtml(order.bookId)}', '${escapeHtml(order.id || order.num)}'`;
  const stored = order.addrVerify;
  const address = ledgerOrderAddress(order);
  const current = storedVerificationIsCurrent(stored, address);
  // aria-label as well as title: the re-check control is a bare ↻ glyph, which
  // a screen reader would otherwise announce as nothing useful.
  const verifyBtn = (label, title) =>
    `<button type="button" class="ship-verify-mini" onclick="verifyLedgerOrderAddress(${args})" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">${escapeHtml(label)}</button>`;

  // Always inside .ship-verify-cell: the Recipient cell styles bare <span>s as
  // truncating block lines, which would flatten a pill into an ellipsised row.
  if (!address.street1) {
    return `<div class="ship-verify-cell" data-verify-cell="${escapeHtml(key)}"><span class="ship-verify-pill none" title="This order has no street address to check">No address</span></div>`;
  }

  let body;
  if (!stored || !current) {
    body = verifyBtn(
      stored ? '⌖ Re-verify address' : '⌖ Verify address',
      stored ? 'The address changed since it was last checked' : 'Check this address with Shippo',
    );
  } else {
    const verdict = verificationVerdict(stored.status);
    const tone = { ok: 'ok', warn: 'warn', err: 'err' }[verdict.tone] || 'warn';
    const reasons = (stored.reasons || []).map(reason => reason.description).join(' · ');
    const pill = `<span class="ship-verify-pill ${tone}" title="${escapeHtml(reasons || verdict.summary)}">${escapeHtml(verdict.icon)} ${escapeHtml(verdict.label)}</span>`;
    const fixBtn = stored.corrections?.length
      ? `<button type="button" class="ship-verify-mini fix" onclick="applyLedgerAddressCorrections(${args})" aria-label="Apply ${stored.corrections.length} address correction${stored.corrections.length === 1 ? '' : 's'}" title="${escapeHtml(stored.corrections.map(c => `${c.label}: ${c.from || '—'} → ${c.to}`).join('\n'))}">Fix ${stored.corrections.length}</button>`
      : '';
    body = `${pill}${fixBtn}${verifyBtn('↻', 'Check this address with Shippo again')}`;
  }
  return `<div class="ship-verify-cell" data-verify-cell="${escapeHtml(key)}">${body}</div>`;
}

function buildShippingLedgerHtml(allOrders, shippoExpenses) {
  // ── 5. Side-by-Side Shipping Ledger Pagination ──
  // Apply all interactive filters before pagination
  const filteredLedgerOrders = allOrders.filter(o => {
    if (shipAnalysisMarginFilter === 'dismissed') return o.excludeFromShipping === true;
    if (o.excludeFromShipping) return false;

    // A. Margin health filter
    if (shipAnalysisMarginFilter !== 'all') {
      const customerPaidBase = Number(o.shippingPaid) || 0;
      const orderNumber = normalizeShippingOrderNumber(o.num);
      const linked = orderNumber ? shippoExpenses.filter(e =>
        e.shippingMatchStatus === 'matched' && normalizeShippingOrderNumber(e.shippingOrderNumber) === orderNumber
      ) : [];

      if (shipAnalysisMarginFilter === 'missing') {
        if (customerPaidBase !== 0) return false;
      } else {
        const hasPostage = linked.length > 0 || !!o.manualPostagePaid;
        if (!hasPostage) return false;

        const postageCostCAD = o.manualPostagePaid
          ? (Number(o.postagePaid) || 0)
          : linked.reduce((sum, e) => sum + (Number(e.baseAmount) || Number(e.amount) || 0), 0);
        const margin = customerPaidBase - postageCostCAD;

        if (shipAnalysisMarginFilter === 'loss' && margin >= 0) return false;
        if (shipAnalysisMarginFilter === 'profit' && margin < 0) return false;
      }
    }

    // B. Carrier filter
    if (shipAnalysisCarrierFilter !== 'all') {
      const orderNumber = normalizeShippingOrderNumber(o.num);
      const linked = orderNumber ? shippoExpenses.filter(e =>
        e.shippingMatchStatus === 'matched' && normalizeShippingOrderNumber(e.shippingOrderNumber) === orderNumber
      ) : [];
      const carrier = o.manualPostagePaid
        ? 'Manual Override'
        : (linked.length > 0 ? parseCarrierInfo(linked[0].desc).provider : 'Unlinked');
      if (carrier !== shipAnalysisCarrierFilter) return false;
    }

    // C. Region filter
      if (shipAnalysisRegionFilter !== 'all') {
        const destCountry = normalizeCountryCode(o.shipCountry || 'US');
        if (shipAnalysisRegionFilter === 'CA') {
          if (destCountry !== 'CA') return false;
        } else if (shipAnalysisRegionFilter === 'US') {
          if (destCountry !== 'US') return false;
        } else if (shipAnalysisRegionFilter === 'intl') {
          if (destCountry === 'CA' || destCountry === 'US') return false;
        }
      }

    // D. Weight filter
    if (shipAnalysisWeightFilter !== 'all') {
      const book = BOOK_LIST.find(b => b.id === o.bookId);
      const weightKg = getWeightInKg(o.qty || 1, book);
      let band = 'Over 2 kg';
      if (weightKg < 0.5) band = 'Under 0.5 kg';
      else if (weightKg <= 1) band = '0.5 - 1 kg';
      else if (weightKg <= 2) band = '1 - 2 kg';
      if (band !== shipAnalysisWeightFilter) return false;
    }

    return true;
  }).filter(o => {
    if (!shipAnalysisSearchQuery) return true;
    const orderNum = String(o.num || '').toLowerCase();
    const name = String(o.shipName || o.name || '').toLowerCase();
    return orderNum.includes(shipAnalysisSearchQuery) || name.includes(shipAnalysisSearchQuery);
  });

  const totalOrders = filteredLedgerOrders.length;
  const totalPages = Math.ceil(totalOrders / SHIP_ANALYSIS_PAGE_SIZE) || 1;
  const currentPage = Math.min(shipAnalysisCurrentPage, totalPages);
  const startIndex = (currentPage - 1) * SHIP_ANALYSIS_PAGE_SIZE;
  const endIndex = Math.min(startIndex + SHIP_ANALYSIS_PAGE_SIZE, totalOrders);
  const paginatedOrders = filteredLedgerOrders.slice(startIndex, endIndex);

  let ledgerRowsHtml = '';
  paginatedOrders.forEach(o => {
    const orderNumber = normalizeShippingOrderNumber(o.num);
    const linked = orderNumber ? shippoExpenses.filter(e =>
      e.shippingMatchStatus === 'matched' && normalizeShippingOrderNumber(e.shippingOrderNumber) === orderNumber
    ) : [];

    const isLinked = linked.length > 0;
    
    // Find if there's a suggested match
    const suggested = orderNumber ? (TAX_CENTER.businessExpenses || []).filter(e =>
      String(e?.ref || '').startsWith('shippo:') &&
      e.shippingMatchStatus !== 'matched' &&
      normalizeShippingOrderNumber(e.shippingOrderNumber) === orderNumber
    ) : [];
    const isSuggested = suggested.length > 0;

    const postageCostCAD = o.manualPostagePaid
      ? (Number(o.postagePaid) || 0)
      : linked.reduce((sum, e) => sum + (Number(e.baseAmount) || Number(e.amount) || 0), 0);

    const customerPaidBase = (Number(o.shippingPaid) || 0);
    const margin = customerPaidBase - postageCostCAD;

    const isUndercharged = isLinked && (margin < 0);
    const marginClass = margin >= 0 ? 'positive' : 'negative';

    const status = o.excludeFromShipping
      ? { label: 'Dismissed', className: 'neutral' }
      : o.manualPostagePaid
        ? { label: 'Manual', className: 'matched' }
        : (!isLinked && !isSuggested
          ? { label: 'Needs link', className: 'needs-link' }
          : isSuggested
            ? { label: 'Suggested', className: 'suggested' }
            : isUndercharged
              ? { label: 'Undercharged', className: 'undercharged' }
              : { label: 'Matched', className: 'matched' });

    const book = BOOK_LIST.find(b => b.id === o.bookId);
    const isSavedSuccess = (o.id === shipAnalysisRecentlySavedOrderId || o.num === shipAnalysisRecentlySavedOrderId);

    let linkBtn = '';
    let trackingLinkHtml = '';
    let expenseRefHtml = '';

    if (linked.length > 0) {
      const primary = linked[0];
      const parsedCarrier = parseCarrierInfo(primary.desc).provider;
      const tracking = parseTrackingNumber(primary.desc) || o.trackingNumber || '';
      const carrier = guessCarrier(tracking, primary.trackingUrl, parsedCarrier);
      const url = primary.trackingUrl || '';
      
      const refLink = primary.receipt
        ? `<a href="${escapeHtml(primary.receipt)}" target="_blank" class="shipping-pnl-tracking-link" title="Open Shippo label/receipt">${escapeHtml(primary.ref)}</a>`
        : `<div style="font-weight:600; color:var(--text);">${escapeHtml(primary.ref)}</div>`;

      expenseRefHtml = `
        ${refLink}
        <div style="font-size:10px; color:var(--text3); margin-top:2px;">
          ${escapeHtml(primary.desc || 'Shippo shipping label')}
        </div>`;

      if (tracking) {
        trackingLinkHtml = url
          ? `<a href="${escapeHtml(url)}" target="_blank" class="shipping-pnl-tracking-link">${escapeHtml(carrier)}: ${escapeHtml(tracking)}</a>`
          : `${escapeHtml(carrier)}: ${escapeHtml(tracking)}`;
      } else {
        trackingLinkHtml = `<span style="color:var(--text3); font-style:italic;">No tracking</span>`;
      }
    } else {
      expenseRefHtml = `<span style="color:var(--text3); font-style:italic;">Unlinked</span>`;
      trackingLinkHtml = `<span style="color:var(--text3); font-style:italic;">—</span>`;

      if (isSuggested) {
        const suggestedItem = suggested[0];
        linkBtn = `
          <button class="btn sm" onclick="confirmSuggestedShippoLink('${escapeHtml(o.num)}', '${escapeHtml(suggestedItem.ref)}')" style="font-size:10px; padding:3px 8px; background:var(--shipping-pnl-success); border-color:var(--shipping-pnl-success); color:#fff;">
            Confirm Match
          </button>`;
      }
    }

    let actionBtn = '';
    if (!o.excludeFromShipping && !isLinked && !isSuggested) {
      actionBtn = `
        <div style="margin-top:6px; display:flex; gap:4px; align-items:center;">
          <button class="btn sm" onclick="openManualShippoLinkModal('${escapeHtml(o.num)}')" style="font-size:10px; padding:3px 8px;">Link</button>
          <button class="btn sm ghost" onclick="dismissShippingAnalysisOrder('${escapeHtml(o.bookId)}', '${escapeHtml(o.id || o.num)}')" style="font-size:10px; padding:3px 8px; color:var(--text3); min-width:unset;" title="Dismiss order from calculations">✕ Dismiss</button>
        </div>`;
    } else if (isLinked || o.manualPostagePaid) {
      const mainBtn = o.manualPostagePaid
        ? `<button class="btn sm ghost" onclick="unlinkManualPostage('${escapeHtml(o.bookId)}', '${escapeHtml(o.id || o.num)}')" style="font-size:10px; padding:3px 8px; opacity:0.7;">Clear manual</button>`
        : `<button class="btn sm ghost" onclick="unlinkShippoExpense('${escapeHtml(linked[0].ref)}')" style="font-size:10px; padding:3px 8px; opacity:0.7;">Unlink</button>`;
      actionBtn = `
        <div style="margin-top:6px; display:flex; gap:4px; align-items:center;">
          ${mainBtn}
          <button class="btn sm ghost" onclick="dismissShippingAnalysisOrder('${escapeHtml(o.bookId)}', '${escapeHtml(o.id || o.num)}')" style="font-size:10px; padding:3px 8px; color:var(--text3); min-width:unset;" title="Dismiss order from calculations">✕ Dismiss</button>
        </div>`;
    }

    const checkboxHtml = !o.excludeFromShipping
      ? `<input type="checkbox" class="ship-order-checkbox" value="${escapeHtml(o.bookId + '|' + (o.id || o.num))}" onchange="updateShipAnalysisBatchActionUI()" />`
      : '';

    ledgerRowsHtml += `
      <tr id="shipping-ledger-row-${escapeHtml(o.num)}" class="shipping-pnl-ledger-row ${status.className}">
        <td style="text-align: center; vertical-align: middle;">${checkboxHtml}</td>
        <td class="shipping-pnl-order" data-label="Order">${escapeHtml(o.num)}</td>
        <td class="shipping-pnl-recipient" data-label="Recipient">
          <strong>${escapeHtml(o.shipName || o.name || 'Anonymous')}</strong>
          <span>${escapeHtml(book?.title || 'Unknown book')} (qty: ${o.qty || 1})</span>
          ${renderLedgerVerifyCell(o)}
        </td>
        <td data-label="Status">
          <div style="display:flex; flex-direction:column; gap:4px; align-items:flex-start;">
            <span class="shipping-pnl-status ${status.className}">${escapeHtml(status.label)}</span>
            ${linkBtn}
          </div>
        </td>
        <td class="shipping-pnl-money" data-label="Customer paid">
          <strong>${(Number(o.shippingPaid) || 0).toFixed(2)} CAD</strong>
        </td>
        <td class="shipping-pnl-money" data-label="Postage">
          <div style="display:flex; align-items:center; justify-content:flex-end; gap:6px;">
            <input type="number" step="0.01" min="0" 
              class="inline-postage-input ${isSavedSuccess ? 'saved-success' : ''}" 
              value="${postageCostCAD.toFixed(2)}" 
              data-book-id="${escapeHtml(o.bookId)}" 
              data-order-id="${escapeHtml(o.id || o.num)}" 
              onchange="onInlinePostageChange(this)"
            />
            <span style="font-size: 10px; color: var(--text3); font-weight: 600;">CAD</span>
          </div>
        </td>
        <td class="shipping-pnl-money ${marginClass}" data-label="Margin">
          <strong>${margin >= 0 ? '+' : ''}${margin.toFixed(2)} CAD</strong>
        </td>
        <td class="shipping-pnl-reference" data-label="Shippo reference">
          ${expenseRefHtml}
          ${actionBtn}
        </td>
        <td class="shipping-pnl-tracking" data-label="Tracking">
          ${trackingLinkHtml}
        </td>
      </tr>
    `;
  });

  let paginationHtml = '';
  if (totalPages > 1) {
    let pageButtons = '';
    const maxVisible = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);
    if (endPage - startPage + 1 < maxVisible) {
      startPage = Math.max(1, endPage - maxVisible + 1);
    }
    for (let p = startPage; p <= endPage; p++) {
      pageButtons += `
        <button class="btn sm ${p === currentPage ? 'primary' : 'ghost'}" 
                onclick="changeShipAnalysisPage(${p})" 
                style="min-width:32px; padding:4px 8px;">${p}</button>
      `;
    }

    paginationHtml = `
      <div style="display:flex; align-items:center; justify-content:space-between; padding:12px 16px; border-top:1px solid var(--border); font-size:12px; color:var(--text3); flex-wrap:wrap; gap:12px;">
        <div>Showing ${startIndex + 1} - ${endIndex} of ${totalOrders} orders</div>
        <div style="display:flex; gap:4px; align-items:center;">
          <button class="btn sm" onclick="changeShipAnalysisPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>Prev</button>
          ${pageButtons}
          <button class="btn sm" onclick="changeShipAnalysisPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>Next</button>
        </div>
      </div>
    `;
  }

  const ledgerTableHtml = ledgerRowsHtml
    ? `
      <div class="shipping-pnl-table-wrap">
        <div id="ship-analysis-batch-actions" style="display:none; padding:8px 12px; background:var(--card-bg); border-bottom:1px solid var(--border); align-items:center; justify-content:space-between; gap:12px;">
          <span style="font-size:12px; font-weight:600; color:var(--text);"><span id="ship-analysis-batch-count">0</span> orders selected</span>
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            <button class="btn sm" id="ship-analysis-batch-verify" onclick="batchVerifyLedgerAddresses()" title="Check every selected address with Shippo">⌖ Verify addresses</button>
            <button class="btn sm ghost" onclick="batchDismissShippingAnalysisOrders()" style="color:var(--text3); border:1px solid var(--border);">✕ Dismiss Selected</button>
          </div>
        </div>
        <table class="shipping-pnl-ledger-table">
          <thead>
            <tr>
              <th style="width: 40px; text-align: center;"><input type="checkbox" id="selectAllShipOrders" onchange="toggleAllShipAnalysisOrders(this.checked)" /></th>
              <th>Order</th>
              <th>Recipient</th>
              <th>Status</th>
              <th>Customer paid</th>
              <th>Postage</th>
              <th>Margin</th>
              <th>Shippo reference</th>
              <th>Tracking</th>
            </tr>
          </thead>
          <tbody>
            ${ledgerRowsHtml}
          </tbody>
        </table>
      </div>
      ${paginationHtml}
    `
    : `<div class="shipping-pnl-empty">No direct website orders are available for shipping analysis yet.</div>`;

  const hasActiveFilters = (shipAnalysisCarrierFilter !== 'all' || shipAnalysisRegionFilter !== 'all' || shipAnalysisWeightFilter !== 'all');
  let activeFiltersBannerHtml = '';
  if (hasActiveFilters) {
    let filterBadges = '';
    if (shipAnalysisCarrierFilter !== 'all') {
      filterBadges += `
        <span class="shipping-filter-badge">
          Carrier: ${escapeHtml(shipAnalysisCarrierFilter)}
          <span class="shipping-filter-badge-close" onclick="toggleShipAnalysisCarrierFilter('${escapeHtml(shipAnalysisCarrierFilter)}')" title="Remove filter">✕</span>
        </span>
      `;
    }
    if (shipAnalysisRegionFilter !== 'all') {
      filterBadges += `
        <span class="shipping-filter-badge">
          Region: ${shipAnalysisRegionFilter === 'CA' ? 'Canadian' : (shipAnalysisRegionFilter === 'US' ? 'USA' : 'International')}
          <span class="shipping-filter-badge-close" onclick="toggleShipAnalysisRegionFilter('${shipAnalysisRegionFilter}')" title="Remove filter">✕</span>
        </span>
      `;
    }
    if (shipAnalysisWeightFilter !== 'all') {
      filterBadges += `
        <span class="shipping-filter-badge">
          Weight: ${escapeHtml(shipAnalysisWeightFilter)}
          <span class="shipping-filter-badge-close" onclick="toggleShipAnalysisWeightFilter('${escapeHtml(shipAnalysisWeightFilter)}')" title="Remove filter">✕</span>
        </span>
      `;
    }

    activeFiltersBannerHtml = `
      <div class="shipping-active-filters-bar">
        <span class="shipping-active-filters-label">Active Drill-down:</span>
        <div class="shipping-active-filters-badges">
          ${filterBadges}
        </div>
        <button class="btn sm ghost" onclick="clearAllShipAnalysisFilters()" style="color:var(--red); font-size:11px; padding:2px 8px; border:1px solid var(--red); border-radius:var(--r2); background:transparent; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:4px; margin-left:auto;">
          ✕ Clear All
        </button>
      </div>
    `;
  }


  return { ledgerTableHtml, activeFiltersBannerHtml };
}

function buildShippingInsightsHtml(allOrders, shippoExpenses, carrierTableHtml, splitTableHtml, weightTableHtml) {
  // Calculate smart shipping rate recommendations
  const s = getState();
  const recoData = getSmartShippingRecommendations(allOrders, shippoExpenses);
  const targetRates = s.shippingRates || {
    ON: { base: 16.00, addon: 10.00 },
    CA: { base: 20.00, addon: 10.00 },
    US: { base: 25.00, addon: 10.00 },
    intl: { base: 25.00, addon: 10.00 }
  };

  const regionMeta = {
    ON: { name: 'Ontario', icon: '🍁', key: 'ON' },
    CA: { name: 'Rest of Canada', icon: '🇨🇦', key: 'CA' },
    US: { name: 'United States', icon: '🇺🇸', key: 'US' },
    intl: { name: 'International', icon: '🌐', key: 'intl' }
  };

  let columnsHtml = '';
  Object.keys(regionMeta).forEach(key => {
    const meta = regionMeta[key];
    const data = recoData.results[key];
    const current = targetRates[key] || { base: 0, addon: 0 };
    const currentBase = current.base;
    const currentAddon = current.addon;
    const recoBase = data.recoBase;
    const recoAddon = data.recoAddon;

    let statusBadgeHtml = '';
    let borderStyle = 'border: 1px solid var(--border);';
    if (data.N === 0) {
      statusBadgeHtml = `<span style="background:rgba(107,102,94,0.08); color:var(--text3); font-size:10px; font-weight:700; padding:2px 8px; border-radius:99px; border:1px solid rgba(107,102,94,0.15);">Default</span>`;
    } else if (currentBase < recoBase) {
      statusBadgeHtml = `<span style="background:rgba(201,75,50,0.08); color:var(--red); font-size:10px; font-weight:700; padding:2px 8px; border-radius:99px; border:1px solid rgba(201,75,50,0.15);">⚠️ Undercharged</span>`;
      borderStyle = 'border: 1px solid rgba(201,75,50,0.3); box-shadow: 0 4px 15px rgba(201,75,50,0.04);';
    } else {
      statusBadgeHtml = `<span style="background:rgba(29,122,74,0.08); color:var(--green); font-size:10px; font-weight:700; padding:2px 8px; border-radius:99px; border:1px solid rgba(29,122,74,0.15);">✓ Optimized</span>`;
    }

    const confidenceColor = data.confidence === 'High' ? '#1d7a4a' : data.confidence === 'Medium' ? '#c8913a' : '#6b665e';
    const avgCostStr = data.avgCost !== null ? `$${data.avgCost.toFixed(2)} CAD` : '—';
    const p90CostStr = data.p90Cost !== null ? `$${data.p90Cost.toFixed(2)} CAD` : '—';

    columnsHtml += `
      <div class="shipping-reco-col" style="background:var(--cream2); border-radius:var(--r2); padding:18px; display:flex; flex-direction:column; justify-content:space-between; position:relative; overflow:hidden; min-height:330px; transition: all 0.2s ease-in-out; ${borderStyle}">
        <div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <h4 style="font-size:14px; font-weight:700; color:var(--text); margin:0; display:flex; align-items:center; gap:6px;">
              <span style="font-size:16px;">${meta.icon}</span> ${meta.name}
            </h4>
            ${statusBadgeHtml}
          </div>

          <div style="background:var(--surface-card); border:1px solid var(--border); border-radius:var(--r); padding:10px 12px; margin-bottom:14px; box-shadow:inset 0 1px 3px rgba(0,0,0,0.02);">
            <label style="font-size:9px; font-weight:700; letter-spacing: 0.05em; text-transform:uppercase; color:var(--text3); display:block; margin-bottom:4px;">Recommended Rate</label>
            <div style="display:flex; justify-content:space-between; align-items:baseline;">
              <span style="font-size:18px; font-weight:800; color:var(--gold);">$${recoBase.toFixed(2)} <span style="font-size:10px; font-weight:400; color:var(--text3);">base</span></span>
              <span style="font-size:13px; font-weight:600; color:var(--text2);">+$${recoAddon.toFixed(2)} <span style="font-size:10px; font-weight:400; color:var(--text3);">add-on</span></span>
            </div>
          </div>

          <div style="font-size:11px; color:var(--text3); margin-bottom:16px; line-height:1.7;">
            <div style="display:flex; justify-content:space-between; border-bottom:1px dashed rgba(0,0,0,0.04); padding-bottom:3px;">
              <span>Confidence:</span>
              <span style="font-weight:700; color:${confidenceColor};">${data.confidence}</span>
            </div>
            <div style="display:flex; justify-content:space-between; border-bottom:1px dashed rgba(0,0,0,0.04); padding-bottom:3px; margin-top:3px;">
              <span>Historical labels:</span>
              <strong style="color:var(--text);">${data.N}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; border-bottom:1px dashed rgba(0,0,0,0.04); padding-bottom:3px; margin-top:3px;">
              <span>Avg postage cost:</span>
              <strong style="color:var(--text);">${avgCostStr}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; padding-bottom:3px; margin-top:3px;">
              <span>90th percentile cost:</span>
              <strong style="color:var(--text);">${p90CostStr}</strong>
            </div>
          </div>
        </div>

        <div style="border-top:1px solid var(--border); padding-top:12px; margin-top:auto;">
          <label style="font-size:9px; font-weight:700; letter-spacing: 0.05em; text-transform:uppercase; color:var(--text3); display:block; margin-bottom:8px;">Current Store Setup</label>
          <div style="display:flex; gap:6px; align-items:center; margin-bottom:10px;">
            <div style="flex:1;">
              <span style="font-size:9px; color:var(--text2); display:block; margin-bottom:2px;">Base ($)</span>
              <input type="number" step="0.50" min="0" value="${currentBase.toFixed(2)}" 
                onblur="updateManualShippingRates('${meta.key}', 'base', this.value)"
                style="width:100%; padding:6px 8px; font-size:12px; border:1px solid var(--border); border-radius:var(--r); background:var(--surface-card); color:var(--text); text-align:right; font-family:'DM Mono',monospace; outline:none;" />
            </div>
            <div style="flex:1;">
              <span style="font-size:9px; color:var(--text2); display:block; margin-bottom:2px;">Add-on ($)</span>
              <input type="number" step="0.50" min="0" value="${currentAddon.toFixed(2)}" 
                onblur="updateManualShippingRates('${meta.key}', 'addon', this.value)"
                style="width:100%; padding:6px 8px; font-size:12px; border:1px solid var(--border); border-radius:var(--r); background:var(--surface-card); color:var(--text); text-align:right; font-family:'DM Mono',monospace; outline:none;" />
            </div>
          </div>
          <button class="btn sm ghost" onclick="applySmartShippingRates('${meta.key}', ${recoBase}, ${recoAddon})" 
            style="width:100%; font-size:10px; padding:4px; border-radius:var(--r); text-align:center; font-weight:600; display:flex; align-items:center; justify-content:center; gap:4px; height:28px; border:1px dashed var(--border); cursor:pointer;">
            ⚡ Apply Recommended
          </button>
        </div>
      </div>
    `;
  });

  let bookOptionsHtml = '';
  BOOK_LIST.forEach(b => {
    const wStr = b.shipWeight ? `${b.shipWeight} ${b.shipWeightUnit || 'lb'}` : 'unknown';
    bookOptionsHtml += `<option value="${escapeHtml(b.id)}">${escapeHtml(b.title)} (${wStr})</option>`;
  });

  // ── Render complete layout ──
  const activeBookIdForWeight = shipAnalysisBookFilter;
  const filteredBookForWeight = activeBookIdForWeight !== 'all' ? BOOK_LIST.find(b => b.id === activeBookIdForWeight) : null;
  const bookWeightKg = getWeightInKg(1, filteredBookForWeight || BOOK_LIST[0]);
  
  const weightOverride = getShipWeightOverride();
  const recoMode = getShipRecoMode();
  const recoPercentile = getShipRecoPercentile();
  const isInsightsOpen = localStorage.getItem(`lm-ship-insights-open-${shipAnalysisBookFilter}`) !== 'false';

  let pctLabel = '75th';
  if (recoPercentile === 90) pctLabel = '90th';
  else if (recoPercentile === 50) pctLabel = '50th';

  let explanationText = `Analyzes historical shipping labels and order quantities to calculate optimized rates. Base price targets the ${pctLabel} percentile of actual postage for outlier coverage; add-ons reflect average incremental weight costs.`;
  if (recoMode === 'cpost') {
    explanationText = `Using fixed Canada Post flat-rates. Risk profiles and statistical percentiles are inactive when not using blended history.`;
  }

  const sandboxHtml = `
    <section class="shipping-reco-container" style="background:var(--cream2); border:1px solid var(--border); border-radius:var(--r3); padding:20px; margin:0 20px 20px 20px; box-shadow:0 4px 15px rgba(0,0,0,0.02);">
      <h3 style="font-family:'Playfair Display',serif; font-size:18px; color:var(--text); margin:0 0 6px; font-weight:700;">
        🧪 Live Rate Simulation Sandbox
      </h3>
      <p style="font-size:12px; color:var(--text3); margin:0 0 16px; line-height:1.5;">
        Test how your current and recommended shipping rates perform against actual weight calculations and estimated postage costs.
      </p>

      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:20px; align-items:start;">
        <!-- Controls -->
        <div style="display:flex; flex-direction:column; gap:12px;">
          <div class="form-group" style="margin:0;">
            <label style="font-size:10px; font-weight:700; text-transform:uppercase; color:var(--text3); margin-bottom:4px; display:block;">Select Book</label>
            <select id="sim-book-select" onchange="updateShippingSimulation()" style="width:100%; padding:8px 12px; font-size:12px; border:1px solid var(--border); border-radius:var(--r); background:var(--surface-card); color:var(--text); outline:none; font-weight:600; cursor:pointer;">
              ${bookOptionsHtml}
            </select>
          </div>

          <div style="display:flex; gap:12px;">
            <div class="form-group" style="flex:1; margin:0;">
              <label style="font-size:10px; font-weight:700; text-transform:uppercase; color:var(--text3); margin-bottom:4px; display:block;">Quantity</label>
              <input type="number" id="sim-qty-input" value="1" min="1" max="100" oninput="updateShippingSimulation()" style="width:100%; padding:8px 12px; font-size:12px; border:1px solid var(--border); border-radius:var(--r); background:var(--surface-card); color:var(--text); outline:none; text-align:right; font-family:'DM Mono',monospace;" />
            </div>
            <div class="form-group" style="flex:1; margin:0;">
              <label style="font-size:10px; font-weight:700; text-transform:uppercase; color:var(--text3); margin-bottom:4px; display:block;">Destination</label>
              <select id="sim-region-select" onchange="updateShippingSimulation()" style="width:100%; padding:8px 12px; font-size:12px; border:1px solid var(--border); border-radius:var(--r); background:var(--surface-card); color:var(--text); outline:none; font-weight:600; cursor:pointer;">
                <option value="ON">Ontario 🍁</option>
                <option value="CA">Rest of Canada 🇨🇦</option>
                <option value="US">United States 🇺🇸</option>
                <option value="intl">International 🌐</option>
              </select>
            </div>
          </div>

          <div style="display:flex; gap:12px;">
            <div class="form-group" style="flex:1; margin:0;">
              <label style="font-size:10px; font-weight:700; text-transform:uppercase; color:var(--text3); margin-bottom:4px; display:block;">Packaging Tare</label>
              <select id="sim-tare-select" onchange="updateShippingSimulation()" style="width:100%; padding:8px 12px; font-size:12px; border:1px solid var(--border); border-radius:var(--r); background:var(--surface-card); color:var(--text); outline:none; font-weight:600; cursor:pointer;">
                <option value="0">None (0 g)</option>
                <option value="0.05" selected>Bubble Mailer (+50 g)</option>
                <option value="0.15">Cardboard Box (+150 g)</option>
                <option value="0.30">Heavy Box (+300 g)</option>
              </select>
            </div>
            <div class="form-group" style="flex:1; margin:0;">
              <label style="font-size:10px; font-weight:700; text-transform:uppercase; color:var(--text3); margin-bottom:4px; display:block;">
                Manual Weight <span style="font-weight:400; text-transform:none; color:var(--text3);">(kg)</span>
              </label>
              <input type="number" id="sim-weight-override" placeholder="Auto-calculated" step="0.05" min="0" oninput="updateShippingSimulation()" style="width:100%; padding:8px 12px; font-size:12px; border:1px solid var(--border); border-radius:var(--r); background:var(--surface-card); color:var(--text); outline:none; text-align:right; font-family:'DM Mono',monospace;" />
            </div>
          </div>

          <div class="form-group" style="margin:0;">
            <label style="font-size:10px; font-weight:700; text-transform:uppercase; color:var(--text3); margin-bottom:4px; display:block;">
              Custom Postage Override <span style="font-weight:400; text-transform:none; color:var(--text3);">(optional)</span>
            </label>
            <input type="number" id="sim-postage-override" placeholder="Use default band fallback" step="0.50" min="0" oninput="updateShippingSimulation()" style="width:100%; padding:8px 12px; font-size:12px; border:1px solid var(--border); border-radius:var(--r); background:var(--surface-card); color:var(--text); outline:none; text-align:right; font-family:'DM Mono',monospace;" />
          </div>
        </div>

        <!-- Results -->
        <div id="sim-results-panel" style="background:var(--surface-card); border:1px solid var(--border); border-radius:var(--r2); padding:16px; min-height:190px; display:flex; flex-direction:column; justify-content:space-between; box-shadow:0 4px 10px rgba(0,0,0,0.01);">
          <!-- Will be populated dynamically via updateShippingSimulation() -->
        </div>
      </div>
    </section>
  `;

  const insightsHtml = `
    <details class="shipping-pnl-insights" ${isInsightsOpen ? 'open' : ''} ontoggle="onShipInsightsToggle(this.open)" style="margin-bottom: var(--shipping-pnl-space-4) !important;">
      <summary>
        <span>
          <span class="shipping-pnl-eyebrow">Insights</span>
          <strong>Smart rate recommendations and live simulation sandbox</strong>
        </span>
        <span class="shipping-pnl-disclosure">Show analysis ▼</span>
      </summary>

      <section class="shipping-reco-container" style="background:var(--surface-card); border:1px solid var(--border); border-radius:var(--r3); padding:20px; margin:20px; box-shadow:0 8px 30px rgba(0,0,0,0.04);">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:18px; flex-wrap:wrap; gap:12px;">
          <div>
            <h3 style="font-family:'Playfair Display',serif; font-size:20px; color:var(--text); margin:0; display:flex; align-items:center; gap:8px; font-weight:700;">
              <span>🪄</span> Smart Shipping Rate Recommendations
            </h3>
            <p style="font-size:12px; color:var(--text3); margin:4px 0 0; line-height:1.5; max-width:650px;">
              ${explanationText}
            </p>
          </div>
          <div style="background:var(--cream2); padding:8px 12px; border-radius:var(--r2); border:1px solid var(--border); font-size:11px; color:var(--text2); display:flex; align-items:center; gap:12px; font-weight:600; flex-wrap:wrap;">
            <div style="display:flex; align-items:center; gap:4px;">
              <span style="font-size:13px;">⚖️</span> Weight Profile:
              <select id="ship-reco-weight-select" onchange="onShipRecoWeightSelectChange(this.value)" style="padding:4px 8px; font-size:11px; border:1px solid var(--border); border-radius:var(--r); background:var(--surface-card); color:var(--text); outline:none; font-weight:600; cursor:pointer; margin-left:4px;">
                <option value="default" ${weightOverride === 'default' ? 'selected' : ''}>Book Weight (${bookWeightKg.toFixed(2)} kg)</option>
                <option value="under_0.5" ${weightOverride === 'under_0.5' ? 'selected' : ''}>Under 0.5 kg (0.3 kg)</option>
                <option value="0.5_1" ${weightOverride === '0.5_1' ? 'selected' : ''}>0.5 - 1 kg (0.8 kg)</option>
                <option value="1_2" ${weightOverride === '1_2' ? 'selected' : ''}>1 - 2 kg (1.5 kg)</option>
                <option value="over_2" ${weightOverride === 'over_2' ? 'selected' : ''}>Over 2 kg (2.5 kg)</option>
                <option value="custom" ${!['default','under_0.5','0.5_1','1_2','over_2'].includes(weightOverride) ? 'selected' : ''}>Custom Weight...</option>
              </select>
              <input id="ship-reco-custom-weight-input" type="number" step="0.1" min="0.01" value="${!['default','under_0.5','0.5_1','1_2','over_2'].includes(weightOverride) ? parseFloat(weightOverride).toFixed(2) : bookWeightKg.toFixed(2)}" 
                onchange="onShipRecoCustomWeightChange(this.value)"
                style="display:${!['default','under_0.5','0.5_1','1_2','over_2'].includes(weightOverride) ? 'inline-block' : 'none'}; width:60px; padding:3px 6px; font-size:11px; border:1px solid var(--border); border-radius:var(--r); text-align:right; font-family:'DM Mono',monospace; outline:none; margin-left:4px;" />
              <span style="font-size:11px; color:var(--text3); font-weight:400; margin-left:4px;">(${recoData.bandName})</span>
            </div>
            
            <div style="border-left:1px solid var(--border); height:16px;"></div>
            
            <div style="display:flex; align-items:center; gap:4px;">
              <span style="font-size:13px;">⚙️</span> Methodology:
              <select id="ship-reco-mode-select" onchange="onShipRecoModeChange(this.value)" style="padding:4px 8px; font-size:11px; border:1px solid var(--border); border-radius:var(--r); background:var(--surface-card); color:var(--text); outline:none; font-weight:600; cursor:pointer; margin-left:4px;">
                <option value="blended" ${recoMode === 'blended' ? 'selected' : ''}>Blended (History + CP)</option>
                <option value="cpost" ${recoMode === 'cpost' ? 'selected' : ''}>Canada Post Only</option>
              </select>
            </div>

            <div style="border-left:1px solid var(--border); height:16px;"></div>

            <div style="display:flex; align-items:center; gap:4px; opacity:${recoMode === 'cpost' ? '0.5' : '1'};">
              <span style="font-size:13px;">🎯</span> Risk Profile:
              <select id="ship-reco-percentile-select" onchange="onShipRecoPercentileChange(this.value)" ${recoMode === 'cpost' ? 'disabled' : ''} style="padding:4px 8px; font-size:11px; border:1px solid var(--border); border-radius:var(--r); background:var(--surface-card); color:var(--text); outline:none; font-weight:600; cursor:${recoMode === 'cpost' ? 'not-allowed' : 'pointer'}; margin-left:4px;">
                <option value="90" ${recoPercentile === 90 ? 'selected' : ''}>Conservative (90th %)</option>
                <option value="75" ${recoPercentile === 75 ? 'selected' : ''}>Balanced (75th %)</option>
                <option value="50" ${recoPercentile === 50 ? 'selected' : ''}>Aggressive (50th %)</option>
              </select>
            </div>
          </div>
        </div>
        <div class="shipping-reco-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:16px;">
          ${columnsHtml}
        </div>
      </section>

      ${sandboxHtml}
    </details>
  `;

  const statsHtml = `
    <div class="shipping-pnl-insights" style="margin-bottom: var(--shipping-pnl-space-4) !important; padding: 0;">
      <div class="shipping-pnl-insights-grid" style="border-top: none;">
        <section class="shipping-pnl-insight-card">
          <h3>📦 Carrier efficiency</h3>
          ${carrierTableHtml}
        </section>
        <section class="shipping-pnl-insight-card">
          <h3>🌎 Destination mix</h3>
          ${splitTableHtml}
        </section>
        <section class="shipping-pnl-insight-card">
          <h3>⚖️ Weight-band cost</h3>
          ${weightTableHtml}
        </section>
      </div>
    </div>
  `;


  return { insightsHtml, statsHtml };
}

function renderShippingAnalysisHub() {
  const hub = $('ship-analysis-hub');
  if (!hub) return;

  const isPub = !isAuthor();

  // 1. Gather all website orders matching the selected analysis book filter
  const allOrders = [];
  Object.keys(states).forEach(bookId => {
    if (shipAnalysisBookFilter === 'all' || bookId === shipAnalysisBookFilter) {
      const s = states[bookId];
      if (s && Array.isArray(s.hist)) {
        s.hist.forEach(h => {
          if (h && h.chan === 'Website' && !h.voided) {
            const dateMs = h.date ? new Date(h.date).getTime() : 0;
            allOrders.push({ ...h, bookId, _dateMs: dateMs });
          }
        });
      }
    }
  });

  allOrders.sort((a, b) => b._dateMs - a._dateMs);

  // 2. Gather all Shippo postage expenses matching the selected analysis book filter
  const shippoExpenses = (TAX_CENTER.businessExpenses || []).filter(e => String(e?.ref || '').startsWith('shippo:'));
  const relevantExpenses = (shipAnalysisBookFilter === 'all')
    ? shippoExpenses
    : shippoExpenses.filter(e => {
      const num = normalizeShippingOrderNumber(e.shippingOrderNumber);
      return num && allOrders.some(o => normalizeShippingOrderNumber(o.num) === num);
    });

  // Build the book filter dropdown options
  let bookFilterOptions = `<option value="all" ${shipAnalysisBookFilter === 'all' ? 'selected' : ''}>— All Books —</option>`;
  BOOK_LIST.forEach(b => {
    bookFilterOptions += `<option value="${b.id}" ${shipAnalysisBookFilter === b.id ? 'selected' : ''}>${escapeHtml(b.title)}</option>`;
  });

  let marginFilterOptions = `
    <option value="all" ${shipAnalysisMarginFilter === 'all' ? 'selected' : ''}>— All Margins —</option>
    <option value="loss" ${shipAnalysisMarginFilter === 'loss' ? 'selected' : ''}>Undercharged (Losses)</option>
    <option value="profit" ${shipAnalysisMarginFilter === 'profit' ? 'selected' : ''}>Profitable</option>
    <option value="missing" ${shipAnalysisMarginFilter === 'missing' ? 'selected' : ''}>Missing Cust. Paid</option>
    <option value="dismissed" ${shipAnalysisMarginFilter === 'dismissed' ? 'selected' : ''}>Dismissed / Hidden</option>
  `;


  const pnlHtml = buildShippingPnLHtml(allOrders, relevantExpenses, shippoExpenses, bookFilterOptions, marginFilterOptions, isPub);
  const carrierTableHtml = buildShippingCarrierScorecardHtml(allOrders, relevantExpenses);
  const splitTableHtml = buildShippingRegionSplitHtml(allOrders, shippoExpenses);
  const weightTableHtml = buildShippingWeightBandHtml(allOrders, shippoExpenses);
  const { ledgerTableHtml, activeFiltersBannerHtml } = buildShippingLedgerHtml(allOrders, shippoExpenses);
  const { insightsHtml, statsHtml } = buildShippingInsightsHtml(allOrders, shippoExpenses, carrierTableHtml, splitTableHtml, weightTableHtml);

  hub.innerHTML = `
    ${pnlHtml}
    ${statsHtml}
    <section class="shipping-pnl-ledger" id="shipping-pnl-ledger" aria-labelledby="shipping-pnl-ledger-title">
      <header class="shipping-pnl-section-header">
        <div>
          <p class="shipping-pnl-eyebrow">Reconciliation ledger</p>
          <h3 id="shipping-pnl-ledger-title">Every order, clearly accounted for</h3>
        </div>
        <div style="display:flex; flex-direction:column; align-items:flex-end; gap:6px;">
          <button class="btn sm gold" onclick="downloadFilteredShippingLedgerCSV()" style="font-size:11px; padding:4px 10px; font-weight:600; cursor:pointer;">
            📥 Export CSV
          </button>
          <p>Unlinked orders are kept distinct so zeroes never imply settled postage.</p>
        </div>
      </header>
      ${activeFiltersBannerHtml}
      ${ledgerTableHtml}
    </section>
    ${insightsHtml}
  `;

  setTimeout(updateShippingSimulation, 50);
}

function updateShippingSimulation() {
  const bookSelect = $('sim-book-select');
  const qtyInput = $('sim-qty-input');
  const regionSelect = $('sim-region-select');
  const postageOverride = $('sim-postage-override');
  const simResultsPanel = $('sim-results-panel');

  if (!bookSelect || !qtyInput || !regionSelect || !simResultsPanel) return;

  const bookId = bookSelect.value;
  const qty = Math.max(1, parseInt(qtyInput.value, 10) || 1);
  const region = regionSelect.value;
  const customPostage = postageOverride && postageOverride.value ? parseFloat(postageOverride.value) : null;

  const book = BOOK_LIST.find(b => b.id === bookId);
  if (!book) {
    simResultsPanel.innerHTML = '<div style="color:var(--text3); font-style:italic;">Select a valid book to simulate.</div>';
    return;
  }

  const weightOverrideInput = $('sim-weight-override');
  const manualWeightKg = weightOverrideInput && weightOverrideInput.value !== '' ? parseFloat(weightOverrideInput.value) : null;

  const tareSelect = $('sim-tare-select');
  const tareKg = tareSelect ? (parseFloat(tareSelect.value) || 0) : 0;

  const bookWeightKg = getWeightInKg(qty, book);
  const calculatedActualWeightKg = bookWeightKg + tareKg;
  const totalActualWeightKg = (manualWeightKg !== null && !isNaN(manualWeightKg) && manualWeightKg >= 0)
    ? manualWeightKg
    : calculatedActualWeightKg;

  // Canada Post Volumetric Weight formula: (L x W x H in cm) / 5000
  const lengthCm = Number(book.lengthCm || book.length) || 23;
  const widthCm = Number(book.widthCm || book.width) || 15;
  const singleThicknessCm = Number(book.thicknessCm || book.thickness || book.depth) || 2.0;
  const totalHeightCm = singleThicknessCm * qty + (tareKg > 0 ? 1.5 : 0);
  const volumetricWeightKg = (lengthCm * widthCm * totalHeightCm) / 5000;

  // Canada Post charges based on the greater of actual physical weight or volumetric weight
  const billedWeightKg = Math.max(totalActualWeightKg, volumetricWeightKg);
  const billedWeightLbs = billedWeightKg * 2.20462;
  const isVolumetricBilled = volumetricWeightKg > totalActualWeightKg;

  let weightBandLabel = 'Under 0.5 kg';
  if (billedWeightKg >= 2) weightBandLabel = 'Over 2 kg';
  else if (billedWeightKg > 1) weightBandLabel = '1 - 2 kg';
  else if (billedWeightKg >= 0.5) weightBandLabel = '0.5 - 1 kg';

  // The panel shows the estimated postage for the simulated parcel. Two further
  // blocks used to sit here computing the current store charge and a
  // recommended charge, and nothing ever read either one — the comparison they
  // were for was never wired into the markup. The recommended side scanned
  // every book's full sales history and ran getSmartShippingRecommendations()
  // on every keystroke in the simulator to produce a number that was discarded.
  // Estimated Postage Cost
  const fallback = getFallbackRates(region, billedWeightKg);
  const estimatedPostage = fallback.base;
  const postageCost = customPostage !== null && !isNaN(customPostage) ? customPostage : estimatedPostage;


  const formatCcy = (val) => `$${val.toFixed(2)} CAD`;

  simResultsPanel.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:12px; height:100%; justify-content:space-between;">
      <div>
        <!-- Billed Weight & Band Meta Bar -->
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:1px solid var(--border); padding-bottom:6px; flex-wrap:wrap; gap:6px;">
          <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
            <span style="font-size:10px; font-weight:700; color:var(--text3); text-transform:uppercase; letter-spacing:0.04em;">Canada Post Billed Weight</span>
            <span style="background:var(--cream2); border:1px solid var(--border); border-radius:99px; padding:2px 8px; font-size:10px; font-weight:700; color:var(--text2);">🏷️ Band: ${weightBandLabel}</span>
            ${isVolumetricBilled
              ? `<span style="background:rgba(200,145,58,0.15); border:1px solid var(--gold-line); border-radius:99px; padding:2px 8px; font-size:10px; font-weight:700; color:var(--gold);" title="Volumetric weight exceeds actual weight (L x W x H / 5000)">📐 Volumetric Billed (${volumetricWeightKg.toFixed(2)} kg)</span>`
              : `<span style="background:rgba(0,120,60,0.08); border:1px solid rgba(0,120,60,0.2); border-radius:99px; padding:2px 8px; font-size:10px; font-weight:700; color:var(--green);">⚖️ Actual Weight</span>`
            }
          </div>
          <span style="font-family:'DM Mono',monospace; font-size:12px; font-weight:700; color:var(--text);">${billedWeightKg.toFixed(3)} kg (${billedWeightLbs.toFixed(2)} lbs)</span>
        </div>

        <!-- HERO CARD: Est. Postage Cost (Primary Focal Point) -->
        <div style="background:linear-gradient(135deg, rgba(26,77,46,0.07), rgba(26,77,46,0.02)); border:1.5px solid var(--green); border-radius:var(--r2); padding:16px; display:flex; justify-content:space-between; align-items:center; box-shadow:0 2px 8px rgba(0,0,0,0.02);">
          <div>
            <div style="display:flex; align-items:center; gap:6px; margin-bottom:2px;">
              <span style="font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; color:var(--green);">Est. Postage Cost (${region})</span>
              <span style="background:rgba(26,77,46,0.1); color:var(--green); font-size:9px; font-weight:700; padding:1px 6px; border-radius:99px;">🚚 Tracked</span>
            </div>
            <div style="font-family:'DM Mono',monospace; font-size:26px; font-weight:800; color:var(--text); line-height:1.1;">
              ${formatCcy(postageCost)}
            </div>
            ${billedWeightKg < 0.5 && qty === 1
              ? `<div style="color:var(--green); font-size:10px; font-weight:600; margin-top:6px; display:flex; gap:4px; align-items:center;">
                   <span>💡</span> <span>Canada Post Lettermail eligible (if thickness &lt; 2cm).</span>
                 </div>`
              : ''
            }
          </div>
          <div style="text-align:right;">
            <span style="font-size:10px; color:var(--text3); display:block;">Carrier</span>
            <strong style="font-size:13px; color:var(--text); font-weight:700;">Canada Post</strong>
          </div>
        </div>
      </div>
    </div>
  `;
}

function downloadFilteredShippingLedgerCSV() {
  const shippoExpenses = (TAX_CENTER.businessExpenses || []).filter(e => String(e?.ref || '').startsWith('shippo:'));
  
  const allOrders = [];
  Object.keys(states).forEach(bookId => {
    if (shipAnalysisBookFilter === 'all' || bookId === shipAnalysisBookFilter) {
      const s = states[bookId];
      if (s && Array.isArray(s.hist)) {
        s.hist.forEach(h => {
          if (h && h.chan === 'Website' && !h.voided) {
            const dateMs = h.date ? new Date(h.date).getTime() : 0;
            allOrders.push({ ...h, bookId, _dateMs: dateMs });
          }
        });
      }
    }
  });

  allOrders.sort((a, b) => b._dateMs - a._dateMs);

  const filteredOrders = allOrders.filter(o => {
    if (shipAnalysisMarginFilter === 'dismissed') return o.excludeFromShipping === true;
    if (o.excludeFromShipping) return false;

    // A. Margin health filter
    if (shipAnalysisMarginFilter !== 'all') {
      const customerPaidBase = Number(o.shippingPaid) || 0;
      const orderNumber = normalizeShippingOrderNumber(o.num);
      const linked = orderNumber ? shippoExpenses.filter(e =>
        e.shippingMatchStatus === 'matched' && normalizeShippingOrderNumber(e.shippingOrderNumber) === orderNumber
      ) : [];

      if (shipAnalysisMarginFilter === 'missing') {
        if (customerPaidBase !== 0) return false;
      } else {
        const hasPostage = linked.length > 0 || !!o.manualPostagePaid;
        if (!hasPostage) return false;

        const postageCostCAD = o.manualPostagePaid
          ? (Number(o.postagePaid) || 0)
          : linked.reduce((sum, e) => sum + (Number(e.baseAmount) || Number(e.amount) || 0), 0);
        const margin = customerPaidBase - postageCostCAD;

        if (shipAnalysisMarginFilter === 'loss' && margin >= 0) return false;
        if (shipAnalysisMarginFilter === 'profit' && margin < 0) return false;
      }
    }

    // B. Carrier filter
    if (shipAnalysisCarrierFilter !== 'all') {
      const orderNumber = normalizeShippingOrderNumber(o.num);
      const linked = orderNumber ? shippoExpenses.filter(e =>
        e.shippingMatchStatus === 'matched' && normalizeShippingOrderNumber(e.shippingOrderNumber) === orderNumber
      ) : [];
      const carrier = o.manualPostagePaid
        ? 'Manual Override'
        : (linked.length > 0 ? parseCarrierInfo(linked[0].desc).provider : 'Unlinked');
      if (carrier !== shipAnalysisCarrierFilter) return false;
    }

    // C. Region filter
      if (shipAnalysisRegionFilter !== 'all') {
        const destCountry = normalizeCountryCode(o.shipCountry || 'US');
        if (shipAnalysisRegionFilter === 'CA') {
          if (destCountry !== 'CA') return false;
        } else if (shipAnalysisRegionFilter === 'US') {
          if (destCountry !== 'US') return false;
        } else if (shipAnalysisRegionFilter === 'intl') {
          if (destCountry === 'CA' || destCountry === 'US') return false;
        }
      }

    // D. Weight filter
    if (shipAnalysisWeightFilter !== 'all') {
      const book = BOOK_LIST.find(b => b.id === o.bookId);
      const weightKg = getWeightInKg(o.qty || 1, book);
      let band = 'Over 2 kg';
      if (weightKg < 0.5) band = 'Under 0.5 kg';
      else if (weightKg <= 1) band = '0.5 - 1 kg';
      else if (weightKg <= 2) band = '1 - 2 kg';
      if (band !== shipAnalysisWeightFilter) return false;
    }

    return true;
  });

  if (filteredOrders.length === 0) {
    showToast('No orders matching the active filters to export.', 'warn');
    return;
  }

  let csv = 'Lyricalmyrical Book Shipping Reconciliation Report\n';
  csv += 'Generated on: ' + today() + '\n';
  csv += `Active Filters: Book: ${shipAnalysisBookFilter}, Margin: ${shipAnalysisMarginFilter}, Carrier: ${shipAnalysisCarrierFilter}, Region: ${shipAnalysisRegionFilter}, Weight Band: ${shipAnalysisWeightFilter}\n\n`;

  const esc = csvCell;

  csv += 'Order Number,Recipient,Book Title,Qty,Weight (kg),Status,Customer Paid (CAD),Postage Cost (CAD),Margin (CAD),Carrier,Region,Shippo Ref\n';

  filteredOrders.forEach(o => {
    const orderNumber = normalizeShippingOrderNumber(o.num);
    const linked = orderNumber ? shippoExpenses.filter(e =>
      e.shippingMatchStatus === 'matched' && normalizeShippingOrderNumber(e.shippingOrderNumber) === orderNumber
    ) : [];

    const postageCostCAD = o.manualPostagePaid
      ? (Number(o.postagePaid) || 0)
      : linked.reduce((sum, e) => sum + (Number(e.baseAmount) || Number(e.amount) || 0), 0);

    const customerPaidBase = (Number(o.shippingPaid) || 0);
    const margin = customerPaidBase - postageCostCAD;

    const isLinked = linked.length > 0;
    const suggested = orderNumber ? (TAX_CENTER.businessExpenses || []).filter(e =>
      String(e?.ref || '').startsWith('shippo:') &&
      e.shippingMatchStatus !== 'matched' &&
      normalizeShippingOrderNumber(e.shippingOrderNumber) === orderNumber
    ) : [];
    const isSuggested = suggested.length > 0;
    const isUndercharged = isLinked && (margin < 0);

    const statusLabel = o.excludeFromShipping
      ? 'Dismissed'
      : o.manualPostagePaid
        ? 'Manual'
        : (!isLinked && !isSuggested
          ? 'Needs link'
          : isSuggested
            ? 'Suggested'
            : isUndercharged
              ? 'Undercharged'
              : 'Matched');

    const book = BOOK_LIST.find(b => b.id === o.bookId);
    const weightKg = getWeightInKg(o.qty || 1, book);

    const carrier = o.manualPostagePaid
      ? 'Manual Override'
      : (linked.length > 0 ? parseCarrierInfo(linked[0].desc).provider : 'Unlinked');
    
    const destCountry = normalizeCountryCode(o.shipCountry || 'US');
    let region = 'International';
    if (destCountry === 'CA') region = 'Canadian';
    else if (destCountry === 'US') region = 'USA';
    const ref = linked.length > 0 ? linked[0].ref : (o.manualPostagePaid ? 'Manual Override' : 'Unlinked');

    csv += `${esc(o.num)},${esc(o.shipName || o.name || 'Anonymous')},${esc(book?.title || 'Unknown book')},${o.qty || 1},${weightKg.toFixed(3)},${esc(statusLabel)},${customerPaidBase.toFixed(2)},${postageCostCAD.toFixed(2)},${margin.toFixed(2)},${esc(carrier)},${esc(region)},${esc(ref)}\n`;
  });

  downloadCsv(csv, `Lyrical_Shipping_Ledger_${today()}.csv`);
  showToast('✓ Filtered shipping ledger CSV exported');
}

function parseCarrierInfo(desc) {
  if (!desc || !desc.startsWith('Shipping Label:')) {
    if (desc && desc.startsWith('Shippo shipping label')) {
      return { provider: 'Shippo', service: 'Postage' };
    }
    return { provider: 'Unknown', service: 'Unknown' };
  }
  const content = desc.replace('Shipping Label:', '').trim();
  const lastParen = content.lastIndexOf('(');
  const providerService = lastParen !== -1 ? content.slice(0, lastParen).trim() : content;
  const spaceIdx = providerService.indexOf(' ');
  if (spaceIdx === -1) return { provider: providerService, service: 'Standard' };
  const provider = providerService.slice(0, spaceIdx).trim();
  const service = providerService.slice(spaceIdx).trim();
  return { provider, service };
}

function parseTrackingNumber(desc) {
  if (!desc) return '';
  const match = desc.match(/#([A-Za-z0-9\-_]+)/);
  return match ? match[1] : '';
}

function guessCarrier(trackingNumber, trackingUrl, parsedCarrier) {
  if (parsedCarrier && parsedCarrier !== 'Unknown' && parsedCarrier !== 'Shippo') {
    return parsedCarrier;
  }
  const url = String(trackingUrl || '').toLowerCase();
  if (url.includes('canadapost') || url.includes('canada-post')) return 'Canada Post';
  if (url.includes('ups.com')) return 'UPS';
  if (url.includes('fedex.com')) return 'FedEx';
  if (url.includes('usps.com')) return 'USPS';
  if (url.includes('dhl.com')) return 'DHL';
  
  const num = String(trackingNumber || '');
  if (num.startsWith('1Z')) return 'UPS';
  if (/^[0-9]{16}$/.test(num)) return 'Canada Post';
  
  return 'Shippo';
}

function getWeightInLbs(qty, book) {
  if (!book || !book.shipWeight) return 1.2 * qty;
  const w = parseFloat(book.shipWeight) || 0;
  const unit = (book.shipWeightUnit || 'lb').toLowerCase();
  let weightInLbs = w * qty;
  if (unit === 'oz') weightInLbs = weightInLbs / 16;
  else if (unit === 'kg') weightInLbs = weightInLbs * 2.20462;
  else if (unit === 'g') weightInLbs = weightInLbs / 453.592;
  return weightInLbs;
}

function getWeightInKg(qty, book) {
  const lbs = getWeightInLbs(qty, book);
  return lbs * 0.45359237;
}

function updateShippoBaseSpecsFromInputs() {
  shippoBaseSpecs.length = parseFloat($('sp-length').value) || 0;
  shippoBaseSpecs.width = parseFloat($('sp-width').value) || 0;
  shippoBaseSpecs.dim_unit = $('sp-dim-unit').value;
  shippoBaseSpecs.weight_unit = $('sp-weight-unit').value;

  const qty = Math.max(1, parseInt($('sp-qty').value) || 1);
  const currentHeight = parseFloat($('sp-height').value) || 0;
  const currentWeight = parseFloat($('sp-weight').value) || 0;

  shippoBaseSpecs.height = currentHeight / qty;
  shippoBaseSpecs.weight = currentWeight / qty;
}

function onShippoQuantityChange() {
  const qty = Math.max(1, parseInt($('sp-qty').value) || 1);
  const scaledHeight = shippoBaseSpecs.height * qty;
  const scaledWeight = shippoBaseSpecs.weight * qty;

  $('sp-height').value = parseFloat(scaledHeight.toFixed(2));
  $('sp-weight').value = parseFloat(scaledWeight.toFixed(2));
  updateShippoCustomsTotalHint();

  showToast(`✓ Scaled specs for ${qty} ${qty === 1 ? 'copy' : 'copies'}`);
}
export {
  _shippoDestMasterList,
  getShippingReconciliationOrders,
  renderOrderShippingSummary,
  backfillShipping,
  _toggleShippingPanel,
  openLabelModal,
  updateShippedStatusUI,
  toggleShipped,
  printShippingLabel,
  shippingPurchaseRowPayload,
  getShippoTxCost,
  saveShippoLabelLocally,
  fetchShippoTransactionsPageAPI,
  fetchShippoObject,
  fetchShippoContext,
  renderShippingReconciliationWorklist,
  closeShippingReconciliation,
  openShippingReconciliation,
  clearShippingReconciliationList,
  linkShippingExpense,
  processShippoTxToExpense,
  importShippoShippingFromApi,
  getBookPresetSpecs,
  initShippingTab,
  getFallbackShippingPhone,
  renderCustomShippoDestPicker,
  setShippoDestMenuOpenState,
  toggleShippoDestDropdown,
  setShippoDestCategoryFilter,
  filterShippoDestMenu,
  selectShippoDestCustomItem,
  clearShippoDestSelection,
  getRecentShippingOrders,
  saveShippoApiKey,
  editShippoApiKey,
  onShippoPreFillDestChange,
  onShippoBookPresetChange,
  isCanadaPostRate,
  moneyAmount,
  roundShippingCharge,
  buildShippingChargePrediction,
  renderShippingChargePrediction,
  isInternationalShipment,
  resolveShippoIncoterm,
  renderShippoIncotermHint,
  resolveBookPresetSpecs,
  loadShippoIncotermPreference,
  saveShippoIncotermPreference,
  onShippoIncotermChange,
  onShippoDestCountryChange,
  updateShippoCustomsTotalHint,
  readShippoCustomsValue,
  buildShippoCustomsDeclaration,
  collectShippoMessages,
  renderShippoDiagnostics,
  buyShippoLabel,
  calculateShippoRates,
  editPostageCost,
  unlinkManualPostage,
  dismissShippingAnalysisOrder,
  restoreShippingAnalysisOrder,
  toggleAllShipAnalysisOrders,
  updateShipAnalysisBatchActionUI,
  batchDismissShippingAnalysisOrders,
  toggleShipAnalysisCarrierFilter,
  toggleShipAnalysisRegionFilter,
  toggleShipAnalysisWeightFilter,
  clearAllShipAnalysisFilters,
  changeShipAnalysisPage,
  onShipAnalysisBookFilterChange,
  setShipAnalysisMarginFilter,
  onShipAnalysisSearch,
  onInlinePostageChange,
  confirmSuggestedShippoLink,
  openManualShippoLinkModal,
  filterManualShippoLinkRows,
  doManualShippoLink,
  closeManualShippoLinkModal,
  unlinkShippoExpense,
  getShipRecoMode,
  setShipRecoMode,
  getShipRecoPercentile,
  setShipRecoPercentile,
  getShipWeightOverride,
  setShipWeightOverride,
  onShipInsightsToggle,
  onShipRecoModeChange,
  onShipRecoPercentileChange,
  onShipRecoWeightSelectChange,
  onShipRecoCustomWeightChange,
  getPercentile,
  getMean,
  getFallbackRates,
  getSmartShippingRecommendations,
  updateManualShippingRates,
  applySmartShippingRates,
  buildShippingPnLHtml,
  buildShippingCarrierScorecardHtml,
  buildShippingRegionSplitHtml,
  buildShippingWeightBandHtml,
  buildShippingLedgerHtml,
  buildShippingInsightsHtml,
  renderShippingAnalysisHub,
  updateShippingSimulation,
  downloadFilteredShippingLedgerCSV,
  parseCarrierInfo,
  parseTrackingNumber,
  guessCarrier,
  getWeightInLbs,
  getWeightInKg,
  updateShippoBaseSpecsFromInputs,
  onShippoQuantityChange,
  verifyDestinationAddress,
  applyVerifiedAddressCorrections,
  dismissAddressVerification,
  readShippoDestinationAddress,
  renderDestinationVerification,
  verifyLedgerOrderAddress,
  batchVerifyLedgerAddresses,
  applyLedgerAddressCorrections,
  renderLedgerVerifyCell,
};
