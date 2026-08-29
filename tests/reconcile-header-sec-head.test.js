import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = readFileSync(path.join(__dirname, '../index.html'), 'utf8');

test('Stripe reconciliation header uses the shared .sec-head structure, not a bare row-between caption', () => {
  const panelStart = html.indexOf('id="tab-reconcile"');
  expect(panelStart).toBeGreaterThan(-1);
  const headStart = html.indexOf('<div class="sec-head">', panelStart);
  const headEnd = html.indexOf('id="recon-keyrow"', headStart);
  expect(headStart).toBeGreaterThan(panelStart);
  expect(headEnd).toBeGreaterThan(headStart);
  const block = html.slice(headStart, headEnd);

  // The old header was a bare `.row-between` + `.section-hed` with a separate,
  // unrelated <p> below it — the only top-level tab entry point in the app not
  // using the shared head furniture. It must now share the same anatomy every
  // other section head uses (kicker, title, subcopy, badges slot) instead of
  // forking its own layout.
  expect(block).toMatch(/class="sec-head-titles"/);
  expect(block).toMatch(/class="sec-kicker"><span class="sec-kicker-dot"><\/span>/);
  expect(block).toMatch(/class="section-hed sec-head-title">Stripe payments to reconcile</);
  expect(block).toMatch(/class="section-subcopy">/);
  expect(block).toMatch(/class="sec-head-badges"/);

  // The sync button and last-synced status still exist with their original
  // ids/handler, just moved into the shared badges slot instead of a one-off
  // inline flex row.
  expect(block).toMatch(/id="recon-sync-btn"[^>]*onclick="reconcileSync\(\)"/);
  expect(block).toMatch(/class="sec-head-note" id="recon-last-sync"/);

  // No leftover one-off wrapper for the old header row.
  expect(html.slice(panelStart, headEnd)).not.toMatch(/<div class="row-between">\s*<div class="section-hed">Stripe payments to reconcile<\/div>/);
});
