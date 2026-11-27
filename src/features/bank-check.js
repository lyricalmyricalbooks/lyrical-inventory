// Bank check: match bank and card charges to the receipts already filed, and
// list the charges that still have no receipt. Lines come from a statement
// file the publisher downloads from their bank, or from banks connected
// through Plaid with the publisher's own keys in the Sheet script.
//
// What is kept (settings/bankCheck, plus a copy on this device for offline):
// the lines, the publisher's own match choices, and each bank's sync cursor.
// No bank login or access token is ever in the app.

import { escapeHtml as esc } from '../lib/html.js';
import { parseStatement, mergeLines, matchBankLines, describeBankCheck } from '../lib/bank-match.js';
import { plaidCall, syncBank, openPlaidLink } from '../lib/bank-link-client.js';
import '../styles/bank-check.css';

const LOCAL_KEY = 'lyrical-bank-check-v1';
const MAX_LINES = 3000;
const PERIODS = [['30', '30 days'], ['90', '3 months'], ['year', 'This year'], ['all', 'Everything']];

let deps = null, host = null;
let data = { lines: [], links: {}, cursors: {} };
let loadedFor = '';
let plaid = null;            // {configured, env, items} from the script, or null when unknown
let period = '90';
let busy = '';
let message = '';

const money = (amount, currency) => {
  try { return new Intl.NumberFormat('en-CA', { style: 'currency', currency: currency || 'CAD' }).format(amount); } catch { return `${currency || ''} ${Number(amount).toFixed(2)}`; }
};
const shortDay = iso => {
  const t = new Date(`${iso}T12:00:00`);
  return Number.isNaN(t.getTime()) ? iso : t.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
};
const uidOf = () => deps?.user()?.uid || '';

function readLocal(uid) {
  try { const saved = JSON.parse(localStorage.getItem(`${LOCAL_KEY}:${uid}`) || 'null'); return saved && typeof saved === 'object' ? saved : null; } catch { return null; }
}
function writeLocal(uid) {
  try { localStorage.setItem(`${LOCAL_KEY}:${uid}`, JSON.stringify(data)); } catch { /* a full or blocked store keeps the copy in memory only */ }
}
function clean(saved) {
  return {
    lines: Array.isArray(saved?.lines) ? saved.lines.slice(0, MAX_LINES) : [],
    links: saved?.links && typeof saved.links === 'object' ? saved.links : {},
    cursors: saved?.cursors && typeof saved.cursors === 'object' ? saved.cursors : {},
  };
}

async function load() {
  const uid = uidOf();
  if (loadedFor === uid) return;
  loadedFor = uid;
  data = clean(readLocal(uid));
  try {
    const saved = typeof window._fbLoadSettings === 'function' ? await window._fbLoadSettings('bankCheck') : null;
    if (saved && uidOf() === uid) { data = clean({ ...saved, lines: mergeLines(clean(saved).lines, data.lines) }); writeLocal(uid); }
  } catch { /* offline: the device copy is used */ }
}

async function save() {
  data.lines = data.lines.slice(0, MAX_LINES);
  writeLocal(uidOf());
  try { if (typeof window._fbSaveSettings === 'function') await window._fbSaveSettings('bankCheck', data); } catch { /* kept on this device; saved again with the next change */ }
}

function range() {
  const today = new Date();
  const iso = d => d.toISOString().slice(0, 10);
  if (period === 'all') return {};
  if (period === 'year') return { from: `${today.getFullYear()}-01-01` };
  return { from: iso(new Date(today.getTime() - Number(period) * 86400000)) };
}

async function idToken() { return deps.user()?.getIdToken?.(); }

async function loadPlaid() {
  const endpoint = deps.service?.();
  if (!endpoint) { plaid = null; return; }
  try { plaid = await plaidCall({ endpoint, idToken: await idToken(), op: 'status' }); } catch { plaid = null; }
}

async function mountBankCheck(element, dependencies) {
  deps = dependencies;
  if (!deps.publisher?.()) { element.innerHTML = '<p class="finder-note">Only the publisher can check the bank.</p>'; return; }
  if (host !== element) {
    host = element;
    host.addEventListener('click', onClick);
    host.addEventListener('change', onChange);
  }
  await load();
  render();
  loadPlaid().then(render);
}

function render() {
  if (!host) return;
  const result = matchBankLines(data.lines, deps.expenses(), { links: data.links, ...range() });
  const sure = result.matched.filter(m => m.sure), confirm = result.matched.filter(m => !m.sure);
  const banks = plaid?.items || [];
  host.innerHTML = `
    <div class="bank-check">
      <p class="email-panel-intro">Bring in your bank or card charges and the app matches each one to a receipt you have filed. Charges with no receipt are listed, so nothing is missing at tax time.</p>
      <div class="bank-sources">
        <section class="bank-source" aria-labelledby="bank-file-title">
          <h4 id="bank-file-title">Statement file</h4>
          <p class="finder-note">On your bank’s website, download your account or card activity as a CSV file, then add it here. Works with any bank.</p>
          <label class="btn gold bank-file-btn"><input type="file" accept=".csv,text/csv,text/plain" data-bank-file hidden ${busy ? 'disabled' : ''}>Add a statement file</label>
        </section>
        <section class="bank-source" aria-labelledby="bank-plaid-title">
          <h4 id="bank-plaid-title">Connected banks</h4>
          ${renderPlaid(banks)}
        </section>
      </div>
      ${message ? `<p class="bank-message" role="status">${esc(message)}</p>` : '<p class="sr-only" role="status"></p>'}
      ${data.lines.length ? `
      <div class="bank-toolbar">
        <div class="finder-period" role="group" aria-label="Which charges to check">
          ${PERIODS.map(([value, label]) => `<button type="button" class="finder-period-btn" data-bank-period="${value}" aria-pressed="${period === value}">${label}</button>`).join('')}
        </div>
        <p class="bank-summary">${esc(describeBankCheck(result))}</p>
      </div>
      ${renderList('No receipt yet', 'Charges the app could not match to a filed receipt. Find the receipt, or mark it as not needed (a transfer, a fee, a personal charge).', result.missing.map(missingRow), 'Every charge in this period has a receipt.', true)}
      ${confirm.length ? renderList('To confirm', 'The shop and the day agree but the amount differs, usually a purchase in another currency.', confirm.map(m => matchRow(m, true)), '', true) : ''}
      ${renderList('Matched', '', sure.map(m => matchRow(m, false)), 'Nothing matched yet.', false, sure.length)}
      ${result.unmatched.length ? renderList('Receipts with no charge', 'Filed receipts in these dates that no charge paid: cash, another card, or a statement that is not here yet.', result.unmatched.slice(0, 50).map(unmatchedRow), '', false, result.unmatched.length) : ''}
      <p class="bank-foot"><button type="button" class="btn sm" data-bank-clear ${busy ? 'disabled' : ''}>Remove statement lines</button> <span class="finder-note">${data.lines.length} line${data.lines.length === 1 ? '' : 's'} kept. Connected banks stay connected.</span></p>`
    : '<div class="bank-empty"><p><strong>No charges yet.</strong></p><p class="finder-note">Add a statement file or connect a bank to start matching.</p></div>'}
    </div>`;
}

function renderPlaid(banks) {
  if (!deps.service?.()) return '<p class="finder-note">Connect your Google Sheet script first (Tax Centre › Gmail Finder shows how).</p>';
  if (plaid === null) return '<p class="finder-note">Checking your Sheet script…</p>';
  if (!plaid.configured) {
    return `<p class="finder-note">Links your bank through Plaid so new charges come in by themselves. Plaid’s Trial plan is free for up to 10 bank connections.</p>
      <details class="bank-setup"><summary>How to set it up</summary><ol>
        <li>Sign up at plaid.com and choose the free Trial plan.</li>
        <li>In Plaid’s dashboard, request Production access for Transactions, then copy your client ID and Production secret.</li>
        <li>In your Google Sheet script, open Project settings › Script properties and add PLAID_CLIENT_ID and PLAID_SECRET with those values.</li>
        <li>Come back here and press Connect a bank.</li></ol>
        <p class="finder-note">The keys stay in your script, never in the app. Your Sheet script must be the newest version.</p></details>`;
  }
  return `${banks.length ? `<ul class="bank-banks">${banks.map(item => `<li><span><strong>${esc(item.institution || 'Your bank')}</strong>${item.added ? `<br><span class="finder-note">Connected ${esc(shortDay(item.added))}</span>` : ''}</span>
      <button type="button" class="btn sm" data-bank-disconnect="${esc(item.itemId)}" ${busy ? 'disabled' : ''}>Disconnect</button></li>`).join('')}</ul>` : '<p class="finder-note">No bank connected yet.</p>'}
    <div class="bank-plaid-actions">
      <button type="button" class="btn ${banks.length ? '' : 'gold'}" data-bank-connect ${busy || banks.length >= 10 ? 'disabled' : ''}>Connect a bank</button>
      ${banks.length ? `<button type="button" class="btn gold" data-bank-sync ${busy ? 'disabled' : ''}>${busy === 'sync' ? 'Getting charges…' : 'Get new charges'}</button>` : ''}
    </div>
    ${plaid.env === 'sandbox' ? '<p class="finder-note">Test mode: these are Plaid’s sample banks, not real ones.</p>' : ''}`;
}

function renderList(title, hint, rows, empty, open, count = rows.length) {
  return `<details class="finder-failures bank-list" ${open ? 'open' : ''}>
    <summary><span class="finder-failures-sum">${esc(title)} <span class="bank-count">${count}</span></span>${hint ? `<span class="finder-failures-hint">${esc(hint)}</span>` : ''}</summary>
    ${rows.length ? `<ul class="finder-failures-list">${rows.join('')}</ul>` : `<p class="finder-note bank-list-empty">${esc(empty)}</p>`}
  </details>`;
}

function lineText(line) {
  return `<span class="bank-line"><strong>${esc(line.description || 'Charge')}</strong><br><span class="finder-setaside-why">${esc(shortDay(line.date))} · ${esc(line.source.startsWith('bank:') ? line.source.slice(5) : 'Statement file')}</span></span>
    <span class="bank-amount">${esc(money(line.amount, line.currency))}</span>`;
}

function missingRow(line) {
  return `<li class="finder-failure bank-row">${lineText(line)}
    <button type="button" class="btn sm" data-bank-none="${esc(line.id)}">Not needed</button></li>`;
}

function matchRow({ line, expense, why }, ask) {
  const receipt = `${expense.vendor || expense.desc || 'Receipt'} · ${money(Number(expense.amount), expense.currency)} · ${shortDay(expense.date)}`;
  return `<li class="finder-failure bank-row">${lineText(line)}
    <span class="bank-match"><span aria-hidden="true">↳</span> ${esc(receipt)}<br><span class="finder-setaside-why">${esc(why)}</span></span>
    ${ask ? `<button type="button" class="btn sm gold" data-bank-confirm="${esc(line.id)}" data-expense="${esc(expense.id)}">That’s it</button>
      <button type="button" class="btn sm" data-bank-reject="${esc(line.id)}">Not this one</button>`
    : (data.links[line.id] ? `<button type="button" class="btn sm" data-bank-undo="${esc(line.id)}">Undo</button>` : '')}</li>`;
}

function unmatchedRow(expense) {
  return `<li class="finder-failure bank-row"><span class="bank-line"><strong>${esc(expense.vendor || expense.desc || 'Receipt')}</strong><br><span class="finder-setaside-why">${esc(shortDay(expense.date))}</span></span>
    <span class="bank-amount">${esc(money(Number(expense.amount), expense.currency))}</span></li>`;
}

async function run(kind, task) {
  if (busy) return;
  busy = kind; message = ''; render();
  try { message = (await task()) || ''; } catch (error) { message = error?.message || 'Something went wrong. Try again.'; } finally { busy = ''; render(); }
}

async function onChange(event) {
  const input = event.target.closest('[data-bank-file]');
  if (!input?.files?.length) return;
  const file = input.files[0];
  await run('file', async () => {
    if (file.size > 8 * 1024 * 1024) return 'That file is too large for a statement. Download a shorter period from your bank.';
    const { lines, problem } = parseStatement(await file.text(), { fileName: file.name, currency: 'CAD' });
    if (problem) return problem;
    const before = data.lines.length;
    data.lines = mergeLines(data.lines, lines);
    await save();
    const added = data.lines.length - before;
    period = 'all';
    return added ? `Added ${added} charge${added === 1 ? '' : 's'} from ${file.name}.` : `Every line in ${file.name} was already here.`;
  });
}

async function onClick(event) {
  const target = event.target.closest('button');
  if (!target || target.disabled) return;
  const ds = target.dataset;
  if (ds.bankPeriod) { period = ds.bankPeriod; render(); return; }
  if (ds.bankNone) { data.links[ds.bankNone] = 'none'; await save(); render(); return; }
  if (ds.bankConfirm) { data.links[ds.bankConfirm] = ds.expense; await save(); render(); return; }
  if (ds.bankReject) { data.links[ds.bankReject] = 'none'; await save(); message = 'Left as a charge with no receipt. Use Undo on it in the list to change that.'; render(); return; }
  if (ds.bankUndo) { delete data.links[ds.bankUndo]; await save(); render(); return; }
  if ('bankClear' in ds) {
    if (deps.confirm && !(await deps.confirm('Remove every statement line? Your receipts are not touched, and connected banks can send their charges again.'))) return;
    data = { lines: [], links: {}, cursors: {} };
    await save(); message = 'Statement lines removed.'; render(); return;
  }
  if ('bankConnect' in ds) {
    await run('connect', async () => {
      const endpoint = deps.service();
      const { linkToken } = await plaidCall({ endpoint, idToken: await idToken(), op: 'linkToken' });
      const picked = await openPlaidLink(linkToken);
      if (!picked) return '';
      plaid = { ...plaid, ...(await plaidCall({ endpoint, idToken: await idToken(), op: 'exchange', ...picked })) };
      return `${picked.institution || 'Your bank'} is connected. Press Get new charges to bring in its activity.`;
    });
    return;
  }
  if ('bankSync' in ds) {
    await run('sync', async () => {
      const endpoint = deps.service();
      const token = await idToken();
      const before = data.lines.length;
      let unfinished = false;
      for (const item of plaid?.items || []) {
        const got = await syncBank({ endpoint, idToken: token, item, cursor: data.cursors[item.itemId] || '', lines: data.lines });
        data.lines = mergeLines([], got.lines);
        data.cursors[item.itemId] = got.cursor;
        unfinished ||= !got.done;
        await save();
      }
      const added = data.lines.length - before;
      return `${added > 0 ? `${added} new charge${added === 1 ? '' : 's'} came in.` : 'No new charges.'}${unfinished ? ' There are more: press Get new charges again.' : ''}`;
    });
    return;
  }
  if (ds.bankDisconnect) {
    const item = (plaid?.items || []).find(x => x.itemId === ds.bankDisconnect);
    if (deps.confirm && !(await deps.confirm(`Disconnect ${item?.institution || 'this bank'}? Charges already here stay. Plaid’s Trial does not give the connection slot back.`))) return;
    await run('disconnect', async () => {
      plaid = { ...plaid, ...(await plaidCall({ endpoint: deps.service(), idToken: await idToken(), op: 'remove', itemId: ds.bankDisconnect })) };
      delete data.cursors[ds.bankDisconnect];
      await save();
      return `${item?.institution || 'The bank'} is disconnected.`;
    });
  }
}

export { mountBankCheck };
