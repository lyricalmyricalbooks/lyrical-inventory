import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
const styleCss = readFileSync(resolve(__dirname, '../src/style.css'), 'utf8');
const mainJs = readFileSync(resolve(__dirname, '../src/main.js'), 'utf8');
const taxcentreJs = readFileSync(resolve(__dirname, '../src/features/taxcentre.js'), 'utf8');

describe('Tax Centre Sub-Navigation Layout', () => {
  it('defines the 3 subtab buttons with matching IDs and handlers in index.html', () => {
    expect(html).toContain('id="btn-tctab-ledger"');
    expect(html).toContain('id="btn-tctab-receipts"');
    expect(html).toContain('id="btn-tctab-integrations"');
    expect(html).toContain("onclick=\"switchTaxCenterSubTab('ledger')\"");
    expect(html).toContain("onclick=\"switchTaxCenterSubTab('receipts')\"");
    expect(html).toContain("onclick=\"switchTaxCenterSubTab('integrations')\"");
  });

  it('defines the 3 section container elements in index.html', () => {
    expect(html).toContain('id="tc-sec-ledger"');
    expect(html).toContain('id="tc-sec-receipts"');
    expect(html).toContain('id="tc-sec-integrations"');
  });

  it('declares switchTaxCenterSubTab in taxcentre.js and exports it', () => {
    expect(taxcentreJs).toContain('function switchTaxCenterSubTab(');
    expect(taxcentreJs).toContain('switchTaxCenterSubTab,');
  });

  it('imports and exposes switchTaxCenterSubTab in main.js', () => {
    expect(mainJs).toContain('switchTaxCenterSubTab,');
    expect(mainJs).toMatch(/switchTaxCenterSubTab/);
  });

  it('applies sub-tab and sub-nav styling in style.css', () => {
    expect(styleCss).toContain('.tc-sub-nav');
    expect(styleCss).toContain('.settings-sub-tab');
    expect(styleCss).toContain('.settings-section');
  });
});
