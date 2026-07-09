import { parseCurrencyAmount } from './money.js';

export function normalizeBigCartelReceiptText(body) {
  return String(body || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>|<\/div>|<\/tr>|<\/li>|<\/h[1-6]>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

function moneyPattern() {
  return '(?:[A-Z]{1,3}\\s*\\$|\\$|[A-Z]{3})?\\s*-?[0-9][0-9,]*(?:\\.[0-9]+)?';
}

export function extractBigCartelLabeledMoney(body, labels) {
  const text = normalizeBigCartelReceiptText(body);
  const money = moneyPattern();
  for (const label of labels) {
    const escaped = String(label).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    const sameLine = new RegExp('(?:^|\\n)\\s*' + escaped + '\\s*(?:[:\\-–—])?\\s*(' + money + ')(?=\\s*(?:\\n|$))', 'i');
    const sameLineMatch = text.match(sameLine);
    if (sameLineMatch) return parseCurrencyAmount(sameLineMatch[1]);

    const nextLine = new RegExp('(?:^|\\n)\\s*' + escaped + '\\s*(?:\\n|$)(?:.*\\n){0,2}?\\s*(' + money + ')(?=\\s*(?:\\n|$))', 'i');
    const nextLineMatch = text.match(nextLine);
    if (nextLineMatch) return parseCurrencyAmount(nextLineMatch[1]);
  }
  return 0;
}

export function extractBigCartelShippingPaidFromText(body, subtotal) {
  const explicit = extractBigCartelLabeledMoney(body, [
    'Shipping', 'Shipping and handling', 'Shipping & handling', 'Shipping paid',
    'Postage', 'Delivery', 'Delivery charge'
  ]);
  if (explicit) return explicit;

  const total = extractBigCartelLabeledMoney(body, ['Total', 'Order total', 'Total paid', 'Amount paid']);
  if (!total) return 0;
  const tax = extractBigCartelLabeledMoney(body, ['Tax', 'Taxes', 'Sales tax']) || 0;
  const shipping = Math.round((total - (Number(subtotal) || 0) - tax) * 100) / 100;
  return shipping > 0 ? shipping : 0;
}
