import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Phone round 4: Shipping. The sender address folds to one line once it is
// filled in, the optional pricing preferences fold under "More options", and
// the screen's selects, outlines and colours follow the phone rules.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(path.join(__dirname, '..', p), 'utf8');
const html = read('index.html');
const phone = read('src/styles/phone.css');
const shipping = read('src/features/shipping.js');

const SECTION = '/* ─── SHIPPING (round 4) ─── */';

// The markup between an opening <details> with this class and its closing tag.
function foldBody(cls) {
  const open = html.indexOf(`<details class="${cls}"`);
  expect(open).toBeGreaterThan(-1);
  const close = html.indexOf('</details>', open);
  expect(close).toBeGreaterThan(open);
  return html.slice(open, close);
}

describe('shipping round 4 phone section', () => {
  it('is one commented section at the end of phone.css, with phone rules in a max-width media query', () => {
    const at = phone.indexOf(SECTION);
    expect(at).toBeGreaterThan(-1);
    expect(phone.indexOf(SECTION, at + 1)).toBe(-1);
    const section = phone.slice(at);
    expect(section).toMatch(/@media \(max-width: 768px\) \{/);
    expect(section.trimEnd().endsWith('}')).toBe(true);
  });

  it('uses no raw colour values in the new section', () => {
    const section = phone.slice(phone.indexOf(SECTION));
    expect(section).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(section).not.toMatch(/\brgba?\(/);
  });

  it('makes the batch button and verify chips solid, never dashed', () => {
    const section = phone.slice(phone.indexOf(SECTION));
    expect(section).toMatch(/#tab-shipping \.ship-flow-batch,\s*#tab-shipping #ship-analysis-hub \.ship-verify-mini \{ border-style: solid; \}/);
    expect(section).not.toMatch(/dashed/);
  });

  it('gives selects room for the arrow on the shipping screen', () => {
    const section = phone.slice(phone.indexOf(SECTION));
    expect(section).toMatch(/#tab-shipping select \{ padding-right: 40px;/);
  });

  it('keeps desktop showing the folded fields (summary rows hidden on wide screens)', () => {
    const section = phone.slice(phone.indexOf(SECTION));
    expect(section).toMatch(/@media \(min-width: 769px\) \{[\s\S]*?\.ship-sender-fold > summary,[\s\S]*?display: none;/);
    expect(section).toMatch(/\.ship-sender-fold::details-content[\s\S]*?content-visibility: visible; display: block;/);
  });
});

describe('shipping sender address fold markup', () => {
  it('wraps the nine sender fields in one closed-by-default details, behind a summary line', () => {
    const body = foldBody('ship-sender-fold');
    expect(body).toContain('id="ship-sender-fold-line"');
    for (const id of ['sf-name', 'sf-company', 'sf-phone', 'sf-street1', 'sf-street2', 'sf-city', 'sf-state', 'sf-zip', 'sf-country']) {
      expect(body, id).toContain(`id="${id}"`);
    }
  });

  it('keeps every sender field id unique, so existing reads of them are unchanged', () => {
    for (const id of ['sf-name', 'sf-company', 'sf-phone', 'sf-street1', 'sf-street2', 'sf-city', 'sf-state', 'sf-zip', 'sf-country']) {
      expect(html.split(`id="${id}"`).length - 1, id).toBe(1);
    }
  });

  it('keeps the Save default checkbox outside the fold, so it stays on screen', () => {
    const body = foldBody('ship-sender-fold');
    expect(body).not.toContain('id="ship-save-origin"');
    expect(html).toContain('id="ship-save-origin"');
  });

  it('opens the sender fold from code when a required sender field is empty', () => {
    expect(shipping).toMatch(/SHIP_SENDER_REQUIRED_IDS = \[[^\]]*'sf-name'[^\]]*'sf-street1'[^\]]*'sf-city'[^\]]*'sf-zip'[^\]]*\]/);
    expect(shipping).toMatch(/senderFold\.open = desktop \|\| shipSenderHasEmpty\(\)/);
    expect(shipping).toMatch(/function initShippingTab\(\) \{[\s\S]*?syncShipFolds\(\);/);
  });
});

describe('shipping pricing options fold', () => {
  it('folds the packaging buffer, safety margin and benchmark under More options', () => {
    const body = foldBody('ship-more-options');
    expect(body).toContain('More options');
    for (const id of ['sp-handling', 'sp-margin', 'sp-benchmark']) {
      expect(body, id).toContain(`id="${id}"`);
    }
  });

  it('leaves the customs, HS code and incoterm fields visible, outside any fold', () => {
    const body = foldBody('ship-more-options');
    for (const id of ['sp-customs-description', 'sp-customs-value', 'sp-customs-hs', 'sp-incoterm', 'sp-length', 'sp-weight', 'sp-zonos-declaration-id']) {
      expect(body, id).not.toContain(`id="${id}"`);
    }
    expect(html).toContain('id="sp-customs-hs"');
  });
});
