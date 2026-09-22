import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(path.join(root, 'index.html'), 'utf8');
const styles = readFileSync(path.join(root, 'src/style.css'), 'utf8');
const receipts = readFileSync(path.join(root, 'src/features/receipts.js'), 'utf8');

test('email importer has a separate Gmail no-AI mode and a scrollable modal', () => {
  expect(html).toMatch(/id="email-tab-direct"[\s\S]*?Gmail Import/);
  expect(html).toMatch(/id="email-panel-direct"/);
  expect(html).toMatch(/No AI reads this mail/);
  expect(html).toMatch(/handleEmailImportPrimaryAction\(\)/);

  const modalRule = styles.match(/\.modal\.email-import-modal\s*\{([\s\S]*?)\n\}/)?.[1] || '';
  expect(modalRule).toMatch(/display:\s*flex/);
  expect(modalRule).toMatch(/overflow:\s*hidden/);
  expect(styles).toMatch(/\.email-import-modal #email-panel-gmail,[\s\S]*?\.email-import-modal #email-panel-manual,[\s\S]*?\.email-import-modal #email-panel-direct\s*\{[\s\S]*?overflow-y:\s*auto/);
});

test('direct Gmail import archives originals without using the AI extraction path', () => {
  const directImport = receipts.match(/async function importDirectGmailEmails\(\)\s*\{([\s\S]*?)\n\}\s*\n\s*async function importEmailReceiptDrafts\(/)?.[1] || '';
  expect(directImport).toContain('_fetchEmailContent');
  expect(directImport).toContain('_saveDraftReceiptFiles');
  expect(directImport).toContain('amountUnknown: true');
  expect(directImport).toContain('importedWithoutAi: true');
  expect(directImport).not.toContain('_callAiForReceipts');
});
