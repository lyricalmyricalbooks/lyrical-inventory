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
const darkStyles = readFileSync(path.join(__dirname, '../src/styles/theme-dark.css'), 'utf8');
const indexHtml = readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const mainJs = readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');

const block = (selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = styles.match(new RegExp(`\\n${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`));
  expect(m, `expected a rule block for ${selector}`).not.toBeNull();
  return m[1];
};

test('the three reconciliation cards share one left edge', () => {
  // The accent has to stay off the content box. A left border under the global
  // border-box shrinks the two accented cards' inner width, so their labels sit
  // further right than the unaccented card's — the ragged edge this replaced.
  expect(styles).not.toMatch(/\.hist-kpi-card\.highlight-(gold|green)\s*\{[^}]*border-left/);
  expect(block('.hist-kpi-card::after')).toMatch(/inset:\s*auto\s+0\s+0;/);
  expect(block('.hist-kpi-card::after')).toMatch(/height:\s*3px;/);
  expect(block('.hist-kpi-card.highlight-gold::after')).toMatch(/background:\s*linear-gradient/);
  expect(block('.hist-kpi-card.highlight-green::after')).toMatch(/background:\s*linear-gradient/);
});

test('exactly one card leads the strip, by size and colour together', () => {
  const lead = block('.hist-kpi-card.is-lead .hist-kpi-val');
  expect(lead).toMatch(/font-size:\s*var\(--text-2xl\);/);
  expect(lead).toMatch(/color:\s*var\(--gold-text\);/);
  // The other two stay a full step down, or the lead stops leading.
  expect(block('.hist-kpi-val')).toMatch(/font-size:\s*var\(--text-xl\);/);
  // Only Stock On Hand carries it.
  expect(mainJs.match(/hist-kpi-card[^"]*\bis-lead\b/g)).toHaveLength(1);
});

test('the three sub-lines share a baseline despite the lead being taller', () => {
  // Without these the lead card's larger figure pushes its own sub-line below
  // the other two, and the row of secondary text goes ragged.
  expect(block('.hist-kpi-card')).toMatch(/align-items:\s*stretch;/);
  expect(block('.hist-kpi-content')).toMatch(/flex-direction:\s*column;/);
  expect(block('.hist-kpi-sub')).toMatch(/margin-top:\s*auto;/);
  // The plate must not stretch to the card height along with the column.
  expect(block('.hist-kpi-icon')).toMatch(/align-self:\s*flex-start;/);
});

test('the strip sits on the shared type and spacing scale', () => {
  const label = block('.hist-kpi-label');
  expect(label).toMatch(/font-size:\s*var\(--text-2xs\);/);
  expect(label).toMatch(/letter-spacing:\s*var\(--tracking-label\);/);

  const container = block('.hist-kpi-container');
  expect(container).toMatch(/grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);/);
  expect(container).toMatch(/gap:\s*var\(--space-3\);/);
  expect(container).toMatch(/margin-bottom:\s*var\(--space-4\);/);

  const card = block('.hist-kpi-card');
  expect(card).toMatch(/padding:\s*var\(--space-4\)\s+18px;/);
  expect(card).toMatch(/box-shadow:\s*var\(--elev-1\);/);
});

test('the strip narrows via a container query on its own wrapper', () => {
  // An element cannot query its own container, so container-type has to sit on
  // the wrapper in index.html, not on the grid it resizes.
  expect(block('.hist-recon-strip')).toMatch(/container-type:\s*inline-size;/);
  expect(block('.hist-recon-strip')).toMatch(/container-name:\s*hist-recon;/);
  expect(indexHtml).toMatch(/id="hist-recon"[^>]*class="hist-recon-strip"/);
  expect(styles).toMatch(
    /@container hist-recon \(max-width: 680px\) \{\s*\.hist-kpi-container \{ grid-template-columns: 1fr; \}/
  );
});

test('the progress bar keeps a visible trough in both themes', () => {
  // --cream2 lands ~3% off the page colour on dark, which left the unfilled
  // remainder invisible and the fill an unanchored stub. --track-bg is the
  // token that carries a real trough into both palettes.
  const wrap = block('.hist-progress-bar-wrap');
  expect(wrap).toMatch(/background:\s*var\(--track-bg\);/);
  expect(wrap).not.toMatch(/var\(--cream2\)/);
  expect(darkStyles).toMatch(/--track-bg:\s*rgba\(255,\s*255,\s*255,\s*\.13\)/);
});

test('the progress fill plots one measurement in one colour family', () => {
  const fill = block('.hist-progress-bar-fill');
  // The old gold→emerald ramp blended two semantic roles across a single bar.
  expect(fill).toMatch(/linear-gradient\(90deg,\s*var\(--emerald\),\s*var\(--emerald-soft\)\)/);
  expect(fill).not.toMatch(/var\(--gold\b/);
  // Motion tokens collapse under prefers-reduced-motion; a literal duration
  // would keep sweeping the bar on every re-render regardless.
  expect(fill).toMatch(/transition:\s*width\s+var\(--dur-base\)\s+var\(--ease-entrance\);/);
});

test('card transitions use motion tokens rather than literal curves', () => {
  const card = block('.hist-kpi-card');
  expect(card).toMatch(/var\(--dur-fast\)\s+var\(--ease-entrance\)/);
  expect(card).not.toMatch(/cubic-bezier/);
  expect(block('.hist-kpi-card:hover')).toMatch(/box-shadow:\s*var\(--elev-hover\);/);
});
