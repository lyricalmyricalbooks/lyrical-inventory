import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The rules files can't be executed here (that needs the Firebase emulators),
// so this pins down the decisions they encode: which settings documents a
// non-publisher may read, that the Firestore and RTDB copies of that decision
// agree, and that every settings document the app touches has been
// deliberately classified — so a new one can't quietly go either way.
//
// The allowlist itself was checked against the real Firestore and Database
// emulators when it was introduced (publisher, author, unrelated Google account
// and an unverified account claiming the publisher's address).

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const firestoreRules = read('firestore.rules');
const storageRules = read('storage.rules');
const rtdbRules = JSON.parse(
  read('database.rules.json').split('\n').map(l => l.replace(/^\s*\/\/.*$/, '')).join('\n')
);

const PUBLISHER = 'lyricalmyricalbooks@gmail.com';

// Loaded by an author session to render its own book (see firestore.rules).
const AUTHOR_READS = [
  'modeFlags', 'notifyEndpoint', 'analyticsConfig', 'catalog',
  'paymentLinks', 'productionCosts', 'websitePaymentMethods',
];
// Secrets, business records and customer personal data.
const PUBLISHER_ONLY = [
  'taxCenter', 'bigCartelConfig', 'systemBackups', 'bookOwners',
  'mailingList', 'customerSuppress', 'campaigns', 'openCalls',
];

function firestoreAllowlist() {
  const m = firestoreRules.match(/function isAuthorReadableSetting\(name\)\s*\{\s*return name in \[([^\]]*)\]/);
  if (!m) throw new Error('isAuthorReadableSetting() not found in firestore.rules');
  return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]).sort();
}

function rtdbAllowlist() {
  const expr = rtdbRules.rules.lyrical.settings.$key['.read'];
  return [...expr.matchAll(/\$key === '([^']+)'/g)].map(x => x[1]).sort();
}

// Every settings document name the client reads or writes.
function settingsKeysUsedByApp() {
  const srcFiles = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) walk(rel);
      else if (e.name.endsWith('.js')) srcFiles.push(rel);
    }
  };
  walk('src');
  const keys = new Set();
  for (const f of srcFiles) {
    const text = read(f);
    for (const m of text.matchAll(/_fb(?:Save|Load)Settings\(\s*'([A-Za-z0-9_]+)'/g)) keys.add(m[1]);
    for (const m of text.matchAll(/doc\(fs,\s*'settings',\s*'([A-Za-z0-9_]+)'\)/g)) keys.add(m[1]);
    for (const m of text.matchAll(/lyrical\/settings\/([A-Za-z0-9_]+)/g)) keys.add(m[1]);
  }
  // Written through a constant rather than a literal.
  if (/SYSTEM_BACKUP_KEY = 'systemBackups'/.test(read('src/main.js'))) keys.add('systemBackups');
  return [...keys].sort();
}

describe('settings read access', () => {
  it('Firestore and the Realtime Database allow authors the same settings', () => {
    expect(rtdbAllowlist()).toEqual(firestoreAllowlist());
  });

  it('is exactly the settings an author session needs', () => {
    expect(firestoreAllowlist()).toEqual([...AUTHOR_READS].sort());
  });

  it('never exposes secrets or customer data to non-publishers', () => {
    const allowed = new Set(firestoreAllowlist());
    for (const key of PUBLISHER_ONLY) expect(allowed.has(key), key).toBe(false);
  });

  it('every settings document the app uses has been classified', () => {
    const classified = new Set([...AUTHOR_READS, ...PUBLISHER_ONLY]);
    const unclassified = settingsKeysUsedByApp().filter(k => !classified.has(k));
    // A new settings doc is publisher-only by default under the allowlist. If an
    // author session needs to read it, add it to isAuthorReadableSetting() in
    // firestore.rules AND the $key rule in database.rules.json, then to
    // AUTHOR_READS here; otherwise add it to PUBLISHER_ONLY.
    expect(unclassified).toEqual([]);
  });

  it('is an allowlist, so an unknown settings document is publisher-only', () => {
    expect(firestoreRules).toMatch(/allow read: if isPublisher\(\)\s*\|\|\s*\(isAnyAuthor\(\) && isAuthorReadableSetting\(document\)\)/);
    expect(firestoreRules).not.toMatch(/!\s*isPublisherOnlySetting/);
  });
});

describe('publisher identity', () => {
  it('requires a verified email in Firestore and Storage rules', () => {
    for (const rules of [firestoreRules, storageRules]) {
      const fn = rules.match(/function isPublisher\(\)\s*\{([\s\S]*?)\}/);
      expect(fn).not.toBeNull();
      expect(fn[1]).toContain(`request.auth.token.email == '${PUBLISHER}'`);
      expect(fn[1]).toContain('request.auth.token.email_verified == true');
    }
  });

  it('requires a verified email everywhere the Realtime Database names the publisher', () => {
    const exprs = [];
    const collect = (node) => {
      for (const [k, v] of Object.entries(node)) {
        if (typeof v === 'string' && k.startsWith('.')) exprs.push(v);
        else if (v && typeof v === 'object') collect(v);
      }
    };
    collect(rtdbRules.rules);
    const naming = exprs.filter(e => e.includes(PUBLISHER));
    expect(naming.length).toBeGreaterThan(0);
    for (const e of naming) {
      const mentions = e.split(`auth.token.email === '${PUBLISHER}'`).length - 1;
      const guarded = e.split(`(auth.token.email === '${PUBLISHER}' && auth.token.email_verified === true)`).length - 1;
      expect(guarded, e).toBe(mentions);
    }
  });
});

describe('author-only settings reads', () => {
  it('Firestore requires an actual author, not just any signed-in account', () => {
    expect(firestoreRules).toMatch(/function isAnyAuthor\(\)/);
    expect(firestoreRules).toMatch(/allow read: if isPublisher\(\)\s*\|\|\s*\(isAnyAuthor\(\) && isAuthorReadableSetting\(document\)\)/);
    expect(firestoreRules).toContain("'authorEmails'");
  });
  it('the Realtime Database checks the same authorEmails map before the allowlist', () => {
    const expr = rtdbRules.rules.lyrical.settings.$key['.read'];
    expect(expr).toContain('lyrical/settings/bookOwners/authorEmails');
    expect(expr.slice(expr.indexOf('authorEmails'))).toContain("$key === 'catalog'");
    expect(expr.slice(0, expr.indexOf('authorEmails'))).not.toMatch(/\$key ===/);
  });
});

// The website link (docs/website-link.md). The website writes with the Admin
// SDK and bypasses rules; these pin what the publisher's browser may do, so a
// later edit can't quietly let the app rewrite the website's copy of an order.
describe('website link rules', () => {
  const block = (name) => {
    const at = firestoreRules.indexOf(`match /${name}/`);
    expect(at, name).toBeGreaterThan(-1);
    // The block's own brace, not the `{orderId}` wildcard in its path.
    const open = firestoreRules.indexOf('} {', at) + 2;
    let depth = 0;
    for (let i = open; i < firestoreRules.length; i++) {
      if (firestoreRules[i] === '{') depth++;
      else if (firestoreRules[i] === '}' && --depth === 0) return firestoreRules.slice(at, i + 1);
    }
    throw new Error(`unterminated block ${name}`);
  };

  it('websiteOrders: publisher reads, may change only imported/pending/app, never creates or deletes', () => {
    const rules = block('websiteOrders');
    expect(rules).toMatch(/allow read: if isPublisher\(\);/);
    expect(rules).toContain(".diff(resource.data).affectedKeys().hasOnly(['imported', 'pending', 'app'])");
    expect(rules).toMatch(/allow create, delete: if false;/);
    // The app only ever clears `pending`; setting it is the website's signal.
    expect(rules).toContain('request.resource.data.pending == false');
    expect(rules).not.toMatch(/allow (read, )?write/);
  });

  it('websiteStockFeed: publisher writes, shape-checked to the contract’s fields', () => {
    const rules = block('websiteStockFeed');
    expect(rules).toMatch(/allow read: if isPublisher\(\);/);
    expect(rules).toContain("keys().hasOnly(['bookId', 'title', 'onHand', 'webCopies', 'base', 'derived', 'at', 'build'])");
    expect(rules).toContain('request.resource.data.bookId == bookId');
    expect(rules).toContain('request.resource.data.onHand is int && request.resource.data.onHand >= 0');
    expect(rules).toContain('request.resource.data.base is int');
    expect(rules).toContain('request.resource.data.derived is bool');
  });

  it('websiteLink: publisher reads both, writes only its own app document', () => {
    const rules = block('websiteLink');
    expect(rules).toMatch(/allow read: if isPublisher\(\);/);
    expect(rules).toContain("isPublisher() && docId == 'app'");
    expect(rules).toContain("keys().hasOnly(['importConsentAt', 'lastImportAt', 'lastFeedAt', 'build'])");
    expect(rules).toMatch(/allow delete: if false;/);
  });

  it('the app writes exactly those fields (src/firebase.js and the pure planner agree with the rules)', () => {
    const fb = read('src/firebase.js');
    const lib = read('src/lib/website-link.js');
    // Orders: only imported, pending and dotted app.* paths.
    expect(lib).toMatch(/imported: \{/);
    expect(lib).toContain("'app.shipment': shipment, 'app.shipmentWaiting': true");
    expect(fb).toContain("tx.update(doc(fs, 'websiteOrders', u.orderId), u.data)");
    // websiteLink/app is the only websiteLink doc the app writes.
    expect([...fb.matchAll(/doc\(fs, 'websiteLink', '([a-z]+)'\)/g)].map(m => m[1])).toEqual(['app', 'app']);
    expect(fb).toContain("const allowed = ['importConsentAt', 'lastImportAt', 'lastFeedAt', 'build'];");
  });
});
