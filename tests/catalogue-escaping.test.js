import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { escapeHtml } from '../src/lib/html.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mainJs = fs.readFileSync(path.resolve(__dirname, '../src/main.js'), 'utf8');

// CodeQL js/xss-through-dom, high severity, on the all-books overview.
//
// A book's id, currency and accent colour are stored verbatim from the
// Add-book form's inputs ($('nb-id'), $('nb-cur'), $('nb-accent')) — so they
// are DOM text that round-trips through Firestore and comes back into an
// innerHTML template. The numeric fields are parseInt/parseFloat'd upstream and
// cannot carry markup, but the three string ones could.
//
// This is a source-level guard rather than a render test: updateAllOverview
// needs a dozen collaborators to run, and what actually regresses is someone
// adding `${book.something}` back into the template without escaping it.

function bookStripTemplate() {
  // The strip template, from the `return` that opens it to the map terminator.
  const start = mainJs.indexOf('return `<div class="book-strip"');
  expect(start).toBeGreaterThan(-1);
  const end = mainJs.indexOf("}).join('');", start);
  expect(end).toBeGreaterThan(start);
  // bookProgressBarHtml escapes its own label and valueText (see
  // book-progress-bar.test.js), so values handed to it are already safe. Its
  // call bodies are dropped rather than scanned, or this guard reports the
  // helper's arguments as unescaped markup and cries wolf every run.
  return mainJs.slice(start, end)
    .replace(/bookProgressBarHtml\(\{[\s\S]*?\n\s*\}\)/g, 'bookProgressBarHtml(…)');
}

describe('all-books overview — book strip escaping', () => {
  it('interpolates no bare book field into the strip template', () => {
    const tpl = bookStripTemplate();
    // Any `${book.foo}` that is not wrapped in escapeHtml(...) — the pattern
    // CodeQL followed to the innerHTML sink.
    const bare = [...tpl.matchAll(/\$\{\s*book\.[A-Za-z0-9_.]+\s*\}/g)].map(m => m[0]);
    expect(bare).toEqual([]);
  });

  it('interpolates no bare per-book state field either', () => {
    // s.stock and s.sold render straight into the KPI tiles.
    const tpl = bookStripTemplate();
    const bare = [...tpl.matchAll(/\$\{\s*s\.[A-Za-z0-9_.]+\s*\}/g)].map(m => m[0]);
    expect(bare).toEqual([]);
  });

  it('escapes the book id used inside the Manage button handler', () => {
    // An id carrying an apostrophe would otherwise close the JS string inside
    // the onclick attribute.
    const tpl = bookStripTemplate();
    expect(tpl).toContain("switchBook('${idAttr}')");
    expect(tpl).not.toContain("switchBook('${book.id}')");
  });

  it('escapes every accent-derived value fed into the style attribute', () => {
    const tpl = bookStripTemplate();
    const styleAttr = tpl.slice(0, tpl.indexOf('>'));
    for (const helper of ['lightenColor', 'getContrastSafeText', 'getContrastColor']) {
      expect(styleAttr).toContain(`escapeHtml(${helper}(`);
    }
  });

  it('escapeHtml neutralises the characters that break out of these contexts', () => {
    // The guard above is only worth anything if the escaper it names is real.
    expect(escapeHtml(`#fff;"><script>alert(1)</script>`))
      .not.toContain('<script>');
    expect(escapeHtml("my'book")).not.toContain("'");
    expect(escapeHtml('a"b')).not.toContain('"');
  });
});
