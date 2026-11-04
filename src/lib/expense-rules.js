// Sorting rules: the owner's own "anything from Canva is Software" list.
//
// A rule is a word or shop name and the category it files under. It only ever
// pre-fills the category picker on a new expense (typed, scanned, or found in
// email): the picker stays editable, a category the owner chose by hand is
// never replaced, and expenses already in the ledger are never re-sorted.
//
// Order of say over a new expense's category, strongest first:
//   1. what the owner picks by hand
//   2. these rules
//   3. how this shop was filed before (vendorFilingHabit)
//   4. the AI reader's guess, then the built-in keyword list
//
// Rules live at the top of the Tax Centre document (`TAX_CENTER.expenseRules`)
// as rows with ids, so two devices that each add a rule both keep theirs when
// the document is merged (mergeMetadata merges id-keyed arrays row by row).

/** Fewest characters a rule may match on, so "a" can't file everything. */
export const RULE_MIN_LENGTH = 2;

/**
 * Lower case, accents dropped, anything that isn't a letter or digit turned
 * into a single space. "Canva.com" and "CANVA  com" both become "canva com".
 */
export function normalizeRuleText(value) {
  return String(value ?? '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** The rules list, with anything malformed dropped. Never throws. */
export function cleanExpenseRules(rules) {
  if (!Array.isArray(rules)) return [];
  return rules.filter(r => r && typeof r === 'object' && r.id != null
    && normalizeRuleText(r.match).length >= RULE_MIN_LENGTH
    && typeof r.cat === 'string' && r.cat.trim());
}

/**
 * Whether `rule` matches `text`. The rule's words must appear as whole words,
 * in order, so a rule for "post" fires on "Canada Post" but not on "PostNet",
 * and "ink" never fires inside "drinks".
 */
export function ruleMatches(rule, text) {
  const needle = normalizeRuleText(rule?.match);
  if (needle.length < RULE_MIN_LENGTH) return false;
  const hay = normalizeRuleText(text);
  if (!hay) return false;
  return ` ${hay} `.includes(` ${needle} `);
}

/**
 * The rule that files a new expense, or null.
 *
 * The shop name and the description are both searched. When several rules
 * match, the longest wins ("canada post" beats "post"), and on a tie the one
 * added first wins, so adding a rule never quietly changes how an older,
 * equally specific rule files things.
 *
 * @param {Array} rules  TAX_CENTER.expenseRules
 * @param {{vendor?: string, description?: string}} subject
 * @param {{allowed?: string[]|null}} [opts]  only categories this form offers;
 *   a rule pointing anywhere else is skipped rather than half-applied
 * @returns {{rule: object, category: string}|null}
 */
export function findExpenseRule(rules, subject, { allowed = null } = {}) {
  const text = [subject?.vendor, subject?.description].filter(Boolean).join(' \u0000 ');
  if (!normalizeRuleText(text)) return null;
  let best = null;
  let bestLen = 0;
  for (const rule of cleanExpenseRules(rules)) {
    const cat = rule.cat.trim();
    if (Array.isArray(allowed) && !allowed.includes(cat)) continue;
    // Search the shop and the description separately, so a rule's words can't
    // match by straddling the end of one and the start of the other.
    const hit = ruleMatches(rule, subject?.vendor) || ruleMatches(rule, subject?.description);
    if (!hit) continue;
    const len = normalizeRuleText(rule.match).length;
    if (len > bestLen) { best = { rule, category: cat }; bestLen = len; }
  }
  return best;
}

/**
 * Add a rule, or re-point an existing one with the same words.
 *
 * Returns `{ rules, rule, replaced }` with a new array (the input is not
 * changed), or `{ error }` with a plain-language reason when it can't be added.
 *
 * @param {Array} rules
 * @param {{match: string, cat: string}} input
 * @param {{id?: string, now?: string}} [opts]
 */
export function addExpenseRule(rules, input, { id, now } = {}) {
  const match = String(input?.match ?? '').trim().replace(/\s+/g, ' ');
  const cat = String(input?.cat ?? '').trim();
  if (normalizeRuleText(match).length < RULE_MIN_LENGTH) {
    return { error: 'Type a shop name or word with at least two letters.' };
  }
  if (!cat) return { error: 'Pick the category it should go under.' };

  const list = cleanExpenseRules(rules);
  const key = normalizeRuleText(match);
  const existing = list.find(r => normalizeRuleText(r.match) === key);
  if (existing) {
    const rule = { ...existing, match, cat, updatedAt: now || new Date().toISOString() };
    return { rules: list.map(r => (r === existing ? rule : r)), rule, replaced: existing.cat !== cat ? existing.cat : null };
  }
  const rule = {
    id: id || `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    match,
    cat,
    createdAt: now || new Date().toISOString(),
  };
  return { rules: [...list, rule], rule, replaced: null };
}

/** The rules list without the rule whose id is `id` (a new array). */
export function removeExpenseRule(rules, id) {
  return cleanExpenseRules(rules).filter(r => String(r.id) !== String(id));
}
