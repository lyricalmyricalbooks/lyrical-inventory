// Two things worth hearing about a website order after it is recorded.
//
// 1. It was paid for and nothing has been sent. Orders now reach the ledger on
//    their own, which means one that arrives in a busy week can be recorded,
//    counted and then forgotten — until the customer writes to ask.
// 2. Its postage cost more than the customer paid for shipping. A few dollars
//    lost per parcel is invisible order by order and obvious over a month,
//    and the fix — adjusting the store's shipping rates — is easy once seen.
//
// Pure: the caller passes ledger rows and the postage already matched to them.

import { LOSS_MARGIN, money } from './shipping-price-check.js';

const DAY = 86400000;

function dayMs(value) {
  const parsed = Date.parse(String(value || '').slice(0, 10));
  return Number.isFinite(parsed) ? parsed : NaN;
}

/** Whether this order is meant to go in the post at all. */
function hasAddress(entry) {
  return !!String(entry.shipAddr1 || entry.shipPostal || entry.shipCity || '').trim();
}

/**
 * Paid website orders that have waited `afterDays` or more without being sent.
 *
 * An order counts as sent when it is marked shipped, carries a tracking
 * number, or has a postage label matched to it. Orders with no address
 * (picked up, handed over) are never nagged about, and ones older than
 * `withinDays` are history rather than a to-do.
 */
export function unshippedOrders(rows = [], { now = Date.now(), afterDays = 3, withinDays = 60, labelled = new Set() } = {}) {
  const out = [];
  (Array.isArray(rows) ? rows : []).forEach(({ bookId, entry, bookTitle }) => {
    if (!entry || entry.voided || entry.chan !== 'Website') return;
    if (entry.shipped || entry.trackingNumber || entry.trackingPin) return;
    if (!hasAddress(entry)) return;
    if (entry.num && labelled.has(entry.num)) return;
    const placed = dayMs(entry.date);
    if (!Number.isFinite(placed)) return;
    const waiting = Math.floor((now - placed) / DAY);
    if (waiting < afterDays || waiting > withinDays) return;
    out.push({
      bookId,
      num: entry.num || '',
      customer: String(entry.shipName || '').trim() || 'A customer',
      bookTitle: bookTitle || '',
      qty: Number(entry.qty) || 1,
      days: waiting,
    });
  });
  return out.sort((a, b) => b.days - a.days);
}

export function describeUnshipped(list = []) {
  if (!list.length) return { count: 0, title: '', detail: '' };
  const shown = list.slice(0, 3).map(o => `${o.customer} (${o.num || o.bookTitle}, ${o.days} days)`);
  const more = list.length - shown.length;
  return {
    count: list.length,
    title: list.length === 1 ? 'An order is waiting to be sent' : `${list.length} orders are waiting to be sent`,
    detail: `Paid but not yet shipped: ${shown.join(', ')}${more > 0 ? `, and ${more} more` : ''}. If one already went out by hand, open it and mark it as shipped so this stops asking.`,
  };
}

/** 'YYYY-MM' for the month before the one `today` is in. */
export function previousMonth(today = '') {
  const [y, m] = String(today).slice(0, 7).split('-').map(Number);
  if (!y || !m) return '';
  const year = m === 1 ? y - 1 : y;
  const month = m === 1 ? 12 : m - 1;
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** Where a parcel went, in the terms shipping rates are set by. */
export function destinationLabel(entry = {}) {
  const country = String(entry.shipCountry || '').trim();
  if (!country || /^(ca|canada)$/i.test(country)) return 'Canada';
  if (/^(us|usa|united states( of america)?)$/i.test(country)) return 'United States';
  return country;
}

/**
 * One month of shipping, money in against money out.
 *
 * `items` are orders with both figures known, in the same currency:
 * `{ date, num, destination, paid, postage }`. An order "lost money" when its
 * postage cost more than 50 cents over what the customer paid for shipping.
 */
export function postageReport(items = [], month = '') {
  const inMonth = (Array.isArray(items) ? items : [])
    .filter(item => item && String(item.date || '').slice(0, 7) === month);
  const groups = new Map();
  let paid = 0;
  let postage = 0;
  let losing = 0;
  inMonth.forEach(item => {
    const gap = (Number(item.postage) || 0) - (Number(item.paid) || 0);
    paid += Number(item.paid) || 0;
    postage += Number(item.postage) || 0;
    const g = groups.get(item.destination) || { destination: item.destination, orders: 0, losing: 0, loss: 0 };
    g.orders++;
    if (gap > LOSS_MARGIN) { g.losing++; g.loss += gap; losing++; }
    groups.set(item.destination, g);
  });
  const losers = [...groups.values()].filter(g => g.losing).sort((a, b) => b.loss - a.loss);
  return { month, orders: inMonth.length, losing, paid, postage, net: paid - postage, groups: losers };
}

function monthName(month) {
  const d = new Date(`${month}-15T12:00:00`);
  return Number.isNaN(d.getTime()) ? 'last month' : d.toLocaleDateString('en-CA', { month: 'long' });
}

/** The monthly card. Says nothing when shipping paid for itself. */
export function describePostageReport(report) {
  if (!report || !report.losing) return { count: 0, title: '', detail: '' };
  const where = report.groups.slice(0, 3)
    .map(g => `${g.destination}: ${g.losing} of ${g.orders} order${g.orders === 1 ? '' : 's'}, ${money(g.loss)} short`)
    .join('; ');
  const overall = report.net < 0
    ? `Overall, postage cost ${money(report.net)} more than customers paid for shipping.`
    : `Overall shipping still came out ${money(report.net)} ahead, but these parcels didn’t.`;
  return {
    count: report.losing,
    title: `Shipping lost money on ${report.losing} order${report.losing === 1 ? '' : 's'} in ${monthName(report.month)}`,
    detail: `${where}. ${overall} Raising your store’s shipping rate for ${report.groups[0].destination} would cover most of it.`,
  };
}
