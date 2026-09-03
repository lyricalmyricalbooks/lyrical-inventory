import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const shipping = readFileSync(path.join(__dirname, '../src/features/shipping.js'), 'utf8');
const indexHtml = readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const styleCss = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');
const mainJs = readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');

/**
 * A U.S. parcel may not be bought without a Declaration ID entered by hand.
 *
 * This is a source-level guard rather than a behavioural test because the gate
 * lives inside a DOM-heavy purchase handler. What matters is that the bypasses
 * stay deleted: each one that existed before ended with a parcel crossing the
 * border with the duty unpaid, discovered weeks later when the customer was
 * billed at their door. A future edit that reintroduces one should fail here.
 */
describe('U.S. Declaration ID is mandatory before buying a label', () => {
  it('blocks the purchase when the Declaration ID is not a valid 13-character code', () => {
    expect(shipping).toMatch(
      /if \(stCountryCode === 'US' && !validateDeclarationId\(declarationId\)\)/
    );
  });

  it('normalizes the entered id before validating it', () => {
    // Guards against a pasted "0RD4-DPKRVC1Y9" being judged invalid, and against
    // a half-typed code being judged valid.
    expect(shipping).toMatch(/declarationId = formatDeclarationId\(declarationId\);/);
  });

  it('has no Verified Account bypass on the gate', () => {
    // The account-key route used to skip the requirement entirely.
    expect(shipping).not.toMatch(/dutyRoute\.route !== 'verified'/);
  });

  it('has no settings toggle that switches the requirement off', () => {
    expect(shipping).not.toContain('requireZonosUsPrepay');
    expect(shipping).not.toContain('strictPrepay');
  });

  it('offers no "carry on without prepaid duty" escape', () => {
    expect(shipping).not.toContain('Carry on without prepaid duty');
  });
});

describe('Nothing in the app offers to generate a Declaration ID', () => {
  it('has removed the auto-generate handler entirely', () => {
    expect(shipping).not.toContain('autoGenerateZonosDeclarationHandler');
    expect(mainJs).not.toContain('autoGenerateZonosDeclarationHandler');
    expect(indexHtml).not.toContain('autoGenerateZonosDeclarationHandler');
  });

  it('has removed its button and result hint from the panel', () => {
    expect(indexHtml).not.toContain('sp-auto-gen-zonos-btn');
    expect(indexHtml).not.toContain('zonos-auto-result-hint');
    expect(styleCss).not.toContain('.us-zonos-result-hint');
  });

  it('never claims an unverified code is "Ready"', () => {
    // Thirteen characters typed at random pass the format check exactly as well
    // as a real declaration, so the pill says what it actually knows.
    expect(shipping).toContain("'✓ Format OK'");
    expect(shipping).not.toContain('Declaration ID Ready');
  });
});

describe('The panel presents the buy-then-paste workflow in order', () => {
  it('renders the two steps as an ordered list', () => {
    expect(indexHtml).toMatch(/<ol class="us-zonos-steps">/);
    expect(indexHtml).toContain('Buy the declaration for this parcel');
    expect(indexHtml).toContain('Paste the Declaration ID here');
  });

  it('keeps the Prepay app as the only action button, styled as primary', () => {
    expect(indexHtml).toMatch(/class="btn sm gold us-zonos-action-btn" id="sp-open-zonos-prepay-btn"/);
  });

  it('warns against reusing a declaration across parcels', () => {
    expect(indexHtml).toContain('One declaration covers one parcel');
  });

  it('states that the id must be entered before the label is bought', () => {
    expect(indexHtml).toMatch(/before<\/strong> you buy the label/);
  });

  it('styles the steps with tokens and a settled state driven by :has()', () => {
    expect(styleCss).toMatch(/\.us-zonos-steps\s*\{/);
    expect(styleCss).toMatch(/\.us-zonos-step\s*\{[^}]*background:\s*var\(--surface-sunken\);/);
    // The settled highlight must key off the element that actually carries the
    // class — the counter, not the input.
    expect(styleCss).toContain('.us-zonos-duty-card:has(.us-zonos-char-counter.is-valid)');
    expect(shipping).toMatch(/counter\.classList\.toggle\('is-valid', isValid\)/);
  });

  it('collapses the steps on a narrow container rather than a viewport breakpoint', () => {
    expect(styleCss).toMatch(/@container\s+us-zonos\s*\([^)]*\)\s*\{[\s\S]*?\.us-zonos-step\s*\{/);
  });

  it('disables step motion under prefers-reduced-motion', () => {
    expect(styleCss).toMatch(/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)\s*\{[\s\S]*?\.us-zonos-step\s*\{[^}]*transition:\s*none;/);
  });
});

describe('Proof shown after a U.S. label is bought', () => {
  it('shows the declaration and tracking number together', () => {
    expect(shipping).toContain('U.S. duty is prepaid and attached to this parcel');
    expect(shipping).toContain('Tracking number');
  });

  it('does not overclaim when Canada Post did not return the id itself', () => {
    // Only the 'issued' branch may say Canada Post returned it.
    expect(shipping).toMatch(/result\.declarationSignal === 'issued' \? `[\s\S]*?Canada Post returned this Declaration ID/);
    expect(shipping).toMatch(/was sent with the label request and Canada Post accepted the/);
  });

  it('points at the one check that does not rely on this app', () => {
    expect(shipping).toContain('Prepay order history');
  });

  it('refuses to call a practice run counter-ready', () => {
    expect(shipping).toContain('Practice run — nothing was linked.');
    expect(shipping).toContain('Do not take this to the counter.');
  });
});
