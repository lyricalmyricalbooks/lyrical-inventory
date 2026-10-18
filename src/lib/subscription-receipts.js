// Receipts for costs a subscription already puts in the books.
//
// A subscription posts its own charge every period, and the vendor emails a
// receipt for the same money. That receipt used to reach the review list
// looking like a brand-new expense: the duplicate check only knew "same date,
// same amount, same currency", and Big Cartel's receipt dated the 16th is not
// the same date as the subscription charge posted on the 5th. Filing it
// counted the cost twice.
//
// This decides which subscription charge a receipt belongs to — by billing
// period, not by exact day — so it can be kept as that charge's proof instead
// of filed beside it. It also finds receipts that were already filed beside a
// charge, so the two can be merged.
//
// Pure: no DOM, no ledger writes, no network.

import {
  chargesBetween,
  firstUnpostedCharge,
  frequencyMonths,
  laterChargeDayChange,
  normalizeRateChanges,
  normalizeRecurring,
  parseYmd,
} from './recurring.js';
import { roundCents } from './money.js';
import { textSimilarity, tokens } from './receipt-match.js';

/**
 * Senders that mail receipts on behalf of many businesses. Learning one of
 * these as "the" sender for a subscription would tie every Stripe or PayPal
 * receipt to it, so they never count as a vendor's own address.
 */
const SHARED_SENDER_DOMAINS = [
  'stripe.com', 'paypal.com', 'paypal.ca', 'squareup.com', 'square.com',
  'apple.com', 'itunes.com', 'shopify.com', 'shopifyemail.com', 'intuit.com',
  'wave.com', 'waveapps.com', 'interac.ca', 'payments.interac.ca',
  // One address for a subscription and everything else the company sells:
  // Prime and every Amazon order, Workspace and every Google Ads bill.
  'amazon.ca', 'amazon.com', 'amazon.co.uk', 'google.com',
];

/** How many learned addresses a subscription keeps. */
const MAX_SENDERS = 5;

const upper = (v, fallback = 'CAD') => String(v || fallback).toUpperCase();

/** The bare address in a From line ("Big Cartel <support@bigcartel.com>"), lowercased, or ''. */
export function senderAddress(from) {
  const m = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i.exec(String(from || ''));
  return m ? m[1].toLowerCase() : '';
}

function senderDomain(address) {
  return String(address || '').split('@')[1] || '';
}

/** True for an address that sends receipts for many businesses at once. */
export function isSharedSender(address) {
  const domain = senderDomain(address);
  if (!domain) return true;
  return SHARED_SENDER_DOMAINS.some(d => domain === d || domain.endsWith(`.${d}`));
}

/** The name part of a sender's domain: "bigcartel" for support@email.bigcartel.com. */
function senderBrand(address) {
  const parts = senderDomain(address).split('.').filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 2] : '';
}

const squash = (text) => String(text || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Whether every word of the receipt's vendor appears in the subscription's
 * name — "Big Cartel" in "Big Cartel Website", "Freedom Mobile" in a
 * subscription whose vendor is Freedom mobile. Stricter than the similarity
 * score on purpose: "Google Ads" shares a word with "google one" but is not it.
 */
function vendorWithin(vendorText, subText) {
  const mine = new Set(tokens(vendorText));
  const theirs = new Set(tokens(subText));
  if (!mine.size || !theirs.size) return false;
  for (const t of mine) if (!theirs.has(t)) return false;
  return true;
}

const IDENTITY_RANK = { sender: 3, name: 2, similar: 1 };

/**
 * How sure we are that a receipt comes from this subscription's vendor:
 *   'sender'  — it came from an address this subscription's receipts came from before
 *   'name'    — the vendor's name is the subscription's name, or the sending domain is
 *   'similar' — the names share enough words to be worth checking against the amount
 *   ''        — not this vendor
 */
export function receiptIdentity(receipt = {}, sub = {}) {
  const address = senderAddress(receipt.emailFrom || receipt.from);
  const learned = Array.isArray(sub.receiptSenders) ? sub.receiptSenders.map(a => String(a).toLowerCase()) : [];
  if (address && learned.includes(address)) return 'sender';

  const vendorText = receipt.vendor || receipt.description || receipt.desc || '';
  const names = [sub.vendor, sub.desc].filter(Boolean);
  let strength = '';
  if (names.some(name => vendorWithin(vendorText, name))) strength = 'name';
  else if (names.some(name => textSimilarity(vendorText, name) >= 0.5)) strength = 'similar';
  else if (!tokens(vendorText).length) {
    // Only with no vendor name to go on does the sending domain stand in for
    // one: a receipt that names "Google Ads" is not "Google Workspace" just
    // because both come from google.com.
    const brand = address && !isSharedSender(address) ? senderBrand(address) : '';
    if (brand.length >= 4 && names.some(name => squash(name).includes(brand))) strength = 'name';
  }
  // Once a subscription has learned where its receipts come from, a receipt
  // from some other address has to earn the match with its amount.
  if (strength === 'name' && address && learned.length) strength = 'similar';
  return strength;
}

/** Days either side of a charge that a receipt for it can carry. */
export function receiptWindowDays(sub) {
  return frequencyMonths(normalizeRecurring(sub).frequency) === 1 ? 15 : 31;
}

function dayNumber(dateStr) {
  const p = parseYmd(dateStr);
  return p ? Date.UTC(p.y, p.m - 1, p.d) / 86400000 : null;
}

function shiftDays(dateStr, days) {
  const n = dayNumber(dateStr);
  return new Date((n + days) * 86400000).toISOString().slice(0, 10);
}

/** True when an expense already has a receipt file or link on it. */
export function hasReceiptProof(expense) {
  return !!(expense && ((Array.isArray(expense.receiptFiles) && expense.receiptFiles.length) || expense.receipt));
}

/** True for a ledger line a subscription posted (current or legacy shape). */
export function isSubscriptionLine(expense) {
  return !!(expense && (expense.recurringId || / \(Recurring\)$/.test(String(expense.desc || ''))));
}

/** The ledger lines one subscription has posted. */
export function subscriptionLines(sub, expenses = []) {
  const s = normalizeRecurring(sub);
  const legacyDesc = `${s.desc} (Recurring)`;
  return (expenses || []).filter(e => e &&
    ((s.id && e.recurringId === s.id) || (!e.recurringId && e.desc === legacyDesc)));
}

/** The ledger line for one posted charge, or null when it was removed by hand. */
function postedLineFor(lines, charge) {
  return lines.find(e => e.recurringPeriod === charge.monthKey)
    || lines.find(e => !e.recurringPeriod && e.date === charge.date)
    || null;
}

/**
 * The charge of one subscription a receipt belongs to, or null.
 *
 * A charge qualifies when it falls inside the receipt's window and is either
 * posted (its ledger line still exists) or the very next one due. A posted
 * charge whose line was deleted is not offered: the books don't count it, so
 * filing the receipt on its own is right. A charge that already has a receipt
 * is offered only as a likely second copy, when the amount is the same.
 */
export function subscriptionCandidate(receipt = {}, sub = {}, expenses = [], { lines: ownLines = null } = {}) {
  const s = normalizeRecurring(sub);
  if (!s.id || !parseYmd(receipt.date)) return null;
  const identity = receiptIdentity(receipt, s);
  if (!identity) return null;

  const window = receiptWindowDays(s);
  const charges = chargesBetween(s, shiftDays(receipt.date, -window), shiftDays(receipt.date, window));
  if (!charges.length) return null;
  const lines = ownLines || subscriptionLines(s, expenses);
  const next = firstUnpostedCharge(s);
  const receiptCurrency = upper(receipt.currency);
  const receiptAmount = Number(receipt.amount);
  const receiptDay = dayNumber(receipt.date);

  const options = charges.map(charge => {
    const line = charge.posted ? postedLineFor(lines, charge) : null;
    if (charge.posted && !line) return null;
    if (!charge.posted && !s.paused && next?.monthKey !== charge.monthKey) return null;
    const currency = upper(line ? (line.currency || s.currency) : s.currency);
    const amount = line ? Number(line.amount) || 0 : charge.amount;
    const sameCurrency = currency === receiptCurrency;
    return {
      charge,
      line,
      currency,
      amount,
      sameCurrency,
      amountMatches: sameCurrency && !receipt.amountUnknown && Number.isFinite(receiptAmount)
        && Math.abs(amount - receiptAmount) < 0.005,
      gapDays: Math.abs(dayNumber(charge.date) - receiptDay),
      covered: !!line && hasReceiptProof(line),
    };
  }).filter(Boolean);
  if (!options.length) return null;

  options.sort((a, b) => (a.covered - b.covered) || (a.gapDays - b.gapDays) || (a.charge.date < b.charge.date ? -1 : 1));
  const best = options[0];
  // A name that only resembles the subscription's, or a charge that already
  // has its receipt, is only this charge if the money says so too.
  if ((identity === 'similar' || best.covered) && !best.amountMatches) return null;

  return {
    sub: s,
    subId: s.id,
    identity,
    ...best,
    posted: best.charge.posted,
    paused: s.paused && !best.charge.posted,
  };
}

/**
 * Which subscription charge a receipt belongs to.
 *
 * Returns null when it belongs to none, else `{ match, candidates, ambiguous }`.
 * `ambiguous` means two subscriptions fit equally well — the Internet and the
 * phone bill from the same company, with an amount matching neither — and the
 * owner has to say which; `chosenId` is that answer once given.
 */
export function matchReceiptToSubscription(receipt = {}, subscriptions = [], expenses = [], { chosenId = '' } = {}) {
  if (!receipt || receipt.notSubscription) return null;
  const candidates = (subscriptions || [])
    .map(sub => subscriptionCandidate(receipt, sub, expenses))
    .filter(Boolean)
    .sort((a, b) => (b.amountMatches - a.amountMatches)
      || (IDENTITY_RANK[b.identity] - IDENTITY_RANK[a.identity])
      || (a.covered - b.covered)
      || (a.gapDays - b.gapDays));
  if (!candidates.length) return null;

  const chosen = chosenId ? candidates.find(c => c.subId === chosenId) : null;
  if (chosen) return { match: chosen, candidates, ambiguous: false };
  const [top, second] = candidates;
  const ambiguous = !!second
    && second.amountMatches === top.amountMatches
    && IDENTITY_RANK[second.identity] === IDENTITY_RANK[top.identity];
  return { match: top, candidates, ambiguous };
}

/** The addresses a subscription has learned, with this receipt's added when it is the vendor's own. */
export function learnedSenders(sub = {}, emailFrom = '') {
  const known = Array.isArray(sub.receiptSenders) ? sub.receiptSenders.map(a => String(a).toLowerCase()) : [];
  const address = senderAddress(emailFrom);
  if (!address || isSharedSender(address) || known.includes(address)) return known;
  return [address, ...known].slice(0, MAX_SENDERS);
}

/**
 * The receipt fields to put on the charge it proves. The files are added to
 * any already there, so a merge never drops a receipt, and the receipt's own
 * date and amount are kept beside the charge's for the record.
 */
export function receiptProofFields(line = {}, proof = {}) {
  const files = [...new Set([
    ...(Array.isArray(line.receiptFiles) ? line.receiptFiles : (line.receipt ? [line.receipt] : [])),
    ...(Array.isArray(proof.receiptFiles) ? proof.receiptFiles : (proof.receipt ? [proof.receipt] : [])),
  ].filter(Boolean))];
  const out = {};
  if (files.length) {
    out.receiptFiles = files;
    out.receipt = line.receipt || files[0];
  }
  if (proof.receiptCloudAt && !line.receiptCloudAt) out.receiptCloudAt = proof.receiptCloudAt;
  if (proof.emailMsgId && !line.emailMsgId) out.emailMsgId = proof.emailMsgId;
  if (proof.receiptRef && !line.receiptRef) out.receiptRef = proof.receiptRef;
  if (parseYmd(proof.receiptDate)) out.receiptDate = proof.receiptDate;
  if (Number.isFinite(Number(proof.receiptAmount)) && proof.receiptAmount !== '' && proof.receiptAmount != null) {
    out.receiptAmount = Number(proof.receiptAmount);
    out.receiptCurrency = upper(proof.receiptCurrency || line.currency);
  }
  return out;
}

/**
 * The subscription fields that record a new price from `date` on — the "the
 * price changed" answer to a receipt that doesn't match. A date on or before
 * the first charge changes the starting amount instead, because a price change
 * has to start after it (the editor's rule). A change already on that date
 * keeps its note and whether it moves the charge day.
 */
export function priceChangeFrom(sub, date, amount) {
  const s = normalizeRecurring(sub);
  const value = roundCents(amount);
  if (!parseYmd(date) || !(value > 0)) return null;
  if (date <= s.startDate) return { amount: value };
  const existing = s.rateChanges.find(r => r.effectiveFrom === date);
  return {
    rateChanges: normalizeRateChanges([
      ...s.rateChanges.filter(r => r.effectiveFrom !== date),
      {
        effectiveFrom: date,
        amount: value,
        note: existing?.note || 'New price, from a receipt',
        movesCharge: !!existing?.movesCharge,
      },
    ]),
  };
}

/**
 * Expenses already in the books that are a second copy of a subscription
 * charge: same vendor by name, same currency and amount, inside the charge's
 * window, and not posted by the subscription itself. Each charge pairs with at
 * most one copy, and a pair the owner said was two different costs
 * (`notSubscriptionDouble`) is never raised again.
 */
export function findSubscriptionDoubles(subscriptions = [], expenses = []) {
  const subs = (subscriptions || []).map(normalizeRecurring).filter(s => s.id);
  if (!subs.length) return [];
  // Each subscription's own lines, found once rather than once per expense
  // scanned: this runs on every look at the review queue, over the whole ledger.
  const linesBySub = new Map(subs.map(s => [s.id, subscriptionLines(s, expenses)]));
  // A copy has a charge's exact amount, so only an expense at an amount one of
  // a subscription's lines carries is worth matching against its schedule.
  const moneyKey = (amount, currency) => `${upper(currency)}|${Math.round((Number(amount) || 0) * 100)}`;
  const amountsBySub = new Map(subs.map(s => [s.id, new Set(linesBySub.get(s.id).map(l => moneyKey(l.amount, l.currency || s.currency)))]));
  const paired = new Set();
  const out = [];
  for (const e of expenses || []) {
    if (!e || isSubscriptionLine(e) || e.notSubscriptionDouble || e.amountUnknown) continue;
    const asReceipt = {
      vendor: e.vendor || e.desc,
      date: e.date,
      amount: e.origAmount ?? e.amount,
      currency: e.origCurrency || e.currency,
    };
    const key = moneyKey(asReceipt.amount, asReceipt.currency);
    const best = subs
      .filter(sub => amountsBySub.get(sub.id).has(key))
      .map(sub => subscriptionCandidate(asReceipt, sub, expenses, { lines: linesBySub.get(sub.id) }))
      .filter(c => c && c.posted && c.line && c.amountMatches && c.identity === 'name' && !paired.has(c.line))
      .sort((a, b) => a.gapDays - b.gapDays)[0];
    if (!best) continue;
    paired.add(best.line);
    out.push({ expense: e, line: best.line, sub: best.sub, charge: best.charge, gapDays: best.gapDays });
  }
  return out;
}

/**
 * When the receipts say the vendor bills later in the month than the
 * subscription does — the last two receipts both dated the 16th against a
 * charge on the 5th — the change that moves the charge day to match, or null.
 * `dayHintDismissed` is the day the owner already said to leave alone.
 */
export function receiptDayHint(sub = {}, expenses = []) {
  const s = normalizeRecurring(sub);
  if (s.paused) return null;
  const recent = subscriptionLines(s, expenses)
    .filter(e => parseYmd(e.date) && parseYmd(e.receiptDate) && String(e.receiptDate).slice(0, 7) === String(e.date).slice(0, 7))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, 2);
  if (recent.length < 2) return null;
  const day = parseYmd(recent[0].receiptDate).d;
  if (recent.some(e => parseYmd(e.receiptDate).d !== day || parseYmd(e.date).d >= day)) return null;
  if (Number(s.dayHintDismissed) === day) return null;
  const change = laterChargeDayChange(s, day);
  return change ? { day, ...change } : null;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "the October charge", for the charge on a 'YYYY-MM-DD' date. */
export function chargePeriodName(dateStr) {
  const p = parseYmd(dateStr);
  return p ? `the ${MONTHS[p.m - 1]} charge` : 'the charge';
}

/**
 * One line for the full receipts table, saying what filing a row will do when
 * it belongs to a subscription. `tone` is 'info', or 'warn' when the owner has
 * something to settle first.
 */
export function subscriptionMatchLine(result) {
  if (!result?.match) return null;
  const m = result.match;
  const name = m.sub.desc || 'subscription';
  if (result.ambiguous) {
    const names = result.candidates.map(c => c.sub.desc).filter(Boolean);
    return { tone: 'warn', text: `Fits more than one subscription (${names.join(', ')}) — choose which below before filing` };
  }
  if (m.paused) return { tone: 'warn', text: `Your ${name} subscription is paused, but this says you were charged — files as its own expense` };
  if (m.covered) return { tone: 'info', text: `${chargePeriodName(m.charge.date)} of ${name} already has its receipt — skipped as a copy` };
  if (!m.amountMatches) {
    return { tone: 'warn', text: `Looks like ${chargePeriodName(m.charge.date)} of your ${name} subscription, but the amount differs — choose what it is below` };
  }
  return m.posted
    ? { tone: 'info', text: `Kept as proof for ${chargePeriodName(m.charge.date)} of ${name}, already counted on ${m.line.date} — not added twice` }
    : { tone: 'info', text: `Counts the next ${name} charge on its due date, ${m.charge.date}, with this receipt as proof` };
}

/** "the 16th", for a day of the month. */
export function ordinalDay(day) {
  const d = Number(day);
  const tens = d % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[d % 10] || 'th');
  return `the ${d}${suffix}`;
}
