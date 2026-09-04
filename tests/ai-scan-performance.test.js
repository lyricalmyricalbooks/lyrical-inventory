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
  'GEMINI_THINKING_READ', 'GEMINI_THINKING_MODES', '_geminiThinkingMode',
  '_geminiThinkingPatch', '_geminiCooldownUntil', 'GEMINI_FREE_TIER_MODEL',
  '_geminiUnavailable', '_geminiModelChain',
  '_readGeminiModelCache', 'GEMINI_MODEL_CACHE_KEY', 'GEMINI_CHAIN_MAX',
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

  it('recovers from the bare rejection that broke the scanner in production', async () => {
    // The reported failure, exactly: a model that will not take a token budget
    // answers 400 with "Request contains an invalid argument" and names no
    // field at all. There is nothing in that text to match on, so the fallback
    // cannot be driven by reading the message — it has to step down and retry
    // on the status alone.
    const seen = [];
    const call = transport(async (url, init) => {
      const body = bodyOf(init);
      seen.push({ model: String(url).match(/models\/([^:]+):/)[1], cfg: body.generationConfig.thinking_config });
      return body.generationConfig.thinking_config?.thinking_budget !== undefined
        ? res(400, { error: { message: 'Request contains an invalid argument.' } })
        : good;
    });

    const out = await call('k', [{ text: 'x' }]);
    expect(out.text).toBe('{"ok":1}');
    // Same model throughout — the image is never re-uploaded to the others.
    expect(new Set(seen.map(s => s.model)).size).toBe(1);
    expect(seen[0].cfg).toEqual({ thinking_budget: 0 });
    expect(seen[1].cfg).toEqual({ thinking_level: 'low' });
  });

  it('falls all the way back to no thinking control at all', async () => {
    const seen = [];
    const call = transport(async (_url, init) => {
      const cfg = bodyOf(init).generationConfig.thinking_config;
      seen.push(cfg);
      return cfg ? res(400, { error: { message: 'Request contains an invalid argument.' } }) : good;
    });

    const out = await call('k', [{ text: 'x' }]);
    expect(out.text).toBe('{"ok":1}');
    expect(seen).toHaveLength(3);
    expect(seen[2]).toBeUndefined(); // the shape that predates the speed-up
  });

  it('remembers what worked so the next scan goes straight there', async () => {
    const seen = [];
    const call = transport(async (_url, init) => {
      const cfg = bodyOf(init).generationConfig.thinking_config;
      seen.push(cfg);
      return cfg?.thinking_budget !== undefined
        ? res(400, { error: { message: 'Request contains an invalid argument.' } })
        : good;
    });

    await call('k', [{ text: 'x' }]);
    await call('k', [{ text: 'y' }]);
    expect(seen).toHaveLength(3);
    // Second scan is one call, and it opens at the level that worked.
    expect(seen[2]).toEqual({ thinking_level: 'low' });
  });

  it('reports the real failure once the control is off and it still fails', async () => {
    // Showing a complaint about a speed setting would name something the shop
    // owner never touched instead of the reason the receipt failed.
    const call = transport(async (_url, init) => (
      bodyOf(init).generationConfig.thinking_config
        ? res(400, { error: { message: 'Request contains an invalid argument.' } })
        : res(400, { error: { message: 'Invalid image data' } })
    ));

    await expect(call('k', [{ text: 'x' }])).rejects.toThrow(/Invalid image data/);
  });

  it('does not re-upload a bad payload to the other models', async () => {
    // The ladder is bounded to the one model. A corrupt file must not be paid
    // for nine times.
    const models = [];
    const call = transport(async (url) => {
      models.push(String(url).match(/models\/([^:]+):/)[1]);
      return res(400, { error: { message: 'Invalid image data' } });
    });

    await expect(call('k', [{ text: 'x' }])).rejects.toThrow(/Invalid image/i);
    expect(new Set(models).size).toBe(1);
    expect(models).toHaveLength(3); // budget, level, off — then it stops
  });

  it('does not record a mode when the request failed for its own reason', async () => {
    // Walking the ladder over a corrupt file must not leave the model marked
    // as one that cannot think — that would cost every later scan in the
    // session its speed-up to explain a failure it had nothing to do with.
    const seen = [];
    let bad = true;
    const call = transport(async (_url, init) => {
      const cfg = bodyOf(init).generationConfig.thinking_config;
      seen.push(cfg);
      if (bad) return res(400, { error: { message: 'Invalid image data' } });
      return good;
    });

    await expect(call('k', [{ text: 'x' }])).rejects.toThrow(/Invalid image/i);
    seen.length = 0;
    bad = false;

    await call('k', [{ text: 'a good one' }]);
    expect(seen[0]).toEqual({ thinking_budget: 0 }); // still opens at the fastest
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

describe('Scan errors the shop owner can act on', () => {
  const friendly = (nav) => buildHarness({
    names: ['_friendlyScanError'],
    deps: { navigator: nav === undefined ? { onLine: true } : nav },
    returns: '_friendlyScanError'
  });

  it('turns the reader\'s own words into something to actually do', () => {
    // This is the message that was on screen when the scanner broke. On its
    // own it tells the owner nothing about the file, the key, or what to try.
    const out = friendly()(new Error('Request contains an invalid argument.'));
    expect(out).not.toMatch(/invalid argument/i);
    expect(out).toMatch(/photo|PDF/i);
  });

  it('points a rejected key at the setting that fixes it', () => {
    expect(friendly()(new Error('API key not valid. Please pass a valid API key.')))
      .toMatch(/key.*config/i);
  });

  it('tells the owner to wait when the reader is over its limit', () => {
    expect(friendly()(new Error('Resource has been exhausted (e.g. check quota).')))
      .toMatch(/wait/i);
  });

  it('leads with being offline, whatever the underlying error said', () => {
    // On a market floor with no signal this is the only fact that matters, and
    // the network error underneath it is usually unreadable anyway.
    expect(friendly({ onLine: false })(new Error('Failed to fetch')))
      .toMatch(/offline/i);
  });

  it('keeps an unrecognised message rather than inventing a cause', () => {
    expect(friendly()(new Error('Something nobody has seen before')))
      .toBe('Something nobody has seen before');
  });

  it('trims a wall of API text so it cannot push the toast off screen', () => {
    const out = friendly()(new Error('z'.repeat(500)));
    expect(out.length).toBeLessThanOrEqual(120);
  });

  it('always says something, even for an error with no message', () => {
    expect(friendly()(new Error(''))).toBeTruthy();
    expect(friendly()(undefined)).toBeTruthy();
  });

  it('is what the scan screens actually show', () => {
    // The raw message used to go straight into the toast.
    expect(appSource).not.toContain('AI extraction failed: ${e.message');
    expect(appSource).not.toContain('AI scan failed: ${e.message');
    expect(appSource).toContain('_friendlyScanError(e)');
  });
});

describe('Reader chain — newest first, and never one that bills', () => {
  it('asks the newest reader first and steps down from there', () => {
    const list = appSource.match(/const GEMINI_RECEIPT_MODELS = \[[^\]]+\];/)[0];
    expect(list).toContain("'gemini-3.8-flash'");
    expect(list).toContain("'gemini-3.7-flash'");
    expect(list).toContain("'gemini-3.6-flash'");
    expect(list.indexOf('3.8')).toBeLessThan(list.indexOf('3.7'));
    expect(list.indexOf('3.7')).toBeLessThan(list.indexOf('3.6'));
  });

  it('has nothing in the chain that would be billed', () => {
    // Flash and Flash-Lite have a free allowance. Pro and Ultra do not, and one
    // call to either is charged to whatever card is on the Google account.
    const list = appSource.match(/const GEMINI_RECEIPT_MODELS = \[[^\]]+\];/)[0];
    const models = list.match(/'([^']+)'/g).map(m => m.slice(1, -1));
    expect(models.length).toBeGreaterThan(0);
    models.forEach(m => {
      expect(m, `${m} has no free tier`).toMatch(/-flash(-lite)?$/);
      expect(m).not.toMatch(/pro|ultra/i);
    });
  });

  it('refuses to call a billed model even if one reaches the list', async () => {
    // The list is a constant someone edits by hand. The gate is enforced where
    // the call is actually made, so an expensive model added by mistake cannot
    // quietly start costing money.
    const gate = buildHarness({
      names: ['GEMINI_FREE_TIER_MODEL'],
      deps: {},
      returns: 'GEMINI_FREE_TIER_MODEL'
    });
    expect(gate.test('gemini-3.8-flash')).toBe(true);
    expect(gate.test('gemini-3.8-flash-lite')).toBe(true);
    expect(gate.test('gemini-3.8-pro')).toBe(false);
    expect(gate.test('gemini-3.8-ultra')).toBe(false);
  });

  it('stops the whole chain the moment a reader says it would be billed', async () => {
    // Walking further down the chain in that state is exactly how something
    // meant to be free quietly starts spending.
    const models = [];
    const call = transport(async (url) => {
      models.push(String(url).match(/models\/([^:]+):/)[1]);
      return res(400, { error: { message: 'This model requires a paid tier. Enable billing to continue.' } });
    });

    await expect(call('k', [{ text: 'x' }])).rejects.toThrow(/paid tier/i);
    expect(new Set(models).size).toBe(1); // never asked the next reader
  });

  it('does not keep paying to be told a reader is unavailable', async () => {
    // A model not yet enabled on the key answers 404. Re-uploading the whole
    // receipt on every future scan just to hear that again is metered requests
    // spent for nothing.
    const models = [];
    const call = transport(async (url) => {
      const m = String(url).match(/models\/([^:]+):/)[1];
      models.push(m);
      return m.includes('3.8') ? res(404, { error: { message: 'model not found' } }) : good;
    });

    await call('k', [{ text: 'x' }]);
    expect(models).toEqual(['gemini-3.8-flash', 'gemini-3.7-flash']);

    models.length = 0;
    await call('k', [{ text: 'y' }]);
    expect(models).toEqual(['gemini-3.7-flash']); // straight to the one that works
  });

  it('tries everything again rather than bricking when all were refused', async () => {
    // A refusal can be temporary — an outage, a key still propagating. Being
    // permanently unable to scan would be a far worse outcome than one wasted
    // request.
    let refuse = true;
    const models = [];
    const call = transport(async (url) => {
      models.push(String(url).match(/models\/([^:]+):/)[1]);
      return refuse ? res(404, { error: { message: 'model not found' } }) : good;
    });

    await expect(call('k', [{ text: 'x' }])).rejects.toBeTruthy();
    refuse = false;
    models.length = 0;

    const out = await call('k', [{ text: 'y' }]);
    expect(out.text).toBe('{"ok":1}');
    expect(models[0]).toBe('gemini-3.8-flash'); // back to the newest
  });

  it('names the money in plain words when a reader is not free', () => {
    const friendly = buildHarness({
      names: ['_friendlyScanError'],
      deps: { navigator: { onLine: true } },
      returns: '_friendlyScanError'
    });
    const out = friendly(new Error('This model requires a paid tier.'));
    expect(out).toMatch(/not free/i);
    expect(out).toMatch(/nothing was charged/i);
  });

  it('tells the owner to wait, not to pay, when the free allowance runs out', () => {
    const friendly = buildHarness({
      names: ['_friendlyScanError'],
      deps: { navigator: { onLine: true } },
      returns: '_friendlyScanError'
    });
    const out = friendly(new Error('Resource has been exhausted (e.g. check quota).'));
    expect(out).toMatch(/free/i);
    expect(out).toMatch(/wait/i);
  });
});
