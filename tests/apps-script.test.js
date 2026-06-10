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
});
