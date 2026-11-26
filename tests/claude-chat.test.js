import { describe, expect, it, vi } from 'vitest';
import {
  STOCKROOM_CLAUDE_URL, anyAiReady, askStockroomClaude, claudeDollars, claudeMeterLine, runClaudeRead, runClaudeTurn,
  toClaudeMessages, toClaudeTools, withClaude,
} from '../src/lib/claude-chat.js';

const json = (status, data) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const meter = { configured: true, choice: 'quick', capDollars: 5, spentMicros: 4200, requests: 3, rest: '' };
const transport = (fetchImpl) => ({ fetchImpl, getIdToken: async () => 'stockroom-token' });

describe('Claude through the website', () => {
  it('sends the stockroom sign-in to the website, never a Claude key', async () => {
    const fetchImpl = vi.fn(async () => json(200, { meter }));
    await askStockroomClaude({ op: 'status' }, transport(fetchImpl));
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(STOCKROOM_CLAUDE_URL);
    expect(init.headers.Authorization).toBe('Bearer stockroom-token');
    expect(init.body).not.toMatch(/sk-ant-/);
  });

  it('passes on the website’s plain words and stops a scan when Claude is paused', async () => {
    const fetchImpl = vi.fn(async () => json(402, { error: 'Claude is out of credits, so it’s paused.', rest: 'credits', meter: { ...meter, rest: 'credits' } }));
    const err = await askStockroomClaude({ op: 'message' }, transport(fetchImpl)).catch(e => e);
    expect(err.message).toBe('Claude is out of credits, so it’s paused');
    expect(err.status).toBe(402);
    expect(err.rest).toBe('credits');
    expect(err.systemic).toMatch(/out of credits/);
  });

  it('asks for a fresh sign-in instead of calling without one', async () => {
    const fetchImpl = vi.fn();
    const err = await askStockroomClaude({ op: 'status' }, { fetchImpl, getIdToken: async () => '' }).catch(e => e);
    expect(err.message).toMatch(/sign in/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('shows the month in plain words', () => {
    expect(claudeDollars(0)).toBe('$0.00');
    expect(claudeDollars(4200)).toBe('under 1¢');
    expect(claudeMeterLine(meter)).toBe('This month: under 1¢ of $5 · 3 requests.');
    expect(claudeMeterLine({ ...meter, rest: 'cap' })).toMatch(/Paused until next month/);
    expect(claudeMeterLine({ configured: false })).toMatch(/isn’t set up on the website/);
  });

  it('counts Claude as an AI that can read', () => {
    expect(anyAiReady({})).toBe(false);
    expect(anyAiReady({ claudeOn: true })).toBe(true);
    expect(anyAiReady({ openRouterKey: '  ' })).toBe(false);
  });
});

describe('Claude conversation shape', () => {
  it('turns Google-shaped history into Claude turns with matching tool ids', () => {
    const msgs = toClaudeMessages([
      { role: 'user', parts: [{ text: 'Best seller?' }] },
      { role: 'model', parts: [{ thought: true, text: 'hmm' }, { functionCall: { name: 'salesByBook', args: { year: 2026 } } }] },
      { role: 'user', parts: [{ functionResponse: { name: 'salesByBook', response: { result: { top: 'Salt' } } } }] },
      { role: 'model', parts: [{ text: 'Salt.' }] },
      { role: 'user', parts: [{ text: 'And last year?' }] },
    ]);
    expect(msgs.map(m => m.role)).toEqual(['user', 'assistant', 'user', 'assistant', 'user']);
    expect(msgs[1].content).toEqual([{ type: 'tool_use', id: 'call_1_0_salesByBook', name: 'salesByBook', input: { year: 2026 } }]);
    expect(msgs[2].content[0]).toMatchObject({ type: 'tool_result', tool_use_id: 'call_1_0_salesByBook' });
  });

  it('lowercases Google’s schema types for Claude’s tools', () => {
    const [tool] = toClaudeTools([{ name: 'salesByBook', description: 'd', parameters: { type: 'OBJECT', properties: { year: { type: 'NUMBER' } } } }]);
    expect(tool).toEqual({ name: 'salesByBook', description: 'd', input_schema: { type: 'object', properties: { year: { type: 'number' } } } });
  });

  it('runs the tool loop and keeps the history in Google’s shape', async () => {
    const answers = [
      { message: { content: [{ type: 'tool_use', id: 'x', name: 'unknownTool', input: {} }], stop_reason: 'tool_use', model: 'claude-haiku-5-5' }, meter },
      { message: { content: [{ type: 'text', text: 'Salt sold best.' }], stop_reason: 'end_turn', model: 'claude-haiku-5-5' }, meter },
    ];
    const fetchImpl = vi.fn(async () => json(200, answers.shift()));
    const out = await runClaudeTurn({ userText: 'Best seller?', tools: [], ...transport(fetchImpl) });
    expect(out.text).toBe('Salt sold best.');
    expect(out.via).toBe('claude');
    expect(out.toolCalls).toEqual([{ name: 'unknownTool', args: {} }]);
    expect(out.history.at(-1)).toEqual({ role: 'model', parts: [{ text: 'Salt sold best.' }] });
    const second = JSON.parse(fetchImpl.mock.calls[1][1].body);
    expect(second.messages.at(-1).content[0].type).toBe('tool_result');
    expect(second).not.toHaveProperty('model');
  });

  it('reads a receipt photo as JSON', async () => {
    const fetchImpl = vi.fn(async () => json(200, { message: { content: [{ type: 'text', text: '{"total":12.5}' }], stop_reason: 'end_turn', model: 'claude-haiku-5-5' }, meter }));
    const out = await runClaudeRead({ parts: [{ text: 'Read it' }, { inline_data: { mime_type: 'image/jpeg', data: 'AAAA' } }], schema: { type: 'OBJECT' }, ...transport(fetchImpl) });
    expect(out).toMatchObject({ text: '{"total":12.5}', via: 'claude', truncated: false });
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.messages[0].content[1]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } });
    expect(body.system).toMatch(/"type":"object"/);
  });

  it('refuses photo types Claude can’t read before sending anything', async () => {
    const fetchImpl = vi.fn();
    await expect(runClaudeRead({ parts: [{ inline_data: { mime_type: 'image/heic', data: 'A' } }], ...transport(fetchImpl) })).rejects.toThrow(/JPEG/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('Claude with the other AIs', () => {
  const ok = (v) => () => Promise.resolve(v);
  const bad = (msg) => () => Promise.reject(Object.assign(new Error(msg), { status: 402 }));

  it('asks the others first unless Claude comes first', async () => {
    expect(await withClaude({ claude: ok('claude'), others: ok('gemini') })).toBe('gemini');
    expect(await withClaude({ claude: ok('claude'), others: ok('gemini'), claudeFirst: true })).toBe('claude');
    expect(await withClaude({ claude: ok('claude'), others: bad('spent') })).toBe('claude');
    expect(await withClaude({ claude: bad('paused'), others: ok('gemini'), claudeFirst: true })).toBe('gemini');
  });

  it('keeps the other AI’s error when both fail, with Claude’s reason alongside', async () => {
    const err = await withClaude({ claude: bad('Claude paused'), others: bad('Google spent'), claudeFirst: true }).catch(e => e);
    expect(err.message).toBe('Google spent');
    expect(err.claudeError.message).toBe('Claude paused');
  });

  it('never moves on after the publisher pressed stop', async () => {
    const claude = vi.fn();
    const stop = () => Promise.reject(new DOMException('Aborted', 'AbortError'));
    await expect(withClaude({ claude, others: stop })).rejects.toThrow(/Aborted/);
    expect(claude).not.toHaveBeenCalled();
  });
});
