// Canonical HTML-escaping helper.
//
// Escapes the five characters that can break out of an HTML text node or a
// double/single-quoted attribute value. Use this anywhere user-controlled
// text is interpolated into an innerHTML template string.
//
// For values placed inside an HTML attribute, keep the attribute
// double-quoted in the template and pass the value through escapeHtml — the
// escaped &quot; / &#39; keep the value inside the attribute.
export function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}
