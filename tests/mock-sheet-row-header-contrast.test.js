import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mainJs = readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');

// Same relative-luminance / WCAG contrast math as scripts/check-contrast.mjs,
// duplicated locally rather than imported so this test pins the rendered
// pairing directly instead of trusting the checker's own resolver.
function srgbChannelToLinear(c) {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}
function relativeLuminance({ r, g, b }) {
  return 0.2126 * srgbChannelToLinear(r) + 0.7152 * srgbChannelToLinear(g) + 0.0722 * srgbChannelToLinear(b);
}
function contrastRatio(c1, c2) {
  const L1 = relativeLuminance(c1);
  const L2 = relativeLuminance(c2);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}
function whiteOnDark(alpha, bgHex) {
  const bg = {
    r: parseInt(bgHex.slice(0, 2), 16),
    g: parseInt(bgHex.slice(2, 4), 16),
    b: parseInt(bgHex.slice(4, 6), 16),
  };
  const composited = {
    r: 255 * alpha + bg.r * (1 - alpha),
    g: 255 * alpha + bg.g * (1 - alpha),
    b: 255 * alpha + bg.b * (1 - alpha),
  };
  return contrastRatio(composited, bg);
}

// renderMockSpreadsheet() paints the "Connect your Google Sheet" tab's
// simulated grid — a permanently-dark widget independent of the app's own
// light/dark toggle. The row-number gutter, the blank corner cell, and the
// empty-tab message were all copy-pasted at 30% white opacity, which reads as
// nearly invisible against the grid's own dark chrome (2.7:1 — well under the
// 4.5:1 small-text floor every other label in this widget already clears).
// Pinned here so the fix can't quietly regress back to that alpha.
test('mock spreadsheet row gutter, corner cell and empty state stay legible on their dark chrome', () => {
  const fnMatch = mainJs.match(/function renderMockSpreadsheet\(\) \{[\s\S]*?\n\}/);
  expect(fnMatch).not.toBeNull();
  const body = fnMatch[0];

  expect(body).not.toMatch(/rgba\(255,\s*255,\s*255,\s*0\.3\)/);

  const cornerCell = body.match(/<th style="background:#22222e;\s*color:(rgba\([^)]+\));[^"]*width:30px;[^"]*"><\/th>/);
  const rowGutterCell = body.match(/background:#1d1d26;\s*color:(rgba\([^)]+\));[\s\S]*?\$\{idx \+ 1\}/);
  const emptyStateCell = body.match(/color:(rgba\([^)]+\));\s*font-style:italic;/);

  expect(cornerCell, 'corner <th> color declaration').not.toBeNull();
  expect(rowGutterCell, 'row-number <td> color declaration').not.toBeNull();
  expect(emptyStateCell, 'empty-state message color declaration').not.toBeNull();

  const parseAlpha = (rgba) => parseFloat(rgba.match(/,\s*([\d.]+)\)$/)[1]);

  const cornerRatio = whiteOnDark(parseAlpha(cornerCell[1]), '22222e');
  const gutterRatio = whiteOnDark(parseAlpha(rowGutterCell[1]), '1d1d26');
  const emptyRatio = whiteOnDark(parseAlpha(emptyStateCell[1]), '15151b');

  expect(cornerRatio).toBeGreaterThanOrEqual(4.5);
  expect(gutterRatio).toBeGreaterThanOrEqual(4.5);
  expect(emptyRatio).toBeGreaterThanOrEqual(4.5);
});
