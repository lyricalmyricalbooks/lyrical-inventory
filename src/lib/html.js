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

export function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]);
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
