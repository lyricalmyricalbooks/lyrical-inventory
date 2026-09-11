// The corner where the app says something happened while nobody was looking.
//
// The storefront watch got here first and put one card, fixed, in the top-right
// — the only corner not already taken, with the toast at bottom-right and the
// sync chip at bottom-left. The label watch needs to say something of the same
// kind, and a second card pinned to the same corner would simply have sat on
// top of the first: two pieces of news, one of them invisible.
//
// So the corner is a region rather than a card, and this is the stack inside
// it. Entries are keyed, because these come from repeating background checks:
// a second check finding two more labels should update what the card says, not
// leave two cards disagreeing about the same subject.
//
// Lives beside modal.js rather than in a feature, because two features need it
// and neither should have to import the other to say something.

import { escapeHtml } from './html.js';

const STACK_ID = 'app-alert-stack';

/** Keyed by `id`, in the order they first appeared. */
let _entries = [];

/** The stack as it stands. Exposed for tests and for callers deciding whether to speak. */
export function appAlertEntries() {
  return _entries.map(entry => ({ ...entry }));
}

export function clearAppAlerts() {
  _entries = [];
}

/**
 * One entry's markup.
 *
 * The action button is optional: an alert that only reports something finished
 * has nothing useful to press, and a button that just closes the card is noise
 * next to the close button already there.
 */
function entryHtml(entry) {
  const action = entry.actionLabel && entry.action
    ? `<button type="button" class="btn gold sm" onclick="${escapeHtml(entry.action)}">${escapeHtml(entry.actionLabel)}</button>`
    : '';
  // Tone is opt-in and defaults to nothing, so every entry written before this
  // existed keeps the positive styling it was designed with. A fault needs to
  // look unlike "3 labels imported" at a glance, or the corner reads as
  // uniformly good news and the one entry that isn't gets skimmed past.
  const tone = entry.tone ? ` app-alert-${escapeHtml(entry.tone)}` : '';
  return `<div class="app-alert${tone}" data-alert-id="${escapeHtml(entry.id)}" role="status" aria-live="polite">
      <span class="app-alert-ico" aria-hidden="true">${escapeHtml(entry.icon || '')}</span>
      <div class="app-alert-body">
        <span class="app-alert-title">${escapeHtml(entry.title || '')}</span>
        <span class="app-alert-detail">${escapeHtml(entry.detail || '')}</span>
        ${action ? `<div class="app-alert-actions">${action}</div>` : ''}
      </div>
      <button type="button" class="app-alert-close"
              onclick="dismissAppAlert('${escapeHtml(entry.id)}')"
              aria-label="Dismiss: ${escapeHtml(entry.title || 'notification')}">✕</button>
    </div>`;
}

export function renderAppAlerts() {
  const host = typeof document === 'undefined' ? null : document.getElementById(STACK_ID);
  if (!host) return;
  host.innerHTML = _entries.map(entryHtml).join('');
  host.hidden = _entries.length === 0;
}

/**
 * Say something, or update what is already being said on the same subject.
 *
 * Replacing in place rather than appending is the whole reason entries are
 * keyed: these come from checks that repeat every few minutes, and a stack that
 * grew a card per check would bury the screen by lunchtime.
 */
export function pushAppAlert(entry) {
  const id = String(entry?.id || '').trim();
  if (!id || !entry?.title) return null;
  const next = {
    id,
    icon: entry.icon || '',
    title: entry.title,
    detail: entry.detail || '',
    tone: entry.tone || '',
    actionLabel: entry.actionLabel || '',
    action: entry.action || '',
  };
  const existing = _entries.findIndex(item => item.id === id);
  if (existing >= 0) _entries[existing] = next;
  else _entries.push(next);
  renderAppAlerts();
  return next;
}

export function dismissAppAlert(id) {
  const key = String(id || '').trim();
  if (!key) return;
  const before = _entries.length;
  _entries = _entries.filter(entry => entry.id !== key);
  // Only repaint when something actually went. Background checks dismiss their
  // own entry on every successful run, and rebuilding the stack's markup on a
  // timer would interrupt a press on whichever other card is showing.
  if (_entries.length !== before) renderAppAlerts();
}
