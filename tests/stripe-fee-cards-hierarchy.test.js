import { describe, it, expect } from 'vitest';
import { buildHarness } from './helpers/extract-decl.js';

// The "Stripe fees by year" cards on the Tax Centre's Payments panel used to
// print two equal-sized 32px figures side by side — the fee total (the
// question this card exists to answer) and the effective rate (context for
// it) — so nothing led and the eye had no entry point. The rate figure also
// coloured itself with the raw `--gold` fill token, which measures 2.49:1 on
// the card's cream background (scripts/contrast-baseline.json), well under
// the 4.5:1 AA floor for normal-weight text — `--gold-text` is the token this
// codebase reserves for a figure meant to read as text (see
// .agents/UX_PATTERNS.md, "Column roles on a wide table").

function makeHarness() {
  return buildHarness({
    names: ['renderStripeFeesCards', '_stripeMinorToMajor', '_stripeFmtMoney', '_stripeFriendlyType'],
    deps: {
      // Stubbed rather than extracted: the real isZeroDecimalCurrency pulls in
      // a Set literal that extractDecl's single-statement heuristic can't
      // isolate cleanly, and this test only needs "not zero-decimal".
      isZeroDecimalCurrency: () => false,
    },
    returns: '{ renderStripeFeesCards }',
  });
}

const data = {
  2026: {
    'CA$': {
      charge: { gross: 100000, fee: 3125, net: 96875, count: 10 },
    },
  },
};
const byYearCurAll = {
  2026: { 'CA$': { gross: 100000, fee: 3125, net: 96875, count: 10 } },
};

describe('renderStripeFeesCards — one figure leads', () => {
  it('sizes the fee total larger than the effective rate beside it', () => {
    const { renderStripeFeesCards } = makeHarness();
    const { cardsHtml } = renderStripeFeesCards(data, byYearCurAll);

    expect(cardsHtml).toContain("font-size:var(--text-3xl);font-weight:500;color:var(--red)");
    expect(cardsHtml).toContain("font-size:var(--text-lg);font-weight:500;color:var(--gold-text)");
  });

  it('never colours the rate figure with the raw fill token', () => {
    // Regression guard: `--gold` as a bare text colour measured 2.49:1 here —
    // below AA. Any reintroduction of `color:var(--gold);` on this figure
    // should fail loudly rather than quietly reopening the contrast gap.
    const { renderStripeFeesCards } = makeHarness();
    const { cardsHtml } = renderStripeFeesCards(data, byYearCurAll);

    expect(cardsHtml).not.toContain('color:var(--gold);');
  });
});
