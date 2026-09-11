// The Intelligence panel's second opinion — OpenRouter, used when Google will
// not answer.
//
// Why a whole second transport rather than a switch inside the first: the two
// APIs disagree about nearly everything that matters here. Google nests a turn
// as `contents[].parts[]` and returns a `functionCall` object; OpenRouter
// speaks the OpenAI shape, where a turn is a flat `message` and a tool call
// arrives with its arguments as a JSON *string* that has to be parsed. Trying
// to serve both from one code path means every line reads "if google… else…",
// and the interesting parts — the tool loop, the round cap, the abort — get
// buried in translation.
//
// So this mirrors gemini-chat.js's interface exactly and does its own
// translating at the edges. Callers hand it the same tool schemas and the same
// conversation, and get back the same shape.
//
// ── The conversation stays in Google's shape ──────────────────────────────
// Even here. That is deliberate: a thread can be answered by Google on one
// question and by OpenRouter on the next, and if each stored its own format the
// history would become a mix that neither provider could be handed. Google's
// shape is the canonical one because it is the one the panel already persists,
// so this converts INTO the OpenAI shape on the way out and appends to the
// canonical history on the way back.
//
// ── About the key ─────────────────────────────────────────────────────────
// Supplied by the publisher, stored with their other settings, and sent from
// their browser — the same arrangement, and the same trade-off, as the Google
// key the panel already uses. Nothing here is baked into the app.

import { runIntelTool } from './publisher-intel-tools.js';

export const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

/** Matches gemini-chat.js, for the reason given on MAX_TOOL_ROUNDS there. */
export const MAX_TOOL_ROUNDS = 6;

/** Google spells JSON Schema types in capitals; everyone else does not. */
const TYPE_MAP = {
  OBJECT: 'object', STRING: 'string', NUMBER: 'number',
  BOOLEAN: 'boolean', ARRAY: 'array', INTEGER: 'integer',
};

/**
 * Rewrite one Gemini parameter schema as plain JSON Schema.
 *
 * Recursive because the tool parameters here nest — proposeEdits takes an array
 * of objects — and a half-converted schema is worse than none: the model would
 * be told a field exists but not what shape it is, and would guess.
 */
export function toJsonSchema(node) {
  if (!node || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(toJsonSchema);
  const out = {};
  for (const [k, v] of Object.entries(node)) {
    if (k === 'type' && typeof v === 'string') out.type = TYPE_MAP[v] || v.toLowerCase();
    else if (k === 'properties' && v && typeof v === 'object') {
      out.properties = Object.fromEntries(Object.entries(v).map(([pk, pv]) => [pk, toJsonSchema(pv)]));
    } else if (k === 'items') out.items = toJsonSchema(v);
    else out[k] = v;
  }
  return out;
}

/** The same tools, in the shape OpenRouter expects. */
export function toOpenAITools(schemas) {
  return (schemas || []).map(s => ({
    type: 'function',
    function: {
      name: s.name,
      description: s.description,
      parameters: toJsonSchema(s.parameters) || { type: 'object', properties: {} },
    },
  }));
}

/**
 * A stable id linking one tool call to the result that answers it.
 *
 * Google's format has no such id — it relies on the results following the calls
 * in the same order — but OpenRouter requires one on both sides. Deriving it
 * from position and name rather than a random value means converting the same
 * history twice produces the same ids, so a thread that falls back more than
 * once does not accumulate mismatched pairs.
 */
const callId = (turn, index, name) => `call_${turn}_${index}_${name}`;

/**
 * Google-shaped conversation to OpenAI-shaped messages.
 *
 * @param {Array} contents  Gemini `contents` entries.
 * @param {string} systemInstruction  Prepended as a system message.
 */
export function toOpenAIMessages(contents, systemInstruction) {
  const messages = [];
  if (systemInstruction) messages.push({ role: 'system', content: systemInstruction });

  (contents || []).forEach((entry, turn) => {
    const parts = (entry && entry.parts) || [];
    const text = parts.filter(p => p && p.text && !p.thought).map(p => p.text).join('').trim();
    const calls = parts.filter(p => p && p.functionCall);
    const results = parts.filter(p => p && p.functionResponse);

    if (results.length) {
      // Google returns tool results under the user role; OpenAI gives them
      // their own. The id has to match the call emitted on the turn before.
      results.forEach((p, i) => messages.push({
        role: 'tool',
        tool_call_id: callId(turn - 1, i, p.functionResponse.name),
        content: JSON.stringify(p.functionResponse.response ?? {}),
      }));
      return;
    }

    if (entry.role === 'model') {
      const msg = { role: 'assistant', content: text || null };
      if (calls.length) {
        msg.tool_calls = calls.map((p, i) => ({
          id: callId(turn, i, p.functionCall.name),
          type: 'function',
          function: {
            name: p.functionCall.name,
            arguments: JSON.stringify(p.functionCall.args || {}),
          },
        }));
      }
      messages.push(msg);
      return;
    }

    if (text) messages.push({ role: 'user', content: text });
  });

  return messages;
}

/**
 * A model can return arguments that are not valid JSON — it is generating a
 * string, not an object. That is a recoverable mistake: hand the error back and
 * it usually fixes itself on the next round, which is far better than ending
 * the turn with nothing.
 */
function parseArgs(raw) {
  if (raw == null || raw === '') return {};
  if (typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return { __malformed: String(raw).slice(0, 200) };
  }
}

/** One HTTP round, with the same 429/5xx backoff the Google path uses. */
async function callOnce(body, apiKey, { fetchImpl, signal }) {
  const send = () => {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    return fetchImpl(OPENROUTER_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        // OpenRouter asks callers to identify themselves. Harmless, and it
        // makes the usage dashboard legible when something is spending.
        'X-Title': 'Lyrical Inventory',
      },
      body: JSON.stringify(body),
      signal,
    });
  };

  let res = await send();
  for (let attempt = 0; attempt < 2 && !res.ok && (res.status === 429 || res.status >= 500); attempt++) {
    const wait = (700 * Math.pow(2, attempt)) + Math.random() * 400;
    await new Promise(r => setTimeout(r, wait));
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    res = await send();
  }
  return res;
}

/**
 * Run one question against OpenRouter, tools and all.
 *
 * Returns the same shape as runIntelTurn() in gemini-chat.js, plus `via` so the
 * panel can say which model actually answered — a figure from the backup model
 * and a figure from Google are not equally trustworthy, and the publisher is
 * entitled to know which one they are reading.
 */
export async function runOpenRouterTurn({
  apiKey,
  model,
  history = [],
  userText,
  tools = [],
  ctx = {},
  systemInstruction = '',
  fetchImpl = (typeof fetch === 'function' ? fetch.bind(globalThis) : null),
  signal,
  maxRounds = MAX_TOOL_ROUNDS,
} = {}) {
  if (!apiKey) throw new Error('No backup AI key is set');
  if (!model) throw new Error('No backup model is set');
  if (typeof fetchImpl !== 'function') throw new Error('No way to reach the network');

  // Canonical (Google-shaped) history, and the wire-shaped copy sent upstream.
  const contents = [...history, { role: 'user', parts: [{ text: String(userText || '') }] }];
  const messages = toOpenAIMessages(contents, systemInstruction);
  const openAITools = toOpenAITools(tools);

  const toolCalls = [];
  const proposals = [];

  for (let round = 0; round < maxRounds; round++) {
    const body = {
      model,
      messages,
      temperature: 0.2,
      max_tokens: 4096,
    };
    if (openAITools.length) { body.tools = openAITools; body.tool_choice = 'auto'; }

    const res = await callOnce(body, apiKey, { fetchImpl, signal });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const err = await res.json();
        if (err?.error?.message) detail = err.error.message;
      } catch (_) { /* a body that isn't JSON tells us nothing extra */ }
      const e = new Error(detail);
      e.status = res.status;
      throw e;
    }

    const data = await res.json();
    const msg = data?.choices?.[0]?.message;
    if (!msg) throw new Error('The backup model returned nothing');

    const calls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
    if (!calls.length) {
      const text = String(msg.content || '').trim();
      contents.push({ role: 'model', parts: [{ text }] });
      return {
        text, history: contents, toolCalls, proposals,
        model, via: 'openrouter', rounds: round, hitRoundCap: false,
        truncated: data?.choices?.[0]?.finish_reason === 'length',
      };
    }

    messages.push(msg);
    contents.push({
      role: 'model',
      parts: [
        ...(msg.content ? [{ text: String(msg.content) }] : []),
        ...calls.map(c => ({ functionCall: { name: c.function?.name, args: parseArgs(c.function?.arguments) } })),
      ],
    });

    const responseParts = [];
    for (const c of calls) {
      const name = c.function?.name;
      const args = parseArgs(c.function?.arguments);
      const result = args.__malformed
        ? { error: `Those arguments were not valid JSON, so ${name} did not run. Send them again as JSON.` }
        : runIntelTool(name, args, ctx);
      toolCalls.push({ name, args });
      if (name === 'proposeEdits' && result && result.ok && result.batch) proposals.push(result.batch);
      messages.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify({ result }) });
      responseParts.push({ functionResponse: { name, response: { result } } });
    }
    contents.push({ role: 'user', parts: responseParts });
  }

  return {
    text: '', history: contents, toolCalls, proposals,
    model, via: 'openrouter', rounds: maxRounds, hitRoundCap: true, truncated: false,
  };
}

/** Plain wording for a backup-provider failure, matching the Google path's tone. */
export function friendlyOpenRouterError(e) {
  const raw = String(e?.message || e || '').trim();
  const status = e?.status;
  if (e?.name === 'AbortError') return 'the question was stopped';
  if (typeof navigator !== 'undefined' && navigator && navigator.onLine === false) {
    return 'you are offline — reconnect and try again';
  }
  // The model name is typed by hand, so a wrong one is the likeliest mistake
  // here and deserves to be named rather than shown as a bare 404.
  if (status === 404 || /no (?:such )?model|model not found|not a valid model/i.test(raw)) {
    return 'the backup service does not have a model by that name — check the model name in the Tax Centre config';
  }
  if (status === 401 || status === 403 || /invalid api key|no auth credentials|unauthor/i.test(raw)) {
    return 'the backup key was rejected — check it in the Tax Centre config';
  }
  if (status === 402 || /credit|insufficient|quota|billing/i.test(raw)) {
    return 'the backup account is out of credit';
  }
  if (status === 429 || /rate limit/i.test(raw)) {
    return 'the backup model is at its limit too — wait a minute and try again';
  }
  if (/failed to fetch|network|ENOTFOUND|ECONN/i.test(raw)) {
    return 'could not reach the backup service — check your connection';
  }
  return raw ? raw.slice(0, 110) : 'the backup model did not say why';
}
