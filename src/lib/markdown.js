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

  // bold **text** or __text__
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');
  // italic *text* or _text_
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  html = html.replace(/_(.*?)_/g, '<em>$1</em>');
  // links [label](url)
  html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" style="color:var(--gold2);text-decoration:underline;">$1</a>');
  // line breaks
  html = html.replace(/\n/g, '<br>');
  return html;
}
