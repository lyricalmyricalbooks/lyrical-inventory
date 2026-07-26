import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractDecl } from './helpers/extract-decl.js';
import { hexToRgba } from '../src/lib/money.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

// The test profile used to be kept purple by src/test-profile-tint-fix.js, a
// script loaded after main.js that ran two MutationObservers — one rewriting
// the accent variables right after switchBook set them, one watching the whole
// of document.body with subtree:true and re-colouring dots on every DOM change
// anywhere in the app. Every dot already derives from book.accent, so the same
// appearance comes from normalising that one property at load.
describe('the DOM-patching override is gone', () => {
  it('no longer exists as a file', () => {
    expect(fs.existsSync(path.join(root, 'src/test-profile-tint-fix.js'))).toBe(false);
  });

  it('is no longer loaded by index.html', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    expect(html).not.toContain('test-profile-tint-fix');
  });

  it('left no MutationObserver behind in main.js', () => {
    // Nothing in the app should need to watch the DOM to repaint theme colours.
    // Matches instantiation rather than the bare word, so the comment in main.js
    // explaining why the observers went away doesn't trip this.
    const mainJs = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
    expect(mainJs).not.toMatch(/new\s+MutationObserver/);
  });
});

function loadThemeHelpers(books) {
  const src = [
    extractDecl('isTestBook'),
    extractDecl('TEST_BOOK_ACCENT'),
    extractDecl('TEST_BOOK_ACCENT_BG'),
    extractDecl('normalizeTestBookAccents'),
    extractDecl('applyBodyTint'),
  ].join('\n');

  const setProps = {};
  const documentStub = {
    documentElement: { style: { setProperty: (k, v) => { setProps[k] = v; } } },
  };

  // eslint-disable-next-line no-new-func
  const factory = new Function('BOOKS', 'BOOK_LIST', 'document', 'hexToRgba',
    `${src}\n return { normalizeTestBookAccents, applyBodyTint, get BOOK_LIST() { return BOOK_LIST; } };`);
  const api = factory(books, Object.values(books), documentStub, hexToRgba);
  return { ...api, setProps, books };
}

describe('normalizeTestBookAccents', () => {
  it('forces any test book to the purple accent', () => {
    const books = {
      real: { id: 'real', title: 'The Hound', accent: '#3a7cc8', accentBg: 'rgba(58,124,200,.1)' },
      t: { id: 'test1', title: 'Test Profile', accent: '#c8913a', accentBg: 'rgba(200,145,58,.1)' },
    };
    const { normalizeTestBookAccents } = loadThemeHelpers(books);
    normalizeTestBookAccents();
    expect(books.t.accent).toBe('#8b5cf6');
    expect(books.t.accentBg).toBe('rgba(139, 92, 246, 0.1)');
  });

  it('leaves real books alone', () => {
    const books = { real: { id: 'real', title: 'The Hound', accent: '#3a7cc8', accentBg: 'x' } };
    const { normalizeTestBookAccents } = loadThemeHelpers(books);
    normalizeTestBookAccents();
    expect(books.real.accent).toBe('#3a7cc8');
    expect(books.real.accentBg).toBe('x');
  });

  it('catches a test book identified by title rather than id', () => {
    const books = { b1: { id: 'b1', title: 'my test book', accent: '#000000' } };
    const { normalizeTestBookAccents } = loadThemeHelpers(books);
    normalizeTestBookAccents();
    expect(books.b1.accent).toBe('#8b5cf6');
  });

  it('tolerates an empty catalog', () => {
    const { normalizeTestBookAccents } = loadThemeHelpers({});
    expect(() => normalizeTestBookAccents()).not.toThrow();
  });
});

describe('applyBodyTint', () => {
  const books = {
    real: { id: 'real', title: 'The Hound', accent: '#3a7cc8' },
    odd: { id: 'odd', title: 'Odd', accent: 'var(--gold2)' },
    none: { id: 'none', title: 'None' },
  };

  it('washes the page with 6% of the book accent', () => {
    const { applyBodyTint, setProps } = loadThemeHelpers(books);
    applyBodyTint('real');
    expect(setProps['--body-bg-tint']).toBe('rgba(58,124,200,0.06)');
  });

  it('clears the tint on the all-books view', () => {
    const { applyBodyTint, setProps } = loadThemeHelpers(books);
    applyBodyTint('all');
    expect(setProps['--body-bg-tint']).toBe('transparent');
  });

  it('falls back to no tint for an accent it cannot fade', () => {
    // hexToRgba slices a #rrggbb string; handing it a CSS var would produce
    // rgba(NaN,NaN,NaN,0.06) and paint the page a broken colour.
    const { applyBodyTint, setProps } = loadThemeHelpers(books);
    applyBodyTint('odd');
    expect(setProps['--body-bg-tint']).toBe('transparent');
    applyBodyTint('none');
    expect(setProps['--body-bg-tint']).toBe('transparent');
  });

  it('clears the tint for an unknown book id', () => {
    const { applyBodyTint, setProps } = loadThemeHelpers(books);
    applyBodyTint('does-not-exist');
    expect(setProps['--body-bg-tint']).toBe('transparent');
  });
});
