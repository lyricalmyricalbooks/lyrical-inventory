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

// What a publisher device should do with the Sheets connection saved in the
// cloud (settings/sheetsConnection) when it signs in:
//   'backfill' — this device is connected and the cloud has no copy yet, so
//                save this device's links for the others;
//   'adopt'    — this device has no connection, so take the cloud one;
//   'none'     — nothing to do.
// A cleared copy ({ url: '' }) means the publisher disconnected, so a device
// with no connection stays off. No copy at all predates the cloud copy; the
// approval-email endpoint (notifyUrl) holds the same web-app link then.
// `normalize` turns a pasted link into a clean web-app address, or '' if it
// isn't one.
export function planSheetsConnectionSync({ localUrl, localSpreadsheetUrl, conn, notifyUrl, normalize }) {
  if (localUrl) {
    return conn ? { action: 'none' } : { action: 'backfill', url: localUrl, spreadsheetUrl: localSpreadsheetUrl || '' };
  }
  const url = normalize(conn ? conn.url : (notifyUrl || ''));
  if (!url) return { action: 'none' };
  return { action: 'adopt', url, spreadsheetUrl: (conn && conn.spreadsheetUrl) || '' };
}
