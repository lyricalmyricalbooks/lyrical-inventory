// Whether the words in an expense's description support the category it is
// filed under — judged only against the business's OWN past filing habits,
// never a category vocabulary this file invented.
//
// This deliberately stops short of being a classifier. It never decides what
// category a description "should" be — a description is free text, and a
// model guessing at its right home from outside knowledge is exactly the
// failure mode publisher-intel-tools.js's findAnomalies already refuses to be
// for this same ledger: "a language model guessing at which expenses look
// miscategorised is exactly the failure mode this design is trying to avoid
// in a financial ledger."
//
// What this checks instead is narrower and provable: "you have filed the
// word 'ink' under Printing & Production four separate times, and this once
// under Travel & Meals, where 'ink' has never appeared before" is a fact
// about THIS ledger, not a guess about what the word means. Every finding
// names the exact words behind it and how many times the business itself
// used them under each category, so it is checkable and wrong only if the
// count is wrong.

import { canonicalExpenseCategory } from './expense-categories.js';
import { roundCents } from './money.js';

const str = (v) => (v == null ? '' : String(v)).trim();
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Fewer than this many OTHER expenses using a word under a category, and one use proves nothing. */
const MIN_WORD_SUPPORT = 2;

/** The alternate category's count must clear the current category's by at least this much. */
const MIN_MARGIN = 2;

/** And clear this floor outright, so two barely-supported categories never trigger a finding. */
const MIN_ABSOLUTE_SUPPORT = 3;

/** Below this many described expenses in total, there isn't a pattern to check against yet. */
const MIN_LEDGER_SIZE = 15;

// Words too generic to say anything about which category an expense belongs
// in — every one of these turns up across every category in a small-press
// ledger and would otherwise manufacture false "patterns" out of nothing.
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'have', 'paid', 'cost',
  'costs', 'fee', 'fees', 'payment', 'payments', 'purchase', 'purchased',
  'expense', 'expenses', 'order', 'invoice', 'monthly', 'annual', 'annually',
  'receipt', 'charge', 'charged', 'bought', 'store', 'online', 'total',
  'item', 'items', 'misc', 'general', 'business', 'card', 'debit', 'credit',
]);

function tokens(desc) {
  return [...new Set(
    str(desc).toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 4 && !STOPWORDS.has(w) && !/^\d+$/.test(w))
  )];
}

/** A stable identity for an expense even on the rare row with no id of its own. */
function expenseKey(e) {
  return e.id != null && e.id !== '' ? `id:${e.id}` : `row:${e._scope}:${e._bookId}:${e.date}:${e.desc}`;
}

/** Every expense in scope, tagged with where it lives so a finding can point back at it. */
function allExpenses(ctx) {
  const out = [];
  for (const e of (ctx.taxCenter?.businessExpenses || [])) {
    if (e && !e.voided) out.push({ ...e, _scope: 'business', _bookId: null, _cat: canonicalExpenseCategory(e.cat, 'Other') });
  }
  for (const [bookId, state] of Object.entries(ctx.states || {})) {
    for (const e of (state?.expenses || [])) {
      if (e && !e.voided) out.push({ ...e, _scope: 'book', _bookId: bookId, _cat: canonicalExpenseCategory(e.cat, 'Other') });
    }
  }
  return out;
}

/**
 * Every meaningful word the business has ever filed, and which categories it
 * has landed under — counted by distinct expense rather than by appearance,
 * so one long description repeating a word can't outweigh five short ones
 * that each used it once.
 */
function wordCategoryIndex(expenses) {
  const index = new Map(); // word -> category -> Set(expenseKey)
  for (const e of expenses) {
    const key = expenseKey(e);
    for (const w of tokens(e.desc)) {
      let byCat = index.get(w);
      if (!byCat) { byCat = new Map(); index.set(w, byCat); }
      let ids = byCat.get(e._cat);
      if (!ids) { ids = new Set(); byCat.set(e._cat, ids); }
      ids.add(key);
    }
  }
  return index;
}

/**
 * Every expense whose own words point more strongly at a different category
 * than the one it is filed under, judged only against this business's own
 * history of filing those same words.
 *
 * @param {object} ctx  { books, states, taxCenter }
 */
export function findCategoryMismatches(ctx = {}) {
  const expenses = allExpenses(ctx).filter(e => str(e.desc));
  if (expenses.length < MIN_LEDGER_SIZE) return [];

  const index = wordCategoryIndex(expenses);
  const findings = [];

  for (const e of expenses) {
    const words = tokens(e.desc);
    if (!words.length) continue;
    const selfKey = expenseKey(e);

    // Support for every category these words have ever been filed under,
    // built from every OTHER expense — never this one, so a row can't stand
    // as evidence for itself.
    const support = new Map(); // category -> { count, words }
    for (const w of words) {
      const byCat = index.get(w);
      if (!byCat) continue;
      for (const [cat, ids] of byCat) {
        const othersCount = ids.has(selfKey) ? ids.size - 1 : ids.size;
        if (othersCount < MIN_WORD_SUPPORT) continue; // one prior use proves nothing
        const entry = support.get(cat) || { count: 0, words: [] };
        entry.count += othersCount;
        entry.words.push(w);
        support.set(cat, entry);
      }
    }

    const ownSupport = support.get(e._cat)?.count || 0;
    let best = null;
    for (const [cat, entry] of support) {
      if (cat === e._cat) continue;
      if (entry.count < MIN_ABSOLUTE_SUPPORT) continue;
      if (entry.count < ownSupport + MIN_MARGIN) continue;
      if (!best || entry.count > best.count) best = { cat, ...entry };
    }
    if (!best) continue;

    findings.push({
      id: `cat-mismatch:${e._scope}:${e._bookId || ''}:${selfKey}`,
      kind: 'category-mismatch',
      scope: e._scope, bookId: e._bookId, expenseId: e.id,
      currentCategory: e._cat, suggestedCategory: best.cat,
      title: `"${str(e.desc)}" looks like ${best.cat}`,
      detail: `You've filed ${best.words.map(w => `"${w}"`).join(' and ')} under ${best.cat} `
        + `${best.count} time${best.count === 1 ? '' : 's'} before, and only ${ownSupport} time${ownSupport === 1 ? '' : 's'} `
        + `under ${e._cat}, where this one is currently filed.`,
      amount: roundCents(num(e.baseAmount != null ? e.baseAmount : e.amount)),
      evidence: { matchedWords: best.words, ownSupport, suggestedSupport: best.count },
      prompt: `Move this to ${best.cat}?`,
    });
  }

  findings.sort((a, b) => b.evidence.suggestedSupport - a.evidence.suggestedSupport);
  return findings;
}
