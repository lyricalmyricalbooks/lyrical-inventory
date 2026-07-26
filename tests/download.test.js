import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { downloadBlob, downloadText, downloadCsv } from '../src/lib/download.js';

// jsdom implements neither createObjectURL nor revokeObjectURL, so both are
// stubbed. That is fine for what is being asserted here: the point of this
// module is the bookkeeping around the anchor — that the URL is always revoked
// and the element is always in the document when clicked — not the browser's
// blob plumbing.
let created;
let revoked;
let clicked;

beforeEach(() => {
  created = [];
  revoked = [];
  clicked = [];
  vi.useFakeTimers();

  let n = 0;
  URL.createObjectURL = vi.fn((blob) => {
    const url = `blob:mock/${n++}`;
    created.push({ url, blob });
    return url;
  });
  URL.revokeObjectURL = vi.fn((url) => revoked.push(url));

  // Record whether the anchor was in the document at click time — older Firefox
  // will not dispatch the click otherwise, which was the bug in four of the
  // hand-rolled copies this module replaced.
  HTMLAnchorElement.prototype.click = function () {
    clicked.push({
      href: this.href,
      download: this.download,
      inDocument: document.body.contains(this),
    });
  };
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const readBlob = (blob) => blob.text();

describe('downloadBlob', () => {
  it('clicks an anchor that is attached to the document', async () => {
    downloadBlob(new Blob(['hi']), 'a.txt');
    expect(clicked).toHaveLength(1);
    expect(clicked[0].inDocument).toBe(true);
    expect(clicked[0].download).toBe('a.txt');
  });

  it('removes the anchor again so the DOM is not left littered', () => {
    downloadBlob(new Blob(['hi']), 'a.txt');
    expect(document.querySelectorAll('a').length).toBe(0);
  });

  it('revokes the object URL', () => {
    // Five of the replaced copies never revoked at all, holding the whole
    // exported file in memory for the life of the tab.
    downloadBlob(new Blob(['hi']), 'a.txt');
    expect(revoked).toEqual([]);      // not synchronously — that raced the download
    vi.runAllTimers();
    expect(revoked).toEqual([created[0].url]);
  });

  it('revokes every URL when several files are saved in one session', () => {
    downloadBlob(new Blob(['1']), 'a.txt');
    downloadBlob(new Blob(['2']), 'b.txt');
    vi.runAllTimers();
    expect(revoked.sort()).toEqual(created.map(c => c.url).sort());
  });
});

describe('downloadText', () => {
  it('saves the text with the given filename and MIME type', async () => {
    downloadText('hello', 'greeting.txt', 'text/plain');
    expect(clicked[0].download).toBe('greeting.txt');
    expect(created[0].blob.type).toBe('text/plain');
    expect(await readBlob(created[0].blob)).toBe('hello');
  });
});

describe('downloadCsv', () => {
  it('uses a UTF-8 CSV MIME type', () => {
    downloadCsv('"a","b"', 'x.csv');
    expect(created[0].blob.type).toBe('text/csv;charset=utf-8;');
    expect(clicked[0].download).toBe('x.csv');
  });

  it('writes the CSV through unchanged', async () => {
    downloadCsv('"a","b"\r\n"c","d"', 'y.csv');
    expect(await readBlob(created[0].blob)).toBe('"a","b"\r\n"c","d"');
  });

  it('encodes a leading BOM as the three UTF-8 bytes Excel looks for', async () => {
    // The Tax Ledger export depends on this: the BOM is what stops Excel
    // reading a UTF-8 description as the local codepage. Asserted on the bytes
    // rather than via Blob.text(), because the UTF-8 decoder strips a leading
    // BOM on the way back out — the file on disk still has it.
    downloadCsv('﻿"a"', 'y.csv');
    const bytes = new Uint8Array(await created[0].blob.arrayBuffer());
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
  });
});
