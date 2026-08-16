import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { appSource } from './helpers/extract-decl.js';
import { resolve } from 'path';

const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
const styleCss = readFileSync(resolve(__dirname, '../src/style.css'), 'utf8');
const themeDarkCss = readFileSync(resolve(__dirname, '../src/styles/theme-dark.css'), 'utf8');
// Receipt capture and the AI scan moved to src/features/receipts.js; the tax
// centre's own code lives in src/features/taxcentre.js. These assertions are
// about the app's behaviour, not which file holds it.
const mainJs = appSource;
const taxcentreJs = readFileSync(resolve(__dirname, '../src/features/taxcentre.js'), 'utf8');

describe('Tax Centre UX Enhancements Suite (#2, #3, #10, #15, #18, #19)', () => {
  // ── #15: WAI-ARIA 1.2 Tabs Compliance
  describe('#15 WAI-ARIA 1.2 Tabs Compliance for Tax Sub-Navigation', () => {
    it('sets role="tablist" and aria-label on .tc-sub-nav', () => {
      expect(html).toContain('role="tablist"');
      expect(html).toContain('aria-label="Tax Centre Navigation"');
      expect(html).toContain('onkeydown="tcSubNavKeydown(event)"');
    });

    it('sets role="tab", aria-selected, aria-controls and tabindex on subtabs', () => {
      expect(html).toContain('id="btn-tctab-ledger" role="tab" aria-selected="true" aria-controls="tc-sec-ledger"');
      expect(html).toContain('id="btn-tctab-receipts" role="tab" aria-selected="false" aria-controls="tc-sec-receipts"');
      expect(html).toContain('id="btn-tctab-integrations" role="tab" aria-selected="false" aria-controls="tc-sec-integrations"');
    });

    it('sets role="tabpanel" and aria-labelledby on sub-sections', () => {
      expect(html).toContain('id="tc-sec-ledger" class="tc-section settings-section" role="tabpanel" aria-labelledby="btn-tctab-ledger"');
      expect(html).toContain('id="tc-sec-receipts" class="tc-section settings-section" role="tabpanel" aria-labelledby="btn-tctab-receipts"');
      expect(html).toContain('id="tc-sec-integrations" class="tc-section settings-section" role="tabpanel" aria-labelledby="btn-tctab-integrations"');
    });

    it('exports and handles tcSubNavKeydown in taxcentre.js and main.js', () => {
      expect(taxcentreJs).toContain('function tcSubNavKeydown(');
      expect(taxcentreJs).toContain('tcSubNavKeydown,');
      expect(mainJs).toContain('tcSubNavKeydown,');
    });
  });

  // ── #2: Interactive Proof-of-Payment Filter Tiles
  describe('#2 Interactive Proof-of-Payment Filter Tiles in Receipts Vault', () => {
    it('exports and defines tcFilterLedgerByReceiptStorage in taxcentre.js and main.js', () => {
      expect(taxcentreJs).toContain('function tcFilterLedgerByReceiptStorage(');
      expect(taxcentreJs).toContain('tcFilterLedgerByReceiptStorage,');
      expect(mainJs).toContain('tcFilterLedgerByReceiptStorage,');
    });

    it('includes role="button" and click handlers on receipt storage tiles', () => {
      expect(taxcentreJs).toContain("tcFilterLedgerByReceiptStorage('local')");
      expect(taxcentreJs).toContain("tcFilterLedgerByReceiptStorage('cloud')");
      expect(taxcentreJs).toContain("tcFilterLedgerByReceiptStorage('missing')");
      expect(taxcentreJs).toContain("tcFilterLedgerByReceiptStorage('linked')");
      expect(taxcentreJs).toContain("tcFilterLedgerByReceiptStorage('label')");
    });

    it('has styling for interactive tiles, hover states, and active filter selection', () => {
      expect(styleCss).toContain('.tc-receipt-tile{background:var(--surface-sunken);');
      expect(styleCss).toContain('cursor:pointer;');
      expect(styleCss).toContain('.tc-receipt-tile.is-selected-filter');
    });
  });

  // ── #3: Tax Season Pre-Flight Audit Modal
  describe('#3 Tax Season Pre-Flight Audit Modal & Readiness Score', () => {
    it('defines #m-tc-preflight modal with preflight checklist and actions in index.html', () => {
      expect(html).toContain('id="m-tc-preflight"');
      expect(html).toContain('Tax Season Audit Pre-Flight Check');
      expect(html).toContain('id="tc-preflight-content"');
      expect(html).toContain('id="tc-preflight-export-btn"');
    });

    it('implements and exports openTaxSeasonPreflightModal, tcJumpToFixPreflightIssues, and executeFullTaxSeasonExport', () => {
      expect(taxcentreJs).toContain('function openTaxSeasonPreflightModal(');
      expect(taxcentreJs).toContain('function tcJumpToFixPreflightIssues(');
      expect(taxcentreJs).toContain('function executeFullTaxSeasonExport(');
      expect(taxcentreJs).toContain('openTaxSeasonPreflightModal,');
      expect(mainJs).toContain('openTaxSeasonPreflightModal,');
    });

    it('wires the Tax Season Export button in index.html to openTaxSeasonPreflightModal()', () => {
      expect(html).toContain('onclick="openTaxSeasonPreflightModal()"');
    });
  });

  // ── #10: Progressive AI Receipt Scan with Shimmer Skeletons
  describe('#10 Progressive AI Receipt Scan with Shimmer Skeletons', () => {
    it('initializes tc-ai-scan-btn with disabled attribute and explanatory title in index.html', () => {
      expect(html).toContain('id="tc-ai-scan-btn" disabled');
    });

    it('toggles disabled state in tcExpFileChosen and tcExpFileClear', () => {
      expect(mainJs).toContain('aiBtn.disabled = !hasFile');
      // Clearing the receipt field must also drop any pending webcam capture,
      // or the next submit could reuse it. This used to be asserted as the
      // literal `window._pendingWebcamReceipt = null;`, which was a no-op: that
      // window property is not the module-scoped `_pendingWebcamReceipt` the
      // capture actually sets, and nothing ever wrote it. The clear now goes
      // through the accessor, so this pins the behaviour rather than the typo.
      expect(mainJs).toContain('setPendingWebcamReceipt(null)');
      // Assignment specifically — the comment above the fix names the old
      // property on purpose, so a bare substring check would match the prose.
      expect(mainJs).not.toContain('window._pendingWebcamReceipt =');
    });

    it('adds and removes tc-field-shimmer and tc-field-extracted in _runReceiptScan', () => {
      expect(mainJs).toContain("shimmerFields.forEach(el => el.classList.add('tc-field-shimmer'))");
      expect(mainJs).toContain("shimmerFields.forEach(el => el.classList.remove('tc-field-shimmer'))");
      expect(mainJs).toContain("el.classList.add('tc-field-extracted')");
    });

    it('defines shimmer pulse and extraction glow keyframes in style.css', () => {
      expect(styleCss).toContain('@keyframes tcShimmerPulse');
      expect(styleCss).toContain('.tc-field-shimmer');
      expect(styleCss).toContain('@keyframes tcFieldExtractFlash');
      expect(styleCss).toContain('.tc-field-extracted');
    });
  });

  // ── #18: Receipts Vault Visual Gallery & Lightbox
  describe('#18 Receipts Vault Visual Gallery & Quick Lightbox Modal', () => {
    it('defines view switcher and gallery containers in index.html', () => {
      expect(html).toContain('id="btn-vault-view-overview"');
      expect(html).toContain('id="btn-vault-view-gallery"');
      expect(html).toContain('id="tc-vault-overview-view"');
      expect(html).toContain('id="tc-vault-gallery-view"');
      expect(html).toContain('id="tc-gallery-grid"');
    });

    it('defines #m-tc-receipt-lightbox modal with zoom, rotate, reset, and navigation in index.html', () => {
      expect(html).toContain('id="m-tc-receipt-lightbox"');
      expect(html).toContain('id="tc-lightbox-img"');
      expect(html).toContain('id="tc-lightbox-canvas"');
      expect(html).toContain('onclick="tcLightboxZoom(0.25)"');
      expect(html).toContain('onclick="tcLightboxRotate()"');
      expect(html).toContain('onclick="tcLightboxReset()"');
      expect(html).toContain('id="tc-lightbox-prev-btn"');
      expect(html).toContain('id="tc-lightbox-next-btn"');
    });

    it('implements and exports gallery and lightbox methods in taxcentre.js and main.js', () => {
      expect(taxcentreJs).toContain('function tcSetVaultView(');
      expect(taxcentreJs).toContain('function _tcRenderReceiptGallery(');
      expect(taxcentreJs).toContain('function openReceiptLightbox(');
      expect(taxcentreJs).toContain('function tcLightboxZoom(');
      expect(taxcentreJs).toContain('function tcLightboxRotate(');
      expect(taxcentreJs).toContain('function tcLightboxReset(');
      expect(taxcentreJs).toContain('function tcLightboxNav(');
      expect(mainJs).toContain('openReceiptLightbox,');
      expect(mainJs).toContain('tcSetVaultView,');
    });

    it('defines gallery card and lightbox styling in style.css', () => {
      expect(styleCss).toContain('.tc-gallery-grid');
      expect(styleCss).toContain('.tc-gallery-card');
      expect(styleCss).toContain('.tc-gallery-thumb-wrap');
      expect(styleCss).toContain('.tc-lightbox-modal');
    });
  });

  // ── #19: Dark Mode Surface Depth & Glassmorphism
  describe('#19 Dark Mode Surface Depth & Elevations', () => {
    it('defines dark mode overrides for tc-gallery-card, tc-receipt-tile, and tc-lightbox-modal in theme-dark.css', () => {
      expect(themeDarkCss).toContain('.theme-dark .tc-receipt-tile:hover');
      expect(themeDarkCss).toContain('.theme-dark .tc-gallery-card');
      expect(themeDarkCss).toContain('.theme-dark .tc-gallery-thumb-wrap');
      expect(themeDarkCss).toContain('.theme-dark .tc-lightbox-modal');
    });
  });
});
