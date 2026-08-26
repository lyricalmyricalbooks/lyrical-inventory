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
  // Mexican peso. Mexico writes the peso as a bare "$", which collides with the
  // Canadian default above, so only the disambiguated forms map here — a bare
  // "$" on a Mexican receipt still needs the code typed explicitly.
  'MX$': 'MXN',
  'MEX$': 'MXN',
  '$MXN': 'MXN',
};

export const CODE_TO_SYMBOL = {
  EUR: '€',
  CAD: 'CA$',
  USD: 'US$',
  GBP: '£',
  JPY: '¥',
  CHF: 'CHF',
  AUD: 'A$',
  MXN: 'MX$',
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
  if (upper === 'MX$' || upper === 'MEX$' || upper === '$MXN') return 'MXN';
  if (upper === '€' || upper === 'EUR') return 'EUR';
  return /^[A-Z]{3}$/.test(upper) ? upper : fallback;
}

export const fmt = (n, cur = '€') =>
  getSym(cur) + Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export const fmtWhole = (n, cur = '€') => {
  const num = Math.round(Number(n) || 0);
  const formatted = Math.abs(num).toLocaleString('en-US');
  const sym = getSym(cur);
  return num < 0 ? `-${sym}${formatted}` : `${sym}${formatted}`;
};

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

// The currency an entry's own amounts (price, convertedTotal, amountDue…) are
// denominated in. Prefers the `cur` stamp written at entry time; falls back to
// the book's current currency for legacy rows recorded before stamping existed.
// That fallback is precisely what breaks when a book's currency is edited, so
// anything relying on it should be restated via lib/currency-migration.js.
export function entryNativeCode(entry, book) {
  if (entry && entry.cur) return normalizeCurrencyCode(entry.cur, 'CAD');
  return getBookCurrencyCode(book);
}

// `payment.convertedTotal` is denominated in the entry's OWN native currency —
// frozen at the moment of sale — not in whatever the book's currency says
// today. Reading it against the book's current currency is what turns a €32
// sale into the nonsense line "Paid EUR 32.00 → CA$32.00" after a currency
// change, so resolve the symbol from the entry's stamp when it has one.
export function paymentSummary(payment, book, entry = null) {
  if (!payment || !payment.currency) return '';
  const native = entryNativeCode(entry, book);
  const amount = Number(payment.amount || 0);
  const converted = Number(payment.convertedTotal || 0);
  if (normalizeCurrencyCode(payment.currency, '') === native) {
    return `Paid ${payment.currency} ${fmtNum(amount)}`;
  }
  // Rates arrive from FX APIs at full float precision; 4dp is the most anyone
  // quotes and keeps the note from running to 16 digits.
  const ratePart = payment.rate ? ` @ ${Number(payment.rate).toFixed(4)}` : '';
  return `Paid ${payment.currency} ${fmtNum(amount)}${ratePart} → ${fmt(converted, native)}`;
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

export function lightenColor(hex, percent) {
  if (!hex) return 'var(--gold3)';
  const color = hex.charAt(0) === '#' ? hex.substring(1) : hex;
  if (color.length !== 6) return 'var(--gold3)';
  let r = parseInt(color.substring(0, 2), 16);
  let g = parseInt(color.substring(2, 4), 16);
  let b = parseInt(color.substring(4, 6), 16);

  r = Math.min(255, Math.floor(r + (255 - r) * percent));
  g = Math.min(255, Math.floor(g + (255 - g) * percent));
  b = Math.min(255, Math.floor(b + (255 - b) * percent));

  const rHex = r.toString(16).padStart(2, '0');
  const gHex = g.toString(16).padStart(2, '0');
  const bHex = b.toString(16).padStart(2, '0');
  return `#${rHex}${gHex}${bHex}`;
}

export function darkenColor(hex, percent) {
  if (!hex) return 'var(--ink)';
  const color = hex.charAt(0) === '#' ? hex.substring(1) : hex;
  if (color.length !== 6) return 'var(--ink)';
  let r = parseInt(color.substring(0, 2), 16);
  let g = parseInt(color.substring(2, 4), 16);
  let b = parseInt(color.substring(4, 6), 16);

  r = Math.max(0, Math.floor(r * (1 - percent)));
  g = Math.max(0, Math.floor(g * (1 - percent)));
  b = Math.max(0, Math.floor(b * (1 - percent)));

  const rHex = r.toString(16).padStart(2, '0');
  const gHex = g.toString(16).padStart(2, '0');
  const bHex = b.toString(16).padStart(2, '0');
  return `#${rHex}${gHex}${bHex}`;
}

/**
 * A book's accent colour, adjusted so it stays readable as TEXT on the app's
 * page/card surface.
 *
 * `onDark` is which surface it will sit on, and it inverts the whole rule.
 * The light-mode job is "a pale accent would wash out, so darken it"; the
 * dark-mode job is the exact opposite — a deep navy or maroon cover accent
 * disappears against a near-black card and has to be LIGHTENED instead.
 * Getting this wrong is silent: the text renders, it just cannot be read.
 *
 * Callers pass the resolved theme (see --book-accent-text in src/main.js),
 * and must recompute when the theme changes — the value is baked into a custom
 * property, so it does not follow the cascade on its own.
 */
export function getContrastSafeText(hex, onDark = false) {
  if (!hex) return onDark ? 'var(--on-inverse)' : 'var(--ink)';
  const color = hex.charAt(0) === '#' ? hex.substring(1) : hex;
  if (color.length !== 6) return onDark ? 'var(--on-inverse)' : 'var(--ink)';
  const r = parseInt(color.substring(0, 2), 16);
  const g = parseInt(color.substring(2, 4), 16);
  const b = parseInt(color.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  if (onDark) {
    // Lift anything that isn't already bright enough to read on charcoal. The
    // threshold is higher than the light-mode one because mid-tones fail
    // against near-black long before they fail against cream.
    return luminance < 0.62 ? lightenColor(hex, 0.55) : hex;
  }
  if (luminance > 0.5) {
    return darkenColor(hex, 0.35);
  }
  return hex;
}


