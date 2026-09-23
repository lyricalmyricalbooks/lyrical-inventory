import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');

test('the phone bottom nav bar gives every tap a press state', () => {
  expect(styles).toMatch(/\.mnav-btn:active\s*\{[^}]*background-color:/);
  expect(styles).toMatch(/\.mnav-primary:active \.mnav-ic\s*\{[^}]*transform:\s*scale\(/);
});

test('the More sheet close button has a full hover/press/focus set', () => {
  const closeHover = styles.match(/\.more-sheet-close:hover\s*\{([\s\S]*?)\}/);
  const closeActive = styles.match(/\.more-sheet-close:active\s*\{([\s\S]*?)\}/);
  const closeFocus = styles.match(/\.more-sheet-close:focus-visible\s*\{([\s\S]*?)\}/);

  expect(closeHover).not.toBeNull();
  expect(closeActive).not.toBeNull();
  expect(closeFocus).not.toBeNull();
  expect(closeHover[1]).toMatch(/background:\s*var\(--surface-inset\)/);
  expect(closeActive[1]).toMatch(/transform:\s*scale\(/);
  expect(closeFocus[1]).toMatch(/outline:/);
});

test('More sheet nav tiles get press and focus feedback distinct from the selected state', () => {
  const tileActive = styles.match(/\.more-sheet-body \.snav:active\s*\{([\s\S]*?)\}/);
  const tileFocus = styles.match(/\.more-sheet-body \.snav:focus-visible\s*\{([\s\S]*?)\}/);

  expect(tileActive).not.toBeNull();
  expect(tileFocus).not.toBeNull();
  expect(tileActive[1]).toMatch(/background:\s*var\(--surface-sunken\)/);
  expect(tileFocus[1]).toMatch(/outline:\s*2px solid var\(--gold\)/);
});
