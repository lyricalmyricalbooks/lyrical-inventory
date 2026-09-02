import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styleCss = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');
const receiptsJs = readFileSync(path.join(__dirname, '../src/features/receipts.js'), 'utf8');

describe('App-Wide 5 UX Enhancements Suite (Round Two — /ux-designer)', () => {
  describe('1. Order History: Channel Filter Chip Fitts Law (>= 44px) & Spring Kinetics', () => {
    it('enforces var(--target-min) on .hist-filter-chip with canonical surface', () => {
      expect(styleCss).toMatch(/\.hist-filter-chip\s*\{[^}]*min-height:\s*var\(--target-min\);/);
      expect(styleCss).toMatch(/\.hist-filter-chip\s*\{[^}]*background:\s*var\(--surface-sunken\);/);
      expect(styleCss).toMatch(/\.hist-filter-chip\s*\{[^}]*box-shadow:\s*var\(--elev-1\);/);
    });

    it('enforces spring hover and active scaling on the clear button', () => {
      expect(styleCss).toMatch(/\.hist-filter-chip button\s*\{[^}]*font-family:\s*'DM Mono', monospace;/);
      expect(styleCss).toMatch(/\.hist-filter-chip button:hover\s*\{[^}]*transform:\s*translateY\(-1px\);/);
      expect(styleCss).toMatch(/\.hist-filter-chip button:active\s*\{[^}]*transform:\s*scale\(0\.96\);/);
      expect(styleCss).toMatch(/\.hist-filter-chip button:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--gold\);/);
    });
  });

  describe('2. QR Codes Studio: 44px Touch Targets & Spring Kinetics on Card Actions', () => {
    it('enforces var(--target-min) on .qr-card-actions .btn with spring active compression', () => {
      expect(styleCss).toMatch(/\.qr-card-actions \.btn\s*\{[^}]*min-height:\s*var\(--target-min\);/);
      expect(styleCss).toMatch(/\.qr-card-actions \.btn:active\s*\{[^}]*transform:\s*scale\(0\.96\);/);
      expect(styleCss).toMatch(/\.qr-card-actions \.btn:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--gold\);/);
    });
  });

  describe('3. Receipts & Book Expenses: Zero Blank State Architecture in renderExpenses', () => {
    it('renders semantic .empty-state.exp-empty-state with icon and batch log CTA', () => {
      expect(receiptsJs).toContain('exp-empty-state');
      expect(receiptsJs).toContain('No Expenses Logged Yet');
      expect(receiptsJs).toContain("openBatchExpenseModal('book')");
      expect(receiptsJs).toContain('Batch Log Expenses');
    });
  });

  describe('4. Tax Centre: 44px Alert Dismiss & OKLCH Warning Banner Colors', () => {
    it('elevates .tc-alert-dismiss to var(--target-min) with spring physics', () => {
      expect(styleCss).toMatch(/\.tc-alert-dismiss\s*\{[^}]*width:\s*var\(--target-min\);/);
      expect(styleCss).toMatch(/\.tc-alert-dismiss\s*\{[^}]*height:\s*var\(--target-min\);/);
      expect(styleCss).toMatch(/\.tc-alert-dismiss:hover\s*\{[^}]*transform:\s*scale\(1\.05\);/);
      expect(styleCss).toMatch(/\.tc-alert-dismiss:active\s*\{[^}]*transform:\s*scale\(0\.95\);/);
    });

    it('uses OKLCH perceptual amber tokens on .tc-receipt-alert.is-warn', () => {
      expect(styleCss).toMatch(/\.tc-receipt-alert\.is-warn\s*\{[^}]*oklch\(0\.78 0\.18 75/);
    });
  });

  describe('5. Consignment Store Balances: Canonical Backdrop, 44px Close & Tabular Figures', () => {
    it('uses var(--surface-overlay) and glassmorphism backdrop on .store-balance-pop', () => {
      expect(styleCss).toMatch(/\.store-balance-pop::backdrop\s*\{[^}]*background:\s*var\(--surface-overlay\);/);
      expect(styleCss).toMatch(/\.store-balance-pop::backdrop\s*\{[^}]*backdrop-filter:\s*blur\(8px\)/);
    });

    it('elevates .store-balance-pop-close to var(--target-min) with spring kinetics', () => {
      expect(styleCss).toMatch(/\.store-balance-pop-close\s*\{[^}]*min-width:\s*var\(--target-min\);/);
      expect(styleCss).toMatch(/\.store-balance-pop-close\s*\{[^}]*min-height:\s*var\(--target-min\);/);
      expect(styleCss).toMatch(/\.store-balance-pop-close:hover\s*\{[^}]*transform:\s*scale\(1\.05\);/);
    });

    it('formats store balance table cells with DM Mono tabular figures', () => {
      expect(styleCss).toMatch(/\.store-balance-tbl th,\s*\.store-balance-tbl td\s*\{[^}]*font-family:\s*'DM Mono',monospace;/);
      expect(styleCss).toMatch(/\.store-balance-tbl th,\s*\.store-balance-tbl td\s*\{[^}]*font-feature-settings:\s*'tnum' 1, 'zero' 1;/);
    });
  });
});
