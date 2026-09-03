import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Email Receipt Import Modal UX Redesign Verification', () => {
  const htmlPath = path.resolve(__dirname, '../index.html');
  const cssPath = path.resolve(__dirname, '../src/style.css');
  const receiptsJsPath = path.resolve(__dirname, '../src/features/receipts.js');

  const html = readFileSync(htmlPath, 'utf8');
  const css = readFileSync(cssPath, 'utf8');
  const receiptsJs = readFileSync(receiptsJsPath, 'utf8');

  it('renders modern modal header with badge, live connection status pill, and dismiss button', () => {
    expect(html).toContain('class="modal email-import-modal"');
    expect(html).toContain('modal-title-badge');
    expect(html).toContain('id="email-account-pill"');
    expect(html).toContain('closeEmailReceiptImportModal()');
  });

  it('provides Apple/Linear style segmented control tabs', () => {
    expect(html).toContain('modal-tabs segmented-control');
    expect(html).toContain('id="email-tab-gmail"');
    expect(html).toContain('id="email-tab-manual"');
    expect(css).toContain('.modal-tabs.segmented-control');
    expect(css).toContain('.segmented-control .modal-tab-btn.active');
  });

  it('features Gemini AI assistant card and search bar with clear button', () => {
    expect(html).toContain('class="email-ai-assistant-card"');
    expect(html).toContain('id="email-gmail-search-query"');
    expect(html).toContain('id="email-query-clear-btn"');
    expect(html).toContain('class="email-advanced-query-details"');
  });

  it('includes micro-icons for all Gmail search preset chips', () => {
    expect(receiptsJs).toContain("icon: '🕒'");
    expect(receiptsJs).toContain("icon: '📅'");
    expect(receiptsJs).toContain("icon: '📎'");
    expect(receiptsJs).toContain("icon: '🧾'");
    expect(receiptsJs).toContain("icon: '📦'");
  });

  it('implements progressive disclosure for bulk category strip', () => {
    expect(html).toContain('id="email-bulk-category-bar"');
    expect(html).toContain('style="display:none;"');
    expect(receiptsJs).toContain("bulkCatBar.style.display = 'none'");
    expect(receiptsJs).toContain("bulkCatBar.style.display = 'flex'");
  });

  it('enforces tabular figures and monospace numbers in draft review rows', () => {
    expect(receiptsJs).toContain("font-family:'DM Mono',monospace;font-feature-settings:'tnum' 1;");
  });
});
