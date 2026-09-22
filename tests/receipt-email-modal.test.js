import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Email Receipt Import — inline Tax Centre sub-page', () => {
  const htmlPath = path.resolve(__dirname, '../index.html');
  const cssPath = path.resolve(__dirname, '../src/style.css');
  const receiptsJsPath = path.resolve(__dirname, '../src/features/receipts.js');
  const modalJsPath = path.resolve(__dirname, '../src/lib/modal.js');

  const html = readFileSync(htmlPath, 'utf8');
  const css = readFileSync(cssPath, 'utf8');
  const receiptsJs = readFileSync(receiptsJsPath, 'utf8');
  const modalJs = readFileSync(modalJsPath, 'utf8');

  it('renders as a card in its own sub-tab, not a floating dialog', () => {
    expect(html).toContain('class="card tc-integrations-card email-import-workspace" id="m-email-receipt-import-modal"');
    expect(html).not.toContain('class="modal email-import-modal"');
    expect(html).not.toContain('class="overlay" id="m-email-receipt-import-modal"');
    // The header reuses the same badge/title/subtitle chrome as the
    // Integrations page, so the two sub-pages read as one design language.
    expect(html).toContain('tc-integrations-icon-badge');
    expect(html).toContain('id="email-account-pill"');
  });

  it('stays put instead of hiding when the owner navigates away', () => {
    const guard = modalJs.match(/if \(el\.classList\.contains\('fk-workspace'\)[\s\S]*?\) return;/)?.[0] || '';
    expect(guard).toContain("el.classList.contains('email-import-workspace')");
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
    expect(receiptsJs).toContain("font-family:var(--font-mono);font-feature-settings:'tnum' 1;");
  });

  it('still aborts an in-flight extraction when the owner navigates to another sub-tab', () => {
    expect(receiptsJs).toContain('function closeEmailReceiptImportModal()');
    expect(receiptsJs).toContain('if (_emailExtractAbort) _emailExtractAbort.abort();');
  });
});
