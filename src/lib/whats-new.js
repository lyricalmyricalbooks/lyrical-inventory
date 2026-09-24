// "What's new" — turns the repository's commit history into notes a shop
// owner can read. Pure helpers (no DOM) so they can be unit-tested.
//
// Commit messages are written for developers ("perf: shorten app startup
// critical path (#901)", "44px taps", co-author trailers). The owner needs to
// know three things instead: what changed, whether it affects them, and — when
// there is something to try — where to find it. So:
//
//   1. A commit can carry its own plain-language note in the body:
//        For you: CSV files now import even when you're offline.
//        Try it: Settings → Import → choose a .csv file.
//      Write these lines whenever a change is something the owner will notice.
//   2. Recent changes that predate that convention get a hand-written note
//      below, keyed by pull-request number.
//   3. Anything else falls back to its cleaned-up title, and purely internal
//      work (tests, refactors, docs, CI, merges) is left out entirely.

// Hand-written notes for changes merged before commits carried "For you:".
// `skip: true` marks behind-the-scenes work that changes nothing on screen.
export const PLAIN_NOTES = {
  906: { kind: 'fixed', title: 'Spreadsheet imports are more reliable', detail: 'CSV files now import even when you have no internet connection, and prices written like "$1,250.00" are read correctly instead of coming in as zero.' },
  905: { kind: 'improved', title: 'The "Hide menu alerts" switch has moved', detail: 'It now sits in your account menu, next to Appearance, instead of in the middle of the side menu.', tryIt: 'Click your name at the bottom of the side menu, then choose "Hide menu alerts".' },
  904: { kind: 'new', title: 'You can hide the red alert dots in the side menu', detail: 'Handy when you know about something and don\'t want the reminder. Nothing is deleted — your To-do list still has everything.', tryIt: 'Click your name at the bottom of the side menu, then choose "Hide menu alerts". Choose it again to bring them back.' },
  903: { kind: 'improved', title: 'Easier to use on your phone', detail: 'Screens no longer slide sideways, buttons are bigger and easier to tap, and the page no longer zooms in when you tap into a box on an iPhone.' },
  902: { kind: 'fixed', title: 'The main screen fits smaller windows', detail: 'The side menu and pages now adjust properly when the browser window is narrow.' },
  901: { kind: 'faster', title: 'The app opens faster', detail: 'Less is loaded when the app starts. The Excel reader is now fetched only the first time you import a spreadsheet.' },
  900: { skip: true },
  899: { kind: 'improved', title: 'Your publisher name shows correctly everywhere', detail: 'The side menu and sign-in screen now read "Lyricalmyrical Books".' },
  898: { kind: 'new', title: 'Nothing is lost when two devices edit the same thing', detail: 'If you change the same record on two devices while offline, the version that was set aside is now kept so you can compare and choose.', tryIt: 'Open the Backups tab and look for "Review sync conflicts" when the side menu shows a badge there.' },
  897: { kind: 'fixed', title: 'Customer lists are now private to you', detail: 'Your mailing list, campaigns and open-call contributors can only be seen by the publisher account. The app also starts more reliably offline.' },
  896: { kind: 'fixed', title: 'Invoice lines are clearer', detail: 'The quantity is always visible, and an invoice line can no longer end up with a negative amount.' },
  895: { kind: 'improved', title: 'AI tools keep working when your free allowance runs out', detail: 'If you have saved a backup AI key, every AI feature — receipt scans, the chat panel and email reading — now switches to it straight away.' },
  894: { skip: true },
  893: { kind: 'fixed', title: 'The receipt finder finds real receipts', detail: 'It now searches your email for receipts and invoices specifically, so genuine receipts are no longer buried under other mail.' },
  892: { kind: 'fixed', title: 'Night mode looks right on every screen', detail: 'Text that was hard to read in night mode is now clear, and panels no longer hide under the side menu.' },
};

const KIND_LABEL = { new: 'New', fixed: 'Fixed', faster: 'Faster', improved: 'Improved' };
export function kindLabel(kind) { return KIND_LABEL[kind] || KIND_LABEL.improved; }

// Conventional-commit types that never change anything the owner sees.
const INTERNAL_TYPES = /^(test|tests|refactor|chore|ci|build|docs|style)(\(|!|:)/i;
const TRAILER = /^(co-authored-by|signed-off-by|claude-session|reviewed-by|generated with|🤖)\b/i;

function prNumber(title) {
  const m = title.match(/\(#(\d+)\)\s*$/);
  return m ? Number(m[1]) : null;
}

function guessKind(rawTitle) {
  const t = rawTitle.toLowerCase();
  if (/^feat\b/.test(t) || /^add\b/.test(t)) return 'new';
  if (/^fix\b/.test(t) || /^fix(es|ed)?\b/.test(t)) return 'fixed';
  if (/^perf\b/.test(t) || /\bfaster\b/.test(t)) return 'faster';
  return 'improved';
}

function cleanTitle(rawTitle) {
  let t = rawTitle
    .replace(/^[^\p{L}\p{N}]+/u, '')              // leading emoji / symbols
    .replace(/^[a-z]+(\([^)]*\))?!?:\s*/i, '')     // "feat(nav): "
    .replace(/\s*\(#\d+\)\s*$/, '')                // " (#905)"
    .trim();
  return t ? t[0].toUpperCase() + t.slice(1) : '';
}

function pickLine(lines, label) {
  const re = new RegExp(`^\\s*${label}\\s*:\\s*(.+)$`, 'i');
  for (const l of lines) { const m = l.match(re); if (m) return m[1].trim(); }
  return '';
}

/**
 * One commit as a plain-language note, or null when it should be hidden.
 * @param {{message: string, date?: string, sha?: string, fullSha?: string}} commit
 * @returns {{kind: string, title: string, detail: string, tryIt: string, pr: number|null, date?: string, fullSha?: string} | null}
 */
export function plainChange(commit) {
  const message = String(commit?.message || '');
  const lines = message.split(/\r?\n/);
  const rawTitle = (lines[0] || '').trim();
  if (!rawTitle || /^merge\b/i.test(rawTitle) || /^revert\b/i.test(rawTitle)) return null;

  const pr = prNumber(rawTitle);
  const base = { pr, date: commit.date, fullSha: commit.fullSha };
  const note = pr != null ? PLAIN_NOTES[pr] : null;
  if (note?.skip) return null;
  if (note) return { ...base, kind: note.kind, title: note.title, detail: note.detail || '', tryIt: note.tryIt || '' };

  const body = lines.slice(1).filter(l => !TRAILER.test(l.trim()));
  const forYou = pickLine(body, 'for you');
  const tryIt = pickLine(body, 'try it');
  // Internal work stays out of the list unless its author says it matters.
  if (!forYou && INTERNAL_TYPES.test(rawTitle)) return null;

  const title = cleanTitle(rawTitle);
  if (!title) return null;
  return { ...base, kind: guessKind(rawTitle), title, detail: forYou, tryIt };
}

/** Plain notes for a list of commits, newest first, hidden ones dropped. */
export function plainChanges(commits, limit = 8) {
  return (commits || []).map(plainChange).filter(Boolean).slice(0, limit);
}

// The build stamp is "YYYY-MM-DDTHH:MM:SS±HH:MM" (git %cI). Older builds used
// "YYYY-MM-DD HH:MM:SS" with no offset; both parse.
export function parseBuildDate(stamp) {
  if (!stamp || typeof stamp !== 'string') return null;
  const d = new Date(stamp.includes('T') ? stamp : stamp.replace(' ', 'T'));
  return isNaN(d) ? null : d;
}

// Whole local calendar days from `date` to `now` (0 = same day, 1 = yesterday),
// counted midnight to midnight rather than in 24-hour blocks.
function calendarDaysAgo(date, now) {
  const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((startOfDay(now) - startOfDay(date)) / 86400000);
}

/** "just now" / "3 hours ago" / "yesterday" / "4 days ago" / "on 2 Sep". */
export function relativeWhen(date, now = new Date()) {
  if (!(date instanceof Date) || isNaN(date)) return '';
  const mins = Math.round((now - date) / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  const days = calendarDaysAgo(date, now);
  if (days === 0) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return 'on ' + date.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

/** Day heading for grouping notes: "Today", "Yesterday", "Monday 21 September". */
export function dayHeading(date, now = new Date()) {
  if (!(date instanceof Date) || isNaN(date)) return 'Earlier';
  const days = calendarDaysAgo(date, now);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return date.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
}
