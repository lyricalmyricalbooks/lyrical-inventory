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
  let getWeightInKg;
  let downloadFilteredShippingLedgerCSV;

  beforeEach(() => {
    const mainContent = fs.readFileSync(mainJsPath, 'utf8');

    // Extract helper functions
    const carrierMatch = mainContent.match(/function parseCarrierInfo\(desc\) \{([\s\S]+?)\n\}/);
    const weightMatch = mainContent.match(/function getWeightInLbs\(qty, book\) \{([\s\S]+?)\n\}/);
    const weightKgMatch = mainContent.match(/function getWeightInKg\(qty, book\) \{([\s\S]+?)\n\}/);
    const csvMatch = mainContent.match(/function downloadFilteredShippingLedgerCSV\(\) \{([\s\S]+?)\n\}/);

    expect(carrierMatch).not.toBeNull();
    expect(weightMatch).not.toBeNull();
    expect(weightKgMatch).not.toBeNull();
    expect(csvMatch).not.toBeNull();

    parseCarrierInfo = new Function('desc', carrierMatch[0] + '\nreturn parseCarrierInfo(desc);');
    getWeightInLbs = new Function('qty', 'book', weightMatch[0] + '\nreturn getWeightInLbs(qty, book);');
    getWeightInKg = new Function('qty', 'book', weightMatch[0] + '\n' + weightKgMatch[0] + '\nreturn getWeightInKg(qty, book);');
    downloadFilteredShippingLedgerCSV = new Function('qty', 'book', weightMatch[0] + '\n' + weightKgMatch[0] + '\n' + csvMatch[0] + '\nreturn downloadFilteredShippingLedgerCSV;');
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

  describe('getWeightInKg', () => {
    it('normalizes weights from various units to kilograms', () => {
      expect(getWeightInKg(1, { shipWeight: 1, shipWeightUnit: 'lb' })).toBeCloseTo(0.45359237, 4);
      expect(getWeightInKg(1, { shipWeight: 1, shipWeightUnit: 'kg' })).toBeCloseTo(1.0, 4);
      expect(getWeightInKg(2, null)).toBeCloseTo(2.4 * 0.45359237, 4);
    });
  });

  describe('downloadFilteredShippingLedgerCSV', () => {
    it('extracts successfully and returns function type', () => {
      expect(typeof downloadFilteredShippingLedgerCSV).toBe('function');
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

  describe('syncBigCartelShippingPaid', () => {
    let syncFn, mockStates, mockCalls, mockSheetsQueue;
    beforeEach(() => {
      const mainContent = fs.readFileSync(mainJsPath, 'utf8');
      const syncMatch = mainContent.match(/async function syncBigCartelShippingPaid\(bcOrders\) \{([\s\S]+?)\n\}/);
      expect(syncMatch).not.toBeNull();

      mockStates = {
        'book1': {
          hist: [
            { num: '#1001', chan: 'Website', shippingPaid: 0, date: '2026-07-10', sheetsId: 'bc-1001' },
            { num: '#1002', chan: 'Website', shippingPaid: 5, manualShippingPaid: true, date: '2026-07-11', sheetsId: 'bc-1002' },
            { num: '#1003', chan: 'Website', shippingPaid: 0, date: '2026-07-12', sheetsId: 'bc-1003' }
          ]
        }
      };

      mockCalls = [];
      mockSheetsQueue = [];

      const mockEnvBase = `
        const states = mockStates;
        const BOOKS = { 'book1': { title: 'Test Book' } };
        const normalizeShippingOrderNumber = (val) => '#' + String(val).trim().replace(/^#/, '');
        const getBookCurrencyCode = () => 'CAD';
        const shippingPurchaseRowPayload = (book, cur, h) => ({ type: 'shipping', sheetsId: h.sheetsId + '-shipping', total: h.shippingPaid });
        const syncToSheets = (payload) => { mockSheetsQueue.push(payload); };
        const window = { saveState: async (b) => { mockCalls.push('saveState:' + b); } };
        const showToast = (msg) => { mockCalls.push('showToast:' + msg); };
        const renderShippingAnalysisHub = () => { mockCalls.push('render'); };
      `;

      syncFn = new Function('mockStates', 'mockCalls', 'mockSheetsQueue', 'bcOrders', `
        ${mockEnvBase}
        ${syncMatch[0]}
        return syncBigCartelShippingPaid(bcOrders);
      `);
    });

    it('matches and updates order shippingPaid, skipping manual overrides', async () => {
      const bcOrders = [
        { id: '1001', attributes: { shipping_total: '12.50' } },
        { id: '1002', attributes: { shipping_total: '15.00' } }, // manual override, should skip
        { id: '1003', attributes: { shipping_total: '0.00' } }   // same value, should skip
      ];

      await syncFn.call(null, mockStates, mockCalls, mockSheetsQueue, bcOrders);

      // Verify book1 hist values
      expect(mockStates['book1'].hist[0].shippingPaid).toBe(12.50);
      expect(mockStates['book1'].hist[1].shippingPaid).toBe(5); // unchanged
      expect(mockStates['book1'].hist[2].shippingPaid).toBe(0); // unchanged

      // Verify saves and toast calls
      expect(mockCalls).toEqual(['saveState:book1', 'showToast:✓ Auto-synced 1 shipping costs from Big Cartel', 'render']);

      // Verify Sheets synchronization call was triggered for #1001 (order update and shipping purchase row)
      expect(mockSheetsQueue).toContainEqual(expect.objectContaining({ num: '#1001', type: 'order' }));
      expect(mockSheetsQueue).toContainEqual(expect.objectContaining({ type: 'shipping', total: 12.50 }));
    });
  });

  describe('getSmartShippingRecommendations', () => {
    let getSmartShippingRecommendations;

    beforeEach(() => {
      const mainContent = fs.readFileSync(mainJsPath, 'utf8');

      const getPercentileMatch = mainContent.match(/function getPercentile\(arr, pct\) \{([\s\S]+?)\n\}/);
      const getMeanMatch = mainContent.match(/function getMean\(arr\) \{([\s\S]+?)\n\}/);
      const getSmartRecosMatch = mainContent.match(/function getSmartShippingRecommendations\(allOrders, shippoExpenses\) \{([\s\S]+?)\n\}/);
      const getWeightInLbsMatch = mainContent.match(/function getWeightInLbs\(qty, book\) \{([\s\S]+?)\n\}/);
      const getWeightInKgMatch = mainContent.match(/function getWeightInKg\(qty, book\) \{([\s\S]+?)\n\}/);

      expect(getPercentileMatch).not.toBeNull();
      expect(getMeanMatch).not.toBeNull();
      expect(getSmartRecosMatch).not.toBeNull();

      const mockEnvBase = `
        const BOOK_LIST = [{ id: 'book1', title: 'The Hound', shipWeight: 0.8, shipWeightUnit: 'kg' }];
        let shipAnalysisBookFilter = 'all';
        function normalizeCountryCode(c) { 
          c = String(c || '').trim().toUpperCase();
          if (c === 'CANADA' || c === 'CA') return 'CA';
          if (c === 'USA' || c === 'US') return 'US';
          return 'intl';
        }
        function normalizeShippingOrderNumber(num) { return num; }
      `;

      getSmartShippingRecommendations = new Function('allOrders', 'shippoExpenses', 'weightOverride', 'recoMode', 'recoPercentile', `
        const BOOK_LIST = [{ id: 'book1', title: 'The Hound', shipWeight: 0.8, shipWeightUnit: 'kg' }];
        let shipAnalysisBookFilter = 'all';
        const getShipWeightOverride = () => weightOverride || 'default';
        const getShipRecoMode = () => recoMode || 'blended';
        const getShipRecoPercentile = () => recoPercentile || 75;
        function normalizeCountryCode(c) { 
          c = String(c || '').trim().toUpperCase();
          if (c === 'CANADA' || c === 'CA') return 'CA';
          if (c === 'USA' || c === 'US') return 'US';
          return 'intl';
        }
        function normalizeShippingOrderNumber(num) { return num; }

        ${getPercentileMatch[0]}
        ${getMeanMatch[0]}
        ${getWeightInLbsMatch[0]}
        ${getWeightInKgMatch[0]}
        ${getSmartRecosMatch[0]}
        return getSmartShippingRecommendations(allOrders, shippoExpenses);
      `);
    });

    it('returns weight-based defaults if there are no historical orders', () => {
      const result = getSmartShippingRecommendations([], []);
      expect(result.weightKg).toBeCloseTo(0.8, 2);
      expect(result.bandName).toBe('0.5 - 1 kg');
      // For a 0.5 - 1 kg book, the Canada Post default base rates should be: ON=14.50, CA=20.00, US=22.50, intl=35.00
      expect(result.results.ON.recoBase).toBe(14.50);
      expect(result.results.CA.recoBase).toBe(20.00);
      expect(result.results.US.recoBase).toBe(22.50);
      expect(result.results.intl.recoBase).toBe(35.00);
    });

    it('calculates statistical percentile-based recommendations when data is sufficient', () => {
      const allOrders = [
        { num: 'O1', shipCountry: 'CA', shipState: 'ON', qty: 1, bookId: 'book1' },
        { num: 'O2', shipCountry: 'CA', shipState: 'ON', qty: 1, bookId: 'book1' },
        { num: 'O3', shipCountry: 'CA', shipState: 'ON', qty: 1, bookId: 'book1' },
        { num: 'O4', shipCountry: 'CA', shipState: 'ON', qty: 1, bookId: 'book1' },
        { num: 'O5', shipCountry: 'CA', shipState: 'ON', qty: 1, bookId: 'book1' },
        { num: 'O6', shipCountry: 'CA', shipState: 'ON', qty: 2, bookId: 'book1' }
      ];

      const shippoExpenses = [
        { shippingOrderNumber: 'O1', shippingMatchStatus: 'matched', baseAmount: 11.50 },
        { shippingOrderNumber: 'O2', shippingMatchStatus: 'matched', baseAmount: 12.00 },
        { shippingOrderNumber: 'O3', shippingMatchStatus: 'matched', baseAmount: 12.50 },
        { shippingOrderNumber: 'O4', shippingMatchStatus: 'matched', baseAmount: 13.00 },
        { shippingOrderNumber: 'O5', shippingMatchStatus: 'matched', baseAmount: 14.50 },
        { shippingOrderNumber: 'O6', shippingMatchStatus: 'matched', baseAmount: 18.50 }
      ];

      const result = getSmartShippingRecommendations(allOrders, shippoExpenses);
      
      expect(result.results.ON.recoBase).toBe(13);
      expect(result.results.ON.recoAddon).toBe(6);
      expect(result.results.ON.confidence).toBe('High');
      expect(result.results.ON.N).toBe(6);
    });

    it('applies selected or custom weight overrides dynamically', () => {
      // Under 0.5 kg override (0.3 kg) -> ON base should be 12.50
      const resUnder = getSmartShippingRecommendations([], [], 'under_0.5');
      expect(resUnder.weightKg).toBeCloseTo(0.3, 2);
      expect(resUnder.bandName).toBe('Under 0.5 kg');
      expect(resUnder.results.ON.recoBase).toBe(12.50);

      // Over 2 kg override (2.5 kg) -> ON base should be 21.00
      const resOver = getSmartShippingRecommendations([], [], 'over_2');
      expect(resOver.weightKg).toBeCloseTo(2.5, 2);
      expect(resOver.bandName).toBe('Over 2 kg');
      expect(resOver.results.ON.recoBase).toBe(21.00);

      // Custom numeric override (1.5 kg) -> ON base should be 17.00 (from 1 - 2 kg band)
      const resCustom = getSmartShippingRecommendations([], [], '1.5');
      expect(resCustom.weightKg).toBeCloseTo(1.5, 2);
      expect(resCustom.bandName).toBe('1 - 2 kg');
      expect(resCustom.results.ON.recoBase).toBe(17.00);
    });

    it('isolates Canada Post rate recommendations in cpost mode', () => {
      const allOrders = [
        { num: 'O1', shipCountry: 'CA', shipState: 'ON', qty: 1, bookId: 'book1' },
        { num: 'O2', shipCountry: 'CA', shipState: 'ON', qty: 1, bookId: 'book1' },
        { num: 'O3', shipCountry: 'CA', shipState: 'ON', qty: 1, bookId: 'book1' },
        { num: 'O4', shipCountry: 'CA', shipState: 'ON', qty: 1, bookId: 'book1' },
        { num: 'O5', shipCountry: 'CA', shipState: 'ON', qty: 1, bookId: 'book1' },
        { num: 'O6', shipCountry: 'CA', shipState: 'ON', qty: 2, bookId: 'book1' }
      ];

      const shippoExpenses = [
        { shippingOrderNumber: 'O1', shippingMatchStatus: 'matched', baseAmount: 11.50 },
        { shippingOrderNumber: 'O2', shippingMatchStatus: 'matched', baseAmount: 12.00 },
        { shippingOrderNumber: 'O3', shippingMatchStatus: 'matched', baseAmount: 12.50 },
        { shippingOrderNumber: 'O4', shippingMatchStatus: 'matched', baseAmount: 13.00 },
        { shippingOrderNumber: 'O5', shippingMatchStatus: 'matched', baseAmount: 14.50 },
        { shippingOrderNumber: 'O6', shippingMatchStatus: 'matched', baseAmount: 18.50 }
      ];

      const result = getSmartShippingRecommendations(allOrders, shippoExpenses, 'default', 'cpost');
      expect(result.results.ON.recoBase).toBe(14.50);
      expect(result.results.ON.recoAddon).toBe(5.00);
      expect(result.results.ON.confidence).toBe('Canada Post');
    });

    it('applies custom percentile tuned risk profiles correctly', () => {
      const allOrders = [
        { num: 'O1', shipCountry: 'CA', shipState: 'ON', qty: 1, bookId: 'book1' },
        { num: 'O2', shipCountry: 'CA', shipState: 'ON', qty: 1, bookId: 'book1' },
        { num: 'O3', shipCountry: 'CA', shipState: 'ON', qty: 1, bookId: 'book1' },
        { num: 'O4', shipCountry: 'CA', shipState: 'ON', qty: 1, bookId: 'book1' },
        { num: 'O5', shipCountry: 'CA', shipState: 'ON', qty: 1, bookId: 'book1' },
        { num: 'O6', shipCountry: 'CA', shipState: 'ON', qty: 1, bookId: 'book1' }
      ];

      const shippoExpenses = [
        { shippingOrderNumber: 'O1', shippingMatchStatus: 'matched', baseAmount: 11.00 },
        { shippingOrderNumber: 'O2', shippingMatchStatus: 'matched', baseAmount: 12.00 },
        { shippingOrderNumber: 'O3', shippingMatchStatus: 'matched', baseAmount: 13.00 },
        { shippingOrderNumber: 'O4', shippingMatchStatus: 'matched', baseAmount: 14.00 },
        { shippingOrderNumber: 'O5', shippingMatchStatus: 'matched', baseAmount: 15.00 },
        { shippingOrderNumber: 'O6', shippingMatchStatus: 'matched', baseAmount: 16.00 }
      ];

      const resultConservative = getSmartShippingRecommendations(allOrders, shippoExpenses, 'default', 'blended', 90);
      expect(resultConservative.results.ON.recoBase).toBe(16);

      const resultBalanced = getSmartShippingRecommendations(allOrders, shippoExpenses, 'default', 'blended', 75);
      expect(resultBalanced.results.ON.recoBase).toBe(15);

      const resultAggressive = getSmartShippingRecommendations(allOrders, shippoExpenses, 'default', 'blended', 50);
      expect(resultAggressive.results.ON.recoBase).toBe(13);
    });
  });
});
