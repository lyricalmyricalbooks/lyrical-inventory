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

test('email import modal has a focused workspace shell and responsive dialog treatment', () => {
  expect(styles).toMatch(/\.modal\.email-import-modal\s*\{[\s\S]*?overflow:hidden;/);
  expect(styles).toMatch(/\.email-import-header\s*\{[\s\S]*?position:sticky;/);
  expect(styles).toMatch(/\.email-import-modal \.modal-tabs\s*\{[\s\S]*?width:100%;/);
  expect(styles).toMatch(/@media \(max-width: 768px\)[\s\S]*?\.modal\.email-import-modal/);
});
