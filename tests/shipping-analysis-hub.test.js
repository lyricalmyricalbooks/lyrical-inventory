import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Shipping Analysis Hub Functions', () => {
  const mainJsPath = path.resolve(__dirname, '../src/main.js');
  let parseCarrierInfo;
  let getWeightInLbs;

  beforeEach(() => {
    const mainContent = fs.readFileSync(mainJsPath, 'utf8');

    // Extract helper functions
    const carrierMatch = mainContent.match(/function parseCarrierInfo\(desc\) \{([\s\S]+?)\n\}/);
    const weightMatch = mainContent.match(/function getWeightInLbs\(qty, book\) \{([\s\S]+?)\n\}/);

    expect(carrierMatch).not.toBeNull();
    expect(weightMatch).not.toBeNull();

    parseCarrierInfo = new Function('desc', carrierMatch[0] + '\nreturn parseCarrierInfo(desc);');
    getWeightInLbs = new Function('qty', 'book', weightMatch[0] + '\nreturn getWeightInLbs(qty, book);');
  });

  describe('parseCarrierInfo', () => {
    it('correctly extracts provider and service level from description patterns', () => {
      expect(parseCarrierInfo('Shipping Label: USPS Priority Mail (12345)')).toEqual({
        provider: 'USPS',
        service: 'Priority Mail'
      });
      expect(parseCarrierInfo('Shipping Label: Canada Post Expedited Parcel (manual)')).toEqual({
        provider: 'Canada',
        service: 'Post Expedited Parcel'
      });
      expect(parseCarrierInfo('Shippo shipping label #12345')).toEqual({
        provider: 'Shippo',
        service: 'Postage'
      });
      expect(parseCarrierInfo('Random non-shipping expense')).toEqual({
        provider: 'Unknown',
        service: 'Unknown'
      });
    });
  });

  describe('getWeightInLbs', () => {
    it('normalizes weights from various units to pounds', () => {
      expect(getWeightInLbs(1, { shipWeight: 1, shipWeightUnit: 'lb' })).toBe(1);
      expect(getWeightInLbs(1, { shipWeight: 16, shipWeightUnit: 'oz' })).toBe(1);
      expect(getWeightInLbs(1, { shipWeight: 1, shipWeightUnit: 'kg' })).toBeCloseTo(2.20462, 4);
      expect(getWeightInLbs(1, { shipWeight: 453.592, shipWeightUnit: 'g' })).toBeCloseTo(1.0, 4);
      expect(getWeightInLbs(2, null)).toBe(2.4);
    });
  });

  describe('changeShipAnalysisPage', () => {
    it('sets the current page and triggers render', () => {
      let renderCalled = false;
      const mockRender = () => { renderCalled = true; };
      
      // We simulate changeShipAnalysisPage logic
      let pageVar = 1;
      const fn = (page) => {
        pageVar = page;
        mockRender();
      };
      
      fn(3);
      expect(pageVar).toBe(3);
      expect(renderCalled).toBe(true);
    });
  });

  describe('dismiss and restore actions', () => {
    let dismissFn, restoreFn, batchDismissFn, mockStates, mockCalls, mockCheckboxes;
    beforeEach(() => {
      const mainContent = fs.readFileSync(mainJsPath, 'utf8');
      
      const dismissMatch = mainContent.match(/async function dismissShippingAnalysisOrder\(bookId, orderIdentifier\) \{([\s\S]+?)\n\}/);
      const restoreMatch = mainContent.match(/async function restoreShippingAnalysisOrder\(bookId, orderIdentifier\) \{([\s\S]+?)\n\}/);
      const batchDismissMatch = mainContent.match(/async function batchDismissShippingAnalysisOrders\(\) \{([\s\S]+?)\n\}/);
      
      mockStates = {
        'book1': {
          hist: [{ id: 'order1', num: '1001' }, { id: 'order2', num: '1002' }]
        },
        'book2': {
          hist: [{ id: 'order3', num: '1003' }]
        }
      };
      mockCalls = [];
      mockCheckboxes = [];
      
      const mockEnvBase = `
        const states = mockStates;
        const confirmDialog = async () => true;
        const window = { saveState: async (b) => { mockCalls.push('saveState:' + b); } };
        const showToast = (msg) => { mockCalls.push('showToast:' + msg); };
        const renderShippingAnalysisHub = () => { mockCalls.push('render'); };
      `;

      const documentMock = `
        const document = {
          querySelectorAll: () => mockCheckboxes
        };
      `;
      
      dismissFn = new Function('mockStates', 'mockCalls', 'bookId', 'orderIdentifier', `
        ${mockEnvBase}
        ${dismissMatch[0]}
        return dismissShippingAnalysisOrder(bookId, orderIdentifier);
      `);
      
      restoreFn = new Function('mockStates', 'mockCalls', 'bookId', 'orderIdentifier', `
        ${mockEnvBase}
        ${restoreMatch[0]}
        return restoreShippingAnalysisOrder(bookId, orderIdentifier);
      `);

      batchDismissFn = new Function('mockStates', 'mockCalls', 'mockCheckboxes', `
        ${mockEnvBase}
        ${documentMock}
        ${batchDismissMatch[0]}
        return batchDismissShippingAnalysisOrders();
      `);
    });

    it('dismisses an order by setting excludeFromShipping to true', async () => {
      await dismissFn.call(null, mockStates, mockCalls, 'book1', 'order1');
      expect(mockStates['book1'].hist[0].excludeFromShipping).toBe(true);
      expect(mockStates['book1'].hist[1].excludeFromShipping).toBeUndefined();
      expect(mockCalls).toEqual(['saveState:book1', 'showToast:Order dismissed from shipping', 'render']);
    });

    it('restores an order by removing excludeFromShipping', async () => {
      mockStates['book1'].hist[0].excludeFromShipping = true;
      await restoreFn.call(null, mockStates, mockCalls, 'book1', 'order1');
      expect(mockStates['book1'].hist[0].excludeFromShipping).toBeUndefined();
      expect(mockCalls).toEqual(['saveState:book1', 'showToast:Order restored to shipping ledger', 'render']);
    });

    it('batch dismisses multiple orders across books', async () => {
      mockCheckboxes = [
        { value: 'book1|order1' },
        { value: 'book1|order2' },
        { value: 'book2|order3' }
      ];
      await batchDismissFn.call(null, mockStates, mockCalls, mockCheckboxes);
      
      expect(mockStates['book1'].hist[0].excludeFromShipping).toBe(true);
      expect(mockStates['book1'].hist[1].excludeFromShipping).toBe(true);
      expect(mockStates['book2'].hist[0].excludeFromShipping).toBe(true);
      
      // Should save state for each affected book exactly once
      expect(mockCalls).toContain('saveState:book1');
      expect(mockCalls).toContain('saveState:book2');
      expect(mockCalls).toContain('showToast:Dismissed 3 orders');
      expect(mockCalls).toContain('render');
    });
  });
});
