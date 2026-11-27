// Extra evidence about a found receipt, beyond what the AI read: order details
// a store embeds in its email, a link that is the only copy of the receipt,
// sender lists, sums that must add up, the CRA's record rules, and spot checks.
// Pure functions; the Google Sheet script (apps-script/Code.gs) has copies of
// receiptMarkup, receiptLinkOnly and senderDomain, and a test keeps them equal.

const cents = value => (typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 100) : null);

// ── Order details embedded in the email ────────────────────────────────────
// Many stores put a schema.org Order or Invoice block in their emails for
// Gmail. When it is there, it names the seller, order number and total
// exactly, which is a second opinion on what the AI read.
export function receiptMarkup(html) {
  const text = String(html || '');
  const re = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]{0,40000}?)<\/script>/gi;
  let match, blocks = 0;
  while ((match = re.exec(text)) && blocks < 6) {
    blocks++;
    let data;
    try { data = JSON.parse(match[1].trim()); } catch { continue; }
    const found = findMarkup(data, 0);
    if (found) return found;
  }
  return null;
}

function findMarkup(node, depth) {
  if (!node || typeof node !== 'object' || depth > 4) return null;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length && i < 20; i++) {
      const hit = findMarkup(node[i], depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (node['@graph']) return findMarkup(node['@graph'], depth + 1);
  const type = String(node['@type'] || '');
  if (type !== 'Order' && type !== 'Invoice') return null;
  const name = who => (who && typeof who === 'object' ? String(who.name || '') : String(who || ''));
  let spec = node.totalPaymentDue || node.priceSpecification || {};
  if (Array.isArray(spec)) spec = spec[0] || {};
  const price = node.price !== undefined ? node.price : (spec.price !== undefined ? spec.price : spec.value);
  const amount = price === undefined || price === null || price === '' ? null : Number(String(price).replace(/[^0-9.-]/g, ''));
  const out = {
    type,
    vendor: name(node.seller || node.merchant || node.provider || node.broker).slice(0, 200),
    reference: String(node.orderNumber || node.confirmationNumber || node.accountId || '').slice(0, 100),
    amount: amount !== null && Number.isFinite(amount) ? amount : null,
    currency: String(node.priceCurrency || spec.priceCurrency || spec.currency || '').toUpperCase().slice(0, 3),
    date: String(node.orderDate || node.paymentDueDate || '').slice(0, 10),
  };
  if (!/^[A-Z]{3}$/.test(out.currency)) out.currency = '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(out.date)) out.date = '';
  return out.vendor || out.reference || out.amount !== null ? out : null;
}

// ── A receipt that is only behind a link ───────────────────────────────────
// "View your receipt" emails hold no receipt themselves. The link is kept so
// the email can be listed as needing a download instead of quietly dropped.
export function receiptLinkOnly(html) {
  const re = /<a\b[^>]*href\s*=\s*["'](https:\/\/[^"'\s]{1,600})["'][^>]*>([\s\S]{0,300}?)<\/a>/gi;
  let m, count = 0;
  while ((m = re.exec(String(html || ''))) && count < 400) {
    count++;
    const words = m[2].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (/\b(?:view|download|see|get|open|print)\b[^.]{0,30}\b(?:receipt|invoice|bill|statement)\b/i.test(words)) return m[1];
  }
  return '';
}

// ── Sender lists ────────────────────────────────────────────────────────────
// The registrable domain of an email's sender: "mail.squareup.com" →
// "squareup.com", "amazon.co.uk" stays whole. Lower case; '' when unreadable.
export function senderDomain(from) {
  const m = /<([^>]*)>/.exec(String(from || ''));
  const address = (m ? m[1] : String(from || '')).trim().toLowerCase();
  const labels = (address.split('@')[1] || '').split('.').filter(Boolean);
  if (labels.length < 2) return '';
  const keep = labels.length > 2 && /^(?:co|com|org|net|ac|gov)$/.test(labels[labels.length - 2]) ? 3 : 2;
  return labels.slice(-keep).join('.');
}

const DOMAIN = /^[a-z0-9.-]+\.[a-z]{2,}$/;
export function normalizeSenderRules(raw) {
  const clean = list => [...new Set((Array.isArray(list) ? list : [])
    .map(d => String(d || '').toLowerCase().trim()).filter(d => DOMAIN.test(d)))].slice(0, 500);
  const never = clean(raw?.never);
  const always = clean(raw?.always).filter(d => !never.includes(d));
  return { never, always };
}

/** 'never', 'always' or '' for the sender of `from`. */
export function senderRule(from, rules) {
  const domain = senderDomain(from);
  if (!domain || !rules) return '';
  if ((rules.never || []).includes(domain)) return 'never';
  if ((rules.always || []).includes(domain)) return 'always';
  return '';
}

/** A copy of `rules` with `domain` moved to `kind` ('never', 'always', or '' to forget it). */
export function withSenderRule(rules, domain, kind) {
  const d = String(domain || '').toLowerCase();
  const base = normalizeSenderRules(rules);
  const never = base.never.filter(x => x !== d);
  const always = base.always.filter(x => x !== d);
  if (DOMAIN.test(d) && kind === 'never') never.push(d);
  if (DOMAIN.test(d) && kind === 'always') always.push(d);
  return normalizeSenderRules({ never, always });
}

// Senders whose receipts were dismissed at least `min` times and never filed:
// the ones worth offering to stop reading. Newest-dismissed first.
export function senderSuggestions(drafts, rules, min = 3) {
  const counts = new Map();
  for (const draft of drafts || []) {
    const domain = senderDomain(draft.from);
    if (!domain) continue;
    const row = counts.get(domain) || { domain, dismissed: 0, filed: 0, name: draft.vendor || domain };
    if (draft.status === 'ignored') row.dismissed++;
    if (draft.status === 'imported' || draft.status === 'queued') row.filed++;
    counts.set(domain, row);
  }
  const known = new Set([...(rules?.never || []), ...(rules?.always || [])]);
  return [...counts.values()].filter(r => r.dismissed >= min && !r.filed && !known.has(r.domain));
}

// ── Sums that must add up ───────────────────────────────────────────────────
// Warnings, not blockers: each sends the receipt to "Needs you" until someone
// has looked at it, because the AI copies numbers and sometimes copies wrong.
// (Subtotal + tax + shipping against the total is a blocking problem in
// receiptProblems already.)
export function receiptWarnings(draft) {
  const warnings = [];
  const total = cents(draft.amount), subtotal = cents(draft.subtotal), tax = cents(draft.tax), shipping = cents(draft.shipping);
  const items = (draft.lineItems || []).map(item => cents(item.amount));
  if (items.length && items.every(v => v !== null)) {
    const sum = items.reduce((a, b) => a + b, 0);
    const target = subtotal !== null ? subtotal : (tax === null && shipping === null ? total : null);
    // Discounts are often a negative line; a mismatch bigger than a cent per
    // line is a misread, not rounding.
    if (target !== null && Math.abs(sum - target) > items.length) warnings.push('The line items do not add up to the subtotal');
  }
  const lines = (draft.taxLines || []).map(line => cents(line.amount));
  if (lines.length && lines.every(v => v !== null) && tax !== null) {
    if (Math.abs(lines.reduce((a, b) => a + b, 0) - tax) > lines.length) warnings.push('The tax lines do not add up to the tax');
  }
  // No Canadian sales tax is above 15 %. A higher share is almost always the
  // tax and subtotal read from different places.
  if (subtotal && tax !== null && tax > 0 && tax > subtotal * 0.2) warnings.push('The tax is more than 20% of the subtotal');
  if (total !== null && subtotal !== null && total > 0 && subtotal > total) warnings.push('The subtotal is larger than the total');
  return warnings;
}

// ── What the CRA needs for an input tax credit ──────────────────────────────
// The detail a receipt must show grows with its amount (GST/HST Memorandum
// 8.4): under $100 the supplier, date and total; from $100 the supplier's
// GST/HST number and the tax charged; from $500 also the buyer's name, the
// payment terms and a description. Only for Canadian-dollar receipts that
// charged tax — without tax there is no credit to claim.
// Each gap is {text, review}: `review` ones hold the receipt in "Needs you"
// until someone has looked; the rest are reminders shown with it.
export function craRecordGaps(draft) {
  if (draft.currency !== 'CAD') return [];
  const total = typeof draft.amount === 'number' && Number.isFinite(draft.amount) ? draft.amount : null;
  const taxed = (typeof draft.tax === 'number' && draft.tax > 0) || (draft.taxLines || []).some(l => l.amount > 0);
  if (total === null || total <= 0 || !taxed) return [];
  const gaps = [];
  if (total >= 100 && !/\d{9}/.test(String(draft.supplierTaxNumber || '').replace(/\s/g, ''))) {
    gaps.push({ text: 'No GST/HST number found. The CRA needs it to claim the tax back on $100 or more.', review: true });
  }
  if (total >= 500) {
    if (!(draft.lineItems || []).some(item => item.description) && !String(draft.description || '').trim()) {
      gaps.push({ text: 'No description of what was bought. The CRA needs one on $500 or more.', review: true });
    }
    gaps.push({ text: 'Check the receipt shows your name and the payment terms. The CRA needs both on $500 or more.', review: false });
  }
  return gaps;
}

// ── Spot checks and accuracy ────────────────────────────────────────────────
// About one in fifty receipts that would have gone straight to "Ready" is held
// for a look instead. The pick is fixed by the receipt's id, so it does not
// change between visits, and what is found there is the app's measured
// accuracy — no receipt service publishes its own.
export function isSpotCheck(id, rate = 0.02) {
  let hash = 2166136261;
  for (const ch of String(id || '')) { hash ^= ch.codePointAt(0); hash = Math.imul(hash, 16777619) >>> 0; }
  return hash % 10000 < Math.round(rate * 10000);
}

/** {checked, correct, percent} from spot-checked receipts someone has looked at. */
export function spotCheckAccuracy(drafts) {
  const looked = (drafts || []).filter(d => d.spotCheck && d.reviewed);
  const correct = looked.filter(d => !(d.editedFields || []).length).length;
  return { checked: looked.length, correct, percent: looked.length ? Math.round((correct / looked.length) * 100) : null };
}

// ── The same order in two emails ────────────────────────────────────────────
// A store's order confirmation and its receipt for the same order arrive as
// two emails and read as two receipts. Only the order number can say they are
// one: the same seller, amount and day without it is as likely two purchases.
export function sameOrderElsewhere(draft, drafts) {
  const ref = String(draft.reference || '').trim().toLowerCase();
  if (!ref || draft.notDuplicate) return null;
  const vendor = String(draft.vendor || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  return (drafts || []).find(other => other !== draft && other.messageId !== draft.messageId
    && other.status !== 'ignored'
    && String(other.reference || '').trim().toLowerCase() === ref
    && String(other.vendor || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '') === vendor
    // The one kept is the earlier email, or the one already filed.
    && (other.status === 'imported' || other.status === 'queued' || (other.updatedAt || 0) < (draft.updatedAt || 0)
      || ((other.updatedAt || 0) === (draft.updatedAt || 0) && String(other.id) < String(draft.id)))) || null;
}
