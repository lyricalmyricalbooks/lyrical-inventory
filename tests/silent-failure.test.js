import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractDecl } from './helpers/extract-decl.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const firebaseJs = fs.readFileSync(path.join(root, 'src/firebase.js'), 'utf8');

// An author records a sale, the write fails, and the app says "✓ Order
// submitted for approval". The log records a success, an email goes to the
// publisher announcing the submission, and the sale exists nowhere. That is
// what these guard against.
//
// src/firebase.js imports from gstatic and connects on load, so it cannot be
// imported here. For the two functions whose entire contract is "does the
// failure escape", the source is the only place to assert it — and a source
// assertion is adequate for exactly that question, where it would not be for
// asserting behaviour.
function bodyOf(name) {
  const start = firebaseJs.indexOf(`window.${name} = async (`);
  if (start === -1) throw new Error(`${name} not found in src/firebase.js`);
  const end = firebaseJs.indexOf('\n};', start);
  if (end === -1) throw new Error(`no close for ${name}`);
  return firebaseJs.slice(start, end);
}

describe('_fbSubmitActivity propagates failure', () => {
  it('rethrows so the callers\' error handling can run', () => {
    // Both call sites in main.js already had a catch that toasts and reports.
    // While this swallowed, none of it was reachable.
    const body = bodyOf('_fbSubmitActivity');
    expect(body).toMatch(/catch[\s\S]*throw e;/);
  });
});

describe('settings writes report whether they landed', () => {
  it('_fbSaveSettings returns false and toasts on failure', () => {
    const body = bodyOf('_fbSaveSettings');
    expect(body).toMatch(/catch[\s\S]*showToast/);
    expect(body).toMatch(/catch[\s\S]*return false;/);
    expect(body).toMatch(/return true;/);
  });

  it('_fbSaveCatalog returns false and toasts on failure', () => {
    const body = bodyOf('_fbSaveCatalog');
    expect(body).toMatch(/catch[\s\S]*showToast/);
    expect(body).toMatch(/catch[\s\S]*return false;/);
    expect(body).toMatch(/return true;/);
  });
});

// ── isPermissionDenied ──────────────────────────────────────────────────────
//
// Pure, so this one is exercised rather than grepped.
function loadIsPermissionDenied() {
  const src = extractDecl('isPermissionDenied');
  // eslint-disable-next-line no-new-func
  return new Function(`${src}\n return isPermissionDenied;`)();
}

describe('isPermissionDenied', () => {
  const isPermissionDenied = loadIsPermissionDenied();

  it('recognises a Firestore rules rejection', () => {
    // The only spelling the old check looked for was the RTDB one, so a
    // Firestore book's rejection showed the generic failure message and the
    // author had no idea the book simply was not linked to their account.
    expect(isPermissionDenied({ code: 'permission-denied', message: 'Missing or insufficient permissions.' })).toBe(true);
  });

  it('recognises a Realtime Database rules rejection', () => {
    expect(isPermissionDenied({ message: 'PERMISSION_DENIED: Permission denied' })).toBe(true);
    expect(isPermissionDenied({ code: 'PERMISSION_DENIED' })).toBe(true);
  });

  it('does not mistake an ordinary failure for a permissions problem', () => {
    expect(isPermissionDenied({ code: 'unavailable', message: 'Failed to get document because the client is offline.' })).toBe(false);
    expect(isPermissionDenied(new Error('network request failed'))).toBe(false);
  });

  it('tolerates a thrown non-error', () => {
    expect(isPermissionDenied(null)).toBe(false);
    expect(isPermissionDenied(undefined)).toBe(false);
    expect(isPermissionDenied('some string')).toBe(false);
    expect(isPermissionDenied({})).toBe(false);
  });
});

// ── loadBook ────────────────────────────────────────────────────────────────
describe('loadBook distinguishes a failed load from an empty book', () => {
  const src = extractDecl('loadBook');

  it('reports the error rather than discarding it', () => {
    // The catch previously bound `e` and used it for nothing at all.
    expect(src).toMatch(/catch \(e\)[\s\S]*reportClientError\('load-book-failed'/);
  });

  it('tells the user the empty ledger is not real data', () => {
    expect(src).toMatch(/catch \(e\)[\s\S]*showToast/);
    expect(src).toMatch(/not real data/);
  });

  it('marks the substituted state non-enumerably so it cannot reach Firestore', () => {
    // A plain property would be picked up by JSON.stringify in _fbSave and
    // written into the book's metadata part.
    expect(src).toMatch(/_loadFailed/);
    expect(src).toMatch(/enumerable: false/);
  });
});

// ── A book that failed to load must not be saved over the real one ──────────
//
// loadBook() substitutes an empty default state when a load fails and marks it
// _loadFailed, precisely so it can be told apart from a genuinely empty book.
// Until now nothing read that marker, so the very next save wrote the empty
// stand-in back to the cloud. _fbSave's three-way merge would union it against
// an unknown base rather than delete rows, so this was not silent data loss —
// but a save from a blank screen still cannot mean what the user intends.
describe('saveState refuses to write a book that never loaded', () => {
  const src = extractDecl('saveState');

  it('checks the marker before anything is serialised or sent', () => {
    // Anchored on the actual statements, not the bare identifiers: the comment
    // above the guard names _fbSave, and matching that would measure prose.
    const guardAt = src.indexOf('state._loadFailed');
    const stringifyAt = src.indexOf('const json = JSON.stringify(state)');
    const sendAt = src.indexOf('await window._fbSave(');
    expect(guardAt).toBeGreaterThan(-1);
    expect(stringifyAt).toBeGreaterThan(-1);
    expect(sendAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(stringifyAt);
    expect(guardAt).toBeLessThan(sendAt);
  });

  it('returns rather than queueing, so it cannot be retried later', () => {
    // Queueing would just defer the same bad write to reconnection.
    const guard = src.slice(src.indexOf('_loadFailed'), src.indexOf('JSON.stringify(state)'));
    expect(guard).toContain('return;');
    expect(guard).not.toContain('queueSync');
  });

  it('tells the user why nothing was saved', () => {
    const guard = src.slice(src.indexOf('_loadFailed'), src.indexOf('JSON.stringify(state)'));
    expect(guard).toContain('showToast');
  });

  it('is set by loadBook on the failure path', () => {
    expect(extractDecl('loadBook')).toContain("'_loadFailed'");
  });
});
