import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Apps Script Integration', () => {
  it('embedded gas-code in index.html matches Code.gs exactly (HTML escaped)', () => {
    const codeGsPath = path.resolve(__dirname, '../apps-script/Code.gs');
    const indexHtmlPath = path.resolve(__dirname, '../index.html');

    expect(fs.existsSync(codeGsPath)).toBe(true);
    expect(fs.existsSync(indexHtmlPath)).toBe(true);

    const codeContent = fs.readFileSync(codeGsPath, 'utf8');
    const escapedCode = codeContent
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const indexContent = fs.readFileSync(indexHtmlPath, 'utf8');
    const preRegex = /<pre id="gas-code"[^>]*>([\s\S]*?)<\/pre>/;
    const match = indexContent.match(preRegex);

    expect(match).not.toBeNull();
    const embeddedCode = match[1];

    expect(embeddedCode).toBe(escapedCode);
  });
});
