import { describe, expect, it } from 'vitest';
import { buildHarness } from './helpers/extract-decl.js';
import { escapeHtml } from '../src/lib/html.js';
import { isUnresolvedShippoPostage, needsAmountAttention } from '../src/lib/shipping-reconciliation.js';

function summaryDom() {
  document.body.innerHTML = '<p id="shipping-review-summary"></p>';
  return document;
}

describe('shipping label review', () => {
  const harness = (dom, expenses) => buildHarness({
    names: ['renderShippingReconciliationWorklist'],
    deps: {
      $: id => dom.getElementById(id),
      isAuthor: () => false,
      labelReviewEntries: () => expenses.map(expense => ({
        expense, needsAmount: needsAmountAttention(expense), needsOrder: isUnresolvedShippoPostage(expense),
      })).filter(e => e.needsAmount || e.needsOrder),
    },
    returns: '{ renderShippingReconciliationWorklist }',
  }).renderShippingReconciliationWorklist;

  it('tells the Tax Centre how many labels wait in the review inbox, and what each needs', () => {
    const dom = summaryDom();
    const expenses = [
      { ref: 'postage:EE1', amountUnknown: true, shippingMatchStatus: 'matched' },
      { ref: 'postage:EE2', shippingMatchStatus: 'unmatched' },
    ];
    harness(dom, expenses)();
    expect(dom.getElementById('shipping-review-summary').textContent)
      .toBe('2 labels waiting for review: 1 needs an amount, 1 needs an order link.');
    expenses.length = 0;
    harness(dom, expenses)();
    expect(dom.getElementById('shipping-review-summary').textContent).toBe('No labels are waiting for review.');
  });

  it('opens the review inbox on the labels from an email alert, and clears the alert cards', () => {
    const visited = [];
    const { openShippingReconciliationFromAlert } = buildHarness({
      names: ['openShippingReconciliationFromAlert'],
      deps: {
        dismissAppAlert: id => visited.push(id),
        openReviewInbox: opts => visited.push(`inbox:${opts.filter}`),
      },
      returns: '{ openShippingReconciliationFromAlert }',
    });

    openShippingReconciliationFromAlert(null, 'email');
    expect(visited).toEqual(['shippo-labels', 'postage-sweep-your-email', 'inbox:label']);
  });

  it('discards only the selected imported expense and remembers its ref across scans', async () => {
    const selected = { ref: 'postage:EE123', desc: 'UPS label', amountUnknown: true, postageSource: 'email' };
    const other = { ref: 'postage:EE456', desc: 'Another label', amountUnknown: true };
    const taxCenter = { businessExpenses: [selected, other] };
    let saved = null;
    const { discardImportedPostageExpense, knownImportedPostageRefs } = buildHarness({
      names: ['discardImportedPostageExpense', 'knownImportedPostageRefs'],
      deps: {
        TAX_CENTER: taxCenter,
        cpText: value => String(value || '').trim(),
        needsAmountAttention,
        confirmDialog: async () => true,
        saveTaxCenter: async () => { saved = [...taxCenter.businessExpenses]; },
        dismissAppAlert: () => {},
        renderTaxCenter: () => {},
        renderShippingAnalysisHub: () => {},
        renderPostageMatchWorklist: () => {},
        showToast: () => {},
      },
      returns: '{ discardImportedPostageExpense, knownImportedPostageRefs }',
    });

    await discardImportedPostageExpense(selected.ref);
    expect(saved).toEqual([other]);
    expect(taxCenter.discardedPostageRefs).toEqual([selected.ref]);
    expect(knownImportedPostageRefs().has(selected.ref)).toBe(true);
    expect(knownImportedPostageRefs().has(other.ref)).toBe(true);
  });

  it('keeps the expense if saving its discard fails', async () => {
    const selected = { ref: 'postage:EE123', amountUnknown: true };
    const taxCenter = { businessExpenses: [selected] };
    const messages = [];
    const { discardImportedPostageExpense } = buildHarness({
      names: ['discardImportedPostageExpense'],
      deps: {
        TAX_CENTER: taxCenter,
        needsAmountAttention,
        confirmDialog: async () => true,
        saveTaxCenter: async () => { throw new Error('offline'); },
        console: { error: () => {} },
        showToast: message => messages.push(message),
      },
      returns: '{ discardImportedPostageExpense }',
    });

    await discardImportedPostageExpense(selected.ref);
    expect(taxCenter.businessExpenses).toEqual([selected]);
    expect(taxCenter.discardedPostageRefs).toBeUndefined();
    expect(messages).toContain('Could not discard that label. Please try again.');
  });
});
