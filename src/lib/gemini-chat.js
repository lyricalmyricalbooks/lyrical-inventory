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
// What the two DO share is the account: the model chain, the "this key can't
// reach that model" set and the rate-limit cooldown all live in
// ./gemini-quota.js and are held in common. A 429 raised by a receipt scan
// pauses this panel too, which is the point.
//
// Nothing here is streamed. Nothing in this app streams today, and a tool loop
// has little to stream anyway — most of a turn is spent running local
// functions, not waiting on tokens.

import {
  _friendlyScanError,
  _geminiAwaitCooldown,
  _geminiModelChain,
  _geminiNoteThrottle,
  _geminiUnavailable,
} from './gemini-quota.js';
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

/** Requests are aborted after this long with no answer. */
export const REQUEST_TIMEOUT_MS = 60_000;

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
export function buildChatRequest({ contents, tools, systemInstruction }) {
  const body = {
    contents,
    generationConfig: {
      // Low, not zero: these answers are about money and should not vary run to
      // run, but zero makes a model that has painted itself into a corner
      // repeat the same bad tool call forever.
      temperature: 0.2,
      maxOutputTokens: 4096,
    },
  };
  if (systemInstruction) body.systemInstruction = { parts: [{ text: systemInstruction }] };
  if (tools && tools.length) {
    body.tools = [{ functionDeclarations: tools }];
    body.toolConfig = { functionCallingConfig: { mode: 'AUTO' } };
  }
  return body;
}

/**
 * One HTTP round against one model, with the retry behaviour the receipt
 * scanner already proved out: transient 429/5xx get exponential backoff with
 * jitter, and a 429 is published to the SHARED cooldown so every other caller
 * on this key eases off too rather than retrying into the same window.
 */
async function callModel(model, apiKey, body, { fetchImpl, signal }) {
  const send = async () => {
    await _geminiAwaitCooldown();
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    return fetchImpl(
      `${GEMINI_API_ROOT}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal }
    );
  };

  let res = await send();
  for (let attempt = 0; attempt < 2 && !res.ok && (res.status === 429 || res.status >= 500); attempt++) {
    const retryAfter = Number(res.headers?.get?.('retry-after'));
    const wait = Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(retryAfter * 1000, 8000)
      : (700 * Math.pow(2, attempt)) + Math.random() * 400;
    if (res.status === 429) _geminiNoteThrottle(wait);
    else await new Promise(r => setTimeout(r, wait));
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    res = await send();
  }
  return res;
}

/**
 * Ask the first model in the chain that will answer.
 *
 * Escalating only helps when THIS model is the problem. A rejected key, a
 * malformed request or anything that means "this would cost money" fails
 * identically everywhere, so those stop the walk immediately rather than
 * spending two more metered requests to be told the same thing twice.
 */
async function askChain(apiKey, body, opts) {
  const free = _geminiModelChain();
  if (!free.length) throw new Error('No free-tier model is available for this key');
  const reachable = free.filter(m => !_geminiUnavailable.has(m));
  const chain = reachable.length ? reachable : free;

  let lastErr;
  for (const model of chain) {
    try {
      const res = await callModel(model, apiKey, body, opts);
      if (!res.ok) {
        let detail = `HTTP ${res.status} from ${model}`;
        let fatal = res.status === 400 || res.status === 401 || res.status === 403;
        if (res.status === 404) _geminiUnavailable.add(model);
        try {
          const err = await res.json();
          if (err?.error?.message) {
            detail = err.error.message;
            if (res.status === 429
              || /prepayment|credits|billing|quota|API key|paid tier|FAILED_PRECONDITION|payment/i.test(detail)) {
              fatal = true;
            }
          }
        } catch (_) { /* a body that isn't JSON tells us nothing extra */ }
        lastErr = new Error(detail);
        lastErr.status = res.status;
        if (fatal) throw lastErr;
        continue;
      }
      const data = await res.json();
      const cand = data.candidates?.[0];
      const finish = cand?.finishReason;
      if (finish && finish !== 'STOP' && finish !== 'MAX_TOKENS') {
        lastErr = new Error(`Gemini stopped early (${finish})`);
        continue;
      }
      return { parts: cand?.content?.parts || [], model, truncated: finish === 'MAX_TOKENS' };
    } catch (e) {
      if (e && e.name === 'AbortError') throw e;
      if (e && e.status && (e.status === 400 || e.status === 401 || e.status === 403 || e.status === 429)) throw e;
      lastErr = e;
    }
  }
  throw lastErr || new Error('No model answered');
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
    const answer = await askChain(apiKey, buildChatRequest({ contents, tools, systemInstruction }), { fetchImpl, signal });
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
