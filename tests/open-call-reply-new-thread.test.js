import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

// Open Call reply detection runs against the real Code.gs with a fake Gmail.
// An artist's original submission (before any outreach) must never count as a
// reply, but a reply in a brand-new thread after our first email must.
const source = fs.readFileSync(path.resolve('apps-script/Code.gs'), 'utf8');
const ARTIST = 'ada@example.com';
const OURS = 'lyricalmyricalbooks@gmail.com';

const msg = (from, iso, attachments = 0) => ({
  getFrom: () => from, getDate: () => new Date(iso), getPlainBody: () => '',
  getAttachments: () => new Array(attachments).fill({}),
});
const thread = (id, msgs) => ({ getId: () => id, getMessages: () => msgs });

function scan(mailbox, flags = { selectionSent: true }) {
  const ctx = vm.createContext({
    GmailApp: {
      search: (q) => {
        if (q.includes('in:sent')) return mailbox.sent;
        if (q.startsWith('from:(mailer-daemon')) return [];
        if (q.startsWith('from:' + ARTIST)) return q.includes('has:attachment') ? mailbox.fromArtistWithFiles : mailbox.fromArtist;
        return [];
      },
    },
    console,
  });
  vm.runInContext(source, ctx);
  return ctx.ocScanContributor_({ email: ARTIST, ...flags }, 120);
}

describe('Open Call reply detection', () => {
  const submission = thread('sub', [msg(ARTIST, '2026-01-05T10:00:00Z', 2)]);
  const outreach = thread('out', [msg(OURS, '2026-02-01T10:00:00Z')]);

  it('ignores the original submission that predates our outreach', () => {
    const up = scan({ sent: [outreach], fromArtist: [submission], fromArtistWithFiles: [submission] });
    expect(up).toBeNull();
  });

  it('counts a reply the artist sends in a brand-new thread after our outreach', () => {
    const fresh = thread('fresh', [msg(ARTIST, '2026-02-10T09:00:00Z')]);
    const up = scan({ sent: [outreach], fromArtist: [submission, fresh], fromArtistWithFiles: [] });
    expect(up).toMatchObject({ creditReceived: true, creditThreadId: 'fresh' });
  });

  it('counts files only when the new-thread reply carries an attachment', () => {
    const noFiles = thread('t1', [msg(ARTIST, '2026-02-10T09:00:00Z', 0)]);
    const withFiles = thread('t2', [msg(ARTIST, '2026-02-11T09:00:00Z', 1)]);
    const flags = { cmykSent: true };
    expect(scan({ sent: [outreach], fromArtist: [], fromArtistWithFiles: [noFiles] }, flags)).toBeNull();
    expect(scan({ sent: [outreach], fromArtist: [], fromArtistWithFiles: [withFiles] }, flags))
      .toMatchObject({ filesReceived: true, filesThreadId: 't2' });
  });

  it('counts nothing in other threads when we never emailed the artist', () => {
    const fresh = thread('fresh', [msg(ARTIST, '2026-02-10T09:00:00Z')]);
    expect(scan({ sent: [], fromArtist: [fresh], fromArtistWithFiles: [] })).toBeNull();
  });

  it('still counts a same-thread reply after our message', () => {
    const same = thread('same', [msg(OURS, '2026-02-01T10:00:00Z'), msg(ARTIST, '2026-02-02T10:00:00Z')]);
    expect(scan({ sent: [], fromArtist: [same], fromArtistWithFiles: [] })).toMatchObject({ creditThreadId: 'same' });
  });
});
