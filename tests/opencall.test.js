import { describe, it, expect } from 'vitest';
import { OC_STAGES, ocNextAction, newContributor, parseContributorRows } from '../src/lib/opencall.js';

describe('newContributor', () => {
  it('starts with every stage flag false', () => {
    const c = newContributor({ name: 'Ada', email: 'ada@x.com' });
    OC_STAGES.forEach(st => expect(c[st.key]).toBe(false));
    expect(c.name).toBe('Ada');
    expect(c.email).toBe('ada@x.com');
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
});
