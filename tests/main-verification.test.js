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
    expect(mainContent).toContain('payload.metadata = `order_number:${selectedOrderNumber}`');
  });

  it('adds customer-paid shipping to the Tax Center income ledger', () => {
    expect(mainContent).toContain("type: 'Shipping income'");
    expect(mainContent).toContain("sourceType: 'shippingIncome'");
    expect(mainContent).toContain('Number(h.shippingPaid)');
  });
});
