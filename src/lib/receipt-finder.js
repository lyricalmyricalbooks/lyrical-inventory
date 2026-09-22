// Pure receipt discovery and review rules. Missing evidence stays missing.
import { roundCents } from './money.js';

export const RECEIPT_QUERY = '(receipt OR invoice OR bill OR purchase OR payment OR shipping OR tax OR order)';
export const RECEIPT_STATUSES = ['all', 'ready', 'review', 'duplicate', 'queued', 'imported', 'ignored'];

export function receiptQuery({ query = '', after = '', before = '', sender = '', attachments = false, category = '' } = {}) {
  const quote = value => '"' + String(value).replace(/["\\\r\n]/g, ' ') + '"';
  const parts = [query.trim() || RECEIPT_QUERY, '-in:trash', '-in:spam'];
  if (after) parts.push('after:' + after.replaceAll('-', '/'));
  // Gmail's before operator is exclusive. The date picker is inclusive.
  if (before) {
    const date = new Date(before + 'T00:00:00Z');
    date.setUTCDate(date.getUTCDate() + 1);
    if (Number.isFinite(date.getTime())) parts.push('before:' + date.toISOString().slice(0, 10).replaceAll('-', '/'));
  }
  if (sender.trim()) parts.push('from:' + quote(sender.trim()));
  if (attachments) parts.push('has:attachment (filename:pdf OR filename:jpg OR filename:jpeg OR filename:png OR filename:webp)');
  if (category === 'invoices') parts.push('(invoice OR bill)');
  if (category === 'shipping') parts.push('(shipping OR postage OR courier OR freight OR label)');
  return parts.join(' ');
}

// A receipt always names an amount, in its text or in an attached PDF or photo.
// An email with neither — a shipping-status ping, a newsletter, a password
// reset that happens to say "order" — cannot be a receipt, so it is set aside
// without spending an AI read on it. Matches a currency mark or code beside a
// number, or a money word followed by a two-decimal figure.
//
// Every part is anchored on a single character or bounded in length. This runs
// on whatever text anyone mails the publisher, and an open-ended run such as
// `\d[\d,.]*` before the currency mark made one long line of digits cost the
// square of its length — 40,000 digits held the scan for seconds.
const AMOUNT_IN_TEXT = new RegExp([
  String.raw`(?:[$€£¥₹]|\b(?:CAD|USD|EUR|GBP|AUD|NZD|CHF|JPY|MXN|INR)\b)\s?-?\d`,
  // "12,50 $" is how French-Canadian receipts write it. Only the digit right
  // before the mark matters for a yes/no answer.
  String.raw`\d\s?(?:[$€£]|\b(?:CAD|USD|EUR|GBP|AUD|NZD|CHF|SEK|NOK|DKK)\b)`,
  String.raw`\b(?:total|subtotal|amount|paid|charged|balance|due)\b[^\n\d]{0,40}\d[\d,.]{0,15}[.,]\d{2}\b`,
].join('|'), 'i');

export function receiptWorthReading(email) {
  if ((email?.fileParts || []).length) return true;
  return AMOUNT_IN_TEXT.test(`${email?.subject || ''}\n${email?.body || ''}`);
}

export function receiptMoney(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) && Number.isSafeInteger(Math.round(value * 100)) ? roundCents(value) : null;
  // Both 1,234.56 and 1.234,56 occur in the same mailbox. Reject ambiguity.
  let text = String(value).trim().replace(/[\s\u00a0]/g, '').replace(/^(?:CA\$|US\$|MX\$|[$€£])/, '');
  if (/^-?\d{1,3}(,\d{3})+\.\d{1,2}$/.test(text)) text = text.replaceAll(',', '');
  else if (/^-?\d{1,3}(\.\d{3})+,\d{1,2}$/.test(text)) text = text.replaceAll('.', '').replace(',', '.');
  else if (/^-?\d+,\d{1,2}$/.test(text)) text = text.replace(',', '.');
  if (!/^-?\d+(\.\d{1,2})?$/.test(text)) return null;
  const valueNumber = Number(text);
  return Number.isSafeInteger(Math.round(valueNumber * 100)) ? roundCents(valueNumber) : null;
}

export function receiptDate(value) {
  const text = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
  const date = new Date(text + 'T12:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text ? text : '';
}

export function normalizeFoundReceipt(raw, source, index = 0) {
  const confidence = typeof raw.confidence === 'number' && Number.isFinite(raw.confidence)
    ? Math.max(0, Math.min(1, raw.confidence)) : 0;
  return {
    id: `${source.account}:${source.id}:${index}`, messageId: source.id, account: source.account,
    vendor: String(raw.vendor || '').slice(0, 250), description: String(raw.description || '').slice(0, 1000),
    reference: String(raw.reference || '').slice(0, 200), date: receiptDate(raw.date), dueDate: receiptDate(raw.dueDate),
    currency: /^[A-Z]{3}$/.test(String(raw.currency || '').toUpperCase()) ? String(raw.currency).toUpperCase() : '',
    amount: receiptMoney(raw.amount), subtotal: receiptMoney(raw.subtotal), tax: receiptMoney(raw.tax), shipping: receiptMoney(raw.shipping),
    category: String(raw.category || 'Other'), confidence,
    paymentStatus: ['paid', 'unpaid', 'unknown', 'refunded'].includes(raw.paymentStatus) ? raw.paymentStatus : 'unknown',
    documentType: String(raw.documentType || 'unknown'), sourceSnippet: String(raw.sourceSnippet || '').slice(0, 500),
    lineItems: (Array.isArray(raw.lineItems) ? raw.lineItems : []).slice(0, 100).map(item => ({
      description: String(item.description || '').slice(0, 500),
      quantity: typeof item.quantity === 'number' && Number.isFinite(item.quantity) ? item.quantity : null,
      unitPrice: receiptMoney(item.unitPrice), amount: receiptMoney(item.amount),
    })),
    attachmentIds: (source.fileParts || []).map(file => file.attachmentId || file.partId),
    attachments: (source.fileParts || []).map(file => ({ name: file.name || '', mime: file.mime || '', attachmentId: file.attachmentId || file.partId || '' })),
    reviewed: false, selected: confidence >= 0.85, status: 'draft', error: '', updatedAt: Date.now(),
  };
}

export function receiptProblems(draft) {
  const problems = [];
  if (!draft.vendor?.trim()) problems.push('Vendor is missing');
  if (!receiptDate(draft.date)) problems.push('Invoice date is missing or invalid');
  if (!/^[A-Z]{3}$/.test(draft.currency || '')) problems.push('Choose the currency');
  if (receiptMoney(draft.amount) === null || draft.amount === 0) problems.push('Enter the total');
  if (draft.dueDate && !receiptDate(draft.dueDate)) problems.push('Due date is invalid');
  if ([draft.subtotal, draft.tax, draft.shipping].every(v => typeof v === 'number' && Number.isFinite(v)) && draft.amount !== null) {
    const expected = Math.round(draft.subtotal * 100) + Math.round(draft.tax * 100) + Math.round(draft.shipping * 100);
    if (Math.abs(expected - Math.round(draft.amount * 100)) > 1) problems.push('Subtotal, tax and shipping do not match the total');
  }
  return problems;
}

const normalizedVendor = value => String(value || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

export function receiptDuplicate(draft, expenses) {
  return expenses.find(expense => {
    if (expense.receiptImportId === draft.id) return true;
    const sameAccount = !expense.emailAccount || expense.emailAccount === draft.account;
    const sameMessage = sameAccount && expense.emailMsgId === draft.messageId;
    // A message can contain several invoices. Never dedupe solely by message.
    const reference = String(expense.ref || expense.reference || '').trim().toLowerCase();
    const sameReference = draft.reference && reference === draft.reference.trim().toLowerCase();
    if (draft.reference && reference && reference !== 'email-import' && !sameReference) return false;
    const sameVendor = normalizedVendor(draft.vendor) && normalizedVendor(expense.vendor) === normalizedVendor(draft.vendor);
    const sameMoney = receiptMoney(expense.amount) !== null && receiptMoney(expense.amount) === receiptMoney(draft.amount)
      && expense.currency === draft.currency;
    const attachmentOverlap = sameMessage && (expense.emailAttachmentIds || []).some(id => draft.attachmentIds.includes(id));
    return (sameReference && (sameVendor || sameMessage))
      || (sameMoney && draft.date && expense.date === draft.date && (sameVendor || sameMessage || attachmentOverlap));
  }) || null;
}

export function receiptReviewStatus(draft, expenses = []) {
  if (['imported', 'queued', 'ignored'].includes(draft.status)) return draft.status;
  if (receiptDuplicate(draft, expenses)) return 'duplicate';
  if (receiptProblems(draft).length || (!draft.reviewed && draft.confidence < 0.85)) return 'review';
  return 'ready';
}

export function receiptExpense(draft, rate, receiptFiles = []) {
  if (receiptProblems(draft).length) throw new Error(receiptProblems(draft).join('. '));
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('A currency conversion rate is required');
  return {
    id: draft.id, receiptImportId: draft.id, desc: draft.description || draft.vendor, vendor: draft.vendor,
    cat: draft.category, date: draft.date, ref: draft.reference, currency: draft.currency,
    amount: draft.amount, origCurrency: draft.currency, origAmount: draft.amount,
    fxRate: rate, baseAmount: roundCents(draft.amount * rate),
    invoiceDate: draft.date, dueDate: draft.dueDate, subtotal: draft.subtotal, tax: draft.tax, shipping: draft.shipping,
    lineItems: draft.lineItems, paymentStatus: draft.paymentStatus, documentType: draft.documentType,
    emailMsgId: draft.messageId, emailAccount: draft.account, emailAttachmentIds: draft.attachmentIds,
    emailAttachments: (draft.attachments || []).map((file, index) => ({ ...file, downloadUrl: receiptFiles[index + 1] || '' })),
    emailUrl: `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(draft.account)}#all/${encodeURIComponent(draft.messageId)}`,
    receipt: receiptFiles[0] || '', receiptFiles, sourceSnippet: draft.sourceSnippet,
    importedFromEmail: true, importedAt: new Date().toISOString(),
  };
}

// Concurrent tabs must not replace each other's outbox. Imported state is
// monotonic, and otherwise only an actually edited draft gets a new timestamp.
//
// A key merely missing from `incoming` may be one another tab added, so absence
// never removes anything — which also meant a cleared failure or a dropped
// email copy quietly came back from storage on the next save. Removals are
// therefore named explicitly in `incoming.removed`, applied before the incoming
// entries so a key removed and then re-read in the same save keeps its new
// value. A finished read is never un-done by a removal.
export function mergeFinderSnapshot(previous, incoming) {
  const { removed, ...next } = incoming;
  if (!previous) return next;
  const drafts = new Map((previous.drafts || []).map(row => [row.id, row]));
  for (const row of next.drafts || []) {
    const old = drafts.get(row.id);
    if (!old || row.status === 'imported' || (old.status !== 'imported' && (row.updatedAt || 0) >= (old.updatedAt || 0))) drafts.set(row.id, row);
  }
  const emails = { ...previous.emails };
  for (const key of removed?.emails || []) delete emails[key];
  for (const [key, email] of Object.entries(next.emails || {})) {
    emails[key] = { ...email, savedFiles: { ...emails[key]?.savedFiles, ...email.savedFiles } };
  }
  const scans = { ...previous.scans };
  for (const key of removed?.scans || []) if (!scans[key]?.done) delete scans[key];
  for (const [key, scan] of Object.entries(next.scans || {})) {
    if (!scans[key]?.done || scan.done) scans[key] = scan;
  }
  return { ...previous, ...next, drafts: [...drafts.values()], emails, scans };
}
