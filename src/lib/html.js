// Canonical HTML-escaping helper.
//
// Escapes the five characters that can break out of an HTML text node or a
// double/single-quoted attribute value. Use this anywhere user-controlled
// text is interpolated into an innerHTML template string.
//
// For values placed inside an HTML attribute, keep the attribute
// double-quoted in the template and pass the value through escapeHtml — the
// escaped &quot; / &#39; keep the value inside the attribute.
const ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

// Most text (titles, names, prices) has nothing to escape, and testing for a
// special character first is about twice as fast as running the replace
// callback over it; escapeHtml runs for every cell of every table render.
const NEEDS_ESCAPE = /[&<>"']/;
const ESCAPE_CHARS = /[&<>"']/g;

export function escapeHtml(s) {
  const str = String(s == null ? '' : s);
  return NEEDS_ESCAPE.test(str) ? str.replace(ESCAPE_CHARS, (c) => ESCAPE_MAP[c]) : str;
}

// Returns a normalised http(s) URL string, or '' when the value is not a
// safe web link (javascript:, data:, malformed, ...). A bare host such as
// "pay.example.com/me" is upgraded to https://. Safe to set as an href.
export function safeHttpUrl(raw) {
  const v = String(raw == null ? '' : raw).trim();
  if (!v) return '';
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : 'https://' + v;
  try {
    const u = new URL(candidate);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : '';
  } catch (_) {
    return '';
  }
}

// True when text holds at least one real HTML tag (<p>, </div>, <br/>,
// <a href="...">). A stray '<' in prose ("under <$20", "I <3 this",
// "Jane <jane@example.com>") is not a tag, so a plain or markdown email
// body that happens to contain one is still treated as plain text.
const HTML_TAG = /<\/?[a-z][a-z0-9]*(\s[^<>]*)?\/?>/i;
export function hasHtmlTag(text) {
  return HTML_TAG.test(String(text == null ? '' : text));
}
