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
  result.bodyHtml = typeof saved.bodyHtml === 'string' ? sanitizeLetterheadBody(saved.bodyHtml.slice(0, 60000)) : '';
  return result;
}

const line = (value) => escapeHtml(value).replace(/\r\n|\n|\r/g, '<br>');

export function sanitizeLetterheadBody(html) {
  const document = new DOMParser().parseFromString(String(html || ''), 'text/html');
  const allowed = new Set(['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'UL', 'OL', 'LI', 'DIV', 'SPAN']);
  const drop = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'SVG', 'MATH', 'IMG', 'FORM']);
  const render = (node) => {
    if (node.nodeType === 3) return escapeHtml(node.textContent);
    if (node.nodeType !== 1 || drop.has(node.tagName)) return '';
    const content = Array.from(node.childNodes, render).join('');
    if (!allowed.has(node.tagName)) return content;
    if (node.tagName === 'BR') return '<br>';
    let tag = ({ B: 'strong', I: 'em', DIV: 'p' })[node.tagName] || node.tagName.toLowerCase();
    const align = node.style?.textAlign;
    const alignment = ['left', 'center', 'right'].includes(align) && (tag === 'p' || tag === 'li') ? ` style="text-align:${align}"` : '';
    if (tag === 'span') {
      let result = content;
      if (node.style?.fontWeight === 'bold' || Number(node.style?.fontWeight) >= 600) result = `<strong>${result}</strong>`;
      if (node.style?.fontStyle === 'italic') result = `<em>${result}</em>`;
      if (node.style?.textDecoration?.includes('underline')) result = `<u>${result}</u>`;
      return result;
    }
    return `<${tag}${alignment}>${content}</${tag}>`;
  };
  return Array.from(document.body.childNodes, render).join('');
}

function displayDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return line(iso);
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (date.getFullYear() !== Number(match[1]) || date.getMonth() !== Number(match[2]) - 1 || date.getDate() !== Number(match[3])) return line(iso);
  return escapeHtml(new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: 'long', day: 'numeric' }).format(date));
}

export function renderLetterhead(letter) {
  const d = normalizeLetterhead(letter);
  const contact = [d.address, d.phone, d.email, d.website].filter(Boolean).map(line).join('<br>');
  return `<article class="letterhead-page" style="--letter-accent:${d.accent}">
    <header class="letterhead-paper-header">
      <div class="letterhead-brand">${d.logo ? `<img class="letterhead-logo" src="${d.logo}" alt="">` : ''}<div class="letterhead-name">${line(d.name)}</div></div>
      <div class="letterhead-contact">${contact}</div>
    </header>
    <div class="letterhead-meta"><div>${line(d.recipient)}</div><div>${displayDate(d.date)}</div></div>
    ${d.subject ? `<h2 class="letterhead-subject">${line(d.subject)}</h2>` : ''}
    <div class="letterhead-body">${d.bodyHtml || line(d.body)}</div>
    <div class="letterhead-signoff">${line(d.signoff)}${d.signature ? `<br><br>${line(d.signature)}` : ''}</div>
    <footer class="letterhead-paper-footer">${line(d.name)}${d.website ? ` · ${line(d.website)}` : ''}</footer>
  </article>`;
}
