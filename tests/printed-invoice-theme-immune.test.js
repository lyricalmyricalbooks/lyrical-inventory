import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

// Resolved via __dirname rather than `new URL(..., import.meta.url)` — jsdom's
// global URL is not a node file URL and node:fs rejects it. Matches the rest
// of tests/.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mainJs = readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
const contrastScript = readFileSync(path.join(__dirname, '../scripts/check-contrast.mjs'), 'utf8');

const fnBody = (name) => {
  const m = mainJs.match(new RegExp(`\\n(?:async )?function ${name}\\(`));
  expect(m, `expected a ${name} function`).not.toBeNull();
  // Walk to the next top-level function declaration — good enough to scope the
  // assertions below without parsing the whole file.
  const start = m.index;
  const next = mainJs.slice(start + 1).search(/\n(?:async )?function [A-Za-z0-9_$]+\(/);
  return mainJs.slice(start, next === -1 ? undefined : start + 1 + next);
};

test('the downloaded invoice paints itself, not from app tokens', () => {
  // buildStandaloneInvoiceHTML writes a whole document into a new window and
  // carries over ONLY the font links — its <head> has no app stylesheet, so
  // there is no :root for a custom property to resolve against. A var() here
  // resolves to nothing and the invoice loses its white paper entirely.
  const src = fnBody('buildStandaloneInvoiceHTML');
  expect(src).toMatch(/\.invoice-paper\{background:#fff;\}/);
  expect(src).not.toMatch(/\.invoice-paper\{background:var\(/);
  expect(src).toMatch(/html,body\{background:#fff !important/);
});

test('the invoice PDF holder does not follow the theme', () => {
  // This holder IS in the app page, so a token here resolves — to the DARK
  // card when the publisher happens to be in night mode. It is rasterised
  // straight into the PDF, so that would bake a dark ground into a printed
  // invoice that every customer receives.
  const src = fnBody('buildInvoiceJsPdf');
  expect(src).toMatch(/width:780px;background:#fff;/);
  expect(src).not.toMatch(/width:780px;background:var\(/);
});

test('both invoice document builders are exempt from the colour sweep', () => {
  // The exemption list is what tells a future token sweep these literals are
  // deliberate. Without the entry the next sweep re-tokenises them and the
  // printed invoice breaks again with nothing failing to catch it.
  expect(contrastScript).toMatch(/'buildStandaloneInvoiceHTML',/);
  expect(contrastScript).toMatch(/'buildInvoiceJsPdf',/);
});
