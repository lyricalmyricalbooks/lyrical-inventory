import { describe, expect, it } from 'vitest';
import { buildHarness } from './helpers/extract-decl.js';
import { escapeHtml } from '../src/lib/html.js';
import { isUnresolvedShippoPostage, needsAmountAttention } from '../src/lib/shipping-reconciliation.js';

function reviewDom() {
  document.body.innerHTML = `<section class="shipping-reconciliation">
    <span id="shipping-reconciliation-count"></span>
    <div id="shipping-amount-review-list"></div>
    <div id="shipping-reconciliation-list"></div>
  </section><button id="shipping-reconciliation-open" hidden></button>`;
  return document;
}

describe('shipping label review', () => {
  it('keeps a missing price visible even after the order was matched, then clears it when resolved', () => {
    const dom = reviewDom();
    const expense = {
      id: 1, ref: 'postage:EE123', amountUnknown: true, shippingMatchStatus: 'matched',
      postageSource: 'email', postageEmailFrom: 'Carrier <receipts@example.com>',
      postageEmailSubject: 'Your label', desc: 'Shipping label', trackingNumber: 'EE123',
    };
    const { renderShippingReconciliationWorklist } = buildHarness({
      names: ['renderShippingReconciliationWorklist'],
      deps: {
        $: id => dom.getElementById(id),
        document: dom,
        isAuthor: () => false,
        TAX_CENTER: { businessExpenses: [expense] },
        isUnresolvedShippoPostage,
        needsAmountAttention,
        getShippingReconciliationOrders: () => [],
        escapeHtml,
      },
      returns: '{ renderShippingReconciliationWorklist }',
    });

    renderShippingReconciliationWorklist();
    const row = dom.querySelector('.shipping-amount-row');
    expect(row?.textContent).toContain('Shipping confirmation email');
    expect(row?.textContent).toContain('Carrier <receipts@example.com>');
    expect(row?.querySelector('button')?.dataset.ref).toBe('postage:EE123');
    expect(dom.querySelector('#shipping-reconciliation-list .shipping-reconciliation-row')).toBeNull();

    expense.amountUnknown = false;
    renderShippingReconciliationWorklist();
    expect(dom.querySelector('.shipping-amount-row')).toBeNull();
    expect(dom.getElementById('shipping-amount-review-list').textContent)
      .toContain('No labels need a postage amount');
  });

  it('takes an email alert to the matching amount task', () => {
    const dom = reviewDom();
    dom.querySelector('.shipping-reconciliation').innerHTML +=
      '<div class="shipping-amount-row" data-source="canadapost"><button>Canada Post task</button></div>' +
      '<div class="shipping-amount-row" data-source="email"><button>Email task</button></div>';
    HTMLElement.prototype.scrollIntoView = () => {};
    const visited = [];
    const { openShippingReconciliationFromAlert } = buildHarness({
      names: ['openShippingReconciliationFromAlert'],
      deps: {
        document: dom,
        dismissAppAlert: id => visited.push(id),
        switchTab: tab => visited.push(tab),
        switchTaxCenterSubTab: tab => visited.push(tab),
        openShippingReconciliation: () => visited.push('review'),
      },
      returns: '{ openShippingReconciliationFromAlert }',
    });

    openShippingReconciliationFromAlert(null, 'email');
    expect(visited).toEqual(['shippo-labels', 'postage-sweep-your-email', 'taxcenter', 'integrations', 'review']);
    expect(dom.activeElement.textContent).toBe('Email task');
  });
});
