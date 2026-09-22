import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');
const html = readFileSync(path.join(__dirname, '../index.html'), 'utf8');

test('danger zone kicker is tinted rose, matching the is-muted convention', () => {
  expect(styles).toMatch(/\.sec-head\.is-danger\s*\{\s*--sec-accent:\s*var\(--rose\);\s*\}/);
});

test('the book dashboard danger zone uses the section-head furniture, not a bare .sect label', () => {
  const section = html.match(/<div class="overview-section" id="danger-zone-sect"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/);
  expect(section).not.toBeNull();
  expect(section[0]).toMatch(/<div class="sec-head is-danger">/);
  expect(section[0]).toMatch(/<div class="section-hed sec-head-title">Danger zone<\/div>/);
  expect(section[0]).toMatch(/<p class="section-subcopy">/);
  // The destructive block still nests inside the same section, and keeps its own id for the
  // publisher/author visibility toggle in updateDashboard().
  expect(section[0]).toMatch(/<div id="danger-zone-block"/);
  // The old bare micro-label heading must be gone from this section.
  expect(html).not.toMatch(/<div class="sect" id="danger-zone-sect"/);
});
