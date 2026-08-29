import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');
const html = readFileSync(path.join(__dirname, '../index.html'), 'utf8');

test('Book Catalog settings cards no longer hand-roll a Playfair caption', () => {
  // The old one-off heading treatment (raw inline Playfair 17px div) must be
  // gone from both the live and the test-book catalog cards.
  expect(html).not.toMatch(/font-family:'Playfair Display',serif;font-size:17px;margin-bottom:4px;">Book Catalog</);
  expect(html).not.toMatch(/<span>Test Book Catalog<\/span>/);
});

test('.cat-settings-head only adds wrapping on top of the shared .sec-head layout', () => {
  // These cards sit directly inside a plain `.card`, not an `.overview-section`,
  // so the shared `@container overview-sec` stack rule never fires for them —
  // `.cat-settings-head` has to carry its own wrap instead of re-forking layout.
  const ownRule = styles.match(/\.cat-settings-head \{\n([\s\S]*?)\n\}/);
  expect(ownRule).not.toBeNull();
  expect(ownRule[1]).toMatch(/flex-wrap:\s*wrap;/);
  expect(ownRule[1]).not.toMatch(/display:\s*flex;/);
});

test('Book Catalog and Test Book Catalog markup use the sec-head titles/kicker/subcopy/badges structure', () => {
  const catStart = html.indexOf('<div class="sec-head cat-settings-head">');
  const catEnd = html.indexOf('id="catalog-list"', catStart);
  expect(catStart).toBeGreaterThan(-1);
  expect(catEnd).toBeGreaterThan(catStart);
  const catBlock = html.slice(catStart, catEnd);

  expect(catBlock).toMatch(/class="sec-head-titles"/);
  expect(catBlock).toMatch(/class="sec-kicker"><span class="sec-kicker-dot"><\/span>/);
  expect(catBlock).toMatch(/class="section-hed sec-head-title">Book Catalog</);
  expect(catBlock).toMatch(/class="section-subcopy">/);
  expect(catBlock).toMatch(/class="sec-head-badges"/);
  expect(catBlock).toMatch(/onclick="openAddBookModal\(\)"/);

  const testStart = html.indexOf('<div class="sec-head cat-settings-head is-muted">');
  const testEnd = html.indexOf('id="test-catalog-list"', testStart);
  expect(testStart).toBeGreaterThan(-1);
  expect(testEnd).toBeGreaterThan(testStart);
  const testBlock = html.slice(testStart, testEnd);

  expect(testBlock).toMatch(/class="section-hed sec-head-title">Test Book Catalog</);
  expect(testBlock).toMatch(/class="sec-head-badges"/);
  // The "isolated sandbox" pill moved into the badges slot instead of being
  // crammed into the same inline-styled row as the heading text.
  expect(testBlock).toMatch(/ISOLATED TEST SANDBOX/);
});
