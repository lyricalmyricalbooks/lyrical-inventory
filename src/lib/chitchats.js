import { resolveListShipmentsEndpoint, resolveShipmentEndpoint, isChitChatsEndpoint } from './chitchats-endpoints.js';
import { getSavedSheetsUrl } from './sheets-url.js';
import { roundCents } from './money.js';
import { buildPostageExpense } from './postage-intake.js';
import { getCachedLabelPdf, storeCachedLabelPdf } from './label-cache.js';

const paidStatuses = new Set(['ready', 'in_transit', 'received', 'released', 'inducted', 'resolved', 'delivered', 'exception', 'voided', 'canceled']);
const unpack = data => data?.shipment || data;
const money = value => value == null || value === '' || !Number.isFinite(Number(value)) || Number(value) < 0 ? null : roundCents(Number(value));

export async function executeChitChatsProxy({ endpoint, method = 'GET', payload = null, token = '', artifact = false }) {
  if (!isChitChatsEndpoint(endpoint, artifact)) throw new Error('Invalid Chit Chats endpoint.');
  if (!token) throw new Error('Save your Chit Chats API token first.');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('Connect to the internet to contact Chit Chats. No purchase was sent.');
  const sheetsUrl = getSavedSheetsUrl();
  if (!sheetsUrl) throw new Error('Connect your Google Sheet and deploy Apps Script v51 or later to use Chit Chats.');
  const response = await fetch(sheetsUrl, {
    method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ version: 2, action: 'proxychitchats', payload: { endpoint, method, apiKey: token, jsonPayload: payload, isArtifact: artifact } }),
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) throw new Error(`Shipping connection failed (${response.status}).`);
  const result = await response.json();
  if (result.error) throw new Error(String(result.error));
  if (!result.ok) {
    const error = new Error(result.status === 429 ? `Chit Chats is busy. Wait ${result.retryAfter || 'a few'} seconds before checking again.`
      : `Chit Chats (${result.status || 'proxy unavailable'}): ${result.data?.error?.message || result.text || 'Update your Apps Script deployment and check your account settings.'}`);
    error.status = result.status; throw error;
  }
  return artifact ? result : result.data;
}
export async function verifyChitChatsConnection({ clientId, token, isTest = false }) {
  try {
    await executeChitChatsProxy({ endpoint: `${resolveListShipmentsEndpoint(clientId, isTest)}?limit=1`, token });
    return { ok: true, error: '' };
  } catch (error) { return { ok: false, error: error.message }; }
}
export function buildChitChatsShipment(input) {
  const payload = { ...input, postage_type: 'unknown' };
  delete payload.cheapest_postage_type_requested;
  for (const field of ['name', 'address_1', 'city', 'country_code', 'description', 'value_currency', 'package_type']) {
    if (!String(payload[field] || '').trim()) throw new Error(`Fill in ${field.replaceAll('_', ' ')} before requesting rates.`);
  }
  payload.country_code = String(payload.country_code).toUpperCase();
  payload.value_currency = String(payload.value_currency).toLowerCase();
  if (!/^[A-Z]{2}$/.test(payload.country_code) || !['cad', 'usd'].includes(payload.value_currency)) throw new Error('Check the destination country and declared currency.');
  for (const field of ['weight', 'size_x', 'size_y', 'size_z', 'value']) {
    if (!Number.isFinite(Number(payload[field])) || Number(payload[field]) <= 0) throw new Error(`Enter a valid ${field.replaceAll('_', ' ')}.`);
  }
  if (!['g', 'kg', 'oz', 'lb'].includes(payload.weight_unit) || !['cm', 'in'].includes(payload.size_unit)) throw new Error('Check the package measurement units.');
  if (payload.country_code !== 'CA' && !payload.line_items?.length) throw new Error('Complete the customs line items for international shipping.');
  return payload;
}
export async function getChitChatsRates({ clientId, token, isTest = false, payload, shipmentId = '', request = executeChitChatsProxy }) {
  const data = await request({ endpoint: resolveShipmentEndpoint(clientId, shipmentId, isTest), token,
    method: shipmentId ? 'GET' : 'POST', payload: shipmentId ? null : buildChitChatsShipment(payload) });
  const shipment = unpack(data);
  if (!shipment?.id) throw new Error('Chit Chats did not return a shipment ID. Check your account before creating another draft.');
  const rates = (shipment.rates || []).map(rate => ({
    postageType: rate.postage_type, serviceName: rate.postage_description || rate.postage_type,
    totalPrice: money(rate.payment_amount), taxes: roundCents((money(rate.federal_tax) || 0) + (money(rate.provincial_tax) || 0)),
    delivery: rate.delivery_time_description || '', tracking: rate.tracking_type_description || '',
  })).filter(rate => rate.postageType && rate.totalPrice !== null).sort((a, b) => a.totalPrice - b.totalPrice);
  return { shipment, rates };
}
export async function getChitChatsShipment({ clientId, token, isTest = false, shipmentId, request = executeChitChatsProxy }) {
  return unpack(await request({ endpoint: resolveShipmentEndpoint(clientId, shipmentId, isTest), token, method: 'GET' }));
}
// Lost responses never replay a charge: intent is persisted before PATCH,
// recovery uses GET only, including after a reload or timeout.
export async function buyChitChatsLabel({ clientId, token, isTest = false, shipmentId, postageType, resume = false,
  onIntent, request = executeChitChatsProxy, attempts = 8, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  if (!resume) {
    if (!postageType || !onIntent) throw new Error('A saved purchase intent and selected service are required.');
    await onIntent();
    await request({ endpoint: resolveShipmentEndpoint(clientId, shipmentId, isTest, 'buy'), method: 'PATCH', token, payload: { postage_type: postageType } });
  }
  for (let index = 0; index < attempts; index++) {
    const shipment = await getChitChatsShipment({ clientId, token, isTest, shipmentId, request });
    if (!shipment || shipment.id !== shipmentId) throw new Error('Chit Chats returned a different shipment. Check the account before continuing.');
    if (shipment.status === 'postage_purchase_failed') {
      const error = new Error('Chit Chats could not buy this label. Check your balance and shipment in Chit Chats.');
      error.purchaseFailed = true; throw error;
    }
    if (paidStatuses.has(shipment.status)) return shipment;
    if (index < attempts - 1) await wait(1500);
  }
  const error = new Error('The purchase is still being checked. Use Check purchase; do not buy a second label.');
  error.pending = true; throw error;
}
export async function listChitChatsShipments({ clientId, token, isTest = false, request = executeChitChatsProxy, limit = 100 }) {
  const shipments = [];
  for (let page = 1; page <= 1000; page++) {
    const data = await request({ endpoint: `${resolveListShipmentsEndpoint(clientId, isTest)}?limit=${limit}&page=${page}`, token, method: 'GET' });
    if (!Array.isArray(data)) throw new Error('Chit Chats returned an unexpected shipment list. Nothing was imported.');
    shipments.push(...data);
    if (data.length < limit) return shipments;
  }
  throw new Error('Too many shipments to import at once. Nothing was imported.');
}
export function normalizeChitChatsShipment(shipment, { isTest = false, clientId = '' } = {}) {
  if (!shipment?.id || !paidStatuses.has(shipment.status)) return null;
  const amount = money(shipment.purchase_amount);
  const expense = buildPostageExpense({
    amount: amount && amount > 0 ? amount : null, currency: 'CAD', date: (shipment.created_at || shipment.ship_date || '').slice(0, 10),
    trackingNumber: shipment.carrier_tracking_code || '', carrier: 'Chit Chats', recipientName: shipment.to_name,
    recipientPostal: shipment.to_postal_code, source: 'chitchats', description: `Chit Chats ${shipment.postage_type || 'postage'} · ${shipment.id}`,
  }, { id: `exp_cc_${isTest ? 'test_' : ''}${clientId}_${shipment.id}` });
  return { ...expense, ref: `chitchats:${isTest ? 'test:' : ''}${clientId}:${shipment.id}`, ccShipmentId: shipment.id, ccClientId: clientId,
    ccTestMode: isTest, ccStatus: shipment.status, ccOrderNumber: shipment.order_id || '', trackingUrl: safeTrackingUrl(shipment.tracking_url),
    ...(shipment.status === 'voided' ? { refundRequest: { id: shipment.id, status: 'REQUESTED', at: shipment.created_at || '' } } : {}),
    amountConfirmed: amount !== null && amount > 0, simulated: isTest, receiptRequired: false, ocrSkip: true, autoLogged: true };
}
export function safeTrackingUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && ['chitchats.com', 'staging.chitchats.com'].includes(url.hostname) && /^\/tracking\//.test(url.pathname) ? url.href : ''; } catch (_) { return ''; }
}
export async function refundChitChatsShipment({ clientId, token, isTest = false, shipmentId, request = executeChitChatsProxy }) {
  return request({ endpoint: resolveShipmentEndpoint(clientId, shipmentId, isTest, 'refund'), token, method: 'PATCH' });
}
export async function fetchChitChatsLabelArtifact({ clientId, token, isTest = false, shipmentId, request = executeChitChatsProxy }) {
  const cacheKey = `chitchats:${isTest ? 'test:' : ''}${clientId}:${shipmentId}`;
  const cached = await getCachedLabelPdf(cacheKey);
  if (cached?.blob) return cached.blob;
  const shipment = await getChitChatsShipment({ clientId, token, isTest, shipmentId, request });
  const endpoint = shipment.postage_label_pdf_url;
  if (!isChitChatsEndpoint(endpoint, true)) throw new Error('The official PDF label is not ready. Check the shipment again shortly.');
  const result = await request({ endpoint, token, artifact: true, method: 'GET' });
  if (!result.base64) throw new Error('Chit Chats returned no PDF.');
  const bytes = Uint8Array.from(atob(result.base64), char => char.charCodeAt(0));
  if (String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-') throw new Error('Chit Chats did not return a valid PDF label.');
  const blob = new Blob([bytes], { type: 'application/pdf' });
  await storeCachedLabelPdf(cacheKey, blob, { carrier: 'chitchats' });
  return blob;
}
