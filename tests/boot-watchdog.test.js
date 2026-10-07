import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// The watchdog is a classic inline script in index.html: it has to run when the
// module bundle can't (first open with no signal, nothing cached yet). Pull it
// out of the page and run it against a minimal sign-in screen.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const indexHtml = readFileSync(join(root, 'index.html'), 'utf8');
const mainJs = readFileSync(join(root, 'src/main.js'), 'utf8');
const marker = indexHtml.indexOf('<!-- BOOT WATCHDOG');
const open = indexHtml.indexOf('<script>', marker) + '<script>'.length;
const watchdog = indexHtml.slice(open, indexHtml.indexOf('</script>', open));

function setOnline(value) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => value });
}

let reload;

// jsdom's location can't be stubbed, so hand the script its own `location`.
function runWatchdog() {
  // eslint-disable-next-line no-new-func
  new Function('location', watchdog)({ reload });
}

function failModuleLoad() {
  const s = document.createElement('script');
  s.type = 'module';
  document.body.appendChild(s);
  s.dispatchEvent(new Event('error'));
}

describe('index.html boot watchdog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <div id="splash-screen" style="display:flex"><div>logo</div><div>Connecting to database…</div></div>
      <div id="pw-gate"><button onclick="tryGoogleLogin()">Sign in</button><div class="err" id="pw-err"></div></div>`;
    delete window.__lmAppLoaded;
    delete window.__lmBootFailed;
    delete window.tryGoogleLogin;
    reload = vi.fn();
    setOnline(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('sits before the module bundle so it runs first', () => {
    expect(marker).toBeGreaterThan(-1);
    expect(marker).toBeLessThan(indexHtml.indexOf('<script type="module" src="/src/main.js">'));
  });

  it('is told by main.js that the bundle loaded', () => {
    expect(mainJs).toContain('window.__lmAppLoaded = true;');
  });

  it('gives the sign-in button a function even before the bundle loads', () => {
    runWatchdog();
    expect(typeof window.tryGoogleLogin).toBe('function');
  });

  it('explains the problem instead of doing nothing when offline', () => {
    setOnline(false);
    runWatchdog();
    window.tryGoogleLogin();
    expect(document.getElementById('pw-err').textContent).toMatch(/offline/i);
    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads to try again once back online', () => {
    runWatchdog();
    window.tryGoogleLogin();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('clears the splash and says why when the bundle fails to load', () => {
    setOnline(false);
    runWatchdog();
    failModuleLoad();
    expect(document.getElementById('splash-screen').style.display).toBe('none');
    expect(document.getElementById('pw-err').textContent).toMatch(/offline/i);
  });

  it('stands down once the bundle has loaded', () => {
    runWatchdog();
    window.__lmAppLoaded = true;
    failModuleLoad();
    vi.advanceTimersByTime(20000);
    expect(document.getElementById('splash-screen').style.display).toBe('flex');
    expect(document.getElementById('pw-err').textContent).toBe('');
  });

  it('does not give up on a slow connection, just says it is slow', () => {
    runWatchdog();
    vi.advanceTimersByTime(12000);
    const splash = document.getElementById('splash-screen');
    expect(splash.style.display).toBe('flex');
    expect(splash.lastElementChild.textContent).toMatch(/longer than usual/);
  });

  it('gives up on the splash after the wait when offline', () => {
    runWatchdog();
    setOnline(false);
    vi.advanceTimersByTime(12000);
    expect(document.getElementById('splash-screen').style.display).toBe('none');
  });
});
