// One Settings screen: every part of the set-up listed with where it stands,
// and the shipping and AI keys typed once, here, instead of in the Tax Centre
// and again on the Shipping screen.
//
// Runs the real app (tests/helpers/load-app.js) and presses what the owner presses.
import { describe, it, expect, beforeAll } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';

let app;
const $ = (id) => document.getElementById(id);
const shown = (id) => $(id) && $(id).style.display !== 'none';

beforeAll(async () => {
  app = await loadApp({ books: [makeBook({ id: 'bk' })] });
}, 30000);

describe('the tools menu', () => {
  it('lists every tool once, in six groups', () => {
    const labels = [...document.querySelectorAll('#pub-sidebar > .o3-grouplabel')].map((el) => el.textContent.trim());
    expect(labels).toEqual(['Sell', 'Books', 'Orders and shipping', 'Money', 'People', 'Settings and help']);
    const tabs = [...document.querySelectorAll('#pub-sidebar .snav')]
      .map((b) => /switchTab\('([a-z]+)'\)/.exec(b.getAttribute('onclick') || '')?.[1]).filter(Boolean);
    expect(new Set(tabs).size).toBe(tabs.length);
    for (const tab of ['pos', 'manual', 'qrcodes', 'dashboard', 'history', 'consignment', 'todo', 'website', 'bigcartel',
      'shipping', 'reconcile', 'expenses', 'taxcenter', 'customers', 'opencall', 'webanalytics', 'intel', 'sheets', 'backups', 'help']) {
      expect(tabs).toContain(tab);
    }
  });

  it('copies the same groups into the phone sheet', () => {
    app.window.openMoreSheet();
    const labels = [...document.querySelectorAll('#more-sheet-body .o3-grouplabel')].map((el) => el.textContent.trim());
    expect(labels).toEqual(['Sell', 'Books', 'Orders and shipping', 'Money', 'People', 'Settings and help']);
    app.window.closeMoreSheet();
  });
});

describe('Settings', () => {
  it('opens on the list of every part, each with its status', () => {
    app.window.switchTab('sheets');
    expect(shown('settings-sec-home')).toBe(true);
    const rows = [...document.querySelectorAll('#settings-home-list .settings-home-row')];
    const titles = rows.map((r) => r.querySelector('.settings-home-title').textContent);
    expect(titles).toEqual(expect.arrayContaining(['Books and profit', 'Shipping', 'AI and receipts', 'Google Sheet', 'Big Cartel', 'Backups']));
    const ship = rows.find((r) => r.textContent.includes('Shippo'));
    expect(ship.querySelector('.tc-service-status').textContent).toMatch(/of 4 set/);
  });

  it('opens the shipping keys from their row', () => {
    app.window.switchTab('sheets');
    const ship = [...document.querySelectorAll('#settings-home-list .settings-home-row')].find((r) => r.dataset.part === 'shipping');
    ship.click();
    expect(shown('settings-sec-shipping')).toBe(true);
    expect(shown('settings-sec-home')).toBe(false);
    expect($('settings-sec-shipping').contains($('tc-shippo-key'))).toBe(true);
    expect($('settings-sec-shipping').contains($('tc-cp-live-key'))).toBe(true);
  });

  it('saves a Shippo key typed here, so the Shipping screen sees it', async () => {
    app.window.switchTab('sheets');
    app.window.switchSettingsSubTab('shipping');
    $('tc-shippo-key').value = 'shippo_live_abc12345';
    await app.window.saveTaxCenterSettings();
    await app.settle();
    expect(app.cloud.settings.taxCenter.settings.shippoKey).toBe('shippo_live_abc12345');
    app.window.switchTab('shipping');
    expect($('ship-key-status-text').textContent).toMatch(/Configured/);
    // No second box to type it into on the Shipping screen any more.
    expect($('ship-api-key-input')).toBeNull();
  });

  it('keeps a saved Shippo key when another part is saved before its box was filled', async () => {
    app.cloud.settings.taxCenter.settings.shippoKey = 'shippo_live_keepme99';
    await app.window.loadTaxCenter?.();
    const box = $('tc-shippo-key');
    box.value = '';
    delete box.dataset.hydrated;
    await app.window.saveTaxCenterSettings();
    await app.settle();
    expect(app.cloud.settings.taxCenter.settings.shippoKey).toBe('shippo_live_keepme99');
  });

  it('is where the Shipping screen sends the owner to change the key', () => {
    app.window.switchTab('shipping');
    app.window.editShippoApiKey();
    expect($('tab-sheets').classList.contains('active')).toBe(true);
    expect(shown('settings-sec-shipping')).toBe(true);
  });
});
