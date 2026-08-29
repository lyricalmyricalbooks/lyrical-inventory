import { describe, it, expect } from 'vitest';
import {
  LABEL_ARCHIVE_LIMIT,
  archiveKeyForPin,
  addLabelToArchive,
  findArchivedLabel,
  pruneLabelArchive,
  listArchivedLabels,
} from '../src/lib/label-archive.js';

const ctx = (pin, extra = {}) => ({
  trackingPin: pin,
  orderNum: `ORD-${pin.slice(-3)}`,
  serviceName: 'Expedited Parcel',
  destination: { name: 'A Customer', countryCode: 'CA' },
  purchasedAt: '2026-08-24T12:00:00.000Z',
  ...extra,
});

describe('keeping every purchased label, not just the last', () => {
  it('keys a parcel by its digits however the PIN is punctuated', () => {
    expect(archiveKeyForPin('7012 3456-7890 1234')).toBe('7012345678901234');
    expect(archiveKeyForPin('')).toBe('');
    expect(archiveKeyForPin(null)).toBe('');
  });

  it('stores purchases newest first', () => {
    let archive = [];
    archive = addLabelToArchive(archive, ctx('7012345678900001'));
    archive = addLabelToArchive(archive, ctx('7012345678900002'));

    expect(archive).toHaveLength(2);
    expect(archive[0].trackingPin).toBe('7012345678900002');
    expect(archive[1].trackingPin).toBe('7012345678900001');
  });

  it('holds parcels rather than attempts when a label is re-bought', () => {
    let archive = addLabelToArchive([], ctx('7012345678900001', { orderNum: 'FIRST' }));
    archive = addLabelToArchive(archive, ctx('7012 3456 7890 0001', { orderNum: 'SECOND' }));

    expect(archive).toHaveLength(1);
    expect(archive[0].orderNum).toBe('SECOND');
  });

  it('refuses a context with no tracking PIN, which could never be looked up again', () => {
    expect(addLabelToArchive([], { orderNum: 'X' })).toEqual([]);
    expect(addLabelToArchive([], null)).toEqual([]);
  });

  it('caps how many are kept, dropping the oldest', () => {
    let archive = [];
    for (let i = 0; i < LABEL_ARCHIVE_LIMIT + 5; i++) {
      archive = addLabelToArchive(archive, ctx(`70123456789${String(i).padStart(5, '0')}`));
    }
    expect(archive).toHaveLength(LABEL_ARCHIVE_LIMIT);
    expect(archive[0].trackingPin).toBe(`70123456789${String(LABEL_ARCHIVE_LIMIT + 4).padStart(5, '0')}`);
  });

  it('honours a smaller explicit limit', () => {
    let archive = [];
    archive = addLabelToArchive(archive, ctx('7012345678900001'), 2);
    archive = addLabelToArchive(archive, ctx('7012345678900002'), 2);
    archive = addLabelToArchive(archive, ctx('7012345678900003'), 2);
    expect(archive.map(e => e.trackingPin)).toEqual(['7012345678900003', '7012345678900002']);
  });
});

describe('finding a stored label again', () => {
  const archive = [ctx('7012345678900001'), ctx('7012345678900002')].map(c => ({ ...c, archiveKey: archiveKeyForPin(c.trackingPin) }));

  it('matches regardless of spacing', () => {
    expect(findArchivedLabel(archive, '7012 3456 7890 0002')?.trackingPin).toBe('7012345678900002');
    expect(findArchivedLabel(archive, '7012345678900001')?.trackingPin).toBe('7012345678900001');
  });

  it('returns null for an unknown or empty PIN', () => {
    expect(findArchivedLabel(archive, '7012345678909999')).toBe(null);
    expect(findArchivedLabel(archive, '')).toBe(null);
    expect(findArchivedLabel(null, '7012345678900001')).toBe(null);
  });
});

describe('pruning what cannot be reprinted', () => {
  it('drops simulated shipments, which were never actually bought', () => {
    const archive = [
      ctx('7012345678900001'),
      ctx('7012345678900002', { isSimulated: true }),
    ];
    const pruned = pruneLabelArchive(archive);
    expect(pruned).toHaveLength(1);
    expect(pruned[0].trackingPin).toBe('7012345678900001');
  });

  it('drops entries with no PIN and survives junk', () => {
    expect(pruneLabelArchive([null, {}, { trackingPin: '' }])).toEqual([]);
    expect(pruneLabelArchive(null)).toEqual([]);
  });

  it('never archives a simulated purchase in the first place', () => {
    const archive = addLabelToArchive([], ctx('7012345678900009', { isSimulated: true }));
    expect(pruneLabelArchive(archive)).toEqual([]);
  });
});

describe('listing labels for the reprint picker', () => {
  it('exposes what the picker shows', () => {
    const archive = addLabelToArchive([], ctx('7012345678900001', {
      declarationId: '0rd4dpkrvc1y9',
      destination: { name: 'US Customer', countryCode: 'US' },
    }));

    const [row] = listArchivedLabels(archive);
    expect(row.pin).toBe('7012345678900001');
    expect(row.orderNum).toBe('ORD-001');
    expect(row.destinationName).toBe('US Customer');
    expect(row.destinationCountry).toBe('US');
    expect(row.declarationId).toBe('0rd4dpkrvc1y9');
    expect(row.purchasedAt).toBe('2026-08-24T12:00:00.000Z');
  });

  it('copes with a sparse context', () => {
    const archive = addLabelToArchive([], { trackingPin: '7012345678900001' });
    const [row] = listArchivedLabels(archive);
    expect(row.orderNum).toBe('');
    expect(row.destinationName).toBe('');
    expect(row.pin).toBe('7012345678900001');
  });
});
