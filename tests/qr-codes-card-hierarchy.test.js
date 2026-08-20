import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

// Resolved via __dirname rather than `new URL(..., import.meta.url)` — jsdom's
// global URL is not a node file URL and node:fs rejects it. Matches the rest
// of tests/.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');
const mainJs = readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
const indexHtml = readFileSync(path.join(__dirname, '../index.html'), 'utf8');

// The all-books QR page used to be one long inline-style string per card:
// title, author and price all read at the same weight, two equal-weight
// buttons at the foot, and rgba() values that couldn't theme. The redesign
// puts every wrapper on a .qr-* class so the token lint stays clean and one
// figure leads the card. These tests pin the pieces of that decision that
// would silently undo the fix if a later edit dropped them.

test('QR page shell uses the .sec-head heading tier, not the .sect micro-label', () => {
  // The old shell led with `<div class="sect">Payment QR Codes — all books</div>`
  // — a 9px kicker read as the whole-page heading. UX_PATTERNS.md § Section
  // heads spells this out: `.sec-head` is what a top-level page section gets.
  const qrPanel = indexHtml.match(/<div class="tab-panel qr-page" id="tab-qrcodes"[\s\S]*?<\/div>\s*<!--/);
  expect(qrPanel, 'qr page panel present with .qr-page class').not.toBeNull();
  expect(qrPanel[0]).toMatch(/class="sec-head/);
  expect(qrPanel[0]).toMatch(/class="section-hed sec-head-title"/);
  // The grid element carries the .qr-grid class rather than an inline
  // grid-template — that is where the responsive step lives now.
  expect(qrPanel[0]).toMatch(/id="qr-all-grid" class="qr-grid"/);
});

test('QR card block establishes the surface, radius and hover lift on tokens', () => {
  const cardRule = styles.match(/\.qr-card\s*\{([\s\S]*?)\n\}/);
  expect(cardRule, '.qr-card rule present').not.toBeNull();
  const decl = cardRule[1];

  // Surface uses the semantic --surface-inverse-raised alias, not raw --ink2.
  // That alias flips per theme via the primitive re-point — dropping to a
  // hardcoded ink value would freeze one theme's card.
  expect(decl).toMatch(/background:\s*var\(--surface-inverse-raised\)/);
  // Radius, border and shadow all come off tokens — no ad-hoc values that
  // would silently show up on the token ratchet.
  expect(decl).toMatch(/border:\s*1px solid var\(--border-default\)/);
  expect(decl).toMatch(/border-radius:\s*var\(--r3\)/);
  expect(decl).toMatch(/box-shadow:\s*var\(--elev-2\)/);

  // Column layout with `gap` (not margin-bottom on children) — every stage
  // gap is one number, per UX_PATTERNS.md § Stacked panels.
  expect(decl).toMatch(/display:\s*flex/);
  expect(decl).toMatch(/flex-direction:\s*column/);
  expect(decl).toMatch(/gap:\s*var\(--space-4\)/);

  // Hover state uses the shared --elev-hover, never a hardcoded shadow.
  const hoverRule = styles.match(/\.qr-card:hover\s*\{([\s\S]*?)\}/);
  expect(hoverRule, '.qr-card:hover present').not.toBeNull();
  expect(hoverRule[1]).toMatch(/box-shadow:\s*var\(--elev-hover\)/);
  expect(hoverRule[1]).toMatch(/transform:\s*translateY\(-2px\)/);
});

test('title leads the card in Playfair, price is mono/tabular', () => {
  const titleRule = styles.match(/\.qr-card-title\s*\{([\s\S]*?)\n\}/);
  expect(titleRule, '.qr-card-title rule').not.toBeNull();
  // Playfair on the title is what makes it the entry point — Syne 13px at
  // the same weight as the price is what the old cards looked like.
  expect(titleRule[1]).toMatch(/font-family:\s*'Playfair Display'/);
  expect(titleRule[1]).toMatch(/font-size:\s*var\(--text-md\)/);
  // On a permanently dark card, text goes on --on-inverse — never
  // color:var(--cream) (tests/theme.test.js would fail on it).
  expect(titleRule[1]).toMatch(/color:\s*var\(--on-inverse\)/);

  const priceRule = styles.match(/\.qr-card-price\s*\{([\s\S]*?)\n\}/);
  expect(priceRule, '.qr-card-price rule').not.toBeNull();
  // Price is the second focal point — DM Mono + tabular figures so a column
  // of cards lines its digits up rather than jittering as a currency prefix
  // widens. --gold-text (not --gold) because the card is a text surface.
  expect(priceRule[1]).toMatch(/font-family:\s*'DM Mono'/);
  expect(priceRule[1]).toMatch(/font-feature-settings:\s*"tnum" 1,\s*"zero" 1/);
  expect(priceRule[1]).toMatch(/font-variant-numeric:\s*tabular-nums/);
  expect(priceRule[1]).toMatch(/color:\s*var\(--gold-text\)/);
});

test('QR plate stays a bright white square in both themes', () => {
  const frameRule = styles.match(/\.qr-frame\s*\{([\s\S]*?)\n\}/);
  expect(frameRule, '.qr-frame rule present').not.toBeNull();
  // The one deliberate raw hex on this page: a phone camera scans a
  // high-contrast square, so painting the QR plate with any themeable
  // background would break scanning under one of the two themes. Marked
  // token-ok so the ratchet knows this is reviewed rather than drift.
  expect(frameRule[1]).toMatch(/background:\s*#ffffff;\s*\/\* token-ok/);
  // Fixed 196px square: the QR library draws a 168px code inside 14px of
  // padding, so the plate stays constant regardless of QR version.
  expect(frameRule[1]).toMatch(/width:\s*196px/);
  expect(frameRule[1]).toMatch(/height:\s*196px/);
});

test('grid uses auto-fill with a token gap, not a viewport media query', () => {
  const gridRule = styles.match(/\.qr-grid\s*\{([\s\S]*?)\n\}/);
  expect(gridRule, '.qr-grid rule').not.toBeNull();
  // auto-fill so a publisher with 12 titles gets the same rhythm as one with
  // 3. The gap comes off --space-* — a raw 1.5rem here would put this on the
  // list of tokens the ratchet is trying to shrink, not grow.
  expect(gridRule[1]).toMatch(/grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(260px,\s*1fr\)\)/);
  expect(gridRule[1]).toMatch(/gap:\s*var\(--space-5\)/);
});

test('Download leads Copy in the actions row', () => {
  // The old cards rendered `<button class="btn ink">Copy link</button>
  // <button class="btn gold">Download</button>` at equal font-size/flex — no
  // primary. The redesign keeps both buttons but the primary (gold) is the
  // one on the right (Download), so at a fair table the seller reaches for
  // the action they mean 99% of the time.
  const render = mainJs.match(/function renderAllQRCodes\(\)[\s\S]*?\n\}\n/);
  expect(render, 'renderAllQRCodes present').not.toBeNull();
  const src = render[0];

  // The action buttons use the shared .btn sizes and semantic modifiers, not
  // an inline `style="flex:1;font-size:11px;"` bypass.
  expect(src).toMatch(/class="btn ink sm"[^>]*copyBookQR/);
  expect(src).toMatch(/class="btn gold sm"[^>]*downloadBookQR/);
  // Both buttons are disabled when there is no link — copying an empty
  // string is a footgun; letting a disabled Download but an enabled Copy
  // sit on the same row is the visible bug the old version had.
  const copyBtn = src.match(/class="btn ink sm"[^>]*copyBookQR[^>]*/);
  const dlBtn = src.match(/class="btn gold sm"[^>]*downloadBookQR[^>]*/);
  expect(copyBtn[0]).toMatch(/\$\{url \? '' : 'disabled'\}/);
  expect(dlBtn[0]).toMatch(/\$\{url \? '' : 'disabled'\}/);
});

test('renderAllQRCodes writes no inline background/border/font/color styles', () => {
  // The point of the redesign: every wrapper goes through a class. A future
  // edit sneaking `style="background:..."` back onto the card is exactly the
  // regression that put us here in the first place.
  const render = mainJs.match(/function renderAllQRCodes\(\)[\s\S]*?\n\}\n/);
  const src = render[0];
  expect(src).not.toMatch(/style="[^"]*background\s*:/);
  expect(src).not.toMatch(/style="[^"]*border\s*:/);
  expect(src).not.toMatch(/style="[^"]*font-size\s*:/);
  expect(src).not.toMatch(/style="[^"]*color\s*:/);
  // The one style.* call is a custom-property write for the per-book accent
  // dot — that is a data pipe, not a styling override.
  expect(src).toMatch(/style\.setProperty\(['"]--qr-accent['"]/);
});
