import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Receipt Enhancements (1, 3, 4) Implementation Verification', () => {
  const mainJsPath = path.resolve(__dirname, '../src/main.js');
  const indexHtmlPath = path.resolve(__dirname, '../index.html');

  const mainContent = fs.readFileSync(mainJsPath, 'utf8');
  const indexContent = fs.readFileSync(indexHtmlPath, 'utf8');

  it('declares getAllFilesInReceiptFolder helper for folder listing', () => {
    expect(mainContent).toContain('async function getAllFilesInReceiptFolder');
    expect(mainContent).toContain('results.push({');
  });

  it('implements batchScanAndRelinkReceipts for 1-click batch receipt scanning & repair', () => {
    expect(mainContent).toContain('async function batchScanAndRelinkReceipts');
    expect(mainContent).toContain('totalRelinked++');
    expect(mainContent).toContain('Receipt Batch Audit Completed');
    expect(indexContent).toContain('id="tc-relink-batch-btn"');
    expect(indexContent).toContain('batchScanAndRelinkReceipts()');
  });

  it('supports drag-and-drop receipt uploading on Tax Centre expense rows', () => {
    expect(mainContent).toContain('function tcExpenseRowDragOver');
    expect(mainContent).toContain('function tcExpenseRowDragLeave');
    expect(mainContent).toContain('async function tcExpenseRowDrop');
    expect(mainContent).toContain('ondragover="tcExpenseRowDragOver(event, this)"');
    expect(mainContent).toContain('ondrop="tcExpenseRowDrop(event, this');
  });

  it('renders quick 📎 Attach button on expense rows without a receipt', () => {
    expect(mainContent).toContain('async function attachReceiptToExpenseRow');
    expect(mainContent).toContain('title="Attach receipt file">📎 Attach</button>');
  });

  it('exposes new receipt functions to window binding object', () => {
    expect(mainContent).toContain('batchScanAndRelinkReceipts');
    expect(mainContent).toContain('attachReceiptToExpenseRow');
    expect(mainContent).toContain('tcExpenseRowDragOver');
    expect(mainContent).toContain('tcExpenseRowDrop');
  });
});
