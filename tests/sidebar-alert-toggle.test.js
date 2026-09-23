import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(dirname, '../index.html'), 'utf8');
const js = fs.readFileSync(path.join(dirname, '../src/main.js'), 'utf8');
const css = fs.readFileSync(path.join(dirname, '../src/style.css'), 'utf8');

describe('sidebar alert control', () => {
  it('provides an accessible reversible control next to the To-do navigation', () => {
    expect(html).toMatch(/id="sidebar-alert-toggle"[\s\S]*aria-pressed="false"/);
    expect(html).toContain('onclick="toggleSidebarAlerts()"');
    expect(html.indexOf('sidebar-alert-toggle')).toBeGreaterThan(html.indexOf('todo-sidebar-btn'));
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
    expect(css).toMatch(/\.sidebar-alert-toggle\s*\{[\s\S]*min-height:\s*44px/);
  });
});
