// Browser entry for the phone screenshot rig: boots the real app against the
// shared fake cloud (tests/helpers/fake-cloud.js) with demo books, signed in
// as the publisher, and offline. Sets window.__shotsReady when the books have
// loaded; capture.mjs waits on it.
import { createFakeCloud, installFakeFirebase, signInAsPublisher } from '../../tests/helpers/fake-cloud.js';
import { demoBooks, demoStates, demoSettings, demoLocalStorage, demoLocalStorageExtra, demoReconPayments } from './seed.js';

try {
  localStorage.clear();
  // Opening the app once a day downloads a JSON backup; mark today's as done.
  localStorage.setItem('lm-last-backup-ts', String(Date.now()));
  for (const [k, v] of Object.entries({ ...demoLocalStorage, ...demoLocalStorageExtra })) localStorage.setItem(k, v);
  // capture.mjs --storage=key=value,… : extra device settings for one run
  // (e.g. allConGrouped=1 to shoot All books grouped by book).
  for (const pair of new URLSearchParams(location.search).getAll('ls')) {
    const at = pair.indexOf('=');
    if (at > 0) localStorage.setItem(pair.slice(0, at), pair.slice(at + 1));
  }
  // --session=key=value,… : per-visit choices kept in sessionStorage
  // (e.g. lm-con-section=ledger for the Consignment Ledger tab on a phone).
  for (const pair of new URLSearchParams(location.search).getAll('ss')) {
    const at = pair.indexOf('=');
    if (at > 0) sessionStorage.setItem(pair.slice(0, at), pair.slice(at + 1));
  }
} catch { /* storage unavailable */ }

// A device with no network: the app's own fetches fail the way they do offline.
window.fetch = () => Promise.reject(new Error('network disabled in phone-shots'));
window.open = () => null;

const cloud = createFakeCloud(demoBooks, demoStates);
// Tax Centre settings, read at sign-in by loadTaxCenter (src/main.js:4206).
for (const [key, value] of Object.entries(demoSettings)) cloud.settings[key] = value;
window.__shotsCloud = cloud;

const main = await import('../../src/main.js');
window.__shotsMain = main;
installFakeFirebase(window, cloud);
await signInAsPublisher();

const deadline = Date.now() + 15000;
while (demoBooks.some(b => !main.states[b.id])) {
  if (Date.now() > deadline) throw new Error('phone-shots: demo books never loaded');
  await new Promise(r => setTimeout(r, 25));
}
// Payments only exist after a live Stripe sync; stand in for one.
window._reconPayments = demoReconPayments;
// An artist's sale waiting for approval only arrives through the live
// submissions watch (window.authorSubmissions, filled by Firebase), so stand in
// for one, then repaint History with it.
window.authorSubmissions = { harbour: { sales: { demoArt8: { data: JSON.stringify({ num: 'ART-0008', chan: 'Direct', qty: 1, price: 24, date: '2026-10-08', notes: 'Sold at the Saturday market' }) } } } };
main.renderHist?.();
window.__shotsReady = true;
