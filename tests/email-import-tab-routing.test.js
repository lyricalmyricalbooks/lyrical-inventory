import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(path.join(root, 'index.html'), 'utf8');
const taxCentre = readFileSync(path.join(root, 'src/features/taxcentre.js'), 'utf8');

test('opening the email import tab launches the importer instead of a landing screen', () => {
  const switchSubTab = taxCentre.match(/function switchTaxCenterSubTab\(subTabName\) \{([\s\S]*?)\n\}/)?.[1] || '';

  expect(switchSubTab).toMatch(/activeTaxCenterSubTab === 'email-import'[\s\S]*?openEmailReceiptImportModal\(\)/);
  expect(html).not.toContain('tc-email-import-hero');
  expect(html).not.toContain('Turn forwarded receipts into clean expenses.');
});
