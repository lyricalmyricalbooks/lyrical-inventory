import { describe, it, expect } from 'vitest';
import {
  manifestSignal,
  parseShipmentResponse,
  parseArtifactHref,
  manifestRequired,
  describeNextStep,
} from '../src/lib/canadapost-shipment.js';

// ─────────────────────────────────────────────────────────────────────────
// Why this file exists:
//
// Two things go wrong on the shipment path and both cost money rather than
// pixels. A response read too strictly reports "label purchased" with an empty
// tracking number, because one envelope key was named differently than the
// parser expected. And a label that says "manifest required" and is never
// transmitted earns a surcharge that lands on the account weeks later, long
// after anyone would connect it to a missed API call.
//
// So: read across the shapes Canada Post has actually used, and treat an
// ambiguous manifest signal as "required" — a needless manifest costs one extra
// call, a missed one costs money on every parcel it covered.
// ─────────────────────────────────────────────────────────────────────────

const labelHref =
  'https://api.canadapost-postescanada.ca/prod/devportal-portaildesdeveloppeurs/artifacts/CG42/shipping/abc-def/0';

describe('reading a created shipment', () => {
  it('reads the v8 envelope', () => {
    const result = parseShipmentResponse(JSON.stringify({
      shipmentInfo: {
        shipmentId: 'S-100',
        trackingPin: '70123456789012345',
        links: { link: [{ '@rel': 'label', '@href': labelHref }] },
      },
    }));

    expect(result.created).toBe(true);
    expect(result.shipmentId).toBe('S-100');
    expect(result.trackingPin).toBe('70123456789012345');
    expect(result.labelUrl).toBe(labelHref);
  });

  it('still reads the older envelope, so an in-flight shipment is not lost mid-migration', () => {
    const result = parseShipmentResponse(JSON.stringify({
      nonContractShipmentInfo: { shipmentId: 'S-1', trackingPin: '7012000000000001' },
    }));
    expect(result.created).toBe(true);
    expect(result.shipmentId).toBe('S-1');
  });

  it('reads links in either punctuation, since the two shapes both appear', () => {
    const atStyle = parseShipmentResponse({
      shipmentInfo: { shipmentId: 'A', links: { link: [{ '@rel': 'label', '@href': labelHref }] } },
    });
    const plainStyle = parseShipmentResponse({
      shipmentInfo: { shipmentId: 'A', links: [{ rel: 'label', href: labelHref }] },
    });
    expect(atStyle.labelUrl).toBe(labelHref);
    expect(plainStyle.labelUrl).toBe(labelHref);
  });

  it('accepts an already-parsed object as readily as a JSON string', () => {
    const asObject = parseShipmentResponse({ shipmentInfo: { trackingPin: '7012000000000002' } });
    expect(asObject.trackingPin).toBe('7012000000000002');
  });

  it('reports a body with no shipment in it as not created, rather than inventing one', () => {
    const result = parseShipmentResponse(JSON.stringify({
      messages: [{ code: '1128', description: 'Postal code is required' }],
    }));
    expect(result.created).toBe(false);
    expect(result.trackingPin).toBe('');
  });

  it('refuses a body that is not shipment data at all', () => {
    expect(() => parseShipmentResponse('')).toThrow(/no label was created/i);
    expect(() => parseShipmentResponse('<html>maintenance</html>')).toThrow(/no label was created/i);
    expect(() => parseShipmentResponse(null)).toThrow(/no label was created/i);
  });
});

describe('the artifact identifiers behind a label URL', () => {
  it('keeps the href and pulls out the durable identifiers for a later reprint', () => {
    expect(parseArtifactHref(labelHref)).toEqual({
      href: labelHref,
      consumerId: 'CG42',
      artifactId: 'abc-def',
      index: '0',
    });
  });

  it('keeps an unrecognised href usable rather than discarding it', () => {
    const odd = 'https://example.test/somewhere/else';
    expect(parseArtifactHref(odd)).toEqual({
      href: odd, consumerId: '', artifactId: '', index: '',
    });
  });

  it('has nothing to say about an empty href', () => {
    expect(parseArtifactHref('')).toBeNull();
  });
});

describe('the manifest trap', () => {
  it('believes an explicit boolean', () => {
    expect(manifestRequired({ manifestRequired: true })).toBe(true);
    expect(manifestRequired({ manifestRequired: false })).toBe(false);
    expect(manifestRequired({ shipmentInfo: { manifestRequired: true } })).toBe(true);
  });

  it('reads the string forms Canada Post also uses', () => {
    expect(manifestRequired({ manifestRequired: 'true' })).toBe(true);
    expect(manifestRequired({ requiresManifest: 'Required' })).toBe(true);
    expect(manifestRequired({ manifestRequired: 'no' })).toBe(false);
  });

  it('catches the wording printed on the label when no field says so', () => {
    expect(manifestRequired({
      shipmentInfo: { labelText: 'MANIFEST REQUIRED — transmit before deposit' },
    })).toBe(true);
  });

  // These strings are taken verbatim from a real Expedited Parcel label.
  // Canada Post ABBREVIATES and prints both languages, which the first version
  // of this check did not match — so a label reading "MANIFEST REQ" was read as
  // not required and the parcel would have shipped untransmitted.
  it('reads the abbreviated bilingual wording a real label actually carries', () => {
    expect(manifestSignal({ shipmentInfo: { labelText: 'MANIFEST NOT REQ\nMANIFESTE NON REQ' } }))
      .toBe('not-required');
    expect(manifestSignal({ shipmentInfo: { labelText: 'MANIFEST REQ' } })).toBe('required');
    expect(manifestSignal({ shipmentInfo: { labelText: 'MANIFESTE REQUIS' } })).toBe('required');
  });

  it('does not read "not required" as a requirement, in either language', () => {
    expect(manifestRequired({ shipmentInfo: { labelText: 'MANIFEST NOT REQ' } })).toBe(false);
    expect(manifestRequired({ shipmentInfo: { labelText: 'MANIFESTE NON REQUIS' } })).toBe(false);
    expect(manifestRequired({ manifestRequired: 'non requis' })).toBe(false);
  });

  it('treats an unsaid answer as required, since a needless manifest is free', () => {
    // Only an explicit no buys a clean no. A missed manifest costs money on
    // every parcel it covered; a needless one costs one extra call.
    expect(manifestSignal({ shipmentInfo: { shipmentId: 'S-1' } })).toBe('unknown');
    expect(manifestRequired({ shipmentInfo: { shipmentId: 'S-1' } })).toBe(true);
  });

  it('has nothing to require when there is no shipment at all', () => {
    expect(manifestRequired(null)).toBe(false);
  });

  it('carries the flag onto the parsed result, where the caller cannot miss it', () => {
    const result = parseShipmentResponse({
      shipmentInfo: { shipmentId: 'S-1', trackingPin: '7012000000000003' },
      manifestRequired: true,
    });
    expect(result.manifestRequired).toBe(true);
  });
});

describe('what the shop owner is told to do next', () => {
  it('names the manifest step in plain words, and why it matters', () => {
    const sentence = describeNextStep({ created: true, manifestRequired: true });
    expect(sentence).toMatch(/manifest/i);
    expect(sentence).toMatch(/surcharge/i);
    expect(sentence).not.toMatch(/API|POST|endpoint|transmitShipments/);
  });

  it('says to just print it when no manifest is needed', () => {
    const sentence = describeNextStep({ created: true, manifestRequired: false });
    expect(sentence).toMatch(/print/i);
    expect(sentence).not.toMatch(/manifest/i);
  });

  it('is honest when Canada Post did not say, rather than crying wolf', () => {
    // Warning identically on every parcel teaches the owner to ignore the
    // warning, which costs the same as never showing it on the day it is real.
    const sentence = describeNextStep({ created: true, manifestRequired: true, manifestSignal: 'unknown' });
    expect(sentence).toMatch(/did not say/i);
    expect(sentence).toMatch(/costs nothing/i);
    expect(sentence).not.toMatch(/surcharge/i);
  });

  it('reassures rather than alarms when nothing was created', () => {
    const sentence = describeNextStep({ created: false });
    expect(sentence).toMatch(/nothing was charged/i);
  });
});
