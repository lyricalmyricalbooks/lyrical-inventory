import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('main.js window binding verification', () => {
  const mainJsPath = path.resolve(__dirname, '../src/main.js');
  const mainContent = fs.readFileSync(mainJsPath, 'utf8');

  // exposeLegacyInlineHandlers still lives in main.js, but the functions it
  // exposes may now be declared in a feature module and imported. The invariant
  // is unchanged — every exposed name must be defined somewhere in the app —
  // so the search widens to the feature modules rather than the check being
  // weakened.
  const featureDir = path.resolve(__dirname, '../src/features');
  const appSource = [mainContent].concat(
    fs.existsSync(featureDir)
      ? fs.readdirSync(featureDir).filter(f => f.endsWith('.js'))
          .map(f => fs.readFileSync(path.join(featureDir, f), 'utf8'))
      : []
  ).join('\n');

  it('declares every variable/function bound to window in exposeLegacyInlineHandlers', () => {
    expect(fs.existsSync(mainJsPath)).toBe(true);

    // Find the exposeLegacyInlineHandlers block
    const blockMatch = appSource.match(/function exposeLegacyInlineHandlers\(\)\s*\{([\s\S]+?)\n\}/);
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

      const isDefined = regexPatterns.some(regex => regex.test(appSource));
      if (!isDefined) {
        missingDefinitions.push(name);
      }
    });

    expect(missingDefinitions).toEqual([]);
  });

  // Shipping moved to src/features/shipping.js, so these assertions run against
  // the whole app source rather than main.js alone. What they check — that the
  // wiring exists — is unchanged.
  it('wires shipping income, reconciliation, and Shippo order metadata', () => {
    expect(appSource).toContain("type: 'Shipping income'");
    expect(appSource).toContain('function renderOrderShippingSummary');
    expect(appSource).toContain('function renderShippingReconciliationWorklist');
    expect(appSource).toContain('async function linkShippingExpense');
    expect(appSource).toContain('enrichShippoExpense(');
    expect(appSource).toContain('orderNumber: h.num');
    expect(appSource).toContain('payload.metadata = `order_number:${selectedOrderNumber.slice(0, 100)}`');
    expect(appSource).toContain('select.dataset.orderNumber');
    expect(appSource).toContain('selectedOrderNumber.slice(0, 100)');
    expect(appSource).toContain("select.dataset.orderNumber = ''");
  });

  it('renders Shipping P&L as an operational dashboard with a scoped ledger', () => {
    expect(appSource).toContain('shipping-pnl-dashboard');
    expect(appSource).toContain('shipping-pnl-attention');
    expect(appSource).toContain('shipping-pnl-ledger');
    expect(appSource).toContain('shipping-pnl-insights');
    expect(appSource).toContain('shipping-pnl-status');
    expect(appSource).toContain('Postage not linked');
  });

  it('includes a linked order number in Tax Center shipping expense exports', () => {
    expect(appSource).toContain('e.shippingOrderNumber ? `${e.ref || \'\'} · ${e.shippingOrderNumber}` : e.ref || \'\'');
  });

  it('adds customer-paid shipping to the Tax Center income ledger', () => {
    expect(appSource).toContain("type: 'Shipping income'");
    expect(appSource).toContain("sourceType: 'shippingIncome'");
    expect(appSource).toContain('Number(h.shippingPaid)');
  });

  it('keeps Shippo references out of visible worklist copy', () => {
    expect(appSource).toContain('aria-label="Order for postage expense"');
    expect(appSource).not.toContain('<span class="sr-only"> for ${escapeHtml(expense.ref)}</span>');
  });

  it('enriches existing Shippo expenses instead of duplicating them', () => {
    expect(appSource).toContain("const existingExpense = existingExpensesByRef.get(ref)");
    expect(appSource).toContain('stagedExistingEnrichments.push(staged)');
    expect(appSource).toContain('applyShippoExpenseEnrichments(stagedExistingEnrichments)');
    expect(appSource).toContain('fetchShippoContext(token, tx)');
    expect(appSource).toContain('enrichShippoExpense(');
  });

  it('backfills parsed receipt financials onto applied website history', () => {
    expect(appSource).toContain("const financialFields = ['subtotal', 'discountCode', 'discountAmount'");
    expect(appSource).toContain('h.shippingPaid');
    expect(appSource).toContain('h.totalPaid');
    expect(appSource).toContain('const netPrice = Math.round((Number(match.merchandisePaid) / Number(h.qty)) * 100) / 100');
  });

  it('offers a safe reapply path for already-applied website orders', () => {
    expect(appSource).toContain('function reapplyOne');
    expect(appSource).toContain('onclick="reapplyOne');
    expect(appSource).toContain('does not decrement stock');
  });

  it('offers cancel and restore paths for website orders', () => {
    expect(appSource).toContain('function cancelOrder');
    expect(appSource).toContain('function restoreOrder');
    expect(appSource).toContain('function unapplyOne');
    expect(appSource).toContain('onclick="cancelOrder');
    expect(appSource).toContain('onclick="restoreOrder');
    expect(appSource).toContain('onclick="unapplyOne');
    expect(appSource).toContain('show-all-orders-chk');
  });

  it('displays the unit production cost on the book dashboard', () => {
    expect(appSource).toContain('d-stock-sub');
    expect(appSource).toContain('cost / printed');
    expect(appSource).toContain('/book');
  });

  it('makes recent changes commits clickable in the Whats New modal', () => {
    expect(appSource).toContain('class="commit-item"');
    expect(appSource).toContain('fullSha');
    expect(appSource).toContain('https://github.com/lyricalmyricalbooks/lyrical-inventory/commit/');
  });

  it('supports percentage discount in recalcInvoiceTotals and saveInvoice', () => {
    expect(appSource).toContain("discountType: totals.discountType || 'flat'");
    expect(appSource).toContain("discountRate: totals.discountRate || 0");
    expect(appSource).toContain("function onDiscountTypeChange");
  });

  it('supports local storage state persistence for shipping recommendation card controls', () => {
    expect(appSource).toContain("function getShipRecoMode");
    expect(appSource).toContain("function getShipWeightOverride");
    expect(appSource).toContain("function onShipInsightsToggle");
    expect(appSource).toContain("localStorage.setItem(`lm-ship-reco-mode-${shipAnalysisBookFilter}`, val)");
    expect(appSource).toContain("localStorage.setItem(`lm-ship-insights-open-${shipAnalysisBookFilter}`, isOpen ? 'true' : 'false')");
  });
});
