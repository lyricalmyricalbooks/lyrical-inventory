import { describe, it, expect } from 'vitest';
import {
  ocCurrentStage, ocNudgeDue, ocNudgeTemplateKey, ocProblems, ocMatchesFilter,
  ocFilterCounts, ocMatchesSearch, ocSortContributors, OC_NUDGE_AFTER_DAYS, OC_NUDGE_GAP_DAYS,
} from '../src/lib/opencall.js';

const NOW = Date.parse('2026-09-24T12:00:00Z');
const daysAgo = (n) => new Date(NOW - n * 86400000).toISOString();

// A contributor at a given point in the pipeline (stages ticked up to `upTo`).
function at(stageCount, extra = {}) {
  const keys = ['selectionSent', 'creditReceived', 'cmykSent', 'filesReceived', 'preorderSent'];
  const flags = Object.fromEntries(keys.map((k, i) => [k, i < stageCount]));
  return { id: 'c' + Math.random(), name: 'Ada', email: 'ada@x.com', gmailThreadId: 't1', ...flags, ...extra };
}

describe('ocCurrentStage', () => {
  it('is the first unticked stage, or complete', () => {
    expect(ocCurrentStage(at(0))).toBe('selectionSent');
    expect(ocCurrentStage(at(1))).toBe('creditReceived');
    expect(ocCurrentStage(at(3))).toBe('filesReceived');
    expect(ocCurrentStage(at(5))).toBe('complete');
  });
  it('tolerates a missing contributor', () => {
    expect(ocCurrentStage(null)).toBe('selectionSent');
  });
});

describe('ocNudgeDue', () => {
  it('is due once an artist has sat on a request long enough', () => {
    expect(ocNudgeDue(at(1, { lastStageAt: daysAgo(OC_NUDGE_AFTER_DAYS) }), NOW)).toBe(true);
    expect(ocNudgeDue(at(1, { lastStageAt: daysAgo(OC_NUDGE_AFTER_DAYS - 1) }), NOW)).toBe(false);
  });
  it('only applies while we are waiting on the artist', () => {
    // Waiting on us (send the files request) is not the artist's delay.
    expect(ocNudgeDue(at(2, { lastStageAt: daysAgo(30) }), NOW)).toBe(false);
    expect(ocNudgeDue(at(3, { lastStageAt: daysAgo(30) }), NOW)).toBe(true);
    expect(ocNudgeDue(at(5, { lastStageAt: daysAgo(30) }), NOW)).toBe(false);
  });
  it('never nudges a bounced or missing address', () => {
    expect(ocNudgeDue(at(1, { lastStageAt: daysAgo(30), undeliverable: true }), NOW)).toBe(false);
    expect(ocNudgeDue(at(1, { lastStageAt: daysAgo(30), email: '' }), NOW)).toBe(false);
  });
  it('waits a gap after the last reminder before suggesting another', () => {
    const base = { lastStageAt: daysAgo(30) };
    expect(ocNudgeDue(at(1, { ...base, lastNudgedAt: daysAgo(1) }), NOW)).toBe(false);
    expect(ocNudgeDue(at(1, { ...base, lastNudgedAt: daysAgo(OC_NUDGE_GAP_DAYS) }), NOW)).toBe(true);
  });
  it('falls back to createdAt and ignores undated records', () => {
    expect(ocNudgeDue(at(1, { createdAt: '2026-01-01' }), NOW)).toBe(true);
    expect(ocNudgeDue(at(1), NOW)).toBe(false);
  });
});

describe('ocNudgeTemplateKey', () => {
  it('picks the reminder for what the artist still owes', () => {
    expect(ocNudgeTemplateKey(at(1))).toBe('nudgeCredit');
    expect(ocNudgeTemplateKey(at(3))).toBe('nudgeFiles');
    expect(ocNudgeTemplateKey(at(0))).toBe(null);
    expect(ocNudgeTemplateKey(at(2))).toBe(null);
  });
});

describe('ocProblems', () => {
  it('flags a missing email', () => {
    expect(ocProblems(at(0, { email: '' }))).toEqual(['noEmail']);
  });
  it('flags a bounce and an unsubscribe', () => {
    const c = at(1, { undeliverable: true });
    expect(ocProblems(c, () => true)).toEqual(['bounced', 'unsubscribed']);
  });
  it('flags a missing Gmail thread only once the first email has gone', () => {
    expect(ocProblems(at(0, { gmailThreadId: '' }))).toEqual([]);
    expect(ocProblems(at(1, { gmailThreadId: '' }))).toEqual(['noThread']);
    expect(ocProblems(at(1, { gmailThreadId: '', creditThreadId: 'x' }))).toEqual([]);
    // Nothing left to send, so a missing thread no longer matters.
    expect(ocProblems(at(5, { gmailThreadId: '' }))).toEqual([]);
  });
});

describe('ocFilterCounts / ocMatchesFilter agree', () => {
  const list = [
    at(0), at(0, { email: '' }),
    at(1, { lastStageAt: daysAgo(10) }), at(1, { lastStageAt: daysAgo(1) }),
    at(3, { lastStageAt: daysAgo(20), undeliverable: true }),
    at(5),
  ];
  const counts = ocFilterCounts(list, { now: NOW });
  it('counts each tab', () => {
    expect(counts['']).toBe(6);
    expect(counts.selectionSent).toBe(2);
    expect(counts.creditReceived).toBe(2);
    expect(counts.filesReceived).toBe(1);
    expect(counts.complete).toBe(1);
    expect(counts.nudge).toBe(1);
    expect(counts.problems).toBe(2);
  });
  it('every count equals the rows its filter shows', () => {
    Object.keys(counts).forEach(f => {
      expect(list.filter(c => ocMatchesFilter(c, f, { now: NOW })).length, f).toBe(counts[f]);
    });
  });
});

describe('ocMatchesSearch', () => {
  const c = { name: 'Ada Lovelace', email: 'ada@x.com', creditName: 'A. L.', photos: ['engine_01.jpg'], notes: 'Loves bleed' };
  it('matches name, email, credit, photo and notes, case-insensitively', () => {
    ['ada lov', 'X.COM', 'a. l.', 'ENGINE_01', 'bleed', ''].forEach(q => expect(ocMatchesSearch(c, q), q).toBe(true));
    expect(ocMatchesSearch(c, 'babbage')).toBe(false);
  });
});

describe('ocSortContributors', () => {
  const a = { name: 'Bea', createdAt: '2026-01-02', selectionSent: true, lastStageAt: daysAgo(2) };
  const b = { name: 'Al', createdAt: '2026-01-03', lastStageAt: daysAgo(9) };
  const done = { name: 'Cy', createdAt: '2026-01-01', selectionSent: true, creditReceived: true, cmykSent: true, filesReceived: true, preorderSent: true, lastStageAt: daysAgo(90) };
  const names = (l) => l.map(c => c.name);
  it('sorts by date, name and progress', () => {
    expect(names(ocSortContributors([a, b, done], 'dateDesc', NOW))).toEqual(['Al', 'Bea', 'Cy']);
    expect(names(ocSortContributors([a, b, done], 'dateAsc', NOW))).toEqual(['Cy', 'Bea', 'Al']);
    expect(names(ocSortContributors([a, b, done], 'nameAsc', NOW))).toEqual(['Al', 'Bea', 'Cy']);
    expect(names(ocSortContributors([a, b, done], 'progressDesc', NOW))).toEqual(['Cy', 'Bea', 'Al']);
  });
  it('puts the longest-waiting open contributor first, finished ones last', () => {
    expect(names(ocSortContributors([a, b, done], 'waitingDesc', NOW))).toEqual(['Al', 'Bea', 'Cy']);
  });
  it('does not mutate the input', () => {
    const input = [a, b, done];
    ocSortContributors(input, 'nameDesc', NOW);
    expect(names(input)).toEqual(['Bea', 'Al', 'Cy']);
  });
});
