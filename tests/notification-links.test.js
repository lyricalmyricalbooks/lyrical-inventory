// The home screen's notifications card and the notifications window, in the
// real app: a to-do item is not said twice in one card, and every message
// leads to the item it is about, not to the top of the to-do list.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';
import { logNotification, readNotificationLog } from '../src/lib/notification-log.js';

const $ = (id) => document.getElementById(id);
const waitFor = (fn) => vi.waitFor(fn, { timeout: 4000, interval: 10 });

let app;
let signalId;

beforeAll(async () => {
  // No ISBN and a low stock threshold give the to-do list something to say.
  app = await loadApp({ books: [makeBook({ id: 'harbour', isbn: '' })] });
  app.window.switchTab('todo');
  await waitFor(() => expect($('todo-groups').querySelector('.todo-row[data-signal]')).toBeTruthy());
  signalId = $('todo-groups').querySelector('.todo-row[data-signal]').dataset.signal;
}, 30000);

describe('a to-do message in the notifications window', () => {
  it('offers the item itself, not a generic "Open to-do"', async () => {
    logNotification({ id: `todo:${signalId}`, title: 'Something on the list', actionLabel: 'Open to-do', action: "switchTab('todo')" });
    app.window.openNotificationsPanel();
    const item = [...$('notif-log-list').querySelectorAll('.notif-item')].find(el => el.textContent.includes('Something on the list'));
    expect(item).toBeTruthy();
    expect(item.textContent).not.toContain('Open to-do');
    const action = item.querySelector(`[data-notif-kind="todo:${signalId}"]`);
    expect(action).toBeTruthy();
  });

  it('a link to the list lands on that row, picked out, and marks the message seen', async () => {
    const row = () => [...$('todo-groups').querySelectorAll('.todo-row')].find(el => el.dataset.signal === signalId);
    app.window.openNotificationsPanel();
    const link = document.createElement('button');
    link.dataset.openTodo = signalId;
    link.dataset.notifKind = `todo:${signalId}`;
    $('notif-log-list').appendChild(link);
    link.click();
    await waitFor(() => expect($('m-notifications').style.display).not.toBe('flex'));
    await waitFor(() => expect(row()?.classList.contains('is-spotlit')).toBe(true));
    expect(readNotificationLog().find(i => i.kind === `todo:${signalId}`).read).toBe(true);
  });

  it('says it is done once the item has gone from the list', () => {
    logNotification({ id: 'todo:long-gone-item', title: 'Old news' });
    app.window.openNotificationsPanel();
    const item = [...$('notif-log-list').querySelectorAll('.notif-item')].find(el => el.textContent.includes('Old news'));
    expect(item?.textContent).toContain('Done. Nothing left to do here.');
  });
});

describe('the home screen card', () => {
  it('names itself plainly and explains what "more" means', () => {
    expect(document.querySelector('#all-notifications-card .rail-title').textContent).toBe('Needs you now');
    const more = $('all-notif-more');
    if (!more.hidden) expect(more.textContent).toMatch(/need you · see all \d+|less urgent/);
  });

  it('does not repeat a to-do item listed above it under "Latest from the app"', async () => {
    app.window.switchTab('dashboard');
    const above = $('all-notifications').querySelector('.notif-item[data-signal]');
    expect(above).toBeTruthy();
    logNotification({ id: `todo:${above.dataset.signal}`, title: 'Said once already' });
    logNotification({ id: 'delivery-watch', title: 'Parcel delivered' });
    app.window.onNotificationLogged();
    expect($('all-notif-latest').textContent).toContain('Parcel delivered');
    expect($('all-notif-latest').textContent).not.toContain('Said once already');
  });
});

describe('links that land on the exact place', () => {
  it('"Add ISBN" opens the book settings on the ISBN box', async () => {
    app.window.switchTab('todo');
    const btn = [...$('todo-groups').querySelectorAll('[data-fix="edit-book"]')].find(b => b.dataset.fixTab === 'isbn');
    expect(btn).toBeTruthy();
    btn.click();
    await waitFor(() => expect(document.activeElement?.id).toBe('nb-isbn'));
    expect($('add-book-modal-title').textContent).toContain('Harbour Lights');
  });
});
