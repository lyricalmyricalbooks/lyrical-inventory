import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const mainJs = readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
const styleCss = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');

describe('Milestone 1 — Feature 1: POS Quick Discount Grid', () => {
  it('renders .pos-discount-grid with 44px min-height, spring feedback, and monospace tabular percentages', () => {
    // HTML checks
    expect(html).toContain('class="pos-discount-grid"');
    expect(html).toContain('class="pos-discount-btn"');
    expect(html).toMatch(/<button type="button" class="pos-discount-btn"[^>]*><span class="mono-num">10%<\/span> off<\/button>/);
    expect(html).toMatch(/<button type="button" class="pos-discount-btn pos-discount-free"[^>]*>Free<\/button>/);

    // CSS checks
    expect(styleCss).toMatch(/\.pos-discount-btn\s*\{[^}]*min-height:\s*var\(--target-min\)/);
    expect(styleCss).toMatch(/\.pos-discount-btn\s*\{[^}]*var\(--ease-spring\)/);
    expect(styleCss).toMatch(/\.pos-discount-btn \.mono-num\s*\{[^}]*font-family:\s*'DM Mono'/);
    expect(styleCss).toMatch(/\.pos-discount-btn:active\s*\{[^}]*transform:\s*scale\(0\.97\)/);
  });
});

describe('Milestone 1 — Feature 2: POS Card Actions & Add-Tile Kinetic Hover', () => {
  it('enforces 44px touch targets on POS card buttons and spring lift on Add POS-only tile', () => {
    // main.js checks
    expect(mainJs).toContain('class="pos-card-actions"');
    expect(mainJs).toContain('class="btn sm pos-card-btn"');
    expect(mainJs).toContain('class="card pos-card pos-add-tile"');

    // SVG stroke check in index.html (no raw #8a5815)
    expect(html).not.toMatch(/stroke="#8a5815"/);
    expect(html).toContain('stroke="var(--gold-text)"');

    // CSS checks
    expect(styleCss).toMatch(/\.pos-card-btn\s*\{[^}]*min-height:\s*var\(--target-min\)/);
    expect(styleCss).toMatch(/\.pos-card-btn\s*\{[^}]*var\(--ease-spring\)/);
    expect(styleCss).toMatch(/\.pos-add-tile:hover\s*\{[^}]*transform:\s*translateY\(-2px\)/);
    expect(styleCss).toMatch(/\.pos-add-tile:active\s*\{[^}]*transform:\s*scale\(0\.98\)/);
  });
});

describe('Milestone 1 — Feature 3: POS Sale Confirmation Monospace & Receipt Surface', () => {
  it('modernizes POS sale confirmation modal total and metadata with DM Mono tabular figures and canonical surfaces', () => {
    // HTML checks
    expect(html).toContain('class="pos-confirm-meta-grid"');
    expect(html).toContain('class="pos-confirm-summary-well"');
    expect(html).toContain('id="pos-confirm-total" class="pos-confirm-total-val mono-num"');

    // CSS checks
    expect(styleCss).toMatch(/\.pos-confirm-summary-well\s*\{[^}]*background:\s*var\(--surface-sunken\)/);
    expect(styleCss).toMatch(/\.pos-confirm-total-val\s*\{[^}]*font-family:\s*'DM Mono'/);
    expect(styleCss).toMatch(/\.pos-confirm-total-val\s*\{[^}]*font-feature-settings:\s*"tnum" 1/);

    // main.js checks
    expect(mainJs).toMatch(/<td class="r mono-num">\$\{row\.qty\}<\/td><td class="r mono-num">\$\{lineDisplay\}<\/td>/);
  });
});

describe('Milestone 1 — Feature 4: Order History Row Actions Touch Targets & Tokens', () => {
  it('upgrades .btn-hist-action buttons to 44px touch targets with spring kinetics and semantic tokens', () => {
    expect(styleCss).toMatch(/\.btn-hist-action\s*\{[^}]*min-height:\s*var\(--target-min\)/);
    expect(styleCss).toMatch(/\.btn-hist-action\s*\{[^}]*var\(--ease-spring\)/);
    expect(styleCss).toMatch(/\.btn-hist-action:active\s*\{[^}]*transform:\s*scale\(0\.975\)/);
    expect(styleCss).toMatch(/\.btn-hist-action\.ship\s*\{[^}]*background:\s*var\(--gold-bg\)/);
    expect(styleCss).toMatch(/\.btn-hist-action\.shipped\s*\{[^}]*background:\s*var\(--status-positive-bg\)/);
    expect(styleCss).toMatch(/\.btn-hist-action\.manage\s*\{[^}]*background:\s*var\(--surface-sunken\)/);
  });
});

describe('Milestone 1 — Feature 5: Order History Inline Edit Button Touch Slop', () => {
  it('provides a 44px touch target bounding box via pseudo-element hit padding and ensures touch discoverability', () => {
    expect(styleCss).toMatch(/\.edit-btn::after\s*\{[^}]*inset:\s*-11px/);
    expect(styleCss).toMatch(/\.edit-btn::after\s*\{[^}]*min-width:\s*var\(--target-min\)/);
    expect(styleCss).toMatch(/\.edit-btn::after\s*\{[^}]*min-height:\s*var\(--target-min\)/);
    expect(styleCss).toMatch(/@media\s*\(hover:\s*none\),\s*\(pointer:\s*coarse\)\s*\{[\s\S]*?\.edit-btn\s*\{[^}]*opacity:\s*0\.85/);
  });
});

describe('Milestone 1 — Feature 6: Order History Reconciliation KPI Monospace & Restate Callout', () => {
  it('applies DM Mono / tnum tabular formatting and canonical surface tokens on currency warn callout', () => {
    expect(styleCss).toMatch(/\.hist-kpi-val\s*\{[^}]*font-family:\s*'DM Mono'/);
    expect(styleCss).toMatch(/\.hist-kpi-val\s*\{[^}]*font-feature-settings:\s*"tnum" 1/);
    expect(styleCss).toMatch(/\.hist-currency-warn\s*\{[^}]*background:\s*var\(--status-active-bg\)/);
    expect(styleCss).toMatch(/\.hist-currency-warn \.btn\s*\{[^}]*min-height:\s*var\(--target-min\)/);
    expect(mainJs).toContain('class="mono-num"');
  });
});

describe('Milestone 1 — Feature 7: Consignment Store Card Action Strip Touch Ergonomics', () => {
  it('expands store card action buttons to 44px min-height with spring micro-interactions', () => {
    expect(styleCss).toMatch(/\.store-actions \.btn\s*\{[^}]*min-height:\s*var\(--target-min\)/);
    expect(styleCss).toMatch(/\.store-actions \.btn\s*\{[^}]*var\(--ease-spring\)/);
    expect(styleCss).toMatch(/\.store-actions \.btn:active\s*\{[^}]*transform:\s*scale\(0\.97\)/);
  });
});

describe('Milestone 1 — Feature 8: Consignment Invoices Hierarchy & Semantic Badges', () => {
  it('replaces raw hex in Stripe badge with canonical tokens and formats share metadata with tabular figures', () => {
    // main.js checks
    expect(mainJs).toMatch(/stripeChip = isDynamicStripeLink\(inv\)\s*\?\s*`<span[^>]*background:var\(--surface-inverse\);color:var\(--gold-text\);/);
    expect(mainJs).toMatch(/<strong class="mono-num">\$\{fmt\(share\.total, invCur\)\}<\/strong>/);
  });
});

describe('Milestone 1 — Feature 9: Consignment Bulk Send Modal Inputs & Overstock Warning', () => {
  it('expands bulk send rows and quantity inputs to 44px touch targets and applies semantic status-critical token', () => {
    // main.js checks
    expect(mainJs).toContain('class="bulk-send-row"');
    expect(mainJs).toContain('class="bulk-send-qty"');
    expect(mainJs).not.toContain("totEl.style.color = total > stock ? '#c0392b' : ''");
    expect(mainJs).toContain("totEl.style.color = total > stock ? 'var(--status-critical)' : ''");

    // CSS checks
    expect(styleCss).toMatch(/\.bulk-send-row\s*\{[^}]*min-height:\s*var\(--target-min\)/);
    expect(styleCss).toMatch(/\.bulk-send-qty\s*\{[^}]*min-height:\s*var\(--target-min\)/);
    expect(styleCss).toMatch(/\.bulk-send-qty\s*\{[^}]*font-family:\s*'DM Mono'/);
    expect(styleCss).toMatch(/\.bulk-send-qty\s*\{[^}]*font-feature-settings:\s*"tnum" 1/);
  });
});
