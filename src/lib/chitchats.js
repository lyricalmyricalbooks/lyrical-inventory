import { resolveListShipmentsEndpoint, resolveShipmentEndpoint, isChitChatsEndpoint } from './chitchats-endpoints.js';
import { getSavedSheetsUrl } from './sheets-url.js';
import { roundCents } from './money.js';
import { buildPostageExpense } from './postage-intake.js';
import { getCachedLabelPdf, storeCachedLabelPdf } from './label-cache.js';

const paidStatuses = new Set(['ready', 'in_transit', 'received', 'released', 'inducted', 'resolved', 'delivered', 'exception', 'voided', 'canceled']);
// The documented state of a shipment whose postage was never bought.
const DRAFT_STATUS = 'pending';
const unpack = data => data?.shipment || data;
// A 4xx other than a timeout or rate limit is a definite refusal: nothing ran.
const isRefusal = error => error?.status >= 400 && error.status < 500 && ![408, 429].includes(error.status);
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
      : [401, 403].includes(result.status) ? 'Chit Chats did not accept this client ID and API token. Check them in Tax Centre → Integrations, and that the staging switch matches the account.'
      : `Chit Chats (${result.status || 'proxy unavailable'}): ${chitChatsErrorMessage(result.data, result.text || 'Update your Apps Script deployment and check your account settings.')}`);
    error.status = result.status; throw error;
  }
  return artifact ? result : result.data;
}
// Chit Chats answers with Rails-style bodies: { error }, { errors: { field: [...] } } or { message }.
export function chitChatsErrorMessage(data, fallback = '') {
  const pick = value => {
    if (value == null || value === '') return '';
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (Array.isArray(value)) return value.map(pick).filter(Boolean).join(' ');
    if (typeof value === 'object') return value.message ? pick(value.message)
      : Object.entries(value).map(([key, item]) => `${key.replaceAll('_', ' ')} ${pick(item)}`.trim()).join('; ');
    return '';
  };
  return (pick(data?.error) || pick(data?.errors) || pick(data?.message) || fallback).slice(0, 300);
}
export async function verifyChitChatsConnection({ clientId, token, isTest = false, request = executeChitChatsProxy }) {
  try {
    await request({ endpoint: `${resolveListShipmentsEndpoint(clientId, isTest)}?limit=1`, token });
    return { ok: true, error: '' };
  } catch (error) {
    return { ok: false, error: error.status === 404 ? `No ${isTest ? 'staging' : 'live'} Chit Chats account uses this client ID. Copy the number from your Chit Chats address bar after /clients/.` : error.message };
  }
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
  const body = buildChitChatsShipment(payload);
  let shipment = null;
  if (shipmentId) {
    // Reuse the unchanged draft, unless it was deleted or bought on the website.
    try { shipment = unpack(await request({ endpoint: resolveShipmentEndpoint(clientId, shipmentId, isTest), token, method: 'GET' })); }
    catch (error) { if (error.status !== 404) throw error; }
    if (shipment && shipment.id !== shipmentId) shipment = null;
    if (shipment && (paidStatuses.has(shipment.status) || shipment.status === 'postage_requested')) {
      const error = new Error('Chit Chats already has a label for this parcel. Choose Refresh shipments to bring it in. Do not buy another.');
      error.alreadyBought = true; throw error;
    }
    if (shipment) shipment = await refreshChitChatsRates({ clientId, token, isTest, shipment, shipDate: body.ship_date, request });
  }
  if (!shipment) {
    shipment = unpack(await request({ endpoint: resolveShipmentEndpoint(clientId, '', isTest), token, method: 'POST', payload: body }));
    if (!shipment?.id) throw new Error('Chit Chats did not return a shipment ID. Check your account before creating another draft.');
    // Rates can lag the new draft by a moment; one refresh asks for them again.
    if (!shipment.rates?.length) shipment = await refreshChitChatsRates({ clientId, token, isTest, shipment, shipDate: body.ship_date, request });
  }
  const rates = (shipment.rates || []).map(rate => ({
    postageType: rate.postage_type, serviceName: rate.postage_description || rate.postage_type,
    totalPrice: money(rate.payment_amount), taxes: roundCents((money(rate.federal_tax) || 0) + (money(rate.provincial_tax) || 0)),
    delivery: rate.delivery_time_description || '', tracking: rate.tracking_type_description || '',
  })).filter(rate => rate.postageType && rate.totalPrice !== null).sort((a, b) => a.totalPrice - b.totalPrice);
  return { shipment, rates };
}
// PATCH /refresh re-prices an unpaid draft. A refusal keeps the rates already in hand.
async function refreshChitChatsRates({ clientId, token, isTest, shipment, shipDate, request }) {
  try {
    const fresh = unpack(await request({ endpoint: resolveShipmentEndpoint(clientId, shipment.id, isTest, 'refresh'), token, method: 'PATCH',
      payload: shipDate ? { ship_date: shipDate } : null }));
    return fresh?.id === shipment.id ? fresh : shipment;
  } catch (error) {
    if (!isRefusal(error)) throw error;
    return shipment;
  }
}
// Removes an unpaid draft the owner replaced. Chit Chats refuses to delete
// anything with postage, so this can never void a bought label.
export async function deleteChitChatsDraft({ clientId, token, isTest = false, shipmentId, request = executeChitChatsProxy }) {
  return request({ endpoint: resolveShipmentEndpoint(clientId, shipmentId, isTest), token, method: 'DELETE' });
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
    try {
      await request({ endpoint: resolveShipmentEndpoint(clientId, shipmentId, isTest, 'buy'), method: 'PATCH', token, payload: { postage_type: postageType } });
    } catch (error) {
      // A refusal (low balance, bad address) charged nothing; anything else may have.
      if (isRefusal(error)) { error.message = `${error.message} No label was bought.`; error.purchaseFailed = true; }
      throw error;
    }
  }
  let status = '';
  for (let index = 0; index < attempts; index++) {
    const shipment = await getChitChatsShipment({ clientId, token, isTest, shipmentId, request });
    if (!shipment || shipment.id !== shipmentId) throw new Error('Chit Chats returned a different shipment. Check the account before continuing.');
    status = shipment.status;
    if (status === 'postage_purchase_failed') {
      const error = new Error('Chit Chats could not buy this label. Check your balance and shipment in Chit Chats.');
      error.purchaseFailed = true; throw error;
    }
    if (paidStatuses.has(status)) return shipment;
    if (index < attempts - 1) await wait(1500);
  }
  // Still an unpaid draft after every check: the buy never reached Chit Chats.
  if (status === DRAFT_STATUS) {
    const error = new Error('Chit Chats shows this label as not bought, so nothing was charged. Choose Buy label again when ready.');
    error.purchaseFailed = true; throw error;
  }
  const error = new Error('The purchase is still being checked. Use Check purchase; do not buy a second label.');
  error.pending = true; throw error;
}
// Each page is one Apps Script round trip, so ask for big pages (the API
// allows up to 1000). `fromDate` (YYYY-MM-DD) limits the list to shipments
// created on or after that day.
export async function listChitChatsShipments({ clientId, token, isTest = false, request = executeChitChatsProxy, limit = 500, fromDate = '' }) {
  const shipments = [];
  const since = /^\d{4}-\d{2}-\d{2}$/.test(fromDate) ? `&from_date=${fromDate}` : '';
  for (let page = 1; page <= 1000; page++) {
    const data = await request({ endpoint: `${resolveListShipmentsEndpoint(clientId, isTest)}?limit=${limit}&page=${page}${since}`, token, method: 'GET' });
    if (!Array.isArray(data)) throw new Error('Chit Chats returned an unexpected shipment list. Nothing was imported.');
    shipments.push(...data);
    if (data.length < limit) return shipments;
  }
  throw new Error('Too many shipments to import at once. Nothing was imported.');
}
// What the label really cost. A shipment's purchase_amount is only the
// postage: Chit Chats also charges insurance, its delivery fee and GST/HST/PST,
// which the quoted payment_amount already includes. Prefer payment_amount,
// then postage plus every fee and tax, then the bare purchase_amount.
export function chitChatsCharge(shipment) {
  const paid = money(shipment?.payment_amount);
  if (paid) return paid;
  const postage = money(shipment?.postage_fee);
  if (postage) {
    return roundCents(['postage_fee', 'insurance_fee', 'delivery_fee', 'federal_tax', 'provincial_tax']
      .reduce((sum, field) => sum + (money(shipment[field]) || 0), 0));
  }
  return money(shipment?.purchase_amount) || null;
}
// `quoted` is the price the owner confirmed when buying: a stand-in, flagged
// as unconfirmed, for a shipment that comes back with no amounts at all.
export function normalizeChitChatsShipment(shipment, { isTest = false, clientId = '', quoted = null } = {}) {
  if (!shipment?.id || !paidStatuses.has(shipment.status)) return null;
  const charged = chitChatsCharge(shipment);
  const fallback = charged ? null : money(quoted);
  const amount = charged || fallback;
  const expense = buildPostageExpense({
    amount: amount && amount > 0 ? amount : null, currency: 'CAD', date: (shipment.created_at || shipment.ship_date || '').slice(0, 10),
    trackingNumber: shipment.carrier_tracking_code || '', carrier: 'Chit Chats', recipientName: shipment.to_name,
    recipientPostal: shipment.to_postal_code, source: 'chitchats', description: `Chit Chats ${shipment.postage_type || 'postage'} · ${shipment.id}`,
  }, { id: `exp_cc_${isTest ? 'test_' : ''}${clientId}_${shipment.id}` });
  return { ...expense, ref: `chitchats:${isTest ? 'test:' : ''}${clientId}:${shipment.id}`, ccShipmentId: shipment.id, ccClientId: clientId,
    ccTestMode: isTest, ccStatus: shipment.status, ccOrderNumber: shipment.order_id || '', trackingUrl: safeTrackingUrl(shipment.tracking_url),
    ...(shipment.status === 'voided' ? { refundRequest: { id: shipment.id, status: 'REQUESTED', at: shipment.created_at || '' } } : {}),
    amountConfirmed: !!charged, simulated: isTest, receiptRequired: false, ocrSkip: true, autoLogged: true };
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
