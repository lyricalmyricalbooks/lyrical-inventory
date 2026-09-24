// Fair Mode: the phone register used at a stall. Pure helpers plus the
// screen wake lock; the sale itself still goes through posConfirmSale().

import { escapeHtml as esc } from './html.js';

/** Payment choices on the charge sheet, in thumb order. `value` is what the
 *  sale records, and must match the register's payment <select>. */
export const FAIR_METHODS = [
  { value: 'Card', label: 'Card reader', icon: '💳' },
  { value: 'Stripe QR', label: 'QR / Stripe', icon: '▦' },
  { value: 'Bank Transfer', label: 'E-transfer', icon: '⇄', other: true },
  { value: 'Cash', label: 'Cash', icon: '＄', other: true },
  { value: 'Comp/Gift', label: 'Comp', icon: '♡', other: true },
];

/** How long the "Sold — Undo" bar stays up. Long enough to catch a wrong tap
 *  while the customer is still at the table, short enough not to linger. */
export const FAIR_UNDO_MS = 8000;

/** Above this many titles the phone keeps the search box. */
export const FAIR_SEARCH_OVER = 15;

const METHOD_KEY = 'lm-fair-last-method';

export function readLastMethod(storage = globalThis.localStorage) {
  try {
    const v = storage?.getItem(METHOD_KEY);
    return FAIR_METHODS.some(m => m.value === v) ? v : 'Card';
  } catch { return 'Card'; }
}

export function rememberMethod(value, storage = globalThis.localStorage) {
  if (!FAIR_METHODS.some(m => m.value === value)) return;
  try { storage?.setItem(METHOD_KEY, value); } catch { /* private mode: fine */ }
}

/** Is an undo for a sale recorded at `at` still allowed at `now`? */
export function undoOpen(at, now = Date.now(), windowMs = FAIR_UNDO_MS) {
  return Number.isFinite(at) && now >= at && now - at <= windowMs;
}

/** "Sold 2 books · €40.00" */
export function soldLabel(count, totalText) {
  const n = Math.max(0, Math.floor(count) || 0);
  return `Sold ${n} ${n === 1 ? 'book' : 'books'}${totalText ? ` · ${totalText}` : ''}`;
}

/** "1 book" / "3 books", for the charge bar. */
export function countLabel(count) {
  const n = Math.max(0, Math.floor(count) || 0);
  return `${n} ${n === 1 ? 'book' : 'books'}`;
}

/**
 * One tile. The whole tile adds a copy; the − chip (only once something is in
 * the cart) takes one back. `stock` is a posStockView() result.
 */
export function fairTileHtml({ id, title, priceText, qty = 0, stock = null }) {
  const idJs = esc(JSON.stringify(String(id)));
  const left = stock && stock.tracked ? Math.max(0, stock.remaining) : null;
  const out = left === 0 && qty === 0 && stock?.onHand === 0;
  // Records say every copy is already sold or in this sale: ask before adding.
  const noneLeft = left !== null && left <= 0;
  const stockText = left === null ? '' : out ? 'Sold out' : left === 1 ? 'Last copy' : `${left} left`;
  const cls = ['fm-tile', qty > 0 ? 'is-in-cart' : '', out ? 'is-out' : '', stock?.level === 'short' ? 'is-short' : ''].filter(Boolean).join(' ');
  return `<div class="${cls}" role="listitem">
  <button type="button" class="fm-tile-add" onclick="${noneLeft ? `fairTileNoneLeft(${idJs})` : `posUpdateQty(${idJs}, 1)`}" aria-label="${noneLeft ? 'None left' : 'Add one'}: ${esc(title)}, ${esc(priceText)}${qty ? `, ${qty} in sale` : ''}">
    <span class="fm-tile-title">${esc(title)}</span>
    <span class="fm-tile-price">${esc(priceText)}</span>
    ${stockText ? `<span class="fm-tile-stock">${esc(stockText)}</span>` : ''}
    ${qty > 0 ? `<span class="fm-tile-qty" aria-hidden="true">${qty}</span>` : ''}
  </button>
  ${qty > 0 ? `<button type="button" class="fm-tile-minus" onclick="posUpdateQty(${idJs}, -1)" aria-label="Remove one: ${esc(title)}">−</button>` : ''}
</div>`;
}

/**
 * Keep the screen on while selling. Browsers drop the lock whenever the page
 * is hidden, so it is re-requested on return. Returns a release function.
 */
export function keepScreenAwake(nav = globalThis.navigator, doc = globalThis.document) {
  if (!nav?.wakeLock?.request || !doc) return () => {};
  let lock = null;
  let active = true;
  const grab = async () => {
    if (!active || doc.visibilityState !== 'visible' || lock) return;
    try {
      lock = await nav.wakeLock.request('screen');
      lock.addEventListener?.('release', () => { lock = null; });
    } catch { lock = null; /* low battery or not allowed: selling still works */ }
  };
  const onVis = () => { grab(); };
  doc.addEventListener('visibilitychange', onVis);
  grab();
  return () => {
    active = false;
    doc.removeEventListener('visibilitychange', onVis);
    lock?.release?.().catch?.(() => {});
    lock = null;
  };
}

/**
 * The register's always-visible upload pill. Unlike the app-wide sync chip it
 * also shows the good news, because at a stall "is it saved?" is asked all day.
 */
export function fairSyncPill({ online = true, pending = 0, retrying = false, atRisk = false } = {}) {
  const n = Math.max(0, Math.floor(Number(pending) || 0));
  const waiting = n ? `${n} ${n === 1 ? 'change' : 'changes'} waiting to upload` : '';
  if (atRisk && n) {
    return { tone: 'failed', text: `Keep the app open · ${waiting}`, srText: `This phone could not store ${waiting}. Keep the app open until they upload.` };
  }
  if (online === false) {
    return { tone: 'offline', text: n ? `No signal · ${n} saved on this phone` : 'No signal · sales save on this phone', srText: `No signal. ${n ? `${waiting}; they are saved on this phone.` : 'Sales are saved on this phone and upload later.'}` };
  }
  if (n) {
    return { tone: retrying ? 'failed' : 'pending', text: retrying ? `Retrying · ${waiting}` : `Uploading · ${waiting}`, srText: `${waiting}.` };
  }
  return { tone: 'ok', text: 'All uploaded ✓', srText: 'Every sale has been uploaded.' };
}

/**
 * Today's register sales, one entry per checkout, newest first. `books` is
 * [{ id, title, currency, hist }]; only Book Fair rows from `day` that are
 * still live count. Totals are kept per currency, never converted here.
 */
export function registerSalesForDay(books, day) {
  const byNum = new Map();
  for (const book of books || []) {
    for (const h of book.hist || []) {
      if (!h || h.voided || h.chan !== 'Book Fair' || h.date !== day || !h.num) continue;
      let sale = byNum.get(h.num);
      if (!sale) { sale = { num: h.num, at: 0, method: saleMethod(h.notes), lines: [], totals: {}, units: 0 }; byNum.set(h.num, sale); }
      sale.at = Math.max(sale.at, eventTime(h.sheetsId));
      const qty = Number(h.qty) || 0;
      const amount = qty * (Number(h.price) || 0);
      const cur = h.cur || book.currency || 'CAD';
      sale.lines.push({ bookId: book.id, title: book.title || 'Untitled', qty, amount, cur });
      sale.totals[cur] = (sale.totals[cur] || 0) + amount;
      sale.units += qty;
    }
  }
  // Sale numbers are only a timestamp's last six digits and wrap every ~17
  // minutes, so order by the row's event id, which starts with the full time.
  const sales = [...byNum.values()].sort((a, b) => b.at - a.at);
  const totals = {};
  let units = 0;
  for (const s of sales) {
    units += s.units;
    for (const [cur, amt] of Object.entries(s.totals)) totals[cur] = (totals[cur] || 0) + amt;
  }
  return { sales, totals, units };
}

/** Epoch ms from an `evt-<base36 time>-<random>` id; 0 when absent. */
export function eventTime(id) {
  const m = /^evt-([0-9a-z]+)-/.exec(String(id || ''));
  const t = m ? parseInt(m[1], 36) : 0;
  return Number.isFinite(t) ? t : 0;
}

/** Which way of paying a register row's note records ("Card · …" → "Card"). */
export function saleMethod(notes) {
  const text = String(notes || '');
  // Longest first, so "Stripe QR (printed …)" is not read as something shorter.
  const hit = [...FAIR_METHODS].sort((a, b) => b.value.length - a.value.length).find((m) => text.startsWith(m.value));
  return hit ? hit.value : 'Other';
}

export function methodLabel(value) {
  return FAIR_METHODS.find((m) => m.value === value)?.label || 'Other';
}

/**
 * End-of-day summary from registerSalesForDay() output. `leftById` maps a
 * book id to copies on hand now (or null when untracked). Totals stay per
 * currency; nothing is converted here.
 */
export function fairDaySummary(day, leftById = {}) {
  const titles = new Map();
  const methods = new Map();
  for (const sale of day.sales || []) {
    const m = methods.get(sale.method) || { method: sale.method, label: methodLabel(sale.method), sales: 0, totals: {} };
    m.sales++;
    for (const [cur, amt] of Object.entries(sale.totals)) m.totals[cur] = (m.totals[cur] || 0) + amt;
    methods.set(sale.method, m);
    for (const line of sale.lines) {
      const t = titles.get(line.bookId) || { bookId: line.bookId, title: line.title, units: 0, totals: {}, left: leftById[line.bookId] ?? null };
      t.units += line.qty;
      t.totals[line.cur] = (t.totals[line.cur] || 0) + line.amount;
      titles.set(line.bookId, t);
    }
  }
  const order = FAIR_METHODS.map((m) => m.value);
  return {
    titles: [...titles.values()].sort((a, b) => b.units - a.units || a.title.localeCompare(b.title)),
    methods: [...methods.values()].sort((a, b) => order.indexOf(a.method) - order.indexOf(b.method)),
    totals: day.totals || {},
    units: day.units || 0,
    sales: (day.sales || []).length,
  };
}

const FAIR_KEY = 'lm-fair-current';

/** The fair this phone is selling at today, or null. Forgotten the next day. */
export function readCurrentFair(dayStr, storage = globalThis.localStorage) {
  try {
    const v = JSON.parse(storage?.getItem(FAIR_KEY) || 'null');
    return v && v.day === dayStr && typeof v.name === 'string' && v.name.trim() ? { name: v.name.trim(), day: v.day } : null;
  } catch { return null; }
}

export function saveCurrentFair(name, dayStr, storage = globalThis.localStorage) {
  const clean = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  try {
    if (clean) storage?.setItem(FAIR_KEY, JSON.stringify({ name: clean, day: dayStr }));
    else storage?.removeItem(FAIR_KEY);
  } catch { /* private mode: the name just isn't remembered */ }
  return clean || null;
}
