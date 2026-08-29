import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

// Resolved via __dirname rather than `new URL(..., import.meta.url)`: under the
// jsdom test environment the global URL is jsdom's, and node:fs / fileURLToPath
// reject a foreign URL object with "must be of scheme file". Passing a string
// keeps node's own parser in play, and matches how the rest of tests/ does it.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8').replace(/\r\n/g, '\n');
const html = readFileSync(path.join(__dirname, '../index.html'), 'utf8').replace(/\r\n/g, '\n');

/** The per-book Consignment tab, sliced out of index.html by its panel id. */
function consignmentPanel() {
  const start = html.indexOf('<div class="tab-panel" id="tab-consignment"');
  const end = html.indexOf('<!-- HISTORY -->', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return html.slice(start, end);
}

test('all three consignment sections share the one section-head pattern', () => {
  const panel = consignmentPanel();

  // Accounts leads; invoices and the ledger are supporting reads.
  expect(panel.match(/<div class="sec-head">/g) || []).toHaveLength(1);
  expect(panel.match(/<div class="sec-head is-muted">/g) || []).toHaveLength(2);

  // Every heading sits on the app's serif section tier. The ledger used to be
  // the 9px `.sect` micro-label — the faintest type in the app on the longest
  // and most consequential block on the screen — and that mismatch is the whole
  // point of this change.
  const serifHeads = panel.match(/class="section-hed sec-head-title"/g) || [];
  expect(serifHeads).toHaveLength(3);
  expect(panel).toMatch(/class="section-hed sec-head-title">Consignment accounts</);
  expect(panel).toMatch(/class="section-hed sec-head-title">Invoices</);
  expect(panel).toMatch(/class="section-hed sec-head-title">Consignment ledger</);

  // No section on this screen may fall back to the micro-label tier.
  expect(panel).not.toMatch(/class="sect[">\s]/);

  // Each head carries a kicker with its dot, and a line of subcopy.
  expect(panel.match(/class="sec-kicker"/g) || []).toHaveLength(3);
  expect(panel.match(/class="sec-kicker-dot"/g) || []).toHaveLength(3);
  expect(panel.match(/class="section-subcopy"/g) || []).toHaveLength(3);
});

test('gold is spent once on this screen', () => {
  const panel = consignmentPanel();
  // `.is-muted` re-points the kicker at the neutral slate. Exactly one head is
  // left untagged, so the screen keeps a single accented entry point instead of
  // three kickers all shouting gold.
  const heads = panel.match(/<div class="sec-head(?: is-muted)?">/g) || [];
  expect(heads).toHaveLength(3);
  expect(heads.filter(h => !h.includes('is-muted'))).toHaveLength(1);
});

test('the rhythm comes from the section gap, not from hairline dividers', () => {
  const panel = consignmentPanel();

  // Three sections, each its own `.overview-section` — the same wrapper the
  // landing screen uses, so both screens step by one spacing token.
  expect(panel.match(/class="overview-section"/g) || []).toHaveLength(3);
  // The invoices section keeps its id (renderInvoices() toggles it) while
  // wearing the wrapper.
  expect(panel).toMatch(/<div class="overview-section" id="invoices-section" style="display:none;">/);

  // The `.divider` hairlines that used to stand in for the spacing are gone;
  // space between sections now beats space within one on its own.
  expect(panel).not.toMatch(/class="divider"/);
  // …and `.row-between`, whose only responsive behaviour was a viewport
  // breakpoint, is replaced by the head's own container query.
  expect(panel).not.toMatch(/class="row-between"/);
});

test('the ledger keeps its sticky column labels and live filter region', () => {
  const panel = consignmentPanel();
  // Moving the table inside a section wrapper must not cost it either of the
  // two things that make a 200-row ledger usable.
  expect(panel).toMatch(/<div class="tbl-wrap sys-sticky-head">/);
  expect(panel).toMatch(/id="con-ledger-status" aria-live="polite"/);
  expect(panel).toMatch(/id="con-ledger-controls"/);
});

test('a head badge slot wraps rather than crushing its titles', () => {
  const badges = styles.match(/\.sec-head-badges,\n\.consignment-summary-badges\{([^}]*)\}/);
  expect(badges).not.toBeNull();
  // Three buttons plus a summary line now hang off one head. Without wrapping,
  // `flex-shrink:0` squeezes the title column until the head overflows well
  // before the 680px container stack takes over.
  expect(badges[1]).toMatch(/flex-shrink:0;/);
  expect(badges[1]).toMatch(/flex-wrap:wrap;/);
});

test('a figure riding in a head is mono and tabular, like every other number', () => {
  const note = styles.match(/\.sec-head-note\{([^}]*)\}/);
  expect(note).not.toBeNull();
  expect(note[1]).toMatch(/font-family:'DM Mono',monospace;/);
  expect(note[1]).toMatch(/font-variant-numeric:tabular-nums;/);
  expect(note[1]).toMatch(/font-feature-settings:"tnum" 1,"zero" 1;/);
  // A themed token, not the inline `--text3` literal it replaced.
  expect(note[1]).toMatch(/color:var\(--content-muted\);/);

  // The invoice summary line uses the class rather than re-declaring the same
  // four properties inline.
  const panel = consignmentPanel();
  expect(panel).toMatch(/<div id="inv-summary" class="sec-head-note"><\/div>/);
});
