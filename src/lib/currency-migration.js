// Restating a book's money into a different currency.
//
// THE BUG THIS EXISTS TO FIX
// Every monetary number on a book — h.price, e.amountDue, s.revenue,
// book.listPrice, … — is stored as a bare Number. Nothing on the record says
// what currency it is in; the app infers it at render time from the book's
// CURRENT `currency` field. That works right up until someone edits that field:
// the instant a book flips €→CA$, a €32 sale recorded last year starts
// rendering as CA$32 and summing into CAD totals. No number moved, but every
// figure downstream is now wrong, silently and retroactively.
//
// THE FIX
// 1. Stamp records with the currency they are actually denominated in (`cur`),
//    so the inference stops being a guess.
// 2. When the book currency changes, RESTATE the stored numbers into the new
//    currency at a real FX rate instead of relabelling them.
// 3. Keep the pre-conversion value and rate on each record (`_fx`) so the move
//    is auditable and — critically — so re-running can never double-convert.
//
// Kept DOM- and Firestore-free so the money math can be unit-tested without a
// browser. main.js owns the dialog, the rate fetching and the persistence.

import { roundCents, normalizeCurrencyCode, CODE_TO_SYMBOL } from './money.js';

// Amounts that are NOT the book's native currency and must never be swept up in
// a restatement:
//   • hist[].shippingPaid  — customer-paid shipping is natively CAD (see
//     AGENTS.md "Shipping Fees Currency Invariant"); FX-converting it is a bug.
//   • hist[].payment.{currency,amount,rate} — the foreign cash actually handed
//     over. Self-describing and historically true; restating it would rewrite
//     what the customer paid.
//   • expenses[] / invoices[] — already carry their own `currency` field.
// Only `payment.convertedTotal` moves, because that one IS denominated in the
// book's native currency.

// Money-bearing paths on the BOOK record itself.
const BOOK_FIELDS = [
  { key: 'listPrice', label: 'List price' },
  { key: 'productionCost', label: 'Production cost' },
];

// ── Currency stamping ────────────────────────────────────────────────────────

// The currency an entry's own amounts are denominated in. Prefers the explicit
// stamp; falls back to the book's current currency for legacy records written
// before stamping existed (which is exactly the assumption that breaks on a
// currency change — hence `stampNativeCurrency` below).
export function entryCurrencyCode(entry, book) {
  if (entry && entry.cur) return normalizeCurrencyCode(entry.cur, 'CAD');
  return bookCurrencyCode(book);
}

// The book's currency as an ISO code. `book.currency` is stored as a display
// symbol ('€', 'CA$'), so it always needs normalizing before use in math.
export function bookCurrencyCode(book) {
  return normalizeCurrencyCode((book && book.currency) || 'EUR', 'EUR');
}

// The symbol form, for writing back to `book.currency`.
export function codeToBookSymbol(code) {
  const c = normalizeCurrencyCode(code, 'CAD');
  return CODE_TO_SYMBOL[c] || c;
}

// True when every native-denominated record already declares its currency.
// Until this is true, a currency change is silently destructive.
export function isFullyStamped(state, book) {
  return collectNativeAmounts(state, book).every(f => !!f.record.cur);
}

// Write `cur` onto every native-denominated record without touching a single
// number. Two uses:
//   • Right before a conversion, to pin down what the numbers mean.
//   • As the "relabel only" repair, when the stored numbers were always in the
//     new currency and only the label was wrong.
// Returns the number of records stamped.
export function stampNativeCurrency(state, book, code) {
  const cur = normalizeCurrencyCode(code, 'CAD');
  let stamped = 0;
  for (const f of collectNativeAmounts(state, book)) {
    if (f.record.cur !== cur) { f.record.cur = cur; stamped++; }
  }
  return stamped;
}

// ── Field collection ─────────────────────────────────────────────────────────

// Every amount on a book + its state that is denominated in the book's native
// currency, as addressable get/set descriptors. This list IS the definition of
// "what a currency change has to move" — anything missing from it silently
// keeps its old value and corrupts the books, so new money fields belong here.
//
// Each descriptor: { scope, label, date, record, get(), set(v) }
//   record — the object carrying the `cur` stamp (grouped so one sale's price
//            and its convertedTotal share a single stamp).
//   date   — YYYY-MM-DD used to pick a historical rate; '' when undated.
export function collectNativeAmounts(state, book) {
  const out = [];
  const s = state || {};

  const push = (scope, label, record, key, date, holder) => {
    const target = holder || record;
    const v = Number(target[key]);
    if (!Number.isFinite(v) || v === 0) return;
    out.push({
      scope, label, record, date: date || '',
      get: () => Number(target[key]) || 0,
      set: (n) => { target[key] = n; },
    });
  };

  if (book) {
    for (const f of BOOK_FIELDS) push('book', f.label, book, f.key, '');
    for (const [i, tier] of (book.profitTiers || []).entries()) {
      if (Number.isFinite(tier.revenueUpTo) && tier.revenueUpTo > 0) {
        push('book', `Profit tier ${i + 1} cap`, book, 'revenueUpTo', '', tier);
      }
    }
  }

  for (const h of (s.hist || [])) {
    push('hist', `Sale ${h.num || ''} unit price`, h, 'price', h.date);
    // The native-currency side of a foreign payment. `payment.amount` and
    // `payment.currency` stay untouched — that's the cash the customer handed
    // over and it did not change.
    if (h.payment && Number(h.payment.convertedTotal)) {
      push('hist', `Sale ${h.num || ''} converted total`, h, 'convertedTotal', h.date, h.payment);
    }
    // h.shippingPaid deliberately omitted — CAD invariant.
  }

  for (const t of (s.artistTransfers || [])) {
    push('transfer', `Transfer ${t.num || ''} unit price`, t, 'price', t.date);
    push('transfer', `Transfer ${t.num || ''} total`, t, 'total', t.date);
    if (t.payment && Number(t.payment.convertedTotal)) {
      push('transfer', `Transfer ${t.num || ''} converted total`, t, 'convertedTotal', t.date, t.payment);
    }
  }

  for (const e of (s.ledger || [])) {
    push('ledger', `${e.type || 'Ledger'} · ${e.storeName || ''} amount due`, e, 'amountDue', e.date);
  }

  for (const st of (s.stores || [])) {
    push('store', `${st.name || 'Store'} owed`, st, 'amountOwed', '');
  }

  for (const p of (s.artistPayouts || [])) {
    push('payout', `Artist payout ${p.date || ''}`, p, 'amount', p.date);
  }

  // Rollups. Recomputed from history on the next recomputeAfters(), but
  // converting them keeps every screen correct in the interim.
  push('totals', 'Lifetime revenue', s, 'revenue', '');
  for (const [chan, st] of Object.entries(s.chStats || {})) {
    push('totals', `${chan} revenue`, st, 'revenue', '');
  }

  return out;
}

// ── Planning ─────────────────────────────────────────────────────────────────

// Build (but do not apply) a restatement of every native amount from `from` to
// `to`. `rateFor(date)` returns the rate to use for a record dated `date` —
// pass a constant function for a single flat rate, or a date→rate lookup for
// per-entry historical rates.
//
// Records already stamped `to` are SKIPPED, not re-converted. That is what
// makes this safe to re-run after a half-finished migration (offline tab, lost
// connection mid-apply) without doubling anyone's revenue.
export function planCurrencyChange({ state, book, from, to, rateFor, skip }) {
  const fromCode = normalizeCurrencyCode(from, 'CAD');
  const toCode = normalizeCurrencyCode(to, 'CAD');
  const getRate = typeof rateFor === 'function' ? rateFor : () => Number(rateFor) || 0;
  const shouldSkip = typeof skip === 'function' ? skip : () => false;

  const changes = [];
  const skipped = [];
  let missingRate = 0;

  for (const f of collectNativeAmounts(state, book)) {
    if (shouldSkip(f)) continue;
    if (f.record.cur && normalizeCurrencyCode(f.record.cur, '') === toCode) {
      skipped.push(f);
      continue;
    }
    const rate = Number(getRate(f.date)) || 0;
    if (rate <= 0) { missingRate++; continue; }
    const before = f.get();
    changes.push({ field: f, rate, before, after: roundCents(before * rate) });
  }

  return {
    from: fromCode,
    to: toCode,
    changes,
    skipped,
    missingRate,
    // Sums are indicative (they mix scopes) but give the dialog a headline the
    // publisher can sanity-check against what they expect to see.
    totalBefore: roundCents(changes.reduce((a, c) => a + c.before, 0)),
    totalAfter: roundCents(changes.reduce((a, c) => a + c.after, 0)),
  };
}

// ── Applying ─────────────────────────────────────────────────────────────────

// Apply a plan in place. Each touched record gets:
//   cur  — the currency its numbers are now in
//   _fx  — { from, to, rate, at } audit trail of the move
// Returns { converted, stamped } counts.
export function applyCurrencyChange(plan, { at } = {}) {
  if (!plan || !plan.changes) return { converted: 0, stamped: 0 };
  const when = at || new Date().toISOString();
  const touched = new Set();

  for (const c of plan.changes) {
    c.field.set(c.after);
    const rec = c.field.record;
    if (!touched.has(rec)) {
      touched.add(rec);
      rec.cur = plan.to;
      rec._fx = { from: plan.from, to: plan.to, rate: c.rate, at: when };
    }
  }
  // Records that were already in the target currency still need the stamp, so a
  // later change can tell them apart from unstamped legacy rows.
  for (const f of plan.skipped) {
    if (!f.record.cur) { f.record.cur = plan.to; touched.add(f.record); }
  }

  return { converted: plan.changes.length, stamped: touched.size };
}

// Append a change to the book's currency audit log. Bounded so a book that gets
// toggled repeatedly can't grow an unbounded array in a Firestore document.
export function appendCurrencyLog(book, entry) {
  if (!book) return;
  if (!Array.isArray(book.currencyLog)) book.currencyLog = [];
  book.currencyLog.push({ at: new Date().toISOString(), ...entry });
  if (book.currencyLog.length > 20) book.currencyLog = book.currencyLog.slice(-20);
}

// ── Detection ────────────────────────────────────────────────────────────────

// The currency a legacy (unstamped) sale was RECORDED in, inferred from its
// payment metadata — or null when the row carries no evidence.
//
// buildPaymentMeta writes `amount === convertedTotal` with `rate: null` for
// exactly one case: the customer paid in the book's own native currency. So a
// row saying "paid EUR 32, converted total 32" is a row that was written while
// this book WAS in euros. That fingerprint survives a currency change untouched
// — which is what lets the app spot history stranded by a change made before
// stamping existed. A foreign payment (rate set, amount ≠ convertedTotal) says
// nothing about the native currency and is ignored.
export function inferRecordedCurrency(entry) {
  if (!entry) return null;
  if (entry.cur) return normalizeCurrencyCode(entry.cur, null);
  const p = entry.payment;
  if (!p || !p.currency) return null;
  if (p.rate) return null;
  const amount = Number(p.amount), converted = Number(p.convertedTotal);
  if (!Number.isFinite(amount) || !Number.isFinite(converted) || amount === 0) return null;
  if (Math.abs(amount - converted) > 0.005) return null;
  return normalizeCurrencyCode(p.currency, null);
}

// Does this book's stored history disagree with its current currency?
//
// Two signals, strongest first:
//   'stamp'   — records explicitly stamped with a different currency.
//   'payment' — unstamped legacy rows whose payment metadata betrays the
//               currency they were written under (see inferRecordedCurrency).
// Either way it means the label was changed but the numbers never were.
// Returns { mismatched, code, source } — `code` is the currency the stranded
// records are actually in.
export function detectCurrencyMismatch(state, book) {
  const bookCode = bookCurrencyCode(book);

  const stamped = new Map();
  for (const f of collectNativeAmounts(state, book)) {
    const c = f.record.cur ? normalizeCurrencyCode(f.record.cur, '') : '';
    if (c && c !== bookCode) stamped.set(c, (stamped.get(c) || 0) + 1);
  }
  if (stamped.size) {
    const [code, mismatched] = [...stamped.entries()].sort((a, b) => b[1] - a[1])[0];
    return { mismatched, code, source: 'stamp' };
  }

  const inferred = new Map();
  for (const h of ((state && state.hist) || [])) {
    if (h.voided) continue;
    const c = inferRecordedCurrency(h);
    if (c && c !== bookCode) inferred.set(c, (inferred.get(c) || 0) + 1);
  }
  if (inferred.size) {
    const [code, mismatched] = [...inferred.entries()].sort((a, b) => b[1] - a[1])[0];
    return { mismatched, code, source: 'payment' };
  }

  return { mismatched: 0, code: null, source: null };
}

// A one-line human summary of what a plan will do, for the confirm dialog.
export function describePlan(plan) {
  if (!plan) return '';
  const n = plan.changes.length;
  if (n === 0) return `Nothing to convert — every amount is already in ${plan.to}.`;
  const parts = [`${n} amount${n === 1 ? '' : 's'} will be restated from ${plan.from} to ${plan.to}`];
  if (plan.skipped.length) parts.push(`${plan.skipped.length} already in ${plan.to} (left alone)`);
  if (plan.missingRate) parts.push(`${plan.missingRate} skipped — no rate available`);
  return parts.join(' · ');
}
