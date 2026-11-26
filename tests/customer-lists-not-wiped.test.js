// On a bad connection at start-up, the unsubscribe list and the mailing list
// fall back to this device's copy, which on a new phone is empty. Saving that
// over the cloud copy used to wipe the list, so someone who had unsubscribed
// could be emailed again. Until the cloud copy has been read, a save now reads
// it first and merges, and if it still can't be read, nothing goes to the cloud.
//
// Runs the real customers screen code in the booted app (tests/helpers/load-app.js).
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';

let app;
let offline = false;

beforeAll(async () => {
  app = await loadApp({ books: [makeBook({ id: 'bk' })] });
  const realLoad = window._fbLoadSettings;
  window._fbLoadSettings = async (key, opts) => {
    if (offline && ['customerSuppress', 'mailingList', 'campaigns', 'openCalls'].includes(key)) {
      if (opts && opts.strict) throw new Error('offline');
      return null;
    }
    return realLoad(key, opts);
  };
}, 30000);

beforeEach(() => {
  offline = false;
  localStorage.removeItem('lm-customer-suppress');
  localStorage.removeItem('lm-mailing-list');
  localStorage.removeItem('lm-campaigns');
  localStorage.removeItem('lm-opencalls');
});

const enc = (e) => encodeURIComponent(e);

describe('unsubscribe list', () => {
  it('is not saved over the cloud copy while the cloud cannot be read', async () => {
    app.cloud.settings.customerSuppress = { emails: ['a@x.com', 'b@x.com'] };
    offline = true;
    await window.loadCustomerSuppression();
    await window.toggleCustomerSuppress(enc('c@x.com'));
    expect(app.cloud.settings.customerSuppress.emails).toEqual(['a@x.com', 'b@x.com']);
    expect(JSON.parse(localStorage.getItem('lm-customer-suppress'))).toEqual(['c@x.com']);
  });

  it('keeps everyone already unsubscribed once the cloud is back', async () => {
    app.cloud.settings.customerSuppress = { emails: ['a@x.com', 'b@x.com'] };
    offline = true;
    await window.loadCustomerSuppression();
    offline = false;
    await window.toggleCustomerSuppress(enc('c@x.com'));
    expect([...app.cloud.settings.customerSuppress.emails].sort()).toEqual(['a@x.com', 'b@x.com', 'c@x.com']);
    expect(window._isCustomerSuppressed('a@x.com')).toBe(true);
  });

  it('saves a re-subscribe as before when the cloud copy was read at start-up', async () => {
    app.cloud.settings.customerSuppress = { emails: ['a@x.com'] };
    await window.loadCustomerSuppression();
    await window.toggleCustomerSuppress(enc('a@x.com'));
    expect(app.cloud.settings.customerSuppress.emails).toEqual([]);
  });
});

describe('mailing list', () => {
  const cloudList = () => ({
    subs: { 'a@x.com': { email: 'a@x.com', name: '', source: 'Manual', added: '2026-11-01' }, 'b@x.com': { email: 'b@x.com', name: '', source: 'Manual', added: '2026-11-01' } },
    removed: {},
    autoAdd: false,
  });

  it('is not saved over the cloud copy while the cloud cannot be read', async () => {
    app.cloud.settings.mailingList = cloudList();
    offline = true;
    await window.loadMailingList();
    window._mailingUpsert('n@x.com', 'New', 'Manual');
    await window._persistMailingList();
    expect(Object.keys(app.cloud.settings.mailingList.subs).sort()).toEqual(['a@x.com', 'b@x.com']);
  });

  it('merges this device\'s changes into the cloud copy once it can be read', async () => {
    app.cloud.settings.mailingList = cloudList();
    offline = true;
    await window.loadMailingList();
    offline = false;
    window._mailingUpsert('n@x.com', 'New', 'Manual');
    await window._persistMailingList();
    expect(Object.keys(app.cloud.settings.mailingList.subs).sort()).toEqual(['a@x.com', 'b@x.com', 'n@x.com']);
    expect(window.mailingListHas('a@x.com')).toBe(true);
  });
});

// Saved newsletters and Open Call projects had no such guard: a blank start
// (Open Call even makes a fresh "General Open Call") was saved over the cloud.
describe('saved newsletters', () => {
  it('are not saved over the cloud copy while the cloud cannot be read', async () => {
    app.cloud.settings.campaigns = [{ id: 'c1', subject: 'Spring' }];
    offline = true;
    await window.loadCampaigns();
    await window._persistCampaigns();
    expect(app.cloud.settings.campaigns).toEqual([{ id: 'c1', subject: 'Spring' }]);
  });

  it('keep the cloud\'s newsletters once it can be read', async () => {
    app.cloud.settings.campaigns = [{ id: 'c1', subject: 'Spring' }];
    offline = true;
    await window.loadCampaigns();
    offline = false;
    await window._persistCampaigns();
    expect(app.cloud.settings.campaigns.map(c => c.id)).toEqual(['c1']);
  });
});

describe('open calls', () => {
  const cloudCalls = () => ({
    activeProjectId: 'p1',
    projects: { p1: { id: 'p1', title: 'Zine call', contributors: [{ id: 'oc_a', name: 'Ann' }, { id: 'oc_b', name: 'Bo' }] } },
  });

  it('are not saved over the cloud copy while the cloud cannot be read', async () => {
    const oc = await import('../src/features/opencall.js');
    app.cloud.settings.openCalls = cloudCalls();
    offline = true;
    await oc.loadOpenCalls();
    await oc._persistOpenCalls();
    expect(Object.keys(app.cloud.settings.openCalls.projects)).toEqual(['p1']);
    expect(app.cloud.settings.openCalls.projects.p1.contributors).toHaveLength(2);
  });

  it('keep every cloud project and contributor once the cloud can be read', async () => {
    const oc = await import('../src/features/opencall.js');
    app.cloud.settings.openCalls = cloudCalls();
    offline = true;
    await oc.loadOpenCalls();
    offline = false;
    await oc._persistOpenCalls();
    const saved = app.cloud.settings.openCalls;
    expect(saved.projects.p1.contributors.map(c => c.id)).toEqual(['oc_a', 'oc_b']);
    expect(saved.activeProjectId).toBe('p1');
  });
});
