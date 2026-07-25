import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const MAIN_JS_PATH = path.resolve(__dirname, '../../src/main.js');
export const mainJs = fs.readFileSync(MAIN_JS_PATH, 'utf8');

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

  const fnStart = source.match(new RegExp(`^(?:async\\s+)?function ${n}\\s*\\(`, 'm'));
  if (fnStart) {
    const from = fnStart.index;
    const end = source.indexOf('\n}', from);
    if (end === -1) throw new Error(`extractDecl: no column-0 close brace after function ${name}`);
    return source.slice(from, end + 2);
  }

  const constStart = source.match(new RegExp(`^(?:const|let) ${n}\\s*=`, 'm'));
  if (constStart) {
    const from = constStart.index;
    // Multi-line object/array literal closes at column 0; otherwise one line.
    const multi = source.startsWith('{', source.indexOf('=', from) + 2)
      || /^(?:const|let) [^=]+=\s*[{[]\s*$/m.test(source.slice(from, source.indexOf('\n', from)));
    if (multi) {
      const end = source.indexOf('\n};', from);
      if (end !== -1) return source.slice(from, end + 3);
    }
    const eol = source.indexOf('\n', from);
    return source.slice(from, eol === -1 ? source.length : eol);
  }

  throw new Error(
    `extractDecl: no top-level declaration named "${name}" in src/main.js. ` +
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
