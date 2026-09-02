import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styleCss = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');
const mainJs = readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');

describe('App-Wide 5 UX Enhancements Suite (/ux-designer)', () => {
  describe('1. Consignment: Store Quick Filter Chips 44px Fitts & Spring Physics', () => {
    it('enforces var(--target-min) on .store-quick-chip with generous padding', () => {
      expect(styleCss).toMatch(/\.store-quick-chip\s*\{[^}]*min-height:\s*var\(--target-min\);/);
      expect(styleCss).toMatch(/\.store-quick-chip\s*\{[^}]*padding:\s*8px 16px;/);
      expect(styleCss).toMatch(/\.store-quick-chip\s*\{[^}]*background:\s*var\(--surface-raised\);/);
    });

    it('provides spring micro-interactions and accessibility focus indicators', () => {
      expect(styleCss).toMatch(/\.store-quick-chip:active\s*\{[^}]*transform:\s*scale\(0\.96\);/);
      expect(styleCss).toMatch(/\.store-quick-chip:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--gold\);/);
    });
  });

  describe('2. Settings: Zero Blank State Architecture for System Backups', () => {
    it('renders semantic .sys-backup-empty-state with icon and primary snapshot CTA', () => {
      expect(mainJs).toContain('sys-backup-empty-state');
      expect(mainJs).toContain('No System Backups Yet');
      expect(mainJs).toContain("createSystemBackup('manual')");
      expect(mainJs).toContain('Create Snapshot Now');
    });

    it('formats backup timestamps and book counts with tabular monospace figures (tnum)', () => {
      expect(mainJs).toContain('<td class="tnum">${new Date(b.createdAt).toLocaleString()}</td>');
      expect(mainJs).toContain('<td class="r tnum" style="font-family:\'DM Mono\',monospace;font-weight:600;">');
    });
  });

  describe('3. Google Sheets: Zero Blank State & Webhook Connection CTA', () => {
    it('renders structured .sheets-empty-state with icon and test webhook CTA button', () => {
      expect(mainJs).toContain('sheets-empty-state');
      expect(mainJs).toContain('No Sync Events Logged Yet');
      expect(mainJs).toContain('testSheets()');
      expect(mainJs).toContain('Test Webhook Connection');
    });

    it('applies tabular monospace figures to sync log timestamps', () => {
      expect(mainJs).toContain('<td class="sheets-time tnum">${l.time}</td>');
    });
  });

  describe('4. Open Call: Fitts Law 44px Toolbar & OKLCH Photo Tag Chips', () => {
    it('elevates .oc-toolbar-btn to 44px min bounding box with spring kinetics', () => {
      expect(styleCss).toMatch(/\.oc-toolbar-btn\s*\{[^}]*min-width:\s*var\(--target-min\);/);
      expect(styleCss).toMatch(/\.oc-toolbar-btn\s*\{[^}]*min-height:\s*var\(--target-min\);/);
      expect(styleCss).toMatch(/\.oc-toolbar-btn:active[^{]*\{[^}]*transform:\s*scale\(0\.95\);/);
    });

    it('upgrades .oc-photo-chip-remove with circular touch area and OKLCH rose token', () => {
      expect(styleCss).toMatch(/\.oc-photo-chip-remove\s*\{[^}]*min-width:\s*24px;/);
      expect(styleCss).toMatch(/\.oc-photo-chip-remove\s*\{[^}]*min-height:\s*24px;/);
      expect(styleCss).toMatch(/\.oc-photo-chip-remove:hover\s*\{[^}]*oklch\(0\.65 0\.22 25/);
    });
  });

  describe('5. Catalogue: 44px Action Targets, Tabular Figures & Card Kinetics', () => {
    it('elevates .catalog-actions .btn to var(--target-min) with spring physics', () => {
      expect(styleCss).toMatch(/\.catalog-actions \.btn\s*\{[^}]*min-height:\s*var\(--target-min\);/);
      expect(styleCss).toMatch(/\.catalog-actions \.btn:active\s*\{[^}]*transform:\s*scale\(0\.96\);/);
    });

    it('uses canonical elevation tokens and spring ease on .catalog-card', () => {
      expect(styleCss).toMatch(/\.catalog-card\s*\{[^}]*box-shadow:\s*var\(--elev-1\);/);
      expect(styleCss).toMatch(/\.catalog-card:active\s*\{[^}]*transform:\s*scale\(0\.99\);/);
    });

    it('formats book prices and IDs with tabular monospace DM Mono figures and adds test books empty state', () => {
      expect(mainJs).toContain('class="tnum" style="font-family:\'DM Mono\',monospace;font-size:12px;"');
      expect(mainJs).toContain('No Test Books Found');
    });
  });
});
