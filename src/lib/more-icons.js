// The More page's tiles: which line icon each destination gets. The icons are
// the symbols in the sprite at the top of index.html (#ic-NAME), so a tile can
// draw one with <use> and no extra files.
const ICON_FOR_TAB = {
  today: 'today', dashboard: 'dashboard', todo: 'todo', website: 'orders', manual: 'order',
  consignment: 'consignment', history: 'history', expenses: 'expenses', intel: 'intel', pos: 'sell',
  taxcenter: 'tax', reconcile: 'payments', qrcodes: 'qr', customers: 'customers', opencall: 'opencall',
  webanalytics: 'analytics', shipping: 'shipping', sheets: 'sheets', bigcartel: 'bigcartel',
  backups: 'backups', help: 'help',
};

/** The icon name for a menu button's onclick text, e.g. "switchTab('todo')" → 'todo'. '' if none. */
export function moreIconFor(onclickText) {
  const m = /switchTab\('([a-z-]+)'\)/.exec(String(onclickText || ''));
  return (m && ICON_FOR_TAB[m[1]]) || '';
}

export function moreIconHtml(name) {
  return `<svg class="ic" aria-hidden="true" focusable="false"><use href="#ic-${name}"/></svg>`;
}
