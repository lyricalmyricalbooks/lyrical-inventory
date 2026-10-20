// The old way of copying text: a hidden textarea and the legacy copy command.
// Used when the async clipboard is missing (an insecure page) or refuses the
// write. The box is fixed and see-through so selecting it never scrolls or
// flashes the page, and it is always removed. The legacy command can't report
// failure reliably, so callers toast success after it either way.
export function legacyCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch (_) { /* nothing more to try */ }
  ta.remove();
}
