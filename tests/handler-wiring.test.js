import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const mainJs = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');

// Why this file exists:
//
// src/main.js is served as <script type="module">, so its top-level function
// declarations are module-scoped and are NOT window properties. Every inline
// on*="…" handler in index.html and in the HTML strings main.js renders is
// resolved by NAME off `window`, at click time. If a handler is renamed, moved,
// or simply never added to exposeLegacyInlineHandlers, nothing complains: the
// build succeeds, the page loads, the button renders, and the click silently
// does nothing. On a POS and ledger app that failure can look like a sale that
// just didn't record.
//
// Neither the bundler nor eslint can see across that string boundary, so this
// test walks it explicitly.

// Identifiers that are legitimately called inside a handler without being one
// of the app's own exposed functions.
const BUILTINS = new Set([
  'if', 'for', 'while', 'switch', 'return', 'typeof', 'new', 'delete', 'void',
  'catch', 'function', 'else', 'do', 'try', 'in', 'of', 'await', 'yield',
  'alert', 'confirm', 'prompt', 'parseInt', 'parseFloat', 'isNaN', 'Number',
  'String', 'Boolean', 'Array', 'Object', 'JSON', 'Math', 'Date', 'RegExp',
  'Set', 'Map', 'Promise', 'Error', 'encodeURIComponent', 'decodeURIComponent',
  'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'requestAnimationFrame',
  'console', 'window', 'document', 'event', 'this', 'super',
]);

/**
 * Blank out the parts of a handler body that aren't calls resolved off window
 * at click time:
 *   - `${…}` interpolations, which main.js evaluates in module scope while
 *     building the HTML string, long before any click
 *   - string literals, so CSS like `this.style.background='rgba(0,0,0,.1)'`
 *     doesn't read as a call to rgba()
 * Replaced with spaces rather than removed so offsets stay meaningful.
 */
function stripInert(body) {
  const out = body.split('');
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '$' && body[i + 1] === '{') {
      let depth = 0;
      let j = i + 1;
      for (; j < body.length; j++) {
        if (body[j] === '{') depth++;
        else if (body[j] === '}') { depth--; if (depth === 0) break; }
      }
      for (let k = i; k <= Math.min(j, body.length - 1); k++) out[k] = ' ';
      i = j;
      continue;
    }
    if (body[i] === "'" || body[i] === '"' || body[i] === '`') {
      const quote = body[i];
      let j = i + 1;
      while (j < body.length && body[j] !== quote) {
        if (body[j] === '\\') j++;
        j++;
      }
      for (let k = i; k <= Math.min(j, body.length - 1); k++) out[k] = ' ';
      i = j;
    }
  }
  return out.join('');
}

/**
 * Pull the function names invoked by inline event-handler attributes.
 * Only bare `name(` calls count — `foo.bar()` is a method on some object and is
 * not resolved off window by name.
 */
function handlerNamesIn(source) {
  const names = new Set();
  // on<event>="<body>" — both quote styles, across the whole file.
  const attrRe = /\son[a-z]+\s*=\s*(["'])([\s\S]*?)\1/gi;
  let m;
  while ((m = attrRe.exec(source)) !== null) {
    const body = stripInert(m[2]);
    const callRe = /(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g;
    let c;
    while ((c = callRe.exec(body)) !== null) {
      if (BUILTINS.has(c[2])) continue;
      names.add(c[2]);
    }
  }
  return names;
}

/** Names main.js puts on window, however it does it. */
function exposedNames(source) {
  const names = new Set();
  // window.foo = ...
  for (const m of source.matchAll(/(?:^|\s)window\.([A-Za-z_$][\w$]*)\s*=/g)) {
    names.add(m[1]);
  }
  // Object.assign(window, { a, b, c: d })
  for (const m of source.matchAll(/Object\.assign\(\s*window\s*,\s*\{/g)) {
    // Walk braces from the opening one so nested objects don't end it early.
    let i = source.indexOf('{', m.index);
    let depth = 0;
    let end = i;
    for (; end < source.length; end++) {
      if (source[end] === '{') depth++;
      else if (source[end] === '}') { depth--; if (depth === 0) break; }
    }
    const block = source.slice(i + 1, end);
    // Strip comments, then take each entry's key (`foo` or `foo: bar`).
    const clean = block.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const entry of clean.split(',')) {
      const key = entry.trim().split(':')[0].trim();
      if (/^[A-Za-z_$][\w$]*$/.test(key)) names.add(key);
    }
  }
  return names;
}

/** Names main.js defines at module scope. */
function definedNames(source) {
  const names = new Set();
  for (const m of source.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  for (const m of source.matchAll(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  for (const m of source.matchAll(/(?:^|\s)window\.([A-Za-z_$][\w$]*)\s*=/g)) names.add(m[1]);
  return names;
}

// Handlers that are known to be dead right now. Everything here is a button or
// field the user can reach that does nothing when used.
//
// The "Write-Off Stock" modal (index.html ~1486-1550) is fully built — book
// picker, reason, quantity, computed value, notes — but src/main.js contains no
// write-off code whatsoever, so all four of its handlers are missing. Wiring it
// up is a product decision, not a mechanical fix: it has to be settled whether
// a write-off deducts from stock, posts a history row, and books a tax-centre
// expense at cost basis. Until that's decided the modal should either be
// implemented or hidden — leaving it reachable and inert is the worst option.
//
// This list must stay exact: implementing one of these without removing it here
// fails the test below, so the list can't quietly rot.
const KNOWN_DEAD_HANDLERS = [
  'onWriteOffBookChange',
  'openInventoryWriteOffModal',
  'recalcWriteOffValue',
  'submitInventoryWriteOff',
];

const exposed = exposedNames(mainJs);
const defined = definedNames(mainJs);
const htmlHandlers = handlerNamesIn(html);
const templateHandlers = handlerNamesIn(mainJs);

describe('inline handler wiring', () => {
  it('finds handlers to check in both index.html and main.js templates', () => {
    // Guards the extractor itself: if a refactor changes how handlers are
    // written and these drop to zero, the assertions below would pass
    // vacuously and this file would be worthless.
    expect(htmlHandlers.size).toBeGreaterThan(100);
    expect(templateHandlers.size).toBeGreaterThan(50);
    expect(exposed.size).toBeGreaterThan(100);
  });

  it('exposes every handler index.html calls, apart from the known-dead list', () => {
    const missing = [...htmlHandlers]
      .filter(n => !exposed.has(n) && !KNOWN_DEAD_HANDLERS.includes(n))
      .sort();
    expect(missing).toEqual([]);
  });

  it('keeps the known-dead list exact', () => {
    // Both directions matter. A name that is still dead but dropped from the
    // list would slip past the assertion above; a name that has since been
    // implemented but left on the list would quietly re-open the hole for it.
    const stillDead = KNOWN_DEAD_HANDLERS.filter(n => !exposed.has(n)).sort();
    expect(stillDead).toEqual([...KNOWN_DEAD_HANDLERS].sort());
  });

  it('exposes every handler main.js renders into HTML strings', () => {
    const missing = [...templateHandlers].filter(n => !exposed.has(n)).sort();
    expect(missing).toEqual([]);
  });

  it('defines every name it exposes on window', () => {
    const undefinedNames = [...exposed].filter(n => !defined.has(n)).sort();
    expect(undefinedNames).toEqual([]);
  });

  it('has promptDialog wired up', () => {
    // Regression guard for the specific bug this suite was written after: the
    // "Relink" button in the edit-expense receipt list called promptDialog(),
    // which existed nowhere, so the click rejected silently.
    expect(defined.has('promptDialog')).toBe(true);
    expect(exposed.has('promptDialog')).toBe(true);
    expect(html).toContain('id="m-prompt-input"');
  });
});
