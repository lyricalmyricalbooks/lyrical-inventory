// The publisher's saved Google Apps Script web-app URL, used as the CORS proxy
// for Canada Post and Zonos calls on the static GitHub Pages deploy.
//
// Connecting Sheets writes the same URL under three keys (lm-sheets-url,
// lm-notify-url, lm-last-sheets-url), and a settings restore or a
// disconnect/reconnect can leave only some of them set — so read all of them,
// then the in-memory globals main.js keeps, before giving up.
export function getSavedSheetsUrl() {
  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') {
      const url = localStorage.getItem('lm-sheets-url') || localStorage.getItem('lm-notify-url') || localStorage.getItem('lm-last-sheets-url') || '';
      if (url) return url;
    }
  } catch (_) {}
  try {
    if (typeof window !== 'undefined') {
      if (window.sheetsUrl) return window.sheetsUrl;
      if (window.notifyUrl) return window.notifyUrl;
    }
  } catch (_) {}
  return '';
}
