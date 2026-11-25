// Folio round three: emoji used as decoration (the 📒 on "Ledger", the 🧾 in a
// drop zone, the 🖨 on a History tile) become the same thin line icons as the
// menu. Only decoration changes: words are never touched, emoji the app does not
// know stay as they are, and user content (book titles, notes) is never scanned.
import { wrapLeadEmojiIn } from './phone-layout.js';

// Emoji (variation selectors removed) -> icon name in the index.html sprite.
export const FOLIO_EMOJI_ICONS = {
  '📦': 'shipping', '📮': 'shipping', '📬': 'inbox', '📭': 'inbox', '📥': 'download', '📤': 'upload',
  '✉': 'mail', '📧': 'mail', '📨': 'mail', '✨': 'sparkles', '🖨': 'printer', '💾': 'save', '⚡': 'zap',
  '🔍': 'search', '🔎': 'search', '📷': 'camera', '📋': 'copy', '➕': 'plus', '🧾': 'receipt-doc',
  '🗑': 'trash', '📊': 'analytics', '📉': 'analytics', '📈': 'analytics', '📁': 'folder', '📂': 'folder',
  '🗂': 'backups', '🗃': 'backups', '💳': 'payments', '💸': 'payments', '🏦': 'payments', '☁': 'cloud',
  '🛒': 'cart', '🛍': 'orders', '🚀': 'send', '🕑': 'clock', '🔧': 'wrench', '🔗': 'link', '📲': 'smartphone',
  '📣': 'opencall', '📚': 'books', '📘': 'books', '📖': 'books', '📅': 'today', '📄': 'order', '📑': 'order',
  '📝': 'pencil', '✏': 'pencil', '✍': 'pencil', '👥': 'customers', '👤': 'user', '🏪': 'consignment',
  '🏬': 'consignment', '🏢': 'consignment', '🎯': 'target', '❓': 'help', '✈': 'plane', '⚙': 'settings',
  '⚖': 'tax', '🏷': 'sell', '📌': 'pin', '📎': 'paperclip', '🚚': 'truck', '🔄': 'rotate', '🔁': 'rotate',
  '🌐': 'globe', '🔒': 'lock', '💡': 'lightbulb', '🖼': 'image', '🏭': 'printer', '📒': 'order', '🟨': 'order',
  '⬇': 'download', '⬆': 'upload',
};

const EMOJI_KEY = s => s.replace(/[️‍\s]/g, '');
export const folioIconFor = emoji => FOLIO_EMOJI_ICONS[EMOJI_KEY(String(emoji || ''))] || null;

const SVG = name => `<svg class="ic" aria-hidden="true" focusable="false"><use href="#ic-${name}"/></svg>`;
// Lone-emoji picture boxes: empty states, drop zones, tile and tab icons.
const ICON_BOXES = '.e-icon, .dz-icon, .tab-icon, [class*="-icon"]:not(.pab-icon):not(.theme-toggle-btn), [class*="kpi-ic"]';

/** Turns one .lead-emoji span into a line icon when the emoji is known. */
export function iconizeLeadEmoji(span) {
  if (!span || span.classList.contains('lead-ic')) return false;
  if (span.firstElementChild) return false;
  const name = folioIconFor(span.textContent);
  if (!name) return false;
  span.innerHTML = SVG(name);
  span.classList.add('lead-ic');
  return true;
}

/** Turns a box that holds nothing but one emoji into a line icon. */
export function iconizeIconBox(box) {
  if (!box || box.classList.contains('fo-icon-box') || box.childElementCount) return false;
  const name = folioIconFor(box.textContent);
  if (!name) return false;
  box.innerHTML = SVG(name);
  box.classList.add('fo-icon-box');
  return true;
}

export function iconizeIn(root) {
  if (!root || root.nodeType !== 1) return;
  wrapLeadEmojiIn(root);
  if (root.matches('.lead-emoji')) iconizeLeadEmoji(root);
  root.querySelectorAll('.lead-emoji').forEach(iconizeLeadEmoji);
  if (root.matches(ICON_BOXES)) iconizeIconBox(root);
  root.querySelectorAll(ICON_BOXES).forEach(iconizeIconBox);
}

/** Swaps emoji now and whenever a screen renders new buttons or tiles. */
export function initFolioIcons(root) {
  if (!root) return () => {};
  iconizeIn(root);
  const pending = new Set();
  let queued = false;
  const flush = () => { queued = false; pending.forEach(iconizeIn); pending.clear(); };
  const observer = new MutationObserver(mutations => {
    for (const m of mutations) {
      if (m.type === 'childList') {
        m.addedNodes.forEach(n => { if (n.nodeType === 1) pending.add(n); });
        if (m.target.nodeType === 1 && m.addedNodes.length) pending.add(m.target);
      }
    }
    if (pending.size && !queued) { queued = true; queueMicrotask(flush); }
  });
  observer.observe(root, { childList: true, subtree: true });
  return () => observer.disconnect();
}
