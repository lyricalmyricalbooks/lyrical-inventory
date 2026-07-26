import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appSource } from './helpers/extract-decl.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

// renderAll() used to rebuild all eight per-book panels on every state change,
// so recording a sale walked the whole history and the whole consignment ledger
// to repaint panels nobody was looking at. It now renders only the visible tab.
//
// That is only correct while two things hold: each renderer writes solely into
// the panel it is listed under, and switchTab() renders a tab on arrival. Both
// are asserted here, because breaking either one produces a stale screen rather
// than an error — the worst kind of regression to find by hand.

/** Source text of a top-level function, from main.js or any feature module. */
function bodyOf(name) {
  const m = appSource.match(
    new RegExp(`^(?:export\\s+)?(?:async\\s+)?function ${name}\\s*\\(`, 'm'));
  if (!m) throw new Error(`no top-level function ${name}`);
  const end = appSource.indexOf('\n}', m.index);
  return appSource.slice(m.index, end + 2);
}

/** Element ids a function reaches for via the $() helper. */
function targetIds(name) {
  return [...bodyOf(name).matchAll(/\$\('([a-zA-Z0-9_-]+)'\)/g)].map(m => m[1]);
}

/** Which `id="tab-…"` panel encloses an element id, by position in index.html. */
const panelStarts = [...html.matchAll(/id="tab-([a-z-]+)"/g)]
  .map(m => ({ name: m[1], at: m.index }));

function panelOf(id) {
  const at = html.indexOf(`id="${id}"`);
  if (at < 0) return null;                       // rendered element, not markup
  let best = null;
  for (const p of panelStarts) if (p.at < at && (!best || p.at > best.at)) best = p;
  return best ? best.name : null;
}

// Mirrors TAB_RENDERERS in main.js. Kept as a literal rather than parsed out of
// the source so that a change there has to be made here too, deliberately.
const TAB_RENDERERS = {
  dashboard: ['updateDash', 'renderArtistReimburseBanner', 'renderPendingExpenses'],
  consignment: ['renderStores', 'renderLedger', 'renderInvoices'],
  history: ['renderHist'],
  expenses: ['renderExpenses', 'renderArtistReimburseBanner'],
};

describe('tab-scoped rendering', () => {
  it('renderAll renders only the visible tab', () => {
    const src = bodyOf('renderAll');
    expect(src).toContain('TAB_RENDERERS[visibleTabName()]');
    // The old unconditional sweep must not creep back.
    expect(src).not.toMatch(/updateDash\(\);\s*renderStores\(\)/);
  });

  it('reads the visible tab from the DOM, not a tracked variable', () => {
    // A tracked variable can drift from what is on screen; the panel with the
    // `active` class cannot.
    expect(bodyOf('visibleTabName')).toContain(".tab-panel.active");
  });

  // Tabs each renderer is listed under. Most own exactly one;
  // renderArtistReimburseBanner genuinely paints into two, which is why it is
  // registered under both and must be rendered by whichever one is visible.
  const tabsOf = {};
  Object.entries(TAB_RENDERERS).forEach(([tab, renderers]) => {
    renderers.forEach(fn => { (tabsOf[fn] = tabsOf[fn] || []).push(tab); });
  });

  Object.entries(tabsOf).forEach(([fn, tabs]) => {
    it(`${fn} writes only into ${tabs.join(' and ')}`, () => {
      // A renderer that painted into a panel it is *not* registered under
      // would leave that panel stale, because nothing would re-run it when
      // that tab became the visible one.
      const strays = targetIds(fn)
        .map(id => ({ id, panel: panelOf(id) }))
        .filter(x => x.panel !== null && !tabs.includes(x.panel));
      expect(strays).toEqual([]);
    });
  });

  it('switchTab renders every tab it can land on', () => {
    // Whatever renderAll no longer does for a hidden tab, arriving at that tab
    // must still do.
    const src = bodyOf('switchTab');
    Object.entries(TAB_RENDERERS).forEach(([tab, renderers]) => {
      const branch = src.match(new RegExp(`name === '${tab}'\\)([^\\n]*)`));
      expect(branch, `switchTab has no branch for ${tab}`).not.toBeNull();
      renderers.forEach(fn => {
        expect(branch[1], `switchTab('${tab}') does not call ${fn}`).toContain(fn);
      });
    });
  });
});
