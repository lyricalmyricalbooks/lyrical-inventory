import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  SYNC_TONES, normalizePendingCount, pluralChanges, formatSyncAge, describeSyncStatus,
} from '../src/lib/sync-status.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mainJs = readFileSync(join(root, 'src/main.js'), 'utf8');
const indexHtml = readFileSync(join(root, 'index.html'), 'utf8');
const systemCss = readFileSync(join(root, 'src/styles/system.css'), 'utf8');

describe('normalizePendingCount', () => {
  it('passes through positive integers', () => {
    expect(normalizePendingCount(1)).toBe(1);
    expect(normalizePendingCount(42)).toBe(42);
  });

  it('floors fractions rather than rendering "1.5 changes"', () => {
    expect(normalizePendingCount(1.9)).toBe(1);
  });

  it('collapses junk, negatives and zero to 0', () => {
    for (const bad of [0, -3, NaN, Infinity, null, undefined, 'seven', {}]) {
      expect(normalizePendingCount(bad)).toBe(0);
    }
  });
});

describe('pluralChanges', () => {
  it('singularises exactly one', () => {
    expect(pluralChanges(1)).toBe('1 change');
  });

  it('pluralises everything else, including zero', () => {
    expect(pluralChanges(0)).toBe('0 changes');
    expect(pluralChanges(4)).toBe('4 changes');
  });
});

describe('formatSyncAge', () => {
  const now = 1_700_000_000_000;

  it('reads anything under a minute as "moments ago"', () => {
    expect(formatSyncAge(now - 1_000, now)).toBe('moments ago');
    expect(formatSyncAge(now - 59_000, now)).toBe('moments ago');
  });

  it('steps up through minutes, hours and days', () => {
    expect(formatSyncAge(now - 60_000, now)).toBe('1 min ago');
    expect(formatSyncAge(now - 14 * 60_000, now)).toBe('14 min ago');
    expect(formatSyncAge(now - 60 * 60_000, now)).toBe('1 hr ago');
    expect(formatSyncAge(now - 5 * 60 * 60_000, now)).toBe('5 hrs ago');
    expect(formatSyncAge(now - 26 * 60 * 60_000, now)).toBe('1 day ago');
    expect(formatSyncAge(now - 72 * 60 * 60_000, now)).toBe('3 days ago');
  });

  // A device whose clock runs a little fast must not report "-2 min ago".
  it('treats a future stamp as "moments ago", never a negative age', () => {
    expect(formatSyncAge(now + 30_000, now)).toBe('moments ago');
  });

  it('returns an empty string when there is nothing to date', () => {
    for (const bad of [null, undefined, 0, -1, NaN, 'yesterday']) {
      expect(formatSyncAge(bad, now)).toBe('');
    }
  });
});

describe('describeSyncStatus — visibility', () => {
  it('says nothing at all when online with an empty queue', () => {
    const v = describeSyncStatus({ online: true, pending: 0 });
    expect(v.visible).toBe(false);
    expect(v.title).toBe('');
  });

  it('defaults to online, so a caller with no navigator paints nothing', () => {
    expect(describeSyncStatus().visible).toBe(false);
    expect(describeSyncStatus({}).visible).toBe(false);
  });

  it('survives a null input', () => {
    expect(describeSyncStatus(null).visible).toBe(false);
  });

  // The whole point: offline is worth saying even with nothing queued yet,
  // because the next sale is the one that would silently queue.
  it('shows offline even when the queue is empty', () => {
    const v = describeSyncStatus({ online: false, pending: 0 });
    expect(v.visible).toBe(true);
    expect(v.tone).toBe(SYNC_TONES.OFFLINE);
  });
});

describe('describeSyncStatus — offline', () => {
  it('counts the work waiting on this device', () => {
    const v = describeSyncStatus({ online: false, pending: 3 });
    expect(v.tone).toBe(SYNC_TONES.OFFLINE);
    expect(v.title).toBe('No connection');
    expect(v.detail).toContain('3 changes');
    expect(v.detail).toContain('back online');
  });

  it('reassures rather than counts when nothing is queued', () => {
    const v = describeSyncStatus({ online: false, pending: 0 });
    expect(v.detail).toContain('keep selling');
    expect(v.detail).not.toMatch(/\d+ changes?/);
  });

  // Retrying with no connection can only fail, so no button is offered.
  it('offers no retry action while offline', () => {
    expect(describeSyncStatus({ online: false, pending: 5 }).action).toBeNull();
  });

  it('dates the cloud copy when a last-upload stamp is known', () => {
    const now = 1_700_000_000_000;
    const v = describeSyncStatus({ online: false, pending: 1, lastSyncedAt: now - 20 * 60_000, now });
    expect(v.meta).toBe('Last upload 20 min ago');
  });

  it('omits the meta line entirely when nothing has ever uploaded', () => {
    expect(describeSyncStatus({ online: false, pending: 1, lastSyncedAt: null }).meta).toBe('');
  });
});

describe('describeSyncStatus — online with a queue', () => {
  it('reads as a quiet upload in progress', () => {
    const v = describeSyncStatus({ online: true, pending: 2, retrying: false });
    expect(v.tone).toBe(SYNC_TONES.PENDING);
    expect(v.title).toBe('Uploading');
    expect(v.detail).toContain('2 changes');
    expect(v.action).toBeNull();
  });

  it('escalates to a retryable failure once the drain is backing off', () => {
    const v = describeSyncStatus({ online: true, pending: 2, retrying: true });
    expect(v.tone).toBe(SYNC_TONES.FAILED);
    expect(v.action).toEqual({ label: 'Try again now', title: expect.any(String) });
    expect(v.detail).toContain('Nothing is lost');
  });

  // A retry flag left set after the queue drained must not keep an alarm on
  // screen — the queue length is the authority on whether anything is stuck.
  it('hides completely when retrying but nothing is queued', () => {
    expect(describeSyncStatus({ online: true, pending: 0, retrying: true }).visible).toBe(false);
  });
});

describe('describeSyncStatus — copy quality', () => {
  const cases = [
    { online: false, pending: 0 },
    { online: false, pending: 1 },
    { online: true, pending: 1, retrying: false },
    { online: true, pending: 1, retrying: true },
  ];

  it('never renders undefined into any visible field', () => {
    for (const c of cases) {
      const v = describeSyncStatus(c);
      for (const key of ['tone', 'icon', 'title', 'detail', 'meta', 'srText']) {
        expect(typeof v[key], `${key} for ${JSON.stringify(c)}`).toBe('string');
        expect(v[key]).not.toContain('undefined');
      }
    }
  });

  it('always exposes a spoken summary that repeats the headline', () => {
    for (const c of cases) {
      const v = describeSyncStatus(c);
      expect(v.srText).toContain(v.detail);
    }
  });

  // AGENTS.md: the shop owner is not technical. "Firestore", "queue" and
  // "sync" are our words, not theirs.
  it('keeps developer vocabulary out of the visible copy', () => {
    for (const c of cases) {
      const v = describeSyncStatus(c);
      const text = `${v.title} ${v.detail} ${v.meta}`.toLowerCase();
      for (const jargon of ['firestore', 'queue', 'localstorage', 'promise', 'null']) {
        expect(text, `${jargon} in ${JSON.stringify(c)}`).not.toContain(jargon);
      }
    }
  });
});

describe('wiring', () => {
  it('reflects a dropped connection immediately, not at the next save', () => {
    expect(mainJs).toMatch(/addEventListener\('offline'/);
  });

  it('renders the chip on boot so a reload while offline still warns', () => {
    expect(mainJs).toMatch(/initStickyOffset\(\);[\s\S]{0,400}?renderSyncChip\(\);/);
  });

  it('stamps a confirmed cloud write so "Last upload" can be measured', () => {
    expect(mainJs).toContain('function markCloudSynced');
    // Both write paths — the direct save and the queue drain — must stamp.
    expect(mainJs.match(/markCloudSynced\(\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('clears the retry flag once the queue drains', () => {
    expect(mainJs).toContain('_syncRetrying = false');
    expect(mainJs).toContain('_syncRetrying = true');
  });

  it('exposes the retry handler the chip button calls by name', () => {
    expect(indexHtml).toContain('onclick="retrySyncNow()"');
    expect(mainJs).toContain('function retrySyncNow');
    expect(mainJs).toMatch(/renderSyncChip,\s*retrySyncNow,/);
  });

  it('ships the chip markup with a polite live region', () => {
    expect(indexHtml).toMatch(/id="sync-chip"[^>]*role="status"/);
    expect(indexHtml).toMatch(/id="sync-chip"[^>]*aria-live="polite"/);
    // Hidden by default: an app that boots online must show nothing.
    expect(indexHtml).toMatch(/id="sync-chip"[^>]*\shidden/);
  });
});

describe('styling', () => {
  it('hides via [hidden] rather than leaving display:flex winning', () => {
    expect(systemCss).toContain('.sync-chip[hidden] { display: none; }');
    expect(systemCss).toContain('.sync-chip-action[hidden] { display: none; }');
  });

  it('gives the retry button a full Fitts target', () => {
    expect(systemCss).toMatch(/\.sync-chip-action\s*\{[^}]*min-height:\s*var\(--target-min\)/);
  });

  it('puts the last-upload figure in tabular mono like every other number', () => {
    expect(systemCss).toMatch(/\.sync-chip-meta\s*\{[^}]*font-feature-settings:\s*"tnum"/);
  });

  it('stops both animations under prefers-reduced-motion', () => {
    const block = systemCss.slice(systemCss.indexOf('.sync-chip {'));
    const reduced = block.match(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/)?.[0] || '';
    expect(reduced).toContain('.sync-chip { animation: none; }');
    expect(reduced).toContain('.sync-chip.is-pending .sync-chip-ico { animation: none; }');
  });

  it('uses status tokens for every tone so both themes follow', () => {
    expect(systemCss).toContain('.sync-chip.is-offline { border-left-color: var(--status-active); }');
    expect(systemCss).toContain('.sync-chip.is-failed { border-left-color: var(--status-critical); }');
    expect(systemCss).toContain('.sync-chip.is-pending { border-left-color: var(--status-info); }');
  });

  // Fixed, not sticky: a sticky band under the header would land inside the
  // offset the ledger column labels pin against (see lib/sticky-header.js).
  it('is fixed so it cannot disturb the sticky ledger headers', () => {
    expect(systemCss).toMatch(/\.sync-chip\s*\{[^}]*position:\s*fixed/);
  });
});
