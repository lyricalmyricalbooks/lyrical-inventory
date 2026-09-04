import { describe, it, expect, beforeEach } from 'vitest';
import { buildHarness, mainJs } from './helpers/extract-decl.js';

// Covers the "✨ AI Scan" rework: the upload downscale that dominated scan
// latency, the response schema that replaced prose-only JSON instructions, and
// the field-application bugs that let a correct extraction land in the ledger
// as wrong or empty data.

const CATS = ['Software & Subscriptions', 'Shipping & Postage', 'Office Supplies', 'Other'];

function formHtml(prefix, currencies) {
  return `
    <input id="${prefix}-desc" type="text">
    <input id="${prefix}-date" type="date">
    <input id="${prefix}-amount" type="number" step="0.01">
    <select id="${prefix}-cur">${currencies.map(c => `<option value="${c}">${c}</option>`).join('')}</select>
    <select id="${prefix}-cat">${CATS.map(c => `<option>${c}</option>`).join('')}</select>
    <input id="${prefix}-ref" type="text">
    <input id="${prefix}-file" type="file">
    <button id="${prefix}-btn">✨ AI Scan</button>`;
}

// Real jsdom nodes, deliberately: the bugs under test are the browser's own
// silent coercions (a <select> ignoring an unknown value, a number input
// rejecting "1,234.56"), which a hand-rolled element stub would not reproduce.
function mountForm({ prefix = 'exp', currencies = ['CAD', 'USD', 'EUR', 'GBP'] } = {}) {
  document.body.innerHTML = formHtml(prefix, currencies);
  const fileEl = document.getElementById(`${prefix}-file`);
  Object.defineProperty(fileEl, 'files', {
    value: [new File([new Uint8Array(64)], 'receipt.jpg', { type: 'image/jpeg' })],
    configurable: true
  });
  return {
    prefix,
    el: id => document.getElementById(`${prefix}-${id}`),
    cfg: {
      fileId: `${prefix}-file`, btnId: `${prefix}-btn`,
      descId: `${prefix}-desc`, dateId: `${prefix}-date`, amountId: `${prefix}-amount`,
      curId: `${prefix}-cur`, catId: `${prefix}-cat`, refId: `${prefix}-ref`
    }
  };
}

// Harness for the full scan runner with the network and the image pipeline
// stubbed, so the assertions are about what reaches the form.
function scanHarness({ reply, prepare, apiKey = 'k-test' } = {}) {
  const toasts = [];
  const calls = [];
  return {
    toasts,
    calls,
    run: buildHarness({
      names: [
        '_runReceiptScan', '_extractReceiptFromFile', '_applyScanCurrency', '_applyScanCategory',
        '_buildReceiptScanPrompt', 'RECEIPT_SCAN_SCHEMA', 'RECEIPT_SCAN_TIMEOUT_MS',
        '_friendlyScanError'
      ],
      deps: {
        $: id => document.getElementById(id),
        showToast: (msg, type) => toasts.push({ msg, type }),
        TAX_CENTER: { settings: { geminiKey: apiKey } },
        EXPENSE_CATEGORIES: CATS,
        _prepareReceiptUpload: prepare || (async () => ({ mime: 'image/jpeg', base64: 'AAAA', scaled: true })),
        _callGeminiForReceipts: async (key, parts, opts) => {
          calls.push({ key, parts, opts });
          return typeof reply === 'function' ? reply({ key, parts, opts }) : reply;
        },
        _parseReceiptJson: text => { try { return JSON.parse(text); } catch { return {}; } },
        _parseReceiptAmount: v => {
          if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
          const n = Number(String(v ?? '').replace(/[^0-9.\-]/g, ''));
          return Number.isFinite(n) ? n : 0;
        },
        normalizeReceiptDate: s => {
          if (!s) return '';
          const t = String(s).trim();
          if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
          const d = new Date(t);
          if (isNaN(d.getTime())) return '';
          const p = n => String(n).padStart(2, '0');
          return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
        },
        inferReceiptCategory: vendor => (/post|ship/i.test(vendor || '') ? 'Shipping & Postage' : 'Other'),
        console: { error: () => {} },
        AbortController, DOMException, Event, setTimeout, clearTimeout
      },
      moduleState: 'let _receiptScanAbort = null;',
      returns: '_runReceiptScan'
    })
  };
}

const okReply = obj => ({ text: JSON.stringify(obj), model: 'gemini-3.6-flash' });

describe('AI receipt scan — field application', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('coerces a comma-grouped total instead of blanking the amount input', async () => {
    // A number input rejects "1,234.56" outright and becomes "". The old scan
    // assigned the raw model output, so a large receipt silently lost its
    // total and looked like a failed scan.
    const form = mountForm();
    const h = scanHarness({
      reply: okReply({ vendor: 'Ingram', date: '2026-03-04', amount: '1,234.56', currency: 'CAD' })
    });
    await h.run(form.cfg);

    expect(form.el('amount').value).toBe('1234.56');
    expect(form.el('amount').valueAsNumber).toBeCloseTo(1234.56, 2);
  });

  it('normalizes a human-readable date instead of blanking the date input', async () => {
    const form = mountForm();
    const h = scanHarness({
      reply: okReply({ vendor: 'Lulu', date: 'Mar 4, 2026', amount: 20, currency: 'CAD' })
    });
    await h.run(form.cfg);

    expect(form.el('date').value).toBe('2026-03-04');
  });

  it('refuses to mislabel a currency the form cannot represent', async () => {
    // The Tax Center select carries CAD/USD/EUR/GBP only. Assigning "AUD" is a
    // silent no-op in the DOM, so an Australian receipt used to be logged at
    // whatever currency was already selected — a wrong number in the ledger
    // with nothing on screen to hint at it.
    const form = mountForm({ currencies: ['CAD', 'USD', 'EUR', 'GBP'] });
    form.el('cur').value = 'CAD';
    const h = scanHarness({
      reply: okReply({ vendor: 'Booktopia', date: '2026-03-04', amount: 50, currency: 'AUD' })
    });
    await h.run(form.cfg);

    expect(form.el('cur').value).toBe('CAD');
    const warn = h.toasts.find(t => t.type === 'warn');
    expect(warn, 'an unrepresentable currency must be surfaced').toBeTruthy();
    expect(warn.msg).toContain('AUD');
  });

  it('applies a currency the form does support', async () => {
    const form = mountForm({ currencies: ['CAD', 'USD', 'EUR', 'GBP', 'AUD'] });
    const h = scanHarness({
      reply: okReply({ vendor: 'Booktopia', date: '2026-03-04', amount: 50, currency: 'aud' })
    });
    await h.run(form.cfg);

    expect(form.el('cur').value).toBe('AUD');
    expect(h.toasts.some(t => t.msg.includes('not available'))).toBe(false);
  });

  it('fills category from the enum, falling back to keyword inference', async () => {
    const form = mountForm();
    const h1 = scanHarness({
      reply: okReply({ vendor: 'Adobe', date: '2026-03-04', amount: 9, currency: 'CAD', category: 'Software & Subscriptions' })
    });
    await h1.run(form.cfg);
    expect(form.el('cat').value).toBe('Software & Subscriptions');

    const form2 = mountForm({ prefix: 'tc' });
    const h2 = scanHarness({
      reply: okReply({ vendor: 'Canada Post', date: '2026-03-04', amount: 9, currency: 'CAD', category: 'Not A Real Category' })
    });
    await h2.run(form2.cfg);
    expect(form2.el('cat').value).toBe('Shipping & Postage');
  });

  it('fires input/change so the FX preview recomputes', async () => {
    // Writing `.value` fires nothing, so both forms kept showing the previous
    // receipt's converted total until the user touched a field by hand.
    const form = mountForm();
    const seen = [];
    for (const id of ['cur', 'amount']) {
      form.el(id).addEventListener('change', () => seen.push(`${id}:change`));
      form.el(id).addEventListener('input', () => seen.push(`${id}:input`));
    }
    const h = scanHarness({
      reply: okReply({ vendor: 'Uline', date: '2026-03-04', amount: 42.5, currency: 'USD' })
    });
    await h.run(form.cfg);

    expect(seen).toContain('cur:change');
    expect(seen).toContain('amount:input');
  });

  it('reports which fields landed rather than a blanket success', async () => {
    const form = mountForm();
    const h = scanHarness({
      reply: okReply({ vendor: 'Blurb', date: 'not a date', amount: 0, currency: 'CAD' })
    });
    await h.run(form.cfg);

    const last = h.toasts[h.toasts.length - 1];
    expect(last.type).toBe('warn');
    expect(last.msg).toContain('check');
    expect(last.msg).toMatch(/amount/);
    expect(last.msg).toMatch(/date/);
  });

  it('flags a low-confidence reading', async () => {
    const form = mountForm();
    const h = scanHarness({
      reply: okReply({ vendor: 'Blur', date: '2026-03-04', amount: 12, currency: 'CAD', confidence: 0.2 })
    });
    await h.run(form.cfg);

    expect(h.toasts[h.toasts.length - 1].msg).toContain('low confidence');
  });

  it('errors clearly when nothing at all was readable', async () => {
    const form = mountForm();
    const h = scanHarness({ reply: okReply({}) });
    await h.run(form.cfg);

    expect(h.toasts[h.toasts.length - 1].type).toBe('err');
  });
});

describe('AI receipt scan — request shape', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('sends a response schema and a bounded output budget', async () => {
    // Prompt-only "return strict JSON" was the root of the fenced/preambled
    // output the old code tried to rescue with a regex.
    const form = mountForm();
    const h = scanHarness({ reply: okReply({ vendor: 'A', date: '2026-01-01', amount: 1, currency: 'CAD' }) });
    await h.run(form.cfg);

    const { opts, parts } = h.calls[0];
    expect(opts.schema).toBeTruthy();
    expect(opts.schema.required).toContain('amount');
    expect(opts.schema.properties.category.enum).toEqual(CATS);
    expect(opts.maxOutputTokens).toBeLessThanOrEqual(2048);
    expect(opts.signal).toBeTruthy();
    expect(parts[1].inline_data.mime_type).toBe('image/jpeg');
  });

  it('instructs the model to take the grand total, not the subtotal', async () => {
    const form = mountForm();
    const h = scanHarness({ reply: okReply({ vendor: 'A', date: '2026-01-01', amount: 1, currency: 'CAD' }) });
    await h.run(form.cfg);

    const prompt = h.calls[0].parts[0].text;
    expect(prompt).toMatch(/grand total/i);
    expect(prompt).toMatch(/never the subtotal/i);
    expect(prompt).toMatch(/not the due date/i);
  });
});

describe('AI receipt scan — cancellation and recovery', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('restores the button after a failure so the scan can be retried', async () => {
    // The old handler set `btn.disabled = true` and only re-enabled it on the
    // happy path's fallthrough; a throw before that left a dead button.
    const form = mountForm();
    const h = scanHarness({ reply: () => { throw new Error('boom'); } });
    await h.run(form.cfg);

    expect(form.el('btn').disabled).toBe(false);
    expect(form.el('btn').textContent).toBe('✨ AI Scan');
    expect(h.toasts[h.toasts.length - 1].type).toBe('err');
  });

  it('leaves the button clickable while scanning so a hung request can be cancelled', async () => {
    const form = mountForm();
    let release;
    const h = scanHarness({ reply: () => new Promise(r => { release = r; }) });

    const pending = h.run(form.cfg);
    await Promise.resolve();
    expect(form.el('btn').disabled).toBe(false);
    expect(form.el('btn').textContent).toMatch(/cancel/i);

    release(okReply({ vendor: 'A', date: '2026-01-01', amount: 1, currency: 'CAD' }));
    await pending;
    expect(form.el('btn').textContent).toBe('✨ AI Scan');
  });

  it('aborts the in-flight request when the button is clicked again', async () => {
    const form = mountForm();
    let captured;
    const h = scanHarness({
      reply: ({ opts }) => new Promise((_res, rej) => {
        captured = opts.signal;
        opts.signal.addEventListener('abort', () => rej(new DOMException('Aborted', 'AbortError')));
      })
    });

    const pending = h.run(form.cfg);
    await Promise.resolve();
    await h.run(form.cfg); // second click = cancel
    await pending;

    expect(captured.aborted).toBe(true);
    expect(h.calls).toHaveLength(1);
    expect(h.toasts.some(t => /cancelled/i.test(t.msg))).toBe(true);
  });

  it('requires a file and an API key before spending a request', async () => {
    document.body.innerHTML = formHtml('exp', ['CAD']);
    const cfg = { fileId: 'exp-file', btnId: 'exp-btn', descId: 'exp-desc' };
    const noFile = scanHarness({ reply: okReply({}) });
    await noFile.run(cfg);
    expect(noFile.calls).toHaveLength(0);

    const form = mountForm();
    const noKey = scanHarness({ reply: okReply({}), apiKey: '' });
    await noKey.run(form.cfg);
    expect(noKey.calls).toHaveLength(0);
    expect(noKey.toasts[0].msg).toMatch(/API Key/i);
  });
});

describe('AI receipt scan — upload preparation', () => {
  function uploadHarness({ bitmap, blob, canvasSpy } = {}) {
    return buildHarness({
      names: [
        '_prepareReceiptUpload', '_receiptMimeFor', '_fileToBase64', 'RECEIPT_MIME_BY_EXT',
        'RECEIPT_SCAN_MAX_EDGE', 'RECEIPT_SCAN_JPEG_QUALITY', 'RECEIPT_SCAN_SKIP_DOWNSCALE_BYTES',
        'RECEIPT_SCAN_MIN_SHORT_EDGE', 'RECEIPT_SCAN_MAX_PIXELS'
      ],
      deps: {
        FileReader,
        createImageBitmap: bitmap === 'throw'
          ? async () => { throw new Error('cannot decode HEIC'); }
          : async () => ({ ...bitmap, close() {} }),
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

  const bigJpeg = () => new File([new Uint8Array(400_000)], 'photo.jpg', { type: 'image/jpeg' });

  it('downscales a large photo to the long-edge cap before upload', async () => {
    // The upload dominated scan latency: a 4000x3000 capture went up raw, plus
    // ~33% for base64, and anything past the single-attempt threshold also
    // forfeited the model fallback chain.
    const seen = [];
    const prepare = uploadHarness({
      bitmap: { width: 4000, height: 3000 },
      blob: new Blob([new Uint8Array(30_000)], { type: 'image/jpeg' }),
      canvasSpy: c => seen.push(c)
    });

    const out = await prepare(bigJpeg());
    expect(out.scaled).toBe(true);
    expect(out.mime).toBe('image/jpeg');
    expect(out.bytes).toBeLessThan(400_000);
    expect(seen[0].w).toBe(1600);
    expect(seen[0].h).toBe(1200);
    expect(seen[0].type).toBe('image/jpeg');
  });

  it('falls back to the original bytes when the image cannot be decoded', async () => {
    // HEIC from an iPhone does not decode in every browser; a scan must still
    // go out rather than dying in the resize step.
    const prepare = uploadHarness({ bitmap: 'throw' });
    const out = await prepare(new File([new Uint8Array(300_000)], 'IMG_1234.HEIC', { type: '' }));

    expect(out.scaled).toBe(false);
    expect(out.mime).toBe('image/heic'); // recovered from the extension
    expect(out.base64.length).toBeGreaterThan(0);
  });

  it('keeps the original when re-encoding would be larger', async () => {
    const prepare = uploadHarness({
      bitmap: { width: 900, height: 700 },
      blob: new Blob([new Uint8Array(900_000)], { type: 'image/jpeg' })
    });
    const out = await prepare(bigJpeg());
    expect(out.scaled).toBe(false);
  });

  it('never re-encodes a PDF', async () => {
    const prepare = uploadHarness({ bitmap: { width: 10, height: 10 } });
    const out = await prepare(new File([new Uint8Array(500_000)], 'invoice.pdf', { type: 'application/pdf' }));
    expect(out.scaled).toBe(false);
    expect(out.mime).toBe('application/pdf');
  });

  it('skips the resize round-trip for an already-small file', async () => {
    let touched = false;
    const prepare = uploadHarness({
      bitmap: { width: 800, height: 600 },
      blob: new Blob([new Uint8Array(10)]),
      canvasSpy: () => { touched = true; }
    });
    const out = await prepare(new File([new Uint8Array(1000)], 'small.jpg', { type: 'image/jpeg' }));
    expect(out.scaled).toBe(false);
    expect(touched).toBe(false);
  });

  it('rejects rather than hanging when the file cannot be read', async () => {
    // `await new Promise(r => reader.onload = r)` had no error handler, so a
    // read failure left the scan pending forever with the button stuck.
    const toBase64 = buildHarness({ names: ['_fileToBase64'], deps: { FileReader }, returns: '_fileToBase64' });
    await expect(toBase64({ notAFile: true })).rejects.toBeTruthy();
  });
});

describe('Gemini transport — retry and error classification', () => {
  function callHarness(fetchImpl, waits = []) {
    return buildHarness({
      names: [
        '_callGeminiForReceipts', 'GEMINI_RECEIPT_MODELS', 'GEMINI_SINGLE_ATTEMPT_BYTES',
        'GEMINI_THINKING_READ', 'GEMINI_THINKING_MODES', '_geminiThinkingMode',
        '_geminiThinkingPatch', '_geminiCooldownUntil', 'GEMINI_FREE_TIER_MODEL',
        '_geminiUnavailable',
        '_geminiCooldownWait', '_geminiNoteThrottle', '_geminiAwaitCooldown'
      ],
      deps: {
        fetch: fetchImpl,
        setTimeout: (fn, ms) => { waits.push(ms); fn(); return 0; },
        DOMException
      },
      returns: '_callGeminiForReceipts'
    });
  }

  const res = (status, body, headers = {}) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: k => headers[k] ?? null },
    json: async () => body
  });

  const good = res(200, { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"ok":1}' }] } }] });

  it('does not re-upload the payload to other models on a rejected key', async () => {
    // Escalating only helps when the model is the problem. A bad key fails
    // identically everywhere, so probing the chain just paid for the same
    // image three times before showing the same error.
    let calls = 0;
    const call = callHarness(async () => { calls++; return res(403, { error: { message: 'API key not valid' } }); });

    await expect(call('bad-key', [{ text: 'x' }])).rejects.toThrow(/API key/i);
    expect(calls).toBe(1);
  });

  it('does not escalate a malformed-payload rejection to the other models', async () => {
    // A 400 is first walked down the thinking-control ladder on THIS model,
    // because a bare "invalid argument" cannot be told apart from a rejected
    // speed setting. Once the control is off it is fatal, and the other models
    // are never asked — that was the point: a bad payload fails identically
    // everywhere, so probing the chain just paid for the same image twice more.
    const models = [];
    const call = callHarness(async (url) => {
      models.push(String(url).match(/models\/([^:]+):/)[1]);
      return res(400, { error: { message: 'Invalid image data' } });
    });

    await expect(call('k', [{ text: 'x' }])).rejects.toThrow(/Invalid image/i);
    expect(new Set(models).size).toBe(1);
  });

  it('backs off exponentially across transient overloads', async () => {
    const waits = [];
    let calls = 0;
    const call = callHarness(async () => (++calls < 3 ? res(503, {}) : good), waits);

    const out = await call('k', [{ text: 'x' }]);
    expect(out.text).toBe('{"ok":1}');
    expect(calls).toBe(3);
    expect(waits).toHaveLength(2);
    expect(waits[1]).toBeGreaterThan(waits[0]); // grows instead of a flat 800ms
  });

  it('honours a Retry-After hint', async () => {
    const waits = [];
    let calls = 0;
    const call = callHarness(
      async () => (++calls < 2 ? res(503, {}, { 'retry-after': '3' }) : good),
      waits
    );

    await call('k', [{ text: 'x' }]);
    expect(waits[0]).toBe(3000);
  });

  it('still tries the next model when one model itself misbehaves', async () => {
    const models = [];
    const call = callHarness(async url => {
      const m = String(url).match(/models\/([^:]+):/)[1];
      models.push(m);
      return models.length === 1 ? res(200, { candidates: [{ finishReason: 'SAFETY', content: {} }] }) : good;
    });

    const out = await call('k', [{ text: 'x' }]);
    expect(out.text).toBe('{"ok":1}');
    expect(models).toHaveLength(2);
    expect(models[0]).not.toBe(models[1]);
  });
});

describe('AI scan wiring', () => {
  it('routes both scan buttons through the one shared implementation', () => {
    // The two buttons used to be near-duplicate functions with different
    // prompts (3 keys vs 4), so a fix to one silently skipped the other.
    expect(mainJs).toContain('async function scanProjectReceiptWithAI');
    expect(mainJs).toContain('async function scanReceiptWithAI');
    expect(mainJs).not.toContain('into a very strict JSON format');

    const shared = mainJs.match(/_runReceiptScan\(\{/g) || [];
    expect(shared.length).toBeGreaterThanOrEqual(2);
  });

  it('binds the real category list into the schema enum', () => {
    expect(mainJs).toMatch(/category:\s*\{\s*type:\s*'STRING',\s*enum:\s*EXPENSE_CATEGORIES\s*\}/);
  });

  it('gives the Tax Center scan access to an unsaved key in the config box', () => {
    expect(mainJs).toMatch(/keyId:\s*'tc-api-key'/);
  });
});
