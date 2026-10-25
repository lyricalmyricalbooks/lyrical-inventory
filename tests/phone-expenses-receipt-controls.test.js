import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');

test('phone Expenses: receipt filter is a square tag and AI Scan spans the card', () => {
  const block = phone.match(/@media \(max-width: 768px\) \{\s*#exp-missing-receipt-btn[\s\S]*?\n\}/);
  expect(block).not.toBeNull();
  expect(block[0]).toMatch(/#exp-missing-receipt-btn\s*\{[^}]*border-radius:\s*var\(--r2\)/);
  // beats the inline align-self:flex-start the desktop button carries
  expect(block[0]).toMatch(/#exp-ai-btn\s*\{[^}]*align-self:\s*stretch\s*!important/);
});
