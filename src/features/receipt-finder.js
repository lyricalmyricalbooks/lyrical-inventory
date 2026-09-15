import { escapeHtml as esc } from '../lib/html.js';
import { receiptQuery, normalizeFoundReceipt, receiptProblems, receiptReviewStatus, receiptMoney, RECEIPT_STATUSES } from '../lib/receipt-finder.js';
import { createReceiptFinderClient, extractFoundReceipts, decodeGmailBase64 } from '../lib/receipt-finder-client.js';
import { createReceiptFinderStore } from '../lib/receipt-finder-store.js';
import { flushReceiptOutbox } from '../lib/receipt-finder-outbox.js';
import { downloadBlob } from '../lib/download.js';
import '../styles/receipt-finder.css';

const LABELS = { all: 'All', ready: 'Ready', review: 'Needs review', duplicate: 'Duplicates', queued: 'Pending import', imported: 'Imported', ignored: 'Dismissed' };
const emptyState = () => ({ drafts: [], emails: {}, scans: {}, endpoint: '', account: '', lastScan: '', pageToken: '', lastQuery: '' });
let deps, host, state = emptyState(), uid = '', accessToken = '', controller = null, busy = false, flushing = false;
let filter = 'all', resultQuery = '', saveChain = Promise.resolve(), initialized = false, restore = Promise.resolve();
const store = createReceiptFinderStore();
const client = createReceiptFinderClient({ token: () => accessToken, onExpired: () => { accessToken = ''; renderConnection(); } });
const active = () => uid && deps?.user()?.uid === uid && deps.publisher();
const statusOf = draft => receiptReviewStatus(draft, deps.expenses());

async function persist() {
  if (!active()) throw new Error('Sign in as the same publisher to continue');
  const savedUid = uid;
  const snapshot = structuredClone(state);
  saveChain = saveChain.catch(() => {}).then(() => store.save(savedUid, snapshot));
  await saveChain;
}

function announce(text) {
  const node = host?.querySelector('[data-finder-status]');
  if (node) node.textContent = text;
}

function renderConnection() {
  const pill = document.getElementById('email-account-pill');
  if (pill) {
    pill.textContent = accessToken ? `● ${state.account}` : '○ Gmail not connected';
    pill.className = `pill ${accessToken ? 'green' : 'gray'} email-connected-pill`;
  }
  const button = host?.querySelector('[data-action="connect"]');
  if (button) { button.textContent = accessToken ? 'Disconnect Gmail' : 'Connect Gmail'; button.disabled = busy; }
}

async function startReceiptFinder(dependencies) {
  deps = dependencies;
  const nextUid = deps.user()?.uid || '';
  if (nextUid !== uid) {
    controller?.abort(); accessToken = ''; state = emptyState(); uid = nextUid;
    host?.replaceChildren(); host = null;
    if (active()) {
      restore = store.load(uid).then(saved => {
        if (active() && deps.user()?.uid === nextUid && saved) state = { ...emptyState(), ...saved };
      });
    }
  }
  if (!initialized) {
    initialized = true;
    window.addEventListener('online', () => { resumeReceiptImports(); });
    window.addEventListener('offline', () => announce('Offline. Saved receipts can be reviewed and queued for import.'));
    // Reset immediately on auth changes; a former publisher must not keep a
    // token or mailbox view while an author is signed in on the same browser.
    window._fbOnAuthStateChanged?.(user => {
      if (user?.uid !== uid) { controller?.abort(); accessToken = ''; uid = ''; state = emptyState(); host?.replaceChildren(); host = null; }
    });
  }
  await restore;
  // Restoring the outbox is cheap; uploading a backlog must not delay opening.
  resumeReceiptImports();
}

async function mountReceiptFinder(element, dependencies) {
  await startReceiptFinder(dependencies);
  if (!active()) throw new Error('Publisher access required');
  if (host === element && element.querySelector('[data-finder-list]')) { render(); return; }
  host = element;
  host.removeEventListener('click', onClick);
  host.removeEventListener('change', onChange);
  const from = new Date(); from.setDate(from.getDate() - 30);
  host.innerHTML = `
    <div class="finder-head"><div><h3 class="section-hed">Find the receipts. Keep the records.</h3>
      <p>Scan Gmail, review the details, then import into Business Expenses. Only scanned messages and attachments are sent to the receipt AI service.</p></div>
      <button type="button" class="btn" data-action="connect">Connect Gmail</button></div>
    <details class="finder-setup"><summary>Finder setup</summary><div class="form-group">
      <label for="finder-endpoint">Receipt AI deployment URL</label><input type="url" id="finder-endpoint" value="${esc(state.endpoint)}" placeholder="https://script.google.com/macros/s/…/exec">
      <p>Use the separate Receipt Finder Apps Script deployment. Its AI key stays in Script Properties. Gmail access is read-only and lasts for this session.</p>
      <button class="btn" type="button" data-action="save-setup">Save setup</button>
      <button class="btn" type="button" data-action="forget">Clear saved finder data</button>
    </div></details>
    <div class="finder-filters">
      <div class="form-group finder-query"><label for="finder-query">Keywords or Gmail search</label><input type="search" id="finder-query" placeholder="Invoices, receipts, orders…"></div>
      <div class="form-group"><label for="finder-from">From date</label><input type="date" id="finder-from" value="${from.toISOString().slice(0, 10)}"></div>
      <div class="form-group"><label for="finder-to">Through date</label><input type="date" id="finder-to"></div>
      <div class="form-group"><label for="finder-sender">Sender / vendor email</label><input type="text" id="finder-sender" placeholder="supplier@example.com"></div>
    </div>
    <div class="finder-toolbar" role="group" aria-label="Receipt search filters">
      <button type="button" class="filter-chip" data-preset="7">🕒 Past 7 days</button>
      <button type="button" class="filter-chip" data-preset="30">📅 Past 30 days</button>
      <button type="button" class="filter-chip" data-toggle="attachments" aria-pressed="false">📎 With attachments</button>
      <button type="button" class="filter-chip" data-toggle="invoices" aria-pressed="false">🧾 Invoices / Bills</button>
      <button type="button" class="filter-chip" data-toggle="shipping" aria-pressed="false">📦 Shipping costs</button>
      <button type="button" class="btn gold" data-action="scan">Find invoices &amp; receipts</button>
      <button type="button" class="btn" data-action="cancel" hidden>Stop scan</button>
    </div>
    <p data-finder-status role="status" aria-live="polite">${state.lastScan ? `Last scan: ${esc(new Date(state.lastScan).toLocaleString())}` : 'Choose a period and scan. You can review every result before importing.'}</p>
    <div data-finder-summary class="finder-summary"></div>
    <div class="finder-toolbar" data-finder-tabs role="group" aria-label="Filter receipt status"></div>
    <div class="finder-toolbar"><label class="finder-select"><input type="checkbox" data-select-all> Select visible ready receipts</label>
      <input type="search" class="ledger-filter-input" data-result-search aria-label="Search found receipts" placeholder="Vendor, invoice number or description">
      <button type="button" class="btn" data-action="retry">Retry pending imports</button></div>
    <div data-finder-list></div>
    <div data-finder-errors></div>
    <div class="finder-toolbar finder-bottom"><button type="button" class="btn" data-action="next" hidden>Scan next 25 emails</button>
      <span data-selected-count></span><button type="button" class="btn gold" data-action="import">Import selected</button></div>`;
  host.addEventListener('click', onClick);
  host.addEventListener('change', onChange);
  host.querySelector('[data-result-search]').addEventListener('input', event => {
    resultQuery = event.target.value.toLowerCase(); render();
  });
  host.querySelector('#finder-query').addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); scan(false).catch(report); }
  });
  render();
}

function report(error) {
  if (error.name === 'AbortError') return;
  console.error('[receipt-finder]', error);
  announce(error.message || 'Receipt finder failed. Try again.');
  deps.toast(error.message || 'Receipt finder failed', 'err');
}

function visibleDrafts() {
  return state.drafts.filter(draft => (filter === 'all' || statusOf(draft) === filter)
    && `${draft.vendor} ${draft.reference} ${draft.description}`.toLowerCase().includes(resultQuery));
}

function render() {
  if (!host?.querySelector('[data-finder-list]') || !active()) return;
  renderConnection();
  const counts = Object.fromEntries(RECEIPT_STATUSES.map(status => [status, 0]));
  state.drafts.forEach(draft => { counts.all++; counts[statusOf(draft)]++; });
  host.querySelector('[data-finder-summary]').innerHTML = [
    ['Ready to import', counts.ready], ['Needs your review', counts.review], ['Imported', counts.imported],
  ].map(([label, count]) => `<div class="finder-stat"><span>${label}</span><strong>${count}</strong></div>`).join('');
  host.querySelector('[data-finder-tabs]').innerHTML = RECEIPT_STATUSES.map(status => `<button type="button" class="filter-chip${filter === status ? ' active' : ''}" data-status="${status}" aria-pressed="${filter === status}">${LABELS[status]} <span class="mono-num">${counts[status]}</span></button>`).join('');
  const drafts = visibleDrafts();
  const openIds = new Set(Array.from(host.querySelectorAll('details[data-draft][open]'), el => el.dataset.draft));
  host.querySelector('[data-finder-list]').innerHTML = drafts.length ? drafts.map(draft => renderDraft(draft, openIds.has(draft.id))).join('') : `
    <div class="empty-state"><div class="e-icon" aria-hidden="true">🧾</div><h4>${state.drafts.length ? 'No receipts match this view' : 'Your receipts will appear here'}</h4>
      <p>${state.drafts.length ? 'Choose All or clear the search to see your other receipts.' : 'Scan a period to find invoices and receipts, including those inside PDFs and photos.'}</p>
      <button type="button" class="btn" data-action="${state.drafts.length ? 'show-all' : 'scan'}">${state.drafts.length ? 'Show all receipts' : 'Scan this period'}</button></div>`;
  const errors = Object.entries(state.scans).filter(([, scan]) => scan.error);
  host.querySelector('[data-finder-errors]').innerHTML = errors.length ? `<details><summary>${errors.length} email${errors.length === 1 ? '' : 's'} need another attempt</summary>${errors.map(([key, scan]) => `<p>${esc(scan.subject || key)} — ${esc(scan.error)} <button type="button" class="btn" data-retry-email="${esc(key)}">Retry email</button></p>`).join('')}</details>` : '';
  const ready = drafts.filter(draft => statusOf(draft) === 'ready');
  const all = host.querySelector('[data-select-all]');
  all.checked = ready.length > 0 && ready.every(draft => draft.selected);
  all.indeterminate = ready.some(draft => draft.selected) && !all.checked;
  const selected = state.drafts.filter(draft => draft.selected && statusOf(draft) === 'ready').length;
  host.querySelector('[data-selected-count]').textContent = `${selected} selected`;
  host.querySelector('[data-action="import"]').disabled = !selected || busy;
  host.querySelector('[data-action="scan"]').disabled = busy;
  host.querySelector('[data-action="cancel"]').hidden = !busy;
  host.querySelector('[data-action="next"]').hidden = !state.pageToken;
  host.querySelector('[data-action="next"]').disabled = busy;
}

function renderDraft(draft, open) {
  const status = statusOf(draft), locked = ['imported', 'queued', 'ignored'].includes(status);
  const source = state.emails[`${draft.account}:${draft.messageId}`];
  const field = (key, label, type = 'text') => `<label>${label}<input data-field="${key}" type="${type}" ${type === 'number' ? 'step="0.01" inputmode="decimal"' : ''} value="${esc(String(draft[key] ?? ''))}" ${locked ? 'disabled' : ''}></label>`;
  const problems = receiptProblems(draft);
  return `<details class="finder-draft" data-draft="${esc(draft.id)}" ${open ? 'open' : ''}>
    <summary><span class="finder-vendor">${esc(draft.vendor || 'Vendor needs review')}<small>${esc(draft.reference || draft.description || 'Receipt details')}</small></span>
      <span class="finder-money">${draft.amount === null ? '—' : esc(`${draft.currency || '?'} ${draft.amount.toFixed(2)}`)}</span>
      <span class="pill ${status === 'ready' || status === 'imported' ? 'green' : status === 'review' || status === 'duplicate' ? 'amber' : 'gray'}">${LABELS[status]}</span>
      <span class="finder-date">${esc(draft.date || 'Date unknown')}</span></summary>
    <div class="finder-review">
      <div class="finder-toolbar"><label class="finder-select"><input type="checkbox" data-select ${draft.selected ? 'checked' : ''} ${status !== 'ready' ? 'disabled' : ''}> Include in import</label>
        <span>AI confidence: ${Math.round(draft.confidence * 100)}%</span>
        <span>${esc(draft.paymentStatus)} · ${esc(draft.documentType)}</span></div>
      ${problems.length ? `<p class="finder-warning">${esc(problems.join('. '))}</p>` : ''}
      ${draft.error ? `<p class="finder-warning">${esc(draft.error)}</p>` : ''}
      ${status === 'duplicate' ? '<p class="finder-warning">Matches a saved expense. This receipt will not be imported again.</p>' : ''}
      <div class="finder-edit-grid">${field('vendor', 'Vendor')}${field('reference', 'Invoice / receipt number')}${field('description', 'Description')}
        ${field('date', 'Invoice date', 'date')}${field('dueDate', 'Due date', 'date')}${field('currency', 'Currency (ISO code)')}
        ${field('amount', 'Total', 'number')}${field('subtotal', 'Subtotal', 'number')}${field('tax', 'Tax', 'number')}${field('shipping', 'Shipping', 'number')}
        <label>Category<select data-field="category" ${locked ? 'disabled' : ''}>${deps.categories.map(category => `<option ${category === draft.category ? 'selected' : ''}>${esc(category)}</option>`).join('')}</select></label>
        <label>Payment status<select data-field="paymentStatus" ${locked ? 'disabled' : ''}>${['unknown', 'paid', 'unpaid', 'refunded'].map(value => `<option ${value === draft.paymentStatus ? 'selected' : ''}>${value}</option>`).join('')}</select></label></div>
      <details><summary>Line items (${draft.lineItems.length})</summary>
        <div class="finder-items">${draft.lineItems.map((item, index) => `<div class="finder-item" data-line="${index}">
          <label>Description<input data-line-field="description" value="${esc(item.description)}" ${locked ? 'disabled' : ''}></label>
          ${[['quantity', 'Quantity'], ['unitPrice', 'Unit price'], ['amount', 'Line total']].map(([key, label]) => `<label>${label}<input type="number" step="any" inputmode="decimal" data-line-field="${key}" value="${esc(String(item[key] ?? ''))}" ${locked ? 'disabled' : ''}></label>`).join('')}
          ${!locked ? '<button type="button" class="btn" data-remove-line>Remove line</button>' : ''}</div>`).join('')}</div>
        ${!locked ? '<button type="button" class="btn" data-add-line>Add line item</button>' : ''}</details>
      ${!locked ? `<label class="finder-select"><input type="checkbox" data-reviewed ${draft.reviewed ? 'checked' : ''}> I reviewed the source and corrected uncertain details</label>` : ''}
      <details><summary>Original email and attachments</summary><p>${esc(source?.from || draft.account)} · ${esc(source?.subject || '')}</p>
        <pre class="finder-email">${esc(source?.body || draft.sourceSnippet || 'Email not saved')}</pre>
        <a href="https://mail.google.com/mail/u/?authuser=${encodeURIComponent(draft.account)}#all/${encodeURIComponent(draft.messageId)}" target="_blank" rel="noopener noreferrer">Open original in Gmail</a>
        <div class="finder-toolbar">${(source?.fileParts || []).map((file, index) => `<button type="button" class="btn" data-download="${index}">Download ${esc(file.name)}</button>`).join('')}</div></details>
      ${!locked ? '<button type="button" class="btn" data-dismiss>Dismiss receipt</button>' : ''}
      ${status === 'ignored' ? '<button type="button" class="btn" data-restore>Restore receipt</button>' : ''}
    </div></details>`;
}

async function onChange(event) {
  try {
    if (!active()) return;
    const el = event.target;
    if (el.hasAttribute('data-select-all')) {
      visibleDrafts().forEach(draft => { if (statusOf(draft) === 'ready') { draft.selected = el.checked; draft.updatedAt = Date.now(); } });
    } else {
      const id = el.closest('[data-draft]')?.dataset.draft;
      const draft = state.drafts.find(row => row.id === id);
      if (!draft) return;
      if (['queued', 'imported', 'ignored'].includes(draft.status)) return;
      draft.updatedAt = Date.now();
      if (el.hasAttribute('data-select')) draft.selected = el.checked;
      if (el.hasAttribute('data-reviewed')) { draft.reviewed = el.checked; draft.selected = el.checked; }
      if (el.dataset.field) {
        const key = el.dataset.field;
        let value = el.value;
        if (['amount', 'subtotal', 'tax', 'shipping'].includes(key)) value = receiptMoney(value);
        if (key === 'currency') value = value.trim().toUpperCase();
        if (key === 'lineItems') {
          value = JSON.parse(value);
          if (!Array.isArray(value) || value.some(item => !item || typeof item.description !== 'string'
            || ['quantity', 'unitPrice', 'amount'].some(k => item[k] != null && (typeof item[k] !== 'number' || !Number.isFinite(item[k]))))) {
            throw new Error('Line items must be an array with descriptions and numeric quantities / amounts');
          }
        }
        draft[key] = value;
      }
      if (el.dataset.lineField) {
        const item = draft.lineItems[Number(el.closest('[data-line]').dataset.line)];
        const key = el.dataset.lineField;
        item[key] = key === 'description' ? el.value : key === 'quantity'
          ? (el.value === '' ? null : Number(el.value)) : receiptMoney(el.value);
      }
    }
    await persist(); render();
  } catch (error) { report(error); }
}

async function onClick(event) {
  const button = event.target.closest('button');
  if (!button) return;
  try {
    if (!active()) throw new Error('Publisher access required');
    if (button.dataset.status) { filter = button.dataset.status; render(); return; }
    if (button.dataset.preset) {
      const date = new Date(); date.setDate(date.getDate() - Number(button.dataset.preset));
      host.querySelector('#finder-from').value = date.toISOString().slice(0, 10);
      host.querySelector('#finder-to').value = ''; return;
    }
    if (button.dataset.toggle) {
      const pressed = button.getAttribute('aria-pressed') !== 'true';
      button.setAttribute('aria-pressed', String(pressed)); button.classList.toggle('active', pressed); return;
    }
    const draft = state.drafts.find(row => row.id === button.closest('[data-draft]')?.dataset.draft);
    if (draft && button.hasAttribute('data-restore')) { draft.status = 'draft'; draft.updatedAt = Date.now(); await persist(); render(); return; }
    if (draft && !['queued', 'imported', 'ignored'].includes(draft.status)) {
      if (button.hasAttribute('data-add-line')) { draft.lineItems.push({ description: '', quantity: null, unitPrice: null, amount: null }); draft.updatedAt = Date.now(); await persist(); render(); return; }
      if (button.hasAttribute('data-remove-line')) { draft.lineItems.splice(Number(button.closest('[data-line]').dataset.line), 1); draft.updatedAt = Date.now(); await persist(); render(); return; }
    }
    if (button.hasAttribute('data-download') && draft) {
      const file = state.emails[`${draft.account}:${draft.messageId}`]?.fileParts[Number(button.dataset.download)];
      if (!file?.base64) throw new Error('Attachment is not saved. Scan this email again.');
      downloadBlob(new Blob([decodeGmailBase64(file.base64)], { type: file.mime }), file.name); return;
    }
    if (button.hasAttribute('data-dismiss') && draft) { draft.status = 'ignored'; draft.selected = false; draft.updatedAt = Date.now(); await persist(); render(); return; }
    if (button.dataset.retryEmail) { await scanEmailRetry(button.dataset.retryEmail); return; }
    switch (button.dataset.action) {
      case 'connect':
        if (accessToken) { accessToken = ''; renderConnection(); announce('Gmail disconnected on this device. Saved receipts remain available.'); break; }
        accessToken = await window._fbConnectReceiptGmail();
        if (!active()) { accessToken = ''; return; }
        state.account = (await client.profile()).emailAddress.toLowerCase();
        await persist(); renderConnection(); announce(`Connected to ${state.account} with read-only access.`); break;
      case 'save-setup':
        state.endpoint = host.querySelector('#finder-endpoint').value.trim();
        if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(state.endpoint)) throw new Error('Enter a valid Apps Script deployment URL');
        await persist(); announce('Finder setup saved.'); break;
      case 'scan': await scan(false); break;
      case 'next': await scan(true); break;
      case 'cancel': controller?.abort(); break;
      case 'retry': await resumeReceiptImports(); break;
      case 'import':
        state.drafts.forEach(draft => { if (draft.selected && statusOf(draft) === 'ready') { draft.status = 'queued'; draft.selected = false; draft.updatedAt = Date.now(); } });
        await persist(); render(); announce('Selected receipts saved for import. They will sync when connected.');
        await resumeReceiptImports(); break;
      case 'show-all': filter = 'all'; resultQuery = ''; host.querySelector('[data-result-search]').value = ''; render(); break;
      case 'forget':
        if (busy || flushing) throw new Error('Stop the scan and wait for imports to finish first');
        if (!await deps.confirm('Remove saved receipt drafts and source files from this device? Already imported expenses are kept.', { title: 'Clear finder data' })) return;
        await store.clear(uid); state = { ...emptyState(), endpoint: state.endpoint, account: state.account }; await persist(); render();
        announce('Saved finder drafts and source copies removed from this device. This cannot be undone here.'); break;
    }
  } catch (error) { report(error); }
}

async function readCandidate(id, signal) {
  const owner = uid, account = state.account, key = `${account}:${id}`;
  if (state.scans[key]?.done) return;
  let email = state.emails[key];
  try {
    if (!email) email = await client.message(id, account, signal);
    for (const file of email.fileParts) await client.attachment(id, file, signal);
    if (signal.aborted || !active() || owner !== uid) throw new DOMException('Stopped', 'AbortError');
    state.emails[key] = email;
    await persist(); // Source bytes must survive before the AI result does.
    const result = await extractFoundReceipts({ endpoint: state.endpoint, idToken: await deps.user().getIdToken(), email, signal });
    if (signal.aborted || !active() || owner !== uid) throw new DOMException('Stopped', 'AbortError');
    result.receipts.forEach((raw, index) => {
      const draft = normalizeFoundReceipt(raw, email, index);
      if (!deps.categories.includes(draft.category)) draft.category = deps.inferCategory(draft.vendor, draft.description);
      if (!state.drafts.some(row => row.id === draft.id)) state.drafts.push(draft);
    });
    state.scans[key] = { done: true, subject: email.subject, count: result.receipts.length };
    await persist();
  } catch (error) {
    if (error.name === 'AbortError' || !active() || uid !== owner) throw error;
    state.scans[key] = { error: error.message, subject: email?.subject || id };
    await persist();
  }
  render();
}

async function scan(nextPage) {
  if (busy) return;
  if (!accessToken) throw new Error('Connect Gmail first');
  if (!state.endpoint) throw new Error('Open Finder setup and save the receipt AI deployment URL');
  if (!navigator.onLine) throw new Error('Reconnect to scan Gmail. Saved receipts are available offline.');
  const value = id => host.querySelector('#' + id).value;
  if (value('finder-from') && value('finder-to') && value('finder-from') > value('finder-to')) throw new Error('From date must be before the end date');
  const pressed = key => host.querySelector(`[data-toggle="${key}"]`).getAttribute('aria-pressed') === 'true';
  const query = nextPage ? state.lastQuery : receiptQuery({ query: value('finder-query'), after: value('finder-from'), before: value('finder-to'),
    sender: value('finder-sender'), attachments: pressed('attachments'), category: pressed('shipping') ? 'shipping' : pressed('invoices') ? 'invoices' : '' });
  busy = true; controller = new AbortController(); const signal = controller.signal;
  render(); announce('Finding candidate emails…');
  try {
    const page = await client.list(query, nextPage ? state.pageToken : '', signal);
    // Commit the next cursor only after this page finishes, so Stop never skips emails.
    let completed = 0;
    for (const message of page.messages || []) {
      if (signal.aborted) throw new DOMException('Stopped', 'AbortError');
      announce(`Reading email ${++completed} of ${(page.messages || []).length}…`);
      await readCandidate(message.id, signal);
    }
    state.pageToken = page.nextPageToken || ''; state.lastQuery = query; state.lastScan = new Date().toISOString();
    await persist();
    const rejected = Object.values(state.scans).filter(item => item.done && item.count === 0).length;
    announce(`Scan complete. ${state.drafts.length} receipts saved for review. ${rejected} scanned emails contained no receipt.${state.pageToken ? ' More emails are available below.' : ''}`);
  } catch (error) {
    if (error.name === 'AbortError') announce('Scan stopped. Completed receipts are saved; scan again to continue.');
    else throw error;
  } finally { busy = false; controller = null; render(); }
}

async function scanEmailRetry(key) {
  if (busy) return;
  if (!accessToken) throw new Error('Reconnect Gmail to retry');
  if (!key.startsWith(state.account + ':')) throw new Error('Connect the original Gmail account to retry this email');
  busy = true; controller = new AbortController(); render();
  try { await readCandidate(key.slice(state.account.length + 1), controller.signal); }
  finally { busy = false; controller = null; render(); }
}

function stopReceiptFinder() { controller?.abort(); }

async function resumeReceiptImports() {
  if (flushing || !active() || !navigator.onLine) return;
  flushing = true;
  const owner = uid;
  try {
    await flushReceiptOutbox(state, {
      canSync: () => active() && uid === owner && navigator.onLine,
      expenses: deps.expenses, rate: deps.rate, commit: deps.commit, accept: deps.accept,
      save: persist, render,
      files: async email => {
        const output = [];
        const body = new File([`From: ${email.from}\nSubject: ${email.subject}\nDate: ${email.date}\n\n${email.body}`], 'email.txt', { type: 'text/plain' });
        const files = [{ file: body, name: 'email.txt' }, ...email.fileParts.map((part, index) => {
          if (!part.base64) throw new Error(`Original attachment missing: ${part.name}`);
          return { file: new File([decodeGmailBase64(part.base64)], part.name, { type: part.mime }), name: `${index}-${part.name.replace(/[^a-zA-Z0-9._-]/g, '_')}` };
        })];
        if (!email.savedFiles) email.savedFiles = {};
        for (const entry of files) {
          if (!active() || uid !== owner) throw new Error('Sign in as the same publisher to finish importing');
          if (!email.savedFiles[entry.name]) {
            let timer;
            try {
              const path = `email-imports/${encodeURIComponent(email.account)}/${email.id}/${entry.name}`;
              email.savedFiles[entry.name] = await Promise.race([
                deps.upload(entry.file, path),
                new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Receipt upload timed out. Retry pending imports.')), 45000); }),
              ]);
              if (!email.savedFiles[entry.name]) throw new Error('Receipt upload did not return a file link');
            } finally { clearTimeout(timer); }
            await persist();
          }
          output.push(email.savedFiles[entry.name]);
        }
        return output;
      },
    });
  } catch (error) { report(error); }
  finally { flushing = false; render(); }
}

export { startReceiptFinder, mountReceiptFinder, stopReceiptFinder, resumeReceiptImports };
