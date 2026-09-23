import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(dirname, '../index.html'), 'utf8');
const js = fs.readFileSync(path.join(dirname, '../src/main.js'), 'utf8');
const css = fs.readFileSync(path.join(dirname, '../src/style.css'), 'utf8');

describe('sidebar alert control', () => {
  it('lives in the sidebar account menu, not the navigation list', () => {
    expect(html).toMatch(/id="sidebar-alert-toggle"[\s\S]*?role="menuitemcheckbox"[\s\S]*?aria-checked="false"/);
    expect(html).toContain('onclick="toggleSidebarAlerts()"');
    const menu = html.slice(html.indexOf('id="side-acct-menu"'), html.indexOf('</aside>'));
    expect(menu).toContain('id="sidebar-alert-toggle"');
    const navs = html.slice(html.indexOf('<aside id="pub-sidebar"'), html.indexOf('id="side-acct"'));
    expect(navs).not.toContain('sidebar-alert-toggle');
  });

  it('persists the display preference without deleting notification data', () => {
    expect(js).toContain("const SIDEBAR_ALERTS_HIDDEN_KEY = 'lm-sidebar-alerts-hidden'");
    expect(js).toContain('localStorage.setItem(SIDEBAR_ALERTS_HIDDEN_KEY, String(_sidebarAlertsHidden))');
    const toggleBody = js.match(/function toggleSidebarAlerts\(\) \{([\s\S]*?)\n\}/)?.[1] || '';
    expect(toggleBody).not.toContain('TODO_DISMISSED_KEY');
  });

  it('only suppresses notification badges inside the publisher sidebar', () => {
    expect(css).toContain('#pub-sidebar.nav-alerts-hidden .todo-nav-badge');
    expect(css).toContain('#pub-sidebar.nav-alerts-hidden .health-badge');
    expect(css).toMatch(/\.pub-shell \.pub-side-item\s*\{[\s\S]*?min-height:\s*44px/);
  });
});
