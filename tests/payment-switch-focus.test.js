import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');

test('payment method switch moves its focus ring off the zero-size hidden checkbox', () => {
  // The checkbox itself is opacity:0/width:0/height:0, so the app-wide
  // :focus-visible rule would ring an invisible point unless it's suppressed
  // here and re-applied to the visible .pm-track sibling instead.
  const suppressed = styles.match(/\.pm-switch input:focus-visible\s*\{([\s\S]*?)\}/);
  const ringed = styles.match(/\.pm-switch input:focus-visible \+ \.pm-track\s*\{([\s\S]*?)\}/);

  expect(suppressed).not.toBeNull();
  expect(suppressed[1]).toMatch(/outline:\s*none;/);

  expect(ringed).not.toBeNull();
  expect(ringed[1]).toMatch(/outline:\s*var\(--focus-ring-width\)\s+solid\s+var\(--focus-ring-color\);/);
  expect(ringed[1]).toMatch(/outline-offset:\s*var\(--focus-ring-offset\);/);
});
