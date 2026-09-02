import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8').replace(/\r\n/g, '\n');
const html = readFileSync(path.join(__dirname, '../index.html'), 'utf8');

test('Business Trips header shares the .sec-head layout, not a bare inline caption', () => {
  // .tc-trips-header must be aliased into the shared .sec-head rule rather than
  // forking its own display/justify-content/gap declarations — that's what keeps
  // it in step with every other top-level section head instead of drifting back
  // to a one-off block.
  const sharedRule = styles.match(/\.sec-head,\s*\n\.consignment-summary-head,\s*\n\.tc-trips-header\{([\s\S]*?)\}/);
  expect(sharedRule).not.toBeNull();
  expect(sharedRule[1]).toMatch(/display:\s*flex;/);
  expect(sharedRule[1]).toMatch(/justify-content:\s*space-between;/);
  expect(sharedRule[1]).toMatch(/margin-bottom:\s*var\(--space-4\);/);

  // The residual rule should only add what's specific to this header (the wider
  // gap above the Recurring Subscriptions card and wrapping at narrow widths),
  // not re-fork the shared layout properties. There are two `.tc-trips-header`
  // occurrences in the sheet (the shared alias above, and this one) — anchor on
  // the block form (own line + brace) so this only matches the second.
  const ownRule = styles.match(/\.tc-trips-header \{\n([\s\S]*?)\n\}/);
  expect(ownRule).not.toBeNull();
  expect(ownRule[1]).toMatch(/flex-wrap:\s*wrap;/);
  expect(ownRule[1]).toMatch(/margin-top:\s*2\.5rem;/);
  expect(ownRule[1]).not.toMatch(/display:\s*flex;/);

  // The old free-floating actions wrapper is gone — the toggle + New trip button
  // now live in the shared .sec-head-badges slot instead of a one-off class.
  expect(styles).not.toMatch(/\.tc-trips-actions\s*\{/);
});

test('Business Trips markup uses the sec-head titles/kicker/subcopy/badges structure', () => {
  const start = html.indexOf('<div class="tc-trips-header sec-head is-muted">');
  const end = html.indexOf('New trip</button>', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const block = html.slice(start, end);

  expect(block).toMatch(/class="tc-trips-header sec-head is-muted"/);
  expect(block).toMatch(/class="sec-head-titles"/);
  expect(block).toMatch(/class="sec-kicker"><span class="sec-kicker-dot"><\/span>/);
  expect(block).toMatch(/class="section-hed sec-head-title">Business Trips & Event Portfolio</);
  expect(block).toMatch(/class="section-subcopy">/);
  expect(block).toMatch(/class="sec-head-badges"/);
  // The view toggle and New trip button still exist, just moved into the shared slot.
  expect(block).toMatch(/id="tc-trips-btn-cards"/);
  expect(block).toMatch(/id="tc-new-trip-btn"/);
});
