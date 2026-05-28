// Pure helpers for currency formatting and payment math.
// Kept dependency-free so they can be imported anywhere and unit-tested
// without a DOM or Firestore stub.

export const CURRENCY_SYMBOL_TO_CODE = {
  '€': 'EUR',
  '$': 'CAD',
  'CA$': 'CAD',
  'US$': 'USD',
  '£': 'GBP',
  '¥': 'JPY',
  CHF: 'CHF',
};

export const CODE_TO_SYMBOL = {
  EUR: '€',
  CAD: 'CA$',
  USD: 'US$',
  GBP: '£',
  JPY: '¥',
  CHF: 'CHF',
  AUD: 'A$',
};

export const getSym = (c) => CODE_TO_SYMBOL[c] || c;

export function normalizeCurrencyCode(cur, fallback = 'CAD') {
  const raw = String(cur || '').trim();
  if (!raw) return fallback;
  const upper = raw.toUpperCase();
  if (CODE_TO_SYMBOL[upper]) return upper;
  if (CURRENCY_SYMBOL_TO_CODE[raw]) return CURRENCY_SYMBOL_TO_CODE[raw];
  if (upper === 'CA$' || upper === 'C$') return 'CAD';
  if (upper === 'US$') return 'USD';
  if (upper === '€' || upper === 'EUR') return 'EUR';
  return /^[A-Z]{3}$/.test(upper) ? upper : fallback;
}

export const fmt = (n, cur = '€') =>
  getSym(cur) + Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export const fmtNum = (n) => Number(n).toFixed(2);

export const fmtD = (d) => {
  if (!d || d === '—' || d === 'Invalid Date') return '—';
  let dt = new Date(d);
  if (isNaN(dt.getTime()) || (typeof d === 'string' && d.length === 10 && d.includes('-'))) {
    const noon = new Date(d + 'T12:00:00');
    if (!isNaN(noon.getTime())) dt = noon;
  }
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

export function getBookCurrencyCode(book) {
  const c = (book && book.currency) || 'EUR';
  return CURRENCY_SYMBOL_TO_CODE[c] || (String(c).length === 3 ? c : 'EUR');
}

export function paymentSummary(payment, book) {
  if (!payment || !payment.currency) return '';
  const native = getBookCurrencyCode(book);
  const amount = Number(payment.amount || 0);
  const converted = Number(payment.convertedTotal || 0);
  if (payment.currency === native) return `Paid ${payment.currency} ${fmtNum(amount)}`;
  const ratePart = payment.rate ? ` @ ${payment.rate}` : '';
  return `Paid ${payment.currency} ${fmtNum(amount)}${ratePart} → ${fmt(converted, book && book.currency)}`;
}

export function buildPaymentMeta({ book, qty, unitPrice, fxEnabled, fxCur, fxAmt, fxRate }) {
  const total = (Number(qty) || 0) * (Number(unitPrice) || 0);
  if (fxEnabled) {
    return {
      currency: fxCur || 'EUR',
      amount: Number(fxAmt) || 0,
      rate: (Number(fxRate) || 0) > 0 ? Number(fxRate) : null,
      convertedTotal: total,
    };
  }
  return {
    currency: getBookCurrencyCode(book),
    amount: total,
    rate: null,
    convertedTotal: total,
  };
}

export function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
