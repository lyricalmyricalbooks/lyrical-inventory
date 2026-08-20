import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

// Resolved via __dirname rather than `new URL(..., import.meta.url)`: under the
// jsdom test environment the global URL is jsdom's, and node:fs / fileURLToPath
// reject a foreign URL object with "must be of scheme file". Passing a string
// keeps node's own parser in play, and matches how the rest of tests/ does it.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');
const html = readFileSync(path.join(__dirname, '../index.html'), 'utf8');

/** The "All books" landing screen, sliced out of index.html by its panel id. */
function overviewPanel() {
  const start = html.indexOf('<div class="tab-panel active" id="tab-all-overview">');
  const end = html.indexOf('<!-- DASHBOARD (per book) -->', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return html.slice(start, end);
}

test('the three landing-screen sections share one section-head pattern', () => {
  const panel = overviewPanel();

  // Catalogue and channel-mix sections gained the head the consignment panel
  // already had; before this they were bare `.sect` micro-labels.
  expect(panel).toMatch(/<div class="sec-head">/);
  expect(panel).toMatch(/<div class="sec-head is-muted">/);

  // All three headings sit on the app's serif section tier, not the 9px label
  // tier — that mismatch is the thing this change exists to fix.
  const serifHeads = panel.match(/class="section-hed [\w -]*"/g) || [];
  expect(serifHeads).toHaveLength(3);
  expect(panel).toMatch(/class="section-hed sec-head-title">All books — inventory overview</);
  expect(panel).toMatch(/class="section-hed sec-head-title">Combined sales by channel</);
  expect(panel).toMatch(/class="section-hed consignment-summary-title">Combined consignment summary</);

  // No section on this screen may fall back to the micro-label tier.
  expect(panel).not.toMatch(/class="sect[">\s]/);
  expect(panel).not.toMatch(/class="sect consignment-summary-title"/);

  // Each head carries a kicker with its dot, and a line of subcopy.
  expect(panel.match(/class="sec-kicker"/g) || []).toHaveLength(2);
  expect(panel.match(/class="sec-kicker-dot"/g) || []).toHaveLength(2);
  expect(panel.match(/class="section-subcopy"/g) || []).toHaveLength(3);
});

test('the section-head furniture is one shared rule, not a second copy', () => {
  // The consignment classes must alias onto `.sec-head` rather than keep their
  // own duplicate declarations — a second copy is how the two drift apart.
  const head = styles.match(/\.sec-head,\n\.consignment-summary-head\{([^}]*)\}/);
  const titles = styles.match(/\.sec-head-titles,\n\.consignment-summary-titles\{([^}]*)\}/);
  const badges = styles.match(/\.sec-head-badges,\n\.consignment-summary-badges\{([^}]*)\}/);
  const kicker = styles.match(/\.sec-kicker,\n\.consignment-kicker\{([^}]*)\}/);
  const dot = styles.match(/\.sec-kicker-dot,\n\.con-kicker-dot\{([^}]*)\}/);

  expect(head).not.toBeNull();
  expect(titles).not.toBeNull();
  expect(badges).not.toBeNull();
  expect(kicker).not.toBeNull();
  expect(dot).not.toBeNull();

  expect(head[1]).toMatch(/align-items:flex-start;/);
  expect(head[1]).toMatch(/gap:var\(--space-4\);/);
  expect(titles[1]).toMatch(/min-width:0;/);

  // The kicker and its dot exist exactly once each, as the aliased pair above.
  // A bare re-declaration later in the sheet would silently win and split the
  // consignment head away from the two new ones again.
  expect(styles.match(/\.consignment-kicker\{/g)).toHaveLength(1);
  expect(styles.match(/\.con-kicker-dot\{/g)).toHaveLength(1);

  // The head's only other declaration is the narrow-container stacking inside
  // `con-summary`; the new sections get their own equivalent from `overview-sec`
  // rather than borrowing a container name they are not inside.
  expect(styles).toMatch(
    /@container con-summary \(max-width: 680px\)\{[\s\S]*?\.consignment-summary-head\{flex-direction:column;/,
  );
});

test('a head tints its own kicker so only one section spends the gold accent', () => {
  const kicker = styles.match(/\.sec-kicker,\n\.consignment-kicker\{([^}]*)\}/)[1];
  const dot = styles.match(/\.sec-kicker-dot,\n\.con-kicker-dot\{([^}]*)\}/)[1];

  // Both fall back to gold, so an untagged head is unchanged.
  expect(kicker).toMatch(/color:var\(--sec-accent,var\(--gold\)\);/);
  expect(dot).toMatch(/background:var\(--sec-accent,var\(--gold\)\);/);
  // The dot must not size to zero when the head is a flex row.
  expect(dot).toMatch(/flex:none;/);

  // `.is-muted` re-points the accent at the neutral slate rather than at a new
  // hardcoded colour, so it themes itself in both light and dark.
  expect(styles).toMatch(/\.sec-head\.is-muted\{--sec-accent:var\(--slate\);\}/);
});

test('section spacing beats the spacing between the cards inside a section', () => {
  const section = styles.match(/\.overview-section\{([^}]*)\}/);
  expect(section).not.toBeNull();
  // One step of the spacing scale between sections…
  expect(section[1]).toMatch(/margin-bottom:var\(--space-6\);/);
  // …and the section is its own query container, per the house rule that new
  // width-dependent components use @container rather than a viewport breakpoint.
  expect(section[1]).toMatch(/container-type:inline-size;/);
  expect(styles).toMatch(/@container overview-sec \(max-width: 680px\)\{\s*\.sec-head\{flex-direction:column;/);

  // The trailing card margin inside a section is zeroed, so the gap between
  // two sections is exactly one step and never the sum of two.
  expect(styles).toMatch(
    /\.overview-section > :last-child,\n\.overview-section > :last-child > :last-child\{margin-bottom:0;\}/,
  );
});
