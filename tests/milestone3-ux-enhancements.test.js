import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const css = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');
const js = readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');

describe('Milestone 3 UX Enhancements (Features 18–25)', () => {
  describe('Feature 18: Payment QR Modal & POS QR Modal Ergonomics', () => {
    it('implements dedicated class .pqr-override-card with canonical sunken surface and gold line', () => {
      expect(html).toContain('class="pqr-override-card"');
      expect(css).toMatch(/\.pqr-override-card\s*\{[^}]*background:\s*var\(--surface-sunken\)/);
      expect(css).toMatch(/\.pqr-override-card\s*\{[^}]*border:\s*1px solid var\(--gold-line\)/);
    });

    it('enforces >= 44px touch targets on override controls and copy payment links', () => {
      expect(css).toMatch(/\.pqr-select,\s*\.pqr-input\s*\{[^}]*min-height:\s*var\(--target-min/);
      expect(css).toMatch(/\.pqr-gen-btn\s*\{[^}]*min-height:\s*var\(--target-min/);
      expect(css).toMatch(/\.pqr-link-input\s*\{[^}]*min-height:\s*var\(--target-min/);
      expect(css).toMatch(/\.pqr-copy-btn\s*\{[^}]*min-height:\s*var\(--target-min/);
    });

    it('enforces tabular monospace numerals and spring kinetics on QR action buttons', () => {
      expect(css).toMatch(/\.pqr-input\s*\{[^}]*font-family:\s*'DM Mono'/);
      expect(css).toMatch(/\.pqr-input\s*\{[^}]*font-feature-settings:\s*"tnum"\s*1/);
      expect(css).toMatch(/\.pqr-gen-btn:active\s*\{[^}]*transform:\s*scale\(0\.96\)/);
      expect(css).toMatch(/\.pqr-copy-btn:active\s*\{[^}]*transform:\s*scale\(0\.96\)/);
    });

    it('upgrades POS payment QR amount with tabular numbers and semantic status token', () => {
      expect(html).toContain('id="pos-qr-amount" class="tnum"');
      expect(html).toContain('color:var(--status-settled');
    });
  });

  describe('Feature 19: Fair Print Kit QR Sheet Popovers & Checkboxes', () => {
    it('upgrades Fair Kit popover close button to 44px x 44px', () => {
      expect(css).toMatch(/\.fk-pop-close\s*\{[^}]*min-width:\s*var\(--target-min/);
      expect(css).toMatch(/\.fk-pop-close\s*\{[^}]*min-height:\s*var\(--target-min/);
    });

    it('expands Fair Kit popover action buttons and checkboxes to 44px touch targets', () => {
      expect(css).toMatch(/\.fk-pop-actions \.btn\s*\{[^}]*min-height:\s*var\(--target-min/);
      expect(css).toMatch(/\.fk-check\s*\{[^}]*min-height:\s*var\(--target-min/);
    });

    it('replaces non-canonical var(--surface-card) with var(--surface-raised) across Fair Kit components', () => {
      expect(css).toMatch(/\.fk-pop\s*\{[^}]*background:\s*var\(--surface-raised\)/);
      expect(css).toMatch(/\.fk-list-shell\s*\{[^}]*background:\s*var\(--surface-raised\)/);
      expect(css).toMatch(/\.fk-check\s*\{[^}]*background:\s*var\(--surface-raised\)/);
    });
  });

  describe('Feature 20: Author Portal QR View Visual Hierarchy & Kinetics', () => {
    it('structures Author QR view using dedicated .author-qr-card and .author-qr-plate', () => {
      expect(html).toContain('class="author-qr-card"');
      expect(html).toContain('class="author-qr-plate"');
      expect(html).toContain('author-qr-btn');
      expect(html).toContain('class="author-qr-guide"');
    });

    it('elevates QR plate with --elev-3 and applies high APCA contrast typography', () => {
      expect(css).toMatch(/\.author-qr-plate\s*\{[^}]*box-shadow:\s*var\(--elev-3\)/);
      expect(css).toMatch(/\.author-qr-meta\s*\{[^}]*color:\s*var\(--content-secondary\)/);
      expect(css).toMatch(/\.author-qr-status\s*\{[^}]*color:\s*var\(--content-secondary\)/);
    });

    it('enforces 44px touch targets and tactile spring feedback on author action buttons', () => {
      expect(css).toMatch(/\.author-qr-btn\s*\{[^}]*min-height:\s*var\(--target-min/);
      expect(css).toMatch(/\.author-qr-btn:active\s*\{[^}]*transform:\s*scale\(0\.96\)/);
    });

    it('styles "How to use" guide with canonical sunken surface and gold border', () => {
      expect(css).toMatch(/\.author-qr-guide\s*\{[^}]*background:\s*var\(--surface-sunken\)/);
      expect(css).toMatch(/\.author-qr-guide\s*\{[^}]*border:\s*1px solid var\(--gold-line\)/);
    });
  });

  describe('Feature 21: Book Catalog Overview Strips Token Hygiene & Monospace Alignment', () => {
    it('uses canonical semantic tokens var(--surface-raised) and var(--surface-sunken) on book strips', () => {
      expect(css).toMatch(/\.book-strip\s*\{[^}]*background:\s*var\(--surface-raised\)/);
      expect(css).toMatch(/\.book-strip-kpis\s*\{[^}]*background:\s*var\(--surface-sunken\)/);
      expect(css).toMatch(/\.bsk\s*\{[^}]*background:\s*var\(--surface-raised\)/);
    });

    it('replaces raw hex #c05e00 with OKLCH / semantic status token', () => {
      expect(css).not.toContain('.bsk-val.warn {\n  color: #c05e00;\n}');
      expect(css).toMatch(/\.bsk-val\.warn\s*\{[^}]*color:\s*var\(--status-active/);
    });

    it('enforces tabular monospace figures on book overview KPI values', () => {
      expect(css).toMatch(/\.bsk-val\s*\{[^}]*font-feature-settings:\s*"tnum"\s*1/);
      expect(css).toMatch(/\.bsk-val\s*\{[^}]*font-variant-numeric:\s*tabular-nums/);
    });

    it('enforces >= 44px touch targets and spring active scaling on manage button', () => {
      expect(css).toMatch(/\.manage-btn\s*\{[^}]*min-height:\s*var\(--target-min/);
      expect(css).toMatch(/\.manage-btn:active\s*\{[^}]*transform:\s*scale\(0\.96\)/);
    });
  });

  describe('Feature 22: Settings Book Catalog Blank-State Resilience', () => {
    it('provides full-fidelity empty state in renderCatalogList when regularBooks is empty', () => {
      expect(js).toContain('No Books in Production Catalogue');
      expect(js).toContain('📚');
      expect(js).toContain('+ Add your first book');
      expect(js).toContain('openAddBookModal()');
    });

    it('upgrades .catalog-card to canonical var(--surface-raised) token', () => {
      expect(css).toMatch(/\.catalog-card\s*\{[^}]*background:\s*var\(--surface-raised\)/);
      expect(css).toMatch(/\.catalog-card\s*\{[^}]*border:\s*1px solid var\(--border-default\)/);
    });
  });

  describe('Feature 23: Add/Edit Book Walkthrough Modal Targets & Swatches', () => {
    it('expands modal close button to >= 44px', () => {
      expect(css).toMatch(/\.modal-close-btn\s*\{[^}]*min-width:\s*var\(--target-min/);
      expect(css).toMatch(/\.modal-close-btn\s*\{[^}]*min-height:\s*var\(--target-min/);
    });

    it('expands color swatch hit bounding box to >= 44px via ::after pseudo-element', () => {
      expect(css).toMatch(/\.accent-swatch-btn::after\s*\{[^}]*min-width:\s*var\(--target-min/);
      expect(css).toMatch(/\.accent-swatch-btn::after\s*\{[^}]*min-height:\s*var\(--target-min/);
    });

    it('upgrades custom color picker and preset chips to >= 44px with spring kinetics', () => {
      expect(css).toMatch(/\.accent-custom-picker\s*\{[^}]*min-height:\s*var\(--target-min/);
      expect(css).toMatch(/\.preset-chip-btn\s*\{[^}]*min-height:\s*var\(--target-min/);
      expect(css).toMatch(/\.preset-chip-btn:active\s*\{[^}]*transform:\s*scale\(0\.96\)/);
    });
  });

  describe('Feature 24: Stock Transfer Steppers & Direction Toggle Ergonomics', () => {
    it('styles balance cards with canonical surface sunken and semantic tokens', () => {
      expect(html).toContain('class="st-balance-card"');
      expect(css).toMatch(/\.st-balance-card\s*\{[^}]*background:\s*var\(--surface-sunken\)/);
      expect(css).toMatch(/\.st-balance-val\.author-val\s*\{[^}]*color:\s*var\(--violet-deep/);
    });

    it('upgrades direction toggle and quick steppers to 44px touch targets with spring kinetics', () => {
      expect(css).toMatch(/\.st-dir-btn\s*\{[^}]*min-height:\s*var\(--target-min/);
      expect(css).toMatch(/\.st-dir-btn:active\s*\{[^}]*transform:\s*scale\(0\.96\)/);
      expect(css).toMatch(/\.st-stepper-btn\s*\{[^}]*min-height:\s*var\(--target-min/);
      expect(css).toMatch(/\.st-stepper-btn:active\s*\{[^}]*transform:\s*scale\(0\.95\)/);
    });

    it('styles transfer preview box with canonical surface sunken and gold border', () => {
      expect(html).toContain('id="st-preview" class="st-preview-box"');
      expect(css).toMatch(/\.st-preview-box\s*\{[^}]*background:\s*var\(--surface-sunken\)/);
      expect(css).toMatch(/\.st-preview-box\s*\{[^}]*border:\s*1px solid var\(--gold-line\)/);
    });
  });

  describe('Feature 25: Backup Snapshots & Global Dialog Actions', () => {
    it('upgrades system backups empty state with 💾 icon, explanation, and CTA button', () => {
      expect(html).toContain('No Cloud Snapshots Saved Yet');
      expect(html).toContain('createSystemBackupNow()');
      expect(html).toContain('Create first backup now');
    });

    it('upgrades restore file label buttons to 44px touch targets with spring kinetics', () => {
      expect(html).toContain('class="btn sm gold restore-file-btn"');
      expect(css).toMatch(/\.restore-file-btn\s*\{[^}]*min-height:\s*var\(--target-min/);
      expect(css).toMatch(/\.restore-file-btn:active\s*\{[^}]*transform:\s*scale\(0\.96\)/);
    });

    it('styles backup reminder banner with canonical gold background and gold line tokens', () => {
      expect(html).toContain('id="backup-reminder" style="display:none;background:var(--gold-bg);border:1px solid var(--gold-line)');
    });

    it('enforces 44px touch targets and spring active scaling across m-confirm and m-prompt dialogs', () => {
      expect(css).toMatch(/#m-confirm \.modal-footer \.btn,\s*#m-prompt \.modal-footer \.btn\s*\{[^}]*min-height:\s*var\(--target-min/);
      expect(css).toMatch(/#m-confirm \.modal-footer \.btn:active,\s*#m-prompt \.modal-footer \.btn:active\s*\{[^}]*transform:\s*scale\(0\.96\)/);
    });
  });
});
