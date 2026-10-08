// Help tab rules shared by main.js and the tests: who can open which tab,
// and how a search query is matched against a question.

// Tabs only the publisher can open. switchTab() sends an author (or the
// publisher in Author view) back to the Dashboard if they try one of these.
export const PUBLISHER_ONLY_TABS = new Set([
  'website', 'backups', 'taxcenter', 'sheets', 'qrcodes', 'reconcile', 'customers',
  'opencall', 'webanalytics', 'shipping', 'bigcartel', 'todo', 'intel', 'today',
]);

// Tabs only an author sees; the publisher is sent to the Dashboard instead.
export const AUTHOR_ONLY_TABS = new Set(['myqr']);

// Whether a "take me there" button in an answer leads somewhere for this viewer.
export function helpTabOpenFor(tab, { author }) {
  return author ? !PUBLISHER_ONLY_TABS.has(tab) : !AUTHOR_ONLY_TABS.has(tab);
}

// Text is folded (case, accents, curly quotes) so “fair” finds "Fair" and café finds cafe.
export const foldHelpText = (t) => String(t || '').toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"');

export const helpQueryWords = (query) => foldHelpText(query).split(/\s+/).filter(Boolean);

// Every word must appear somewhere in the question or its answer.
export const helpMatches = (text, words) => {
  const hay = foldHelpText(text);
  return words.every((w) => hay.includes(w));
};
