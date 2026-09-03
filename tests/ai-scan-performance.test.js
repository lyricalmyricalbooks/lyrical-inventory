import { describe, it, expect } from 'vitest';
import { buildHarness, appSource } from './helpers/extract-decl.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Covers the scanner speed-up: the thinking budget that dominated per-scan
// latency, the shared rate-limit pause that makes a wider pool safe, the two
// upload paths that were still sending full-size phone photos, and the email
// body cap that was charging reading time for pages of newsletter footer.

const TRANSPORT_NAMES = [
  '_callGeminiForReceipts', 'GEMINI_RECEIPT_MODELS', 'GEMINI_SINGLE_ATTEMPT_BYTES',
  'GEMINI_THINKING_READ', '_geminiNoThinking', '_geminiCooldownUntil',
  '_geminiCooldownWait', '_geminiNoteThrottle', '_geminiAwaitCooldown'
];

const res = (status, body, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: k => headers[k] ?? null },
  json: async () => body
});

const good = res(200, { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"ok":1}' }] } }] });

// Real timers, deliberately: the shared cooldown is a stored promise every
// worker awaits, and a setTimeout stub that fires synchronously would make a
// pause that never actually pauses look like a passing test.
function transport(fetchImpl, { waits = [] } = {}) {
  return buildHarness({
    names: TRANSPORT_NAMES,
    deps: {
      fetch: fetchImpl,
      setTimeout: (fn, ms) => { waits.push(ms); return setTimeout(fn, Math.min(ms, 5)); },
      DOMException
    },
    returns: '_callGeminiForReceipts'
  });
}

const bodyOf = init => JSON.parse(init.body);

describe('Gemini transport — thinking budget', () => {
  it('tells the model not to think before reading a single receipt', async () => {
    // One receipt against a fixed schema is a reading job, not a reasoning
    // job. The deliberation the model does by default is pure wait time for
    // whoever is standing at the till with the phone in their hand.
    let sent = null;
    const call = transport(async (_url, init) => { sent = bodyOf(init); return good; });

    await call('k', [{ text: 'x' }]);
    expect(sent.generationConfig.thinking_config.thinking_budget).toBe(0);
  });

  it('lets a caller buy thinking back for the harder multi-receipt job', async () => {
    let sent = null;
    const call = transport(async (_url, init) => { sent = bodyOf(init); return good; });

    await call('k', [{ text: 'x' }], { thinkingBudget: 512 });
    expect(sent.generationConfig.thinking_config.thinking_budget).toBe(512);
  });

  it('drops the budget and retries the same model that rejects it', async () => {
    // A model that does not understand the control refuses the whole request
    // over that one field. Losing the scan to a speed setting would be a far
    // worse trade than the wasted round-trip.
    const seen = [];
    const call = transport(async (url, init) => {
      seen.push({ model: String(url).match(/models\/([^:]+):/)[1], body: bodyOf(init) });
      return seen.length === 1
        ? res(400, { error: { message: 'thinking_config is not supported for this model' } })
        : good;
    });

    const out = await call('k', [{ text: 'x' }]);
    expect(out.text).toBe('{"ok":1}');
    expect(seen).toHaveLength(2);
    // Same model, second time without the field it objected to.
    expect(seen[1].model).toBe(seen[0].model);
    expect(seen[0].body.generationConfig.thinking_config).toBeDefined();
    expect(seen[1].body.generationConfig.thinking_config).toBeUndefined();
  });

  it('remembers the rejection so the next scan does not pay for it again', async () => {
    const bodies = [];
    const call = transport(async (_url, init) => {
      bodies.push(bodyOf(init));
      return bodies.length === 1
        ? res(400, { error: { message: 'Unknown name "thinking_config"' } })
        : good;
    });

    await call('k', [{ text: 'x' }]);
    await call('k', [{ text: 'y' }]);
    expect(bodies).toHaveLength(3);
    // Third call is the second scan — it must not re-probe with the field.
    expect(bodies[2].generationConfig.thinking_config).toBeUndefined();
  });

  it('still reports the real failure when the retry fails for its own reason', async () => {
    // Showing "thinking_config is not supported" to the shop owner would name
    // a setting they never touched instead of the reason the receipt failed.
    const call = transport(async (_url, init) => (
      bodyOf(init).generationConfig.thinking_config
        ? res(400, { error: { message: 'thinking_config is not supported' } })
        : res(400, { error: { message: 'Invalid image data' } })
    ));

    await expect(call('k', [{ text: 'x' }])).rejects.toThrow(/Invalid image data/);
  });

  it('does not mistake an ordinary bad-payload 400 for a thinking rejection', async () => {
    let calls = 0;
    const call = transport(async () => { calls++; return res(400, { error: { message: 'Invalid image data' } }); });

    await expect(call('k', [{ text: 'x' }])).rejects.toThrow(/Invalid image/i);
    expect(calls).toBe(1); // still fatal, still one upload
  });
});

describe('Gemini transport — shared rate-limit pause', () => {
  // Returns the caller alongside a window onto the pause it publishes, so the
  // assertion is about the mechanism rather than about racing a stopwatch.
  function gated(fetchImpl) {
    return buildHarness({
      names: TRANSPORT_NAMES,
      deps: {
        fetch: fetchImpl,
        setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 5)),
        DOMException
      },
      returns: '({ call: _callGeminiForReceipts, pausedUntil: () => _geminiCooldownUntil, wait: _geminiAwaitCooldown })'
    });
  }

  it('publishes a pause the whole pool waits on when one scan is rate-limited', async () => {
    // Each worker used to back off on its own schedule, straight back into the
    // congestion window that produced the 429. That is what kept a pile of
    // receipts capped at three at a time.
    let first = true;
    const h = gated(async () => {
      if (first) { first = false; return res(429, { error: { message: 'Resource exhausted' } }); }
      return good;
    });

    expect(h.pausedUntil()).toBe(0);
    const out = await h.call('k', [{ text: 'x' }]);
    expect(out.text).toBe('{"ok":1}');
    expect(h.pausedUntil()).toBeGreaterThan(0);
  });

  it('keeps a server error to the one request that hit it', async () => {
    // A 500 is this upload's problem. Pausing every other receipt over it
    // would turn one bad response into a stall across the whole pile.
    let first = true;
    const h = gated(async () => {
      if (first) { first = false; return res(503, {}); }
      return good;
    });

    await h.call('k', [{ text: 'x' }]);
    expect(h.pausedUntil()).toBe(0);
  });

  it('does not stack a shorter pause on top of a longer one already running', async () => {
    const waits = [];
    const gate = buildHarness({
      names: TRANSPORT_NAMES,
      deps: {
        fetch: async () => good,
        setTimeout: (fn, ms) => { waits.push(ms); return setTimeout(fn, 1); },
        DOMException
      },
      returns: '({ note: _geminiNoteThrottle, wait: _geminiAwaitCooldown })'
    });

    gate.note(5000);
    gate.note(50); // a second worker's shorter backoff — already covered
    expect(waits).toEqual([5000]);
    await gate.wait();
  });

  it('actually waits, rather than resolving straight through', async () => {
    const gate = buildHarness({
      names: TRANSPORT_NAMES,
      deps: { fetch: async () => good, setTimeout, DOMException },
      returns: '({ note: _geminiNoteThrottle, wait: _geminiAwaitCooldown })'
    });

    const before = Date.now();
    gate.note(40);
    await gate.wait();
    expect(Date.now() - before).toBeGreaterThanOrEqual(30);
  });

  it('resolves immediately when nothing has been throttled', async () => {
    const gate = buildHarness({
      names: TRANSPORT_NAMES,
      deps: { fetch: async () => good, setTimeout, DOMException },
      returns: '_geminiAwaitCooldown'
    });
    const before = Date.now();
    await gate();
    expect(Date.now() - before).toBeLessThan(20);
  });
});

describe('Upload size — every path, not just the single-scan button', () => {
  it('sends emailed attachments through the same shrink as a scanned photo', () => {
    // readReceiptFiles read each attachment straight to base64. Four phone
    // photos attached to the email importer went up at full size, and past
    // the single-attempt threshold that also silently forfeited the fallback
    // chain.
    const fn = appSource.slice(appSource.indexOf('async function readReceiptFiles('));
    const body = fn.slice(0, fn.indexOf('\n}'));
    expect(body).toContain('_prepareReceiptUpload(file)');
    expect(body).not.toContain('readAsDataURL');
  });

  it('shrinks a Gmail attachment before it is uploaded to the reader', async () => {
    const calls = [];
    const shrink = buildHarness({
      names: ['_shrinkInlineAttachment', '_base64ToFile', 'RECEIPT_SCAN_SKIP_DOWNSCALE_BYTES'],
      deps: {
        atob: s => s,
        File,
        Uint8Array,
        _prepareReceiptUpload: async (file) => {
          calls.push(file.size);
          return { mime: 'image/jpeg', base64: 'small', scaled: true, bytes: 10 };
        }
      },
      returns: '_shrinkInlineAttachment'
    });

    const f = { mime: 'image/jpeg', name: 'receipt.jpg', base64: 'x'.repeat(900_000) };
    await shrink(f);
    expect(calls).toHaveLength(1);
    expect(f.scanBase64).toBe('small');
  });

  it('archives the original attachment, not the shrunk copy', async () => {
    // _saveDraftReceiptFiles files these bytes into the receipts folder. The
    // copy kept for the taxman has to be the document the vendor actually
    // sent, at full resolution and in its original format — the shrink exists
    // for the upload only.
    const shrink = buildHarness({
      names: ['_shrinkInlineAttachment', '_base64ToFile', 'RECEIPT_SCAN_SKIP_DOWNSCALE_BYTES'],
      deps: {
        atob: s => s, File, Uint8Array,
        _prepareReceiptUpload: async () => ({ mime: 'image/jpeg', base64: 'small', scaled: true, bytes: 10 })
      },
      returns: '_shrinkInlineAttachment'
    });

    const original = 'x'.repeat(900_000);
    const f = { mime: 'image/png', name: 'receipt.png', base64: original };
    await shrink(f);

    expect(f.base64).toBe(original);
    expect(f.mime).toBe('image/png'); // still matches the .png it is saved as
    expect(f.scanBase64).toBe('small');
    expect(f.scanMime).toBe('image/jpeg');
  });

  it('uploads the shrunk copy but falls back to the original', () => {
    const src = appSource.slice(appSource.indexOf('async function extractReceiptsFromEmailText'));
    expect(src).toContain('f.scanMime || f.mime');
    expect(src).toContain('f.scanBase64 || f.base64');
  });

  it('leaves a PDF attachment alone', async () => {
    let touched = false;
    const shrink = buildHarness({
      names: ['_shrinkInlineAttachment', '_base64ToFile', 'RECEIPT_SCAN_SKIP_DOWNSCALE_BYTES'],
      deps: {
        atob: s => s, File, Uint8Array,
        _prepareReceiptUpload: async () => { touched = true; return {}; }
      },
      returns: '_shrinkInlineAttachment'
    });

    const f = { mime: 'application/pdf', name: 'invoice.pdf', base64: 'x'.repeat(900_000) };
    await shrink(f);
    expect(touched).toBe(false);
    expect(f.base64).toHaveLength(900_000);
  });

  it('does not re-encode the same attachment twice across a re-read', async () => {
    let runs = 0;
    const shrink = buildHarness({
      names: ['_shrinkInlineAttachment', '_base64ToFile', 'RECEIPT_SCAN_SKIP_DOWNSCALE_BYTES'],
      deps: {
        atob: s => s, File, Uint8Array,
        _prepareReceiptUpload: async () => {
          runs++;
          return { mime: 'image/jpeg', base64: 'small', scaled: true, bytes: 10 };
        }
      },
      returns: '_shrinkInlineAttachment'
    });

    const f = { mime: 'image/jpeg', name: 'r.jpg', base64: 'x'.repeat(900_000) };
    await shrink(f);
    await shrink(f);
    expect(runs).toBe(1);
    expect(f.scanBase64).toBe('small');
  });

  it('keeps the original bytes when the attachment cannot be decoded', async () => {
    const shrink = buildHarness({
      names: ['_shrinkInlineAttachment', '_base64ToFile', 'RECEIPT_SCAN_SKIP_DOWNSCALE_BYTES'],
      deps: {
        atob: () => { throw new Error('not base64'); },
        File, Uint8Array,
        _prepareReceiptUpload: async () => ({ mime: 'image/jpeg', base64: 'small', scaled: true })
      },
      returns: '_shrinkInlineAttachment'
    });

    const f = { mime: 'image/jpeg', name: 'r.jpg', base64: 'not really base64'.repeat(60_000) };
    const before = f.base64;
    await shrink(f);
    expect(f.base64).toBe(before);
    expect(f.scanBase64).toBeUndefined();
  });
});

describe('Downscale — a long till receipt stays readable', () => {
  function uploadHarness({ bitmap, blob, canvasSpy } = {}) {
    return buildHarness({
      names: [
        '_prepareReceiptUpload', '_receiptMimeFor', '_fileToBase64', 'RECEIPT_MIME_BY_EXT',
        'RECEIPT_SCAN_MAX_EDGE', 'RECEIPT_SCAN_JPEG_QUALITY', 'RECEIPT_SCAN_SKIP_DOWNSCALE_BYTES',
        'RECEIPT_SCAN_MIN_SHORT_EDGE', 'RECEIPT_SCAN_MAX_PIXELS'
      ],
      deps: {
        FileReader,
        createImageBitmap: async () => ({ ...bitmap, close() {} }),
        document: {
          createElement: () => {
            const canvas = {
              width: 0, height: 0,
              getContext: () => ({
                fillRect() {}, drawImage() {}, set fillStyle(_v) {},
                set imageSmoothingEnabled(_v) {}, set imageSmoothingQuality(_v) {}
              }),
              toBlob: (cb, type, q) => { canvasSpy?.({ w: canvas.width, h: canvas.height, type, q }); cb(blob); }
            };
            return canvas;
          }
        }
      },
      returns: '_prepareReceiptUpload'
    });
  }

  const photo = () => new File([new Uint8Array(900_000)], 'photo.jpg', { type: 'image/jpeg' });
  const small = new Blob([new Uint8Array(30_000)], { type: 'image/jpeg' });

  it('does not squeeze the print off a tall narrow receipt', () => {
    // 800x4000 scaled by the long edge alone becomes 320x1600 — the paper
    // still fits on screen, but the printed total is now a few pixels tall and
    // the reader guesses at it.
    const seen = [];
    const prepare = uploadHarness({ bitmap: { width: 800, height: 4000 }, blob: small, canvasSpy: c => seen.push(c) });

    return prepare(photo()).then(() => {
      expect(seen[0].w).toBeGreaterThanOrEqual(800);
      expect(seen[0].h).toBeGreaterThanOrEqual(4000);
    });
  });

  it('still caps an ordinary camera photo at the long edge', async () => {
    const seen = [];
    const prepare = uploadHarness({ bitmap: { width: 4000, height: 3000 }, blob: small, canvasSpy: c => seen.push(c) });

    await prepare(photo());
    expect(seen[0].w).toBe(1600);
    expect(seen[0].h).toBe(1200);
  });

  it('never enlarges an image that is already small', async () => {
    const seen = [];
    const prepare = uploadHarness({ bitmap: { width: 240, height: 900 }, blob: small, canvasSpy: c => seen.push(c) });

    await prepare(photo());
    expect(seen[0].w).toBe(240);
    expect(seen[0].h).toBe(900);
  });

  it('holds a huge scan under the pixel ceiling', async () => {
    const seen = [];
    const prepare = uploadHarness({ bitmap: { width: 4000, height: 12_000 }, blob: small, canvasSpy: c => seen.push(c) });

    await prepare(photo());
    expect(seen[0].w * seen[0].h).toBeLessThanOrEqual(4_000_000);
  });
});

describe('Email body — pay for the receipt, not the newsletter', () => {
  const trim = () => buildHarness({
    names: ['_trimEmailBodyForScan', 'EMAIL_SCAN_BODY_HEAD', 'EMAIL_SCAN_BODY_TAIL'],
    deps: {},
    returns: '_trimEmailBodyForScan'
  });

  it('passes a normal receipt email through untouched', () => {
    const body = 'Order #4821\nTotal: $54.30\n';
    expect(trim()(body)).toBe(body);
  });

  it('keeps the end of a long email, where the total usually is', () => {
    // Cutting purely from the front threw away the one figure the scan exists
    // to find.
    const body = 'HEAD-MARKER' + 'x'.repeat(120_000) + 'GRAND TOTAL $91.14';
    const out = trim()(body);

    expect(out.length).toBeLessThan(body.length);
    expect(out).toContain('HEAD-MARKER');
    expect(out).toContain('GRAND TOTAL $91.14');
  });

  it('says where the gap is rather than splicing two halves together', () => {
    const out = trim()('a'.repeat(60_000) + 'b'.repeat(60_000));
    expect(out).toMatch(/omitted/i);
  });

  it('survives a message with no body at all', () => {
    expect(trim()(null)).toBe('');
    expect(trim()(undefined)).toBe('');
  });
});

describe('Pool width', () => {
  it('reads more receipts at once now that the pool backs off as one', () => {
    expect(appSource).toMatch(/const BATCH_SCAN_CONCURRENCY = 5;/);
    expect(appSource).toMatch(/const EMAIL_EXTRACT_CONCURRENCY = 4;/);
  });

  it('wires the email extraction to its own named width, not a bare 3', () => {
    expect(appSource).toContain('_runExtractionPool(todo, EMAIL_EXTRACT_CONCURRENCY');
  });

  it('opens the connection to the reader while the app boots', () => {
    // The owner taps "AI Scan" and waits; the TLS handshake does not need to
    // be part of that wait.
    const html = fs.readFileSync(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../index.html'),
      'utf8'
    );
    expect(html).toMatch(/rel="preconnect"[^>]*generativelanguage\.googleapis\.com/);
  });
});
