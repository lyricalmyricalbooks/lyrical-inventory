// ── MODAL PRIMITIVES ────────────────────────────────────────────────────
//
// Dialog open/close, focus management, the styled confirm/prompt replacements,
// and inline form validation. Carved out of src/main.js.
//
// This is a LEAF module: it imports nothing from main.js or src/features/, so
// it introduces no cycle. That is the whole point of it living in src/lib/ —
// every feature module needs openM/closeM, and importing them from main.js
// meant four more edges on an already-cyclic graph.
//
// It knows about the DOM and nothing about the app's domain. The one piece of
// app-specific behaviour that used to live in openM (seeding a date field when
// certain modals open) is injected by the host via configureModals(), so this
// file stays free of knowledge about which modals exist.

const $ = id => document.getElementById(id);

// ── HOST CONFIGURATION ──────────────────────────────────────────────────
// The host app registers behaviour that must run when a modal opens but that
// depends on domain knowledge this module deliberately doesn't have.
let _prepareOpen = null;

/**
 * @param {{prepareOpen?: (id: string, el: HTMLElement) => void}} opts
 *   prepareOpen runs after the overlay is shown but BEFORE the unsaved-changes
 *   snapshot is taken, so anything it seeds counts as a default rather than a
 *   user edit.
 */
export function configureModals({ prepareOpen } = {}) {
  _prepareOpen = typeof prepareOpen === 'function' ? prepareOpen : null;
}

// ── MODAL HELPERS ───────────────────────────────────────────────────────
// Snapshot of a modal's field values, taken when it opens — used by the
// backdrop/Esc close guard to detect unsaved edits.
let _modalSnapshots = {};
export function _modalFieldSig(id) {
  const el = $('m-' + id); if (!el) return '';
  return Array.from(el.querySelectorAll('input,select,textarea'))
    .map(f => (f.type === 'checkbox' || f.type === 'radio') ? (f.checked ? '1' : '0') : (f.value || ''))
    .join('');
}
export function _prefersReducedMotion() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

/**
 * True when a modal is open and its fields differ from the snapshot taken when
 * it opened. Exported so callers can ask the question without reaching into
 * _modalSnapshots — the unsaved-changes indicator on the add-book form uses it.
 */
export function modalFieldsChanged(id) {
  return _modalSnapshots[id] !== undefined && _modalFieldSig(id) !== _modalSnapshots[id];
}

let _modalReturnFocus = null;
export function openM(id) {
  const el = $('m-' + id); if (!el) return;
  el.classList.remove('closing');
  clearFieldErrors(el);
  _clearUnsavedMarker(el);
  el.style.display = 'flex';
  if (_prepareOpen) { try { _prepareOpen(id, el); } catch { /* a bad default must not block the dialog */ } }
  // Snapshot AFTER open* helpers and date defaults have populated fields, so a
  // later mismatch means the *user* changed something.
  _modalSnapshots[id] = _modalFieldSig(id);
  // Move keyboard focus into the dialog and remember where to send it back, so
  // keyboard/screen-reader users aren't stranded on the (now-inert) page behind.
  _modalReturnFocus = document.activeElement;
  const focusable = el.querySelector('input:not([type=hidden]),select,textarea,button,[tabindex]:not([tabindex="-1"])');
  if (focusable) setTimeout(() => { try { focusable.focus(); } catch { } }, 0);
}
export function closeM(id) {
  const el = $('m-' + id); if (!el) return;
  el.dispatchEvent(new Event('modal-close'));
  delete _modalSnapshots[id];
  _clearUnsavedMarker(el);
  // Restore focus to whatever opened the modal (if it's still around).
  if (_modalReturnFocus && el.contains(document.activeElement)) {
    try { _modalReturnFocus.focus(); } catch { }
  }
  _modalReturnFocus = null;
  // The Fair Print Kit and the POS sub-panels reuse the overlay markup but are
  // laid out inline rather than floating over the page. Hiding them here would
  // blank the panel the seller is working in, so they opt out of the close
  // animation and the display:none that follows it.
  if (el.classList.contains('fk-workspace') || el.closest('.pos-subpanel')) return;
  if (el.classList.contains('closing')) return;
  if (_prefersReducedMotion()) { el.style.display = 'none'; clearFieldErrors(el); return; }
  el.classList.add('closing');
  let t;
  const done = () => {
    el.style.display = 'none';
    el.classList.remove('closing');
    clearFieldErrors(el);
    el.removeEventListener('animationend', done);
    clearTimeout(t);
  };
  t = setTimeout(done, 240); // fallback if animationend doesn't fire
  el.addEventListener('animationend', done);
}
// ── UNSAVED-CHANGES MARKER ──────────────────────────────────────────────
// The Add Book form has always shown an "unsaved changes" flag in its footer;
// every other dialog in the app showed nothing, so a half-filled shipment or
// sale form looked identical to an untouched one. The marker is *injected*
// into the footer here rather than authored into thirty-odd footers by hand,
// so a dialog added tomorrow gets it for free.
//
// A dialog that already ships its own `.save-indicator` (Add Book) keeps that
// element — this only toggles it, so there is never a second flag.
const UNSAVED_LABEL = '● Unsaved changes';

/**
 * Show/hide the unsaved-changes flag on every currently-open, tracked modal.
 * Cheap enough to call on every keystroke: at most one dialog is open, and the
 * work is a field-signature string compare plus a classList toggle.
 */
export function refreshUnsavedMarkers() {
  for (const ov of document.querySelectorAll('.overlay[id^="m-"]')) {
    if (ov.style.display === 'none' || ov.classList.contains('closing')) continue;
    const id = ov.id.slice(2);
    // Untracked means the dialog was never opened through openM (or is already
    // closing) — there is no snapshot to compare against, so stay quiet.
    if (_modalSnapshots[id] === undefined) continue;
    const footer = ov.querySelector('.modal-footer');
    if (!footer) continue;
    const changed = modalFieldsChanged(id);
    let mark = footer.querySelector('.save-indicator');
    if (!mark) {
      // Created lazily so an untouched dialog's footer keeps exactly the
      // layout it has today — no reserved gap, no mobile button reflow.
      if (!changed) continue;
      mark = document.createElement('span');
      mark.className = 'save-indicator';
      mark.dataset.autoUnsaved = '1';
      mark.setAttribute('role', 'status');
      mark.textContent = UNSAVED_LABEL;
      footer.prepend(mark);
    }
    mark.classList.toggle('show', changed);
    mark.setAttribute('aria-hidden', changed ? 'false' : 'true');
  }
}

// Reset the flag when a dialog closes: injected markers are removed outright,
// and a footer's own hand-authored indicator is just switched off, so the next
// open starts from "nothing typed yet" either way.
function _clearUnsavedMarker(el) {
  for (const mark of el.querySelectorAll('.save-indicator')) {
    if (mark.dataset.autoUnsaved) mark.remove();
    else { mark.classList.remove('show'); mark.setAttribute('aria-hidden', 'true'); }
  }
}

// Close a modal, but if the user has unsaved edits, confirm first. Used by the
// backdrop-click and Esc handlers, and by every Cancel/Close button in the app,
// so neither a stray tap nor a mis-aimed Cancel can silently lose data.
// Resolves true when the dialog actually closed, so callers that need to run
// teardown (resetting a form) can tell "closed" from "kept editing".
export async function attemptCloseModal(id) {
  if (modalFieldsChanged(id)) {
    if (!(await confirmDialog('Discard your unsaved changes?',
      { okLabel: 'Discard', cancelLabel: 'Keep editing', danger: true }))) return false;
  }
  closeM(id);
  return true;
}

// Both call shapes below are supported, because both are in use and the
// object form used to fail silently: the object landed in `message`, the body
// rendered the string "[object Object]", and the title and button labels fell
// back to their defaults. A money-spending confirmation that says
// "Are you sure? / [object Object] / Confirm" is worse than no dialog at all,
// so the shape is normalised here rather than trusted at ~70 call sites.
//
//   confirmDialog('Discard this?', { okLabel: 'Discard', danger: true })
//   confirmDialog({ title: 'Discard?', message: 'Discard this?',
//                   confirmText: 'Discard', cancelText: 'Keep', danger: true })
//
// `message` may also carry simple HTML (<strong>, <br>) — the body is a text
// node, so it is flattened to plain text instead of being printed as tags.
export function normalizeConfirmArgs(message, opts = {}) {
  let text = message;
  let options = opts;
  if (message && typeof message === 'object' && !Array.isArray(message)) {
    const o = message;
    text = o.message ?? o.body ?? o.text ?? '';
    options = { ...o, ...opts };
  }
  return {
    message: htmlToPlainText(text),
    title: options.title || '',
    okLabel: options.okLabel || options.confirmText || '',
    cancelLabel: options.cancelLabel || options.cancelText || '',
    danger: !!options.danger,
    // Optional [label, value] rows rendered as an aligned table ABOVE the prose.
    // A purchase confirmation has facts to check (service, price, account) and
    // a caution to read, and the two want different typography: padding the
    // facts into columns with spaces only lines up in a monospace body, which
    // then makes the caution — the sentence that matters most — the hardest
    // thing on the dialog to read.
    details: Array.isArray(options.details)
      ? options.details.filter(row => Array.isArray(row) && row.length >= 2)
      : [],
  };
}

// The confirm body is a text node with white-space:pre-wrap, so markup in a
// message would otherwise be shown literally ("<strong>$12.32</strong>").
// Block-ish tags become line breaks and the rest are dropped, which keeps a
// message authored with light HTML readable rather than turning it into soup.
export function htmlToPlainText(value) {
  const raw = String(value ?? '');
  if (!/[<&]/.test(raw)) return raw;
  return raw
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/\s*(p|div|li|tr|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Fill the confirm body: the detail rows first, then the message. Built with
// textContent per cell rather than an HTML string, so a value carrying an
// address, a customer name or an API error can never inject markup here.
function renderConfirmBody(body, args) {
  body.textContent = '';
  body.classList.toggle('has-details', args.details.length > 0);

  if (args.details.length) {
    const table = document.createElement('dl');
    table.className = 'confirm-details';
    for (const [label, value] of args.details) {
      const dt = document.createElement('dt');
      dt.textContent = String(label ?? '');
      const dd = document.createElement('dd');
      dd.textContent = String(value ?? '');
      table.append(dt, dd);
    }
    body.appendChild(table);
  }

  if (args.message) {
    const text = document.createElement('p');
    text.className = 'confirm-message';
    text.textContent = args.message;
    body.appendChild(text);
  }
}

// Styled replacement for window.confirm — returns a Promise<boolean>.
// Falls back to native confirm() if the modal isn't present (e.g. very
// early bootstrap or unit tests).
export function confirmDialog(message, opts = {}) {
  const args = normalizeConfirmArgs(message, opts);
  const overlay = $('m-confirm');
  const body = $('m-confirm-body');
  const titleEl = $('m-confirm-title');
  const ok = $('m-confirm-ok');
  const cancel = $('m-confirm-cancel');
  if (!overlay || !body || !ok || !cancel) {
    // Should never happen in production, but keep a working fallback.

    return Promise.resolve(window.confirm(args.message));
  }
  renderConfirmBody(body, args);
  if (titleEl) titleEl.textContent = args.title || 'Are you sure?';
  ok.textContent = args.okLabel || 'Confirm';
  cancel.textContent = args.cancelLabel || 'Cancel';
  ok.classList.toggle('danger-btn', args.danger);
  ok.classList.toggle('gold', !args.danger);

  return new Promise(resolve => {
    const cleanup = (result) => {
      overlay.removeEventListener('modal-close', onCloseEvent);
      closeM('confirm');
      ok.removeEventListener('click', onOk);
      cancel.removeEventListener('click', onCancel);
      document.removeEventListener('keydown', onEnter);
      resolve(result);
    };
    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);
    const onCloseEvent = () => cleanup(false);
    const onEnter = (e) => {
      if (e.key === 'Enter') cleanup(true);
    };

    ok.addEventListener('click', onOk);
    cancel.addEventListener('click', onCancel);
    overlay.addEventListener('modal-close', onCloseEvent);
    document.addEventListener('keydown', onEnter);

    openM('confirm');
    // Focus the safe (cancel) button by default for destructive prompts.
    setTimeout(() => (args.danger ? cancel : ok).focus(), 0);
  });
}

// Styled single-line text prompt — the confirmDialog sibling for "type a value"
// flows (replaces the browser's blocking prompt()). Resolves to the entered
// string, or null if the user cancelled/dismissed, so callers can distinguish
// "cancelled" from "deliberately cleared".
export function promptDialog(message, defaultValue = '', opts = {}) {
  const overlay = $('m-prompt');
  const body = $('m-prompt-body');
  const titleEl = $('m-prompt-title');
  const input = $('m-prompt-input');
  const ok = $('m-prompt-ok');
  const cancel = $('m-prompt-cancel');
  if (!overlay || !body || !input || !ok || !cancel) {
    // Should never happen in production, but keep a working fallback.
    return Promise.resolve(window.prompt(message, defaultValue));
  }
  body.textContent = String(message ?? '');
  if (titleEl) titleEl.textContent = opts.title || 'Enter a value';
  ok.textContent = opts.okLabel || 'OK';
  cancel.textContent = opts.cancelLabel || 'Cancel';
  input.value = String(defaultValue ?? '');
  input.placeholder = opts.placeholder || '';

  return new Promise(resolve => {
    const cleanup = (result) => {
      overlay.removeEventListener('modal-close', onCloseEvent);
      closeM('prompt');
      ok.removeEventListener('click', onOk);
      cancel.removeEventListener('click', onCancel);
      input.removeEventListener('keydown', onKey);
      resolve(result);
    };
    const onOk = () => cleanup(input.value);
    const onCancel = () => cleanup(null);
    const onCloseEvent = () => cleanup(null);
    // Scoped to the input rather than the document so this dialog's Enter key
    // can't also trigger a confirmDialog that happens to be listening.
    const onKey = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); cleanup(input.value); }
      else if (e.key === 'Escape') { e.preventDefault(); cleanup(null); }
    };

    ok.addEventListener('click', onOk);
    cancel.addEventListener('click', onCancel);
    overlay.addEventListener('modal-close', onCloseEvent);
    input.addEventListener('keydown', onKey);

    openM('prompt');
    setTimeout(() => { try { input.focus(); input.select(); } catch { } }, 0);
  });
}

// ── INLINE FORM VALIDATION ──────────────────────────────────────────────
export function fieldError(id, msg) {
  const el = $(id); if (!el) return;
  const fg = el.closest('.form-group') || el.parentElement;
  if (fg) {
    fg.classList.add('invalid');
    let e = fg.querySelector('.field-error');
    if (!e) { e = document.createElement('div'); e.className = 'field-error'; fg.appendChild(e); }
    e.textContent = msg;
  }
  el.setAttribute('aria-invalid', 'true');
}
export function clearFieldError(el) {
  const fg = el && el.closest && el.closest('.form-group');
  if (fg) {
    fg.classList.remove('invalid');
    const e = fg.querySelector('.field-error'); if (e) e.remove();
  }
  if (el && el.removeAttribute) el.removeAttribute('aria-invalid');
}
export function clearFieldErrors(scope) {
  const root = scope || document;
  root.querySelectorAll('.form-group.invalid').forEach(fg => {
    fg.classList.remove('invalid');
    const e = fg.querySelector('.field-error'); if (e) e.remove();
  });
  root.querySelectorAll('[aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));
}
// rules: [{ id, test:(value, el)=>bool, msg }]. Multiple rules may target the
// same field; the first failing rule wins and later ones for it are skipped.
// Returns true when every field passes.
export function validateFields(rules) {
  let firstBad = null; const failed = new Set();
  rules.forEach(r => {
    const el = $(r.id); if (!el || failed.has(r.id)) return;
    if (r.test(el.value, el)) { clearFieldError(el); }
    else { fieldError(r.id, r.msg); failed.add(r.id); if (!firstBad) firstBad = el; }
  });
  if (firstBad && firstBad.focus) firstBad.focus();
  return failed.size === 0;
}
