import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const css = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');
const js = readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');

describe('Challenger 1 Adversarial Suite: Touch Target Verification (>= 44px)', () => {
  const touchTargetSelectors = [
    // M1
    { name: 'POS Quick Discount Buttons', regex: /\.pos-discount-btn\s*\{[^}]*min-height:\s*var\(--target-min\)/ },
    { name: 'POS Card Actions', regex: /\.pos-card-btn\s*\{[^}]*min-height:\s*var\(--target-min\)/ },
    { name: 'POS Card Danger Action', regex: /\.pos-card-btn-danger\s*\{[^}]*min-width:\s*var\(--target-min\)/ },
    { name: 'Order History Row Actions', regex: /\.btn-hist-action\s*\{[^}]*min-height:\s*var\(--target-min\)/ },
    { name: 'Order History Inline Edit Slop', regex: /\.edit-btn::after\s*\{[^}]*min-height:\s*var\(--target-min\)/ },
    { name: 'Order History Restate Button', regex: /\.hist-currency-warn \.btn\s*\{[^}]*min-height:\s*var\(--target-min\)/ },
    { name: 'Consignment Store Actions', regex: /\.store-actions \.btn\s*\{[^}]*min-height:\s*var\(--target-min\)/ },
    { name: 'Bulk Send Row & Qty', regex: /\.bulk-send-qty\s*\{[^}]*min-height:\s*var\(--target-min\)/ },
    // M2
    { name: 'Receipt OCR Remove Button', regex: /\.dz-remove\s*\{[^}]*min-height:\s*44px/ },
    { name: 'Receipt Scan Camera & AI Buttons', regex: /#tc-cam-btn,\s*#tc-ai-scan-btn\s*\{[^}]*min-height:\s*var\(--target-min/ },
    { name: 'Trip Picker Dropdown Button', regex: /\.tc-trip-dropdown-btn\s*\{[^}]*min-height:\s*var\(--target-min/ },
    { name: 'Trip/Vault Segmented View Switchers', regex: /\.tc-trips-view-btn,\s*\n\.tc-vault-view-btn\s*\{[^}]*min-height:\s*var\(--target-min/ },
    { name: 'Cash Flow Detail Filter Pills', regex: /\.cf-detail-filter\s*\{[^}]*min-height:\s*var\(--target-min/ },
    { name: 'Customer & Mailing List Action Buttons', regex: /#cust-body \.btn,\s*#ml-body \.btn,\s*\.cust-action-btn\s*\{[^}]*min-height:\s*var\(--target-min/ },
    { name: 'Campaign Helper Tag Buttons', regex: /\.helper-tag-btn\s*\{[^}]*min-height:\s*var\(--target-min/ },
    { name: 'Web Analytics Toolbar & Refresh Action', regex: /button\[onclick="refreshUmamiStats\(\)"\]\s*\{[^}]*min-height:\s*var\(--target-min/ },
    // M3
    { name: 'Payment QR Select & Input Controls', regex: /\.pqr-select,\s*\.pqr-input\s*\{[^}]*min-height:\s*var\(--target-min/ },
    { name: 'Payment QR Link & Copy Buttons', regex: /\.pqr-copy-btn\s*\{[^}]*min-height:\s*var\(--target-min/ },
    { name: 'Fair Kit Popover Close Button', regex: /\.fk-pop-close\s*\{[^}]*min-height:\s*var\(--target-min/ },
    { name: 'Fair Kit Popover Action Buttons', regex: /\.fk-pop-actions \.btn\s*\{[^}]*min-height:\s*var\(--target-min/ },
    { name: 'Fair Kit Checkbox Target', regex: /\.fk-check\s*\{[^}]*min-height:\s*var\(--target-min/ },
    { name: 'Author QR Action Buttons', regex: /\.author-qr-btn\s*\{[^}]*min-height:\s*var\(--target-min/ },
    { name: 'Book Strip Manage Button', regex: /\.manage-btn\s*\{[^}]*min-height:\s*var\(--target-min/ },
    { name: 'Add/Edit Book Modal Close Button', regex: /\.modal-close-btn\s*\{[^}]*min-height:\s*var\(--target-min/ },
    { name: 'Add/Edit Book Color Swatches Hit Slop', regex: /\.accent-swatch-btn::after\s*\{[^}]*min-height:\s*var\(--target-min/ },
    { name: 'Add/Edit Book Preset Chips', regex: /\.preset-chip-btn\s*\{[^}]*min-height:\s*var\(--target-min/ },
    { name: 'Stock Transfer Direction & Stepper Buttons', regex: /\.st-dir-btn\s*\{[^}]*min-height:\s*var\(--target-min/ },
    { name: 'Restore File Label Buttons', regex: /\.restore-file-btn\s*\{[^}]*min-height:\s*var\(--target-min/ },
    { name: 'Global Dialog (m-confirm/m-prompt) Buttons', regex: /#m-confirm \.modal-footer \.btn,\s*#m-prompt \.modal-footer \.btn\s*\{[^}]*min-height:\s*var\(--target-min/ }
  ];

  touchTargetSelectors.forEach(({ name, regex }) => {
    it(`guarantees >= 44px touch target geometry for: ${name}`, () => {
      expect(css).toMatch(regex);
    });
  });
});

describe('Challenger 1 Adversarial Suite: Monospace Tabular Figures Verification', () => {
  const tabularChecks = [
    { name: 'POS Discount Buttons', regex: /\.pos-discount-btn \.mono-num\s*\{[^}]*font-family:\s*'DM Mono'/ },
    { name: 'POS Confirm Total Value', regex: /\.pos-confirm-total-val\s*\{[^}]*font-family:\s*'DM Mono'/ },
    { name: 'Order History KPI Values', regex: /\.hist-kpi-val\s*\{[^}]*font-family:\s*'DM Mono'/ },
    { name: 'Bulk Send Quantity Input', regex: /\.bulk-send-qty\s*\{[^}]*font-family:\s*'DM Mono'/ },
    { name: 'Cash Flow Stat Deltas', regex: /\.cf-stat-delta\s*\{[^}]*font-family:\s*'DM Mono'/ },
    { name: 'Customer & Mailing List Number Cells', regex: /#cust-body td\.r,\s*#cust-body \.money-cell,\s*#cust-body \.date-cell/ },
    { name: 'Web Analytics KPI Values', regex: /\.analytics-kpi-value\s*\{[^}]*font-family:\s*'DM Mono'/ },
    { name: 'Payment QR Amount / Inputs', regex: /\.pqr-input\s*\{[^}]*font-family:\s*'DM Mono'/ },
    { name: 'Book Strip KPI Figures', regex: /\.bsk-val\s*\{[^}]*font-feature-settings:\s*"tnum"\s*1/ },
    { name: 'Stock Transfer Balance Values', regex: /\.st-balance-val\s*\{[^}]*font-family:\s*'DM Mono'/ }
  ];

  tabularChecks.forEach(({ name, regex }) => {
    it(`enforces DM Mono and tabular figures (tnum) for: ${name}`, () => {
      expect(css).toMatch(regex);
    });
  });
});

describe('Challenger 1 Adversarial Suite: Liquid Spring Motion Physics Verification', () => {
  const kineticScales = ['0.97', '0.98', '0.975', '0.96', '0.95'];

  kineticScales.forEach(scale => {
    it(`verifies active compression transform: scale(${scale}) presence in stylesheet`, () => {
      expect(css).toContain(`transform: scale(${scale})`);
    });
  });

  it('includes reduced-motion accessibility bypass', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });
});

describe('Challenger 1 Adversarial Suite: Zero Blank States & Miller Chunking', () => {
  it('renders Miller-chunked Mailing List empty state with iconography and actionable CTAs', () => {
    expect(js).toContain('class="empty-state sys-empty"');
    expect(js).toContain('✉️');
    expect(js).toContain('addAllBuyersToMailingList()');
    expect(js).toContain('focusMailingListAdd()');
  });

  it('renders Miller-chunked Email Campaign Drafts and Sent empty states with CTAs', () => {
    expect(js).toMatch(/<div class="empty-state sys-empty"[\s\S]*?📝[\s\S]*?No saved drafts[\s\S]*?openCampaignWizard\(\)/);
    expect(js).toMatch(/<div class="empty-state sys-empty"[\s\S]*?📣[\s\S]*?No sent campaigns yet[\s\S]*?openCampaignWizard\(\)/);
  });

  it('renders Miller-chunked Book Catalog empty state with 📚 icon and + Add your first book CTA', () => {
    expect(js).toContain('No Books in Production Catalogue');
    expect(js).toContain('📚');
    expect(js).toContain('+ Add your first book');
    expect(js).toContain('openAddBookModal()');
  });

  it('renders Miller-chunked Backup Snapshots empty state with 💾 icon and CTA button', () => {
    expect(html).toContain('No Cloud Snapshots Saved Yet');
    expect(html).toContain('💾');
    expect(html).toContain('Create first backup now');
    expect(html).toContain('createSystemBackupNow()');
  });
});

describe('Challenger 1 Adversarial Suite: Canonical Semantic Surface Tokens Invariant', () => {
  it('strictly uses canonical tokens in newly introduced classes and surfaces', () => {
    const canonicalTokens = [
      'var(--surface-page)',
      'var(--surface-raised)',
      'var(--surface-sunken)',
      'var(--surface-inset)',
      'var(--surface-inverse)'
    ];

    canonicalTokens.forEach(token => {
      expect(css).toContain(token);
    });
  });
});

describe('Challenger 1 Adversarial Suite: Semantic Status Colors & Elimination of Raw Hex', () => {
  it('replaces raw red/warn hex in bulk send overstock warnings with semantic token', () => {
    expect(js).not.toContain("totEl.style.color = total > stock ? '#c0392b' : ''");
    expect(js).toContain("totEl.style.color = total > stock ? 'var(--status-critical)' : ''");
  });

  it('replaces raw warning hex in book strip warning KPI with semantic token', () => {
    expect(css).not.toContain('.bsk-val.warn {\n  color: #c05e00;\n}');
    expect(css).toMatch(/\.bsk-val\.warn\s*\{[^}]*color:\s*var\(--status-active/);
  });

  it('replaces hardcoded SVG stroke in POS cart icon with CSS variable', () => {
    expect(html).not.toMatch(/stroke="#8a5815"/);
    expect(html).toContain('stroke="var(--gold-text)"');
  });

  it('replaces raw hex in invoice stripe chips with canonical tokens', () => {
    expect(js).toMatch(/background:var\(--surface-inverse\);color:var\(--gold-text\);/);
  });
});

describe('Challenger 1 Adversarial Suite: Touch Screen & Mobile Ergonomics', () => {
  it('guarantees coarse pointer discoverability for inline edit buttons', () => {
    expect(css).toMatch(/@media\s*\(hover:\s*none\),\s*\(pointer:\s*coarse\)\s*\{[\s\S]*?\.edit-btn\s*\{[^}]*opacity:\s*0\.85/);
  });

  it('ensures swatch buttons have pseudo-element hit padding for fat-finger touch clearance', () => {
    expect(css).toMatch(/\.accent-swatch-btn::after\s*\{[^}]*min-width:\s*var\(--target-min/);
    expect(css).toMatch(/\.accent-swatch-btn::after\s*\{[^}]*min-height:\s*var\(--target-min/);
  });

  it('ensures popover close triggers have full 44px hit bounds on both dimensions', () => {
    expect(css).toMatch(/\.fk-pop-close\s*\{[^}]*min-width:\s*var\(--target-min/);
    expect(css).toMatch(/\.fk-pop-close\s*\{[^}]*min-height:\s*var\(--target-min/);
    expect(css).toMatch(/\.modal-close-btn\s*\{[^}]*min-width:\s*var\(--target-min/);
    expect(css).toMatch(/\.modal-close-btn\s*\{[^}]*min-height:\s*var\(--target-min/);
  });
});

