// An invoice bills a STORE, not a book — one invoice can list copies of several
// titles (see the "Un Fantastico Altrove + The Hound" case). But state is stored
// per book, so an invoice physically lives in exactly one book's document.
//
// Without these helpers the invoice is only ever visible from the book that
// happened to be open when it was written: switch to the other title it bills
// and the invoice has vanished, even though the publisher is looking at a book
// that invoice charges for.
//
// The fix keeps storage as it is — one owning book, so there's a single writer
// and no cross-document write to go wrong offline — and makes VISIBILITY span
// every book the invoice covers. `bookIds` records that span; it's stamped at
// save time and re-derived on read, so invoices written before this existed
// surface under all their titles without needing a re-save.
//
// DOM- and Firestore-free so the matching rules can be unit-tested directly.

// Titles a line item's free-text description names. Descriptions are typed by
// hand ("The Hound ( Production cost wholesale discount =$52 per book)"), so
// this is a containment test against the known titles rather than a parse.
// Longest title first: with both "The Hound" and "The Hound II" on the shelf,
// a line naming the sequel must not also register as the original.
export function booksNamedInText(text, books) {
  const hay = String(text || '').toLowerCase();
  if (!hay.trim()) return [];
  const candidates = (books || [])
    .filter(b => b && b.id && String(b.title || '').trim())
    .sort((a, b) => String(b.title).length - String(a.title).length);

  const found = [];
  let remaining = hay;
  for (const b of candidates) {
    const title = String(b.title).toLowerCase().trim();
    // Whole-word match only: "Cat" must not be found inside "Catalog".
    let hit = false, from = 0, out = '', at;
    const isWord = ch => !!ch && /[\p{L}\p{N}]/u.test(ch);
    while ((at = remaining.indexOf(title, from)) !== -1) {
      const end = at + title.length;
      if (!isWord(remaining[at - 1]) && !isWord(remaining[end])) {
        hit = true;
        // Consume the match so a shorter title nested inside it can't also claim
        // this same stretch of text.
        out += remaining.slice(from, at) + ' ';
      } else {
        out += remaining.slice(from, end);
      }
      from = end;
    }
    out += remaining.slice(from);
    if (hit) { found.push(b.id); remaining = out; }
  }
  return found;
}

// The title a single line bills for. `bookId` is what the publisher picked in
// the editor (or what an imported line was stamped with) and always wins; a
// hand-typed line falls back to the title its description names, and a line
// naming none belongs to the book issuing the invoice.
export function lineItemBookId(item, ownerBookId, books) {
  if (item && item.bookId) return item.bookId;
  const named = booksNamedInText(item && item.description, books);
  return named[0] || ownerBookId;
}

// Every book an invoice belongs to: the book that owns it, whatever its line
// items were explicitly stamped with, and any title named in a description.
// Owner always included — an invoice never disappears from the book holding it,
// even if every description was written without a recognisable title.
export function deriveInvoiceBookIds(inv, ownerBookId, books) {
  const ids = [];
  const add = id => { if (id && !ids.includes(id)) ids.push(id); };

  add(ownerBookId);
  for (const it of ((inv && inv.items) || [])) {
    add(it.bookId);                                  // explicit wins
    for (const id of booksNamedInText(it.description, books)) add(id);
  }
  return ids;
}

// The books an invoice is visible from. Prefers the stored span (what the
// publisher last saved) and falls back to deriving it, so an invoice saved
// before `bookIds` existed still shows up under every title it bills.
export function invoiceBookIds(inv, ownerBookId, books) {
  if (inv && Array.isArray(inv.bookIds) && inv.bookIds.length) {
    // Guard the owner: a stored span that somehow omits the book physically
    // holding the invoice would hide it from its own shelf.
    return inv.bookIds.includes(ownerBookId) ? inv.bookIds.slice() : [ownerBookId, ...inv.bookIds];
  }
  return deriveInvoiceBookIds(inv, ownerBookId, books);
}

// True when `bookId` is one of the books this invoice bills.
export function invoiceCoversBook(inv, ownerBookId, bookId, books) {
  return invoiceBookIds(inv, ownerBookId, books).includes(bookId);
}

// Every invoice visible from `bookId`, across all book states — the ones this
// book owns plus the ones another book owns but that bill this title too.
// Returns descriptors `{ inv, ownerBookId, shared }`, where `shared` marks an
// invoice held by a different book (it is read here, written there).
// `skipBookId` filters out books that shouldn't contribute (test books).
export function invoicesForBook(states, books, bookId, skipBookId) {
  const out = [];
  if (!states || !bookId) return out;
  for (const ownerBookId of Object.keys(states)) {
    if (typeof skipBookId === 'function' && skipBookId(ownerBookId)) continue;
    const list = (states[ownerBookId] || {}).invoices;
    if (!Array.isArray(list)) continue;
    for (const inv of list) {
      if (!invoiceCoversBook(inv, ownerBookId, bookId, books)) continue;
      out.push({ inv, ownerBookId, shared: ownerBookId !== bookId });
    }
  }
  return out;
}

// Locate an invoice by id across every book, so viewing, editing, deleting or
// paying one works from whichever title the publisher opened it from — and so
// the write lands on the book that actually holds it.
// Returns { inv, ownerBookId } or null.
export function findInvoiceAcrossBooks(states, id, preferBookId) {
  if (!states || !id) return null;
  // Check the caller's book first: same-book edits stay O(1) and an id
  // collision across books can't steal the one in front of the publisher.
  const order = Object.keys(states);
  if (preferBookId && order.includes(preferBookId)) {
    order.splice(order.indexOf(preferBookId), 1);
    order.unshift(preferBookId);
  }
  for (const ownerBookId of order) {
    const list = (states[ownerBookId] || {}).invoices;
    if (!Array.isArray(list)) continue;
    const inv = list.find(i => i && i.id === id);
    if (inv) return { inv, ownerBookId };
  }
  return null;
}

// The other titles an invoice bills, as display names — what the invoice list
// shows so a shared invoice reads as deliberate rather than as a stray record.
export function otherBookTitles(inv, ownerBookId, bookId, books) {
  const byId = new Map((books || []).filter(b => b && b.id).map(b => [b.id, b]));
  return invoiceBookIds(inv, ownerBookId, books)
    .filter(id => id !== bookId)
    .map(id => (byId.get(id) || {}).title)
    .filter(Boolean);
}

// ── How much of an invoice belongs to each title ─────────────────────────
// A shop pays ONE bill covering several books, but the publisher still has to
// know what each title earned — that is what each author's share is worked out
// from. Splitting by hand off the line items is the step this removes.

const cents = n => Math.round((Number(n) || 0) * 100);

// Split `amount` across `weights` so the parts are whole cents that add back up
// to `amount` exactly. Plain per-share rounding leaves the parts a cent or two
// off the invoice total, which is precisely the kind of drift that makes a
// payout look wrong. Largest-remainder: floor every share, then hand the
// leftover cents to the shares that lost the most in the rounding.
function allocate(amount, weights) {
  // ⚡ Bolt Optimization: Replace map and reduce with imperative loops for allocation logic to avoid intermediate array allocations
  const totalCents = cents(amount);
  const len = weights.length;
  if (!len) return [];

  let weightSum = 0;
  for (let i = 0; i < len; i++) {
    weightSum += weights[i];
  }

  if (weightSum <= 0) {
    // Nothing to weight by (a zero-value invoice, or every line free): give it
    // all to the first title rather than inventing a split.
    const res = new Array(len).fill(0);
    res[0] = totalCents / 100;
    return res;
  }

  const floors = new Array(len);
  const order = new Array(len);
  let floorSum = 0;
  for (let i = 0; i < len; i++) {
    const v = (totalCents * weights[i]) / weightSum;
    const f = Math.floor(v);
    floors[i] = f;
    floorSum += f;
    order[i] = { i, frac: v - f };
  }

  let remainder = totalCents - floorSum;
  order.sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; k < len && remainder > 0; k++, remainder--) {
    floors[order[k].i]++;
  }

  for (let i = 0; i < len; i++) {
    floors[i] = floors[i] / 100;
  }
  return floors;
}

// Per-title breakdown of one invoice: what each book contributed before the
// invoice-level discount and tax, and what it comes to after both are shared
// out in proportion. The `total` column sums to the invoice total exactly.
// Returns [] when the invoice has no line items.
export function invoiceBookSplit(inv, ownerBookId, books) {
  const items = (inv && inv.items) || [];
  if (!items.length) return [];

  const byId = new Map((books || []).filter(b => b && b.id).map(b => [b.id, b]));
  const order = [];
  const subtotals = new Map();
  for (const it of items) {
    const bid = lineItemBookId(it, ownerBookId, books);
    if (!subtotals.has(bid)) { subtotals.set(bid, 0); order.push(bid); }
    // What the line actually bills — after its own discount, if it has one.
    subtotals.set(bid, subtotals.get(bid) + invoiceLineAmount(it));
  }

  // ⚡ Bolt Optimization: Loop fusion - Combine multiple .map() and .reduce() calls into a single pass
  const len = order.length;
  const weights = new Array(len);
  let subtotalSum = 0;
  let weightSum = 0;

  for (let i = 0; i < len; i++) {
    const bid = order[i];
    const sub = subtotals.get(bid);
    subtotalSum += sub;
    const w = Math.max(0, cents(sub));
    weights[i] = w;
    weightSum += w;
  }

  // Prefer the invoice's stored total; fall back to the line sum so a partly
  // filled draft still splits sensibly.
  const grand = (inv && inv.total != null) ? Number(inv.total) || 0 : subtotalSum;
  const totals = allocate(grand, weights);

  const res = new Array(len);
  for (let i = 0; i < len; i++) {
    const bid = order[i];
    res[i] = {
      bookId: bid,
      title: (byId.get(bid) || {}).title || bid,
      subtotal: Math.round(subtotals.get(bid) * 100) / 100,
      share: weightSum > 0 ? weights[i] / weightSum : (i === 0 ? 1 : 0),
      total: totals[i],
    };
  }
  return res;
}

// One title's slice of an invoice, or null when that title isn't on it.
export function invoiceShareForBook(inv, ownerBookId, bookId, books) {
  return invoiceBookSplit(inv, ownerBookId, books).find(r => r.bookId === bookId) || null;
}

// ── Numbering ────────────────────────────────────────────────────────────
// Numbers are per-book ("INV-ALTROV-2026-004"), which reads as an error to a
// shop holding a bill that also charges for another title. An invoice covering
// more than one book gets a neutral prefix built from the business name
// instead, so the number names the publisher rather than one of its titles.

export const NEUTRAL_PREFIX_FALLBACK = 'LMB';

// Initials of the business name — "Lyricalmyrical Books" → "LB". A single-word
// name keeps its first letters instead ("Nightjar" → "NIGHT") so the prefix is
// still recognisable rather than one bare letter. Derived from the name printed
// on the invoice, so the number reads as the publisher's rather than a title's.
export function neutralInvoicePrefix(businessName) {
  const words = String(businessName || '')
    .replace(/[^A-Za-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return NEUTRAL_PREFIX_FALLBACK;
  if (words.length === 1) return words[0].slice(0, 5).toUpperCase();
  return words.map(w => w[0]).join('').slice(0, 6).toUpperCase();
}

// The prefix an invoice number carries: "INV-ALTROV-2026-004" → "ALTROV".
// Returns '' for anything not in that shape.
export function invoiceNumberPrefix(num) {
  const m = /^INV-(.+)-(\d{4})-(\d+)$/.exec(String(num || '').trim());
  return m ? m[1] : '';
}

// The next free sequence number for one prefix and year, across every book's
// invoices — a neutral-prefixed number is shared between books, so counting
// only the issuing book's list would hand out the same number twice.
export function nextInvoiceSeq(allInvoices, prefix, year) {
  let max = 0;
  for (const inv of (allInvoices || [])) {
    const m = /^INV-(.+)-(\d{4})-(\d+)$/.exec(String((inv && inv.num) || '').trim());
    if (!m) continue;
    if (m[1] !== prefix || m[2] !== String(year)) continue;
    max = Math.max(max, parseInt(m[3], 10) || 0);
  }
  return max + 1;
}

export function buildInvoiceNumber(prefix, year, seq) {
  return `INV-${prefix}-${year}-${String(seq).padStart(3, '0')}`;
}


// ── Who the invoice bills ────────────────────────────────────────────────
// Most invoices go to a consignment store picked from the shop list, but some
// go to somebody who is not a store at all — a reader buying direct, a school,
// a festival organiser. Both end up written into the SAME flattened `store*`
// fields, so the invoice list, the printed invoice, the email and the PDF keep
// working untouched; `billTo` is what records which of the two the publisher
// actually chose, so re-opening the invoice reopens the right form.
export const BILL_TO_STORE = 'store';
export const BILL_TO_PERSON = 'person';

// Which mode an invoice was written in. Stamped on new invoices; inferred for
// ones written before this existed, which always had a store id because a store
// was the only thing an invoice could be addressed to.
export function invoiceBillToMode(inv) {
  const raw = String((inv && inv.billTo) || '').trim().toLowerCase();
  if (raw === BILL_TO_PERSON || raw === BILL_TO_STORE) return raw;
  if (inv && !inv.storeId && String(inv.storeName || '').trim()) return BILL_TO_PERSON;
  return BILL_TO_STORE;
}

const trimmed = v => String(v ?? '').trim();

// A hand-typed recipient, tidied: every field trimmed, nothing undefined. The
// name is the only required part — an invoice with no name on it is not a bill.
export function normalizeBillToPerson(fields) {
  const f = fields || {};
  return {
    name: trimmed(f.name),
    email: trimmed(f.email),
    phone: trimmed(f.phone),
    address: trimmed(f.address),
    city: trimmed(f.city),
    region: trimmed(f.region),
    postal: trimmed(f.postal),
    country: trimmed(f.country),
  };
}

// The recipient block of an invoice payload, for either mode. Written as one
// helper so a store invoice and a hand-typed one can never drift into carrying
// different field names — everything downstream reads these keys and nothing
// else, and a person's own name is the contact, so `storeContact` stays empty
// rather than printing the same name twice on the invoice.
export function billToPayload(mode, { store, person } = {}) {
  if (invoiceBillToMode({ billTo: mode }) === BILL_TO_PERSON) {
    const p = normalizeBillToPerson(person);
    return {
      billTo: BILL_TO_PERSON,
      storeId: null,
      storeName: p.name,
      storeEmail: p.email,
      storeCity: p.city,
      storeContact: '',
      storePhone: p.phone,
      storeAddress: p.address,
      storeRegion: p.region,
      storePostal: p.postal,
      storeCountry: p.country,
    };
  }
  const st = store || {};
  return {
    billTo: BILL_TO_STORE,
    storeId: st.id ?? null,
    storeName: st.name || '',
    storeEmail: st.email || '',
    storeCity: st.city || '',
    storeContact: st.contact || '',
    storePhone: st.phone || '',
    storeAddress: st.address || '',
    storeRegion: st.region || '',
    storePostal: st.postal || '',
    storeCountry: st.country || '',
  };
}

// The recipient of a saved invoice, back in the shape the person form takes —
// what re-opening a hand-typed invoice fills its fields from.
export function billToPersonFrom(inv) {
  return normalizeBillToPerson({
    name: (inv && inv.storeName) || '',
    email: (inv && inv.storeEmail) || '',
    phone: (inv && inv.storePhone) || '',
    address: (inv && inv.storeAddress) || '',
    city: (inv && inv.storeCity) || '',
    region: (inv && inv.storeRegion) || '',
    postal: (inv && inv.storePostal) || '',
    country: (inv && inv.storeCountry) || '',
  });
}


// ── Line and invoice arithmetic ──────────────────────────────────────────
// One place that says what a line and an invoice come to, so the editor, the
// printed page, the emailed copy and the per-title split can never disagree
// about a figure the customer is being asked to pay.

const round2 = n => Math.round((Number(n) || 0) * 100) / 100;
const nonNeg = n => Math.max(0, Number(n) || 0);

// A number as people actually type it: "12,5" and "12.5" are both twelve and
// a half, and with both marks present the last one is the decimal point
// ("1.234,50" and "1,234.50" are the same amount). NaN when there is no number.
export function parseLooseNumber(v) {
  let t = String(v ?? '').replace(/[^0-9.,-]/g, '');
  const lastComma = t.lastIndexOf(','), lastDot = t.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    t = lastComma > lastDot ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else if (lastComma > -1) {
    // "1,500" / "1,234,567" are thousands groups (a lone leading 0 is a decimal, "0,500").
    t = /^-?(?!0,)\d{1,3}(,\d{3})+$/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.');
  }
  return parseFloat(t);
}

// A percentage the publisher typed, held to 0–100. Anything that isn't a
// number reads as no discount rather than as a nonsense figure on the bill.
export function clampPercent(v) {
  const n = typeof v === 'number' ? v : parseLooseNumber(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

// What a line is worth before its own discount: quantity × unit price.
export function invoiceLineGross(item) {
  return round2(nonNeg(item && item.qty) * nonNeg(item && item.unitPrice));
}

// What a line actually bills, after its own percentage discount (e.g. a 40%
// trade discount on one title). Lines written before per-line discounts
// existed carry none, so they come out exactly as they always did.
export function invoiceLineAmount(item) {
  const gross = nonNeg(item && item.qty) * nonNeg(item && item.unitPrice);
  const pct = clampPercent(item && item.discountPct);
  return round2(gross * (1 - pct / 100));
}

// True when any line on the invoice carries its own discount — the printed
// invoice only grows a "Disc." column when there is something to put in it.
export function invoiceHasLineDiscounts(items) {
  return (items || []).some(it => clampPercent(it && it.discountPct) > 0);
}

// The whole invoice: subtotal of the (already line-discounted) lines, then the
// invoice-wide discount, then tax on what is left. A flat discount can never
// exceed the subtotal — a bill showing "−€80" against €50 of books is wrong
// even if the total is clamped to zero underneath it.
export function computeInvoiceTotals({ items, discountType, discountValue, taxRate } = {}) {
  let subtotal = 0;
  for (const it of (items || [])) subtotal += invoiceLineAmount(it);
  subtotal = round2(subtotal);

  const type = discountType === 'percent' ? 'percent' : 'flat';
  let discount = 0;
  let discountRate = 0;
  if (type === 'percent') {
    discountRate = clampPercent(discountValue);
    discount = round2((subtotal * discountRate) / 100);
  } else {
    const flat = typeof discountValue === 'number' ? discountValue : parseLooseNumber(discountValue);
    discount = round2(Math.min(subtotal, nonNeg(flat)));
  }

  const rate = clampPercent(taxRate);
  const taxable = round2(Math.max(0, subtotal - discount));
  const tax = round2(taxable * (rate / 100));
  const total = round2(taxable + tax);
  return { subtotal, discount, discountType: type, discountRate, taxRate: rate, tax, total };
}

// Read whatever the publisher typed into the discount box. "15%" is a
// percentage whatever mode the box is in, "€10" or "$10" is an amount, and a
// bare number keeps the box's current mode. Commas work as decimal points, so
// "12,5" is twelve and a half — the way it's written on a European invoice.
// Returns { type, value, explicit } where `explicit` says the text itself
// named the kind of discount (so the toggle can follow it).
export function parseDiscountEntry(text, currentType = 'flat') {
  const raw = String(text ?? '').trim();
  const mode = currentType === 'percent' ? 'percent' : 'flat';
  if (!raw) return { type: mode, value: 0, explicit: false };
  const hasPercent = raw.includes('%');
  const hasMoney = /[€$£¥]|\b(?:eur|usd|cad|mxn|gbp)\b/i.test(raw);
  const num = parseLooseNumber(raw);
  const value = Number.isFinite(num) ? Math.max(0, num) : 0;
  if (hasPercent) return { type: 'percent', value: Math.min(100, value), explicit: true };
  if (hasMoney) return { type: 'flat', value, explicit: true };
  return { type: mode, value: mode === 'percent' ? Math.min(100, value) : value, explicit: false };
}

// The due date `days` after an issue date, both as YYYY-MM-DD. Worked in UTC
// so a "30 days" term never lands a day early or late across a clock change.
// Returns '' when the issue date isn't a real date.
export function dueDateFromTerms(issueDate, days) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(issueDate || '').trim());
  if (!m) return '';
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (Number.isNaN(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() + (Math.round(Number(days)) || 0));
  return d.toISOString().slice(0, 10);
}

// How many days a due date sits after the issue date — what lets the editor
// light up the matching "Net 30" shortcut when an invoice is reopened.
// Returns null when either date is missing or malformed.
export function daysBetween(fromDate, toDate) {
  const a = dueDateFromTerms(fromDate, 0), b = dueDateFromTerms(toDate, 0);
  if (!a || !b) return null;
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}

// A copy of an invoice's content for "Duplicate": who it bills, what it bills
// and how it's priced — but none of its identity or history. Links to
// consignment sales are dropped, because those sales are already billed on the
// original and carrying the link would re-point them at the copy.
export function duplicateInvoiceContent(inv) {
  const src = inv || {};
  return {
    billTo: invoiceBillToMode(src),
    storeId: src.storeId ?? null,
    person: billToPersonFrom(src),
    items: (src.items || []).map(it => ({
      description: String((it && it.description) || ''),
      qty: nonNeg(it && it.qty),
      unitPrice: nonNeg(it && it.unitPrice),
      discountPct: clampPercent(it && it.discountPct),
      bookId: (it && it.bookId) || null,
    })),
    discountType: src.discountType === 'percent' ? 'percent' : 'flat',
    discountValue: src.discountType === 'percent' ? clampPercent(src.discountRate) : nonNeg(src.discount),
    taxRate: clampPercent(src.taxRate),
    currencyCode: src.currencyCode || '',
    notes: String(src.notes || ''),
    terms: String(src.terms || ''),
    linkedSalesDropped: (src.items || []).filter(it => it && it._ledgerId).length,
  };
}
