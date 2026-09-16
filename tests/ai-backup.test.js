import { describe, it, expect, vi } from 'vitest';
import * as router from '../src/lib/openrouter-chat.js';
import { buildHarness } from './helpers/extract-decl.js';

const good = () => ({ ok: true, status: 200, json: async () => ({ model: 'selected/model', choices: [{ message: { content: '{"total":12}' }, finish_reason: 'stop' }] }) });

describe('backup AI requests', () => {
  it('reports provider errors carried inside HTTP 200 responses', async () => {
    await expect(router.runOpenRouterTurn({ apiKey: 'b', model: 'm', userText: 'hello', fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ error: { code: 402, message: 'Key limit exceeded' } }) }) }))
      .rejects.toMatchObject({ status: 402, message: 'Key limit exceeded' });
  });

  it('sends images, PDF files and the receipt schema to OpenRouter', async () => {
    const fetchImpl = vi.fn(async () => good());
    expect(typeof router.runOpenRouterRead).toBe('function');
    const out = await router.runOpenRouterRead({ apiKey: 'b', parts: [{ text: 'Read the receipt' }, { inline_data: { mime_type: 'image/jpeg', data: 'aA==' } }, { inlineData: { mimeType: 'application/pdf', data: 'cA==' } }], schema: { type: 'OBJECT', properties: { total: { type: 'NUMBER' } } }, fetchImpl });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer b');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('openrouter/free');
    expect(body.messages[0].content).toContainEqual({ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,aA==' } });
    expect(body.messages[0].content).toContainEqual({ type: 'file', file: { filename: 'document.pdf', file_data: 'data:application/pdf;base64,cA==' } });
    expect(body.response_format.json_schema.schema.properties.total.type).toBe('number');
    expect(out).toMatchObject({ text: '{"total":12}', model: 'selected/model', via: 'openrouter' });
  });
});

describe('receipt fallback', () => {
  function reader(primary, settings = { geminiKey: 'g', openRouterKey: 'b' }) {
    const backup = vi.fn(async () => ({ text: '{"total":12}', via: 'openrouter' }));
    const call = buildHarness({ names: ['_callAiForReceipts'], deps: { TAX_CENTER: { settings }, _callGeminiForReceipts: primary, runOpenRouterRead: backup, friendlyOpenRouterError: router.friendlyOpenRouterError }, returns: '_callAiForReceipts' });
    return { call, backup };
  }
  it('retries the same receipt with the saved backup after quota exhaustion', async () => {
    const h = reader(async () => { throw Object.assign(new Error('Quota exceeded'), { status: 429 }); });
    const parts = [{ text: 'receipt' }];
    expect((await h.call('g', parts)).via).toBe('openrouter');
    expect(h.backup).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'b', parts }));
  });
  it('does not spend backup requests when Gemini succeeds', async () => {
    const h = reader(async () => ({ text: 'primary' }));
    expect((await h.call('g', [])).text).toBe('primary');
    expect(h.backup).not.toHaveBeenCalled();
  });
  it('does not fall back when the user cancels', async () => {
    const h = reader(async () => { throw new DOMException('Stopped', 'AbortError'); });
    await expect(h.call('g', [])).rejects.toMatchObject({ name: 'AbortError' });
    expect(h.backup).not.toHaveBeenCalled();
  });
  it('works with a backup key alone', async () => {
    const primary = vi.fn();
    const h = reader(primary, { openRouterKey: 'b' });
    expect((await h.call('', [])).via).toBe('openrouter');
    expect(primary).not.toHaveBeenCalled();
  });
});
import { extractFoundReceipts } from '../src/lib/receipt-finder-client.js';

describe('Gmail Finder shared AI', () => {
  it('uses app AI without requiring a separate deployment', async () => {
    const readAi = vi.fn(async () => ({ text: '{"receipts":[{"vendor":"Shop","amount":12}]}' }));
    const out = await extractFoundReceipts({ email: { body: 'Invoice', fileParts: [] }, readAi });
    expect(out.receipts[0].vendor).toBe('Shop');
    expect(readAi.mock.calls[0][0][0].text).toContain('paymentStatus');
  });
  it('rejects a truncated extraction before importing any draft', async () => {
    await expect(extractFoundReceipts({ email: { body: 'Invoice', fileParts: [] }, readAi: async () => ({ text: '{"receipts":[]}', truncated: true }) })).rejects.toThrow(/finish/);
  });
});

describe('provider boundary integration', () => {
  it('sends exhausted Gemini receipt requests to OpenRouter with only the backup credential', async () => {
    const requests = [];
    const fetchImpl = async (url, init) => {
      requests.push({ url, ...init });
      return url.includes('generativelanguage')
        ? { ok: false, status: 429, json: async () => ({ error: { message: 'Quota exhausted' } }) }
        : good();
    };
    const read = buildHarness({
      names: ['_callAiForReceipts', '_callGeminiForReceipts', 'GEMINI_THINKING_READ', 'GEMINI_THINKING_MODES', '_geminiThinkingMode', '_geminiThinkingPatch', 'GEMINI_SINGLE_ATTEMPT_BYTES'],
      deps: { TAX_CENTER: { settings: { openRouterKey: 'backup-test-key' } },
        fetch: fetchImpl, DOMException, _geminiModelChain: () => ['gemini-test'],
        _geminiUnavailable: new Set(), _geminiAwaitCooldown: async () => {}, _geminiNoteThrottle: () => {},
        runOpenRouterRead: args => router.runOpenRouterRead({ ...args, fetchImpl }), friendlyOpenRouterError: router.friendlyOpenRouterError },
      returns: '_callAiForReceipts',
    });
    expect((await read('google-test-key', [{ text: 'Return receipt JSON' }])).text).toBe('{"total":12}');
    const backup = requests.filter(request => request.url.includes('openrouter'));
    expect(backup).toHaveLength(1);
    expect(backup[0].headers.Authorization).toBe('Bearer backup-test-key');
    expect(JSON.stringify(backup)).not.toContain('google-test-key');
  });
});
