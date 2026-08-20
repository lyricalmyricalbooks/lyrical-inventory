import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

// Resolved via __dirname rather than `new URL(..., import.meta.url)`: under the
// jsdom test environment the global URL is jsdom's, and node:fs / fileURLToPath
// reject a foreign URL object with "must be of scheme file". Passing a string
// keeps node's own parser in play, and matches how the rest of tests/ does it.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');
const markup = readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const mainJs = readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');

test('the Stripe setup block is one panel on the shared space scale', () => {
  const panel = styles.match(/\.recon-setup\s*\{([\s\S]*?)\n\}/);
  expect(panel).not.toBeNull();

  // The four loose lines used to carry four different hand-picked margins.
  // The panel is what replaces them: one gap token between its children, one
  // padding token inside, and a themed surface so it reads as a single chunk.
  expect(panel[1]).toMatch(/gap:\s*var\(--space-3\);/);
  expect(panel[1]).toMatch(/padding:\s*var\(--space-4\);/);
  expect(panel[1]).toMatch(/background:\s*var\(--surface-sunken\);/);
  expect(panel[1]).toMatch(/border:\s*1px solid var\(--border-default\);/);
});

test('the Stripe key field keeps the full row and a mono value', () => {
  const field = styles.match(/\.recon-key-field\s*\{([\s\S]*?)\n?\}/);
  expect(field).not.toBeNull();

  // Without `min-width:0` the long placeholder forces the flex item wider than
  // its track and pushes the Change button off the row.
  expect(field[1]).toMatch(/flex:\s*1 1 320px;/);
  expect(field[1]).toMatch(/min-width:\s*0;/);
  expect(styles).toMatch(/\.recon-key-field input\{[^}]*font-family:'DM Mono',monospace;/);
  expect(styles).toMatch(/\.recon-key-mask\{[^}]*font-family:'DM Mono',monospace;/);
});

test('the status line holds its height instead of shunting the panel', () => {
  const status = styles.match(/\.recon-status\{([^}]*)\}/);
  expect(status).not.toBeNull();
  expect(status[1]).toMatch(/min-height:\s*1\.45em;/);
});

test('both key-row states wear the shared form furniture, in markup and at render', () => {
  // index.html paints the first frame; reconRenderKeyRow() repaints it after
  // that. If only one of the two carries the classes, the field silently
  // reverts to a raw browser input the moment the screen re-renders.
  expect(markup).toMatch(/<div class="form-group recon-key-field">/);
  expect(markup).toMatch(/<div id="recon-keyrow" class="recon-keyrow">/);
  expect(markup).toMatch(/<div id="recon-status" class="recon-status">/);

  const fn = mainJs.match(/function reconRenderKeyRow\([\s\S]*?\n\}/);
  expect(fn).not.toBeNull();
  expect(fn[0]).toMatch(/class="form-group recon-key-field"/);
  expect(fn[0]).toMatch(/class="pill green"/);
  expect(fn[0]).toMatch(/class="recon-key-mask"/);
  // The long "(reused from Tax Centre / Invoices…)" sentence moved out of the
  // placeholder and under the box, where it survives the first keystroke.
  expect(fn[0]).toMatch(/class="field-note">Reused from Tax Centre \/ Invoices if already saved\./);
  expect(fn[0]).not.toMatch(/placeholder="[^"]*reused from/i);
});
