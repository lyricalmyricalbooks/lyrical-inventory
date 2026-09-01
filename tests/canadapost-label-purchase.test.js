import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { confirmDialog, normalizeConfirmArgs, htmlToPlainText } from '../src/lib/modal.js';
import {
  encodeCode128,
  generateCode128SvgBars,
  generateCanadaPostLabelSvg,
  parseCanadaPostShipmentResponse,
  parseShipmentPrice,
  fetchCanadaPostLabelArtifact,
  setLastPurchasedShipmentContext,
} from '../src/lib/canadapost.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const shippingSrc = fs.readFileSync(path.join(root, 'src/features/shipping.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

// ─────────────────────────────────────────────────────────────────────────
// Why this file exists:
//
// Pressing "Buy Label" opened a dialog that said "Are you sure? / [object
// Object] / Confirm" — the object form of confirmDialog() landed in the
// `message` parameter, so the service, the price, the recipient and the
// account all vanished from the one screen that authorises spending money.
// Behind it sat three more problems in the same flow: the label the app then
// printed was its own drawing with a decorative barcode rather than the PDF
// Canada Post returns, "Sandbox Test Mode" promised nothing would be charged
// while addressing the live gateway, and Buy Label was offered beside prices
// the app had guessed offline.
// ─────────────────────────────────────────────────────────────────────────

describe('Buy-label confirmation actually says what is being bought', () => {
  const mountConfirmModal = () => {
    const body = indexHtml.match(/<div class="overlay" id="m-confirm"[\s\S]*?\n<\/div>/);
    document.body.innerHTML = body ? body[0] : '';
  };

  beforeEach(() => { mountConfirmModal(); });
  afterEach(() => { document.body.innerHTML = ''; });

  it('renders the object call shape instead of printing [object Object]', async () => {
    const pending = confirmDialog({
      title: 'Buy this Canada Post label?',
      message: 'Service: Tracked Packet - USA\nPrice: $12.32 CAD',
      confirmText: 'Buy Label · $12.32 CAD',
      cancelText: 'Cancel',
    });

    expect(document.getElementById('m-confirm-body').textContent).not.toContain('[object Object]');
    expect(document.getElementById('m-confirm-body').textContent).toContain('Tracked Packet - USA');
    expect(document.getElementById('m-confirm-body').textContent).toContain('$12.32 CAD');
    expect(document.getElementById('m-confirm-title').textContent).toBe('Buy this Canada Post label?');
    expect(document.getElementById('m-confirm-ok').textContent).toBe('Buy Label · $12.32 CAD');

    document.getElementById('m-confirm-cancel').click();
    await expect(pending).resolves.toBe(false);
  });

  it('keeps the positional call shape every other dialog in the app uses', async () => {
    const pending = confirmDialog('Discard your unsaved changes?', {
      okLabel: 'Discard',
      cancelLabel: 'Keep editing',
      danger: true,
    });

    expect(document.getElementById('m-confirm-body').textContent).toBe('Discard your unsaved changes?');
    expect(document.getElementById('m-confirm-ok').textContent).toBe('Discard');
    expect(document.getElementById('m-confirm-ok').classList.contains('danger-btn')).toBe(true);

    document.getElementById('m-confirm-ok').click();
    await expect(pending).resolves.toBe(true);
  });

  it('flattens markup rather than printing tags in the body text node', () => {
    expect(htmlToPlainText('Buy <strong>Xpresspost</strong> for <strong>$22.88</strong>?'))
      .toBe('Buy Xpresspost for $22.88?');
    expect(htmlToPlainText('One<br><br>Two')).toBe('One\n\nTwo');
    expect(htmlToPlainText('Plain text, no markup')).toBe('Plain text, no markup');
  });

  it('lets an explicit option override one carried on the object', () => {
    const args = normalizeConfirmArgs({ message: 'Hi', okLabel: 'A' }, { okLabel: 'B' });
    expect(args.okLabel).toBe('B');
  });

  it('renders detail rows as an aligned table above the prose', () => {
    const pending = confirmDialog('This charges your live Canada Post account.', {
      title: 'Buy this Canada Post label?',
      details: [['Service', 'Tracked Packet - USA'], ['Price', '$12.32 CAD (quoted)']],
      okLabel: 'Buy',
    });

    const body = document.getElementById('m-confirm-body');
    const rows = [...body.querySelectorAll('.confirm-details dt')].map(dt => dt.textContent);
    const values = [...body.querySelectorAll('.confirm-details dd')].map(dd => dd.textContent);
    expect(rows).toEqual(['Service', 'Price']);
    expect(values).toEqual(['Tracked Packet - USA', '$12.32 CAD (quoted)']);
    // The caution keeps the body font rather than being dragged into the table.
    expect(body.querySelector('.confirm-message').textContent)
      .toBe('This charges your live Canada Post account.');

    document.getElementById('m-confirm-cancel').click();
    return expect(pending).resolves.toBe(false);
  });

  it('puts a value carrying markup in as text, never as HTML', () => {
    const pending = confirmDialog('ok', { details: [['Ship to', '<img src=x onerror=alert(1)>']] });
    const dd = document.querySelector('#m-confirm-body .confirm-details dd');
    expect(dd.querySelector('img')).toBeNull();
    expect(dd.textContent).toBe('<img src=x onerror=alert(1)>');
    document.getElementById('m-confirm-cancel').click();
    return expect(pending).resolves.toBe(false);
  });

  it('names the service, price, destination and account on the purchase dialog', () => {
    // The confirmation is assembled in the handler, so assert against its source:
    // these four facts are what make the spend reviewable.
    const dialog = shippingSrc.slice(
      shippingSrc.indexOf('const destinationLine ='),
      shippingSrc.indexOf('if (!confirmed) return;')
    );
    expect(dialog).toMatch(/\['Service', serviceName\]/);
    expect(dialog).toMatch(/\['Ship to', shipTo\]/);
    expect(dialog).toMatch(/\['Price',/);
    expect(dialog).toMatch(/\['Account', `Canada Post \$\{audit\.customerNumber/);
    // And it must not slip back into the shape that produced [object Object].
    expect(dialog).not.toMatch(/confirmDialog\(\s*\{/);
  });
});

describe('The printed barcode encodes the tracking number', () => {
  // Independent decoder: rebuild the pattern table, split the module string
  // back into symbols and read them. A barcode that cannot be read back is a
  // barcode a scanner at the counter cannot read either.
  const PATTERNS = [
    '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
    '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
    '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
    '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
    '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
    '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
    '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
    '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
    '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
    '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
    '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
  ];
  const toModules = (widths) => {
    let out = '', bar = true;
    for (const w of widths) { out += (bar ? '1' : '0').repeat(Number(w)); bar = !bar; }
    return out;
  };
  const BY_MODULES = new Map(PATTERNS.map((w, i) => [toModules(w), i]));

  const decode = (modules) => {
    const codes = [];
    for (let i = 0; i < modules.length;) {
      const len = (modules.length - i === 13) ? 13 : 11;
      const value = BY_MODULES.get(modules.slice(i, i + len));
      if (value === undefined) return null;
      codes.push(value);
      i += len;
    }
    const stop = codes.pop();
    const checksum = codes.pop();
    let running = codes[0];
    for (let i = 1; i < codes.length; i++) running += codes[i] * i;
    if (stop !== 106 || running % 103 !== checksum) return null;

    const start = codes.shift();
    if (start === 105) return codes.map(c => String(c).padStart(2, '0')).join('');
    if (start === 104) return codes.map(c => String.fromCharCode(c + 32)).join('');
    return null;
  };

  it('round-trips a 16-digit tracking PIN through Set C', () => {
    const encoded = encodeCode128('7012345678901234');
    expect(encoded).not.toBeNull();
    expect(decode(encoded.modules)).toBe('7012345678901234');
  });

  it('round-trips an odd-length PIN and an alphanumeric reference through Set B', () => {
    expect(decode(encodeCode128('70123456789012345').modules)).toBe('70123456789012345');
    expect(decode(encodeCode128('ORD-2026').modules)).toBe('ORD-2026');
  });

  it('refuses to draw bars it cannot encode rather than inventing a pattern', () => {
    expect(encodeCode128('')).toBeNull();
    expect(encodeCode128('naïve')).toBeNull();
    expect(generateCode128SvgBars('')).toBe('');
  });

  it('draws a quiet zone so a scanner can lock onto the symbol', () => {
    const bars = generateCode128SvgBars('7012345678901234', { x: 0, width: 640, height: 110 });
    const firstX = parseFloat(bars.match(/x="([\d.]+)"/)[1]);
    expect(bars).toContain('<rect');
    expect(firstX).toBeGreaterThan(0);
  });

  it('strips the display separators so spacing does not change the payload', () => {
    expect(generateCode128SvgBars('7012 3456 7890 1234'))
      .toBe(generateCode128SvgBars('7012345678901234'));
  });
});

describe('The drawn label is marked as a reference copy, not postage', () => {
  const svg = generateCanadaPostLabelSvg({
    serviceCode: 'USA.TP',
    trackingPin: '7012345678901234',
    sender: { name: 'Lyricalmyrical Books', postalCode: 'M4B 1B3' },
    destination: { name: 'Jane Doe', city: 'Bisbee', state: 'AZ', postalCode: '85603', countryCode: 'US' },
    customerNumber: '0001298882',
  });

  it('says on its face that it cannot be mailed', () => {
    expect(svg).toContain('NOT VALID FOR MAILING');
    expect(svg).toContain('REFERENCE COPY');
  });

  it('no longer claims postage has been paid', () => {
    // The indicia box was the one element that made this sheet look like real
    // postage; a "POSTAGE PAID / PORT PAYÉ" stamp is exactly what gets a parcel
    // taken to the counter and refused.
    expect(svg).not.toContain('POSTAGE PAID');
    expect(svg).not.toContain('PORT PAYÉ');
  });

  it('still carries the shipment details it is used to check', () => {
    expect(svg).toContain('JANE DOE');
    expect(svg).toContain('85603');
  });
});

describe('The official Canada Post label is fetched, and told apart from ours', () => {
  const creds = { apiKey: 'client-id', apiSecret: 'client-secret' };
  const context = {
    trackingPin: '7012345678901234',
    labelUrl: 'https://api.canadapost-postescanada.ca/rs/artifact/abc/10000/0',
    sender: { name: 'Lyricalmyrical Books' },
    destination: { name: 'Jane Doe', countryCode: 'US' },
  };

  beforeEach(() => {
    setLastPurchasedShipmentContext(null);
    localStorage.clear?.();
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns the real PDF as mailable when a proxy serves it', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/pdf' },
      blob: async () => new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])], { type: 'application/pdf' }),
    });

    const artifact = await fetchCanadaPostLabelArtifact({ ...creds, shipmentContext: context });
    expect(artifact.kind).toBe('pdf');
    expect(artifact.mailable).toBe(true);
    expect(artifact.blob.type).toBe('application/pdf');
  });

  it('falls back to our drawing but flags it as NOT mailable, with a reason', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'));

    const artifact = await fetchCanadaPostLabelArtifact({ ...creds, shipmentContext: context });
    expect(artifact.kind).toBe('svg');
    expect(artifact.mailable).toBe(false);
    expect(artifact.reason).toBeTruthy();
  });

  it('does not chase an artifact for a simulated shipment', async () => {
    global.fetch = vi.fn();
    const artifact = await fetchCanadaPostLabelArtifact({
      ...creds,
      shipmentContext: { ...context, labelUrl: 'local://canadapost/label/7012000011112222' },
    });
    expect(artifact.kind).toBe('svg');
    expect(artifact.mailable).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns nothing at all rather than a stand-in when no shipment is known', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'));
    expect(await fetchCanadaPostLabelArtifact({ ...creds, labelUrl: '', shipmentContext: null })).toBeNull();
  });

  it('never puts the secret in a URL on any hop', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'));
    await fetchCanadaPostLabelArtifact({
      apiKey: 'client-id',
      apiSecret: 'super-secret-password',
      shipmentContext: context,
    });
    for (const call of global.fetch.mock.calls) {
      expect(String(call[0])).not.toContain('super-secret-password');
    }
  });
});

describe('The ledger records what Canada Post charged, not what was quoted', () => {
  it('reads the postage rate off the shipment response', () => {
    const parsed = parseCanadaPostShipmentResponse(JSON.stringify({
      nonContractShipmentInfo: {
        shipmentId: '406951321983787352',
        trackingPin: '70123456789012345',
        shipmentPrice: {
          baseAmount: '11.20',
          gstAmount: '0.56',
          hstAmount: '0',
          pstAmount: '0',
          dueAmount: '11.76',
        },
        links: { link: [{ '@rel': 'label', '@href': 'https://api.canadapost-postescanada.ca/rs/artifact/a/1/0' }] },
      },
    }));

    expect(parsed.postageCharged).toBe(11.76);
    expect(parsed.postageBase).toBe(11.2);
    expect(parsed.postageTaxes).toBe(0.56);
    expect(parsed.labelUrl).toBe('https://api.canadapost-postescanada.ca/rs/artifact/a/1/0');
  });

  it('reports nothing when Canada Post did not price the shipment, so the quote stands', () => {
    expect(parseShipmentPrice({})).toEqual({});
    expect(parseShipmentPrice({ shipmentPrice: { dueAmount: '0' } })).toEqual({});
    expect(parseShipmentPrice({ shipmentPrice: { dueAmount: 'n/a' } })).toEqual({});
  });

  it('posts the charged figure, not the quote, to the order and the expense', () => {
    const handler = shippingSrc.slice(
      shippingSrc.indexOf('const chargedPrice ='),
      shippingSrc.indexOf('// Display purchased label panel in card')
    );
    expect(handler).toMatch(/histItem\.postagePaid = chargedPrice;/);
    expect(handler).toMatch(/amount: chargedPrice,/);
    expect(handler).not.toMatch(/amount: quotedPrice,/);
  });
});

describe('Buy Label is only offered when the price and the account are real', () => {
  it('counts the integration being switched off as an offline estimate', () => {
    const handler = shippingSrc.slice(
      shippingSrc.indexOf('async function calculateCanadaPostRatesHandler'),
      shippingSrc.indexOf('function renderCanadaPostRatesCard')
    );
    expect(handler).toMatch(/isOffline: !apiKey \|\| !apiSecret \|\| !isEnabled \|\| !navigator\.onLine/);
  });

  it('disables the button and states the reason on the card', () => {
    const card = shippingSrc.slice(
      shippingSrc.indexOf('function renderCanadaPostRatesCard'),
      shippingSrc.indexOf('async function openCanadaPostPurchasedLabel')
    );
    expect(card).toMatch(/let blockedReason = '';/);
    expect(card).toMatch(/const canBuy = !blockedReason;/);
    expect(card).toMatch(/\$\{canBuy \? '' : 'disabled aria-disabled="true"'\}/);
    expect(card).toMatch(/cp-buy-blocked/);
  });

  it('re-checks the same conditions in the handler before spending anything', () => {
    const handler = shippingSrc.slice(
      shippingSrc.indexOf('async function buyCanadaPostLabelHandler'),
      shippingSrc.indexOf('const dutyRoute = currentDutyPrepaymentRoute();')
    );
    expect(handler).toMatch(/if \(!isEnabled\)/);
    expect(handler).toMatch(/if \(!audit\.ok\)/);
    expect(handler).toMatch(/navigator\.onLine === false/);
  });

  it('refuses a second purchase while the first is still running', () => {
    expect(shippingSrc).toMatch(/if \(_cpPurchaseInFlight\)/);
    expect(shippingSrc).toMatch(/setCanadaPostPurchaseBusy\(true, buttonEl\);/);
    // The unlock has to be in a finally, or a failed purchase locks the screen.
    expect(shippingSrc).toMatch(/\} finally \{\r?\n\s+setCanadaPostPurchaseBusy\(false, buttonEl\);/);
  });
});

describe('The label inspector never invents a shipment', () => {
  it('has no hard-coded stand-in tracking number left in it', () => {
    const modal = shippingSrc.slice(
      shippingSrc.indexOf('async function showCanadaPostLabelModal'),
      shippingSrc.indexOf('function closeCanadaPostLabelModal')
    );
    expect(modal).not.toMatch(/7012 3456 7890 1234/);
    expect(modal).not.toMatch(/123 Destination Way/);
    expect(modal).toMatch(/if \(!context\)/);
  });

  it('prints a real PDF from its own frame so the page geometry survives', () => {
    const print = shippingSrc.slice(
      shippingSrc.indexOf('function printCanadaPostLabelModal'),
      shippingSrc.indexOf('function downloadCanadaPostLabelModal')
    );
    expect(print).toMatch(/cp-label-frame/);
    expect(print).toMatch(/contentWindow\.print\(\)/);
  });

  it('names a downloaded reference copy so it is not filed as the real label', () => {
    const download = shippingSrc.slice(shippingSrc.indexOf('function downloadCanadaPostLabelModal'));
    expect(download).toMatch(/canadapost-REFERENCE-COPY-/);
    expect(download).toMatch(/canadapost-label-\$\{pin\}\.pdf/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// A sandbox run has to reach the end.
//
// It used to stop at a dead end: the handler saw `isSimulated` and returned
// before the order, the ledger, the archive or the label modal were touched.
// So the half of the flow a test run exists to rehearse was never rehearsed,
// and the screen said "nothing was purchased" without saying what to do next.
// Now it completes, and every record it writes is stamped as a test.
// ─────────────────────────────────────────────────────────────────────────
describe('a sandbox run completes the whole flow, marked as a test', () => {
  const purchaseHandler = shippingSrc.slice(
    shippingSrc.indexOf('const isSim = !!result.isSimulated;'),
    shippingSrc.indexOf('// Open the label straight away')
  );

  it('has no early return that skips the rest of the purchase flow', () => {
    expect(purchaseHandler).not.toMatch(/if \(result\.isSimulated\)/);
    expect(purchaseHandler.slice(0, purchaseHandler.indexOf('if (result.trackingPin'))).not.toMatch(/\breturn;/);
  });

  it('marks the order so a practice number is never read out as a real one', () => {
    expect(purchaseHandler).toMatch(/histItem\.simulated = isSim;/);
    expect(purchaseHandler).toMatch(/histItem\.trackingSimulated = isSim;/);
  });

  it('marks the postage entry on the row, not only in its wording', () => {
    expect(purchaseHandler).toMatch(/simulated: isSim,/);
    expect(purchaseHandler).toMatch(/SANDBOX TEST — not a real charge/);
  });

  it('says test rather than purchased on screen, and never claims a charge', () => {
    expect(purchaseHandler).toMatch(/Test label created/);
    expect(purchaseHandler).toMatch(/nothing was bought and nothing was charged/);
    expect(purchaseHandler).toMatch(/will not scan/);
  });
});

describe('label creation refuses to guess a Canada Post endpoint', () => {
  it('sends a purchase to the endpoint registry rather than building a path inline', async () => {
    const libSrc = fs.readFileSync(path.join(root, 'src/lib/canadapost.js'), 'utf8');
    expect(libSrc).toMatch(/resolveShipmentEndpoint\(\{/);
    // The retired path shape must not reappear as a live call site.
    expect(libSrc).not.toMatch(/\$\{[^}]*baseUrl\}\/rs\//);
  });

  it('completes a sandbox purchase without a network call when nothing is configured', async () => {
    const { buyCanadaPostLabel } = await import('../src/lib/canadapost.js');
    const { configureCanadaPostShippingApi } = await import('../src/lib/canadapost-endpoints.js');
    configureCanadaPostShippingApi(null);

    global.fetch = vi.fn().mockRejectedValue(new Error('should never be called'));

    const result = await buyCanadaPostLabel({
      serviceCode: 'DOM.EP',
      destination: { countryCode: 'CA', postalCode: 'V6B2W9', address1: '1 Main St', city: 'Vancouver' },
      parcel: { weightKg: 0.5 },
      apiKey: 'key', apiSecret: 'secret', customerNumber: '0001298882',
      isTest: true,
    });

    expect(result.isSimulated).toBe(true);
    expect(result.trackingPin).toBeTruthy();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
