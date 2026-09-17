import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');
const mainJs = readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');

test('POS search-empty state keeps the quoted term readable on the page background', () => {
  const wrapper = styles.match(/\.pos-search-empty\s*\{([\s\S]*?)\n\}/);
  const strong = styles.match(/\.pos-search-empty strong\s*\{([\s\S]*?)\n\}/);
  const kbd = styles.match(/\.pos-search-empty kbd\s*\{([\s\S]*?)\n\}/);

  expect(wrapper).not.toBeNull();
  expect(strong).not.toBeNull();
  expect(kbd).not.toBeNull();

  // Regression guard: --on-inverse equals --cream in light mode, so it
  // disappeared against #pos-grid's plain page background. The quoted term
  // must use a normal foreground token instead.
  expect(strong[1]).toMatch(/color:\s*var\(--content-primary\);/);
  expect(strong[1]).not.toMatch(/--on-inverse/);

  // The Esc hint's kbd must ride the themed surface tokens, not a hardcoded
  // rgba(255,255,255,.1) wash that only reads on a dark surface.
  expect(kbd[1]).toMatch(/background:\s*var\(--surface-sunken\);/);
  expect(kbd[1]).toMatch(/border:\s*1px solid var\(--border-default\);/);
  expect(kbd[1]).not.toMatch(/rgba\(/);
});

test('POS zero-results markup uses the themed class instead of inline styles', () => {
  const call = mainJs.match(/grid\.innerHTML = `<div class="pos-search-empty">No books match[\s\S]*?`;/);
  expect(call).not.toBeNull();
  expect(call[0]).not.toMatch(/style="/);
  expect(call[0]).not.toMatch(/--on-inverse/);
});
