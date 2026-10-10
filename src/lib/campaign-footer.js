// Opt-out footer for campaign emails. The campaign preview shows this footer, so
// the emails that actually go out must carry the same thing.
const SUBJECT = 'Unsubscribe';

export function campaignFooterText(replyTo) {
  const to = String(replyTo || '').trim();
  return to
    ? `You are receiving this email because you are a valued customer of Lyricalmyrical Books.\nTo unsubscribe, reply to this email or write to ${to} with the word "Unsubscribe".`
    : 'You are receiving this email because you are a valued customer of Lyricalmyrical Books.\nTo unsubscribe, reply to this email with the word "Unsubscribe".';
}

export function campaignFooterHtml(replyTo) {
  const to = String(replyTo || '').trim().replace(/[<>"'&\s]/g, '');
  const link = to
    ? `<a href="mailto:${to}?subject=${SUBJECT}" style="color:#8a5815;text-decoration:underline;">Unsubscribe</a>`
    : 'Unsubscribe (reply with that word)';
  return '<div style="font-size:11px;color:#63605c;border-top:1px dashed #eee;margin-top:24px;padding-top:12px;line-height:1.4;">'
    + 'You are receiving this email because you are a valued customer of Lyricalmyrical Books.<br>'
    + `${link} from this list.</div>`;
}

// Plain-text version of an HTML body: drop everything between '<' and '>',
// turning <br>, </p>, </div> and </li> into line breaks. A single pass over the
// characters, so it never re-parses the body as HTML and leaves no partial tag
// behind; any '<' left unclosed at the end is dropped with what follows it.
function htmlToPlainText(html) {
  let out = '';
  let tag = null;
  for (const ch of html) {
    if (tag === null) {
      if (ch === '<') tag = '';
      else if (ch !== '>') out += ch;
    } else if (ch === '>') {
      if (/^(br\b|\/(p|div|li)\b)/i.test(tag.trim())) out += '\n';
      tag = null;
    } else {
      tag += ch;
    }
  }
  return out;
}

// Returns { body, htmlBody } ready for sendSingleEmailViaBackend, with the
// footer appended to both the plain and HTML versions. `toHtml` converts the
// authored body (plain/markdown) to HTML.
export function withCampaignFooter(body, replyTo, toHtml) {
  const raw = String(body || '');
  const isHtml = raw.includes('<');
  let plain = raw;
  if (isHtml) plain = htmlToPlainText(raw);
  return {
    body: `${plain}\n\n--\n${campaignFooterText(replyTo)}`,
    htmlBody: (isHtml ? raw : toHtml(raw)) + campaignFooterHtml(replyTo),
  };
}
