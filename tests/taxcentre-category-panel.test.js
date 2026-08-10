import { describe, it, expect } from 'vitest';
import { buildHarness } from './helpers/extract-decl.js';

// _tcRenderCategoryPanel gained real arithmetic when the table grew a "% of
// total" column and a totals row: shares have to sum to the whole, a sub-0.1%
// category has to stay visibly non-zero rather than rounding to "0.0%", and
// the footer has to agree with the rows above it. Those are the parts a
// styling change could silently break, so they are what this suite pins.

function render(expenses) {
  const els = {};
  const el = () => ({ innerHTML: '' });
  const win = {};

  const panel = buildHarness({
    names: ['TC_CATEGORY_RANK_DOTS', '_tcRenderCategoryPanel'],
    deps: {
      $: (id) => (els[id] ||= el()),
      escapeHtml: (s) => String(s).replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
      )),
      fmt: (n) => `CA$${n.toFixed(2)}`,
      window: win,
    },
    returns: '_tcRenderCategoryPanel',
  });

  panel(expenses, 'CAD');
  return {
    body: els['tc-category-body']?.innerHTML ?? '',
    foot: els['tc-category-foot']?.innerHTML ?? '',
    stash: win._tcCategoryDetail,
  };
}

const rows = (html) => html.split('<tr').slice(1);
const pctLabels = (html) => [...html.matchAll(/tc-cat-pct-label"[^>]*>([^<]+)</g)].map((m) => m[1]);
const barWidths = (html) => [...html.matchAll(/con-row-progress-bar" style="width:([\d.]+)%/g)]
  .map((m) => Number(m[1]));

describe('_tcRenderCategoryPanel', () => {
  const ledger = [
    { isIncome: false, cat: 'Printing & Production', baseAmount: 750 },
    { isIncome: false, cat: 'Travel & Meals', baseAmount: 150 },
    { isIncome: false, cat: 'Travel & Meals', baseAmount: 50 },
    { isIncome: false, cat: 'Office Supplies', baseAmount: 50 },
    { isIncome: true, cat: 'Sales', baseAmount: 9999 },
  ];

  it('excludes income and sorts categories by total, largest first', () => {
    const { body } = render(ledger);
    const names = [...body.matchAll(/tc-cat-link"[^>]*>([^<]+)</g)].map((m) => m[1]);
    expect(names).toEqual(['Printing &amp; Production', 'Travel &amp; Meals', 'Office Supplies']);
    expect(body).not.toContain('Sales');
  });

  it('computes each share against the expense-only grand total', () => {
    expect(pctLabels(render(ledger).body)).toEqual(['75%', '20%', '5.0%']);
  });

  it('reports a sub-0.1% category as "<0.1%" rather than "0.0%"', () => {
    const { body } = render([
      { isIncome: false, cat: 'Printing & Production', baseAmount: 31_000 },
      { isIncome: false, cat: 'Office Supplies', baseAmount: 11 },
    ]);
    expect(pctLabels(body)).toEqual(['100%', '&lt;0.1%']);
  });

  it('keeps a tiny share visible as a bar sliver instead of a zero-width bar', () => {
    const { body } = render([
      { isIncome: false, cat: 'Printing & Production', baseAmount: 31_000 },
      { isIncome: false, cat: 'Office Supplies', baseAmount: 11 },
    ]);
    expect(barWidths(body)[1]).toBeGreaterThan(0);
  });

  it('totals the footer to the same transaction count and sum as the rows', () => {
    const { foot } = render(ledger);
    expect(foot).toContain('3 categories');
    expect(foot).toContain('>4<');
    expect(foot).toContain('CA$1000.00');
    expect(foot).toContain('100%');
  });

  it('singularises the footer when one category is present', () => {
    const { foot } = render([{ isIncome: false, cat: 'Home Office', baseAmount: 10 }]);
    expect(foot).toContain('1 category');
  });

  it('renders an empty state and no footer when nothing is deductible', () => {
    const { body, foot } = render([{ isIncome: true, cat: 'Sales', baseAmount: 500 }]);
    expect(body).toContain('empty-state');
    expect(body).toContain('colspan="4"');
    expect(foot).toBe('');
  });

  it('buckets uncategorised expenses rather than dropping them', () => {
    const { body, stash } = render([{ isIncome: false, baseAmount: 40 }]);
    expect(body).toContain('Uncategorized');
    expect(stash.byName.Uncategorized.total).toBe(40);
  });

  it('escapes category names in both the link text and the row title', () => {
    const { body } = render([{ isIncome: false, cat: 'R&D <script>', baseAmount: 10 }]);
    expect(body).toContain('R&amp;D &lt;script&gt;');
    expect(body).not.toContain('<script>');
  });

  it('gives every row a keyboard-reachable button and leaves the row a plain row', () => {
    const { body } = render(ledger);
    expect(rows(body)).toHaveLength(3);
    expect([...body.matchAll(/<button type="button" class="tc-cat-link"/g)]).toHaveLength(3);
    expect(body).not.toContain('role="button"');
  });
});
