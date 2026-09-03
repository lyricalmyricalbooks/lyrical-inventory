import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');
const markup = readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const mainJs = readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');

describe('Milestone 2 UX Enhancements (Features 10–17)', () => {
  describe('Feature 10: Receipt OCR Dropzone & Scanning Action Bar', () => {
    test('receipt dropzone uses canonical brand tint and spring kinetics', () => {
      const dropzoneHover = styles.match(/\.dropzone:hover,\s*\.dropzone\.drag\s*\{([\s\S]*?)\}/);
      expect(dropzoneHover).not.toBeNull();
      expect(dropzoneHover[1]).toMatch(/var\(--brand-surface-tint/);

      const dropzoneBase = styles.match(/\.dropzone\s*\{([\s\S]*?)\}/);
      expect(dropzoneBase).not.toBeNull();
      expect(dropzoneBase[1]).toMatch(/var\(--ease-spring\)/);
    });

    test('.dz-remove hit box meets 44px touch target invariant', () => {
      const dzRemove = styles.match(/\.dz-remove\s*\{([\s\S]*?)\}/);
      expect(dzRemove).not.toBeNull();
      expect(dzRemove[1]).toMatch(/min-width:\s*44px/);
      expect(dzRemove[1]).toMatch(/min-height:\s*44px/);
      expect(dzRemove[1]).toMatch(/display:\s*inline-flex/);
      expect(dzRemove[1]).toMatch(/var\(--ease-spring\)/);
    });

    test('camera and AI scan buttons meet >= 44px target with spring kinetics', () => {
      const scanActions = styles.match(/\.tc-receipt-scan-actions \.btn,\s*#tc-cam-btn,\s*#tc-ai-scan-btn\s*\{([\s\S]*?)\}/);
      expect(scanActions).not.toBeNull();
      expect(scanActions[1]).toMatch(/min-height:\s*var\(--target-min,\s*44px\)/);
      expect(scanActions[1]).toMatch(/var\(--ease-spring\)/);

      expect(markup).toMatch(/<button class="btn gold outline" onclick="openReceiptCameraModal\(\)" id="tc-cam-btn"/);
      expect(markup).toMatch(/<button class="btn gold" onclick="scanReceiptWithAI\(\)" id="tc-ai-scan-btn"/);
    });
  });

  describe('Feature 11: Trip Picker Dropdown, Quick Chips & View Switchers', () => {
    test('trip picker dropdown toggle has 44px bounding box', () => {
      const dropdownBtn = styles.match(/\.tc-trip-dropdown-btn\s*\{([\s\S]*?)\n\}/);
      expect(dropdownBtn).not.toBeNull();
      expect(dropdownBtn[1]).toMatch(/width:\s*44px/);
      expect(dropdownBtn[1]).toMatch(/min-height:\s*var\(--target-min,\s*44px\)/);
      expect(dropdownBtn[1]).toMatch(/var\(--ease-spring\)/);
    });

    test('trips and vault view switchers use segmented track, >=44px height, and spring kinetics', () => {
      const trackRule = styles.match(/\.tc-trips-view-toggle,\s*\n\.tc-vault-view-switch\s*\{([\s\S]*?)\n\}/);
      expect(trackRule).not.toBeNull();
      expect(trackRule[1]).toMatch(/var\(--cream2/);
      expect(trackRule[1]).toMatch(/var\(--gold-line/);

      const btnRule = styles.match(/\.tc-trips-view-btn,\s*\n\.tc-vault-view-btn\s*\{([\s\S]*?)\n\}/);
      expect(btnRule).not.toBeNull();
      expect(btnRule[1]).toMatch(/min-height:\s*var\(--target-min,\s*44px\)/);
      expect(btnRule[1]).toMatch(/var\(--ease-spring\)/);

      const activeRule = styles.match(/\.tc-trips-view-btn\.active,\s*\n\.tc-vault-view-btn\.active\s*\{([\s\S]*?)\n\}/);
      expect(activeRule).not.toBeNull();
      expect(activeRule[1]).toMatch(/var\(--surface-card\)/);
      expect(activeRule[1]).toMatch(/var\(--elev-1/);

      const activePress = styles.match(/\.tc-trips-view-btn:active,\s*\n\.tc-vault-view-btn:active\s*\{([\s\S]*?)\n\}/);
      expect(activePress).not.toBeNull();
      expect(activePress[1]).toMatch(/transform:\s*scale\(0\.975\)/);
    });
  });

  describe('Feature 12: Cash Flow Delta Chips, Monospace Figures & Filter Pills', () => {
    test('.cf-stat-delta enforces DM Mono and tabular figures', () => {
      const deltaRule = styles.match(/\.cf-stat-delta\s*\{([\s\S]*?)\}/);
      expect(deltaRule).not.toBeNull();
      expect(deltaRule[1]).toMatch(/font-family:\s*'DM Mono',\s*monospace/);
      expect(deltaRule[1]).toMatch(/font-feature-settings:\s*"tnum"\s*1/);
    });

    test('.cf-detail-totals span uses canonical surface and DM Mono tabular figures', () => {
      const totalsRule = styles.match(/\.cf-detail-totals span\s*\{([\s\S]*?)\}/);
      expect(totalsRule).not.toBeNull();
      expect(totalsRule[1]).toMatch(/var\(--surface-raised/);
      expect(totalsRule[1]).toMatch(/font-family:\s*'DM Mono',\s*monospace/);
      expect(totalsRule[1]).toMatch(/font-feature-settings:\s*"tnum"\s*1/);
    });

    test('.cf-detail-filter enlarged to >= 44px with spring kinetics and focus halo', () => {
      const filterRule = styles.match(/\.cf-detail-filter\s*\{([\s\S]*?)\}/);
      expect(filterRule).not.toBeNull();
      expect(filterRule[1]).toMatch(/min-height:\s*var\(--target-min,\s*44px\)/);
      expect(filterRule[1]).toMatch(/var\(--surface-inset/);
      expect(filterRule[1]).toMatch(/var\(--ease-spring\)/);

      const focusRule = styles.match(/\.cf-detail-filter:focus-visible\s*\{([\s\S]*?)\}/);
      expect(focusRule).not.toBeNull();
      expect(focusRule[1]).toMatch(/var\(--focus-ring-halo/);
    });
  });

  describe('Feature 13: Discovered Buyers Table Action Geometry & Tabular Alignment', () => {
    test('customer and mailing list action buttons enforce >= 44px touch targets and spring press', () => {
      const btnRule = styles.match(/#cust-body \.btn,\s*#ml-body \.btn,\s*\.cust-action-btn\s*\{([\s\S]*?)\}/);
      expect(btnRule).not.toBeNull();
      expect(btnRule[1]).toMatch(/min-height:\s*var\(--target-min,\s*44px\)/);
      expect(btnRule[1]).toMatch(/var\(--ease-spring\)/);

      const activeBtnRule = styles.match(/#cust-body \.btn:active,\s*#ml-body \.btn:active,\s*\.cust-action-btn:active\s*\{([\s\S]*?)\}/);
      expect(activeBtnRule).not.toBeNull();
      expect(activeBtnRule[1]).toMatch(/transform:\s*scale\(0\.96\)/);
    });

    test('customer table numeric and date cells enforce monospace tabular figures', () => {
      const numCells = styles.match(/#cust-body td\.r,\s*#cust-body \.money-cell,\s*#cust-body \.date-cell,\s*#ml-body td\.r,\s*#ml-body \.date-cell\s*\{([\s\S]*?)\}/);
      expect(numCells).not.toBeNull();
      expect(numCells[1]).toMatch(/font-family:\s*'DM Mono',\s*monospace/);
      expect(numCells[1]).toMatch(/font-feature-settings:\s*"tnum"\s*1/);
    });

    test('renderCustomers assigns cust-action-btn to row action buttons', () => {
      expect(mainJs).toMatch(/<button class="btn sm(?: gold)? cust-action-btn"/);
    });
  });

  describe('Feature 14: Customer Directory & Mailing List Empty State', () => {
    test('renderMailingList includes canonical .empty-state.sys-empty with ✉️ icon and CTAs', () => {
      const mlFn = mainJs.match(/function renderMailingList\(\)\s*\{([\s\S]*?)\n\}/);
      expect(mlFn).not.toBeNull();
      expect(mlFn[1]).toMatch(/<div class="empty-state sys-empty"/);
      expect(mlFn[1]).toMatch(/✉️/);
      expect(mlFn[1]).toMatch(/Your mailing list is empty/);
      expect(mlFn[1]).toMatch(/addAllBuyersToMailingList\(\)/);
      expect(mlFn[1]).toMatch(/Add all discovered buyers/);
      expect(mlFn[1]).toMatch(/Add manually/);
    });
  });

  describe('Feature 15: Campaign Composer Helper Tags & Mode Indicator', () => {
    test('.helper-tag-btn has >= 44px touch target, canonical tokens, and spring feedback', () => {
      const helperRule = styles.match(/\.helper-tag-btn\s*\{([\s\S]*?)\}/);
      expect(helperRule).not.toBeNull();
      expect(helperRule[1]).toMatch(/min-height:\s*var\(--target-min,\s*44px\)/);
      expect(helperRule[1]).toMatch(/var\(--surface-inset/);
      expect(helperRule[1]).toMatch(/var\(--ease-spring\)/);

      const activeHelper = styles.match(/\.helper-tag-btn:active\s*\{([\s\S]*?)\}/);
      expect(activeHelper).not.toBeNull();
      expect(activeHelper[1]).toMatch(/transform:\s*scale\(0\.96\)/);
    });

    test('campaign mode row uses semantic state classes in CSS and main.js', () => {
      expect(styles).toMatch(/\.campaign-mode-row\.is-mock\s*\{/);
      expect(styles).toMatch(/\.campaign-mode-row\.is-warn\s*\{/);
      expect(styles).toMatch(/\.campaign-mode-row\.is-live\s*\{/);

      expect(mainJs).toMatch(/row\.classList\.add\('is-mock'\)/);
      expect(mainJs).toMatch(/row\.classList\.add\('is-warn'\)/);
      expect(mainJs).toMatch(/row\.classList\.add\('is-live'\)/);
    });

    test('campaign drafts and sent lists render canonical sys-empty states with icons and CTAs', () => {
      expect(mainJs).toMatch(/<div class="empty-state sys-empty"[\s\S]*?📝[\s\S]*?No saved drafts[\s\S]*?openCampaignWizard\(\)/);
      expect(mainJs).toMatch(/<div class="empty-state sys-empty"[\s\S]*?📣[\s\S]*?No sent campaigns yet[\s\S]*?openCampaignWizard\(\)/);
    });
  });

  describe('Feature 16: Web Analytics KPI Cards & Tabular Delta Chips', () => {
    test('.analytics-kpi-card uses canonical surface tokens, elev-1, and spring physics', () => {
      const kpiCard = styles.match(/\.analytics-kpi-card\s*\{([\s\S]*?)\}/);
      expect(kpiCard).not.toBeNull();
      expect(kpiCard[1]).toMatch(/var\(--surface-raised/);
      expect(kpiCard[1]).toMatch(/var\(--border-default/);
      expect(kpiCard[1]).toMatch(/var\(--elev-1/);
      expect(kpiCard[1]).toMatch(/var\(--ease-spring\)/);

      const kpiCardHover = styles.match(/\.analytics-kpi-card:hover\s*\{([\s\S]*?)\}/);
      expect(kpiCardHover).not.toBeNull();
      expect(kpiCardHover[1]).toMatch(/var\(--elev-hover/);
    });

    test('.analytics-kpi-change percentage chips use DM Mono and tabular figures', () => {
      const kpiChange = styles.match(/\.analytics-kpi-change\s*\{([\s\S]*?)\}/);
      expect(kpiChange).not.toBeNull();
      expect(kpiChange[1]).toMatch(/font-family:\s*'DM Mono',\s*monospace/);
      expect(kpiChange[1]).toMatch(/font-feature-settings:\s*"tnum"\s*1/);
      expect(kpiChange[1]).toMatch(/border-radius:\s*999px/);
    });
  });

  describe('Feature 17: Web Analytics Connected Toolbar & Refresh Action Geometry', () => {
    test('connected toolbar actions and refresh button enforce >= 44px min-height and spring kinetics', () => {
      const toolbarRule = styles.match(/#webanalytics-connected-view \.btn,\s*#webanalytics-external-link,\s*#webanalytics-height-btn,\s*button\[onclick="refreshUmamiStats\(\)"\]\s*\{([\s\S]*?)\}/);
      expect(toolbarRule).not.toBeNull();
      expect(toolbarRule[1]).toMatch(/min-height:\s*var\(--target-min,\s*44px\)/);
      expect(toolbarRule[1]).toMatch(/var\(--ease-spring\)/);

      const activeToolbar = styles.match(/#webanalytics-connected-view \.btn:active,\s*#webanalytics-external-link:active,\s*#webanalytics-height-btn:active,\s*button\[onclick="refreshUmamiStats\(\)"\]:active\s*\{([\s\S]*?)\}/);
      expect(activeToolbar).not.toBeNull();
      expect(activeToolbar[1]).toMatch(/transform:\s*scale\(0\.97\)/);
    });

    test('connected card status uses canonical --status-positive token', () => {
      expect(markup).toMatch(/border-left:\s*3px solid var\(--status-positive\);/);
      expect(markup).toMatch(/<span style="font-size:18px; color:var\(--status-positive\);">●<\/span>/);
      expect(markup).toMatch(/<button class="btn sm" onclick="refreshUmamiStats\(\)" title="Refresh API metrics">/);
    });
  });
});
