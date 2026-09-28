import { escapeHtml } from './html.js';

const FIELDS = ['name', 'address', 'email', 'website', 'phone', 'recipient', 'date', 'subject', 'body', 'signoff', 'signature'];

export function normalizeLetterhead(saved = {}, invoice = {}) {
  const result = {};
  for (const field of FIELDS) result[field] = String(saved[field] ?? '').slice(0, field === 'body' ? 30000 : 2000);
  for (const [field, source] of [['name', 'name'], ['address', 'addr'], ['email', 'email'], ['website', 'web']]) {
    if (saved[field] == null) result[field] = String(invoice[source] || (field === 'name' ? 'Lyricalmyrical Books' : ''));
  }
  result.accent = /^#[0-9a-fA-F]{6}$/.test(saved.accent || '') ? saved.accent : '#a87042';
  result.logo = /^data:image\/(?:png|jpeg|webp|gif);base64,[a-zA-Z0-9+/=]+$/.test(saved.logo || '') ? saved.logo : '';
  return result;
}

const line = (value) => escapeHtml(value).replace(/\r\n|\n|\r/g, '<br>');

export function renderLetterhead(letter) {
  const d = normalizeLetterhead(letter);
  const contact = [d.address, d.phone, d.email, d.website].filter(Boolean).map(line).join('<br>');
  return `<article class="letterhead-page" style="--letter-accent:${d.accent}">
    <header class="letterhead-paper-header">
      <div class="letterhead-brand">${d.logo ? `<img class="letterhead-logo" src="${d.logo}" alt="">` : ''}<div class="letterhead-name">${line(d.name)}</div></div>
      <div class="letterhead-contact">${contact}</div>
    </header>
    <div class="letterhead-meta"><div>${line(d.recipient)}</div><div>${line(d.date)}</div></div>
    ${d.subject ? `<h2 class="letterhead-subject">${line(d.subject)}</h2>` : ''}
    <div class="letterhead-body">${line(d.body)}</div>
    <div class="letterhead-signoff">${line(d.signoff)}${d.signature ? `<br><br>${line(d.signature)}` : ''}</div>
    <footer class="letterhead-paper-footer">${line(d.name)}${d.website ? ` · ${line(d.website)}` : ''}</footer>
  </article>`;
}
