// The one rule for "is this the sandbox test book?". Kept in a leaf module so
// pure libs (cashflow.js) and the app share it: a real book whose title merely
// contains "test" — "The Greatest Hits", "Protest Songs", "Contest" — must
// never be dropped from the ledger, Tax Centre totals or exports.

export function isTestBook(b) {
  if (!b) return false;
  const idLower = String(b.id || '').toLowerCase().trim();
  const titleLower = String(b.title || '').toLowerCase().trim();
  // Preserve the original TEST PAGE sandbox aliases without hiding real
  // books such as "Greatest Hits" or "Contest" through substring matches.
  const testNames = ['test', 'test1', 'testpage', 'test-page', 'test page'];
  return b.isTest === true || testNames.includes(idLower) || testNames.includes(titleLower);
}

/** A book keyed by `bid` in a `books` map: its key or its record marks the sandbox. */
export function isTestBookEntry(bid, book) {
  return isTestBook({ id: bid }) || isTestBook(book);
}
