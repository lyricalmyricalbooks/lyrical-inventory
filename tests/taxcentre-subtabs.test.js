import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
const styleCss = readFileSync(resolve(__dirname, '../src/style.css'), 'utf8');
const mainJs = readFileSync(resolve(__dirname, '../src/main.js'), 'utf8');
const taxcentreJs = readFileSync(resolve(__dirname, '../src/features/taxcentre.js'), 'utf8');

describe('Tax Centre, Receipts & Stripe Sub-Navigation Layout', () => {
  it('defines the Tax Centre subtab buttons (Expenses & Ledger, Missing Costs) in index.html', () => {
    expect(html).toContain('id="btn-tctab-ledger"');
    expect(html).toContain('id="btn-tctab-deductions"');
    expect(html).toContain("onclick=\"switchTaxCenterSubTab('ledger')\"");
    expect(html).toContain("onclick=\"switchTaxCenterSubTab('deductions')\"");
  });

  it('defines the Receipts page subtab buttons (Receipts Vault, Email Receipt Import) in index.html', () => {
    expect(html).toContain('id="tab-receipts"');
    expect(html).toContain('id="btn-recptab-vault"');
    expect(html).toContain('id="btn-recptab-email-import"');
    expect(html).toContain("onclick=\"switchReceiptsSubTab('vault')\"");
    expect(html).toContain("onclick=\"switchReceiptsSubTab('email-import')\"");
  });

  it('defines the Stripe page subtab buttons (Payments to reconcile, Stripe fees) in index.html', () => {
    expect(html).toContain('id="tab-reconcile"');
    expect(html).toContain('id="btn-stripetab-payments"');
    expect(html).toContain('id="btn-stripetab-fees"');
    expect(html).toContain("onclick=\"switchStripeSubTab('payments')\"");
    expect(html).toContain("onclick=\"switchStripeSubTab('fees')\"");
  });

  it('defines the section container elements in index.html', () => {
    expect(html).toContain('id="tc-sec-ledger"');
    expect(html).toContain('id="tc-sec-deductions"');
    expect(html).toContain('id="recp-sec-vault"');
    expect(html).toContain('id="recp-sec-email-import"');
    expect(html).toContain('id="stripe-sec-payments"');
    expect(html).toContain('id="stripe-sec-fees"');
  });

  it('declares switchTaxCenterSubTab and switchReceiptsSubTab in taxcentre.js and exports them', () => {
    expect(taxcentreJs).toContain('function switchTaxCenterSubTab(');
    expect(taxcentreJs).toContain('switchTaxCenterSubTab,');
    expect(taxcentreJs).toContain('function switchReceiptsSubTab(');
    expect(taxcentreJs).toContain('switchReceiptsSubTab,');
  });

  it('imports and exposes switchTaxCenterSubTab, switchReceiptsSubTab, and switchStripeSubTab in main.js', () => {
    expect(mainJs).toContain('switchTaxCenterSubTab,');
    expect(mainJs).toContain('switchReceiptsSubTab,');
    expect(mainJs).toContain('switchStripeSubTab,');
  });

  it('applies sub-tab and sub-nav styling in style.css', () => {
    expect(styleCss).toContain('.tc-sub-nav');
    expect(styleCss).toContain('.settings-sub-tab');
    expect(styleCss).toContain('.settings-section');
  });
});
