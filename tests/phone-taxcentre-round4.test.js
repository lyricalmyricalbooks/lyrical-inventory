import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Phone round 4, Tax Centre: the expense form comes first, empty sections fold to
// one line, AI Scan says why it is off, and the cash-flow chart prints its figures.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(path.join(__dirname, '..', p), 'utf8');
const html = read('index.html');
const phone = read('src/styles/phone.css');
const style = read('src/style.css');
const taxJs = read('src/features/taxcentre.js');

const SECTION = '/* ─── TAX CENTRE (round 4) ─── */';

describe('Tax Centre phone section (round 4)', () => {
  it('is one commented section at the end of phone.css, scoped to a phone width', () => {
    const at = phone.indexOf(SECTION);
    expect(at).toBeGreaterThan(-1);
    expect(phone.indexOf(SECTION, at + 1)).toBe(-1);
    const section = phone.slice(at);
    expect(section).toMatch(/^\/\* ─── TAX CENTRE \(round 4\) ─── \*\/\n@media \(max-width: 768px\) \{/);
    expect(section.trimEnd().endsWith('}')).toBe(true);
  });

  it('uses Riso tokens only: no raw hex or rgb in the new section', () => {
    const section = phone.slice(phone.indexOf(SECTION));
    expect(section).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(section).not.toMatch(/\brgba?\(/);
  });

  it('puts the expense form first on a phone and keeps the summary after it', () => {
    expect(phone).toMatch(/#tab-taxcenter #tc-sec-ledger \{ display: flex; flex-direction: column; \}/);
    expect(phone).toMatch(/#tc-expense-form-card \{ order: 0; \}/);
    expect(phone).toMatch(/> \.cf-card \{ order: 1; \}/);
  });

  it('folds the empty Pending, Recurring and Trips states to one line each', () => {
    expect(phone).toMatch(/#tc-pending-list \.tc-pending-empty \{ padding: 0; background: none; border: 0;/);
    expect(phone).toMatch(/#tc-recurring-empty \.tc-empty-phone \{ display: inline; \}/);
    expect(phone).toMatch(/#tab-taxcenter \.tc-trip-empty-state \{ display: flex;/);
    expect(taxJs).toMatch(/<span class="tc-empty-phone">No subscriptions yet\.<\/span>/);
    expect(taxJs).toMatch(/<span class="tc-empty-desk">No recurring costs tracked yet\./);
  });

  it('shows why AI Scan is greyed out as visible text, and keeps its disabled logic', () => {
    expect(html).toMatch(/<div class="tc-field-hint" id="tc-ai-scan-hint">AI Scan turns on once you add a receipt above\.<\/div>/);
    expect(html).toContain('id="tc-ai-scan-btn" disabled');
    expect(taxJs).toContain('aiBtn.disabled = !hasFile;');
    expect(taxJs).toMatch(/const aiHint = \$\('tc-ai-scan-hint'\);\s*if \(aiHint\) aiHint\.style\.display = hasFile \? 'none' : '';/);
  });

  it('labels the amount and its currency so neither is an unlabelled row', () => {
    expect(html).toContain('<label for="tc-exp-amount">Amount</label>');
    expect(html).toContain('<select id="tc-exp-cur" aria-label="Amount currency"');
    expect(phone).toMatch(/#tab-taxcenter \.amount-field \.price-wrap \{ display: flex;/);
  });
});

describe('Income vs Expenses chart (round 4)', () => {
  it('uses flat status-token fills, not gradients', () => {
    expect(taxJs).not.toContain('linearGradient');
    expect(taxJs).not.toContain('url(#income-grad)');
    expect(taxJs).not.toContain('preserveAspectRatio');
    expect(style).toMatch(/\.cf-chart-bar\.is-income\{background:var\(--green\);\}/);
    expect(style).toMatch(/\.cf-chart-bar\.is-expense\{background:var\(--red\);\}/);
    expect(style).toMatch(/\.cf-legend-dot\.is-income\{background:var\(--green\);\}/);
    expect(style).not.toMatch(/\.cf-chart-bar:hover[^}]*drop-shadow/);
  });

  it('prints each income and expense figure beside its bar, from the same value as the bar title', () => {
    expect(taxJs).toMatch(/<span class="cf-chart-val">\$\{text\}<\/span>/);
    expect(taxJs).toMatch(/const text = escapeHtml\(fmt\(value, baseCurrency\)\);/);
    expect(taxJs).toMatch(/title="\$\{label\} \$\{word\}: \$\{text\}"/);
  });

  it('keeps the bar click and keyboard handlers on each bar', () => {
    expect(taxJs).toContain("onclick=\"tcSelectCashFlowBucket('${key}')\"");
    expect(taxJs).toContain("onkeydown=\"if(event.key==='Enter'||event.key===' '){event.preventDefault();tcSelectCashFlowBucket('${key}')}\"");
  });

  it('prints the figures only on a phone, and lays bars out left to right there', () => {
    expect(style).toMatch(/\.cf-chart-val\{display:none;\}/);
    expect(phone).toMatch(/#tab-taxcenter \.cf-chart-val \{ display: block;/);
    expect(phone).toMatch(/#tab-taxcenter \.cf-chart-bar \{ flex: none; align-self: flex-start; width: var\(--cf-v\);/);
  });
});
