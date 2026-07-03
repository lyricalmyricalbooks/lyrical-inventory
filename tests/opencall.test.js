import { describe, it, expect } from 'vitest';
import {
  OC_STAGES, ocNextAction, newContributor, parseContributorRows, findUnfilledMergeFields,
  ocProposalKey, ocProposalSummary, ocProposalsFromScan, ocApplyProposal,
  ocNextSendStage, ocOutboxKey, ocOutboxAdditions, ocPruneQueues, ocMergeTemplate,
} from '../src/lib/opencall.js';

describe('newContributor', () => {
  it('starts with every stage flag false', () => {
    const c = newContributor({ name: 'Ada', email: 'ada@x.com' });
    OC_STAGES.forEach(st => expect(c[st.key]).toBe(false));
    expect(c.name).toBe('Ada');
    expect(c.email).toBe('ada@x.com');
    expect(c.creditName).toBe('');
    expect(c.notes).toBe('');
    expect(c.id).toMatch(/^oc_/);
  });

  it('gives distinct ids', () => {
    expect(newContributor().id).not.toBe(newContributor().id);
  });
});

describe('ocNextAction', () => {
  it('points at the first incomplete stage', () => {
    expect(ocNextAction(newContributor())).toBe(OC_STAGES[0].hint);
  });

  it('advances as stages are ticked', () => {
    const c = newContributor();
    c.selectionSent = true;
    expect(ocNextAction(c)).toBe(OC_STAGES[1].hint);
  });

  it('returns null when every stage is complete', () => {
    const c = newContributor();
    OC_STAGES.forEach(st => { c[st.key] = true; });
    expect(ocNextAction(c)).toBeNull();
  });
});

describe('parseContributorRows', () => {
  it('parses comma- and tab-separated rows', () => {
    const raw = 'Ada Lovelace, ada@x.com, ada_1.jpg\nGrace Hopper\tgrace@x.com\tgrace_2.jpg';
    const { contributors, added, skipped } = parseContributorRows(raw);
    expect(added).toBe(2);
    expect(skipped).toBe(0);
    expect(contributors[0]).toMatchObject({ name: 'Ada Lovelace', email: 'ada@x.com', photo: 'ada_1.jpg' });
    expect(contributors[1]).toMatchObject({ name: 'Grace Hopper', email: 'grace@x.com', photo: 'grace_2.jpg' });
  });

  it('skips a header row', () => {
    const raw = 'Artist Name, Email Address, Photo Files\nAda, ada@x.com, ada.jpg';
    const { added, contributors } = parseContributorRows(raw);
    expect(added).toBe(1);
    expect(contributors[0].name).toBe('Ada');
  });

  it('skips blank lines', () => {
    const { added } = parseContributorRows('Ada, ada@x.com\n\n   \nGrace, grace@x.com');
    expect(added).toBe(2);
  });

  it('does not duplicate existing emails (case-insensitive)', () => {
    const { added, skipped } = parseContributorRows('Ada, ADA@x.com\nGrace, grace@x.com', ['ada@x.com']);
    expect(added).toBe(1);
    expect(skipped).toBe(1);
  });

  it('dedupes within the pasted block too', () => {
    const { added, skipped } = parseContributorRows('Ada, ada@x.com\nAda again, ada@x.com');
    expect(added).toBe(1);
    expect(skipped).toBe(1);
  });

  it('imported contributors start fresh with no stages ticked', () => {
    const { contributors } = parseContributorRows('Ada, ada@x.com');
    OC_STAGES.forEach(st => expect(contributors[0][st.key]).toBe(false));
  });

  it('handles null or undefined input safely', () => {
    const nullResult = parseContributorRows(null);
    expect(nullResult).toEqual({ contributors: [], added: 0, skipped: 0 });

    const undefinedResult = parseContributorRows(undefined);
    expect(undefinedResult).toEqual({ contributors: [], added: 0, skipped: 0 });
  });

  it('captures Credit Name and Notes (columns 4 and 5)', () => {
    const { contributors } = parseContributorRows('Jeremy Ackman, ackmanj@gmail.com, Jeremy_ackman_5.jpg, J. Ackman, Selected');
    expect(contributors[0]).toMatchObject({
      name: 'Jeremy Ackman', email: 'ackmanj@gmail.com', photo: 'Jeremy_ackman_5.jpg',
      creditName: 'J. Ackman', notes: 'Selected',
    });
  });

  it('captures Credit Name and Notes from tab-separated rows too', () => {
    const { contributors } = parseContributorRows('Ada\tada@x.com\tada.jpg\tAda L.\tVIP');
    expect(contributors[0]).toMatchObject({ creditName: 'Ada L.', notes: 'VIP' });
  });

  it('honors quoted fields with commas inside (Excel-style CSV)', () => {
    const raw = '"Ackman, Jeremy",ackmanj@gmail.com,photo.jpg,"Ackman, J.","Selected, files pending"';
    const { contributors, added } = parseContributorRows(raw);
    expect(added).toBe(1);
    expect(contributors[0]).toMatchObject({
      name: 'Ackman, Jeremy', creditName: 'Ackman, J.', notes: 'Selected, files pending',
    });
  });

  it('unescapes doubled quotes inside a quoted field', () => {
    const { contributors } = parseContributorRows('Ada,ada@x.com,a.jpg,Ada,"said ""hi"" today"');
    expect(contributors[0].notes).toBe('said "hi" today');
  });

  it('keeps a newline inside a quoted Notes field in one record', () => {
    const raw = 'Ada,ada@x.com,a.jpg,Ada,"line one\nline two"\nGrace,grace@x.com';
    const { contributors, added } = parseContributorRows(raw);
    expect(added).toBe(2);
    expect(contributors[0].notes).toBe('line one\nline two');
    expect(contributors[1].name).toBe('Grace');
  });

  it('strips a UTF-8 BOM and handles CRLF line endings (Excel export)', () => {
    const raw = '﻿Name,Email,Photo,Credit Name,Notes\r\nAda,ada@x.com,a.jpg,Ada L.,VIP\r\n';
    const { contributors, added } = parseContributorRows(raw);
    expect(added).toBe(1);
    expect(contributors[0].name).toBe('Ada');
    expect(contributors[0].creditName).toBe('Ada L.');
  });

  it('skips the shipped template header row ("Name,Email,Photo,Credit Name,Notes")', () => {
    const { added, contributors } = parseContributorRows('Name,Email,Photo,Credit Name,Notes\nAda,ada@x.com');
    expect(added).toBe(1);
    expect(contributors[0].name).toBe('Ada');
  });

  it('does not mistake a real contributor for a header row', () => {
    // email cell contains an address → never treated as a header
    const { added } = parseContributorRows('Name, name@x.com');
    expect(added).toBe(1);
  });

  it('splits semicolon-separated photos from a quoted photo cell', () => {
    const { contributors } = parseContributorRows('Ada,ada@x.com,"a.jpg; b.jpg"');
    expect(contributors[0].photos).toEqual(['a.jpg', 'b.jpg']);
  });
});

describe('findUnfilledMergeFields', () => {
  const tmpl = 'Hi {{name}}, your photo "{{photo}}" is in {{project}}. Credit: {{creditName}}. Deadline {{date}}.';

  it('returns nothing when every referenced field has data', () => {
    const c = { name: 'Ada', photo: 'ada.jpg', creditName: 'Ada Lovelace' };
    expect(findUnfilledMergeFields(tmpl, c, { project: 'Book', date: 'July 15' })).toEqual([]);
  });

  it('flags a referenced field that resolves empty', () => {
    const c = { name: 'Ada', photo: '', creditName: 'Ada Lovelace' };
    expect(findUnfilledMergeFields(tmpl, c, { project: 'Book', date: 'July 15' })).toEqual(['photo']);
  });

  it('flags the deadline when context is missing it', () => {
    const c = { name: 'Ada', photo: 'ada.jpg', creditName: 'Ada' };
    expect(findUnfilledMergeFields(tmpl, c, { project: 'Book' })).toEqual(['date']);
  });

  it('falls back creditName to the contributor name like the sender does', () => {
    const c = { name: 'Ada', photo: 'ada.jpg', creditName: '' };
    expect(findUnfilledMergeFields(tmpl, c, { project: 'Book', date: 'July 15' })).toEqual([]);
  });

  it('flags creditName only when both creditName and name are blank', () => {
    const c = { name: '', photo: 'x.jpg', creditName: '' };
    // name token is also unfilled here; both reported in field order
    expect(findUnfilledMergeFields(tmpl, c, { project: 'Book', date: 'July 15' })).toEqual(['name', 'creditName']);
  });

  it('ignores tokens the template does not reference', () => {
    const c = { name: 'Ada' };
    expect(findUnfilledMergeFields('Hello {{name}}', c, {})).toEqual([]);
  });

  it('treats whitespace-only values as empty', () => {
    const c = { name: 'Ada', photo: '   ', creditName: 'Ada' };
    expect(findUnfilledMergeFields(tmpl, c, { project: 'Book', date: 'July 15' })).toEqual(['photo']);
  });

  it('handles empty/blank template and missing args safely', () => {
    expect(findUnfilledMergeFields('', {}, {})).toEqual([]);
    expect(findUnfilledMergeFields(null)).toEqual([]);
  });
});

describe('ocProposalsFromScan', () => {
  const ada = () => ({ ...newContributor({ name: 'Ada', email: 'ada@x.com' }), id: 'c1' });

  it('turns a credit reply into a pending proposal instead of applying it', () => {
    const c = ada();
    c.selectionSent = true;
    const updates = [{ email: 'ada@x.com', creditReceived: true, creditName: 'Ada L.', creditThreadId: 't1' }];
    const props = ocProposalsFromScan(updates, [c]);
    expect(props).toHaveLength(1);
    expect(props[0]).toMatchObject({ contributorId: 'c1', type: 'creditReceived', creditName: 'Ada L.', threadId: 't1' });
    // nothing applied to the contributor yet
    expect(c.creditReceived).toBe(false);
    expect(c.creditName).toBe('');
  });

  it('emits separate proposals for files and bounce findings', () => {
    const c = ada();
    const updates = [{ email: 'ADA@x.com', filesReceived: true, filesThreadId: 't2', undeliverable: true, bounceThreadId: 't3' }];
    const props = ocProposalsFromScan(updates, [c]);
    expect(props.map(p => p.type)).toEqual(['filesReceived', 'undeliverable']);
    expect(props[0].threadId).toBe('t2');
    expect(props[1].threadId).toBe('t3');
  });

  it('skips stages the contributor already has and unknown emails', () => {
    const c = ada();
    c.creditReceived = true;
    const updates = [
      { email: 'ada@x.com', creditReceived: true, creditThreadId: 't1' },
      { email: 'nobody@x.com', filesReceived: true },
    ];
    expect(ocProposalsFromScan(updates, [c])).toEqual([]);
  });

  it('dedupes against pending proposals and dismissed keys', () => {
    const c = ada();
    const up = { email: 'ada@x.com', filesReceived: true, filesThreadId: 't2' };
    const first = ocProposalsFromScan([up], [c]);
    expect(first).toHaveLength(1);
    // same detection again while the first is still pending → nothing new
    expect(ocProposalsFromScan([up], [c], first)).toEqual([]);
    // dismissed → never re-proposed
    const dismissed = { [ocProposalKey(first[0])]: '2026-07-03' };
    expect(ocProposalsFromScan([up], [c], [], dismissed)).toEqual([]);
  });
});

describe('ocApplyProposal', () => {
  it('applies a credit proposal with thread and name', () => {
    const c = newContributor({ name: 'Ada', email: 'ada@x.com' });
    const summary = ocApplyProposal(c, { type: 'creditReceived', threadId: 't1', creditName: 'Ada L.' });
    expect(c.creditReceived).toBe(true);
    expect(c.creditThreadId).toBe('t1');
    expect(c.creditName).toBe('Ada L.');
    expect(summary).toContain('Credit name received');
  });

  it('keeps an existing credit name when the proposal has none', () => {
    const c = newContributor({ name: 'Ada', creditName: 'Ada Lovelace' });
    ocApplyProposal(c, { type: 'creditReceived', creditName: '' });
    expect(c.creditName).toBe('Ada Lovelace');
  });

  it('applies files and bounce proposals', () => {
    const c = newContributor({ email: 'ada@x.com' });
    ocApplyProposal(c, { type: 'filesReceived', threadId: 't2' });
    ocApplyProposal(c, { type: 'undeliverable', threadId: 't3' });
    expect(c.filesReceived).toBe(true);
    expect(c.filesThreadId).toBe('t2');
    expect(c.undeliverable).toBe(true);
    expect(c.bounceThreadId).toBe('t3');
  });

  it('summarizes each proposal type', () => {
    expect(ocProposalSummary({ type: 'creditReceived', creditName: 'X' })).toContain('“X”');
    expect(ocProposalSummary({ type: 'filesReceived' })).toContain('files');
    expect(ocProposalSummary({ type: 'undeliverable' })).toContain('bounced');
  });
});

describe('ocNextSendStage / ocOutboxAdditions', () => {
  it('is null for a fresh contributor and a completed one', () => {
    const c = newContributor({ email: 'a@x.com' });
    expect(ocNextSendStage(c)).toBeNull();
    OC_STAGES.forEach(st => { c[st.key] = true; });
    expect(ocNextSendStage(c)).toBeNull();
  });

  it('queues the CMYK email once the credit name arrives, then pre-order after files', () => {
    const c = newContributor({ email: 'a@x.com' });
    c.selectionSent = true;
    c.creditReceived = true;
    expect(ocNextSendStage(c)).toBe('cmykSent');
    c.cmykSent = true;
    c.filesReceived = true;
    expect(ocNextSendStage(c)).toBe('preorderSent');
    const adds = ocOutboxAdditions(c);
    expect(adds).toHaveLength(1);
    expect(adds[0]).toMatchObject({ contributorId: c.id, stageKey: 'preorderSent' });
  });

  it('skips bounced addresses, missing emails, duplicates, and removed entries', () => {
    const c = newContributor({ email: 'a@x.com' });
    c.creditReceived = true;
    expect(ocOutboxAdditions({ ...c, email: '' })).toEqual([]);
    expect(ocOutboxAdditions({ ...c, undeliverable: true })).toEqual([]);
    const [entry] = ocOutboxAdditions(c);
    expect(ocOutboxAdditions(c, [entry])).toEqual([]);
    expect(ocOutboxAdditions(c, [], { [ocOutboxKey(entry)]: '2026-07-03' })).toEqual([]);
  });
});

describe('ocPruneQueues', () => {
  it('drops proposals whose stage got ticked another way and orphans', () => {
    const c = newContributor({ email: 'a@x.com' });
    c.id = 'c1';
    c.creditReceived = true;
    const inbox = [
      { id: 'p1', contributorId: 'c1', type: 'creditReceived' },
      { id: 'p2', contributorId: 'c1', type: 'filesReceived' },
      { id: 'p3', contributorId: 'gone', type: 'filesReceived' },
    ];
    const { inbox: kept } = ocPruneQueues([c], inbox, []);
    expect(kept.map(p => p.id)).toEqual(['p2']);
  });

  it('drops outbox entries once sent, bounced, or no longer next', () => {
    const c = newContributor({ email: 'a@x.com' });
    c.id = 'c1';
    c.creditReceived = true;
    const entry = { id: 'e1', contributorId: 'c1', stageKey: 'cmykSent' };
    expect(ocPruneQueues([c], [], [entry]).outbox).toHaveLength(1);
    c.cmykSent = true; // sent → drop
    expect(ocPruneQueues([c], [], [entry]).outbox).toEqual([]);
    c.cmykSent = false;
    c.undeliverable = true; // bounced → drop
    expect(ocPruneQueues([c], [], [entry]).outbox).toEqual([]);
  });
});

describe('ocMergeTemplate', () => {
  it('fills every token, with the same fallbacks the senders use', () => {
    const c = { name: 'Ada', photo: 'ada.jpg', creditName: '' };
    const out = ocMergeTemplate('{{name}} / {{photo}} / {{creditName}} / {{project}} / {{date}}', c, { project: 'Book', date: 'July 15' });
    expect(out).toBe('Ada / ada.jpg / Ada / Book / July 15');
  });

  it('falls back to Artist and empty strings safely', () => {
    expect(ocMergeTemplate('Hi {{name}}, {{photo}}{{project}}', {}, {})).toBe('Hi Artist, ');
    expect(ocMergeTemplate(null)).toBe('');
  });
});
