// The small markdown dialect used in Open Call and campaign email templates:
// **bold**, *italic*, [label](url) links, line breaks, plus the <mark>/<span>
// colour tags the template toolbar inserts. Everything else is escaped.
//
// Lives here rather than in features/opencall.js so the Customers screen can
// use it without pulling the whole Open Call screen into the first download.
import { escapeHtml } from './html.js';

export function parseMarkdownToHtml(text) {
  let html = escapeHtml(text);

  // Restore safe HTML tags that might have been escaped
  // 1. Restore <mark style="..."> and </mark>
  html = html.replace(/&lt;mark style=&quot;(.*?)&quot;&gt;/gi, '<mark style="$1">');
  html = html.replace(/&lt;mark&gt;/gi, '<mark>');
  html = html.replace(/&lt;\/mark&gt;/gi, '</mark>');

  // 2. Restore <span style="..."> and </span>
  html = html.replace(/&lt;span style=&quot;(.*?)&quot;&gt;/gi, '<span style="$1">');
  html = html.replace(/&lt;span&gt;/gi, '<span>');
  html = html.replace(/&lt;\/span&gt;/gi, '</span>');

  // 3. Restore other basic tags if they typed them
  html = html.replace(/&lt;strong&gt;/gi, '<strong>').replace(/&lt;\/strong&gt;/gi, '</strong>');
  html = html.replace(/&lt;em&gt;/gi, '<em>').replace(/&lt;\/em&gt;/gi, '</em>');
  html = html.replace(/&lt;br&gt;/gi, '<br>');

  // Links first, parked behind placeholders: the bold/italic rules below
  // must not rewrite the web address ("open_call_form" would otherwise turn
  // into "open<em>call</em>form" and send a dead link).
  const links = [];
  html = html.replace(/\[(.*?)\]\((.*?)\)/g, (_, label, url) => {
    links.push({ label, url });
    return `\u0000${links.length - 1}\u0000`;
  });
  html = applyEmphasis(html);
  html = html.replace(/\u0000(\d+)\u0000/g, (_, i) => {
    const { label, url } = links[Number(i)];
    return `<a href="${url}" target="_blank" style="color:var(--gold2);text-decoration:underline;">${applyEmphasis(label)}</a>`;
  });
  // line breaks
  html = html.replace(/\n/g, '<br>');
  return html;
}

// **bold** / __bold__ / *italic* / _italic_. The underscore forms only count
// at word edges, so snake_case_names and file_names_2027 stay as typed.
function applyEmphasis(html) {
  return html
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^\w])__(\S(?:.*?\S)?)__(?![\w])/g, '$1<strong>$2</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/(^|[^\w])_(\S(?:.*?\S)?)_(?![\w])/g, '$1<em>$2</em>');
}
