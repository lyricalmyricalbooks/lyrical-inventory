// Browser entry for the phone screenshot rig: boots the real app against the
// shared fake cloud (tests/helpers/fake-cloud.js) with demo books, signed in
// as the publisher, and offline. Sets window.__shotsReady when the books have
// loaded; capture.mjs waits on it.
import { createFakeCloud, installFakeFirebase, signInAsPublisher } from '../../tests/helpers/fake-cloud.js';
import { demoBooks, demoStates, demoLocalStorage } from './seed.js';

try {
  localStorage.clear();
  // Opening the app once a day downloads a JSON backup; mark today's as done.
  localStorage.setItem('lm-last-backup-ts', String(Date.now()));
  for (const [k, v] of Object.entries(demoLocalStorage || {})) localStorage.setItem(k, v);
} catch { /* storage unavailable */ }

// A device with no network: the app's own fetches fail the way they do offline.
window.fetch = () => Promise.reject(new Error('network disabled in phone-shots'));
window.open = () => null;

const cloud = createFakeCloud(demoBooks, demoStates);
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
window.__shotsReady = true;
