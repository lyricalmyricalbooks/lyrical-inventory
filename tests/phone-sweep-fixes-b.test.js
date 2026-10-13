import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Phone round 4 sweep B: shipping header and search, Open Call settings headers,
// the Tax Centre batch button, the author view's top gap and bottom clearance,
// the import preview, the payment QR buttons and the payment-link hint.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(path.join(__dirname, '..', p), 'utf8');
const html = read('index.html');
const phone = read('src/styles/phone.css');
const opencallJs = read('src/features/opencall.js');
const shippingJs = read('src/features/shipping.js');

const SECTION = '/* ─── SWEEP FIXES B (round 4) ─── */';

describe('sweep B phone section', () => {
  it('is one commented section at the end of phone.css, inside a phone-width media query', () => {
    const at = phone.indexOf(SECTION);
    expect(at).toBeGreaterThan(-1);
    expect(phone.indexOf(SECTION, at + 1)).toBe(-1);
    const section = phone.slice(at);
    expect(section).toMatch(/^\/\* ─── SWEEP FIXES B \(round 4\) ─── \*\/\n[\s\S]*?@media \(max-width: 768px\) \{/);
    expect(section.trimEnd().endsWith('}')).toBe(true);
  });

  it('uses no raw colour values in the new section', () => {
    const section = phone.slice(phone.indexOf(SECTION));
    expect(section).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(section).not.toMatch(/\brgba?\(/);
  });

  it('keeps the shipping header stacked and the sync button at full label height', () => {
    expect(phone).toMatch(/#ship-analysis-hub \.shipping-pnl-header > div:last-child \{[^}]*align-items: stretch/);
    expect(phone).toMatch(/#ship-bc-sync-btn \{[^}]*height: auto !important/);
    expect(shippingJs).toContain('id="ship-bc-sync-btn"');
    expect(shippingJs).toContain('Sync Big Cartel Shipping');
  });

  it('lets the shipping order search take the row so its placeholder is not cut off', () => {
    expect(phone).toMatch(/#ship-analysis-hub \.pill-search-input \{ width: 100%/);
    expect(shippingJs).toContain('placeholder="Order #, name..."');
  });

  it('shortens the contributor search placeholder', () => {
    expect(opencallJs).toContain('placeholder="Search contributors"');
    expect(opencallJs).not.toContain('Search name, email, credit, photo, notes');
  });

  it('puts both Open Call settings headers on one row with the arrow on the right', () => {
    expect(phone).toMatch(/#tab-opencall \.oc-settings-card > \.oc-collapse-head \{ flex-direction: row !important/);
    expect(phone).toMatch(/#tab-opencall \.oc-settings-card \.oc-collapse-chevron \{ flex: 0 0 auto/);
  });

  it('gives the Tax Centre batch button the full width and a drawn outline', () => {
    expect(html).toMatch(/<button class="btn tx tc-batch-btn"[^>]*openBatchExpenseModal\('business'\)/);
    expect(phone).toMatch(/\.tc-batch-btn\.btn\.tx \{ width: 100%;[^}]*border-color: var\(--border-strong\)/);
  });

  it('shortens the Duties option label without touching its value', () => {
    // Round 4 (#40) shortened this further to 'Auto'; the helper text under the select explains DDP and DDU.
    expect(html).toContain('<option value="auto">Auto</option>');
    expect(html).not.toContain('Auto — DDP to the US, DDU elsewhere');
    expect(html).not.toContain('Auto (DDP US, DDU elsewhere)');
    expect(html).toContain('<select id="sp-incoterm" onchange="onShippoIncotermChange()">');
  });

  it('moves the author view bottom clearance onto the pages and drops the top band', () => {
    expect(phone).toMatch(/#pw-app:not\(\.pub-shell\) > #main-app\.app \{ padding-bottom: 0; \}/);
    expect(phone).toMatch(/#pw-app:not\(\.pub-shell\) > \.tab-panel \{ padding-bottom: calc\(88px/);
  });

  it('hides the empty import preview table until a file fills it', () => {
    expect(phone).toMatch(/\.tbl-wrap:has\(#import-preview-body:empty\) \{ display: none; \}/);
    expect(html).toContain('<tbody id="import-preview-body"></tbody>');
  });

  it('keeps disabled payment QR buttons readable on a quiet fill', () => {
    expect(phone).toMatch(/\.qr-card-actions \.btn:disabled \{ opacity: 1; background: var\(--surface-inset\); color: var\(--content-muted\)/);
  });

  it('left-aligns the payment-link hint under the amount', () => {
    expect(phone).toMatch(/#artist-reimburse-banner \.metric-banner-hint \{ text-align: left; \}/);
    expect(html).toContain('id="arb-hint"');
  });
});
