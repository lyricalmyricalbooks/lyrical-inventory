import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');
const html = readFileSync(path.join(__dirname, '../index.html'), 'utf8');

// Receipts Vault's "Overview & Storage" / "Receipt Gallery" switcher used to render
// as plain `.btn.sm` buttons with a JS-toggled `.active` class that no CSS rule ever
// targeted — so tapping between the two views gave no visual sign of which one was
// selected. The fix reuses the Business Trips view-switcher's proven segmented-track
// look (`.tc-trips-view-toggle` / `.tc-trips-view-btn`) rather than inventing a new one.

test('vault view buttons opt into the shared segmented-toggle styling, not the plain .btn', () => {
  expect(html).toMatch(/<div class="tc-vault-view-switch">/);
  expect(html).toMatch(
    /<button type="button" class="tc-vault-view-btn active" id="btn-vault-view-overview"/
  );
  expect(html).toMatch(
    /<button type="button" class="tc-vault-view-btn" id="btn-vault-view-gallery"/
  );
  // The old dead class combo must not come back.
  expect(html).not.toMatch(/class="btn sm active" id="btn-vault-view-overview"/);
});

test('.tc-vault-view-btn.active carries a real raised look, shared with the trips switcher', () => {
  const trackRule = styles.match(/\.tc-trips-view-toggle,\s*\n\.tc-vault-view-switch\s*\{([\s\S]*?)\n\}/);
  const activeRule = styles.match(/\.tc-trips-view-btn\.active,\s*\n\.tc-vault-view-btn\.active\s*\{([\s\S]*?)\n\}/);

  expect(trackRule).not.toBeNull();
  expect(activeRule).not.toBeNull();

  // The track needs a visible background/border so the two states have a rail to sit on.
  expect(trackRule[1]).toMatch(/background:\s*var\(--cream2/);
  expect(trackRule[1]).toMatch(/border:\s*1px solid var\(--gold-line/);

  // The active tab has to actually look different from the resting one.
  expect(activeRule[1]).toMatch(/background:\s*var\(--surface-card\)/);
  expect(activeRule[1]).toMatch(/font-weight:\s*700/);
  expect(activeRule[1]).toMatch(/box-shadow:/);
});

test('vault view buttons get a focus-visible ring, matching the app-wide focus convention', () => {
  const focusRule = styles.match(
    /\.tc-trips-view-btn:focus-visible,\s*\n\.tc-vault-view-btn:focus-visible\s*\{([\s\S]*?)\n\}/
  );
  expect(focusRule).not.toBeNull();
  expect(focusRule[1]).toMatch(/outline:\s*var\(--focus-ring-width\) solid var\(--focus-ring-color\);/);
});
