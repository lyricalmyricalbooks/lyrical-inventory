import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { appSource, extractDecl } from './helpers/extract-decl.js';

const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(process.cwd(), 'src/style.css'), 'utf8');

describe('Business trip creation', () => {
  it('exposes a New trip entry point and a create/edit modal in the markup', () => {
    expect(html).toContain('id="tc-new-trip-btn"');
    expect(html).toContain('onclick="openNewTrip()"');
    expect(html).toContain('id="m-tc-new-trip"');
    // Every field the form collects.
    ['name', 'dest', 'start', 'end', 'budget', 'purpose', 'notes'].forEach(f => {
      expect(html).toContain(`id="tc-new-trip-${f}"`);
    });
    expect(html).toContain('onclick="saveNewTrip()"');
    expect(html).toContain('onclick="deleteTripRecord()"');
    expect(html).toContain('onclick="openEditTripDetails()"');
  });

  it('styles the new trip form and the planned-trip card states', () => {
    expect(css).toContain('.tc-trips-actions');
    expect(css).toContain('.tc-trip-form');
    expect(css).toContain('.tc-trip-form-full');
    expect(css).toContain('.tc-trip-badge-new');
    expect(css).toContain('.tc-trip-card-empty');
    expect(css).toContain('.tc-trip-form-err');
  });

  it('declares and exposes the trip record functions', () => {
    expect(appSource).toContain('function openNewTrip');
    expect(appSource).toContain('function openEditTripDetails');
    expect(appSource).toContain('function saveNewTrip');
    expect(appSource).toContain('function deleteTripRecord');
    expect(appSource).toContain('function tcNewTripValidate');
    expect(appSource).toContain('function _tcTripRecords');
    // Inline handlers only resolve if the function is on window.
    ['openNewTrip', 'saveNewTrip', 'deleteTripRecord', 'openEditTripDetails', 'tcNewTripValidate']
      .forEach(name => expect(appSource).toContain(name));
  });
});

describe('_tcTripRecords / _tcFindTripRecord', () => {
  const TAX_CENTER = {};
  const { _tcTripRecords, _tcFindTripRecord } = new Function(
    'TAX_CENTER',
    `${extractDecl('_tcTripRecords')}\n${extractDecl('_tcFindTripRecord')}\n` +
    'return { _tcTripRecords, _tcFindTripRecord };',
  )(TAX_CENTER);

  beforeEach(() => {
    delete TAX_CENTER.trips;
  });

  it('initialises the trips array lazily', () => {
    expect(_tcTripRecords()).toEqual([]);
    expect(Array.isArray(TAX_CENTER.trips)).toBe(true);
  });

  it('repairs a non-array trips value rather than throwing', () => {
    TAX_CENTER.trips = 'nope';
    expect(_tcTripRecords()).toEqual([]);
  });

  it('matches trip names case-insensitively and ignores surrounding space', () => {
    TAX_CENTER.trips = [{ name: 'Toronto Book Fair' }];
    expect(_tcFindTripRecord('  toronto book fair ')?.name).toBe('Toronto Book Fair');
    expect(_tcFindTripRecord('Ottawa')).toBe(null);
    expect(_tcFindTripRecord('')).toBe(null);
    expect(_tcFindTripRecord(undefined)).toBe(null);
  });
});
