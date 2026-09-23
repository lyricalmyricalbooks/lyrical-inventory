const pendingScripts = new Map();

/**
 * Loads a classic browser script once, even when several features request it
 * at the same time. A failed request is removed so a later user action can
 * retry after the connection recovers.
 */
export function loadExternalScript(src) {
  if (pendingScripts.has(src)) return pendingScripts.get(src);

  const pending = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    const script = existing || document.createElement('script');

    const loaded = () => resolve();
    const failed = () => {
      pendingScripts.delete(src);
      script.remove();
      reject(new Error(`Failed to load ${src}`));
    };

    script.addEventListener('load', loaded, { once: true });
    script.addEventListener('error', failed, { once: true });

    if (!existing) {
      script.src = src;
      script.async = true;
      document.head.appendChild(script);
    }
  });

  pendingScripts.set(src, pending);
  return pending;
}

function forgetExternalScript(src) {
  pendingScripts.delete(src);
  document.querySelector(`script[src="${src}"]`)?.remove();
}

export const XLSX_SCRIPT_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';

export async function ensureXlsx() {
  if (!window.XLSX) await loadExternalScript(XLSX_SCRIPT_URL);
  if (!window.XLSX) {
    // The file arrived but never installed its global (truncated download,
    // evaluation error). Forget it so the next import fetches it afresh
    // instead of re-awaiting the same resolved promise forever.
    forgetExternalScript(XLSX_SCRIPT_URL);
    throw new Error('Excel support did not finish loading');
  }
  return window.XLSX;
}
