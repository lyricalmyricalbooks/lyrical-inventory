import { describe, it, expect, vi } from 'vitest';
import {
  MAX_TOOL_ROUNDS,
  friendlyOpenRouterError,
  runOpenRouterTurn,
  toJsonSchema,
  toOpenAIMessages,
  toOpenAITools,
} from '../src/lib/openrouter-chat.js';
import { INTEL_TOOL_SCHEMAS } from '../src/lib/publisher-intel-tools.js';

// The backup provider speaks a different dialect from Google, and everything
// that can go wrong here is a translation error that produces a plausible-
// looking request the other end quietly misreads.

const reply = (message, finish = 'stop') => ({
  ok: true, status: 200,
  json: async () => ({ choices: [{ message, finish_reason: finish }] }),
});
const fail = (status, message) => ({
  ok: false, status,
  json: async () => ({ error: { message } }),
});
const CTX = { books: {}, states: {}, taxCenter: {} };
const call = (name, args, id = 'c1') => ({ id, type: 'function', function: { name, arguments: args } });

describe('translating the tool definitions', () => {
  it('lowercases the types Google writes in capitals', () => {
    expect(toJsonSchema({ type: 'OBJECT', properties: { a: { type: 'STRING' } } }))
      .toEqual({ type: 'object', properties: { a: { type: 'string' } } });
  });

  it('goes all the way down a nested schema', () => {
    // proposeEdits takes an array of objects. A half-converted schema is worse
    // than none: the model is told a field exists but not its shape, and guesses.
    const edits = toOpenAITools(INTEL_TOOL_SCHEMAS)
      .find(t => t.function.name === 'proposeEdits').function.parameters.properties.edits;
    expect(edits.type).toBe('array');
    expect(edits.items.type).toBe('object');
    expect(edits.items.properties.target.type).toBe('string');
    expect(edits.items.required).toContain('field');
  });

  it('carries every tool across with its description intact', () => {
    const out = toOpenAITools(INTEL_TOOL_SCHEMAS);
    expect(out).toHaveLength(INTEL_TOOL_SCHEMAS.length);
    expect(out.every(t => t.type === 'function' && t.function.description)).toBe(true);
  });

  it('leaves no capitalised type anywhere in the converted surface', () => {
    const json = JSON.stringify(toOpenAITools(INTEL_TOOL_SCHEMAS));
    for (const t of ['"OBJECT"', '"STRING"', '"ARRAY"', '"BOOLEAN"', '"NUMBER"']) {
      expect(json).not.toContain(t);
    }
  });
});

describe('translating the conversation', () => {
  const history = [
    { role: 'user', parts: [{ text: 'how many did I sell?' }] },
    { role: 'model', parts: [{ functionCall: { name: 'querySales', args: { bookId: 'hound' } } }] },
    { role: 'user', parts: [{ functionResponse: { name: 'querySales', response: { result: { units: 9 } } } }] },
    { role: 'model', parts: [{ text: 'Nine copies.' }] },
  ];

  it('maps each kind of turn onto the role the other API expects', () => {
    expect(toOpenAIMessages(history, 'sys').map(m => m.role))
      .toEqual(['system', 'user', 'assistant', 'tool', 'assistant']);
  });

  it('links a tool result back to the call it answers', () => {
    // Google has no id and relies on ordering; the other end requires one on
    // both sides. A mismatch is rejected outright.
    const m = toOpenAIMessages(history);
    const assistant = m.find(x => x.tool_calls);
    const toolResult = m.find(x => x.role === 'tool');
    expect(assistant.tool_calls[0].id).toBe(toolResult.tool_call_id);
  });

  it('produces the same ids every time, so a second fallback still lines up', () => {
    expect(toOpenAIMessages(history)).toEqual(toOpenAIMessages(history));
  });

  it('sends tool arguments as the JSON string the other end parses', () => {
    const args = toOpenAIMessages(history).find(m => m.tool_calls).tool_calls[0].function.arguments;
    expect(typeof args).toBe('string');
    expect(JSON.parse(args)).toEqual({ bookId: 'hound' });
  });

  it('drops the model private reasoning rather than replaying it as speech', () => {
    const m = toOpenAIMessages([{ role: 'model', parts: [{ text: 'thinking', thought: true }, { text: 'Nine.' }] }]);
    expect(m[0].content).toBe('Nine.');
  });
});

describe('running a question against the backup', () => {
  it('runs the tools it asks for and answers with the results in hand', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(reply({ role: 'assistant', tool_calls: [call('querySales', '{}')] }, 'tool_calls'))
      .mockResolvedValueOnce(reply({ role: 'assistant', content: 'You sold 9 copies.' }));

    const out = await runOpenRouterTurn({
      apiKey: 'k', model: 'vendor/model:free', userText: 'x',
      tools: INTEL_TOOL_SCHEMAS, ctx: CTX, fetchImpl,
    });

    expect(out.text).toBe('You sold 9 copies.');
    expect(out.via).toBe('openrouter');
    expect(out.toolCalls.map(c => c.name)).toEqual(['querySales']);
  });

  it('hands the conversation back in the shape the panel stores', async () => {
    // A thread can be answered by Google on one question and the backup on the
    // next. If each stored its own format the history would become a mix that
    // neither provider could be given.
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(reply({ role: 'assistant', tool_calls: [call('querySales', '{}')] }, 'tool_calls'))
      .mockResolvedValueOnce(reply({ role: 'assistant', content: 'Nine.' }));
    const out = await runOpenRouterTurn({
      apiKey: 'k', model: 'm', userText: 'x', tools: INTEL_TOOL_SCHEMAS, ctx: CTX, fetchImpl,
    });
    expect(out.history.map(h => `${h.role}:${Object.keys(h.parts[0])[0]}`))
      .toEqual(['user:text', 'model:functionCall', 'user:functionResponse', 'model:text']);
  });

  it('sends the key as a bearer token and names the model', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reply({ role: 'assistant', content: 'ok' }));
    await runOpenRouterTurn({ apiKey: 'secret', model: 'vendor/m:free', userText: 'x', ctx: CTX, fetchImpl });
    const [, init] = fetchImpl.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer secret');
    expect(JSON.parse(init.body).model).toBe('vendor/m:free');
  });

  it('recovers when the model sends arguments that are not valid JSON', async () => {
    // It is generating a string, not an object. Handing the error back usually
    // fixes it on the next round, which beats ending the turn with nothing.
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(reply({ role: 'assistant', tool_calls: [call('querySales', '{not json')] }, 'tool_calls'))
      .mockResolvedValueOnce(reply({ role: 'assistant', content: 'Sorry, retrying.' }));
    const out = await runOpenRouterTurn({
      apiKey: 'k', model: 'm', userText: 'x', tools: INTEL_TOOL_SCHEMAS, ctx: CTX, fetchImpl,
    });
    const sent = JSON.parse(fetchImpl.mock.calls[1][1].body);
    expect(sent.messages.find(m => m.role === 'tool').content).toMatch(/not valid JSON/i);
    expect(out.text).toBe('Sorry, retrying.');
  });

  it('stops looping rather than spending an allowance on a stuck model', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      reply({ role: 'assistant', tool_calls: [call('querySales', '{}')] }, 'tool_calls')
    );
    const out = await runOpenRouterTurn({
      apiKey: 'k', model: 'm', userText: 'x', tools: INTEL_TOOL_SCHEMAS, ctx: CTX, fetchImpl,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(MAX_TOOL_ROUNDS);
    expect(out.hitRoundCap).toBe(true);
  });

  it('lifts a staged batch out for approval, exactly as the Google path does', async () => {
    const ctx = {
      books: {}, states: {},
      taxCenter: { businessExpenses: [{ id: 'b1', desc: 'Train', cat: 'travel', amount: 12, currency: 'CAD' }] },
    };
    const args = JSON.stringify({ edits: [{ target: 'businessExpense', id: 'b1', field: 'category', value: 'Travel & Meals' }] });
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(reply({ role: 'assistant', tool_calls: [call('proposeEdits', args)] }, 'tool_calls'))
      .mockResolvedValueOnce(reply({ role: 'assistant', content: 'One change is up for you.' }));
    const out = await runOpenRouterTurn({
      apiKey: 'k', model: 'm', userText: 'x', tools: INTEL_TOOL_SCHEMAS, ctx, fetchImpl,
    });
    expect(out.proposals).toHaveLength(1);
    expect(ctx.taxCenter.businessExpenses[0].cat).toBe('travel');   // still nothing written
  });

  it('refuses to start without both halves of the setting', async () => {
    await expect(runOpenRouterTurn({ model: 'm', userText: 'x', fetchImpl: vi.fn() })).rejects.toThrow(/key/i);
    await expect(runOpenRouterTurn({ apiKey: 'k', userText: 'x', fetchImpl: vi.fn() })).rejects.toThrow(/model/i);
  });

  it('treats a cancel as a cancel', async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(runOpenRouterTurn({
      apiKey: 'k', model: 'm', userText: 'x', ctx: CTX, fetchImpl: vi.fn(), signal: ac.signal,
    })).rejects.toThrow(/Abort/i);
  });
});

describe('what a backup failure is called', () => {
  it('names a wrong model name, which is the likeliest mistake here', () => {
    // The model is typed by hand into a settings box.
    const e = Object.assign(new Error('No endpoints found for vendor/typo'), { status: 404 });
    expect(friendlyOpenRouterError(e)).toMatch(/does not have a model by that name/i);
  });

  it.each([
    [401, 'No auth credentials found', /backup key was rejected/i],
    [402, 'Insufficient credits', /out of credit/i],
    [429, 'Rate limit exceeded', /at its limit too/i],
  ])('explains a %s in plain words', (status, msg, expected) => {
    expect(friendlyOpenRouterError(Object.assign(new Error(msg), { status }))).toMatch(expected);
  });

  it('does not invent a cause for something it has not seen', () => {
    expect(friendlyOpenRouterError(new Error('something odd'))).toBe('something odd');
  });
});
