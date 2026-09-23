import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mainContent = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');

describe('startup performance wiring', () => {
  it('keeps mode selection ahead of concurrent authenticated startup reads', () => {
    const startup = mainContent.match(/async function initStartup\(\)[\s\S]*?function setupGate/)?.[0] || '';
    const modeFlags = startup.indexOf('await window._fbLoadModeFlags()');
    const concurrentLoads = startup.indexOf('await Promise.all([loadCatalog(), loadNotifySettings(), loadAnalyticsSettings()])');

    expect(modeFlags).toBeGreaterThan(-1);
    expect(concurrentLoads).toBeGreaterThan(modeFlags);
  });

  it('loads independent boot settings concurrently', () => {
    const bootStart = mainContent.indexOf('async function boot(forcedBook)');
    const boot = mainContent.slice(bootStart, bootStart + 5000);

    expect(boot).toContain('const bootLoads = [loadPaymentLinks(), loadProductionCosts(), loadWebsitePaymentMethods()]');
    expect(boot).toContain('await Promise.all(bootLoads)');
  });

  it('recounts the Open Call badge once suppressions and open calls have both loaded', () => {
    const bootStart = mainContent.indexOf('async function boot(forcedBook)');
    const boot = mainContent.slice(bootStart, bootStart + 5000);
    const loaded = boot.indexOf('await Promise.all(bootLoads)');
    const recount = boot.indexOf('updateOpenCallBadges()');

    expect(boot).toContain('loadCustomerSuppression()');
    expect(recount).toBeGreaterThan(loaded);
  });
});
