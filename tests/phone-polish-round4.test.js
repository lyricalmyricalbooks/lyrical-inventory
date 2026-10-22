import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Phone polish sweep (round 4): one assertion group per backlog item in
// docs/phone-redesign-round-3.md. Phone rules live in the POLISH SWEEP section
// at the end of phone.css, inside the 768px media query.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(path.join(__dirname, '..', p), 'utf8');
const html = read('index.html');
const css = read('src/style.css');
const phone = read('src/styles/phone.css');
const main = read('src/main.js');
const opencall = read('src/features/opencall.js');
const websiteLink = read('src/features/website-link.js');

const SECTION = '/* ─── POLISH SWEEP (round 4) ─── */';
const phoneSection = phone.slice(phone.indexOf(SECTION));

describe('Phone polish sweep (round 4)', () => {
  it('keeps every phone rule for this sweep inside one 768px section at the end of phone.css', () => {
    expect(phone.split(SECTION).length).toBe(2);
    expect(phoneSection).toMatch(/@media \(max-width: 768px\) \{/);
    expect(phoneSection.trimEnd().endsWith('}')).toBe(true);
  });

  describe('#19 consignment store quick-select', () => {
    it('caps the quick-select row and says how many stores are left out', () => {
      expect(main).toMatch(/const STORE_QUICK_CHIP_LIMIT = 6;/);
      expect(main).toMatch(/allStores\.slice\(0, STORE_QUICK_CHIP_LIMIT\)/);
      expect(main).toMatch(/class="add-store-more" role="note">\+ \$\{hiddenCount\} more/);
    });

    it('shows In book as a grey status chip under the store name', () => {
      expect(main).toMatch(/<span class="chip-status gray sm">In book<\/span>/);
      expect(main).not.toMatch(/class="chip-badge">In book/);
    });

    it('lays each store out as a full-width row on phone with one-line names', () => {
      expect(phoneSection).toMatch(/\.add-store-preset-box \.add-store-chips-list \{ flex-direction: column;[^}]*max-height: none;/);
      expect(phoneSection).toMatch(/\.store-quick-chip \{ width: 100%;/);
      expect(phoneSection).toMatch(/\.chip-name \{[^}]*white-space: nowrap;/);
    });

    it('keeps the stored store values and the dropdown unchanged', () => {
      expect(main).toMatch(/<option value="\$\{escapeHtml\(st\.name\)\}">/);
      expect(main).toMatch(/— Choose a store to auto-fill —/);
    });
  });

  describe('#23 add-book accent swatches', () => {
    it('keeps one swatch per colour: no second red and no second purple', () => {
      const block = html.slice(html.indexOf('id="nb-accent-swatches"'), html.indexOf('id="nb-accent"'));
      const hexes = [...block.matchAll(/data-accent="(#[0-9a-fA-F]{6})"/g)].map((m) => m[1].toLowerCase());
      expect(hexes).toEqual(['#e8402a', '#10b981', '#6366f1', '#f59e0b', '#0ea5e9', '#64748b']);
      expect(block).not.toMatch(/#f43f5e|#8b5cf6/i);
    });

    it('gives every swatch a visible name and shows the chosen one under the row', () => {
      expect(html).toMatch(/id="nb-accent-name" aria-live="polite">Lyrical Gold</);
      expect(main).toMatch(/nameEl\.textContent = matchedName \|\| 'Custom colour'/);
      expect(main).toMatch(/\(btn\.dataset\.accent \|\| ''\)\.toLowerCase\(\) === wanted/);
    });

    it('keeps the stored hex values valid for existing books', () => {
      expect(main).toMatch(/accent: \$\('nb-accent'\)\.value,/);
      expect(main).toMatch(/\$\('nb-accent'\)\.value = book\.accent \|\| '#E8402A';/);
    });
  });

  describe('#30 Big Cartel setup form', () => {
    it('uses a plain text placeholder instead of dots in the token box', () => {
      expect(html).toMatch(/id="bc-password" placeholder="Paste your token here"/);
      expect(html).not.toMatch(/id="bc-password" placeholder="••/);
    });

    it('explains where each value comes from under its field', () => {
      expect(html.match(/class="bc-field-hint"/g).length).toBe(3);
    });

    it('stacks the two buttons full width on phone', () => {
      expect(phoneSection).toMatch(/#tab-bigcartel \.phone-connection-actions \{ flex-direction: column; \}/);
      expect(phoneSection).toMatch(/#tab-bigcartel \.phone-connection-actions \.btn \{ width: 100%;/);
    });
  });

  describe('#31 Website status figures', () => {
    it('reserves three lines for each figure label so the values line up', () => {
      expect(phoneSection).toMatch(/#tab-website \.wl-fact dt \{ min-height: 2lh; letter-spacing: \.06em; \}/);
    });

    it('shortens the longest label', () => {
      expect(websiteLink).toMatch(/fact\('Website orders', /);
      expect(websiteLink).not.toMatch(/Website orders in your books/);
    });
  });

  describe('#32 Website Scan Gmail and Apply all', () => {
    it('leaves one Scan Gmail button on the screen', () => {
      const at = main.indexOf('No orders found for this book');
      expect(main.slice(at, at + 400)).not.toMatch(/fetchOrders\(\)/);
      expect(html).not.toMatch(/Ready to scan for new orders[\s\S]{0,400}fetchOrders\(\)/);
    });

    it('explains why Apply all is greyed out, under the button', () => {
      expect(html).toMatch(/<p class="apply-all-hint" id="apply-all-hint">Scan Gmail first to find new orders\.<\/p>/);
      expect(main).toMatch(/function setApplyAllHint\(text\)/);
      expect(main).toMatch(/setApplyAllHint\(canApply \? '' : /);
    });
  });

  describe('#33 Web Analytics setup', () => {
    it('uses a shorter intro and a flat icon instead of the emoji', () => {
      expect(html).toMatch(/class="wa-setup-intro">Connect a shared analytics dashboard/);
      const at = html.indexOf('id="webanalytics-setup-view"');
      expect(html.slice(at, at + 900)).not.toMatch(/📈/);
    });

    it('tightens the card padding on phone and uses a palette surface for the link panel', () => {
      expect(phoneSection).toMatch(/#tab-webanalytics \.wa-setup-card \{ margin: var\(--space-3\) auto; padding: var\(--space-4\); \}/);
      expect(css).toMatch(/\.wa-setup-panel \{ background: var\(--surface-sunken\);/);
      expect(html).not.toMatch(/rgba\(232, 64, 42,\.04\)/);
    });
  });

  describe('#34 Open Call duplicate actions', () => {
    it('shows Add and Import once, in the empty box while the list is empty', () => {
      expect(opencall).toMatch(/\$\{total \|\| ocAddOpen \? `<button type="button" class="btn gold" onclick="ocToggleAddPanel\(\)"/);
      expect(opencall).toMatch(/\$\{total \? `<button type="button" class="btn" id="oc-import-gmail-btn"/);
    });

    it('replaces the faded Check replies button with a plain line while there are no contributors', () => {
      expect(opencall).toMatch(/Add a contributor to check for replies\./);
      expect(opencall).toMatch(/\? `<button type="button" class="btn" id="oc-scan-btn"/);
    });
  });

  describe('#35 Help questions', () => {
    it('draws each question as a hairline list row without a shadow on phone', () => {
      expect(phoneSection).toMatch(/#tab-help \.help-q \{ border: var\(--stroke-hair\) solid var\(--border-default\); box-shadow: none; \}/);
    });
  });

  describe('#36 Backups wording and actions', () => {
    it('drops Firestore and Publisher mode from what the owner reads', () => {
      const at = html.indexOf('id="tab-backups"');
      expect(html.slice(at, at + 12000)).not.toMatch(/Firestore|Publisher mode/);
    });

    it('explains each backup button in one line and moves restore detail behind a disclosure', () => {
      expect(html).toMatch(/Copies are made by the app each day\. Use this to make one right away\./);
      expect(html).toMatch(/Saves one file to this computer\. Keep it somewhere safe\./);
      expect(html).toMatch(/<details class="bk-howto">\s*<summary>How restoring works<\/summary>/);
    });

    it('sets the system backup heading in the content colour, not the error red', () => {
      expect(html).toMatch(/color:var\(--content-primary\);margin-bottom:4px;">Automatic online copy \(daily\)/);
    });
  });

  describe('#37 Book Catalog and Sandbox', () => {
    it('left-aligns each catalogue card on phone', () => {
      expect(phoneSection).toMatch(/#tab-sheets \.catalog-card \{ flex-direction: column;[^}]*text-align: left;/);
    });

    it('gives the Sandbox empty state a next-step button and a neutral tag', () => {
      expect(main).toMatch(/onclick="openAddBookModal\(\)">\+ Add a test book<\/button>/);
      expect(html).toMatch(/<span class="chip-status gray sm">ISOLATED TEST SANDBOX<\/span>/);
      expect(html).not.toMatch(/background:rgba\(109,40,217,0\.1\)/);
    });
  });

  describe('#39 Transfer stock preview', () => {
    it('hides the preview box while it is empty', () => {
      expect(css).toMatch(/\.st-preview-box:empty \{ display: none; \}/);
    });

    it('shortens the on-hand label', () => {
      expect(html).toMatch(/<div class="st-balance-label">On hand<\/div>/);
    });
  });

  describe('#40 Shipping preset and Duties label', () => {
    it('puts Save to Preset on its own line under the preset dropdown', () => {
      const i = html.indexOf('id="ship-preset-book"');
      const save = html.indexOf('id="ship-save-preset-quick-btn"');
      expect(save).toBeGreaterThan(i);
      expect(html.slice(i, save)).toMatch(/<\/select>\s*<div class="ship-preset-save-row">/);
      expect(css).toMatch(/\.ship-preset-save-row \{ display: flex;/);
    });

    it('shortens the Duties auto option to Auto', () => {
      expect(html).toMatch(/<option value="auto">Auto<\/option>/);
    });
  });

  describe('#41 Shipping batch button', () => {
    it('gives the batch button a solid ink outline', () => {
      expect(css).not.toMatch(/\.ship-flow-batch \{[^}]*dashed/);
      expect(phone).toMatch(/#tab-shipping \.ship-flow-batch,/);
    });
  });
});
