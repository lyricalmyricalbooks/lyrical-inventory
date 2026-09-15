export function decodeGmailBase64(data) {
  const binary = atob(String(data || '').replaceAll('-', '+').replaceAll('_', '/'));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

export function gmailMessage(message, account) {
  const headers = message.payload?.headers || [];
  const header = name => headers.find(h => h.name.toLowerCase() === name)?.value || '';
  const plain = [], html = [], fileParts = [];
  function walk(part) {
    const mime = part.mimeType || '';
    const disposition = part.headers?.find(h => h.name.toLowerCase() === 'content-disposition')?.value || '';
    if (part.filename && (mime === 'application/pdf' || /^image\//.test(mime)) && !/^inline/i.test(disposition)) {
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
    list: (query, pageToken, signal) => gmail('messages?' + new URLSearchParams({ q: query, maxResults: '25', ...(pageToken ? { pageToken } : {}) }), signal),
    message: async (id, account, signal) => gmailMessage(await gmail(`messages/${encodeURIComponent(id)}?format=full`, signal), account),
    attachment: async (messageId, file, signal) => {
      if (file.size > 12 * 1024 * 1024) throw new Error(`${file.name} exceeds the 12 MB attachment limit. Download and review it separately.`);
      if (!file.base64 && file.attachmentId) {
        const data = await gmail(`messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(file.attachmentId)}`, signal);
        file.base64 = data.data;
      }
      if (!file.base64) throw new Error(`Could not download ${file.name}`);
      return file;
    },
  };
}

export async function extractFoundReceipts({ endpoint, idToken, email, signal, fetchImpl = fetch }) {
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(endpoint)) {
    throw new Error('Set the receipt AI deployment URL in Finder setup');
  }
  const files = email.fileParts.map(file => ({ inlineData: { mimeType: file.mime, data: file.base64.replaceAll('-', '+').replaceAll('_', '/') } }));
  const payload = JSON.stringify({ idToken, email: {
    subject: email.subject, from: email.from, date: email.date,
    body: email.body.length > 24000 ? email.body.slice(0, 18000) + '\n[Middle omitted]\n' + email.body.slice(-6000) : email.body,
  }, files });
  if (payload.length > 18 * 1024 * 1024) throw new Error('This email is too large for AI extraction. Review its attachments separately.');
  const res = await fetchImpl(endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: payload, signal, redirect: 'follow' });
  if (!res.ok) throw new Error(`Receipt AI request failed (${res.status})`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Receipt AI could not read this email');
  if (!Array.isArray(data.receipts)) throw new Error('Receipt AI returned an invalid response. Retry this email.');
  return data;
}
