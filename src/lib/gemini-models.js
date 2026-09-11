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
 * Only a model with a free allowance may ever be called.
 *
 * Flash and Flash-Lite have one. Pro and Ultra do not, and a single call to
 * either is billed to whatever card is on the Google account — so the shape of
 * the name is the gate, and it is applied at the point of use rather than
 * trusted from a hand-edited list.
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
