import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const MAIN_JS_PATH = path.resolve(__dirname, '../../src/main.js');

// The app's source is main.js plus every feature module. Features were carved
// out of main.js and their functions moved verbatim, so a suite that lifts a
// declaration by name should keep finding it wherever it now lives — the point
// of these tests is the behaviour, not the file it happens to sit in.
//
// Read from disk rather than listed, so a module added later is covered the
// moment it exists.
const FEATURES_DIR = path.resolve(__dirname, '../../src/features');
export const FEATURE_PATHS = fs.existsSync(FEATURES_DIR)
  ? fs.readdirSync(FEATURES_DIR).filter(f => f.endsWith('.js'))
      .map(f => path.join(FEATURES_DIR, f))
  : [];

/** main.js and every feature module, concatenated. */
export const appSource = [MAIN_JS_PATH, ...FEATURE_PATHS]
  .map(p => fs.readFileSync(p, 'utf8'))
  .join('\n');

// Kept as the default source for extractDecl and as the export several suites
// still read directly. It spans the feature modules for the reason above.
export const mainJs = appSource;

// src/main.js is a single ~30k-line module with top-level Firebase side effects,
// so a test cannot import it. Testing anything in there means lifting the
// declaration out of the source and running it against injected dependencies.
//
// Several suites were each doing that with their own ad-hoc regex. This is the
// shared version, so the fragile part lives in one place: it anchors on a
// top-level declaration and, for functions, ends at the first `}` in column 0.
// That terminator is reliable here because every nested line in the file is
// indented — and if it ever isn't, the extracted text won't parse and the
// caller's `new Function` throws rather than silently testing a fragment.
//
// Not found is always an error, never a skip: a renamed function must fail the
// suite that covers it, not quietly stop covering it.

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Source text of a top-level declaration in src/main.js.
 * Handles `function f() {}`, `async function f() {}`, and single-line
 * `const x = …;` / multi-line `const x = { … };`.
 */
export function extractDecl(name, source = mainJs) {
  const n = escapeRe(name);

  // main.js now exports the helpers the feature modules import. The `export`
  // keyword is illegal inside `new Function`, and it is not part of the
  // declaration under test, so it is stripped from whatever is returned.
  const bare = (text) => text.replace(/^export\s+/, '');

  const fnStart = source.match(new RegExp(`^(?:export\\s+)?(?:async\\s+)?function ${n}\\s*\\(`, 'm'));
  if (fnStart) {
    const from = fnStart.index;
    const end = source.indexOf('\n}', from);
    if (end === -1) throw new Error(`extractDecl: no column-0 close brace after function ${name}`);
    return bare(source.slice(from, end + 2));
  }

  const constStart = source.match(new RegExp(`^(?:export\\s+)?(?:const|let) ${n}\\s*=`, 'm'));
  if (constStart) {
    const from = constStart.index;
    // Multi-line object/array literal closes at column 0; otherwise one line.
    const multi = source.startsWith('{', source.indexOf('=', from) + 2)
      || /^(?:export\s+)?(?:const|let) [^=]+=\s*[{[]\s*$/m.test(source.slice(from, source.indexOf('\n', from)));
    if (multi) {
      const end = source.indexOf('\n};', from);
      if (end !== -1) return bare(source.slice(from, end + 3));
    }
    const eol = source.indexOf('\n', from);
    return bare(source.slice(from, eol === -1 ? source.length : eol));
  }

  throw new Error(
    `extractDecl: no top-level declaration named "${name}" in src/main.js ` +
    'or any src/features module. ' +
    'If it was renamed or moved, update the test that depends on it.'
  );
}

/**
 * Compose several extracted declarations into one runnable unit.
 *
 * `deps` are injected as parameters. `moduleState` holds the module-level
 * `let`s the extracted code reassigns — those cannot be parameters, because a
 * parameter rebinding would not survive to the next call the way main.js's
 * module scope does.
 *
 * `moduleState` is emitted *after* the declarations so it can initialise from
 * an extracted const (e.g. `let _histLimit = HIST_PAGE`). Extracted functions
 * still see it: identifiers in a function body resolve when it's called, and
 * nothing is called until the caller has the harness back.
 */
export function buildHarness({ names, deps = {}, moduleState = '', returns }) {
  const body = names.map(n => extractDecl(n)).join('\n\n');
  const depNames = Object.keys(deps);
  // eslint-disable-next-line no-new-func
  const factory = new Function(...depNames, `${body}\n${moduleState}\nreturn (${returns});`);
  return factory(...depNames.map(k => deps[k]));
}
