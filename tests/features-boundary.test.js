import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const mainJs = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
const featureDir = path.join(root, 'src/features');
// Recorded seam size per feature module — see the assertion below.
// Lowered across the board when the modal primitives moved to src/lib/modal.js:
// openM/closeM/confirmDialog are now imported from that leaf module instead of
// from main.js, so they no longer count against any feature's seam.
// Lowered again when the shared book data moved to src/core/store.js: BOOKS,
// BOOK_LIST, states, activeBook and the getState/getBook/defaultState/
// withActiveBook helpers come from there now, which imports nothing.
const MAIN_IMPORT_BUDGET = {
  // 17 -> 8 when the Customers tab moved out to customers.js: the six
  // mailing-list / campaign names Open Call used now come from that sibling,
  // and the template-editor helpers (parseMarkdownToHtml and friends) moved in
  // here, where their only other caller lives.
  'opencall.js': 7,
  // Set at extraction. The buyer list reads the order history (orders, states,
  // BOOKS, BOOK_LIST), the Stripe reconciliation fetch and key, the applied-ids
  // cache, the audience summary card and the POS currency symbol; the rest is
  // the usual $ / showToast / today / sheetsUrl.
  // 13 -> 14 when Open Call started loading on demand: the repaint after a
  // mailing-list change goes through main.js's openCallScreen loader instead of
  // a static import of opencall.js, which would have pulled the whole screen
  // back into the first download.
  'customers.js': 10,
  // 23 -> 24 for commitRecoveredWebsiteOrder: the reconciliation worklist can
  // now rebuild a website order the Gmail scan missed, and writing one to the
  // ledger touches the applied-ids cache, the scan memory and the Sheets sync —
  // three main.js internals. One name across the seam is cheaper than three.
  // 24 -> 25 for switchTab, when labels bought outside the app started
  // announcing themselves. The notification can appear on any screen and its
  // Review button has to reach the worklist, which lives two navigations deep
  // in the Tax Centre; the second of those (switchTaxCenterSubTab) comes from
  // taxcentre.js and costs nothing here. Without switchTab the panel would be
  // revealed behind whatever the publisher is actually looking at — a button
  // that appears to do nothing. No cheaper route exists: app-shell navigation
  // is main.js's, and nothing already across this seam can perform it.
  'shipping.js': 19,
  // 16 -> 19 when the storefront became the ledger's reconciliation source.
  // Comparing Big Cartel's orders against the ledger and adding a missing one
  // needs three main.js internals and no more: commitRecoveredWebsiteOrder (the
  // single write path a website order takes, already shared with shipping.js),
  // the scan memory (so a later Gmail scan cannot re-apply an order added here),
  // and scheduleRender. The alternative was nine names — BOOK_LIST, activeBook,
  // saveState and three separate renderers among them — every one of which had a
  // cheaper equivalent already across the seam.
  // 19 -> 20 for isAuthor, when new orders started being recorded without a
  // button press: an unattended ledger write has to check the role itself,
  // because no person is there to have been refused the button.
  'bigcartel.js': 16,
  // +1 for ensurePdfJs: the printable trip report rasterises PDF receipts, and
  // that primitive stays in main.js. The receipt-file primitives it used to
  // take from main.js now come from receipts.js instead. Dropped again when the
  // Log Business Expense dropzone handlers moved in from main.js: they belong to
  // this tab's own form, and bringing them here cost one name ($) while the
  // expense ledger they used to reach through main.js left with the receipts.
  // 19 -> 16 when the rest of the Tax Centre moved out to tax-entries.js:
  // the category list, the open trip and the payout editor now come from that
  // sibling.
  'taxcentre.js': 11,
  // Went 15 -> 24 when receipt capture joined: the AI-scanner names stopped
  // crossing the seam as predicted, but capture brought fourteen dependencies
  // of its own, because it talks to the expense ledger, the FX rates and the
  // Sheets bridge in ways the filing half never did. Holding at 24 now that the
  // ledger itself has moved in — renderExpenses stopped crossing, but the form
  // it came with needs the book/state helpers in its place.
  // 24 -> 20 when the expense editor moved out to tax-entries.js: the two
  // category lists and the expense being edited now come from that sibling.
  // 20 -> 19 when the dashboard moved out: updateDash comes from dashboard.js.
  'receipts.js': 14,
  // Composed by receipts.js with injected adapters; no main.js cycle at all.
  'receipt-finder.js': 0,
  // The review inbox is a window over receipts.js and shipping.js, which hold its
  // data. From main.js it needs only the DOM lookup, the role check, the toast,
  // and the call that repaints the landing page after something is filed.
  'review-inbox.js': 4,
  // Set at creation. The website link writes website orders into the ledger
  // through the same five calls a hand-entered sale and a void use
  // (writeOrderToLedger, voidHistEntry, unvoidHistEntry, recomputeAfters,
  // syncHistRowToSheets), saves through saveState, reads the books, states, the
  // Tax Centre postage and dated FX rates (with the fetch that fills them), and
  // repaints with scheduleRender — plus $ / showToast.
  // 14 -> 11 when the sale write path moved out: writeOrderToLedger and the
  // void / un-void come from sales-ledger.js. 11 -> 12: isTestBook, so the
  // storage check keeps the test book's old copy off the To-do list.
  // 12 -> 13: openAddBookFromWebsite. "Add to the app" on a book the website
  // sells opens main.js's own Add new book form, filled in; the form, its
  // validation and its save stay main.js's, so one name crosses the seam
  // instead of the form's dozen fields. (Moving to the Website orders tab
  // lives in app-switch.js, which already reaches the navigation.)
  // 11 -> 12: applyBookDetailFromWebsite. "Use the website's" on Details that
  // differ from the website changes one field of a book through main.js's own
  // catalogue save (latest catalogue first, Sheets rename), not a second copy.
  'website-link.js': 12,
  // Set at extraction: the practice book's fake spreadsheet reads which book is
  // open, whether it is the test book, and the real sheet's two URLs (for the
  // cards it hides and shows), plus the usual $ / showToast.
  'sheets-simulator.js': 5,
  // 9 -> 4 when the register moved out to pos.js: the POS book list and
  // currency helpers now come from that sibling. What is left mints door-price
  // links through the Stripe helper and its key, jumps to the POS tab, and
  // shows toasts.
  'fair-kit.js': 4,
  // Set at extraction: the valuation reads every book's state (BOOKS,
  // BOOK_LIST, states, defaultState, activeBook, isTestBook), the dated FX
  // cache, and writes write-offs into TAX_CENTER and through saveState; the
  // role check gates the adjustment form. The rest is $ / showToast / today.
  'inventory-valuation.js': 8,
  // 11 -> 9 when the register moved out to pos.js (the cart and renderPOS come
  // from that sibling). The register-only book dialog reads and writes the
  // register-only book list (posExtraBooks), saves through the catalog
  // (syncCatalog, saveCatalogWithDeletions), checks ids against BOOKS, mints a
  // Stripe link, previews the accent and copies the link; plus $ / showToast.
  'pos-books.js': 8,
  // Set at extraction: filing fees reads every book's state (BOOK_LIST,
  // states, defaultState) and writes TAX_CENTER, converts with the FX cache and
  // the live / dated rate fetches, reads the Stripe key, and gates the sweep on
  // the role check; plus showToast / today.
  'stripe-fees.js': 8,
  // Set at extraction, one over the default: the register records each line
  // through the shared sale writer (recordOrder, withActiveBook, activeBook,
  // states, saveState, voidHistEntry), repaints history, dashboard and header,
  // reads the catalog it sells from (BOOKS, posExtraBooks, syncCatalog,
  // saveCatalogWithDeletions, isAuthor), shows the offline queue on the fair
  // pill (syncQueue, _syncQueueHeldInMemory, _syncRetrying, renderFairSyncPill,
  // startupPreviewActive), converts with the FX cache and live rate, mints
  // sale links through the Stripe helper; plus $ / showToast / today / copy.
  // 26 -> 25 when the dashboard moved out: updateDash comes from dashboard.js.
  // 25 -> 23 when the sale write path moved out: recordOrder and
  // voidHistEntry come from sales-ledger.js.
  'pos.js': 19,
  // Set at extraction: entering and correcting ledger lines reaches into
  // every book's state (BOOKS, BOOK_LIST, states, defaultState, saveState,
  // switchBook), the other ledger editors it hands off to (openEditHist,
  // openEditLedger), the author-payout records (find / edit / settle / undo
  // the settlement, the earnings totals the export reads), the sale void
  // (voidHistEntry, withActiveBook), the website-sale lock, the FX cache and
  // the rate-waiting checks, and TAX_CENTER / loadTaxCenter; plus $ /
  // showToast / today / switchTab / the test-book filters.
  // 28 -> 24 when the dashboard moved out: the four author-payout helpers
  // (find / edit / settle / undo the settlement) come from dashboard.js.
  // 24 -> 23 when the sale write path moved out: voidHistEntry comes from
  // sales-ledger.js.
  'tax-entries.js': 18,
  // Set at extraction: invoices read and write every book's state and its
  // ledger (BOOKS, BOOK_LIST, getBook, getState, states, saveState,
  // ledgerById, settleLedgerSalePaid, renderLedger, renderHist), the book's
  // accepted payment methods and link, the Consignment tab's section and count
  // helpers and its payment dialog, the reminder sweep, and the Sheets URL
  // for the emailed copy; plus $ / showToast / today / the role and test-book
  // checks.
  'invoices.js': 19,
  // Set at extraction: the dashboard reads every book's state (BOOKS, getBook,
  // getState, states, saveState) and the author earnings and transfers, the
  // channel labels and colours, the live FX rate for a foreign payout, the
  // settlement link and notify URL, the Sheets URL and sync queue for the
  // payout request, and repaints history, expenses and the context banners;
  // plus $ / showToast / today / the role checks / the count animation.
  'dashboard.js': 19,
  // Set at extraction: a sale reads and writes the book's state (BOOKS,
  // states, getBook, getState, saveState), recomputes the running Stock After,
  // repaints history, re-syncs an un-voided row to the Sheet, forgets the
  // applied-order cache, and reads the open book and role for recordOrder;
  // plus today / sheetsUrl.
  'sales-ledger.js': 8,
  // Set at creation. The switcher shows only for the publisher in their own
  // view (isPublisherSession, isAuthor) and says so with a toast; a deep link
  // from the website finds the order's sales in the books (BOOKS, BOOK_LIST,
  // states, isTestBook, activeBook) and opens them (showHistoryOrder, or
  // switchBook + switchTab for the Website orders card).
  'app-switch.js': 7,
};

const featureFiles = fs.existsSync(featureDir)
  ? fs.readdirSync(featureDir).filter(f => f.endsWith('.js'))
  : [];

// src/main.js and src/features/*.js import from each other. That cycle is
// legitimate — every export on both sides is a hoisted function declaration
// called long after start-up — but it is only safe while neither side *runs*
// anything at module-evaluation time.
//
// A feature module that called a main.js helper at its top level would read an
// uninitialised binding and throw during page load, and it would do so only in
// dev: the production build flattens the graph into one chunk and hides it. So
// the no-side-effects property is asserted rather than assumed.
describe('feature module boundary', () => {
  it('has at least one feature module to check', () => {
    expect(featureFiles.length).toBeGreaterThan(0);
  });

  featureFiles.forEach(file => {
    describe(`src/features/${file}`, () => {
      const src = fs.readFileSync(path.join(featureDir, file), 'utf8');

      it('runs nothing at module-evaluation time', () => {
        // Names this module pulls from src/lib. Those modules are leaves — they
        // import nothing from main.js or from each other's cycle — so they are
        // fully evaluated before this module's body runs. Deriving a value from
        // one at import time is safe, and several modules legitimately do.
        const libImported = new Set(
          [...src.matchAll(/import\s*\{([^}]*)\}\s*from\s*'\.\.\/lib\/[^']+'/g)]
            .flatMap(m => m[1].split(',').map(s => s.trim().split(/\s+as\s+/).pop()))
            .filter(Boolean),
        );

        // Strip block comments and line comments so prose can't read as code.
        const stripped = src
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/^\s*\/\/.*$/gm, '');

        // Template literals must be skipped too, and a regex can't do it: this
        // codebase builds whole printable documents and email previews as
        // template strings, and their embedded markup and script bodies sit at
        // column 0. `renderQRs();` inside a print window's markup is not a
        // module-evaluation-time call, but it is indistinguishable from one
        // line-by-line. So track backtick parity and ignore any line that
        // *began* inside a template.
        const lines = stripped.split('\n');
        const offending = [];
        let inTemplate = false;

        for (const line of lines) {
          const startedInTemplate = inTemplate;
          const ticks = (line.match(/(?<!\\)`/g) || []).length;
          if (ticks % 2 === 1) inTemplate = !inTemplate;
          if (startedInTemplate) continue;

          if (!/^\S/.test(line)) continue;                // indented: inside a block
          if (/^(\}|\)|\]|`)/.test(line)) continue;

          // A bare call or control statement at column 0 runs on import. So
          // does `window.x = …`, which is how inline handlers used to be
          // registered — hence `window` in the list below.
          const bareCall = /^[A-Za-z_$][\w$.]*\s*\(/.test(line)
            || /^(if|for|while|switch|do|try|document|window)\b/.test(line);

          // So does a declaration whose initialiser CALLS something —
          // `let x = f();`. The previous version skipped every line starting
          // with let/const/var and so missed exactly that shape, which is the
          // dangerous one: an initialiser that reads back into main.js gets an
          // uninitialised binding and throws during page load — in dev only,
          // because the production build flattens the graph and hides it.
          //
          // Browser built-ins and values derived from a src/lib leaf are fine;
          // neither can reach across the cycle. `new X()` and
          // `const f = function …` are not calls at all.
          const initialiser = line.match(
            /^(?:export\s+)?(?:const|let|var)\s+[\w$]+\s*=\s*([A-Za-z_$][\w$]*)[\w$.]*\s*\(/);
          const SAFE_GLOBALS = new Set([
            'localStorage', 'sessionStorage', 'JSON', 'Object', 'Array', 'Date',
            'Math', 'String', 'Number', 'Boolean', 'Symbol', 'navigator',
            'window', 'document', 'parseInt', 'parseFloat', 'structuredClone',
            'function', 'async', 'new',
          ]);
          const callingInitialiser = !!initialiser
            && !SAFE_GLOBALS.has(initialiser[1])
            && !libImported.has(initialiser[1]);

          if (bareCall || callingInitialiser) offending.push(line.trim());
        }

        expect(offending).toEqual([]);
      });

      it('imports from main.js by explicit name, not wholesale', () => {
        // A namespace import would make the coupling invisible and let it grow
        // without anyone noticing.
        expect(src).not.toMatch(/import\s+\*\s+as\s+\w+\s+from\s+'\.\.\/main\.js'/);
      });

      it('keeps its dependency on main.js within its recorded budget', () => {
        const m = src.match(/import\s*\{([^}]*)\}\s*from\s*'\.\.\/main\.js'/);
        if (MAIN_IMPORT_BUDGET[file] !== 0) expect(m).not.toBeNull();
        const names = m ? m[1].split(',').map(s => s.trim()).filter(Boolean) : [];
        // Not a style rule: this number is the actual seam between the feature
        // and the rest of the app. Budgets are per module and set at the count
        // the extraction achieved, so the check catches coupling *growing*
        // rather than asserting one number suits every feature. Shipping's is
        // larger than Open Call's because it genuinely straddles more of the
        // app — the tax centre, orders, the ledger and the Big Cartel bridge.
        // Lower a budget when a module sheds a dependency; think hard before
        // raising one.
        expect(names.length).toBeLessThanOrEqual(MAIN_IMPORT_BUDGET[file] ?? 25);
      });
    });
  });
});

// The floor below asks "is this module a real cluster, or a stray function or
// two that should have stayed in main.js?" — a fair question of the five
// modules that were CARVED OUT of main.js, which each moved a large,
// long-established surface.
//
// intel.js was never in main.js. It was written as a feature module from the
// start, which is what this architecture wants, and its whole surface is one
// panel: render it, ask it something, approve or dismiss what it suggests.
// Holding it to a floor sized for a carve-out would only be satisfiable by
// exporting internals nothing calls, which makes the export block a worse
// description of the module rather than a better one. So it gets its own floor,
// still high enough that the module cannot quietly decay into a stray helper.
const MIN_EXPORTS = {
  'intel.js': 12,
  'receipt-finder.js': 4,
  // Open it, read the queue, repaint it, ask whether it is showing.
  'review-inbox.js': 4,
  // The practice book's fake spreadsheet: one writer, one renderer and the
  // three handlers its card needs. Small, but a whole feature with no other
  // home — it only ever ran for the test book.
  'sheets-simulator.js': 5,
  // Written as a feature module from the start, like intel.js: start it,
  // schedule and run a publish, run an import, paint its card, and the two
  // answers other screens ask of it (is the link on, where is this parcel).
  'website-link.js': 7,
  // A carve-out, but a small one: the report and its two exports, and the
  // adjustment form's five handlers. Every export is a button's entry point;
  // the rest are private helpers nothing outside the module calls.
  'inventory-valuation.js': 9,
  // One dialog: open, close, save, remove (two entry points), its QR preview,
  // the Stripe link, copy and download, and the id helper the register shares.
  'pos-books.js': 10,
  // The fees report, filing, the background sweep and the charges cross-check,
  // plus the three money helpers the payment reconciliation in main.js shares.
  'stripe-fees.js': 13,
  // The sale write path and its reverse: record (on-screen and by book id),
  // the direct-to-artist variant, void, un-void and the void's Sheets sync.
  'sales-ledger.js': 6,
  // Written as a feature module from the start: start it, repaint the
  // switchers, and open a deep link once the books have loaded.
  'app-switch.js': 3,
  // Written as a feature module from the start: start it (button, shortcuts)
  // and open it (from a #search= link or the book deep link's fallback).
  'app-search.js': 2,
};

describe('feature modules are the only home of what they own', () => {
  featureFiles.forEach(file => {
    describe(`src/features/${file}`, () => {
      const src = fs.readFileSync(path.join(featureDir, file), 'utf8');
      const exportBlock = src.match(/export\s*\{([\s\S]*)\}\s*;?\s*$/);
      const exported = exportBlock
        ? exportBlock[1].split(',').map(s => s.trim()).filter(Boolean)
        : [];

      it('exports the cluster it was carved out for', () => {
        expect(exported.length).toBeGreaterThanOrEqual(MIN_EXPORTS[file] ?? 21);
      });

      it('no longer declares those functions in main.js', () => {
        // Two copies would both satisfy no-undef while the app called whichever
        // one main.js declared last — a silent, very confusing divergence.
        const duplicated = exported.filter(n =>
          new RegExp(`^(?:export\\s+)?(?:async\\s+)?function ${n}\\b`, 'm').test(mainJs));
        expect(duplicated).toEqual([]);
      });

      // A screen loaded on demand has no static import in main.js on purpose —
      // one would pull it back into the first download. Its wiring is checked
      // in tests/lazy-screens.test.js instead.
      const lazy = new RegExp(`lazyFeature\\(\\(\\) => import\\('\\./features/${file.replace('.', '\\.')}'\\)`).test(mainJs);

      it('has everything main.js still uses imported back', () => {
        if (lazy) {
          // ...and must keep it that way.
          expect(mainJs).not.toMatch(new RegExp(`from '\\./features/${file.replace('.', '\\.')}'`));
          return;
        }
        // exposeLegacyInlineHandlers lists handlers as shorthand properties, so
        // a name main.js references but never imported is a build error. This
        // guards the inverse: that the import block is real and non-empty.
        // New composed features may belong to another feature rather than
        // main.js. Check the actual owner without introducing a needless cycle.
        const owner = file === 'receipt-finder.js'
          ? fs.readFileSync(path.join(featureDir, 'receipts.js'), 'utf8') : mainJs;
        const prefix = file === 'receipt-finder.js' ? './' : './features/';
        const m = owner.match(
          new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*'${prefix}${file.replace('.', '\\.')}'`));
        expect(m).not.toBeNull();
        const imported = m[1].split(',').map(s => s.trim()).filter(Boolean);
        expect(imported.length).toBeGreaterThan(0);
        // Everything imported must actually be exported by that module.
        expect(imported.filter(n => !exported.includes(n))).toEqual([]);
      });
    });
  });
});

// Every name a module imports must actually be exported by the module it names.
//
// eslint's no-undef does not check this: the identifier *is* imported, so it is
// defined as far as the linter is concerned, and the import only fails when the
// bundler resolves it. Extracting the Tax Centre moved renderTaxCenter and
// saveTaxCenter out of main.js while shipping.js still imported them from
// there — lint stayed clean and `npm run build` failed. Tests run before the
// build in CI, so this puts the failure where it can be read.
describe('cross-module imports resolve', () => {
  const exportsOf = (src) => {
    const at = src.lastIndexOf('\nexport {');
    if (at < 0) return null;
    const block = src.slice(at).replace(/^[\s\S]*?\{/, '').replace(/\}[\s\S]*$/, '');
    return new Set(block.split(',').map(s => s.trim()).filter(Boolean));
  };

  // main.js has no trailing export block; its exports are inline, apart from
  // the odd `export { name };` for a declaration that sits in a section being
  // edited elsewhere (codeToSymbol, which customers.js takes from the POS code).
  const mainExports = new Set([
    ...[...mainJs.matchAll(/^export (?:async )?function ([A-Za-z_$][\w$]*)/gm)].map(m => m[1]),
    ...[...mainJs.matchAll(/^export (?:const|let|var) ([A-Za-z_$][\w$]*)/gm)].map(m => m[1]),
    ...[...mainJs.matchAll(/^export \{([^}]*)\};?$/gm)]
      .flatMap(m => m[1].split(',').map(s => s.trim()).filter(Boolean)),
  ]);

  const sources = Object.fromEntries(
    featureFiles.map(f => [f, fs.readFileSync(path.join(featureDir, f), 'utf8')]));

  featureFiles.forEach(file => {
    const src = sources[file];

    it(`${file}: every name it takes from main.js is exported there`, () => {
      const m = src.match(/import\s*\{([^}]*)\}\s*from\s*'\.\.\/main\.js'/);
      const names = m ? m[1].split(',').map(s => s.trim()).filter(Boolean) : [];
      expect(names.filter(n => !mainExports.has(n))).toEqual([]);
    });

    it(`${file}: every name it takes from a sibling module is exported there`, () => {
      const missing = [];
      for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*'\.\/([\w.-]+)'/g)) {
        const sibling = m[2].endsWith('.js') ? m[2] : `${m[2]}.js`;
        const exported = sources[sibling] ? exportsOf(sources[sibling]) : null;
        if (!exported) { missing.push(`${sibling} (no export block)`); continue; }
        m[1].split(',').map(s => s.trim()).filter(Boolean)
          .forEach(n => { if (!exported.has(n)) missing.push(`${n} from ${sibling}`); });
      }
      expect(missing).toEqual([]);
    });
  });
});
