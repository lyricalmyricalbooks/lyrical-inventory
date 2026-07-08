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

// Round a currency amount to whole cents, killing binary floating-point drift
// (e.g. 0.1 + 0.2 = 0.30000000000000004). Use this around any running total of
// money so accumulated error can't grow as the number of transactions grows.
export const roundCents = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

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

// The CAD value to record on a Sheets row for a sale, mirroring how the app
// captures revenue at the moment of sale (a frozen figure that must not drift
// as FX rates move later):
//   • book sells in CAD             → the native total IS the CAD value
//   • non-CAD book, paid in CAD     → the CAD cash collected is the value
//   • anything else                 → '' (blank); the Sheets backend fills it
//     from the stored converted total or a live FX lookup.
// Returns a Number, or '' when the CAD value can't be determined client-side.
export function cadEquivalentForSale({ nativeCurrency, totalNative, payment } = {}) {
  const native = normalizeCurrencyCode(nativeCurrency, 'CAD');
  const total = Number(totalNative) || 0;
  if (native === 'CAD') return total;
  if (payment && normalizeCurrencyCode(payment.currency, '') === 'CAD' && Number(payment.amount)) {
    return Number(payment.amount);
  }
  return '';
}

// The label stored on a sale when the artist collected the payment directly
// (rather than it flowing to the publisher). Kept as a single source of truth
// so detection doesn't rely on string literals scattered across the codebase.
export const PAYMENT_TYPE_DIRECT_TO_ARTIST = 'Payment directly to artist';

// True when a sale entry/payload represents cash the artist collected directly
// and still owes the publisher their cut. Prefers the structured `directToArtist`
// flag; falls back to the legacy paymentType / payment.type / notes text so
// records created before the flag existed are still recognised.
export function isDirectToArtistSale(entry) {
  if (!entry) return false;
  if (entry.directToArtist === true) return true;
  if (entry.paymentType === PAYMENT_TYPE_DIRECT_TO_ARTIST) return true;
  if (entry.payment && entry.payment.type === PAYMENT_TYPE_DIRECT_TO_ARTIST) return true;
  return (entry.notes || '').includes(PAYMENT_TYPE_DIRECT_TO_ARTIST);
}

export function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function getContrastColor(hex) {
  if (!hex) return 'var(--ink)';
  const color = hex.charAt(0) === '#' ? hex.substring(1) : hex;
  if (color.length !== 6) return 'var(--ink)';
  const r = parseInt(color.substring(0, 2), 16);
  const g = parseInt(color.substring(2, 4), 16);
  const b = parseInt(color.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? 'var(--ink)' : '#ffffff';
}

