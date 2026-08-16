import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('POS Subtabs & Fair Print Kit Workspace Integration', () => {
  const htmlPath = path.join(process.cwd(), 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const jsPath = path.join(process.cwd(), 'src/main.js');
  const js = fs.readFileSync(jsPath, 'utf8');

  it('declares POS subtab navigation elements and subpanels in index.html', () => {
    expect(html).toContain('id="btn-pos-subtab-register"');
    expect(html).toContain('id="btn-pos-subtab-fairkit"');
    expect(html).toContain('id="pos-subpanel-register"');
    expect(html).toContain('id="pos-subpanel-fairkit"');
    expect(html).toContain('id="m-fair-kit"');
    expect(html).toContain('id="fk-books-list"');
    expect(html).toContain('id="fk-search-input"');
    expect(html).toContain('onclick="switchPOSSubTab(\'register\')"');
    expect(html).toContain('onclick="switchPOSSubTab(\'fairkit\')"');
  });

  it('declares switchPOSSubTab and fairKitSearchFilter in main.js', () => {
    expect(js).toContain('export function switchPOSSubTab');
    expect(js).toContain('export function fairKitSearchFilter');
    expect(js).toContain('window.fairKitSearchFilter = fairKitSearchFilter');
    expect(js).toContain('switchPOSSubTab(activePOSSubTab)');
  });

  it('exposes switchPOSSubTab and fairKitSearchFilter in exposeLegacyInlineHandlers', () => {
    const blockMatch = js.match(/function exposeLegacyInlineHandlers\(\)\s*\{([\s\S]+?)\n\}/);
    expect(blockMatch).not.toBeNull();
    expect(blockMatch[1]).toContain('switchPOSSubTab');
    expect(blockMatch[1]).toContain('fairKitSearchFilter');
  });

  it('correctly toggles subpanels and ARIA attributes in switchPOSSubTab', () => {
    // Setup minimal DOM harness
    document.body.innerHTML = `
      <div class="pos-subtab-nav" role="tablist">
        <button type="button" class="pos-subtab-btn active" id="btn-pos-subtab-register" role="tab" aria-selected="true" aria-controls="pos-subpanel-register"></button>
        <button type="button" class="pos-subtab-btn" id="btn-pos-subtab-fairkit" role="tab" aria-selected="false" aria-controls="pos-subpanel-fairkit"></button>
      </div>
      <div class="pos-subpanel" id="pos-subpanel-register" role="tabpanel"></div>
      <div class="pos-subpanel" id="pos-subpanel-fairkit" role="tabpanel" style="display:none;">
        <div class="fk-workspace" id="m-fair-kit"></div>
      </div>
    `;

    function testSwitchPOSSubTab(subTabName) {
      const activePOSSubTab = subTabName || 'register';
      const subTabs = ['register', 'fairkit'];
      subTabs.forEach((tab) => {
        const btn = document.getElementById('btn-pos-subtab-' + tab);
        const sec = document.getElementById('pos-subpanel-' + tab);
        if (btn && sec) {
          if (tab === activePOSSubTab) {
            btn.classList.add('active');
            btn.setAttribute('aria-selected', 'true');
            btn.setAttribute('tabindex', '0');
            sec.style.display = 'block';
          } else {
            btn.classList.remove('active');
            btn.setAttribute('aria-selected', 'false');
            btn.setAttribute('tabindex', '-1');
            sec.style.display = 'none';
          }
        }
      });
    }

    // Switch to fairkit
    testSwitchPOSSubTab('fairkit');
    const btnFairKit = document.getElementById('btn-pos-subtab-fairkit');
    const secFairKit = document.getElementById('pos-subpanel-fairkit');
    const btnReg = document.getElementById('btn-pos-subtab-register');
    const secReg = document.getElementById('pos-subpanel-register');

    expect(btnFairKit.classList.contains('active')).toBe(true);
    expect(btnFairKit.getAttribute('aria-selected')).toBe('true');
    expect(secFairKit.style.display).toBe('block');

    expect(btnReg.classList.contains('active')).toBe(false);
    expect(btnReg.getAttribute('aria-selected')).toBe('false');
    expect(secReg.style.display).toBe('none');

    // Switch back to register
    testSwitchPOSSubTab('register');
    expect(btnReg.classList.contains('active')).toBe(true);
    expect(btnReg.getAttribute('aria-selected')).toBe('true');
    expect(secReg.style.display).toBe('block');
    expect(secFairKit.style.display).toBe('none');
  });

  it('filters books in fair kit list when searching', () => {
    document.body.innerHTML = `
      <div id="fk-books-list">
        <div class="fk-book" id="card-1">
          <label class="fk-book-title">Quiet Songs</label>
          <span class="fk-book-meta">Jane Doe</span>
        </div>
        <div class="fk-book" id="card-2">
          <label class="fk-book-title">Lyrical Essays</label>
          <span class="fk-book-meta">John Smith</span>
        </div>
      </div>
    `;

    function testSearch(query) {
      const q = (query || '').toLowerCase().trim();
      document.querySelectorAll('#fk-books-list .fk-book').forEach((card) => {
        const title = card.querySelector('.fk-book-title')?.textContent?.toLowerCase() || '';
        const meta = card.querySelector('.fk-book-meta')?.textContent?.toLowerCase() || '';
        const match = !q || title.includes(q) || meta.includes(q);
        card.style.display = match ? '' : 'none';
      });
    }

    testSearch('quiet');
    expect(document.getElementById('card-1').style.display).toBe('');
    expect(document.getElementById('card-2').style.display).toBe('none');

    testSearch('Smith');
    expect(document.getElementById('card-1').style.display).toBe('none');
    expect(document.getElementById('card-2').style.display).toBe('');

    testSearch('');
    expect(document.getElementById('card-1').style.display).toBe('');
    expect(document.getElementById('card-2').style.display).toBe('');
  });
});
