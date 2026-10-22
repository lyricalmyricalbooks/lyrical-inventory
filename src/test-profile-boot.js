// Imported first by main.js, so it runs before any other module reads device
// storage or makes a request. Does nothing unless the Test Profile is open
// (see lib/test-profile.js for what it isolates and why).
import {
  isTestProfileActive, createNamespacedStorage, installNetworkGuard, friendlyServiceName,
} from './lib/test-profile.js';

export const TEST_PROFILE_ACTIVE = isTestProfileActive();

if (TEST_PROFILE_ACTIVE) {
  const realStorage = window.localStorage;
  window.__realLocalStorage = realStorage;
  // Bare `localStorage` in every module resolves through window, so replacing
  // the property is enough to give the whole app its own copy.
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    enumerable: true,
    value: createNamespacedStorage(realStorage),
  });

  const lastNote = {};
  installNetworkGuard(window, host => {
    const name = friendlyServiceName(host);
    console.info(`[Test Profile] blocked a request to ${host}`);
    const now = Date.now();
    if (now - (lastNote[name] || 0) < 15000) return;
    lastNote[name] = now;
    if (typeof window.showToast === 'function') {
      window.showToast(`Test Profile: nothing was sent to ${name}`, 'warn', 3500);
    }
  });

  document.documentElement.dataset.testProfile = 'on';
}
