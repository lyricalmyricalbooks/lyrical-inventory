import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('main.js window binding verification', () => {
  const mainJsPath = path.resolve(__dirname, '../src/main.js');
  const mainContent = fs.readFileSync(mainJsPath, 'utf8');

  it('declares every variable/function bound to window in exposeLegacyInlineHandlers', () => {
    expect(fs.existsSync(mainJsPath)).toBe(true);

    // Find the exposeLegacyInlineHandlers block
    const blockMatch = mainContent.match(/function exposeLegacyInlineHandlers\(\)\s*\{([\s\S]+?)\n\}/);
    expect(blockMatch).not.toBeNull();

    // Extract inside Object.assign(window, { ... })
    const assignMatch = blockMatch[1].match(/Object\.assign\(window,\s*\{([\s\S]+?)\}\)/);
    expect(assignMatch).not.toBeNull();

    const exposedNames = assignMatch[1]
      .split(',')
      .map(name => name.trim())
      .filter(name => name.length > 0 && !name.startsWith('//'));

    expect(exposedNames.length).toBeGreaterThan(100);

    const missingDefinitions = [];

    exposedNames.forEach(name => {
      // Create regexes to locate definition
      const regexPatterns = [
        new RegExp(`function\\s+${name}\\b`),
        new RegExp(`(?:const|let|var)\\s+${name}\\b`),
        new RegExp(`\\b${name}\\s*=`)
      ];

      const isDefined = regexPatterns.some(regex => regex.test(mainContent));
      if (!isDefined) {
        missingDefinitions.push(name);
      }
    });

    expect(missingDefinitions).toEqual([]);
  });

  it('wires shipping income, reconciliation, and Shippo order metadata', () => {
    expect(mainContent).toContain("type: 'Shipping income'");
    expect(mainContent).toContain('function renderOrderShippingSummary');
    expect(mainContent).toContain('function renderShippingReconciliationWorklist');
    expect(mainContent).toContain('async function linkShippingExpense');
    expect(mainContent).toContain('enrichShippoExpense(');
    expect(mainContent).toContain('orderNumber: h.num');
    expect(mainContent).toContain('payload.metadata = `order_number:${selectedOrderNumber.slice(0, 100)}`');
    expect(mainContent).toContain('select.dataset.orderNumber');
    expect(mainContent).toContain('selectedOrderNumber.slice(0, 100)');
    expect(mainContent).toContain("select.dataset.orderNumber = ''");
  });

  it('includes a linked order number in Tax Center shipping expense exports', () => {
    expect(mainContent).toContain('e.shippingOrderNumber ? `${e.ref || \'\'} · ${e.shippingOrderNumber}` : e.ref || \'\'');
  });

  it('adds customer-paid shipping to the Tax Center income ledger', () => {
    expect(mainContent).toContain("type: 'Shipping income'");
    expect(mainContent).toContain("sourceType: 'shippingIncome'");
    expect(mainContent).toContain('Number(h.shippingPaid)');
  });

  it('keeps Shippo references out of visible worklist copy', () => {
    expect(mainContent).toContain('aria-label="Order for postage expense"');
    expect(mainContent).not.toContain('<span class="sr-only"> for ${escapeHtml(expense.ref)}</span>');
  });

  it('enriches existing Shippo expenses instead of duplicating them', () => {
    expect(mainContent).toContain("const existingExpense = existingExpensesByRef.get(ref)");
    expect(mainContent).toContain('stagedExistingEnrichments.push(staged)');
    expect(mainContent).toContain('applyShippoExpenseEnrichments(stagedExistingEnrichments)');
    expect(mainContent).toContain('fetchShippoContext(token, tx)');
    expect(mainContent).toContain('enrichShippoExpense(');
  });

  it('backfills parsed receipt financials onto applied website history', () => {
    expect(mainContent).toContain("const financialFields = ['subtotal', 'discountCode', 'discountAmount'");
    expect(mainContent).toContain('h.shippingPaid');
    expect(mainContent).toContain('h.totalPaid');
    expect(mainContent).toContain('const netPrice = Math.round((Number(match.merchandisePaid) / Number(h.qty)) * 100) / 100');
  });

  it('offers a safe reapply path for already-applied website orders', () => {
    expect(mainContent).toContain('function reapplyOne');
    expect(mainContent).toContain('onclick="reapplyOne');
    expect(mainContent).toContain('does not decrement stock');
  });

  it('offers cancel and restore paths for website orders', () => {
    expect(mainContent).toContain('function cancelOrder');
    expect(mainContent).toContain('function restoreOrder');
    expect(mainContent).toContain('function unapplyOne');
    expect(mainContent).toContain('onclick="cancelOrder');
    expect(mainContent).toContain('onclick="restoreOrder');
    expect(mainContent).toContain('onclick="unapplyOne');
    expect(mainContent).toContain('show-all-orders-chk');
  });

  it('displays the unit production cost on the book dashboard', () => {
    expect(mainContent).toContain('d-unitcost-kpi');
    expect(mainContent).toContain('d-unitcost-val');
    expect(mainContent).toContain('d-unitcost-sub');
    expect(mainContent).toContain('cost / printed');
  });
});
