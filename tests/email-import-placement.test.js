import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(path.join(root, 'index.html'), 'utf8');
const styles = readFileSync(path.join(root, 'src/style.css'), 'utf8');

test('email receipt import is a dedicated Tax Centre sub-tab beside integrations', () => {
  const nav = html.match(/<div class="settings-sub-nav tc-sub-nav"[\s\S]*?<\/div>/)?.[0];
  expect(nav).toBeTruthy();
  expect(nav).toMatch(/btn-tctab-integrations/);
  expect(nav).toMatch(/btn-tctab-email-import/);
  expect(nav.indexOf('btn-tctab-email-import')).toBeGreaterThan(nav.indexOf('btn-tctab-integrations'));
  expect(html).toMatch(/id="tc-sec-email-import"[^>]*role="tabpanel"/);
  expect(html).not.toMatch(/onclick="openEmailReceiptImportModal\(\)" title="Import expenses from forwarded receipt emails"/);
});

test('email import renders inline in its sub-tab instead of as a floating dialog', () => {
  // It lives inside #tc-sec-email-import as ordinary page content, styled
  // with the same card chrome as the Integrations sub-page right next to it —
  // not as an `.overlay`/`.modal` dialog that pops up over the app.
  const section = html.match(/<div id="tc-sec-email-import"[\s\S]*?<\/div>\s*<!-- \/#tc-sec-email-import -->/)?.[0];
  expect(section).toBeTruthy();
  expect(section).toMatch(/class="card tc-integrations-card email-import-workspace" id="m-email-receipt-import-modal"/);
  expect(section).not.toContain('class="overlay"');
  expect(section).not.toContain('modal-close-btn');

  expect(styles).toMatch(/\.email-import-workspace \.modal-tabs\s*\{[\s\S]*?width:100%;/);
  expect(styles).toMatch(/\.email-import-workspace \.email-search-row\b/);
  expect(styles).not.toMatch(/\.modal\.email-import-modal\s*\{/);
});
