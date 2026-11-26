// Claude, through the shop's website.
//
// The stockroom never holds a Claude key. The owner saves it once on the website
// (Settings › General › AI writing assistant), together with Quick or Best
// writing and a monthly limit, and this app asks the website's `stockroomClaude`
// service with the owner's own sign-in. Contract: docs/website-link.md › Claude
// for the stockroom.
//
// Why that matters for money: Claude only runs on credits bought ahead in the
// Anthropic account. When they run out, Anthropic refuses and charges nothing,
// and the website then pauses Claude for BOTH apps until the owner presses Try
// again. The same happens at the owner's monthly limit. A paused Claude is never
// asked, so an empty balance can't turn into a bill.
//
// Like openrouter-chat.js, this mirrors gemini-chat.js's interface and keeps the
// conversation in Google's shape, converting at the edges, so a thread can be
// answered by any provider on any question.

import { runIntelTool } from './publisher-intel-tools.js';
import { toJsonSchema } from './openrouter-chat.js';

export const STOCKROOM_CLAUDE_URL = 'https://us-central1-lyricalmyrical-web-v2.cloudfunctions.net/stockroomClaude';

/** Matches gemini-chat.js. */
export const MAX_TOOL_ROUNDS = 6;

/** What Claude can read on a receipt (others are refused by the website). */
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/** True when the owner has switched Claude on in Settings › AI and receipts. */
export const claudeOn = (settings) => settings?.claudeOn === true;

/** True when any AI is ready to read or answer: Gemini, OpenRouter or Claude. */
export const anyAiReady = (settings) => !!(settings?.geminiKey || settings?.openRouterKey?.trim() || claudeOn(settings));

// The last meter the website sent, so screens can show it without asking again.
let lastMeter = null;
const meterListeners = new Set();
function rememberMeter(meter) {
  if (!meter || typeof meter !== 'object') return;
  lastMeter = { ...meter, at: Date.now() };
  for (const fn of meterListeners) { try { fn(lastMeter); } catch (_) { /* a screen that went away */ } }
}
export const claudeMeterNow = () => lastMeter;
export function onClaudeMeter(fn) { meterListeners.add(fn); return () => meterListeners.delete(fn); }

/** Pure: dollars from millionths, never "$0.00" after some use. */
export function claudeDollars(micros) {
  const d = Math.max(0, Number(micros) || 0) / 1e6;
  if (d > 0 && d < 0.01) return 'under 1¢';
  return `$${d.toFixed(2)}`;
}

/** Pure: one plain line about this month, for Settings and the panel. */
export function claudeMeterLine(meter) {
  if (!meter) return '';
  if (!meter.configured) return 'Claude isn’t set up on the website yet. Add the key there: Settings › General › AI writing assistant.';
  const cap = Number(meter.capDollars) > 0 ? ` of $${meter.capDollars}` : '';
  const used = `This month: ${claudeDollars(meter.spentMicros)}${cap} · ${meter.requests || 0} ${meter.requests === 1 ? 'request' : 'requests'}`;
  const rest = {
    credits: 'Paused: the Claude credits ran out. Add credits at console.anthropic.com, then press Try again.',
    limit: 'Paused: the Anthropic monthly spending limit was reached.',
    cap: 'Paused until next month: this month’s limit is used up. Raise it on the website.',
  }[meter.rest];
  return rest ? `${used}. ${rest}` : `${used}.`;
}

/**
 * One request to the website. Throws an Error whose message is already plain
 * words (the website writes them), with `status`, `rest` and `__viaClaude`.
 */
export async function askStockroomClaude(payload, {
  getIdToken = () => (typeof window !== 'undefined' && window._fbGetIdToken ? window._fbGetIdToken() : ''),
  fetchImpl = (typeof fetch === 'function' ? fetch.bind(globalThis) : null),
  signal,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('No way to reach the network');
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const token = await getIdToken();
  if (!token) throw Object.assign(new Error('sign in again to use Claude'), { status: 401, __viaClaude: true, __alreadyFriendly: true });
  let res;
  try {
    res = await fetchImpl(STOCKROOM_CLAUDE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
      signal,
    });
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
    throw Object.assign(new Error('could not reach the website to ask Claude — check your connection'), { status: 0, __viaClaude: true, __alreadyFriendly: true });
  }
  let data = {};
  try { data = await res.json(); } catch (_) { data = {}; }
  rememberMeter(data.meter);
  if (!res.ok) {
    const words = String(data.error || `the website answered ${res.status}`).replace(/[.\s]+$/, '');
    throw Object.assign(new Error(words), {
      status: res.status, rest: data.rest || '', needsKey: data.needsKey === true, __viaClaude: true, __alreadyFriendly: true,
      // A paused Claude, or none set up, fails the same way on every receipt: stop a scan at the first one.
      ...(data.rest || data.needsKey ? { systemic: `${words}.` } : {}),
    });
  }
  return data;
}

/** The meter only; nothing is sent to Anthropic. */
export async function claudeStatus(opts) {
  const data = await askStockroomClaude({ op: 'status' }, opts);
  return data.meter;
}

/** Try again: clears the pause on the website, then one tiny request. */
export async function checkClaude(opts) {
  const data = await askStockroomClaude({ op: 'check' }, opts);
  return data.meter;
}

/** The intelligence tools, in Claude's shape. */
export function toClaudeTools(schemas) {
  return (schemas || []).map(s => ({
    name: s.name,
    description: s.description || '',
    input_schema: toJsonSchema(s.parameters) || { type: 'object', properties: {} },
  }));
}

/** Same idea as openrouter-chat.js: ids from position, so converting twice gives the same pairs. */
const callId = (turn, index, name) => `call_${turn}_${index}_${String(name).replace(/[^A-Za-z0-9_-]/g, '')}`;

/**
 * Google-shaped conversation to Claude messages. Neighbouring turns from the
 * same side are joined, and a tool answer always follows its call.
 */
export function toClaudeMessages(contents) {
  const out = [];
  const push = (role, blocks) => {
    if (!blocks.length) return;
    const last = out[out.length - 1];
    if (last && last.role === role) last.content.push(...blocks);
    else out.push({ role, content: blocks });
  };
  (contents || []).forEach((entry, turn) => {
    const parts = (entry && entry.parts) || [];
    const text = parts.filter(p => p && p.text && !p.thought).map(p => p.text).join('').trim();
    const calls = parts.filter(p => p && p.functionCall);
    const results = parts.filter(p => p && p.functionResponse);
    if (results.length) {
      push('user', results.map((p, i) => ({
        type: 'tool_result',
        tool_use_id: callId(turn - 1, i, p.functionResponse.name),
        content: JSON.stringify(p.functionResponse.response ?? {}),
      })));
      return;
    }
    if (entry.role === 'model') {
      const blocks = text ? [{ type: 'text', text }] : [];
      calls.forEach((p, i) => blocks.push({ type: 'tool_use', id: callId(turn, i, p.functionCall.name), name: p.functionCall.name, input: p.functionCall.args || {} }));
      push('assistant', blocks);
      return;
    }
    if (text) push('user', [{ type: 'text', text }]);
  });
  // Claude wants the conversation to start with a question.
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

/** Claude's answer back into Google's parts, so it can be stored with the rest. */
function toGeminiParts(content) {
  const parts = [];
  for (const b of content || []) {
    if (b?.type === 'text' && b.text) parts.push({ text: b.text });
    else if (b?.type === 'tool_use') parts.push({ functionCall: { name: b.name, args: b.input || {} } });
  }
  return parts;
}

/**
 * One question end to end, tools and all. Same return shape as runIntelTurn()
 * in gemini-chat.js, plus `via: 'claude'`.
 */
export async function runClaudeTurn({
  history = [],
  userText,
  tools = [],
  ctx = {},
  systemInstruction = '',
  signal,
  maxRounds = MAX_TOOL_ROUNDS,
  ...transport
} = {}) {
  const contents = [...history, { role: 'user', parts: [{ text: String(userText || '') }] }];
  const claudeTools = toClaudeTools(tools);
  const toolCalls = [];
  const proposals = [];
  let model = '';
  let truncated = false;

  for (let round = 0; round < maxRounds; round++) {
    const data = await askStockroomClaude({
      op: 'message',
      system: systemInstruction || undefined,
      messages: toClaudeMessages(contents),
      tools: claudeTools.length ? claudeTools : undefined,
      max_tokens: 2048,
    }, { ...transport, signal });
    const message = data.message || {};
    model = message.model || model;
    truncated = message.stop_reason === 'max_tokens';
    if (message.stop_reason === 'refusal') {
      throw Object.assign(new Error('Claude declined to answer that one — try asking it another way'), { status: 422, __viaClaude: true, __alreadyFriendly: true });
    }
    const parts = toGeminiParts(message.content);
    const calls = parts.filter(p => p.functionCall).map(p => p.functionCall);
    if (!calls.length) {
      const text = parts.filter(p => p.text).map(p => p.text).join('').trim();
      return {
        text, history: [...contents, { role: 'model', parts }],
        toolCalls, proposals, model, via: 'claude', rounds: round, hitRoundCap: false, truncated,
      };
    }
    contents.push({ role: 'model', parts });
    const responses = [];
    for (const call of calls) {
      const result = runIntelTool(call.name, call.args, ctx);
      toolCalls.push({ name: call.name, args: call.args });
      if (call.name === 'proposeEdits' && result && result.ok && result.batch) proposals.push(result.batch);
      responses.push({ functionResponse: { name: call.name, response: { result } } });
    }
    contents.push({ role: 'user', parts: responses });
  }
  return { text: '', history: contents, toolCalls, proposals, model, via: 'claude', rounds: maxRounds, hitRoundCap: true, truncated };
}

/**
 * Read a receipt, invoice or email with Claude. Takes the same Gemini-style
 * `parts` as the other readers (`{ text }`, `{ inline_data: { mime_type, data } }`)
 * and returns `{ text, truncated, model, via }` with the JSON answer as text.
 */
export async function runClaudeRead({ parts = [], schema, maxOutputTokens = 8192, signal, ...transport } = {}) {
  const content = parts.map(part => {
    if (typeof part.text === 'string') return { type: 'text', text: part.text };
    const file = part.inline_data || part.inlineData;
    const mime = file?.mime_type || file?.mimeType;
    if (!file?.data || !mime) throw Object.assign(new Error('Claude could not open this attachment'), { __viaClaude: true, __alreadyFriendly: true });
    if (IMAGE_TYPES.includes(mime)) return { type: 'image', source: { type: 'base64', media_type: mime, data: file.data } };
    if (mime === 'application/pdf') return { type: 'document', source: { type: 'base64', media_type: mime, data: file.data } };
    throw Object.assign(new Error('Claude reads photos (JPEG, PNG, WebP or GIF) and PDF files'), { __viaClaude: true, __alreadyFriendly: true });
  });
  // The answer shape goes in as words rather than a strict format: the readers'
  // schemas were written for Google, and the callers already repair JSON that
  // comes back wrapped in a fence.
  const shape = schema ? `\n\nThe JSON must follow this schema:\n${JSON.stringify(toJsonSchema(schema))}` : '';
  const data = await askStockroomClaude({
    op: 'message',
    system: `Reply with only one JSON object and no other words.${shape}`,
    messages: [{ role: 'user', content }],
    max_tokens: Math.min(8192, Math.max(256, Number(maxOutputTokens) || 8192)),
  }, { ...transport, signal });
  const message = data.message || {};
  if (message.stop_reason === 'refusal') throw Object.assign(new Error('Claude declined to read this one'), { status: 422, __viaClaude: true, __alreadyFriendly: true });
  const text = (message.content || []).filter(b => b?.type === 'text').map(b => b.text).join('').trim();
  if (!text) throw Object.assign(new Error('Claude returned nothing'), { __viaClaude: true, __alreadyFriendly: true });
  return { text, truncated: message.stop_reason === 'max_tokens', model: message.model || '', via: 'claude' };
}

/**
 * Ask with Claude switched on: Claude first when the owner chose that, else the
 * other AIs first and Claude only when they couldn't answer. `others` is the
 * existing Gemini-then-OpenRouter path (or null when no key is saved).
 *
 * When both sides fail, the error from the other AIs is the one thrown: its
 * wording and status are what the callers already act on (stopping a scan on a
 * refused key, and so on). Claude's own reason goes along as `claudeError`.
 */
export async function withClaude({ claude, others, claudeFirst = false, onSwitch }) {
  if (!claude) return others();
  if (!others) return claude();
  const first = claudeFirst ? claude : others;
  const second = claudeFirst ? others : claude;
  let firstError;
  try {
    return await first();
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
    firstError = e;
    if (onSwitch) onSwitch(e, { toClaude: !claudeFirst });
  }
  try {
    return await second();
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
    const othersError = claudeFirst ? e : firstError;
    const claudeError = claudeFirst ? firstError : e;
    if (othersError && typeof othersError === 'object') othersError.claudeError = claudeError;
    throw othersError;
  }
}

/** Plain words for a Claude failure (the website already wrote them). */
export function friendlyClaudeError(e) {
  if (e?.name === 'AbortError') return 'the question was stopped';
  if (typeof navigator !== 'undefined' && navigator && navigator.onLine === false) return 'you are offline — reconnect and try again';
  const raw = String(e?.message || e || '').trim();
  return raw ? raw.slice(0, 220) : 'Claude did not say why';
}
