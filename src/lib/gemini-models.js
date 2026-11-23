/**
 * Which Gemini models the receipt scanner is allowed to use, and in what order.
 *
 * The scanner used to name its models in a constant, which meant a newer,
 * faster reader sat unused until somebody edited the code and shipped a
 * release. These helpers rank whatever the Gemini API says the publisher's own
 * key can reach, so a new Flash model is picked up on its own.
 *
 * Nothing here talks to the network — it only sorts and filters a list that has
 * already been fetched, so the rules below can be reasoned about and tested on
 * their own.
 */

/**
 * Only a model that can have a free allowance may ever be called.
 *
 * Pro, Ultra and the named flagship models (Gemini 4 Argon) have none, and a
 * single call to one is billed to whatever card is on the Google account — so
 * the shape of the name is the gate, applied at the point of use rather than
 * trusted from a hand-edited list. Being a Flash model is necessary but no
 * longer enough: Google does not give every Flash a free allowance on every
 * key. A key with no allowance for one is told "limit: 0", and
 * geminiModelRefused() below lets the scan move on to the next model instead
 * of stopping there.
 */
export const GEMINI_FREE_TIER_MODEL = /-flash(-lite)?$/;

/**
 * A stable, generally-available Flash model and nothing else.
 *
 * Anchored at both ends deliberately. It is what keeps preview, experimental
 * and dated builds — `gemini-3.8-flash-preview-09-2026`, `-exp`, `-8b` — out of
 * a business ledger: those carry tighter free limits, change behaviour without
 * notice, and get retired abruptly. A shop's bookkeeping is the wrong place to
 * find that out.
 */
const STABLE_FLASH = /^gemini-(\d+)(?:\.(\d+))?-flash(-lite)?$/;

/**
 * Read one entry from the models API (or a bare id) into something sortable.
 *
 * @param {{name?: string}|string} entry
 * @returns {{id: string, major: number, minor: number, lite: boolean}|null}
 *   null for anything that is not a stable free-tier Flash model.
 */
export function parseGeminiModel(entry) {
  const raw = typeof entry === 'string' ? entry : (entry && entry.name) || '';
  const id = String(raw).replace(/^models\//, '').trim();
  const m = STABLE_FLASH.exec(id);
  if (!m) return null;
  // A missing minor is 0, so a future "gemini-4-flash" still sorts above 3.8
  // instead of being dropped for not matching the shape of today's names.
  return { id, major: Number(m[1]), minor: Number(m[2] || 0), lite: !!m[3] };
}

/**
 * The models worth trying, newest first.
 *
 * @param {Array<{name?: string, supportedGenerationMethods?: string[]}|string>} entries
 *   Whatever `GET /v1beta/models` returned, or a plain list of ids.
 * @returns {string[]} Model ids, best first. Empty if nothing qualifies.
 */
export function rankFreeGeminiModels(entries) {
  const list = Array.isArray(entries) ? entries : [];
  const seen = new Set();
  const usable = [];

  for (const entry of list) {
    // A model that cannot answer a generateContent call is no use to the
    // scanner however new it is — embedding and token-counting models come
    // back in the same list.
    const methods = typeof entry === 'string' ? null : entry && entry.supportedGenerationMethods;
    if (Array.isArray(methods) && !methods.includes('generateContent')) continue;

    const parsed = parseGeminiModel(entry);
    if (!parsed || !GEMINI_FREE_TIER_MODEL.test(parsed.id)) continue;
    if (GEMINI_ROUTED_MODELS.has(parsed.id)) continue;
    if (seen.has(parsed.id)) continue;
    seen.add(parsed.id);
    usable.push(parsed);
  }

  usable.sort((a, b) => (
    b.major - a.major
    || b.minor - a.minor
    // At the same version, full Flash before Flash-Lite: Lite is cheaper and
    // quicker but reads a creased, faded till receipt noticeably worse, and a
    // misread total is more expensive than a slower scan. Lite stays in the
    // chain as the rung below rather than being dropped.
    || Number(a.lite) - Number(b.lite)
  ));

  return usable.map(m => m.id);
}

/**
 * Model names Google still answers to but no longer runs as themselves.
 *
 * Since 2026-10-08 a request to either of these is quietly served by a newer
 * model (3.7 Flash by 3.8 Flash, 3.5 Flash by 3.6 Flash). Keeping them in the
 * chain only spends a rung — and on a bad receipt, a whole extra upload — on a
 * model that is already in the chain under its real name.
 */
export const GEMINI_ROUTED_MODELS = new Set(['gemini-3.7-flash', 'gemini-3.5-flash']);

/**
 * True when this model wants the named thinking control (`thinkingLevel`)
 * rather than the old numeric budget.
 *
 * Gemini 3 and later take `thinkingLevel`; Google's guide for them says to
 * replace `thinkingBudget`. Only the 2.x family still reads the number. Asking
 * the right way first saves a refused request on every scan of a session.
 */
export function geminiUsesThinkingLevel(model) {
  const m = /^gemini-(\d+)/.exec(String(model || ''));
  return !m || Number(m[1]) >= 3;
}

/**
 * True when Google refused THIS model for this key, rather than the key or the
 * request being the problem — so the next model in the chain is worth asking.
 *
 * The case that matters most: a model with no free allowance on a key without
 * billing answers 429 with "limit: 0". Read as an ordinary quota error, that
 * stopped the whole scan on the newest model before an older, free one was
 * ever tried, and every scan failed the same way.
 *
 * @param {number} status HTTP status.
 * @param {string} message Google's error message.
 */
export function geminiModelRefused(status, message) {
  const text = String(message || '');
  if (status === 404) return true;
  // A key that is wrong, or a project Google has shut out, fails the same way
  // on every model; walking the chain would only repeat the upload.
  if (/API key|api_key|UNAUTHENTICATED|denied access|billing account|prepayment/i.test(text)) return false;
  if (status === 429 && /\blimit:\s*0\b/i.test(text)) return true;
  if ((status === 400 || status === 403)
    && /\bmodel\b/i.test(text)
    && /(?:not|no longer) (?:available|supported|found|offered)|does not have access|not have access/i.test(text)) {
    return true;
  }
  return false;
}

/**
 * A failed response's JSON body, read once and kept on the response.
 *
 * Both the retry decision and the error report need it, and a fetch body can
 * only be read once.
 */
export async function geminiErrorBody(res) {
  if (!res || typeof res !== 'object') return null;
  if (!Object.prototype.hasOwnProperty.call(res, '__geminiBody')) {
    let body = null;
    try { body = await res.json(); } catch (_) { body = null; }
    try { Object.defineProperty(res, '__geminiBody', { value: body }); } catch (_) { return body; }
  }
  return res.__geminiBody;
}
