// Saying when a background check has stopped working: the storage, the card,
// the mark that outlives it, and the places the two watches report from.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { appSource } from './helpers/extract-decl.js';
import {
  HEALTH_STORAGE_KEY,
  emptyHealthState,
  readHealthState,
  readHealthRecords,
  recordFailure,
  writeHealthState,
} from '../src/lib/integration-health.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexContent = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
const systemCss = fs.readFileSync(path.resolve(__dirname, '../src/styles/system.css'), 'utf8');

/** A stand-in for localStorage that can also be made to fail. */
function fakeStore({ blocked = false, seed = null } = {}) {
  let raw = seed === null ? null : JSON.stringify(seed);
  return {
    getItem: () => { if (blocked) throw new Error('blocked'); return raw; },
    setItem: (_k, v) => { if (blocked) throw new Error('blocked'); raw = v; },
    read: () => (raw === null ? null : JSON.parse(raw)),
  };
}

const err = (message, status) => Object.assign(new Error(message), { status });

describe('remembering a fault across a reload', () => {
  it('keeps one record per service under a single key', () => {
    const store = fakeStore();
    writeHealthState(store, 'shippo', recordFailure(emptyHealthState(), { error: err('x', 401) }));
    writeHealthState(store, 'bigcartel', recordFailure(emptyHealthState(), { error: err('y', 500) }));

    expect(Object.keys(store.read())).toEqual(['shippo', 'bigcartel']);
    expect(readHealthState(store, 'shippo').category).toBe('auth');
    expect(readHealthState(store, 'bigcartel').category).toBe('server');
  });

  it('removes a record once the service recovers, rather than storing zeroes', () => {
    const store = fakeStore();
    writeHealthState(store, 'shippo', recordFailure(emptyHealthState(), { error: err('x', 500) }));
    writeHealthState(store, 'shippo', emptyHealthState());
    expect(store.read()).toEqual({});
  });

  it('reads a browser that blocks storage as "nothing has gone wrong"', () => {
    // A browser that cannot remember faults must not invent them.
    const store = fakeStore({ blocked: true });
    expect(readHealthRecords(store)).toEqual({});
    expect(readHealthState(store, 'shippo').attempts).toBe(0);
    expect(() => writeHealthState(store, 'shippo', emptyHealthState())).not.toThrow();
  });

  it('ignores a corrupted record rather than crashing on it', () => {
    expect(readHealthRecords({ getItem: () => 'not json' })).toEqual({});
    expect(readHealthRecords({ getItem: () => '["an","array"]' })).toEqual({});
    expect(readHealthRecords(null)).toEqual({});
  });

  it('stores nothing under an empty service name', () => {
    const store = fakeStore();
    writeHealthState(store, '', recordFailure(emptyHealthState(), { error: err('x', 500) }));
    expect(store.read()).toBeNull();
  });

  it('keeps failure state out of the tax document', () => {
    // saveTaxCenter() serialises the whole ledger; a record written on every
    // failed background check is exactly the write the importer guards against.
    expect(HEALTH_STORAGE_KEY).toBe('lm-integration-health');
    const watchSource = fs.readFileSync(path.resolve(__dirname, '../src/lib/integration-watch.js'), 'utf8');
    expect(watchSource).not.toContain('saveTaxCenter');
    expect(watchSource).not.toContain('TAX_CENTER');
  });
});

describe('both watches report what happened', () => {
  it('the Shippo watch records success and failure', () => {
    const watch = appSource.slice(
      appSource.indexOf('async function refreshShippoLabelsIfDue'),
      appSource.indexOf('/** The card announcing labels that filed themselves. */'),
    );
    expect(watch).toContain("noteIntegrationSuccess('shippo')");
    expect(watch).toContain("noteIntegrationFailure('shippo', error");
    expect(watch).toContain("integrationBackoffMs('shippo'");
  });

  it('the storefront check records success and failure', () => {
    const check = appSource.slice(
      appSource.indexOf('async function checkBigCartelLedgerGaps'),
      appSource.indexOf('async function autoCheckBigCartelLedgerGaps'),
    );
    expect(check).toContain("noteIntegrationSuccess('bigcartel')");
    expect(check).toContain("noteIntegrationFailure('bigcartel', e");
  });

  it('both watches widen their interval while the service is refusing', () => {
    expect(appSource).toContain("integrationBackoffMs('bigcartel', BC_ORDER_WATCH_INTERVAL_MS)");
    expect(appSource).toContain("integrationBackoffMs('shippo', SHIPPO_WATCH_INTERVAL_MS)");
  });
});

describe('the errors now say why they failed', () => {
  it('carries the status as data, not only inside the sentence', () => {
    // Without this, telling a refused key from a train tunnel means regexing
    // message text.
    expect(appSource).toContain('bcError.status = Number(data.code) || 0;');
    expect(appSource).toContain('apiError.status = resp.status;');
    expect(appSource).toContain('lookupError.status = resp.status;');
  });
});

describe('the mark that outlives the card', () => {
  it('is on the navigation for both services', () => {
    expect(indexContent).toContain('data-health-badge="bigcartel"');
    expect(indexContent).toContain('data-health-badge="shippo"');
    // Two places each, so it is visible wherever that tab is reached from.
    expect(indexContent.match(/data-health-badge="bigcartel"/g)).toHaveLength(2);
    expect(indexContent.match(/data-health-badge="shippo"/g)).toHaveLength(2);
  });

  it('starts hidden and is announced to a screen reader', () => {
    expect(indexContent).toMatch(/data-health-badge="shippo"[^>]*aria-label="[^"]+"/);
    expect(indexContent).toMatch(/class="health-badge"[^>]*hidden/);
  });

  it('is painted at startup, so a fault survives a reload', () => {
    expect(appSource).toContain('renderIntegrationBadges();');
  });

  it('gives a failure card its own colour', () => {
    expect(systemCss).toContain('.app-alert-failed');
    expect(systemCss).toContain('.app-alert-offline');
    // Untoned entries keep the styling they shipped with.
    const alertSource = fs.readFileSync(path.resolve(__dirname, '../src/lib/app-alert.js'), 'utf8');
    expect(alertSource).toContain("const tone = entry.tone ? ` app-alert-${escapeHtml(entry.tone)}` : '';");
  });
});

describe('the Check now button reaches the right watch', () => {
  it('forces a check past the backoff', () => {
    expect(appSource).toContain("window.recheckIntegration");
    expect(appSource).toContain("refreshBigCartelOrdersIfDue({ force: true })");
    expect(appSource).toContain("refreshShippoLabelsIfDue({ force: true })");
  });
});

describe('bugs this change fixes', () => {
  it('every switchTab target has a panel to show', () => {
    // switchTab hides every panel and then shows the named one, so a mistyped
    // id leaves a blank screen. `switchTab('taxcentre')` shipped and did that.
    const names = [...appSource.matchAll(/switchTab\(\s*'([a-z0-9-]+)'\s*\)/g)].map(m => m[1]);
    expect(names.length).toBeGreaterThan(0);
    const missing = [...new Set(names)].filter(n => !indexContent.includes(`id="tab-${n}"`));
    expect(missing).toEqual([]);
  });

  it('tells a failed storefront check from one that never ran', () => {
    expect(appSource).toContain('Big Cartel could not be reached, so this list may be out of date.');
    expect(appSource).toContain("_bcLastCheckFailed = true;");
  });

  it('paints the unverified connection dot in a colour that exists', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../src/style.css'), 'utf8');
    expect(appSource).toContain("'bc-dot unverified'");
    expect(css).toContain('.bc-dot.unverified');
    // The class it used to ask for was never written, so it painted green.
    expect(appSource).not.toContain("'sync-dot amber'");
  });

  it('hands describeShippoError a status rather than an Error object', () => {
    expect(appSource).toContain("describeShippoError(e?.status || 0, e?.message || '')");
  });
});

describe('the card is raised once per fault, not once per failed check', () => {
  const watchSource = fs.readFileSync(path.resolve(__dirname, '../src/lib/integration-watch.js'), 'utf8');

  it('does not re-raise a card the publisher has already dismissed', () => {
    // They chose a dismissible card plus a mark that stays; pushing the card
    // again five minutes later would undo the dismissal they just made.
    expect(watchSource).toContain('const alreadySaid = prior.announced && prior.category === folded.category;');
    expect(watchSource).toContain('const speak = said.visible && !alreadySaid;');
  });

  it('does say it again when the fault changes character', () => {
    // An unreachable service that turns out to be a refused key is different
    // news — the comparison on category is what allows that through.
    expect(watchSource).toContain('prior.category === folded.category');
  });

  it('costs nothing at all while a service is healthy', () => {
    // Runs after every successful check, on a timer.
    expect(watchSource).toContain('if (!prior.attempts && !prior.announced) return prior;');
  });

  it('repaints the alert stack only when an entry actually went', () => {
    const alertSource = fs.readFileSync(path.resolve(__dirname, '../src/lib/app-alert.js'), 'utf8');
    expect(alertSource).toContain('if (_entries.length !== before) renderAppAlerts();');
  });
});

describe('health state defaults', () => {
  let store;
  beforeEach(() => { store = fakeStore(); });

  it('a service that has never failed reads clean', () => {
    expect(readHealthState(store, 'shippo')).toMatchObject({ attempts: 0, category: '', announced: false });
  });
});
