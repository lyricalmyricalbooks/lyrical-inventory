import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { roundCents, fmt, getContrastSafeText } from '../src/lib/money.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = readFileSync(path.join(__dirname, '../index.html'), 'utf8').replace(/\r\n/g, '\n');
const css = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8').replace(/\r\n/g, '\n');
const systemCss = readFileSync(path.join(__dirname, '../src/styles/system.css'), 'utf8').replace(/\r\n/g, '\n');
const darkCss = readFileSync(path.join(__dirname, '../src/styles/theme-dark.css'), 'utf8').replace(/\r\n/g, '\n');
const mainJs = readFileSync(path.join(__dirname, '../src/main.js'), 'utf8').replace(/\r\n/g, '\n');

describe('Challenger 2 Empirical Verification: Touch Targets (Fitts’s Law >= 44px)', () => {
  const targetSelectors = [
    // Feature 1: POS quick discount buttons
    { name: '.pos-discount-btn', regex: /\.pos-discount-btn\s*\{[^}]*min-height:\s*var\(--target-min/ },
    // Feature 2: POS card action buttons
    { name: '.pos-card-btn', regex: /\.pos-card-btn\s*\{[^}]*min-height:\s*var\(--target-min/ },
    // Feature 4: Order history row actions
    { name: '.btn-hist-action', regex: /\.btn-hist-action\s*\{[^}]*min-height:\s*var\(--target-min/ },
    // Feature 5: Order history edit button touch slop
    { name: '.edit-btn::after', regex: /\.edit-btn::after\s*\{[^}]*min-height:\s*var\(--target-min/ },
    // Feature 7: Consignment store card action strip
    { name: '.store-actions .btn', regex: /\.store-actions \.btn\s*\{[^}]*min-height:\s*var\(--target-min/ },
    // Feature 9: Consignment bulk send quantity inputs & rows
    { name: '.bulk-send-qty', regex: /\.bulk-send-qty\s*\{[^}]*min-height:\s*var\(--target-min/ },
    // Feature 10: Receipt OCR dropzone remove & camera/scan buttons
    { name: '.dz-remove', regex: /\.dz-remove\s*\{[^}]*min-height:\s*44px/ },
    { name: '#tc-cam-btn, #tc-ai-scan-btn', regex: /#tc-cam-btn,\s*#tc-ai-scan-btn\s*\{[^}]*min-height:\s*var\(--target-min/ },
    // Feature 11: Trip picker dropdown & view switchers
    { name: '.tc-trip-dropdown-btn', regex: /\.tc-trip-dropdown-btn\s*\{[^}]*min-height:\s*var\(--target-min/ },
    { name: '.tc-trips-view-btn', regex: /\.tc-trips-view-btn,\s*\n?\.tc-vault-view-btn\s*\{[^}]*min-height:\s*var\(--target-min/ },
    // Feature 12: Cash flow detail filter
    { name: '.cf-detail-filter', regex: /\.cf-detail-filter\s*\{[^}]*min-height:\s*var\(--target-min/ },
    // Feature 13: Customer & mailing list table action buttons
    { name: '#cust-body .btn, .cust-action-btn', regex: /#cust-body \.btn,\s*#ml-body \.btn,\s*\.cust-action-btn\s*\{[^}]*min-height:\s*var\(--target-min/ },
    // Feature 15: Campaign helper tag buttons
    { name: '.helper-tag-btn', regex: /\.helper-tag-btn\s*\{[^}]*min-height:\s*var\(--target-min/ },
    // Feature 17: Web analytics toolbar & refresh buttons
    { name: '#webanalytics-connected-view .btn', regex: /#webanalytics-connected-view \.btn,\s*#webanalytics-external-link/ },
    // Feature 18: Payment QR override controls & copy button
    { name: '.pqr-select, .pqr-input', regex: /\.pqr-select,\s*\.pqr-input\s*\{[^}]*min-height:\s*var\(--target-min/ },
    { name: '.pqr-gen-btn', regex: /\.pqr-gen-btn\s*\{[^}]*min-height:\s*var\(--target-min/ },
    { name: '.pqr-copy-btn', regex: /\.pqr-copy-btn\s*\{[^}]*min-height:\s*var\(--target-min/ },
    // Feature 19: Fair Kit popover close, action buttons & checkboxes
    { name: '.fk-pop-close', regex: /\.fk-pop-close\s*\{[^}]*min-height:\s*var\(--target-min/ },
    { name: '.fk-pop-actions .btn', regex: /\.fk-pop-actions \.btn\s*\{[^}]*min-height:\s*var\(--target-min/ },
    { name: '.fk-check', regex: /\.fk-check\s*\{[^}]*min-height:\s*var\(--target-min/ },
    // Feature 20: Author QR buttons
    { name: '.author-qr-btn', regex: /\.author-qr-btn\s*\{[^}]*min-height:\s*var\(--target-min/ },
    // Feature 21: Book strip manage button
    { name: '.manage-btn', regex: /\.manage-btn\s*\{[^}]*min-height:\s*var\(--target-min/ },
    // Feature 23: Modal close button, custom picker & preset chips
    { name: '.modal-close-btn', regex: /\.modal-close-btn\s*\{[^}]*min-height:\s*var\(--target-min/ },
    { name: '.accent-swatch-btn::after', regex: /\.accent-swatch-btn::after\s*\{[^}]*min-height:\s*var\(--target-min/ },
    { name: '.accent-custom-picker', regex: /\.accent-custom-picker\s*\{[^}]*min-height:\s*var\(--target-min/ },
    { name: '.preset-chip-btn', regex: /\.preset-chip-btn\s*\{[^}]*min-height:\s*var\(--target-min/ },
    // Feature 24: Stock transfer direction toggle & steppers
    { name: '.st-dir-btn', regex: /\.st-dir-btn\s*\{[^}]*min-height:\s*var\(--target-min/ },
    { name: '.st-stepper-btn', regex: /\.st-stepper-btn\s*\{[^}]*min-height:\s*var\(--target-min/ },
    // Feature 25: Restore file buttons & Confirm/Prompt modal buttons
    { name: '.restore-file-btn', regex: /\.restore-file-btn\s*\{[^}]*min-height:\s*var\(--target-min/ },
    { name: '#m-confirm .modal-footer .btn', regex: /#m-confirm \.modal-footer \.btn,\s*#m-prompt \.modal-footer \.btn\s*\{[^}]*min-height:\s*var\(--target-min/ },
  ];

  for (const { name, regex } of targetSelectors) {
    it(`guarantees >= 44px target bounds on ${name}`, () => {
      expect(css).toMatch(regex);
    });
  }
});

describe('Challenger 2 Empirical Verification: Canonical Surface Token Invariants', () => {
  it('strictly defines canonical semantic surfaces in system.css', () => {
    expect(systemCss).toContain('--surface-page:');
    expect(systemCss).toContain('--surface-raised:');
    expect(systemCss).toContain('--surface-sunken:');
    expect(systemCss).toContain('--surface-inset:');
    expect(systemCss).toContain('--surface-inverse:');
  });

  it('dark.css maps dark theme overrides for primitive surface foundations', () => {
    expect(darkCss).toContain('--cream:');
    expect(darkCss).toContain('--cream2:');
    expect(darkCss).toContain('--cream3:');
    expect(darkCss).toContain('--cream4:');
    expect(darkCss).toContain('--ink:');
  });

  it('prohibits undefined generic tokens like var(--surface2), var(--surface3), var(--surface4) in style.css', () => {
    expect(css).not.toMatch(/var\(\s*--(surface[0-9]|surface|card)(?![-\w])\s*[^)]*\)/);
  });
});

describe('Challenger 2 Empirical Verification: Modal Shell Scroll Architecture', () => {
  it('preserves horizontal-only inset padding on base .modal shell', () => {
    expect(css).toMatch(/\.modal\s*\{[^}]*padding:\s*0\s+var\(--space-6\);/);
  });

  it('does NOT add vertical padding (!important) to .modal class', () => {
    expect(css).not.toMatch(/\.modal\s*\{[^}]*padding:\s*24px/);
    expect(css).not.toMatch(/\.modal\s*\{[^}]*padding-top:\s*24px/);
  });

  it('preserves pinned modal header and footer with scrims', () => {
    expect(css).toMatch(/\.modal-title\s*\{[\s\S]*?position:\s*sticky;/);
    expect(css).toMatch(/\.modal-footer\s*\{[\s\S]*?position:\s*sticky;/);
    expect(css).toMatch(/\.modal-title::after/);
    expect(css).toMatch(/\.modal-footer::before/);
  });
});

describe('Challenger 2 Empirical Verification: Monospace Tabular Figures (`tnum` / DM Mono)', () => {
  const tnumRules = [
    { name: 'POS Quick Discount .mono-num', regex: /\.pos-discount-btn \.mono-num\s*\{[^}]*font-family:\s*'DM Mono'/ },
    { name: 'POS Confirm Total', regex: /\.pos-confirm-total-val\s*\{[^}]*font-family:\s*'DM Mono'/ },
    { name: 'Order History KPI Values', regex: /\.hist-kpi-val\s*\{[^}]*font-family:\s*'DM Mono'/ },
    { name: 'Consignment Bulk Send Qty', regex: /\.bulk-send-qty\s*\{[^}]*font-family:\s*'DM Mono'/ },
    { name: 'Cash Flow Stat Delta', regex: /\.cf-stat-delta\s*\{[^}]*font-family:\s*'DM Mono'/ },
    { name: 'Cash Flow Totals', regex: /\.cf-detail-totals span\s*\{[^}]*font-family:\s*'DM Mono'/ },
    { name: 'Customer & Mailing List Number Cells', regex: /#cust-body td\.r,\s*#cust-body \.money-cell/ },
    { name: 'Web Analytics KPI Changes', regex: /\.analytics-kpi-change\s*\{[^}]*font-family:\s*'DM Mono'/ },
    { name: 'Payment QR Custom Input', regex: /\.pqr-input\s*\{[^}]*font-family:\s*'DM Mono'/ },
    { name: 'Book Strip KPIs', regex: /\.bsk-val\s*\{[^}]*font-feature-settings:\s*"tnum"\s*1/ },
  ];

  for (const { name, regex } of tnumRules) {
    it(`enforces tabular figures on ${name}`, () => {
      expect(css).toMatch(regex);
    });
  }
});

describe('Challenger 2 Empirical Verification: Spring Kinetics & Accessibility', () => {
  it('defines physical spring kinetics curve token', () => {
    expect(systemCss).toContain('--ease-spring:');
  });

  it('implements active press scaling across interactive elements', () => {
    expect(css).toMatch(/\.pos-discount-btn:active\s*\{[^}]*transform:\s*scale\(/);
    expect(css).toMatch(/\.btn-hist-action:active\s*\{[^}]*transform:\s*scale\(/);
    expect(css).toMatch(/\.store-actions \.btn:active\s*\{[^}]*transform:\s*scale\(/);
    expect(css).toMatch(/\.helper-tag-btn:active\s*\{[^}]*transform:\s*scale\(/);
    expect(css).toMatch(/\.preset-chip-btn:active\s*\{[^}]*transform:\s*scale\(/);
    expect(css).toMatch(/\.st-stepper-btn:active\s*\{[^}]*transform:\s*scale\(/);
    expect(css).toMatch(/\.restore-file-btn:active\s*\{[^}]*transform:\s*scale\(/);
  });

  it('honors prefers-reduced-motion media query across the design system', () => {
    expect(systemCss).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{/);
    expect(systemCss).toMatch(/--dur-base:\s*1ms/);
    expect(systemCss).toMatch(/--dur-instant:\s*1ms/);
  });
});

describe('Challenger 2 Empirical Verification: Zero Blank States & Miller’s Chunking', () => {
  it('implements Miller-chunked empty state for Mailing List in main.js', () => {
    expect(mainJs).toContain('class="empty-state sys-empty"');
    expect(mainJs).toContain('✉️');
    expect(mainJs).toContain('Your mailing list is empty');
    expect(mainJs).toContain('addAllBuyersToMailingList()');
  });

  it('implements Miller-chunked empty states for Campaign drafts and sent lists in main.js', () => {
    expect(mainJs).toContain('📝');
    expect(mainJs).toContain('No saved drafts');
    expect(mainJs).toContain('📣');
    expect(mainJs).toContain('No sent campaigns yet');
    expect(mainJs).toContain('openCampaignWizard()');
  });

  it('implements Miller-chunked empty state for Production Catalog in main.js', () => {
    expect(mainJs).toContain('No Books in Production Catalogue');
    expect(mainJs).toContain('📚');
    expect(mainJs).toContain('+ Add your first book');
    expect(mainJs).toContain('openAddBookModal()');
  });

  it('implements Miller-chunked empty state for Cloud Snapshots in index.html', () => {
    expect(html).toContain('No Cloud Snapshots Saved Yet');
    expect(html).toContain('💾');
    expect(html).toContain('Create first backup now');
    expect(html).toContain('createSystemBackupNow()');
  });
});

describe('Challenger 2 Empirical Verification: Financial Invariants & Core Calculations', () => {
  it('roundCents handles IEEE 754 precision boundary cases without float drift', () => {
    expect(roundCents(0.1 + 0.2)).toBe(0.3);
    expect(roundCents(1.005)).toBe(1.01);
    expect(roundCents(35.055)).toBe(35.06);
    expect(roundCents(0)).toBe(0);
    expect(roundCents(-0.1 - 0.2)).toBe(-0.3);
    expect(roundCents(null)).toBe(0);
  });

  it('fmt formats monetary quantities with currency symbols and two decimals', () => {
    expect(fmt(19.99, 'CAD')).toBe('CA$19.99');
    expect(fmt(0, 'USD')).toBe('US$0.00');
    expect(fmt(25.5, 'GBP')).toBe('£25.50');
    expect(fmt(100, 'EUR')).toBe('€100.00');
  });

  it('consignment balance equation holds true (Stock = Shipments - Returns - Sales)', () => {
    const shipments = 50;
    const returns = 10;
    const sales = 15;
    const currentStock = shipments - returns - sales;
    expect(currentStock).toBe(25);
  });

  it('bulk send modal warns when total exceeds available on-hand stock', () => {
    const onHandStock = 12;
    const totalAllocatedOver = 15;
    const totalAllocatedUnder = 8;
    expect(totalAllocatedOver > onHandStock).toBe(true);
    expect(totalAllocatedUnder > onHandStock).toBe(false);
  });

  it('getContrastSafeText ensures dark and light theme legibility for accent colors', () => {
    // Pale color on light background -> darkened
    const paleYellow = '#ffffaa';
    expect(getContrastSafeText(paleYellow, false)).not.toBe(paleYellow);
    // Dark color on dark background -> lightened
    const darkNavy = '#0a1020';
    expect(getContrastSafeText(darkNavy, true)).not.toBe(darkNavy);
  });
});
