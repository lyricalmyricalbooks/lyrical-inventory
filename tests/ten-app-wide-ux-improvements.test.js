import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const styleCss = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');
const mainJs = readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');

describe('10 Additional UX/UI Improvements Suite (/ux-designer)', () => {
  describe('1. POS Till: Quick Discount Keyboard Shortcuts & Visual Badges', () => {
    it('declares data-shortcut attributes on pos-discount-btn presets in index.html', () => {
      expect(html).toContain('data-shortcut="1"');
      expect(html).toContain('data-shortcut="2"');
      expect(html).toContain('data-shortcut="3"');
      expect(html).toContain('data-shortcut="5"');
      expect(html).toContain('data-shortcut="0"');
    });

    it('styles .pos-discount-btn[data-shortcut]::after with DM Mono and surface-inset', () => {
      expect(styleCss).toMatch(/\.pos-discount-btn\[data-shortcut\]::after\s*\{[^}]*font-family:\s*'DM Mono'/);
      expect(styleCss).toMatch(/\.pos-discount-btn\[data-shortcut\]::after\s*\{[^}]*background:\s*var\(--surface-inset\)/);
    });

    it('attaches keydown event listener in main.js for single-key discount triggers and Enter save', () => {
      expect(mainJs).toMatch(/e\.key === '1'\) \{ e\.preventDefault\(\); window\.posPriceQuick\(10\); \}/);
      expect(mainJs).toMatch(/e\.key === 'Enter'\) \{[^}]*window\.savePosPrice\(\);/);
    });
  });

  describe('2. Webcam Receipt Capture: Optical Viewfinder Reticle & HUD Guide', () => {
    it('renders #receipt-cam-reticle in index.html inside receipt-cam-stage', () => {
      expect(html).toContain('id="receipt-cam-reticle" class="receipt-cam-reticle"');
      expect(html).toContain('class="reticle-corner top-left"');
      expect(html).toContain('class="reticle-scan-beam"');
      expect(html).toContain('Align receipt within frame');
    });

    it('styles .receipt-cam-reticle with glowing gold corners and animated beam', () => {
      expect(styleCss).toMatch(/\.receipt-cam-reticle\s*\{[^}]*position:\s*absolute/);
      expect(styleCss).toMatch(/\.reticle-corner\s*\{[^}]*border:\s*3px solid var\(--gold\)/);
      expect(styleCss).toMatch(/@keyframes reticleScan/);
    });
  });

  describe('3. Consignment Stores: Canonical Zero Blank State with Action CTA', () => {
    it('renders .empty-state.sys-empty with 🏪 icon and primary button in renderStores()', () => {
      expect(mainJs).toMatch(/class="empty-state sys-empty"[^>]*>[\s\S]*?🏪[\s\S]*?No consignment stores yet[\s\S]*?\+ Add consignment store/);
    });
  });

  describe('4. Tax Centre: Missing Receipt Pill & Ledger Toggle Button 44px Geometry', () => {
    it('enforces var(--target-min) on .con-group-toggle-btn and .ledger-toggle-btn', () => {
      expect(styleCss).toMatch(/\.con-group-toggle-btn,\s*\n?\.ledger-toggle-btn\s*\{[^}]*min-height:\s*var\(--target-min\)/);
      expect(styleCss).toMatch(/\.con-group-toggle-btn,\s*\n?\.ledger-toggle-btn\s*\{[^}]*background:\s*var\(--surface-raised\)/);
      expect(styleCss).toMatch(/\.ledger-toggle-btn:active\s*\{[^}]*transform:\s*scale\(0\.96\)/);
    });
  });

  describe('5. Customer Directory: Segment 1-Tap CSV Export Action', () => {
    it('renders .cust-export-btn in index.html with onclick="exportMailingListCsv()"', () => {
      expect(html).toContain('class="btn outline cust-export-btn" onclick="exportMailingListCsv()"');
      expect(html).toContain('📥 Export CSV');
    });

    it('enforces var(--target-min) and spring active scale on .cust-export-btn', () => {
      expect(styleCss).toMatch(/\.cust-export-btn\s*\{[^}]*min-height:\s*var\(--target-min/);
      expect(styleCss).toMatch(/\.cust-export-btn:active\s*\{[^}]*transform:\s*scale\(0\.96\)/);
    });

    it('implements window.exportMailingListCsv in main.js', () => {
      expect(mainJs).toContain('function exportMailingListCsv()');
      expect(mainJs).toContain('window.exportMailingListCsv = exportMailingListCsv;');
    });
  });

  describe('6. Web Analytics: KPI Cards Inline Sparkline Trajectory Guides', () => {
    it('renders .analytics-kpi-sparkline inside each analytics-kpi-card', () => {
      expect(html).toContain('class="analytics-kpi-sparkline"');
      expect(html).toContain('class="analytics-kpi-sparkline-bar"');
    });

    it('styles .analytics-kpi-sparkline-bar with spring transitions and hover color', () => {
      expect(styleCss).toMatch(/\.analytics-kpi-sparkline\s*\{[^}]*display:\s*flex/);
      expect(styleCss).toMatch(/\.analytics-kpi-sparkline-bar\s*\{[^}]*var\(--gold-line\)/);
      expect(styleCss).toMatch(/\.analytics-kpi-card:hover \.analytics-kpi-sparkline-bar\s*\{[^}]*background:\s*var\(--gold\)/);
    });
  });

  describe('7. Fair Print Kit: Selection Actions 44px Touch Targets', () => {
    it('enforces var(--target-min) and spring active scale on .fk-list-actions .btn', () => {
      expect(styleCss).toMatch(/\.fk-list-actions \.btn\s*\{[^}]*min-height:\s*var\(--target-min\)/);
      expect(styleCss).toMatch(/\.fk-list-actions \.btn:active\s*\{[^}]*transform:\s*scale\(0\.96\)/);
    });
  });

  describe('8. Settings Accent Swatches: APCA High-Contrast Focus Ring', () => {
    it('styles .accent-swatch-btn:focus-visible with double-ring halo and active scale', () => {
      expect(styleCss).toMatch(/\.accent-swatch-btn:focus-visible\s*\{[^}]*box-shadow:\s*0 0 0 2px var\(--surface-page\),\s*0 0 0 4px var\(--gold\)/);
      expect(styleCss).toMatch(/\.accent-swatch-btn:active\s*\{[^}]*transform:\s*scale\(0\.92\)/);
    });
  });

  describe('9. Order History: Filter Chip Count Badge Monospace Typography', () => {
    it('formats .ledger-chip-count with DM Mono, tnum, and surface-inset', () => {
      expect(styleCss).toMatch(/\.ledger-chip-count\s*\{[^}]*font-family:\s*'DM Mono'/);
      expect(styleCss).toMatch(/\.ledger-chip-count\s*\{[^}]*font-feature-settings:\s*"tnum" 1/);
      expect(styleCss).toMatch(/\.ledger-chip-count\s*\{[^}]*background:\s*var\(--surface-inset\)/);
    });
  });

  describe('10. Receipt Organizer: Action Buttons 44px Touch Geometry', () => {
    it('enforces var(--target-min) and spring kinetics on .organizer-actions .btn', () => {
      expect(styleCss).toMatch(/\.organizer-actions \.btn\s*\{[^}]*min-height:\s*var\(--target-min\)/);
      expect(styleCss).toMatch(/\.organizer-actions \.btn:active\s*\{[^}]*transform:\s*scale\(0\.96\)/);
      expect(styleCss).toMatch(/\.organizer-actions \.btn:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--gold\)/);
    });
  });
});
