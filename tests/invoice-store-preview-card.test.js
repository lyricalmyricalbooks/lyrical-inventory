import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');
const markup = readFileSync(path.join(__dirname, '../index.html'), 'utf8');

test('invoice store-details preview reads as a filled card, not a translucent-white overlay', () => {
  const previewRule = styles.match(/\.inv-store-preview\s*\{([\s\S]*?)\n\}/);
  const labelRule = styles.match(/\.inv-store-preview strong\s*\{([\s\S]*?)\n\}/);

  expect(previewRule).not.toBeNull();
  expect(labelRule).not.toBeNull();

  // Themed surface tokens, not the dark-backdrop-only translucent white that
  // made the panel invisible on the modal's cream surface.
  expect(previewRule[1]).toMatch(/background:\s*var\(--surface-sunken\);/);
  expect(previewRule[1]).toMatch(/border:\s*1px solid var\(--border-default\);/);
  expect(previewRule[1]).not.toMatch(/rgba\(255,\s*255,\s*255/);

  // Each field label steps down to a muted micro-label so the block reads as
  // label/value pairs instead of one undifferentiated run of text.
  expect(labelRule[1]).toMatch(/text-transform:\s*uppercase;/);
  expect(labelRule[1]).toMatch(/color:\s*var\(--content-muted\);/);
});

test('the invoice modal markup uses the themed class instead of an inline dark-mode-only style', () => {
  const previewTag = markup.match(/<div id="inv-store-preview"[^>]*>/);

  expect(previewTag).not.toBeNull();
  expect(previewTag[0]).toContain('class="inv-store-preview"');
  expect(previewTag[0]).not.toMatch(/style="/);
});
