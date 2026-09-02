import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Apps Script Integration', () => {
  // The Apps Script source is no longer embedded inline in index.html (that
  // ~50 KB block was removed to keep it off every page load). Instead the
  // "Connect your Google Sheet" tab lazy-fetches public/gas-code.txt, which is
  // a verbatim copy of Code.gs. These tests lock in that new contract.
  const codeGsPath = path.resolve(__dirname, '../apps-script/Code.gs');
  const gasCodeTxtPath = path.resolve(__dirname, '../public/gas-code.txt');
  const indexHtmlPath = path.resolve(__dirname, '../index.html');

  it('public/gas-code.txt is a verbatim copy of Code.gs', () => {
    expect(fs.existsSync(codeGsPath)).toBe(true);
    expect(fs.existsSync(gasCodeTxtPath)).toBe(true);

    const codeContent = fs.readFileSync(codeGsPath, 'utf8');
    const gasCodeTxt = fs.readFileSync(gasCodeTxtPath, 'utf8');

    expect(gasCodeTxt).toBe(codeContent);
  });

  it('Code.gs line 1 header version matches doGet scriptVersion and main.js EXPECTED_SCRIPT_VERSION', () => {
    const codeContent = fs.readFileSync(codeGsPath, 'utf8');
    const mainJsPath = path.resolve(__dirname, '../src/main.js');
    const mainContent = fs.readFileSync(mainJsPath, 'utf8');

    const firstLine = codeContent.split('\n')[0];
    const headerMatch = firstLine.match(/Unified Backend \((v\d+)\)/);
    expect(headerMatch, 'Code.gs line 1 must declare Unified Backend (vXX)').not.toBeNull();
    const headerVer = headerMatch[1];

    const doGetMatch = codeContent.match(/scriptVersion:\s*'(v\d+)'/);
    expect(doGetMatch, 'Code.gs doGet must declare scriptVersion: "vXX"').not.toBeNull();
    const doGetVer = doGetMatch[1];

    const mainMatch = mainContent.match(/const EXPECTED_SCRIPT_VERSION\s*=\s*'(v\d+)';/);
    expect(mainMatch, 'main.js must declare const EXPECTED_SCRIPT_VERSION = "vXX"').not.toBeNull();
    const mainVer = mainMatch[1];

    expect(headerVer).toBe(doGetVer);
    expect(mainVer).toBe(doGetVer);
  });

  it('index.html no longer embeds the full Apps Script source inline', () => {
    const indexContent = fs.readFileSync(indexHtmlPath, 'utf8');
    const preRegex = /<pre id="gas-code"[^>]*>([\s\S]*?)<\/pre>/;
    const match = indexContent.match(preRegex);

    expect(match).not.toBeNull();
    // The placeholder is tiny; the real code is fetched on demand.
    expect(match[1].length).toBeLessThan(200);
    expect(match[1]).not.toContain('function doPost');
  });

  describe('numOrBlank_ (Utility Function)', () => {
    let numOrBlank_;

    it('can be extracted and executed from Code.gs', () => {
      const codeContent = fs.readFileSync(codeGsPath, 'utf8');
      const match = codeContent.match(/function numOrBlank_\(v\) \{[\s\S]+?\n\}/);
      expect(match).not.toBeNull();

      // Create an executable function from the source
      const funcStr = match[0];
      numOrBlank_ = new Function('v', funcStr + '\nreturn numOrBlank_(v);');
    });

    it('returns empty string for null, undefined, or empty string', () => {
      expect(numOrBlank_(null)).toBe('');
      expect(numOrBlank_(undefined)).toBe('');
      expect(numOrBlank_('')).toBe('');
    });

    it('returns the number itself if input is a number', () => {
      expect(numOrBlank_(10)).toBe(10);
      expect(numOrBlank_(0)).toBe(0);
      expect(numOrBlank_(-5.5)).toBe(-5.5);
    });

    it('parses strings and removes commas', () => {
      expect(numOrBlank_('10')).toBe(10);
      expect(numOrBlank_('1,000')).toBe(1000);
      expect(numOrBlank_('1,234,567.89')).toBe(1234567.89);
      expect(numOrBlank_('-1,000.5')).toBe(-1000.5);
    });

    it('returns empty string if parsing results in NaN', () => {
      expect(numOrBlank_('abc')).toBe('');
      expect(numOrBlank_('NaN')).toBe('');
      expect(numOrBlank_({})).toBe('');
    });
  });

  describe('extractBigCartelShippingPaid_ (Big Cartel scanner)', () => {
    it('extracts discounted receipt financials', () => {
      const code = fs.readFileSync(codeGsPath, 'utf8');
      const match = code.match(/function extractBigCartelFinancials_\(body, qty\) \{[\s\S]+?\n\}/);
      const money = code.match(/function parseBigCartelMoney_\(value\) \{[\s\S]+?\n\}/);
      expect(match).not.toBeNull();
      const extract = new Function('body', 'qty', money[0] + '\n' + match[0] + '\nreturn extractBigCartelFinancials_(body, qty);');
      expect(extract(`Subtotal\nCA$65.00\nDiscount (LMBCOLLECTIVE)\n-CA$32.50\nInternational standard - 7 - 14 business days\nCA$32.00\nTax\nCA$0.00\nTotal\nCA$64.50`, 1)).toMatchObject({ subtotal: 65, discountCode: 'LMBCOLLECTIVE', discountAmount: 32.5, merchandisePaid: 32.5, shippingPaid: 32, taxPaid: 0, totalPaid: 64.5, discountSource: 'receipt', price: 32.5 });
    });

    it('applies the collective 50% rule when discount amount is missing', () => {
      const code = fs.readFileSync(codeGsPath, 'utf8');
      const match = code.match(/function extractBigCartelFinancials_\(body, qty\) \{[\s\S]+?\n\}/);
      const money = code.match(/function parseBigCartelMoney_\(value\) \{[\s\S]+?\n\}/);
      const extract = new Function('body', 'qty', money[0] + '\n' + match[0] + '\nreturn extractBigCartelFinancials_(body, qty);');
      expect(extract('Subtotal\nCA$65.00\nDiscount code: LMBCOLLECTIVE\nTotal\nCA$64.50', 1)).toMatchObject({ discountAmount: 32.5, merchandisePaid: 32.5, discountSource: 'code-rule' });
    });

    function loadShippingExtractor() {
      const codeContent = fs.readFileSync(codeGsPath, 'utf8');
      const moneyMatch = codeContent.match(/function parseBigCartelMoney_\(value\) \{[\s\S]+?\n\}/);
      const shippingMatch = codeContent.match(/function extractBigCartelShippingPaid_\(body, subtotal\) \{[\s\S]+?\n\}/);
      expect(moneyMatch).not.toBeNull();
      expect(shippingMatch).not.toBeNull();
      return new Function('body', 'subtotal', moneyMatch[0] + '\n' + shippingMatch[0] + '\nreturn extractBigCartelShippingPaid_(body, subtotal);');
    }

    it('calculates screenshot-style method shipping from subtotal, tax, and total', () => {
      const extractShipping = loadShippingExtractor();
      const body = `Subtotal
$43.00
Tax
$0.00
Standard (with tracking) - Approx. delivery 3-5 days
$5.00
Total
$48.00`;

      expect(extractShipping(body, 43)).toBe(5);
    });

    it('still supports explicit shipping labels', () => {
      const extractShipping = loadShippingExtractor();
      const body = `Subtotal
$43.00
Shipping
$7.50
Tax
$0.00
Total
$50.50`;

      expect(extractShipping(body, 43)).toBe(7.5);
    });

    it('captures CA$ prefixed named-method shipping from totals', () => {
      const extractShipping = loadShippingExtractor();
      const body = `Subtotal
CA$65.00
Tax
CA$0.00
Tracked packet
CA$12.00
Total
CA$77.00`;

      expect(extractShipping(body, 65)).toBe(12);
    });

    it('captures CA$ prefixed explicit shipping labels', () => {
      const extractShipping = loadShippingExtractor();
      const body = `Subtotal
CA$65.00
Shipping
CA$9.95
Tax
CA$0.00
Total
CA$74.95`;

      expect(extractShipping(body, 65)).toBe(9.95);
    });

  });

});

describe('Canada Post media-type negotiation in the relay', () => {
  const src = fs.readFileSync(path.join(__dirname, '../apps-script/Code.gs'), 'utf8');

  it('no longer forces a bare application/json on the OAuth rating path', () => {
    // Canada Post versions its APIs through the media type. Sending a generic
    // value is documented as a 406/415, and on the Apigee gateway an unroutable
    // one can hang into a 504 instead.
    expect(src).not.toMatch(/headers\['Accept'\]\s*=\s*useOAuth\s*\?\s*'application\/json'/);
  });

  it('offers the versioned rating media types as candidates', () => {
    expect(src).toContain('application/vnd.cpc.ship.rate-v4+json');
    expect(src).toContain('application/vnd.cpc.rating-v4+json');
  });

  it('retries only on the documented wrong-media-type statuses', () => {
    expect(src).toMatch(/code !== 406 && code !== 415/);
  });

  it('reports which media type Canada Post accepted', () => {
    expect(src).toMatch(/mediaType:\s*usedMediaType/);
  });
});
