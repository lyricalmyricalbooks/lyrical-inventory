// Canonical tax-category naming for the expense ledger.
//
// EXPENSE_CATEGORIES (main.js) has always been the list the pickers offer, but
// expenses were not only ever created from a picker: the gratuity auto-expense
// wrote its own literal, the demo seed writes another, and receipts imported
// before a category was renamed keep whatever string they were saved with. The
// result is a breakdown that splits one real bucket across two rows —
// "Marketing" beside "Marketing & Advertising", "Postage" beside "Shipping &
// Postage" — which quietly understates both on a tax return.
//
// Folding happens on read rather than by rewriting stored documents: the same
// ledger is reachable offline from a queued local state, so a migration would
// have to run correctly on every device before the numbers agreed. Normalising
// at the point the ledger is assembled makes every consumer — the category
// panel, the master ledger, both CSV exports — agree immediately, and leaves
// the stored data untouched and reversible.

// Legacy or truncated spellings → the canonical EXPENSE_CATEGORIES entry.
// Keys are compared case-insensitively with surrounding whitespace trimmed.
const CATEGORY_ALIASES = {
  'marketing': 'Marketing & Advertising',
  'advertising': 'Marketing & Advertising',
  'marketing and advertising': 'Marketing & Advertising',
  'postage': 'Shipping & Postage',
  'shipping': 'Shipping & Postage',
  'shipping and postage': 'Shipping & Postage',
  'production': 'Printing & Production',
  'printing': 'Printing & Production',
  'printing and production': 'Printing & Production',
  'software': 'Software & Subscriptions',
  'subscriptions': 'Software & Subscriptions',
  'software and subscriptions': 'Software & Subscriptions',
  'travel': 'Travel & Meals',
  'meals': 'Travel & Meals',
  'travel and meals': 'Travel & Meals',
  'editorial': 'Editorial & Proofreading',
  'proofreading': 'Editorial & Proofreading',
  'illustration': 'Illustration & Photography',
  'photography': 'Illustration & Photography',
  'events': 'Events & Exhibitions',
  'exhibitions': 'Events & Exhibitions',
  'packaging': 'Packaging Materials',
  'office': 'Office Supplies',
  'fulfillment': 'Warehousing & Fulfillment',
  'warehousing': 'Warehousing & Fulfillment',
};

/**
 * Fold a stored expense category onto its canonical name.
 *
 * Anything already canonical, and anything with no known alias, is returned
 * trimmed and otherwise untouched — an unrecognised category is a category
 * this app has not been taught yet, not an error to swallow. Empty or missing
 * input falls back to `fallback`.
 */
export function canonicalExpenseCategory(cat, fallback = 'Other') {
  const raw = typeof cat === 'string' ? cat.trim() : '';
  if (!raw) return fallback;
  return CATEGORY_ALIASES[raw.toLowerCase()] || raw;
}
