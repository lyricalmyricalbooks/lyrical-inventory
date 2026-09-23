import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ensureXlsx, loadExternalScript, XLSX_SCRIPT_URL } from '../src/lib/external-scripts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexContent = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

describe('lazy Excel support', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    delete window.XLSX;
  });

  it('does not download SheetJS while the app opens', () => {
    expect(indexContent).not.toContain(`<script defer src="${XLSX_SCRIPT_URL}"></script>`);
  });

  it('deduplicates simultaneous script requests', async () => {
    const first = loadExternalScript(XLSX_SCRIPT_URL);
    const second = loadExternalScript(XLSX_SCRIPT_URL);
    const scripts = document.querySelectorAll(`script[src="${XLSX_SCRIPT_URL}"]`);

    expect(second).toBe(first);
    expect(scripts).toHaveLength(1);

    scripts[0].dispatchEvent(new Event('load'));
    await expect(first).resolves.toBeUndefined();
  });

  it('returns an already available SheetJS global without injecting a script', async () => {
    window.XLSX = { read: vi.fn() };

    await expect(ensureXlsx()).resolves.toBe(window.XLSX);
    expect(document.querySelector(`script[src="${XLSX_SCRIPT_URL}"]`)).toBeNull();
  });

  it('removes a failed script so the next request can retry', async () => {
    const url = 'https://cdn.example.test/retry.js';
    const first = loadExternalScript(url);
    document.querySelector(`script[src="${url}"]`).dispatchEvent(new Event('error'));

    await expect(first).rejects.toThrow(`Failed to load ${url}`);
    expect(document.querySelector(`script[src="${url}"]`)).toBeNull();

    const retry = loadExternalScript(url);
    expect(document.querySelectorAll(`script[src="${url}"]`)).toHaveLength(1);
    document.querySelector(`script[src="${url}"]`).dispatchEvent(new Event('load'));
    await expect(retry).resolves.toBeUndefined();
  });
});
