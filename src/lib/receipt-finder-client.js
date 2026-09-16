// Gmail reading + the receipt-AI call, kept free of DOM so both can be tested
// directly. The AI half talks to the publisher's Apps Script deployment; the
// Gmail half talks to Google with a read-only token held by the browser.

// Exactly what the Apps Script accepts. Sending anything else makes the script
// reject the whole email ("Unsupported attachment"), so an email carrying one
// GIF used to lose its real PDF invoice too. Filter here instead.
const ATTACHMENT_MIMES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const MIME_ALIASES = { 'image/jpg': 'image/jpeg', 'image/pjpeg': 'image/jpeg', 'image/x-png': 'image/png' };

// Gmail sends `image/jpeg; name="scan.jpg"` as often as the bare type.
export function normalizeAttachmentMime(value) {
  const bare = String(value || '').split(';')[0].trim().toLowerCase();
  return MIME_ALIASES[bare] || bare;
}

// Gmail's base64url is not always padded, and the script's allow-list regex
// only tolerates padding at the very end. Normalise once, in one place.
export function toStandardBase64(data) {
  const body = String(data || '').replaceAll('-', '+').replaceAll('_', '/').replace(/[=\s]+$/, '');
  return body + '='.repeat((4 - (body.length % 4)) % 4);
}

export function decodeGmailBase64(data) {
  const binary = atob(toStandardBase64(data));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

export function gmailMessage(message, account) {
  const headers = message.payload?.headers || [];
  const header = name => headers.find(h => h.name.toLowerCase() === name)?.value || '';
  const plain = [], html = [], fileParts = [];
  function walk(part) {
    const mime = normalizeAttachmentMime(part.mimeType);
    const disposition = part.headers?.find(h => h.name.toLowerCase() === 'content-disposition')?.value || '';
    const inline = /^inline/i.test(disposition);
    // Inline IMAGES are signature logos and tracking pixels. An inline PDF is
    // still an invoice — several suppliers send them exactly that way, and
    // dropping them used to leave a PDF-only invoice email with nothing to read.
    if (part.filename && ATTACHMENT_MIMES.has(mime) && !(inline && mime !== 'application/pdf')) {
      fileParts.push({ name: part.filename, mime, attachmentId: part.body?.attachmentId || '',
        partId: part.partId || '', size: part.body?.size || 0, base64: part.body?.data || '' });
    } else if (!part.filename && part.body?.data) {
      const text = new TextDecoder().decode(decodeGmailBase64(part.body.data));
      if (mime === 'text/plain') plain.push(text);
      else if (mime === 'text/html') html.push(text);
    }
    (part.parts || []).forEach(walk);
  }
  if (message.payload) walk(message.payload);
  // HTML is parsed inertly for text, never mounted into the live document.
  const body = plain.length ? plain.join('\n') : html.map(text => {
    const doc = new DOMParser().parseFromString(text, 'text/html');
    doc.querySelectorAll('script,style').forEach(el => el.remove());
    return doc.body.textContent || '';
  }).join('\n');
  return { id: message.id, account, from: header('From'), subject: header('Subject'),
    date: header('Date'), body, snippet: message.snippet || '', fileParts };
}

export const MAX_ATTACHMENT_BYTES = 12 * 1024 * 1024;

export function createReceiptFinderClient({ token, fetchImpl = fetch, onExpired = () => {} }) {
  async function gmail(path, signal) {
    const accessToken = token();
    if (!accessToken) throw new Error('Connect Gmail to scan receipts');
    const res = await fetchImpl('https://gmail.googleapis.com/gmail/v1/users/me/' + path, {
      headers: { Authorization: `Bearer ${accessToken}` }, signal,
    });
    if (res.status === 401) { onExpired(); throw new Error('Gmail access expired. Reconnect Gmail to continue.'); }
    if (!res.ok) throw new Error(res.status === 403 ? 'Gmail access was not granted. Enable Gmail API and reconnect with read-only permission.' : `Gmail request failed (${res.status}). Try again.`);
    return res.json();
  }
  return {
    profile: signal => gmail('profile', signal),
    list: (query, pageToken, signal, pageSize = 25) => gmail('messages?' + new URLSearchParams({
      q: query, maxResults: String(pageSize), ...(pageToken ? { pageToken } : {}) }), signal),
    message: async (id, account, signal) => gmailMessage(await gmail(`messages/${encodeURIComponent(id)}?format=full`, signal), account),
    // One oversized attachment must not cost the publisher the rest of the
    // email: mark it skipped and let the body and the other files through.
    attachment: async (messageId, file, signal) => {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        file.base64 = ''; file.skipped = `${file.name} is larger than 12 MB — open it in Gmail instead.`;
        return file;
      }
      if (!file.base64 && file.attachmentId) {
        const data = await gmail(`messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(file.attachmentId)}`, signal);
        file.base64 = data.data;
      }
      if (!file.base64) file.skipped = `Could not download ${file.name}`;
      return file;
    },
  };
}

export const FINDER_ENDPOINT_PATTERN = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/;
export const EXPECTED_FINDER_VERSION = 'v2';
export const EXPECTED_SHEETS_VERSION = 'v44';
const MAX_AI_FILES = 20;
const MAX_AI_PAYLOAD = 18 * 1024 * 1024;

// One request body both deployments understand: the unified Google Sheet
// script routes on `action`, the older standalone Receipt Finder script reads
// `idToken`/`email`/`files` straight off the top level and ignores the rest.
// Keeping the heavy `files` array at one level means neither shape doubles it.
export function receiptRequestBody({ idToken, email, files }) {
  return JSON.stringify({ version: 2, action: 'extractReceipt', idToken, email, files });
}

export async function extractFoundReceipts({ endpoint, idToken, email, signal, fetchImpl = fetch }) {
  if (!FINDER_ENDPOINT_PATTERN.test(endpoint || '')) {
    throw new Error('Connect your Google Sheet script before scanning for receipts');
  }
  const usable = email.fileParts.filter(file => file.base64 && ATTACHMENT_MIMES.has(file.mime)).slice(0, MAX_AI_FILES);
  const files = usable.map(file => ({ inlineData: { mimeType: file.mime, data: toStandardBase64(file.base64) } }));
  const body = receiptRequestBody({ idToken, email: {
    subject: email.subject, from: email.from, date: email.date,
    body: email.body.length > 24000 ? email.body.slice(0, 18000) + '\n[Middle omitted]\n' + email.body.slice(-6000) : email.body,
  }, files });
  if (body.length > MAX_AI_PAYLOAD) throw new Error('This email is too large for AI extraction. Review its attachments separately.');
  const res = await fetchImpl(endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body, signal, redirect: 'follow' });
  if (!res.ok) throw new Error(`Receipt AI request failed (${res.status})`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Receipt AI could not read this email');
  if (!Array.isArray(data.receipts)) throw new Error('Receipt AI returned an invalid response. Retry this email.');
  return data;
}

const SETUP_STEPS = {
  firebaseWebApiKey: 'Add FIREBASE_WEB_API_KEY — this project’s Firebase web API key — in the script’s Script Properties.',
  publisherUid: 'Add PUBLISHER_UID — the publisher’s Firebase sign-in ID — in the script’s Script Properties.',
  geminiApiKey: 'Add GEMINI_API_KEY — a Gemini key restricted to the Generative Language API — in the script’s Script Properties. It never goes into this app.',
  model: 'Fix GEMINI_MODEL: it must be a plain model name such as gemini-2.5-flash, or removed to use the default.',
};
const REDEPLOY_STEP = 'Open the “Connect your Google Sheet” tab, copy the script shown there into your Apps Script project, then Deploy → Manage deployments → Edit → New version.';

function summarise(steps, level) {
  if (!steps.length) return null;
  const missing = steps.length === 1 ? 'One thing is still missing.' : `${steps.length} things are still missing.`;
  return { level, headline: missing, steps };
}

// Plain-language reading of a deployment's own report. Kept free of fetch and
// DOM so the wording can be tested directly.
export function describeFinderSetup(report) {
  const service = typeof report?.service === 'string' ? report.service : '';

  // The recommended setup: the same Google Sheet script the app already uses.
  if (service.startsWith('lyrical-sheets-webhook')) {
    if (!report.capabilities?.receiptExtraction || !report.receiptAi) {
      return { level: 'error', headline: 'Your Google Sheet script is too old to read receipts.',
        steps: [REDEPLOY_STEP,
          `This deployment is running ${report.scriptVersion || 'an older version'}; reading receipts needs ${EXPECTED_SHEETS_VERSION} or newer.`] };
    }
    const steps = [];
    if (!report.receiptAi.geminiApiKey) steps.push(SETUP_STEPS.geminiApiKey);
    if (!report.receiptAi.model) steps.push(SETUP_STEPS.model);
    return summarise(steps, 'error')
      || { level: 'ready', headline: `Ready to scan using ${report.receiptAi.modelName || 'the default model'}.`, steps: [] };
  }

  // The original standalone deployment. Still supported, no longer required.
  if (service === 'lyrical-receipt-finder') {
    const steps = Object.keys(SETUP_STEPS).filter(key => !report.configured?.[key]).map(key => SETUP_STEPS[key]);
    if (report.scriptVersion !== EXPECTED_FINDER_VERSION) {
      steps.push(`This deployment is running ${report.scriptVersion || 'an older version'} and the app expects ${EXPECTED_FINDER_VERSION}. Paste the latest script in and deploy a new version.`);
    }
    return summarise(steps, report.ready ? 'warn' : 'error')
      || { level: 'ready', headline: `Ready to scan using ${report.model || 'the default model'}.`, steps: [] };
  }

  // A Receipt Finder deployment predating the setup report — it answers, but
  // with a different service name and none of the fields the app reads. Say so
  // instead of claiming the address is wrong, which is what it used to do.
  if (/receipt[-_]?finder/i.test(service)) {
    return { level: 'error', headline: 'This is an older Receipt Finder script the app can no longer read.',
      steps: ['You no longer need a second script. Clear this address to use the Google Sheet script you have already connected.',
        'If you would rather keep this separate deployment, paste in the current Receipt Finder script and deploy a new version.'] };
  }

  return { level: 'error', headline: 'That address did not answer as one of this app’s scripts.',
    steps: ['Check that the address ends in /exec and that the deployment runs as you, with access set to Anyone.'] };
}

export async function checkReceiptFinderService({ endpoint, fetchImpl = fetch, signal }) {
  if (!FINDER_ENDPOINT_PATTERN.test(endpoint || '')) {
    return { level: 'error', headline: 'Connect your Google Sheet first.',
      steps: ['The address looks like https://script.google.com/macros/s/…/exec — the “Connect your Google Sheet” tab has yours.'] };
  }
  let report;
  try {
    const res = await fetchImpl(endpoint, { method: 'GET', signal, redirect: 'follow' });
    if (!res.ok) throw new Error(String(res.status));
    report = await res.json();
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    return { level: 'error', headline: 'The script did not answer.',
      steps: ['Open the address in a browser tab. If it asks you to sign in, redeploy the web app with access set to Anyone and executing as you.',
        'If nothing loads at all, check that the deployment is still active and that you are online.'] };
  }
  return { ...describeFinderSetup(report), report };
}
