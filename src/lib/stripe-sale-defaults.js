// Defaults shared by the worklist, grouped recording, and the Stripe sweep.
// Generated references use the full charge ID: stable across devices and undo.
import { DATED_RATE_SOURCES } from './fx-sources.js';

export function stripeOrderNumber(payment = {}) {
  const meta = payment.metadata || {};
  const existing = [payment.orderNumber, meta.order_number, meta.order_num, meta.orderNumber, meta.invoice_num]
    .map(value => String(value ?? '').trim()).find(Boolean);
  if (existing) return existing.slice(0, 80);
  const match = /Big Cartel order\s*#?\s*([A-Za-z0-9-]+)/i.exec(payment.description || '');
  if (match) return '#' + match[1];
  const receipt = String(payment.receiptNumber || '').trim();
  if (receipt) return receipt.slice(0, 80);
  return payment.id ? 'STRIPE-' + String(payment.id).replace(/^ch_/, '') : '';
}

const validRate = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '')
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

const DATED_SOURCES = new Set(DATED_RATE_SOURCES.map(source => source.name));

// Cache only dated reference rates, never latest rates or failed requests.
// A saved rate remains available offline without depending on the current book.
// `retry` passes through to the lookup: a person pressing Retry wants a fresh
// try now, not the pause that follows a failure.
export function createStripeRateResolver({ fetchRate, storage } = {}) {
  const memory = new Map();
  const pending = new Map();
  return async function resolve(payment, bookCurrency, { retry = false } = {}) {
    const from = String(payment?.currency || '').toUpperCase();
    const to = String(bookCurrency || '').toUpperCase();
    if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) return { error: 'bad-currency' };
    if (from === to) return { rate: 1, source: 'same-currency' };
    const requestedDate = payment?.date;
    if (!validDate(requestedDate)) return { error: 'bad-date' };
    const key = `lm-stripe-fx-v1:${from}:${to}:${requestedDate}`;
    if (memory.has(key)) return memory.get(key);
    try {
      const saved = JSON.parse(storage?.getItem(key) || 'null');
      if (validRate(saved?.rate) && saved.from === from && saved.to === to
        && saved.requestedDate === requestedDate && (!saved.date || validDate(saved.date))
        && DATED_SOURCES.has(saved.source)) {
        memory.set(key, saved);
        return saved;
      }
    } catch (_) { /* blocked storage or malformed cache: fetch normally */ }
    if (pending.has(key)) return pending.get(key);
    const request = (async () => {
      try {
        const result = await fetchRate(from, to, requestedDate, { retry });
        if (!validRate(result?.rate)) return { error: 'rate-unavailable' };
        const value = { rate: result.rate, date: validDate(result.date) ? result.date : '',
          requestedDate, from, to, source: DATED_SOURCES.has(result.source) ? result.source : 'Frankfurter' };
        memory.set(key, value);
        try { storage?.setItem(key, JSON.stringify(value)); } catch (_) { /* keep session cache */ }
        return value;
      } catch (_) { return { error: 'rate-unavailable' }; }
    })();
    pending.set(key, request);
    try { return await request; } finally { pending.delete(key); }
  };
}
