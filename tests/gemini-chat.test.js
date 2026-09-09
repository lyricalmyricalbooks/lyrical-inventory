import { describe, it, expect, vi } from 'vitest';
import {
  FUNCTION_RESPONSE_ROLE,
  MAX_TOOL_ROUNDS,
  buildChatRequest,
  runIntelTurn,
} from '../src/lib/gemini-chat.js';

// The tool loop is where a question turns into real figures. Most of what can
// go wrong here is invisible in the UI — a request shape Gemini quietly refuses,
// a loop that never ends, an answer built from a tool call that was never run.

const reply = (parts, finishReason = 'STOP') => ({
  ok: true, status: 200,
  json: async () => ({ candidates: [{ content: { parts }, finishReason }] }),
});
const fail = (status, message) => ({
  ok: false, status, headers: { get: () => null },
  json: async () => ({ error: { message } }),
});

const TOOLS = [{ name: 'querySales', description: 'sales', parameters: { type: 'OBJECT', properties: {} } }];
const CTX = { books: {}, states: {}, taxCenter: {} };

describe('the request that goes on the wire', () => {
  it('never asks for a JSON mime type while declaring tools', () => {
    // Gemini refuses a request that pins response_mime_type AND declares
    // functions. The receipt scanner pins it, so copying its config into this
    // file would break every question with a 400 — hence this test.
    const body = buildChatRequest({ contents: [], tools: TOOLS, systemInstruction: 'sys' });
    expect(JSON.stringify(body).toLowerCase()).not.toContain('mime');
    expect(body.tools[0].functionDeclarations).toBe(TOOLS);
  });

  it('carries the house rules as a system instruction', () => {
    const body = buildChatRequest({ contents: [], tools: TOOLS, systemInstruction: 'never guess' });
    expect(body.systemInstruction.parts[0].text).toBe('never guess');
  });

  it('leaves thinking at the model default', () => {
    // The receipt reader caps thinking to zero because reading a printed total
    // is not a reasoning task. Working out a margin is one.
    expect(JSON.stringify(buildChatRequest({ contents: [], tools: TOOLS }))).not.toContain('thinking');
  });

  it('sends a tool result back as a role Gemini accepts', () => {
    // Content.role takes exactly "user" or "model". Several client libraries
    // spell this "function" in their own types and map it before the wire,
    // which is why the wrong value looks plausible in examples.
    expect(['user', 'model']).toContain(FUNCTION_RESPONSE_ROLE);
  });
});

describe('running a question', () => {
  it('runs the tool it is asked for and answers with the result in hand', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(reply([{ functionCall: { name: 'querySales', args: { bookId: 'hound' } } }]))
      .mockResolvedValueOnce(reply([{ text: 'You sold 9 copies.' }]));

    const out = await runIntelTurn({ apiKey: 'k', userText: 'how many?', tools: TOOLS, ctx: CTX, fetchImpl });

    expect(out.text).toBe('You sold 9 copies.');
    expect(out.toolCalls).toEqual([{ name: 'querySales', args: { bookId: 'hound' } }]);
    expect(out.hitRoundCap).toBe(false);
    expect(out.history.map(h => h.role)).toEqual(['user', 'model', FUNCTION_RESPONSE_ROLE, 'model']);
    expect(out.history[2].parts[0].functionResponse.name).toBe('querySales');
  });

  it('keeps the model turn verbatim before the result that answers it', async () => {
    // Gemini rejects a function response not preceded by the exact call it
    // answers, so these parts cannot be trimmed or reordered.
    const call = { functionCall: { name: 'querySales', args: {} } };
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(reply([{ text: 'let me look' }, call]))
      .mockResolvedValueOnce(reply([{ text: 'done' }]));
    const out = await runIntelTurn({ apiKey: 'k', userText: 'x', tools: TOOLS, ctx: CTX, fetchImpl });
    expect(out.history[1].parts).toEqual([{ text: 'let me look' }, call]);
  });

  it('never shows the model reasoning as if it were the answer', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reply([
      { text: 'hmm, first I should check', thought: true },
      { text: 'You made $120.' },
    ]));
    const out = await runIntelTurn({ apiKey: 'k', userText: 'x', tools: TOOLS, ctx: CTX, fetchImpl });
    expect(out.text).toBe('You made $120.');
  });

  it('stops looping and says so rather than spending the whole allowance', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reply([{ functionCall: { name: 'querySales', args: {} } }]));
    const out = await runIntelTurn({ apiKey: 'k', userText: 'x', tools: TOOLS, ctx: CTX, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(MAX_TOOL_ROUNDS);
    expect(out.hitRoundCap).toBe(true);
    expect(out.text).toBe('');
  });

  it('hands a bad tool name back to the model instead of ending the turn', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(reply([{ functionCall: { name: 'queryNonsense', args: {} } }]))
      .mockResolvedValueOnce(reply([{ text: 'Sorry, let me try again.' }]));
    const out = await runIntelTurn({ apiKey: 'k', userText: 'x', tools: TOOLS, ctx: CTX, fetchImpl });
    expect(out.history[2].parts[0].functionResponse.response.result.error).toMatch(/no tool called/i);
    expect(out.text).toBe('Sorry, let me try again.');
  });

  it('lifts a staged correction out for the publisher to approve', async () => {
    const ctx = {
      books: {}, states: {},
      taxCenter: { businessExpenses: [{ id: 'b1', desc: 'Train', cat: 'travel', amount: 12, currency: 'CAD' }] },
    };
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(reply([{
        functionCall: { name: 'proposeCorrection', args: { kind: 'recategorizeExpense', expenseId: 'b1', value: 'Travel & Meals' } },
      }]))
      .mockResolvedValueOnce(reply([{ text: 'I have put one change up for you.' }]));
    const out = await runIntelTurn({ apiKey: 'k', userText: 'x', tools: TOOLS, ctx, fetchImpl });
    expect(out.proposals).toHaveLength(1);
    expect(out.proposals[0]).toMatchObject({ before: 'travel', after: 'Travel & Meals' });
    // Still nothing written.
    expect(ctx.taxCenter.businessExpenses[0].cat).toBe('travel');
  });
});

describe('when it goes wrong', () => {
  it('stops on a rejected key instead of paying to be told twice', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fail(403, 'API key not valid'));
    await expect(runIntelTurn({ apiKey: 'bad', userText: 'x', tools: TOOLS, ctx: CTX, fetchImpl }))
      .rejects.toThrow(/API key not valid/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('stops rather than walk the chain when the answer would cost money', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fail(400, 'billing required for paid tier'));
    await expect(runIntelTurn({ apiKey: 'k', userText: 'x', tools: TOOLS, ctx: CTX, fetchImpl })).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('gives up on a question with no key at all', async () => {
    await expect(runIntelTurn({ apiKey: '', userText: 'x', tools: TOOLS, ctx: CTX, fetchImpl: vi.fn() }))
      .rejects.toThrow(/No AI key/);
  });

  it('a cancel is a cancel, not a failure to retry', async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(runIntelTurn({ apiKey: 'k', userText: 'x', tools: TOOLS, ctx: CTX, fetchImpl: vi.fn(), signal: ac.signal }))
      .rejects.toThrow(/Abort/i);
  });
});
