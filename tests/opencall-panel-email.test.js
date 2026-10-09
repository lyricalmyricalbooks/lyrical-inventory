import { describe, it, expect } from 'vitest';
import { ocNextEmailKey, ocFieldWords, ocTrimQuotedReply, OC_NUDGE_AFTER_DAYS } from '../src/lib/opencall.js';

const NOW = Date.parse('2026-10-09T12:00:00Z');
const daysAgo = (n) => new Date(NOW - n * 86400000).toISOString();
function at(stageCount, extra = {}) {
  const keys = ['selectionSent', 'creditReceived', 'cmykSent', 'filesReceived', 'preorderSent'];
  const flags = Object.fromEntries(keys.map((k, i) => [k, i < stageCount]));
  return { id: 'c1', name: 'Ada', email: 'ada@x.com', ...flags, ...extra };
}

describe('ocNextEmailKey', () => {
  it('is the step email when it is the owner’s move', () => {
    expect(ocNextEmailKey(at(0), { now: NOW })).toBe('selectionSent');
    expect(ocNextEmailKey(at(2), { now: NOW })).toBe('cmykSent');
    expect(ocNextEmailKey(at(4), { now: NOW })).toBe('preorderSent');
  });
  it('is the right reminder only once one is due', () => {
    expect(ocNextEmailKey(at(1, { lastStageAt: daysAgo(1) }), { now: NOW })).toBe(null);
    expect(ocNextEmailKey(at(1, { lastStageAt: daysAgo(OC_NUDGE_AFTER_DAYS) }), { now: NOW })).toBe('nudgeCredit');
    expect(ocNextEmailKey(at(3, { lastStageAt: daysAgo(30) }), { now: NOW })).toBe('nudgeFiles');
  });
  it('is nothing when no email can go out or every step is done', () => {
    expect(ocNextEmailKey(at(0, { email: '' }), { now: NOW })).toBe(null);
    expect(ocNextEmailKey(at(0, { undeliverable: true }), { now: NOW })).toBe(null);
    expect(ocNextEmailKey(at(0), { now: NOW, isSuppressed: () => true })).toBe(null);
    expect(ocNextEmailKey(at(5), { now: NOW })).toBe(null);
  });
});

describe('ocFieldWords', () => {
  it('names blank merge fields in plain words', () => {
    expect(ocFieldWords(['creditName', 'date'])).toEqual(['the credit name', 'the deadline date']);
    expect(ocFieldWords([])).toEqual([]);
  });
});

describe('ocTrimQuotedReply', () => {
  it('keeps only the new part above a Gmail-style quote header', () => {
    const t = 'Please credit me as A. Okafor.\n\nThanks!\n\nOn Tue, Sep 30, 2026 at 10:02 AM Lyricalmyrical <hi@x.com> wrote:\n> You’re in!';
    expect(ocTrimQuotedReply(t)).toBe('Please credit me as A. Okafor.\n\nThanks!');
  });
  it('handles a quote header that wraps onto two lines', () => {
    const t = 'Files attached.\n\nOn Tue, Sep 30, 2026 at 10:02 AM Lyricalmyrical Books <\nhi@x.com> wrote:\n> old';
    expect(ocTrimQuotedReply(t)).toBe('Files attached.');
  });
  it('stops at quoted lines and Outlook headers', () => {
    expect(ocTrimQuotedReply('Yes!\n> earlier')).toBe('Yes!');
    expect(ocTrimQuotedReply('Done.\n-----Original Message-----\nFrom: x')).toBe('Done.');
  });
  it('leaves a message with no quote alone, and copes with empty input', () => {
    expect(ocTrimQuotedReply('Just a note.\nSecond line.')).toBe('Just a note.\nSecond line.');
    expect(ocTrimQuotedReply(undefined)).toBe('');
  });
});
