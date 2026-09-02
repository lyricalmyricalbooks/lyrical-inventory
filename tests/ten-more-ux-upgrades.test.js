import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styleCss = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');
const indexHtml = readFileSync(path.join(__dirname, '../index.html'), 'utf8');

describe('Ten App-Wide UX Enhancements Suite (/ux-designer)', () => {
  describe('1. POS Till: Currency Selector & Head Actions Fitts Law (>= 44px)', () => {
    it('enforces var(--target-min) on .pos-checkout-ccy select with focus halo', () => {
      expect(styleCss).toMatch(/\.pos-checkout-ccy select\s*\{[^}]*min-height:\s*var\(--target-min\);/);
      expect(styleCss).toMatch(/\.pos-checkout-ccy select:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--gold\);/);
    });

    it('enforces var(--target-min) and spring physics on .pos-checkout-head .btn', () => {
      expect(styleCss).toMatch(/\.pos-checkout-head \.btn\s*\{[^}]*min-height:\s*var\(--target-min\);/);
      expect(styleCss).toMatch(/\.pos-checkout-head \.btn:active\s*\{[^}]*transform:\s*scale\(0\.96\);/);
    });
  });

  describe('2. Customer Audience: Sub-Navigation Tabs Canonical Tokens', () => {
    it('uses canonical content-secondary and gold-bg on .settings-sub-tab', () => {
      expect(styleCss).toMatch(/\.settings-sub-tab\s*\{[^}]*color:\s*var\(--content-secondary\);/);
      expect(styleCss).toMatch(/\.settings-sub-tab:hover\s*\{[^}]*background:\s*var\(--gold-bg\);/);
      expect(styleCss).toMatch(/\.settings-sub-tab\.active\s*\{[^}]*background:\s*var\(--gold-bg\);/);
    });
  });

  describe('3. Customer Segment: Filter Actions 44px Bounding Box', () => {
    it('enforces var(--target-min) and spring active scale on .seg-filter-bar > .btn', () => {
      expect(styleCss).toMatch(/\.seg-filter-bar > \.btn\s*\{[^}]*min-height:\s*var\(--target-min\);/);
      expect(styleCss).toMatch(/\.seg-filter-bar > \.btn:active\s*\{[^}]*transform:\s*scale\(0\.96\);/);
    });

    it('enforces min-height: var(--target-min) on manual subscriber add button', () => {
      expect(indexHtml).toContain('style="min-height:var(--target-min);padding:8px 18px;" onclick="addManualSubscriber()"');
    });
  });

  describe('4. Dashboard Overview: Action Buttons 44px Touch Targets & Spring Lift', () => {
    it('enforces var(--target-min) and spring lift on .dashboard-context .btn', () => {
      expect(styleCss).toMatch(/\.dashboard-context \.btn\s*\{[^}]*min-height:\s*var\(--target-min\);/);
      expect(styleCss).toMatch(/\.dashboard-context \.btn:hover\s*\{[^}]*transform:\s*translateY\(-1\.5px\);/);
      expect(styleCss).toMatch(/\.dashboard-context \.btn:active\s*\{[^}]*transform:\s*scale\(0\.96\);/);
    });
  });

  describe('5. Settings Profit Tiers: Add Tier & Save Actions 44px Bounding Box', () => {
    it('enforces var(--target-min) and spring kinetics on #ps-actions .btn', () => {
      expect(styleCss).toMatch(/#ps-actions \.btn\s*\{[^}]*min-height:\s*var\(--target-min\);/);
      expect(styleCss).toMatch(/#ps-actions \.btn:active\s*\{[^}]*transform:\s*scale\(0\.96\);/);
      expect(styleCss).toMatch(/#ps-actions \.btn:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--gold\);/);
    });
  });

  describe('6. Order History: Search Filter Clear Button 44px Fitts Target', () => {
    it('enforces var(--target-min) and DM Mono typography on .ledger-filter-row > .btn', () => {
      expect(styleCss).toMatch(/\.ledger-filter-row > \.btn\s*\{[^}]*min-height:\s*var\(--target-min\);/);
      expect(styleCss).toMatch(/\.ledger-filter-row > \.btn\s*\{[^}]*font-family:\s*'DM Mono', monospace;/);
      expect(styleCss).toMatch(/\.ledger-filter-row > \.btn:active\s*\{[^}]*transform:\s*scale\(0\.96\);/);
    });
  });

  describe('7. Invoices: Card Actions & Item Removal Button OKLCH Styling', () => {
    it('enforces var(--target-min) on .invoice-card .inv-c-btns .btn', () => {
      expect(indexHtml).toMatch(/\.invoice-card \.inv-c-btns \.btn\{min-height:var\(--target-min\);/);
      expect(indexHtml).toMatch(/\.invoice-card \.inv-c-btns \.btn:active\{transform:scale\(0\.96\);/);
    });

    it('enforces 36px touch zone and status-critical tokens on .inv-item-row .inv-item-remove', () => {
      expect(indexHtml).toMatch(/\.inv-item-row \.inv-item-remove\{[^}]*min-width:36px;/);
      expect(indexHtml).toMatch(/\.inv-item-row \.inv-item-remove:hover\{color:var\(--status-critical\);/);
    });
  });

  describe('8. Book Switcher: Tab 44px Min-Height & APCA Contrast', () => {
    it('enforces var(--target-min) and on-inverse-2 contrast on .book-tab', () => {
      expect(styleCss).toMatch(/\.book-tab\s*\{[^}]*min-height:\s*var\(--target-min\);/);
      expect(styleCss).toMatch(/\.book-tab\s*\{[^}]*color:\s*var\(--on-inverse-2\);/);
      expect(styleCss).toMatch(/\.book-tab:active\s*\{[^}]*transform:\s*scale\(0\.97\);/);
    });
  });

  describe('9. Open Call: Action Buttons 44px Target & OKLCH Danger Tokens', () => {
    it('enforces var(--target-min) on .oc-layout .btn.sm', () => {
      expect(styleCss).toMatch(/\.oc-layout \.btn\.sm\s*\{[^}]*min-height:\s*var\(--target-min\);/);
      expect(styleCss).toMatch(/\.oc-layout \.btn\.sm:active\s*\{[^}]*transform:\s*scale\(0\.96\);/);
    });

    it('uses OKLCH rose token on .oc-layout .btn.danger-btn', () => {
      expect(styleCss).toMatch(/\.oc-layout \.btn\.danger-btn\s*\{[^}]*color:\s*var\(--status-critical\);/);
      expect(styleCss).toMatch(/\.oc-layout \.btn\.danger-btn\s*\{[^}]*border-color:\s*oklch\(0\.65 0\.22 25 \/ 0\.3\);/);
    });
  });

  describe('10. Tax Centre: Trip Quick Chips 44px Target & Monospace Figures', () => {
    it('enforces var(--target-min) on .tc-trip-chip with spring kinetics', () => {
      expect(styleCss).toMatch(/\.tc-trip-chip\s*\{[^}]*min-height:\s*var\(--target-min\);/);
      expect(styleCss).toMatch(/\.tc-trip-chip:hover\s*\{[^}]*transform:\s*translateY\(-1\.5px\);/);
      expect(styleCss).toMatch(/\.tc-trip-chip:active\s*\{[^}]*transform:\s*scale\(0\.96\);/);
    });

    it('formats .count-pill with DM Mono and tabular figures (tnum)', () => {
      expect(styleCss).toMatch(/\.tc-trip-chip \.count-pill\s*\{[^}]*font-family:\s*'DM Mono', monospace;/);
      expect(styleCss).toMatch(/\.tc-trip-chip \.count-pill\s*\{[^}]*font-feature-settings:\s*'tnum' 1, 'zero' 1;/);
    });
  });
});
