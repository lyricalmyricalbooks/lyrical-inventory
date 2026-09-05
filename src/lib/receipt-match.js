// Matching a loose receipt file to the expense it belongs to.
//
// The problem this solves is a real folder: fifty-odd PDFs sitting flat in
// "General receipts", named by whatever produced them —
//
//   2026-04-20_36.LyricalmyricalBooksInvoice...pdf   (date, and a clue)
//   2026-07-30_Uber_CAD-13.93.pdf                    (date, vendor and amount)
//   Ordine_17190_lyricalmyrical_books.pdf            (an Italian printer's order no.)
//   receipt_c917c7a6-2807-4b95-b96b-b8035....pdf     (a bare UUID — nothing)
//   invoice amazon.pdf                               (a vendor, no date)
//
// Each one needs a date, a vendor, an amount and a category before it can be
// filed. Some of that is recoverable from the filename; the rest needs the file
// to be read. So this module scores what the *name* can tell us and says how
// confident it is, and the caller sends anything weak to OCR rather than
// guessing. Confidence is the whole point: filing a tax record under the wrong
// year is worse than leaving it unfiled and asking.
//
// Pure and dependency-free so the scoring can be tested against the real corpus
// above rather than against invented names.

/** Below this, don't trust the filename — read the file instead. */
export const CONFIDENCE_THRESHOLD = 0.6;

// NOTE ON WORD BOUNDARIES
// `\b` is wrong for these names and was a live bug: underscore is a word
// character, so `\b` does not match between `_` and `C` — which meant
// "2026-07-30_Uber_CAD-13.93.pdf" never yielded its amount, and every Uber
// receipt scored as unmatched. Filenames here are separated by `_`, `-` and `.`
// as often as by spaces, so the boundaries below are spelled out explicitly.
const NOT_ALNUM = '(?:^|[^A-Za-z0-9])';

/** A date anywhere in a filename, in the orders people actually write them. */
const DATE_PATTERNS = [
  // 2026-04-20 / 2026_04_20 / 2026.04.20
  { re: /(20\d{2})[-_.]?(\d{2})[-_.]?(\d{2})/, order: 'ymd' },
  // 20-04-2026 / 11.05.2026 — day first, as European invoices tend to be
  { re: new RegExp(`${NOT_ALNUM}(\\d{2})[-_.](\\d{2})[-_.](20\\d{2})(?!\\d)`), order: 'dmy' },
];

/** Extract an ISO date from a filename, or '' when there isn't a credible one. */
export function dateFromName(name) {
  const s = String(name || '');
  for (const { re, order } of DATE_PATTERNS) {
    const m = s.match(re);
    if (!m) continue;
    const [y, mo, d] = order === 'ymd'
      ? [m[1], m[2], m[3]]
      : [m[3], m[2], m[1]];
    const month = Number(mo);
    const day = Number(d);
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    const iso = `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    // Reject dates a receipt cannot plausibly carry — a UUID full of digits can
    // otherwise produce something that parses but means nothing.
    const t = new Date(`${iso}T00:00:00Z`);
    if (isNaN(t.getTime())) continue;
    return iso;
  }
  return '';
}

/**
 * Extract a money amount from a filename.
 *
 * Anchored to a currency marker, because a bare number in a filename is far
 * more often an order number than a price. `Uber_CAD-13.93` and `USD 24.99` and
 * `EUR-220,00` all count; `Ordine_17190` deliberately does not.
 */
const CURRENCY_CODES = /^(CAD|USD|EUR|GBP|MXN|AUD|CHF|JPY)$/;

export function amountFromName(name) {
  const s = String(name || '');

  // Scan every currency-code-shaped run rather than only the first: a name like
  // "Invoice-FKJTGVYE-0001" contains uppercase triples that are not currencies,
  // and stopping at the first one would miss a real "CAD-13.93" later on.
  const re = new RegExp(`${NOT_ALNUM}([A-Z]{3})[\\s_-]*\\$?\\s*(\\d{1,7})(?:[.,](\\d{2}))?(?!\\d)`, 'g');
  let m;
  while ((m = re.exec(s)) !== null) {
    if (CURRENCY_CODES.test(m[1])) {
      return { amount: Number(`${m[2]}.${m[3] || '00'}`), currency: m[1] };
    }
  }

  const dollar = s.match(/\$\s*(\d{1,7})(?:[.,](\d{2}))?/);
  if (dollar) return { amount: Number(`${dollar[1]}.${dollar[2] || '00'}`), currency: '' };
  return null;
}

/** Words worth comparing — long enough to mean something. */
export function tokens(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(w => w.length >= 3 && !/^\d+$/.test(w));
}

/** Bare hex/UUID noise carries no signal and should never score a match. */
const NOISE = /^[0-9a-f]{6,}$/i;

/**
 * How much two pieces of text look like the same vendor, 0..1.
 * Jaccard over meaningful tokens, ignoring hex noise.
 */
export function textSimilarity(a, b) {
  const A = new Set(tokens(a).filter(t => !NOISE.test(t)));
  const B = new Set(tokens(b).filter(t => !NOISE.test(t)));
  if (!A.size || !B.size) return 0;
  let shared = 0;
  A.forEach(t => { if (B.has(t)) shared++; });
  return shared / Math.min(A.size, B.size);
}

/** Whole days between two ISO dates, or null when either is unusable. */
function dayGap(isoA, isoB) {
  if (!isoA || !isoB) return null;
  const a = new Date(`${String(isoA).slice(0, 10)}T00:00:00Z`).getTime();
  const b = new Date(`${String(isoB).slice(0, 10)}T00:00:00Z`).getTime();
  if (isNaN(a) || isNaN(b)) return null;
  return Math.abs(Math.round((a - b) / 86400000));
}

/**
 * Score one file against one expense, 0..1, with the reasons.
 *
 * Amount is weighted highest because it is the least ambiguous signal — two
 * expenses on the same day from the same vendor for different amounts are
 * genuinely different receipts, and the amount is what tells them apart.
 *
 * `precomputed` lets `bestMatch()` derive the file's date and amount once per
 * file instead of once per (file × expense) pair — both only depend on
 * `fileInfo`, and `amountFromName` compiles a fresh regex on every call, so
 * scoring against N expenses was redoing the same filename parse N times.
 */
export function scoreMatch(fileInfo, expense, precomputed = {}) {
  const reasons = [];
  let score = 0;

  const fileDate = precomputed.fileDate ?? (fileInfo.date || dateFromName(fileInfo.name));
  const gap = dayGap(fileDate, expense.date);
  if (gap !== null) {
    if (gap === 0) { score += 0.35; reasons.push('same date'); }
    else if (gap <= 2) { score += 0.25; reasons.push(`within ${gap} day${gap === 1 ? '' : 's'}`); }
    else if (gap <= 7) { score += 0.10; reasons.push('same week'); }
  }

  const money = precomputed.money !== undefined
    ? precomputed.money
    : (fileInfo.amount != null
      ? { amount: fileInfo.amount, currency: fileInfo.currency || '' }
      : amountFromName(fileInfo.name));
  if (money) {
    const expAmount = Number(expense.origAmount ?? expense.amount);
    if (Number.isFinite(expAmount) && Math.abs(expAmount - money.amount) < 0.01) {
      score += 0.45;
      reasons.push('amount matches');
    }
  }

  const vendorText = fileInfo.vendor || fileInfo.name;
  const sim = textSimilarity(vendorText, expense.desc);
  if (sim >= 0.5) { score += 0.30; reasons.push('vendor matches'); }
  else if (sim > 0) { score += 0.15 * sim; reasons.push('vendor is similar'); }

  return { score: Math.min(1, score), reasons };
}

/**
 * Best expense for a file, if any is good enough.
 *
 * Returns the winner plus the runner-up gap, because a file that matches two
 * expenses almost equally well is ambiguous — filing it against either is a
 * coin flip, and the review table should say so rather than pick.
 */
export function bestMatch(fileInfo, expenses, threshold = CONFIDENCE_THRESHOLD) {
  // Parse the filename once for the whole expense list, not once per expense
  // scored (see the note on scoreMatch's `precomputed` param).
  const precomputed = {
    fileDate: fileInfo.date || dateFromName(fileInfo.name),
    money: fileInfo.amount != null
      ? { amount: fileInfo.amount, currency: fileInfo.currency || '' }
      : amountFromName(fileInfo.name),
  };
  const scored = (expenses || [])
    .map(exp => ({ exp, ...scoreMatch(fileInfo, exp, precomputed) }))
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return { match: null, score: 0, reasons: [], confident: false, ambiguous: false };

  const top = scored[0];
  const runnerUp = scored[1];
  const ambiguous = !!runnerUp && top.score > 0 && (top.score - runnerUp.score) < 0.1;

  return {
    match: top.score > 0 ? top.exp : null,
    score: top.score,
    reasons: top.reasons,
    confident: top.score >= threshold && !ambiguous,
    ambiguous,
  };
}

/**
 * Guess a category from a filename using the app's keyword map.
 *
 * `keywordMap` is the existing `TAX_CATEGORIES` object in main.js — keyword to
 * category — so the organizer classifies exactly the way the expense form's
 * auto-categoriser already does, and the two cannot drift.
 */
export function categoryFromName(name, keywordMap) {
  const hay = String(name || '').toLowerCase();
  let best = '';
  let bestLen = 0;
  Object.keys(keywordMap || {}).forEach(keyword => {
    // Longest keyword wins: "post office" should beat "post".
    if (hay.includes(keyword) && keyword.length > bestLen) {
      best = keywordMap[keyword];
      bestLen = keyword.length;
    }
  });
  return best;
}

/**
 * Match a file to an expense by a carrier reference carried in both.
 *
 * A shipping label this app produced writes its tracking PIN into the filename,
 * and the expense the app logged for it stores the same PIN. That is an identity,
 * not a resemblance — so it beats every score, and reading the file with the AI
 * would only re-derive an amount and date the ledger already holds exactly.
 *
 * Returns the matching expense, or null when the filename carries no known reference.
 */
export function exactReferenceMatch(fileInfo, expenses) {
  const hay = String(fileInfo?.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!hay) return null;

  return (expenses || []).find(exp => {
    const pin = String(exp?.trackingPin || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (pin && pin.length >= 8 && hay.includes(pin)) return true;
    const ref = String(exp?.ref || '').toLowerCase().split(':').pop().replace(/[^a-z0-9]/g, '');
    return !!(ref && ref.length >= 8 && hay.includes(ref));
  }) || null;
}

/**
 * Plan what happens to one file: where it goes, and whether a human should look.
 *
 * `needsReview` is the contract with the caller — anything true here must be
 * shown before it is acted on. Nothing is ever filed silently on a guess.
 */
export function planFile(fileInfo, expenses, keywordMap, threshold = CONFIDENCE_THRESHOLD) {
  // An app-generated label already knows exactly which expense it belongs to,
  // so it is filed on that identity and never sent to OCR.
  const exact = exactReferenceMatch(fileInfo, expenses);
  if (exact) {
    return {
      file: fileInfo.name,
      match: exact,
      matched: true,
      score: 1,
      reasons: ['tracking reference in filename'],
      ambiguous: false,
      meta: {
        date: exact.date || '',
        desc: exact.desc || '',
        vendor: exact.vendor || fileInfo.vendor || '',
        cat: exact.cat || exact.category || '',
        amount: exact.origAmount ?? exact.amount,
        currency: exact.origCurrency || exact.currency || '',
      },
      needsReview: !(exact.cat || exact.category) || !exact.date,
      needsOcr: false,
      exactRef: true,
    };
  }

  const result = bestMatch(fileInfo, expenses, threshold);
  const fileDate = fileInfo.date || dateFromName(fileInfo.name);
  const money = fileInfo.amount != null
    ? { amount: fileInfo.amount, currency: fileInfo.currency || '' }
    : amountFromName(fileInfo.name);

  const exp = result.confident ? result.match : null;
  const category = exp?.cat || fileInfo.cat || categoryFromName(fileInfo.name, keywordMap) || '';

  return {
    file: fileInfo.name,
    match: result.match,
    matched: !!exp,
    score: result.score,
    reasons: result.reasons,
    ambiguous: result.ambiguous,
    // Everything the namer needs, whether it came from the ledger or the file.
    meta: {
      date: exp?.date || fileDate || '',
      desc: exp?.desc || fileInfo.vendor || '',
      vendor: fileInfo.vendor || '',
      cat: category,
      amount: exp ? (exp.origAmount ?? exp.amount) : money?.amount,
      currency: exp ? (exp.origCurrency || exp.currency) : (money?.currency || ''),
    },
    needsReview: !exp || !category || !(exp?.date || fileDate),
    needsOcr: !exp && (!fileDate || !money),
  };
}
