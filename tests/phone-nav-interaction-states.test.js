import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');

test('the phone bottom nav bar gives every tap a press state', () => {
  expect(styles).toMatch(/\.mnav-btn:active\s*\{[^}]*background-color:/);
});

test('the bottom bar wears the Riso look: ink rule on top, square marks, no soft glow', () => {
  const bar = styles.match(/\.pub-shell \.mnav\{([\s\S]*?)\}/)[1];
  expect(bar).toMatch(/border-top:var\(--stroke\) solid var\(--rule-ink\);/);
  expect(bar).toMatch(/box-shadow:none;/);
  expect(styles).not.toMatch(/0 -8px 24px rgba/);
  expect(styles).toMatch(/\.mnav-btn\.active::before\{[^}]*border-radius:0;/);
  expect(styles).toMatch(/\.mnav-dot\{[^}]*border-radius:0;/);
  expect(styles).toMatch(/\.mnav-btn\{[\s\S]*?color:var\(--on-inverse-2\);/);
  // The raised round centre button went with the five-slot bar; its rules matched nothing.
  expect(styles).not.toMatch(/\.mnav-primary/);
});

test('the More sheet close button has a full hover/press/focus set', () => {
  const closeHover = styles.match(/\.more-sheet-close:hover\s*\{([\s\S]*?)\}/);
  const closeActive = styles.match(/\.more-sheet-close:active\s*\{([\s\S]*?)\}/);
  const closeFocus = styles.match(/\.more-sheet-close:focus-visible\s*\{([\s\S]*?)\}/);

  expect(closeHover).not.toBeNull();
  expect(closeActive).not.toBeNull();
  expect(closeFocus).not.toBeNull();
  expect(closeHover[1]).toMatch(/background:\s*var\(--surface-inset\)/);
  // Presses into its offset shadow (see phone.css), like every Riso button.
  expect(closeActive[1]).toMatch(/transform:\s*translate\(2px,\s*2px\)/);
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
