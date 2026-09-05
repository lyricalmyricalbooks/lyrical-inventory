// Labels bought on Shippo's own website turning up here on their own. These
// cover the wiring around lib/shippo-watch.js: the poll gates, the headless
// import path, the automatic linking, and the card that reports it.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { appSource, buildHarness } from './helpers/extract-decl.js';
import {
  pushAppAlert,
  dismissAppAlert,
  appAlertEntries,
  clearAppAlerts,
} from '../src/lib/app-alert.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexContent = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');

describe('asking Shippo again without being told to', () => {
  function watchHarness({ key = 'shippo_live_x', online = true, hidden = false, result = { imported: 0 } } = {}) {
    const seen = { imports: [], alerts: [] };
    const harness = buildHarness({
      names: ['SHIPPO_WATCH_INTERVAL_MS', 'refreshShippoLabelsIfDue'],
      deps: {
        TAX_CENTER: { settings: key ? { shippoKey: key } : {} },
        navigator: { onLine: online },
        document: { visibilityState: hidden ? 'hidden' : 'visible' },
        dueForShippoCheck: (opts) => opts.configured && opts.online && opts.visible && !opts.busy,
        importShippoShippingFromApi: async (opts) => {
          seen.imports.push(opts);
          if (result instanceof Error) throw result;
          return result;
        },
        showShippoLabelAlert: (r) => { seen.alerts.push(r); },
        console: { warn() {} },
      },
      moduleState: 'let _shippoLastCheckAt = 0;\nlet _shippoChecking = false;',
      returns: '{ refreshShippoLabelsIfDue }',
    });
    return { ...harness, seen };
  }

  it('reads one page and skips the money sweeps', async () => {
    // The steady state has to stay a single request, or a five-minute check
    // becomes three paged sweeps of the whole account.
    const { refreshShippoLabelsIfDue, seen } = watchHarness();
    await refreshShippoLabelsIfDue();
    expect(seen.imports).toEqual([{
      silent: true, maxPages: 1, skipInvoices: true, skipRefunds: true,
    }]);
  });

  it('says nothing when nothing new was bought', async () => {
    const { refreshShippoLabelsIfDue, seen } = watchHarness({ result: { imported: 0 } });
    await refreshShippoLabelsIfDue();
    expect(seen.alerts).toEqual([]);
  });

  it('raises the card when labels arrived', async () => {
    const { refreshShippoLabelsIfDue, seen } = watchHarness({
      result: { imported: 2, autoLinked: 1, needsReview: 1 },
    });
    await refreshShippoLabelsIfDue();
    expect(seen.alerts).toEqual([{ imported: 2, autoLinked: 1, needsReview: 1 }]);
  });

  it('does not ask when no Shippo key is configured', async () => {
    const { refreshShippoLabelsIfDue, seen } = watchHarness({ key: '' });
    expect(await refreshShippoLabelsIfDue()).toBeNull();
    expect(seen.imports).toEqual([]);
  });

  it('does not ask while offline or while the tab is hidden', async () => {
    const offline = watchHarness({ online: false });
    await offline.refreshShippoLabelsIfDue();
    expect(offline.seen.imports).toEqual([]);

    const hidden = watchHarness({ hidden: true });
    await hidden.refreshShippoLabelsIfDue();
    expect(hidden.seen.imports).toEqual([]);
  });

  it('swallows a failed check instead of interrupting the publisher', async () => {
    const { refreshShippoLabelsIfDue, seen } = watchHarness({ result: new Error('offline') });
    expect(await refreshShippoLabelsIfDue()).toBeNull();
    expect(seen.alerts).toEqual([]);
  });

  it('releases the busy flag after a failure, so the next check can run', async () => {
    const { refreshShippoLabelsIfDue, seen } = watchHarness({ result: new Error('offline') });
    await refreshShippoLabelsIfDue();
    await refreshShippoLabelsIfDue();
    expect(seen.imports).toHaveLength(2);
  });
});

describe('the import can run with no screen in front of it', () => {
  const importSource = appSource.slice(
    appSource.indexOf('async function importShippoShippingFromApi'),
    appSource.indexOf('let shippoBaseSpecs'),
  );

  it('falls back to the saved key when there is no input to read', () => {
    // The watch runs with no Tax Centre rendered, so there is no #tc-shippo-key.
    expect(importSource).toContain('TAX_CENTER.settings?.shippoKey');
  });

  it('never touches the button or status line unguarded', () => {
    // Every DOM write in here must survive a Tax Centre that has never rendered.
    expect(importSource).toContain('if (btn) btn.disabled = true;');
    expect(importSource).toContain('if (btn) btn.disabled = false;');
    expect(importSource).not.toMatch(/^\s*btn\.disabled/m);
    expect(importSource).not.toMatch(/^\s*statusEl\.textContent/m);
  });

  it('skips the confirmation only when nobody is there to answer it', () => {
    expect(importSource).toContain('if (imported > 0 && !silent) {');
  });

  it('reports a failed background check instead of looking like an empty one', () => {
    expect(importSource).toContain('if (silent) throw e;');
  });

  it('honours the page cap it was given', () => {
    expect(importSource).toContain('while (hasMore && page <= maxPages)');
  });

  it('writes nothing when a background check found nothing', () => {
    // The two settings stamps always differ from last time, so an unconditional
    // save would push the whole tax document to Firestore every few minutes
    // just to record that nothing happened.
    expect(importSource).toContain('const changed = imported > 0 || enrichedCount > 0 || autoLinked > 0 || refundsAdded > 0;');
    expect(importSource).toContain('if (!silent || changed) {');
    const saveIndex = importSource.indexOf('await saveTaxCenter();', importSource.indexOf('const changed ='));
    const guardIndex = importSource.indexOf('if (!silent || changed) {');
    expect(saveIndex).toBeGreaterThan(guardIndex);
  });

  it('keeps the finished-importing toast for someone who pressed a button', () => {
    // A toast every five minutes saying "no new Shippo expenses" would be worse
    // than silence.
    const toast = importSource.slice(importSource.indexOf('const reconciliationNote ='));
    expect(toast).toMatch(/if \(!silent\) \{\s*showToast\(/);
  });

  it('links what it can before it saves, so one write covers everything', () => {
    const autoLink = importSource.indexOf('applyConfidentShippingLinks()');
    expect(autoLink).toBeGreaterThan(-1);
    // The save that commits the batch, not the earlier one in the cancelled
    // branch — see the next test for why that one is deliberately different.
    expect(importSource.indexOf('await saveTaxCenter();', autoLink)).toBeGreaterThan(autoLink);
  });

  it('does not link anything when the publisher cancels the import', () => {
    // Cancel has to mean cancel. The existing behaviour of still reconciling
    // already-imported expenses is kept, but nothing gets linked on the way
    // out of a dialog the publisher just declined.
    const cancelBranch = importSource.slice(
      importSource.indexOf('if (!accept) {'),
      importSource.indexOf('applyConfidentShippingLinks()'),
    );
    expect(cancelBranch).not.toContain('applyConfidentShippingLinks');
  });
});

describe('the shared alert corner', () => {
  it('holds both cards so neither lands on top of the other', () => {
    expect(indexContent).toContain('id="app-alert-region"');
    expect(indexContent).toContain('id="app-alert-stack"');
    // The shipped order card still exists, now inside the region.
    expect(indexContent).toContain('id="new-order-alert"');
    const region = indexContent.slice(
      indexContent.indexOf('id="app-alert-region"'),
      indexContent.indexOf('<!-- Styled confirm dialog'),
    );
    expect(region).toContain('id="new-order-alert"');
    expect(region).toContain('id="app-alert-stack"');
  });

  it('does not let an empty corner swallow clicks underneath it', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../src/styles/system.css'), 'utf8');
    const region = css.slice(css.indexOf('.app-alert-region {'), css.indexOf('#app-alert-stack {'));
    expect(region).toContain('pointer-events: none');
    expect(css).toMatch(/\.app-alert,\n\.new-order-alert \{[\s\S]*?pointer-events: auto/);
  });

  it('starts the label watch once the catalogue has loaded', () => {
    expect(appSource).toContain('startShippoLabelWatch();');
  });

  it('checks on a timer, on return, and when the signal comes back', () => {
    const watch = appSource.slice(
      appSource.indexOf('function startShippoLabelWatch'),
      appSource.indexOf('async function importShippoShippingFromApi'),
    );
    expect(watch).toContain('setInterval(poll, SHIPPO_WATCH_INTERVAL_MS)');
    expect(watch).toContain('visibilitychange');
    expect(watch).toContain("addEventListener('online', poll)");
    expect(watch).toContain('if (_shippoWatchStarted');
  });
});

describe('the alert stack itself', () => {
  const entry = (id, patch = {}) => ({ id, icon: '🏷️', title: `${id} title`, detail: 'detail', ...patch });

  it('keeps several pieces of news at once', () => {
    clearAppAlerts();
    pushAppAlert(entry('orders'));
    pushAppAlert(entry('shippo-labels'));
    expect(appAlertEntries().map(e => e.id)).toEqual(['orders', 'shippo-labels']);
  });

  it('updates what it already said rather than stacking a duplicate', () => {
    // These come from checks that repeat every few minutes.
    clearAppAlerts();
    pushAppAlert(entry('shippo-labels', { title: '1 label imported' }));
    pushAppAlert(entry('shippo-labels', { title: '3 labels imported' }));
    const entries = appAlertEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].title).toBe('3 labels imported');
  });

  it('removes only the entry that was dismissed', () => {
    clearAppAlerts();
    pushAppAlert(entry('orders'));
    pushAppAlert(entry('shippo-labels'));
    dismissAppAlert('shippo-labels');
    expect(appAlertEntries().map(e => e.id)).toEqual(['orders']);
  });

  it('refuses an entry with nothing to say', () => {
    clearAppAlerts();
    expect(pushAppAlert({ id: 'x' })).toBeNull();
    expect(pushAppAlert({ title: 'no id' })).toBeNull();
    expect(appAlertEntries()).toEqual([]);
  });

  it('survives being dismissed with junk', () => {
    clearAppAlerts();
    pushAppAlert(entry('orders'));
    dismissAppAlert('');
    dismissAppAlert(null);
    expect(appAlertEntries()).toHaveLength(1);
  });
});

describe('the worklist can clear its own backlog', () => {
  it('offers linking beside the existing dismiss-all', () => {
    expect(indexContent).toContain('onclick="linkConfidentShippingMatchesNow()"');
    expect(indexContent).toContain('id="shipping-reconciliation-autolink"');
    // The dismiss-all is still there; this is a counterpart, not a replacement.
    expect(indexContent).toContain('onclick="clearShippingReconciliationList()"');
  });

  it('records an automatic link as automatic, never as the publisher’s', () => {
    expect(appSource).toContain("writeShippingLink(expense, orderNumber, 'recipient-auto')");
  });
});
