import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  resolveCanadaPostCredentials,
  readCanadaPostCredentialSet,
  credentialSetIsConfigured,
  migrateCanadaPostCredentials,
  CANADAPOST_CREDENTIAL_FIELDS,
  validateCanadaPostAccount,
} from '../src/lib/canadapost.js';
import { assessLiveShippingReadiness } from '../src/lib/shipping-readiness.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const taxcentreSrc = fs.readFileSync(path.join(root, 'src/features/taxcentre.js'), 'utf8');
const shippingSrc = fs.readFileSync(path.join(root, 'src/features/shipping.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

// ─────────────────────────────────────────────────────────────────────────
// Why this file exists:
//
// Canada Post's Developer Portal issues a separate Client ID and Secret for
// sandbox and for production, and both are used against the SAME gateway — the
// key is the only thing that decides which environment a request lands in.
// One shared pair therefore made switching environments a retype: paste the
// sandbox key to rehearse, paste the live key to ship, and hope the Sandbox
// toggle matched whichever was currently in the box.
// ─────────────────────────────────────────────────────────────────────────

const LIVE = { apiKey: 'd1d36298650efe474806c94f75cfb04a', apiSecret: 'live-secret', customerNumber: '0001298882', contractId: '4299100' };
const TEST = { apiKey: 'a0b1c2d3e4f5061728394a5b6c7d8e9f', apiSecret: 'test-secret', customerNumber: '0009999999', contractId: '' };

const bothSets = () => ({
  cpLiveApiKey: LIVE.apiKey, cpLiveApiSecret: LIVE.apiSecret,
  cpLiveCustomerNumber: LIVE.customerNumber, cpLiveContractId: LIVE.contractId,
  cpTestApiKey: TEST.apiKey, cpTestApiSecret: TEST.apiSecret,
  cpTestCustomerNumber: TEST.customerNumber, cpTestContractId: TEST.contractId,
});

describe('The Sandbox toggle picks a set of keys, not just a label', () => {
  it('sends the live keys with the toggle off', () => {
    const resolved = resolveCanadaPostCredentials({ ...bothSets(), cpTestMode: false });
    expect(resolved.apiKey).toBe(LIVE.apiKey);
    expect(resolved.apiSecret).toBe(LIVE.apiSecret);
    expect(resolved.customerNumber).toBe(LIVE.customerNumber);
    expect(resolved.contractId).toBe('4299100');
    expect(resolved.mode).toBe('live');
  });

  it('sends the sandbox keys with the toggle on', () => {
    const resolved = resolveCanadaPostCredentials({ ...bothSets(), cpTestMode: true });
    expect(resolved.apiKey).toBe(TEST.apiKey);
    expect(resolved.customerNumber).toBe(TEST.customerNumber);
    expect(resolved.mode).toBe('test');
  });

  it('never mixes one set’s key with the other set’s customer number', () => {
    const live = resolveCanadaPostCredentials({ ...bothSets(), cpTestMode: false });
    const test = resolveCanadaPostCredentials({ ...bothSets(), cpTestMode: true });
    expect(live.customerNumber).not.toBe(test.customerNumber);
    expect(live.apiSecret).not.toBe(test.apiSecret);
  });

  it('reports whether the other set is ready, before the toggle is flipped', () => {
    const onlyTest = { cpTestApiKey: TEST.apiKey, cpTestApiSecret: TEST.apiSecret, cpTestMode: true };
    const resolved = resolveCanadaPostCredentials(onlyTest);
    expect(resolved.testConfigured).toBe(true);
    expect(resolved.liveConfigured).toBe(false);
  });

  it('returns an empty set rather than borrowing the other one', () => {
    // Falling back to the sandbox key when live is blank would make a "live"
    // purchase run on a development account, or the reverse.
    const resolved = resolveCanadaPostCredentials({
      cpTestApiKey: TEST.apiKey, cpTestApiSecret: TEST.apiSecret, cpTestMode: false,
    });
    expect(resolved.apiKey).toBe('');
    expect(resolved.apiSecret).toBe('');
  });

  it('reads a named set verbatim', () => {
    expect(readCanadaPostCredentialSet(bothSets(), 'live').apiKey).toBe(LIVE.apiKey);
    expect(readCanadaPostCredentialSet(bothSets(), 'test').apiKey).toBe(TEST.apiKey);
    expect(readCanadaPostCredentialSet({}, 'live')).toEqual({ apiKey: '', apiSecret: '', customerNumber: '', contractId: '' });
  });

  it('counts a set as configured only with both halves', () => {
    expect(credentialSetIsConfigured({ apiKey: 'a', apiSecret: 'b' })).toBe(true);
    expect(credentialSetIsConfigured({ apiKey: 'a', apiSecret: '' })).toBe(false);
    expect(credentialSetIsConfigured({ apiKey: '  ', apiSecret: 'b' })).toBe(false);
  });
});

describe('An existing single-key setup is not lost', () => {
  it('keeps working on the first load, before anything is migrated', () => {
    const legacy = { cpApiKey: 'old-key', cpApiSecret: 'old-secret', cpCustomerNumber: '0001298882', cpTestMode: true };
    const resolved = resolveCanadaPostCredentials(legacy);
    expect(resolved.apiKey).toBe('old-key');
    expect(resolved.usingLegacy).toBe(true);
  });

  it('moves the old key into the set the toggle pointed at', () => {
    const settings = { cpApiKey: 'old-key', cpApiSecret: 'old-secret', cpCustomerNumber: '0001298882', cpTestMode: true };
    expect(migrateCanadaPostCredentials(settings)).toEqual({ migrated: true, mode: 'test' });
    expect(settings[CANADAPOST_CREDENTIAL_FIELDS.test.apiKey]).toBe('old-key');
    expect(settings[CANADAPOST_CREDENTIAL_FIELDS.test.customerNumber]).toBe('0001298882');
    // Nothing lands in the other set — a production key in the sandbox boxes
    // would make "sandbox" purchases real, and the reverse breaks shipping.
    expect(settings[CANADAPOST_CREDENTIAL_FIELDS.live.apiKey]).toBeFalsy();
  });

  it('moves it into the live set when the toggle was off', () => {
    const settings = { cpApiKey: 'old-key', cpApiSecret: 'old-secret', cpTestMode: false };
    expect(migrateCanadaPostCredentials(settings).mode).toBe('live');
    expect(settings[CANADAPOST_CREDENTIAL_FIELDS.live.apiKey]).toBe('old-key');
  });

  it('clears the old fields so each credential lives in exactly one place', () => {
    const settings = { cpApiKey: 'old-key', cpApiSecret: 'old-secret', cpCustomerNumber: '0001298882', cpContractId: '4299100', cpTestMode: false };
    migrateCanadaPostCredentials(settings);
    expect(settings.cpApiKey).toBe('');
    expect(settings.cpApiSecret).toBe('');
    expect(settings.cpCustomerNumber).toBe('');
    expect(settings.cpContractId).toBe('');
  });

  it('never overwrites a set that has already been filled in by hand', () => {
    const settings = {
      cpApiKey: 'old-key', cpApiSecret: 'old-secret', cpTestMode: false,
      cpLiveApiKey: 'deliberate', cpLiveApiSecret: 'deliberate-secret',
    };
    expect(migrateCanadaPostCredentials(settings).migrated).toBe(false);
    expect(settings.cpLiveApiKey).toBe('deliberate');
  });

  it('does nothing at all when there is no old key', () => {
    const settings = { ...bothSets(), cpTestMode: false };
    const before = JSON.stringify(settings);
    expect(migrateCanadaPostCredentials(settings)).toEqual({ migrated: false, mode: '' });
    expect(JSON.stringify(settings)).toBe(before);
  });

  it('is safe to run twice', () => {
    const settings = { cpApiKey: 'old-key', cpApiSecret: 'old-secret', cpTestMode: true };
    migrateCanadaPostCredentials(settings);
    expect(migrateCanadaPostCredentials(settings)).toEqual({ migrated: false, mode: '' });
    expect(settings[CANADAPOST_CREDENTIAL_FIELDS.test.apiKey]).toBe('old-key');
  });

  it('survives being handed nothing', () => {
    expect(migrateCanadaPostCredentials(null)).toEqual({ migrated: false, mode: '' });
    expect(migrateCanadaPostCredentials(undefined).migrated).toBe(false);
  });
});

describe('The go-live checklist judges the set actually in use', () => {
  const assess = (settings) => {
    const credentials = resolveCanadaPostCredentials(settings);
    return assessLiveShippingReadiness({
      settings,
      credentials,
      accountAudit: validateCanadaPostAccount({ ...credentials, isTest: credentials.isTest }),
      sender: { name: 'Books', phone: '4165550142', address1: '88 Bookish Way', city: 'Toronto', province: 'ON', postalCode: 'M4B 1B3' },
      destination: { countryCode: 'CA' },
    });
  };
  const checkFor = (r, id) => r.checks.find(c => c.id === id);

  it('does not call live ready just because a sandbox key exists', () => {
    const readiness = assess({ cpEnabled: true, cpTestMode: false, cpTestApiKey: TEST.apiKey, cpTestApiSecret: TEST.apiSecret });
    expect(checkFor(readiness, 'key').status).toBe('blocked');
    expect(checkFor(readiness, 'key').detail).toMatch(/No live key saved/i);
    expect(readiness.ready).toBe(false);
  });

  it('names which boxes are in use when the key is fine', () => {
    const live = assess({ cpEnabled: true, cpTestMode: false, ...bothSets() });
    expect(checkFor(live, 'key').detail).toMatch(/live boxes/);
    const test = assess({ cpEnabled: true, cpTestMode: true, ...bothSets() });
    expect(checkFor(test, 'key').detail).toMatch(/sandbox boxes/);
  });

  it('warns that flipping the toggle off would leave nothing to ship with', () => {
    const readiness = assess({
      cpEnabled: true, cpTestMode: true,
      cpTestApiKey: TEST.apiKey, cpTestApiSecret: TEST.apiSecret, cpTestCustomerNumber: TEST.customerNumber,
    });
    const check = checkFor(readiness, 'other-set');
    expect(check.status).toBe('warn');
    expect(check.detail).toMatch(/nothing to ship with/i);
  });

  it('is content when only the live set exists, since sandbox is optional', () => {
    const readiness = assess({
      cpEnabled: true, cpTestMode: false,
      cpLiveApiKey: LIVE.apiKey, cpLiveApiSecret: LIVE.apiSecret, cpLiveCustomerNumber: LIVE.customerNumber,
    });
    expect(checkFor(readiness, 'other-set').status).toBe('ok');
    expect(readiness.ready).toBe(true);
  });
});

describe('Both sets are on the card, and the app reads them', () => {
  it('has a full set of boxes for each environment', () => {
    for (const mode of ['live', 'test']) {
      for (const field of ['key', 'secret', 'customer-number', 'contract-id']) {
        expect(indexHtml).toContain(`id="tc-cp-${mode}-${field}"`);
      }
    }
  });

  it('drops the single shared boxes that used to be there', () => {
    expect(indexHtml).not.toContain('id="tc-cp-key"');
    expect(indexHtml).not.toContain('id="tc-cp-secret"');
    expect(indexHtml).not.toContain('id="tc-cp-customer-number"');
  });

  it('repaints which set is in use the moment the toggle moves', () => {
    expect(indexHtml).toContain('id="tc-cp-test-mode" onchange="renderCanadaPostKeySets()"');
    expect(taxcentreSrc).toMatch(/function renderCanadaPostKeySets/);
    expect(taxcentreSrc).toMatch(/panel\.classList\.toggle\('is-active', isActive\)/);
  });

  it('saves and loads both sets rather than one shared slot', () => {
    expect(taxcentreSrc).toMatch(/for \(const mode of \['live', 'test'\]\)/);
    expect(taxcentreSrc).toMatch(/CANADAPOST_CREDENTIAL_FIELDS\[mode\]/);
    expect(taxcentreSrc).not.toMatch(/put\('cpApiKey'/);
  });

  it('tests and diagnoses whichever set the toggle selects', () => {
    expect(taxcentreSrc).toMatch(/function canadaPostCredentialsUnderTest/);
    expect(taxcentreSrc).toMatch(/function activeCanadaPostMode/);
    // A successful test must save into the set it tested, not the shared slot.
    expect(taxcentreSrc).toMatch(/TAX_CENTER\.settings\[fields\.apiKey\] = apiKey;/);
    expect(taxcentreSrc).not.toMatch(/TAX_CENTER\.settings\.cpApiKey = apiKey;/);
  });

  it('routes every shipping read through the resolver', () => {
    expect(shippingSrc).not.toMatch(/TAX_CENTER\.settings\?\.cpApiKey/);
    expect(shippingSrc).not.toMatch(/TAX_CENTER\.settings\?\.cpApiSecret/);
    expect(shippingSrc).toMatch(/resolveCanadaPostCredentials\(TAX_CENTER\.settings \|\| \{\}\)/);
  });

  it('tells the publisher where a pre-split key was moved to', () => {
    expect(indexHtml).toContain('id="tc-cp-migration-note"');
    expect(taxcentreSrc).toMatch(/function renderCanadaPostMigrationNote/);
    // And stops saying it once the split has actually been written down.
    expect(taxcentreSrc).toMatch(/_cpMigrationNotice = '';/);
  });
});
