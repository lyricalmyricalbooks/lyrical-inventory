// Tracking numbers typed into Big Cartel ("Mark as shipped").
//
// A label bought on canadapost.ca reaches the app through the Canada Post
// sweep, but the sweep can only match it to an order by name and postal code.
// The owner types the tracking number into Big Cartel every time, which makes
// it an exact key: the same number on a Big Cartel order and on a Canada Post
// shipment is the same parcel. This reads those numbers. Pure.

import { bigCartelOrderNumber } from './bigcartel-ledger-gap.js';
import { normalizeTrackingNumber } from './postage-matching.js';

const text = value => String(value ?? '').trim();
const asList = value => (Array.isArray(value) ? value : value ? [value] : []);

/** One shipment's fields, whichever spelling Big Cartel used. */
function readShipment(raw) {
  const attr = raw?.attributes || raw || {};
  const tracking = normalizeTrackingNumber(attr.tracking_number ?? attr.trackingNumber ?? attr.tracking_code);
  if (!tracking) return null;
  return {
    tracking,
    carrier: text(attr.carrier ?? attr.carrier_name),
    trackingUrl: text(attr.tracking_url ?? attr.trackingUrl),
    shippedAt: text(attr.created_at ?? attr.shipped_at ?? attr.updated_at),
  };
}

/**
 * The shipments on one order: inline on the order, or referenced from
 * `relationships.shipments` and resolved against the JSON:API `included` list.
 */
export function bigCartelOrderShipments(order = {}, included = []) {
  const attr = order.attributes || {};
  const inline = [...asList(attr.shipments), ...asList(order.shipments)];
  const refs = asList(order.relationships?.shipments?.data);
  const byKey = new Map(asList(included)
    .filter(item => item && /^shipments?$/i.test(text(item.type)))
    .map(item => [text(item.id), item]));
  const resolved = refs.map(ref => byKey.get(text(ref?.id))).filter(Boolean);
  const seen = new Set();
  return [...inline, ...resolved]
    .map(readShipment)
    .filter(ship => ship && !seen.has(ship.tracking) && seen.add(ship.tracking));
}

/**
 * Order number → the latest shipment Big Cartel knows about. Orders with no
 * tracking number are left out.
 */
export function bigCartelTrackingByOrder(orders = [], included = []) {
  const out = new Map();
  asList(orders).forEach(order => {
    const num = bigCartelOrderNumber(order);
    if (!num) return;
    const ships = bigCartelOrderShipments(order, included);
    if (!ships.length) return;
    const latest = ships.reduce((a, b) => (Date.parse(b.shippedAt) || 0) > (Date.parse(a.shippedAt) || 0) ? b : a);
    out.set(num, latest);
  });
  return out;
}

/**
 * The ledger changes to make: only for orders with no tracking number yet, and
 * never on a voided row. Returns `{ bookId, entry, shipment }` for each one;
 * the caller writes and saves. A number already on the order came from
 * somewhere this can't see, so it is kept.
 */
export function trackingToStamp(rows = [], byOrder = new Map(), normalize = v => text(v)) {
  const out = [];
  asList(rows).forEach(({ bookId, entry } = {}) => {
    if (!entry || entry.voided || text(entry.trackingNumber)) return;
    const shipment = byOrder.get(normalize(entry.num));
    if (shipment) out.push({ bookId, entry, shipment });
  });
  return out;
}

/** The date a shipment went out, as `YYYY-MM-DD`, or '' when unknown. */
export function shipmentDate(shipment) {
  const at = Date.parse(shipment?.shippedAt || '');
  return Number.isFinite(at) ? new Date(at).toISOString().slice(0, 10) : '';
}
