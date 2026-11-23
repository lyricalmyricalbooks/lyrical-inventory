// Multi-turn Gemini with function calling — the transport behind the
// Intelligence panel.
//
// This is a sibling of _callGeminiForReceipts, not a replacement for it. The
// two ask the same account for different things and the request shapes are
// genuinely incompatible:
//
//   • The receipt reader pins response_mime_type to JSON and hands over one
//     image. THAT REQUEST SHAPE CANNOT CARRY TOOLS — Gemini rejects a request
//     that asks for a fixed JSON mime type and declares functions at the same
//     time, so nothing here may set it. This is the single easiest way to break
//     this file by copying from the other one.
//   • The receipt reader caps thinking to zero, because reading a printed
//     total is not a reasoning task and the thinking was pure latency. Working
//     out a margin across a fair's costs and takings IS one, so this leaves the
//     model's own default alone.
//
// What the two DO share is the account and the way it is asked: the model
// chain, the "this key can't reach that model" set, the rate-limit cooldown
// and the request loop that walks them (askGemini) all live in
// ./gemini-quota.js and are held in common. A 429 raised by a receipt scan
// pauses this panel too, and a model refused with "limit: 0" is stepped past
// here exactly as it is there.
//
// Nothing here is streamed. Nothing in this app streams today, and a tool loop
// has little to stream anyway — most of a turn is spent running local
// functions, not waiting on tokens.

import { _friendlyScanError, askGemini } from './gemini-quota.js';
import { geminiUsesThinkingLevel } from './gemini-models.js';
import { runIntelTool } from './publisher-intel-tools.js';

export const GEMINI_API_ROOT = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * The role a tool result is sent back under.
 *
 * Gemini's Content.role accepts exactly two values, "user" and "model" — a
 * function result is not a third kind of speaker, it is something the caller
 * hands back, so it goes up as "user". Several client libraries spell this
 * "function" in their own types and map it to "user" before it reaches the
 * wire, which is why the wrong value looks plausible in examples. It is a
 * constant rather than a literal so there is exactly one place to correct if
 * that ever changes, and so a test can pin it.
 */
export const FUNCTION_RESPONSE_ROLE = 'user';

/**
 * How many times a single question may come back asking for more data.
 *
 * Six is enough for a real multi-part question ("margins at each fair this year
 * versus last") and short enough that a model looping on a tool it keeps
 * mis-calling cannot quietly spend a free-tier allowance. Hitting the cap is
 * reported, never hidden.
 */
export const MAX_TOOL_ROUNDS = 6;

const textOf = (parts) => (parts || [])
  // Newer flash models emit their reasoning as a part flagged `thought`. It is
  // not the answer and must never be shown as one.
  .filter(p => p && p.text && !p.thought)
  .map(p => p.text)
  .join('')
  .trim();

const callsOf = (parts) => (parts || [])
  .filter(p => p && p.functionCall && p.functionCall.name)
  .map(p => ({ name: p.functionCall.name, args: p.functionCall.args || {} }));

/**
 * The request body for one round.
 *
 * Exported so a test can assert what actually goes on the wire — in particular
 * that response_mime_type is absent whenever tools are declared.
 */
export function buildChatRequest({ contents, tools, systemInstruction, model }) {
  // Keep bookkeeping questions quick and economical. The model still has to
  // obtain every figure through a tool; low thinking is enough to pick that
  // tool without paying the default latency for a deep reasoning run.
  //
  // Gemini 3 and later take the named level and ignore temperature (Google
  // says a future release will refuse it). Gemini 2.x only reads the numeric
  // budget, and refuses the named level with a 400 — so the request is shaped
  // for the model it is going to.
  const generationConfig = model && !geminiUsesThinkingLevel(model)
    ? { temperature: 0.2, maxOutputTokens: 1200, thinkingConfig: { thinkingBudget: 512 } }
    : { maxOutputTokens: 1200, thinkingConfig: { thinkingLevel: 'low' } };
  const body = { contents, generationConfig };
  if (systemInstruction) body.systemInstruction = { parts: [{ text: systemInstruction }] };
  if (tools && tools.length) {
    body.tools = [{ functionDeclarations: tools }];
    body.toolConfig = { functionCallingConfig: { mode: 'AUTO' } };
  }
  return body;
}

/**
 * Ask the first model in the chain that will answer.
 *
 * The walk itself — retries, the shared pause, stepping past a model this key
 * cannot use ("limit: 0"), stopping on a rejected key or anything that would
 * cost money — is askGemini in ./gemini-quota.js, the same code the receipt
 * scanner uses. This only shapes the request for each model and keeps the
 * whole answer, tool calls included, rather than just its text.
 */
function askChain(apiKey, bodyFor, { fetchImpl, signal }) {
  return askGemini(apiKey, {
    fetchImpl,
    signal,
    body: (model) => JSON.stringify(bodyFor(model)),
    read: (cand, model, finish) => ({ parts: cand?.content?.parts || [], model, truncated: finish === 'MAX_TOKENS' }),
  });
}

/**
 * Run one question end to end: ask, run whatever tools the model asks for, ask
 * again with the results, until it answers in words.
 *
 * @param {object}   o
 * @param {string}   o.apiKey        The publisher's own Gemini key.
 * @param {Array}    o.history       Prior turns as Gemini `contents` entries.
 * @param {string}   o.userText      The question just asked.
 * @param {Array}    o.tools         functionDeclarations to offer.
 * @param {object}   o.ctx           Injected data context for the tools.
 * @param {string}   o.systemInstruction
 * @param {Function} [o.fetchImpl]   Injected for tests.
 * @param {AbortSignal} [o.signal]
 * @param {number}   [o.maxRounds]
 * @returns {Promise<{text, history, toolCalls, proposals, model, rounds, hitRoundCap, truncated}>}
 */
export async function runIntelTurn({
  apiKey,
  history = [],
  userText,
  tools = [],
  ctx = {},
  systemInstruction = '',
  fetchImpl = (typeof fetch === 'function' ? fetch.bind(globalThis) : null),
  signal,
  maxRounds = MAX_TOOL_ROUNDS,
} = {}) {
  if (!apiKey) throw new Error('No AI key is set');
  if (typeof fetchImpl !== 'function') throw new Error('No way to reach the network');

  const contents = [...history, { role: 'user', parts: [{ text: String(userText || '') }] }];
  const toolCalls = [];
  const proposals = [];
  let model = '';
  let truncated = false;

  for (let round = 0; round < maxRounds; round++) {
    const answer = await askChain(apiKey, model => buildChatRequest({ contents, tools, systemInstruction, model }), { fetchImpl, signal });
    model = answer.model;
    truncated = answer.truncated;

    const calls = callsOf(answer.parts);
    if (!calls.length) {
      return {
        text: textOf(answer.parts),
        history: [...contents, { role: 'model', parts: answer.parts }],
        toolCalls, proposals, model, rounds: round, hitRoundCap: false, truncated,
      };
    }

    // The model's turn goes back verbatim. Gemini rejects a function response
    // that is not preceded by the exact call it answers, so the parts cannot be
    // trimmed or reordered here even though only the calls are used below.
    contents.push({ role: 'model', parts: answer.parts });

    const responses = [];
    for (const call of calls) {
      const result = runIntelTool(call.name, call.args, ctx);
      toolCalls.push({ name: call.name, args: call.args });
      // A staged batch of changes is lifted out for the panel to render as an
      // approve-or-dismiss card. It is still handed back to the model too, so
      // it can describe in words what it has put in front of the publisher —
      // including anything that could not be staged and why.
      if (call.name === 'proposeEdits' && result && result.ok && result.batch) {
        proposals.push(result.batch);
      }
      responses.push({ functionResponse: { name: call.name, response: { result } } });
    }
    contents.push({ role: FUNCTION_RESPONSE_ROLE, parts: responses });
  }

  // Out of rounds. Say so rather than presenting a half-finished investigation
  // as a finished answer — the publisher needs to know the model gave up
  // looking, not wonder why the figures look thin.
  return {
    text: '', history: contents, toolCalls, proposals, model,
    rounds: maxRounds, hitRoundCap: true, truncated,
  };
}

/** Plain-language wording for a failed turn, shared with the receipt scanner. */
export function friendlyChatError(e) {
  return _friendlyScanError(e);
}
