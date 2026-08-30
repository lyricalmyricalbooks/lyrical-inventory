import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assessLiveShippingReadiness,
  senderAddressIsPlaceholder,
  missingSenderFields,
  inspectZonosAccountKey,
  describeKeyKind,
  digitsOf,
  SHIPMENT_PLACEHOLDERS,
} from '../src/lib/shipping-readiness.js';
import {
  buildNonContractShipmentJson,
  buyCanadaPostLabel,
  validateCanadaPostAccount,
} from '../src/lib/canadapost.js';
import { resolveDutyPrepaymentRoute } from '../src/lib/zonos.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const taxcentreSrc = fs.readFileSync(path.join(root, 'src/features/taxcentre.js'), 'utf8');
const shippingSrc = fs.readFileSync(path.join(root, 'src/features/shipping.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

// ─────────────────────────────────────────────────────────────────────────
// Why this file exists:
//
// The Developer Portal migration removed the only structural difference
// between test and live — both modes address the same gateway, and only the
// credentials decide which one you get. Nothing in the app can read a key's
// environment, so "am I set up to buy a real label" had no answer anywhere.
//
// The sharpest edge was the sender panel: every blank field was silently
// replaced with a worked example ("123 Main St, Toronto", phone 416-555-0199).
// Harmless while rehearsing; on a live parcel it means an undeliverable book is
// returned to an address that does not exist.
// ─────────────────────────────────────────────────────────────────────────

const goodSender = {
  name: 'Lyricalmyrical Books',
  phone: '416 555 0142',
  address1: '88 Bookish Way',
  city: 'Toronto',
  province: 'ON',
  postalCode: 'M4B 1B3',
};

const liveSettings = {
  cpEnabled: true,
  cpTestMode: false,
  cpApiKey: 'd1d36298650efe474806c94f75cfb04a',
  cpApiSecret: 'secret',
  cpCustomerNumber: '0001298882',
};

const auditFor = (settings) => validateCanadaPostAccount({
  apiKey: settings.cpApiKey,
  apiSecret: settings.cpApiSecret,
  customerNumber: settings.cpCustomerNumber,
  isTest: !!settings.cpTestMode,
});

const assess = (over = {}) => assessLiveShippingReadiness({
  settings: { ...liveSettings, ...(over.settings || {}) },
  accountAudit: auditFor({ ...liveSettings, ...(over.settings || {}) }),
  sender: over.sender === undefined ? goodSender : over.sender,
  destination: over.destination || { countryCode: 'CA' },
  dutyRoute: over.dutyRoute || null,
});

const checkFor = (readiness, id) => readiness.checks.find(c => c.id === id);

describe('Spotting the stand-in return address', () => {
  it('calls a blank street a placeholder, because that is what triggers the substitution', () => {
    expect(senderAddressIsPlaceholder({})).toBe(true);
    expect(senderAddressIsPlaceholder({ address1: '   ' })).toBe(true);
  });

  it('recognises the worked example the builder falls back to', () => {
    expect(senderAddressIsPlaceholder({
      address1: '123 Main St', city: 'Toronto', postalCode: 'M4B 1B3',
    })).toBe(true);
    // Formatting must not hide it.
    expect(senderAddressIsPlaceholder({
      address1: '123 MAIN ST.', city: 'toronto', postalCode: 'm4b1b3',
    })).toBe(true);
  });

  it('leaves a real address alone, including a genuine 123 Main St elsewhere', () => {
    expect(senderAddressIsPlaceholder(goodSender)).toBe(false);
    expect(senderAddressIsPlaceholder({
      address1: '123 Main St', city: 'Moose Jaw', postalCode: 'S6H 0A1',
    })).toBe(false);
  });

  it('names each missing sender field rather than reporting one generic fault', () => {
    expect(missingSenderFields({})).toEqual(['name', 'street address', 'city', 'province', 'postal code']);
    expect(missingSenderFields({ ...goodSender, city: '' })).toEqual(['city']);
    expect(missingSenderFields(goodSender)).toEqual([]);
  });
});

describe('A live purchase refuses stand-in sender details', () => {
  const creds = { apiKey: 'key', apiSecret: 'secret', customerNumber: '0001298882' };
  const dest = { countryCode: 'CA', postalCode: 'V6B2W9', address1: '1 Main St', city: 'Vancouver' };

  beforeEach(() => { global.fetch = vi.fn().mockRejectedValue(new Error('should never be called')); });

  it('will not buy a live label with no return address, before any network call', async () => {
    await expect(buyCanadaPostLabel({
      serviceCode: 'DOM.EP', destination: dest, parcel: { weightKg: 0.5 }, ...creds, isTest: false,
    })).rejects.toThrow(/needs a real return address/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('will not buy a live label addressed from the worked example', async () => {
    await expect(buyCanadaPostLabel({
      serviceCode: 'DOM.EP',
      sender: { name: 'Books', phone: '4165550142', address1: '123 Main St', city: 'Toronto', province: 'ON', postalCode: 'M4B 1B3' },
      destination: dest, parcel: { weightKg: 0.5 }, ...creds, isTest: false,
    })).rejects.toThrow(/still the example one/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('will not buy a live label with no sender phone, which Canada Post requires', async () => {
    await expect(buyCanadaPostLabel({
      serviceCode: 'DOM.EP',
      sender: { ...goodSender, phone: '' },
      destination: dest, parcel: { weightKg: 0.5 }, ...creds, isTest: false,
    })).rejects.toThrow(/sender contact number/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('still lets a sandbox run rehearse the screen without an address', async () => {
    const shipmentJson = JSON.stringify({
      nonContractShipmentInfo: { shipmentId: 'S1', trackingPin: '70123456789012345' },
    });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, json: shipmentJson }),
      text: async () => shipmentJson,
      headers: { get: () => 'application/json' },
    });

    const result = await buyCanadaPostLabel({
      serviceCode: 'DOM.EP', destination: dest, parcel: { weightKg: 0.5 }, ...creds, isTest: true,
    });
    expect(result.trackingPin).toBe('70123456789012345');
  });
});

describe('The shipment payload only invents details while rehearsing', () => {
  it('fills the worked example in when placeholders are allowed', () => {
    const json = JSON.parse(buildNonContractShipmentJson({
      destination: { countryCode: 'CA', postalCode: 'V6B2W9', address1: '1 Main St', city: 'Vancouver' },
      parcel: { weightKg: 0.5 },
    }));
    expect(json.sender.addressDetails.addressLine1).toBe('123 Main St');
    expect(json.sender.contactPhone).toBe(SHIPMENT_PLACEHOLDERS.senderPhone);
  });

  it('leaves them empty rather than inventing them when they are not', () => {
    const json = JSON.parse(buildNonContractShipmentJson({
      destination: { countryCode: 'CA', postalCode: 'V6B2W9', address1: '1 Main St', city: 'Vancouver' },
      parcel: { weightKg: 0.5 },
      allowPlaceholders: false,
    }));
    expect(json.sender.addressDetails.addressLine1).toBe('');
    expect(json.sender.addressDetails.city).toBe('');
  });

  it('omits the recipient phone key entirely rather than sending it empty', () => {
    // Canada Post reads an empty clientVoiceNumber as malformed, not absent, and
    // answers with a schema error that reads like an address fault.
    const strict = JSON.parse(buildNonContractShipmentJson({
      destination: { countryCode: 'US', postalCode: '90210', address1: '1 Palm Dr', city: 'Beverly Hills', state: 'CA' },
      parcel: { weightKg: 0.5 },
      allowPlaceholders: false,
    }));
    expect('clientVoiceNumber' in strict.destination).toBe(false);

    const withPhone = JSON.parse(buildNonContractShipmentJson({
      destination: { countryCode: 'US', phone: '6045550123', postalCode: '90210', address1: '1 Palm Dr', city: 'Beverly Hills', state: 'CA' },
      parcel: { weightKg: 0.5 },
      allowPlaceholders: false,
    }));
    expect(withPhone.destination.clientVoiceNumber).toBe('6045550123');
  });

  it('carries a real sender through untouched', () => {
    const json = JSON.parse(buildNonContractShipmentJson({
      sender: goodSender,
      destination: { countryCode: 'CA', postalCode: 'V6B2W9', address1: '1 Main St', city: 'Vancouver' },
      parcel: { weightKg: 0.5 },
      allowPlaceholders: false,
    }));
    expect(json.sender.addressDetails.addressLine1).toBe('88 Bookish Way');
    expect(json.sender.addressDetails.postalZipCode).toBe('M4B1B3');
    expect(json.sender.contactPhone).toBe('416 555 0142');
  });
});

describe('The go-live checklist', () => {
  it('passes a fully configured live account', () => {
    const readiness = assess();
    expect(readiness.mode).toBe('live');
    expect(readiness.ready).toBe(true);
    expect(readiness.blockers).toEqual([]);
    expect(checkFor(readiness, 'mode').status).toBe('ok');
  });

  it('blocks on the example return address and says how to fix it', () => {
    const readiness = assess({
      sender: { ...goodSender, address1: '123 Main St', city: 'Toronto', postalCode: 'M4B 1B3' },
    });
    expect(readiness.ready).toBe(false);
    const check = checkFor(readiness, 'sender');
    expect(check.status).toBe('blocked');
    expect(check.detail).toMatch(/returned to an address that does not exist/i);
    expect(check.fix).toMatch(/Sender panel/);
  });

  it('blocks on a missing sender phone, which Canada Post requires', () => {
    const readiness = assess({ sender: { ...goodSender, phone: '' } });
    expect(checkFor(readiness, 'sender-phone').status).toBe('blocked');
    expect(readiness.ready).toBe(false);
  });

  it('only warns when the phone is the example number, since that still posts', () => {
    const readiness = assess({ sender: { ...goodSender, phone: '416-555-0199' } });
    expect(checkFor(readiness, 'sender-phone').status).toBe('warn');
    expect(readiness.ready).toBe(true);
  });

  it('blocks a key from the retired credential system', () => {
    const readiness = assess({ settings: { cpApiKey: 'myusername:mypassword' } });
    expect(checkFor(readiness, 'key').status).toBe('blocked');
    expect(checkFor(readiness, 'key').detail).toMatch(/username.*password/i);
  });

  it('blocks when the integration is switched off', () => {
    const readiness = assess({ settings: { cpEnabled: false } });
    expect(checkFor(readiness, 'enabled').status).toBe('blocked');
  });

  it('warns rather than reassures while sandbox keys are on', () => {
    const readiness = assess({ settings: { cpTestMode: true } });
    expect(readiness.mode).toBe('test');
    const mode = checkFor(readiness, 'mode');
    expect(mode.status).toBe('warn');
    expect(mode.detail).toMatch(/same address/i);
    // Still "ready" — nothing is broken, it just may not be a test.
    expect(readiness.ready).toBe(true);
  });

  it('names the account a label will actually be billed to', () => {
    expect(checkFor(assess(), 'account').detail).toContain('0001298882');
  });
});

describe('U.S. parcels: the duty route is checked before the label', () => {
  const toUs = (dutyRoute, destination = {}) => assess({
    destination: { countryCode: 'US', phone: '6025550123', ...destination },
    dutyRoute,
  });

  it('passes when a Verified Account will prepay automatically', () => {
    const route = resolveDutyPrepaymentRoute({ destCountry: 'US', accountKey: 'zonos_account_key_abc123456' });
    expect(route.route).toBe('verified');
    expect(checkFor(toUs(route), 'duty').status).toBe('ok');
  });

  it('passes when a Declaration ID has been bought and pasted in', () => {
    const route = resolveDutyPrepaymentRoute({ destCountry: 'US', declarationId: '0rd4dpkrvc1y9' });
    expect(route.route).toBe('manual');
    expect(checkFor(toUs(route), 'duty').detail).toContain('0rd4dpkrvc1y9');
  });

  it('warns — not blocks — with no prepaid duty, and says who pays', () => {
    const route = resolveDutyPrepaymentRoute({ destCountry: 'US' });
    const check = checkFor(toUs(route), 'duty');
    expect(check.status).toBe('warn');
    expect(check.detail).toMatch(/billed on delivery and may refuse/i);
    // Shipping duty-unpaid is a legitimate choice, so it must not block.
    expect(toUs(route).ready).toBe(true);
  });

  it('warns about a missing recipient phone on an international parcel only', () => {
    expect(checkFor(toUs(null, { phone: '' }), 'recipient-phone').status).toBe('warn');
    expect(checkFor(assess({ destination: { countryCode: 'CA' } }), 'recipient-phone')).toBeUndefined();
  });

  it('says nothing about duty for a domestic parcel', () => {
    expect(checkFor(assess(), 'duty')).toBeUndefined();
  });
});

describe('The Zonos Account Key is checked before it reaches a live parcel', () => {
  it('accepts a plausible token', () => {
    expect(inspectZonosAccountKey('zak_live_9f2c81b4d7e6a305').plausible).toBe(true);
  });

  it('catches the mistakes that would otherwise fail silently on a real parcel', () => {
    // Canada Post simply declines to issue the Declaration ID — the parcel
    // ships with duty unpaid and nothing says why.
    expect(inspectZonosAccountKey('books@example.com').problem).toMatch(/email/i);
    expect(inspectZonosAccountKey('https://dashboard.zonos.com').problem).toMatch(/web address/i);
    expect(inspectZonosAccountKey('0rd4dpkrvc1y9').problem).toMatch(/Declaration ID/i);
    expect(inspectZonosAccountKey('abc 123 def 456 ghi').problem).toMatch(/space/i);
    expect(inspectZonosAccountKey('short').problem).toMatch(/characters/i);
  });

  it('says nothing at all when the box is empty', () => {
    expect(inspectZonosAccountKey('')).toEqual({ present: false, plausible: false, problem: '' });
  });
});

describe('Credential shape', () => {
  it('tells the two Canada Post credential systems apart', () => {
    expect(describeKeyKind('')).toBe('missing');
    expect(describeKeyKind('user:pass')).toBe('legacy-combined');
    expect(describeKeyKind('d1d36298650efe474806c94f75cfb04a')).toBe('portal-client-id');
    expect(describeKeyKind('something-else')).toBe('unrecognised');
  });

  it('compares phone numbers by their digits, not their punctuation', () => {
    expect(digitsOf('+1 (416) 555-0199')).toBe('14165550199');
    expect(digitsOf('416-555-0199')).toBe(SHIPMENT_PLACEHOLDERS.senderPhone);
  });
});

describe('A credential can be cleared again', () => {
  it('writes an emptied box through instead of keeping the stored value', () => {
    // `if (key) settings.key = key` meant deleting a wrong secret was impossible:
    // the old value stayed in Firebase and kept riding on every request while
    // the card showed an empty box.
    expect(taxcentreSrc).toMatch(/function readCredentialField/);
    expect(taxcentreSrc).toMatch(/const put = \(key, value\) => \{ if \(value !== undefined\)/);
    expect(taxcentreSrc).not.toMatch(/if \(zonosAccountKey\) TAX_CENTER\.settings\.zonosAccountKey/);
    expect(taxcentreSrc).not.toMatch(/if \(cpApiSecret\) TAX_CENTER\.settings\.cpApiSecret/);
  });

  it('will not wipe credentials from a card that was never populated', () => {
    expect(taxcentreSrc).toMatch(/if \(!el\.dataset\.hydrated\) return el\.value\.trim\(\) \|\| undefined;/);
    expect(taxcentreSrc).toMatch(/el\.dataset\.hydrated = '1';/);
  });
});

describe('The checklist is reachable and enforced in the UI', () => {
  it('has a button and a place to render on the Canada Post card', () => {
    expect(indexHtml).toContain('id="tc-cp-readiness-btn"');
    expect(indexHtml).toContain('id="cp-live-readiness"');
    expect(indexHtml).toContain('checkLiveShippingReadinessHandler()');
  });

  it('reports the Zonos Account Key verdict as it is typed', () => {
    expect(indexHtml).toContain('oninput="renderZonosAccountKeyHint()"');
    expect(indexHtml).toContain('id="tc-zonos-account-key-hint"');
  });

  it('blocks Buy Label on any readiness blocker, not just the account audit', () => {
    const card = shippingSrc.slice(
      shippingSrc.indexOf('function renderCanadaPostRatesCard'),
      shippingSrc.indexOf('async function openCanadaPostPurchasedLabel')
    );
    expect(card).toMatch(/const readiness = currentLiveReadiness\(\);/);
    expect(card).toMatch(/if \(readiness\.blockers\.length\) blockedReason = readiness\.blockers\[0\];/);
  });

  it('re-checks readiness in the handler before any dialog', () => {
    const handler = shippingSrc.slice(
      shippingSrc.indexOf('async function buyCanadaPostLabelHandler'),
      shippingSrc.indexOf('const dutyRoute = currentDutyPrepaymentRoute();')
    );
    expect(handler).toMatch(/const readiness = currentLiveReadiness\(\);/);
    expect(handler).toMatch(/if \(readiness\.blockers\.length\)/);
  });

  it('states the duty position on the purchase confirmation for a U.S. parcel', () => {
    const dialog = shippingSrc.slice(
      shippingSrc.indexOf('const destinationLine ='),
      shippingSrc.indexOf('if (!confirmed) return;')
    );
    expect(dialog).toMatch(/NOT prepaid — the customer is billed on delivery/);
    expect(dialog).toMatch(/Prepaid automatically by your Zonos Verified Account/);
  });
});

describe('The checklist answers the same from either tab', () => {
  it('falls back to the saved return address when the shipping form is unpopulated', () => {
    // The Tax Centre and the shipping form are the same document, but the
    // sender inputs are only filled in when the shipping tab is first opened.
    // Reading them raw there reports "no address" for a publisher who has one
    // saved, and sends them off to fix something that is not broken.
    const gather = shippingSrc.slice(
      shippingSrc.indexOf('function currentLiveReadiness'),
      shippingSrc.indexOf('const READINESS_ICONS')
    );
    expect(gather).toMatch(/const saved = savedShippingOrigin\(\);/);
    expect(gather).toMatch(/field\('sf-city', saved\.city\)/);
    expect(gather).toMatch(/\|\| saved\.street1/);
  });

  it('reads the saved origin defensively, since storage can throw', () => {
    const reader = shippingSrc.slice(
      shippingSrc.indexOf('function savedShippingOrigin'),
      shippingSrc.indexOf('function getShippingReconciliationOrders')
    );
    expect(reader).toMatch(/catch \(_\) \{ return ''; \}/);
  });

  it('does not put a navigation arrow inside a line already prefixed with one', () => {
    const route = resolveDutyPrepaymentRoute({ destCountry: 'US' });
    const fix = checkFor(
      assessLiveShippingReadiness({
        settings: liveSettings,
        accountAudit: auditFor(liveSettings),
        sender: goodSender,
        destination: { countryCode: 'US', phone: '6025550123' },
        dutyRoute: route,
      }),
      'duty'
    ).fix;
    expect(fix).not.toContain('→');
    expect(fix).toMatch(/Tax Centre’s Zonos section/);
  });
});
