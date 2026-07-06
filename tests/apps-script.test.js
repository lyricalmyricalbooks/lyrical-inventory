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

  it('index.html no longer embeds the full Apps Script source inline', () => {
    const indexContent = fs.readFileSync(indexHtmlPath, 'utf8');
    const preRegex = /<pre id="gas-code"[^>]*>([\s\S]*?)<\/pre>/;
    const match = indexContent.match(preRegex);

    expect(match).not.toBeNull();
    // The placeholder is tiny; the real code is fetched on demand.
    expect(match[1].length).toBeLessThan(200);
    expect(match[1]).not.toContain('function doPost');
  });

  it('client expected script version matches Code.gs', () => {
    const codeContent = fs.readFileSync(codeGsPath, 'utf8');
    const mainContent = fs.readFileSync(path.resolve(__dirname, '../src/main.js'), 'utf8');

    const scriptVersion = codeContent.match(/scriptVersion:\s*'([^']+)'/)?.[1];
    const expectedVersion = mainContent.match(/EXPECTED_SCRIPT_VERSION\s*=\s*'([^']+)'/)?.[1];

    expect(scriptVersion).toBeTruthy();
    expect(expectedVersion).toBe(scriptVersion);
  });

  it('batch sync capability is advertised by Code.gs', () => {
    const codeContent = fs.readFileSync(codeGsPath, 'utf8');
    expect(codeContent).toContain('batchSync: true');
    expect(codeContent).toContain("if (action === 'batch')");
    expect(codeContent).toContain('processSheetsBatch_');
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
});
