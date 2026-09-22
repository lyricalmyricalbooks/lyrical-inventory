// How much of an Intelligence conversation is carried into the next question.
//
// Every question re-sends the turns before it, and a turn is not always a
// question or an answer: when the model looks something up, one question
// becomes a chain — the question, the model asking for a tool, the tool's
// result, perhaps another round, then the answer. Both providers refuse a chain
// that has been cut in the middle. Google rejects a tool result whose call is
// missing ("function response turn comes immediately after a function call
// turn"), and the backup rejects a tool message with no call before it. So a
// plain "keep the last eight turns" — which is what this replaced — made any
// follow-up after a two-lookup answer fail on Google AND on the backup, the
// one moment the backup exists for.
//
// The conversation is kept in Google's shape (see openrouter-chat.js for why),
// so that is the shape these read. Nothing here talks to the network.

const textParts = (entry) => (entry?.parts || [])
  .filter(p => p && typeof p.text === 'string' && !p.thought && p.text.trim());

const hasCalls = (entry) => (entry?.parts || []).some(p => p && p.functionCall);

/** A turn the publisher typed: words, and no tool result riding along. */
export function isIntelQuestion(entry) {
  return entry?.role === 'user'
    && textParts(entry).length > 0
    && !(entry.parts || []).some(p => p && p.functionResponse);
}

/** A turn where the model answered in words rather than asking for a tool. */
export function isIntelAnswer(entry) {
  return entry?.role === 'model' && textParts(entry).length > 0 && !hasCalls(entry);
}

/**
 * Make sure a finished question ends on the words the publisher actually saw.
 *
 * Two answers leave the history without one: a model that ran out of lookup
 * rounds (the history ends on a tool result) and a model that replied with
 * nothing (Google refuses an empty text part when it is sent back later). The
 * panel shows its own wording for both, and that wording is what is stored.
 */
export function closeIntelExchange(history, shownText) {
  const list = Array.isArray(history) ? history.slice() : [];
  const last = list[list.length - 1];
  if (isIntelAnswer(last)) return list;
  if (last && last.role === 'model' && !hasCalls(last)) list.pop();
  const text = String(shownText || '').trim();
  if (text) list.push({ role: 'model', parts: [{ text }] });
  return list;
}

/**
 * The most recent whole questions that fit in `limit` turns.
 *
 * Only ever cuts where a question starts, and drops a question that never got
 * an answer rather than sending half of it. When the newest question alone is
 * longer than the limit — a long investigation — it keeps that question and its
 * answer, without the lookups in between, so "and last year?" still has
 * something to follow on from.
 */
export function trimIntelHistory(history, limit = 8) {
  const list = Array.isArray(history) ? history.filter(e => e && Array.isArray(e.parts)) : [];
  const exchanges = [];
  for (const entry of list) {
    if (isIntelQuestion(entry)) exchanges.push([entry]);
    // Anything before the first question is the tail of an exchange whose
    // start is already gone, and is dropped with it.
    else if (exchanges.length) exchanges[exchanges.length - 1].push(entry);
  }
  const complete = exchanges.filter(x => x.length > 1 && isIntelAnswer(x[x.length - 1]));

  const kept = [];
  let size = 0;
  for (let i = complete.length - 1; i >= 0; i--) {
    const exchange = complete[i];
    if (size + exchange.length > limit) {
      if (!kept.length) {
        const answer = exchange[exchange.length - 1];
        kept.unshift([exchange[0], { role: 'model', parts: textParts(answer).map(p => ({ text: p.text })) }]);
      }
      break;
    }
    kept.unshift(exchange);
    size += exchange.length;
  }
  return kept.flat();
}
