import { describe, it, expect } from 'vitest';
import { planSheetsConnectionSync } from '../src/lib/sheets-url.js';

const WEB_APP = 'https://script.google.com/macros/s/abc123/exec';
const SHEET = 'https://docs.google.com/spreadsheets/d/xyz/edit';
// Stand-in for main.js's normalizeAppsScriptUrl: only web-app links survive.
const normalize = (u) => (/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(u || '') ? u : '');

describe('planSheetsConnectionSync', () => {
  it('copies the cloud connection onto a phone that has none', () => {
    const plan = planSheetsConnectionSync({ localUrl: '', conn: { url: WEB_APP, spreadsheetUrl: SHEET }, notifyUrl: WEB_APP, normalize });
    expect(plan).toEqual({ action: 'adopt', url: WEB_APP, spreadsheetUrl: SHEET });
  });

  it('falls back to the approval-email link when no cloud copy exists yet', () => {
    const plan = planSheetsConnectionSync({ localUrl: '', conn: null, notifyUrl: WEB_APP, normalize });
    expect(plan).toEqual({ action: 'adopt', url: WEB_APP, spreadsheetUrl: '' });
  });

  it('stays off after the publisher disconnected', () => {
    const plan = planSheetsConnectionSync({ localUrl: '', conn: { url: '', spreadsheetUrl: '' }, notifyUrl: WEB_APP, normalize });
    expect(plan.action).toBe('none');
  });

  it('ignores a cloud value that is not a web-app link', () => {
    const plan = planSheetsConnectionSync({ localUrl: '', conn: { url: 'https://evil.example/x' }, notifyUrl: '', normalize });
    expect(plan.action).toBe('none');
  });

  it('fills in the cloud copy from a device connected before it existed', () => {
    const plan = planSheetsConnectionSync({ localUrl: WEB_APP, localSpreadsheetUrl: SHEET, conn: null, notifyUrl: WEB_APP, normalize });
    expect(plan).toEqual({ action: 'backfill', url: WEB_APP, spreadsheetUrl: SHEET });
  });

  it('leaves a connected device alone when the cloud already has a copy', () => {
    const plan = planSheetsConnectionSync({ localUrl: WEB_APP, conn: { url: WEB_APP }, notifyUrl: WEB_APP, normalize });
    expect(plan.action).toBe('none');
  });
});
