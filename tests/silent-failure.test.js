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

// ── loadBook / saveState ────────────────────────────────────────────────────
// A failed load substitutes an empty book marked _loadFailed, reports the
// fault, tells the user, and saveState then refuses to write that stand-in
// over the real ledger. All of that is exercised against the real app in
// save-state-behaviour.test.js ("a book that never loaded").
