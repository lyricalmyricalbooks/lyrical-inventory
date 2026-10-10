import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mainJs } from './helpers/extract-decl.js';

// Wiring checks for small fixes in main.js / firebase.js, whose functions are
// too entangled with the page to run in isolation.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const firebaseJs = readFileSync(path.resolve(__dirname, '../src/firebase.js'), 'utf8');

describe('Open Call outbox', () => {
  it('"Send all" holds back unsubscribed addresses', () => {
    const src = readFileSync(path.resolve(__dirname, '../src/features/opencall.js'), 'utf8');
    const fn = src.slice(src.indexOf('async function ocOutboxSendAll'));
    expect(fn.slice(0, 2000)).toMatch(/_isCustomerSuppressed\(c\.email\)\) \{ held\.push/);
  });
});

describe('leftover fault fixes', () => {
  it('the production-cost calculator reads the stored category field (cat)', () => {
    expect(mainJs).toMatch(/category: e\.cat \|\| e\.category \|\| 'General'/);
    expect(mainJs).toMatch(/category: e\.cat \|\| e\.category \|\| 'Production'/);
    // Only production spend is pre-ticked, even when linked to the book.
    expect(mainJs).toMatch(/if \(isProdCat && \(isDirectBook \|\| isTitleMatch\)\)/);
  });

  it('the single-book Stripe QR converts the list price into the chosen currency', () => {
    const fn = mainJs.slice(mainJs.indexOf('async function generateSingleBookStripeQR'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).toMatch(/convertCurrency\(book\.listPrice/);
    expect(body).toMatch(/No exchange rate for/);
  });

  it('the currency restatement dialog honours a retyped rate for undated and missed dates', () => {
    expect(mainJs).toMatch(/return \(date && byDate\[date\]\) \|\| _ccCtx\.flatRate \|\| byDate\[''\] \|\| 0;/);
    expect(mainJs).not.toMatch(/out\[d\] = \(r && r\.rate\) \? r\.rate : \(out\[''\] \|\| 0\)/);
  });

  it("the author's Copy link copies the link the QR encodes", () => {
    const fn = mainJs.slice(mainJs.indexOf('window.copyAuthorQR'));
    expect(fn.slice(0, 300)).toMatch(/getEffectiveBookPaymentLink\(book\)/);
  });

  it('transfer pay links leave the in-flight set once minted', () => {
    const fn = mainJs.slice(mainJs.indexOf('function ensureTransferLinks'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).toMatch(/_transferLinkInFlight\.delete\(`\$\{bookId\}:\$\{t\.id\}`\)/);
    expect(body).toMatch(/_transferLinkInFlight\.delete\(`\$\{bookId\}:bundle`\)/);
  });

  it('the consignment CSV labels each row with its own currency', () => {
    expect(mainJs).toMatch(/normalizeCurrencyCode\(e\.cur, curCode\),\n\s+e\.voided \? 'VOID'/);
  });

  it('deleting a Firestore book lists its submissions from Firestore, not the Realtime Database', () => {
    const start = firebaseJs.indexOf('if (window._useFirestoreForBook(bookId)) {\n      // Atomic');
    const block = firebaseJs.slice(start, firebaseJs.indexOf('// Always wipe RTDB copies'));
    expect(block).toMatch(/getDocs\(collection\(fs, 'submissions', bookId, type\)\)/);
    expect(block).not.toMatch(/get\(ref\(db/);
  });

  it('book-view renders refresh the To-do badge', () => {
    const fn = mainJs.slice(mainJs.indexOf('function renderAll()'));
    expect(fn.slice(0, fn.indexOf('\n}\n'))).toMatch(/scheduleTodoBadgeRefresh\(\)/);
    expect(mainJs).toMatch(/function scheduleTodoBadgeRefresh[\s\S]*updateTodoBadge\(visibleAttentionResult\(\)\)/);
  });
});
