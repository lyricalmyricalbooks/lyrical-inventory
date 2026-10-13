// Phone round 4: the QR codes, Customers and Intelligence screens.
//   • QR codes: a book with no payment link gets one "Set payment link" action
//     (it opens the book editor) instead of an empty box and dead buttons.
//   • Customers: on phone the filter panel and the export buttons fold behind
//     toggles, closed by default; the filters keep working while closed.
//   • Intelligence: once the privacy note is acknowledged it collapses to one
//     line with a Details toggle.
// All phone rules sit in one @media (max-width: 768px) block at the end of
// src/styles/phone.css, under the round 4 heading.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(path.join(here, '..', rel), 'utf8');
const mainJs = read('src/main.js');
const customersJs = read('src/features/customers.js');
const intelJs = read('src/features/intel.js');
const indexHtml = read('index.html');
const styleCss = read('src/style.css');
const phoneCss = read('src/styles/phone.css');

const HEADING = '/* ─── QR + CUSTOMERS + INTEL (round 4) ─── */';

function round4Section() {
  const start = phoneCss.indexOf(HEADING);
  expect(start, 'round 4 heading present in phone.css').toBeGreaterThan(-1);
  expect(phoneCss.indexOf(HEADING, start + 1), 'heading appears once').toBe(-1);
  // The section is the last thing in phone.css, so it runs to the end of file.
  return phoneCss.slice(start);
}

describe('QR codes: a book without a payment link', () => {
  const render = mainJs.match(/function renderAllQRCodes\(\)[\s\S]*?\n\}\n/)[0];

  it('offers one "Set payment link" action that opens the book editor', () => {
    expect(render).toMatch(/addEventListener\('click', \(\) => window\.openEditBookModal\(book\.id\)\)/);
    expect(render).toMatch(/>Set payment link<\/button>/);
    expect(render).toMatch(/qr-card-empty-note/);
    expect(render).not.toMatch(/No Stripe link set/);
  });

  it('renders no QR plate and no disabled action buttons when there is no link', () => {
    const noLink = render.indexOf('if (!url) {');
    const plate = render.indexOf("qrWrap.className = 'qr-frame'");
    expect(noLink).toBeGreaterThan(-1);
    expect(plate).toBeGreaterThan(noLink);
    expect(render).not.toMatch(/\$\{url \? '' : 'disabled'\}/);
  });

  it('shows a phone-only status pill on each card', () => {
    expect(render).toMatch(/qr-card-status pill \$\{url \? 'green' : 'amber'\}/);
    expect(styleCss).toMatch(/\.qr-card-status \{ display: none; \}/);
    expect(round4Section()).toMatch(/#tab-qrcodes \.qr-card-status \{ display: inline-flex;/);
  });
});

describe('Customers: filters and exports fold on phone', () => {
  it('wraps the filter panel and the export buttons in folds with toggles', () => {
    expect(indexHtml).toMatch(/class="cust-fold cust-filter-fold"[\s\S]*id="cust-filter-toggle"[\s\S]*aria-expanded="false"[\s\S]*class="cust-filter-grid"/);
    expect(indexHtml).toMatch(/class="cust-fold cust-export-fold"[\s\S]*aria-controls="cust-export-body"[\s\S]*onclick="copyCustomerEmails\(\)"/);
    // Existing ids and handlers survive the move.
    for (const keep of ['id="cust-search"', 'oninput="filterCustomers(this.value)"', 'id="cust-body"', 'onclick="exportCustomersCSV()"', 'onclick="emailCustomerSegment()"']) {
      expect(indexHtml).toContain(keep);
    }
  });

  it('labels the filter toggle with the number of active filters', () => {
    expect(customersJs).toMatch(/function _renderCustFilterToggle\(activeCount\)/);
    expect(customersJs).toMatch(/`Filter · \$\{n\} active`/);
    expect(customersJs).toMatch(/_renderCustFilterToggle\(activeFilters\.length\);/);
  });

  it('toggles a fold through a class, keeping its contents in the DOM', () => {
    expect(customersJs).toMatch(/function toggleCustFold\(btn\)/);
    expect(customersJs).toMatch(/fold\.classList\.toggle\('is-open', open\)/);
    expect(customersJs).toMatch(/btn\.setAttribute\('aria-expanded', String\(open\)\)/);
  });

  it('folds on phone only, with both folds closed by default', () => {
    expect(round4Section()).toMatch(/#tab-customers \.cust-fold:not\(\.is-open\) > \.cust-fold-body \{\s*display: none;/);
    expect(styleCss).toMatch(/\.cust-fold-toggle \{ display: none; \}/);
  });
});

describe('Intelligence: the acknowledged privacy note becomes one line', () => {
  it('adds a one-line summary with a Details toggle beside the full card', () => {
    expect(indexHtml).toMatch(/id="intel-privacy-line"[^>]*hidden/);
    expect(indexHtml).toMatch(/Privacy: your figures go to Gemini only when you ask/);
    expect(indexHtml).toMatch(/id="intel-privacy-toggle"[^>]*onclick="toggleIntelPrivacyDetails\(\)"/);
    expect(indexHtml).toContain('id="intel-disclosure"');
  });

  it('shows the line only after acknowledgement and keeps the card hidden until Details is opened', () => {
    expect(intelJs).toMatch(/const accepted = disclosureAccepted\(\);/);
    expect(intelJs).toMatch(/gate\.hidden = accepted && !intelPrivacyDetailsOpen;/);
    expect(intelJs).toMatch(/privacyLine\.hidden = !accepted;/);
    expect(intelJs).toMatch(/function toggleIntelPrivacyDetails\(\)/);
    expect(intelJs).toMatch(/intelPrivacyDetailsOpen = false;\s*\n\s*const gate/);
  });

  it('keeps the line off desktop and shows it only in the phone section', () => {
    expect(styleCss).toMatch(/\.intel-privacy-line \{ display: none; \}/);
    expect(round4Section()).toMatch(/#tab-intel \.intel-privacy-line \{\s*display: flex;/);
    expect(round4Section()).toMatch(/#tab-intel \.intel-privacy-line\[hidden\] \{ display: none; \}/);
  });
});

describe('Round 4 phone section', () => {
  it('sits at the end of phone.css inside one max-width: 768px block', () => {
    const section = round4Section();
    expect(section).toMatch(/@media \(max-width: 768px\) \{/);
    expect(section.trimEnd().endsWith('}')).toBe(true);
  });

  it('uses Riso tokens only, with no raw hex or rgb colours', () => {
    const section = round4Section();
    expect(section).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(section).not.toMatch(/\brgba?\(/);
  });

  it('does not add a min-height to the shared .btn', () => {
    expect(round4Section()).not.toMatch(/\.btn\s*\{[^}]*min-height/);
  });
});

describe('Customers filter keeps working with the fold closed (jsdom)', () => {
  let app;
  beforeAll(async () => {
    app = await loadApp({ books: [makeBook({ id: 'bk', listPrice: 40 })] });
  }, 30000);
  beforeEach(() => app.resetBook('bk', { hist: [], revenue: 0 }));

  it('closes the filter fold by default and counts active filters on its toggle', () => {
    const fold = document.querySelector('.cust-filter-fold');
    const toggle = document.getElementById('cust-filter-toggle');
    expect(fold).not.toBeNull();
    expect(fold.classList.contains('is-open')).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    window.setCustomerChannelFilter('Website');
    expect(toggle.textContent).toBe('Filter · 1 active');
    expect(fold.classList.contains('is-open')).toBe(false);

    window.setCustomerChannelFilter('');
    expect(toggle.textContent).toBe('Filter');
  });

  it('opens the fold on a toggle press and restores aria-expanded', () => {
    const fold = document.querySelector('.cust-filter-fold');
    const toggle = document.getElementById('cust-filter-toggle');
    window.toggleCustFold(toggle);
    expect(fold.classList.contains('is-open')).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    window.toggleCustFold(toggle);
    expect(fold.classList.contains('is-open')).toBe(false);
  });
});
