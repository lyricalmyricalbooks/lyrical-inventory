// A minimal ZIP writer — enough to hand someone a folder of receipts.
//
// Written by hand rather than pulled in, because this app carries no runtime
// dependencies and a receipt export is not worth breaking that for.
//
// STORE only, no compression. Every receipt is a PDF or a JPEG, both already
// compressed — DEFLATE on them buys a percent or two for a large amount of code
// and CPU. Storing is also the one method every unzip tool on every platform has
// supported since 1989, which matters when the recipient is an accountant with
// whatever Windows shipped with.
//
// The format, briefly, so the byte offsets below are readable:
//
//   [local header + filename + data]   × N
//   [central directory entry]          × N
//   [end of central directory]
//
// The central directory is the part that actually matters: unzip tools read it
// first and trust its offsets. Getting an offset wrong there produces an archive
// that looks fine until someone opens it, which is why the tests round-trip a
// real archive through a real unzip rather than just checking byte counts.
//
// Deliberately not supported: Zip64. That caps an export at 4GB and 65,535
// files, which is far past any plausible number of receipts — but the cap is
// checked and reported rather than silently producing a corrupt archive.

const MAX_ENTRIES = 0xffff;
const MAX_BYTES = 0xffffffff;

/** CRC-32, table built once on first use. */
let _crcTable = null;
function crcTable() {
  if (_crcTable) return _crcTable;
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  _crcTable = table;
  return table;
}

export function crc32(bytes) {
  const table = crcTable();
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ bytes[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * MS-DOS date/time, which is what the format stores.
 *
 * Two-second resolution and a 1980 epoch, both inherent to the format. Dates
 * before 1980 are clamped rather than wrapping into nonsense.
 */
export function dosDateTime(date = new Date()) {
  const d = date instanceof Date && !isNaN(date.getTime()) ? date : new Date();
  const year = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2)),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/**
 * Normalise a path for the archive.
 *
 * ZIP entries always use forward slashes regardless of platform, and a leading
 * slash or a `..` segment makes an archive that some tools refuse and others
 * unpack outside the target directory.
 */
export function zipEntryName(name) {
  return String(name || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .split('/')
    .filter(seg => seg && seg !== '.' && seg !== '..')
    .join('/');
}

function pushU16(out, v) { out.push(v & 0xff, (v >>> 8) & 0xff); }
function pushU32(out, v) { out.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff); }

/**
 * Build a ZIP archive.
 *
 * `files` is `[{ name, data, date }]` where data is a Uint8Array. Returns a
 * Blob. Names are deduplicated — two receipts that resolve to the same path
 * would otherwise produce an archive where one silently shadows the other.
 */
export function createZip(files, { mimeType = 'application/zip' } = {}) {
  const entries = [];
  const seen = new Set();

  (files || []).forEach(f => {
    if (!f || !f.data) return;
    let name = zipEntryName(f.name);
    if (!name) return;

    // Same-name collision: suffix rather than let one entry hide another.
    if (seen.has(name.toLowerCase())) {
      const dot = name.lastIndexOf('.');
      const stem = dot > 0 ? name.slice(0, dot) : name;
      const ext = dot > 0 ? name.slice(dot) : '';
      let i = 2;
      let candidate = `${stem}-${i}${ext}`;
      while (seen.has(candidate.toLowerCase())) candidate = `${stem}-${++i}${ext}`;
      name = candidate;
    }
    seen.add(name.toLowerCase());
    entries.push({ name, data: f.data instanceof Uint8Array ? f.data : new Uint8Array(f.data), date: f.date });
  });

  if (entries.length > MAX_ENTRIES) {
    throw new Error(`Too many files for a single zip (${entries.length}); the limit is ${MAX_ENTRIES}.`);
  }

  const encoder = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;
    const { time, date } = dosDateTime(entry.date);

    // Bit 11 of the general-purpose flags declares the filename is UTF-8, which
    // is what keeps "Printing & Production" and any accented vendor readable.
    const flags = 0x0800;

    const local = [];
    pushU32(local, 0x04034b50);   // local file header signature
    pushU16(local, 20);           // version needed (2.0)
    pushU16(local, flags);
    pushU16(local, 0);            // method 0 = stored
    pushU16(local, time);
    pushU16(local, date);
    pushU32(local, crc);
    pushU32(local, size);         // compressed == uncompressed when stored
    pushU32(local, size);
    pushU16(local, nameBytes.length);
    pushU16(local, 0);            // extra field length

    parts.push(new Uint8Array(local), nameBytes, entry.data);

    const dir = [];
    pushU32(dir, 0x02014b50);     // central directory header signature
    pushU16(dir, 20);             // version made by
    pushU16(dir, 20);             // version needed
    pushU16(dir, flags);
    pushU16(dir, 0);
    pushU16(dir, time);
    pushU16(dir, date);
    pushU32(dir, crc);
    pushU32(dir, size);
    pushU32(dir, size);
    pushU16(dir, nameBytes.length);
    pushU16(dir, 0);              // extra
    pushU16(dir, 0);              // comment
    pushU16(dir, 0);              // disk number
    pushU16(dir, 0);              // internal attrs
    pushU32(dir, 0);              // external attrs
    pushU32(dir, offset);         // offset of this entry's local header
    central.push(new Uint8Array(dir), nameBytes);

    offset += local.length + nameBytes.length + size;
    if (offset > MAX_BYTES) {
      throw new Error('Export is too large for a single zip (over 4GB). Export one year at a time.');
    }
  }

  const centralStart = offset;
  let centralSize = 0;
  central.forEach(chunk => { centralSize += chunk.length; });

  const end = [];
  pushU32(end, 0x06054b50);       // end of central directory signature
  pushU16(end, 0);                // this disk
  pushU16(end, 0);                // disk with central directory
  pushU16(end, entries.length);
  pushU16(end, entries.length);
  pushU32(end, centralSize);
  pushU32(end, centralStart);
  pushU16(end, 0);                // comment length

  return new Blob([...parts, ...central, new Uint8Array(end)], { type: mimeType });
}

/** Convenience: UTF-8 encode a string for inclusion in an archive. */
export function textEntry(name, text, date) {
  return { name, data: new TextEncoder().encode(String(text ?? '')), date };
}
