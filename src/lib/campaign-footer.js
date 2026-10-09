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

// Returns { body, htmlBody } ready for sendSingleEmailViaBackend, with the
// footer appended to both the plain and HTML versions. `toHtml` converts the
// authored body (plain/markdown) to HTML.
export function withCampaignFooter(body, replyTo, toHtml) {
  const raw = String(body || '');
  const isHtml = raw.includes('<');
  let plain = raw;
  if (isHtml) {
    let prev;
    do { prev = plain; plain = plain.replace(/<[^>]*>/g, ''); } while (plain !== prev);
    plain = plain.replace(/[<>]/g, '');
  }
  return {
    body: `${plain}\n\n--\n${campaignFooterText(replyTo)}`,
    htmlBody: (isHtml ? raw : toHtml(raw)) + campaignFooterHtml(replyTo),
  };
}
