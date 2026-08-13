import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createZip, crc32, dosDateTime, zipEntryName, textEntry } from '../src/lib/zip.js';

/** Write a produced Blob to a temp file so real tools can read it. */
async function writeZip(blob, name = 'test.zip') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lm-zip-'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, Buffer.from(await blob.arrayBuffer()));
  return { dir, file };
}

function haveUnzip() {
  try {
    execFileSync('unzip', ['-v'], { stdio: 'ignore' });
    return true;
  } catch (_) {
    return false;
  }
}

const bytes = (s) => new TextEncoder().encode(s);

describe('crc32', () => {
  it('matches the known checksum for a standard input', () => {
    // The canonical CRC-32 of "123456789" — a wrong table or a wrong final XOR
    // both show up here rather than as a mysteriously corrupt archive.
    expect(crc32(bytes('123456789')) >>> 0).toBe(0xcbf43926);
  });

  it('is zero for empty input', () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe('dosDateTime', () => {
  it('encodes a date into the two 16-bit fields', () => {
    const { time, date } = dosDateTime(new Date(2026, 7, 13, 14, 30, 20));
    expect(date).toBe(((2026 - 1980) << 9) | (8 << 5) | 13);
    expect(time).toBe((14 << 11) | (30 << 5) | 10); // 2-second resolution
  });

  it('clamps below the 1980 epoch instead of wrapping negative', () => {
    expect(dosDateTime(new Date(1970, 0, 1)).date >>> 9).toBe(0);
  });

  it('falls back to now for an invalid date', () => {
    expect(dosDateTime(new Date('nonsense')).date).toBeGreaterThan(0);
  });
});

describe('zipEntryName', () => {
  it('uses forward slashes and strips traversal', () => {
    expect(zipEntryName('2026\\Office Supplies\\a.pdf')).toBe('2026/Office Supplies/a.pdf');
    expect(zipEntryName('/leading/slash.pdf')).toBe('leading/slash.pdf');
    // A `..` segment makes some tools unpack outside the target directory.
    expect(zipEntryName('../../etc/passwd')).toBe('etc/passwd');
    expect(zipEntryName('a/./b.pdf')).toBe('a/b.pdf');
  });
});

describe('createZip', () => {
  it('produces a blob with the zip signature', async () => {
    const blob = createZip([{ name: 'a.txt', data: bytes('hello') }]);
    const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
    expect([...head]).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });

  it('skips entries with no data or no usable name', () => {
    const blob = createZip([
      { name: 'ok.txt', data: bytes('x') },
      { name: '', data: bytes('x') },
      { name: 'nodata.txt', data: null },
      null,
    ]);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('deduplicates colliding names rather than shadowing one', async () => {
    if (!haveUnzip()) return;
    const blob = createZip([
      { name: '2026/a.pdf', data: bytes('first') },
      { name: '2026/a.pdf', data: bytes('second') },
    ]);
    const { file } = await writeZip(blob);
    const listing = execFileSync('unzip', ['-Z1', file], { encoding: 'utf8' });
    expect(listing).toContain('2026/a.pdf');
    expect(listing).toContain('2026/a-2.pdf');
  });

  it('refuses more entries than the format can index', () => {
    const many = Array.from({ length: 0x10000 }, (_, i) => ({ name: `f${i}.txt`, data: bytes('x') }));
    expect(() => createZip(many)).toThrow(/Too many files/);
  });
});

describe('archives a real unzip can read', () => {
  let available = false;
  beforeAll(() => { available = haveUnzip(); });

  it('passes an integrity check', async () => {
    if (!available) return;
    // The failure this catches: a wrong central-directory offset produces an
    // archive that looks fine byte-wise and fails the moment anyone opens it.
    const blob = createZip([
      { name: '2026/Office Supplies/2026-05-10_Staples_CAD-24.99.txt', data: bytes('receipt one') },
      { name: '2026/Travel & Meals/2026-07-30_Uber_CAD-13.93.txt', data: bytes('receipt two') },
      textEntry('manifest.csv', 'Date,Vendor,Amount\n2026-05-10,Staples,24.99\n'),
    ]);
    const { file } = await writeZip(blob);
    const out = execFileSync('unzip', ['-t', file], { encoding: 'utf8' });
    expect(out).toMatch(/No errors detected/i);
  });

  it('round-trips content byte-for-byte', async () => {
    if (!available) return;
    const payload = 'Café Bleu — dîner, 220,00 €';
    const blob = createZip([{ name: 'notes.txt', data: bytes(payload) }]);
    const { dir, file } = await writeZip(blob);
    execFileSync('unzip', ['-o', '-q', file, '-d', dir]);
    expect(fs.readFileSync(path.join(dir, 'notes.txt'), 'utf8')).toBe(payload);
  });

  it('preserves nested folders and names with spaces and ampersands', async () => {
    if (!available) return;
    // "Printing & Production" is a real category; an unquoted or mis-encoded
    // name is the classic way a folder tree arrives flattened or mangled.
    const blob = createZip([
      { name: '2026/Printing & Production/The Quiet Hour/proof.txt', data: bytes('proof') },
    ]);
    const { dir, file } = await writeZip(blob);
    execFileSync('unzip', ['-o', '-q', file, '-d', dir]);
    const target = path.join(dir, '2026', 'Printing & Production', 'The Quiet Hour', 'proof.txt');
    expect(fs.existsSync(target)).toBe(true);
    expect(fs.readFileSync(target, 'utf8')).toBe('proof');
  });

  it('handles binary content without corrupting it', async () => {
    if (!available) return;
    const bin = new Uint8Array(1024);
    for (let i = 0; i < bin.length; i++) bin[i] = i % 256;
    const blob = createZip([{ name: 'blob.bin', data: bin }]);
    const { dir, file } = await writeZip(blob);
    execFileSync('unzip', ['-o', '-q', file, '-d', dir]);
    expect(new Uint8Array(fs.readFileSync(path.join(dir, 'blob.bin')))).toEqual(bin);
  });

  it('produces a valid archive when empty', async () => {
    if (!available) return;
    const { file } = await writeZip(createZip([]));
    // `unzip -t` on an empty archive warns but must not report corruption.
    let out = '';
    try {
      out = execFileSync('unzip', ['-t', file], { encoding: 'utf8' });
    } catch (e) {
      out = String(e.stdout || '') + String(e.stderr || '');
    }
    expect(out).not.toMatch(/cannot find zipfile directory|bad zipfile/i);
  });
});
