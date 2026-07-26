// Open Call — the submissions pipeline for a call for contributors:
// intake, per-stage email templates and sends, reply scanning, the review
// inbox, and the bulk send/remove tools.
//
// Lifted out of src/main.js as one unit. The pure rules already lived in
// lib/opencall.js; this is the UI and orchestration around them, which is why
// it stayed behind — it reaches into the DOM and into shared app state.
//
// Everything it needs from the app is imported explicitly below, so the
// coupling is now 22 names rather than "all of main.js". main.js and this
// module import from each other; that cycle is fine because nothing here runs
// at module-evaluation time — every export is a hoisted function declaration
// called later, from a click handler or from main.js after start-up.
//
// eslint's no-undef (an error, checked in CI) is what keeps the import list
// honest: an identifier that isn't imported fails the build rather than
// throwing at click time.
import {
  $,
  BOOKS,
  _isCustomerSuppressed,
  confirmDialog,
  deserializeHtmlToEditor,
  formatDateTime,
  isAuthor,
  mailingListHas,
  openCampaignWizard,
  parseMarkdownToHtml,
  sendSingleEmailViaBackend,
  serializeEditorHtml,
  sheetsUrl,
  showToast,
  suggestEmailTypo,
  switchCustomersSubTab,
  switchTab,
  today,
} from '../main.js';
import { escapeHtml } from '../lib/html.js';
import { toCsv } from '../lib/csv.js';
import { downloadBlob, downloadCsv } from '../lib/download.js';
import {
  OC_STAGES, ocNextAction, newContributor, parseContributorRows, findUnfilledMergeFields,
  ocProposalKey, ocProposalSummary, ocProposalsFromScan, ocApplyProposal,
  ocOutboxKey, ocOutboxAdditions, ocPruneQueues, ocMergeTemplate, ocWaitingDays,
} from '../lib/opencall.js';

let ocImportOpen = false;
let ocSortBy = 'dateDesc';
let activeTmplTab = 'selectionSent';

function ocList() {
  const activeProj = OPENCALL_DATA.projects[OPENCALL_DATA.activeProjectId];
  if (!activeProj) return [];
  if (!Array.isArray(activeProj.contributors)) activeProj.contributors = [];
  return activeProj.contributors;
}

function ocBlockedForAuthor_() {
  return isAuthor();
}

function ocEnsureQueues_(proj) {
  if (!proj) return;
  if (!Array.isArray(proj.inbox)) proj.inbox = [];
  if (!proj.inboxDismissed || typeof proj.inboxDismissed !== 'object') proj.inboxDismissed = {};
  if (!Array.isArray(proj.outbox)) proj.outbox = [];
  if (!proj.outboxDismissed || typeof proj.outboxDismissed !== 'object') proj.outboxDismissed = {};
}

function ocQueueNextStep_(proj, c) {
  ocEnsureQueues_(proj);
  const additions = ocOutboxAdditions(c, proj.outbox, proj.outboxDismissed);
  if (additions.length) proj.outbox.push(...additions);
  return additions.length;
}

function ocStamp_(c) {
  if (c) c.lastStageAt = new Date().toISOString();
}

function ocUiOpen_(key, dflt = false) {
  const v = localStorage.getItem('lm-oc-ui-' + key);
  return v === null ? dflt : v === 'true';
}

function ocToggleSection(key, dflt = false) {
  localStorage.setItem('lm-oc-ui-' + key, ocUiOpen_(key, dflt) ? 'false' : 'true');
  renderOpenCall();
}

async function ocTogglePhotoPick(cId, idx) {
  if (ocBlockedForAuthor_()) return;
  const c = ocList().find(x => x.id === cId);
  if (!c) return;
  const photosArr = Array.isArray(c.photos) ? c.photos : [];
  const p = photosArr[idx];
  if (!p) return;
  if (!Array.isArray(c.selectedPhotos)) c.selectedPhotos = [];
  const at = c.selectedPhotos.indexOf(p);
  const picking = at === -1;
  if (picking) c.selectedPhotos.push(p);
  else c.selectedPhotos.splice(at, 1);
  await _persistOpenCalls();
  renderOpenCall();
  showToast(picking
    ? `★ Picked “${p}” — {{photo}} in emails now uses ${c.selectedPhotos.length > 1 ? 'the starred files' : 'this file'}`
    : `Unpicked “${p}”${c.selectedPhotos.length ? '' : ' — {{photo}} falls back to all photos'}`,
    picking ? 'ok' : 'warn');
}

function ocSetSort(val) {
  ocSortBy = val;
  renderOpenCall();
}

function ocSetTmplTab(val) {
  activeTmplTab = val;
  renderOpenCall();
  ocUpdateTmplPreview();
}

function ocUpdateTmplPreview() {
  const sub = $('oc-tmpl-subject')?.value || '';
  const body = $('oc-tmpl-body')?.innerHTML || '';

  const sampleName = 'Alex Mercer';
  const samplePhoto = 'alex_mercer_artwork.jpg';
  const sampleCreditName = 'Alex Mercer';
  const activeProj = OPENCALL_DATA.projects[OPENCALL_DATA.activeProjectId];

  const personalize = (str) => str
    .replace(/\{\{name\}\}/g, sampleName)
    .replace(/\{\{photo\}\}/g, samplePhoto)
    .replace(/\{\{creditName\}\}/g, sampleCreditName)
    .replace(/\{\{project\}\}/g, activeProj ? activeProj.title : '')
    .replace(/\{\{date\}\}/g, 'July 15th'); // sample date

  const resolvedSub = personalize(sub);
  const serializedBody = serializeEditorHtml(body);
  const resolvedBody = personalize(serializedBody);

  const subEl = $('oc-preview-subject');
  const bodyEl = $('oc-preview-body');
  if (subEl) subEl.textContent = resolvedSub;
  if (bodyEl) {
    bodyEl.innerHTML = resolvedBody;
  }
}

let _ocBulkSelectedRecipients = [];
let _ocBulkSendingActive = false;
let _ocBulkFailedIds = []; // ids of contributors that failed in the last send

function ocThreadForStage(c, stageKey) {
  return c.gmailThreadId
    || (stageKey === 'cmykSent' ? c.creditThreadId
      : stageKey === 'preorderSent' ? c.filesThreadId
        : null)
    || null;
}

function openOcBulkModal() {
  let modal = $('oc-bulk-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'oc-bulk-modal';
    modal.style.position = 'fixed';
    modal.style.inset = '0';
    modal.style.background = 'rgba(0, 0, 0, 0.75)';
    modal.style.backdropFilter = 'blur(8px)';
    modal.style.display = 'none';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '10000';
    // Click the dimmed backdrop (outside the card, which stops propagation) to
    // dismiss — the inner card's stopPropagation always intended this.
    modal.addEventListener('click', closeOcBulkModal);
    document.body.appendChild(modal);
  }

  modal.style.display = 'flex';
  document.addEventListener('keydown', ocBulkModalEscHandler);
  renderOcBulkModalContent();
}

function ocBulkModalEscHandler(e) {
  if (e.key !== 'Escape') return;
  if ($('oc-bulk-progress-container')?.style.display === 'block') return;
  closeOcBulkModal();
}

function closeOcBulkModal() {
  const modal = $('oc-bulk-modal');
  if (modal) {
    modal.style.display = 'none';
  }
  document.removeEventListener('keydown', ocBulkModalEscHandler);
}

function renderOcBulkModalContent(retryMode = false) {
  const modal = $('oc-bulk-modal');
  if (!modal) return;

  const proj = OPENCALL_DATA.projects[OPENCALL_DATA.activeProjectId];
  if (!proj) return;

  const stage = $('oc-bulk-stage')?.value || 'selectionSent';
  const resendMode = $('oc-bulk-resend-toggle')?.checked || false;

  // Get eligible contributors — resend mode shows already-sent ones too
  let eligible = [];
  if (retryMode && _ocBulkFailedIds.length > 0) {
    // ⚡ Bolt Optimization: Replace O(N) Array.includes with O(1) Set.has inside filter loop
    const failedSet = new Set(_ocBulkFailedIds);
    eligible = proj.contributors.filter(c => c.email && failedSet.has(c.id));
  } else if (stage === 'selectionSent') {
    eligible = resendMode
      ? proj.contributors.filter(c => c.email && c.selectionSent)
      : proj.contributors.filter(c => c.email && !c.selectionSent);
  } else if (stage === 'cmykSent') {
    eligible = resendMode
      ? proj.contributors.filter(c => c.email && c.cmykSent)
      : proj.contributors.filter(c => c.email && c.creditReceived && !c.cmykSent);
  } else if (stage === 'preorderSent') {
    eligible = resendMode
      ? proj.contributors.filter(c => c.email && c.preorderSent)
      : proj.contributors.filter(c => c.email && c.cmykSent && c.filesReceived && !c.preorderSent);
  }

  const listHtml = eligible.length > 0
    ? `<div style="display:flex;gap:6px;margin-bottom:8px;">
        <button type="button" style="font-size:10px;padding:2px 8px;background:transparent;border:1px solid var(--border);color:var(--text3);border-radius:4px;cursor:pointer;" onclick="ocBulkSelectAll(true)">Select All</button>
        <button type="button" style="font-size:10px;padding:2px 8px;background:transparent;border:1px solid var(--border);color:var(--text3);border-radius:4px;cursor:pointer;" onclick="ocBulkSelectAll(false)">Deselect All</button>
        <span style="font-size:10px;color:var(--text3);margin-left:auto;align-self:center;" id="oc-bulk-recipient-count">${eligible.length} recipient${eligible.length !== 1 ? 's' : ''}</span>
      </div>` +
    eligible.map(c => `
        <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text);cursor:pointer;padding:4px 0;border-radius:4px;transition:background 0.15s;" onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background='transparent'">
          <input type="checkbox" class="oc-bulk-recipient-check" value="${c.id}" checked style="margin:0;cursor:pointer;" onchange="ocBulkUpdateCount()">
          <span><strong>${escapeHtml(c.name || 'Unnamed')}</strong> <span style="color:var(--text3);">(${escapeHtml(c.email)})</span></span>
        </label>
      `).join('')
    : '<div style="font-size:12px;color:var(--text3);font-style:italic;padding:10px 0;">No eligible contributors found for this stage.</div>';

  const tmpl = proj.templates ? proj.templates[stage] : null;
  const dl = localStorage.getItem('lm-oc-last-deadline') || 'July 15th';
  const previewSub = tmpl ? tmpl.subject
    .replace(/\{\{name\}\}/g, 'Alex Mercer')
    .replace(/\{\{photo\}\}/g, 'alex_artwork.jpg')
    .replace(/\{\{creditName\}\}/g, 'Alex Mercer')
    .replace(/\{\{project\}\}/g, proj.title)
    .replace(/\{\{date\}\}/g, dl) : '(no template saved)';
  const previewBody = tmpl ? tmpl.body
    .replace(/\{\{name\}\}/g, 'Alex Mercer')
    .replace(/\{\{photo\}\}/g, 'alex_artwork.jpg')
    .replace(/\{\{creditName\}\}/g, 'Alex Mercer')
    .replace(/\{\{project\}\}/g, proj.title)
    .replace(/\{\{date\}\}/g, dl) : '';

  modal.innerHTML = `
    <div class="card" style="width:94%;max-width:660px;max-height:90vh;overflow-y:auto;background:var(--card-bg, #fff);border:1px solid var(--border);border-radius:var(--r3);padding:24px;box-shadow:0 20px 60px rgba(0,0,0,0.4);position:relative;" onclick="event.stopPropagation()">
      <button onclick="closeOcBulkModal()" style="position:absolute;top:15px;right:15px;background:transparent;border:none;color:var(--text3);font-size:18px;cursor:pointer;line-height:1;">✕</button>
      
      <div style="font-family:'Playfair Display',serif;font-size:20px;font-weight:700;color:var(--gold2);margin-bottom:4px;">✉ Send Bulk Pipeline Emails</div>
      <div style="font-size:12px;color:var(--text3);margin-bottom:18px;">Personalize and send stage emails to selected contributors.</div>

      <!-- Stage + Re-send Row -->
      <div style="display:grid;grid-template-columns:1fr auto auto;gap:12px;align-items:end;margin-bottom:14px;">
        <div>
          <label style="font-size:11px;color:var(--text3);font-weight:600;display:block;margin-bottom:5px;text-transform:uppercase;letter-spacing:0.04em;">Pipeline Stage</label>
          <select id="oc-bulk-stage" onchange="onOcBulkStageChange(this.value)" style="width:100%;padding:8px 12px;font-size:13px;background:var(--input-bg);color:var(--text);border:1px solid var(--border);border-radius:6px;">
            <option value="selectionSent" ${stage === 'selectionSent' ? 'selected' : ''}>Stage 1 — Selection Notice</option>
            <option value="cmykSent" ${stage === 'cmykSent' ? 'selected' : ''}>Stage 2 — Request Files (CMYK)</option>
            <option value="preorderSent" ${stage === 'preorderSent' ? 'selected' : ''}>Stage 3 — Pre-order Launch Info</option>
          </select>
        </div>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text2);cursor:pointer;white-space:nowrap;padding-bottom:4px;" title="Also show contributors who already received this stage email">
          <input type="checkbox" id="oc-bulk-resend-toggle" onchange="renderOcBulkModalContent()" style="cursor:pointer;">
          Re-send mode
        </label>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text2);cursor:pointer;white-space:nowrap;padding-bottom:4px;" title="Simulate sending without actually delivering any emails">
          <input type="checkbox" id="oc-bulk-simulate-toggle" style="cursor:pointer;">
          Simulate (Dry Run)
        </label>
      </div>

      <!-- Recipients -->
      <div style="margin-bottom:14px;">
        <div style="font-size:11px;color:var(--text3);font-weight:600;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.04em;">Recipients</div>
        <div id="oc-bulk-recipients" style="max-height:170px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;padding:10px;background:var(--input-bg);display:flex;flex-direction:column;gap:2px;">
          ${listHtml}
        </div>
      </div>

      <!-- Reply-To, Delay & Deadline Row -->
      <div style="display:grid;grid-template-columns:1fr 120px 140px;gap:12px;align-items:end;margin-bottom:14px;">
        <div>
          <label style="font-size:11px;color:var(--text3);font-weight:600;display:block;margin-bottom:5px;text-transform:uppercase;letter-spacing:0.04em;">Reply-To (optional)</label>
          <input id="oc-bulk-replyto" type="email" placeholder="e.g. hello@lyricalmyricalbooks.com" style="width:100%;padding:8px 12px;font-size:12px;background:var(--input-bg);color:var(--text);border:1px solid var(--border);border-radius:6px;box-sizing:border-box;">
        </div>
        <div>
          <label style="font-size:11px;color:var(--text3);font-weight:600;display:block;margin-bottom:5px;text-transform:uppercase;letter-spacing:0.04em;">Deadline ({{date}})</label>
          <input id="oc-bulk-deadline" type="text" placeholder="e.g. July 15th" value="${escapeHtml(dl)}" oninput="localStorage.setItem('lm-oc-last-deadline', this.value); ocUpdateBulkPreview();" style="width:100%;padding:8px 12px;font-size:12px;background:var(--input-bg);color:var(--text);border:1px solid var(--border);border-radius:6px;box-sizing:border-box;">
        </div>
        <div>
          <label style="font-size:11px;color:var(--text3);font-weight:600;display:block;margin-bottom:5px;text-transform:uppercase;letter-spacing:0.04em;">Delay</label>
          <select id="oc-bulk-delay" style="width:100%;padding:8px 10px;font-size:12px;background:var(--input-bg);color:var(--text);border:1px solid var(--border);border-radius:6px;">
            <option value="0">No delay</option>
            <option value="1000" selected>1s between sends</option>
            <option value="2000">2s between sends</option>
            <option value="5000">5s between sends</option>
          </select>
        </div>
      </div>

      <!-- Template Preview -->
      <div style="margin-bottom:14px;border:1px solid var(--border);border-radius:8px;overflow:hidden;">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.06em;font-weight:700;color:var(--text3);padding:8px 12px;background:rgba(255,255,255,0.03);border-bottom:1px solid var(--border);">Template Preview (sample data)</div>
        <div style="padding:12px;max-height:120px;overflow-y:auto;">
          <div id="oc-bulk-preview-sub-container" style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:6px;">Subject: ${escapeHtml(previewSub)}</div>
          <div id="oc-bulk-preview-body-container" style="font-size:11px;color:var(--text2);line-height:1.6;white-space:pre-wrap;">${previewBody}</div>
        </div>
        <div style="padding:8px 12px;border-top:1px solid var(--border);background:rgba(255,255,255,0.02);">
          <span style="font-size:10px;color:var(--text3);">Tokens: <code style="background:rgba(255,255,255,0.06);padding:1px 5px;border-radius:3px;font-size:10px;">{{name}}</code> <code style="background:rgba(255,255,255,0.06);padding:1px 5px;border-radius:3px;font-size:10px;">{{photo}}</code> <code style="background:rgba(255,255,255,0.06);padding:1px 5px;border-radius:3px;font-size:10px;">{{creditName}}</code> <code style="background:rgba(255,255,255,0.06);padding:1px 5px;border-radius:3px;font-size:10px;">{{project}}</code> <code style="background:rgba(255,255,255,0.06);padding:1px 5px;border-radius:3px;font-size:10px;">{{date}}</code> — replace with per-contributor data</span>
        </div>
      </div>

      <!-- Test Email -->
      <div style="margin-bottom:16px;padding:10px 12px;background:rgba(255,255,255,0.02);border:1px dashed var(--border);border-radius:6px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <span style="font-size:11px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:0.04em;">Test Send</span>
        <input id="oc-bulk-test-email" type="email" placeholder="your@email.com" style="flex:1;min-width:140px;padding:6px 10px;font-size:12px;background:var(--input-bg);color:var(--text);border:1px solid var(--border);border-radius:5px;">
        <button class="btn sm" onclick="sendOcBulkTestEmail()" ${tmpl ? '' : 'disabled'} title="Send the template to yourself using sample data">📨 Send Test</button>
      </div>

      <!-- Progress Bar (Initially Hidden) -->
      <div id="oc-bulk-progress-container" style="display:none;margin-bottom:16px;">
        <div class="row-between" style="font-size:12px;color:var(--text2);margin-bottom:6px;">
          <span id="oc-bulk-progress-text">Sending emails...</span>
          <strong id="oc-bulk-progress-pct">0%</strong>
        </div>
        <div style="width:100%;background:rgba(255,255,255,0.06);height:8px;border-radius:4px;overflow:hidden;border:1px solid var(--border);">
          <div id="oc-bulk-progress-fill" style="width:0%;background:linear-gradient(90deg, var(--gold), var(--gold2));height:100%;transition:width 0.3s ease;"></div>
        </div>
        <div id="oc-bulk-console" style="font-family:'DM Mono',monospace;font-size:11px;background:#111;color:#a9ffaf;padding:10px;border-radius:6px;max-height:120px;overflow-y:auto;margin-top:10px;border:1px solid #2a2a2a;line-height:1.5;"></div>
      </div>
      
      <div style="display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;" id="oc-bulk-actions">
        <button class="btn" onclick="closeOcBulkModal()">Cancel</button>
        <button class="btn gold" id="oc-bulk-send-btn" onclick="sendOcBulkEmails(false)" ${eligible.length > 0 ? '' : 'disabled'}>✉ Send ${eligible.length > 0 ? eligible.length + ' Email' + (eligible.length !== 1 ? 's' : '') : 'Emails'}</button>
      </div>
    </div>`;
}

function ocBulkSelectAll(checked) {
  document.querySelectorAll('.oc-bulk-recipient-check').forEach(cb => { cb.checked = checked; });
  ocBulkUpdateCount();
}

function ocBulkUpdateCount() {
  const total = document.querySelectorAll('.oc-bulk-recipient-check').length;
  const checked = document.querySelectorAll('.oc-bulk-recipient-check:checked').length;
  const el = $('oc-bulk-recipient-count');
  if (el) el.textContent = `${checked} of ${total} selected`;
  const sendBtn = $('oc-bulk-send-btn');
  if (sendBtn) {
    sendBtn.disabled = checked === 0;
    sendBtn.textContent = `✉ Send ${checked} Email${checked !== 1 ? 's' : ''}`;
  }
}

async function sendOcBulkTestEmail() {
  const proj = OPENCALL_DATA.projects[OPENCALL_DATA.activeProjectId];
  if (!proj) return;
  const stage = $('oc-bulk-stage')?.value || 'selectionSent';
  const tmpl = proj.templates?.[stage];
  if (!tmpl) { showToast('No template found for this stage', 'warn'); return; }
  const testEmail = $('oc-bulk-test-email')?.value?.trim();
  if (!testEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(testEmail)) {
    showToast('Enter a valid test email address', 'warn'); return;
  }
  const replyTo = $('oc-bulk-replyto')?.value?.trim() || '';
  const dl = $('oc-bulk-deadline')?.value || '';
  const subject = '[TEST] ' + tmpl.subject
    .replace(/\{\{name\}\}/g, 'Alex Mercer')
    .replace(/\{\{photo\}\}/g, 'alex_artwork.jpg')
    .replace(/\{\{creditName\}\}/g, 'Alex Mercer')
    .replace(/\{\{project\}\}/g, proj.title)
    .replace(/\{\{date\}\}/g, dl);
  const body = tmpl.body
    .replace(/\{\{name\}\}/g, 'Alex Mercer')
    .replace(/\{\{photo\}\}/g, 'alex_artwork.jpg')
    .replace(/\{\{creditName\}\}/g, 'Alex Mercer')
    .replace(/\{\{project\}\}/g, proj.title)
    .replace(/\{\{date\}\}/g, dl);
  try {
    showToast('Sending test email...');
    await sendSingleEmailViaBackend(testEmail, subject, body, replyTo);
    showToast('✓ Test email sent to ' + testEmail);
  } catch (e) {
    showToast('Test send failed: ' + e.message, 'err');
  }
}

function onOcBulkStageChange(_val) {
  renderOcBulkModalContent();
}

async function sendOcBulkEmails(_retryFailedOnly = false) {
  const proj = OPENCALL_DATA.projects[OPENCALL_DATA.activeProjectId];
  if (!proj) return;

  const stage = $('oc-bulk-stage').value;
  const tmpl = proj.templates ? proj.templates[stage] : null;
  if (!tmpl) {
    showToast('Template not found for this stage. Save a template first.', 'err');
    return;
  }

  const replyTo = $('oc-bulk-replyto')?.value?.trim() || '';
  const delayMs = parseInt($('oc-bulk-delay')?.value || '1000', 10);
  const simulate = $('oc-bulk-simulate-toggle')?.checked || false;

  // Get checked recipients
  const checks = document.querySelectorAll('.oc-bulk-recipient-check:checked');
  const selectedIds = Array.from(checks).map(cb => cb.value);

  if (selectedIds.length === 0) {
    showToast('No recipients selected', 'warn');
    return;
  }

  // ⚡ Bolt Optimization: Replace O(N) Array.includes with O(1) Set.has inside filter loop
  const selectedIdsSet = new Set(selectedIds);
  const selectedRecs = proj.contributors.filter(c => selectedIdsSet.has(c.id));

  // Safety gate: a real (non-simulated) send goes to real inboxes and can't be
  // unsent, so always confirm first — recipient count + stage — and fold in any
  // blank merge-field warning so it's one decision, not a mid-send surprise.
  // The dialog is danger-styled so the safe (Cancel) button takes focus, and
  // the Simulate dry-run skips this entirely since it delivers nothing.
  if (!simulate) {
    const dl = $('oc-bulk-deadline')?.value || '';
    const tmplText = (tmpl.subject || '') + '\n' + (tmpl.body || '');
    const issues = [];
    selectedRecs.forEach(c => {
      const missing = findUnfilledMergeFields(tmplText, c, { project: proj.title, date: dl });
      if (missing.length) issues.push({ who: c.name || c.email, missing });
    });

    const stageLabel = $('oc-bulk-stage')?.selectedOptions?.[0]?.text || stage;
    const n = selectedRecs.length;
    let msg = `Send ${n} real email${n === 1 ? '' : 's'} now for “${stageLabel}”?\n\nThey go to real inboxes and can't be unsent. Turn on “Simulate (Dry Run)” first if you only want to preview.`;
    if (issues.length) {
      const lines = issues.slice(0, 10).map(x => `• ${x.who} — ${x.missing.join(', ')}`).join('\n');
      const more = issues.length > 10 ? `\n…and ${issues.length - 10} more` : '';
      msg += `\n\n⚠ ${issues.length} recipient${issues.length === 1 ? '' : 's'} ${issues.length === 1 ? 'has' : 'have'} blank template fields — those spots will be empty:\n${lines}${more}`;
    }

    // Gmail enforces a daily send cap; if this batch exceeds what's left, the
    // overflow would silently fail mid-run. Warn up front. Best-effort — if the
    // quota can't be fetched (offline), don't block the send.
    if (sheetsUrl) {
      try {
        const info = await ocFetchMailSenderInfo();
        const remaining = info.remainingQuota;
        if (typeof remaining === 'number' && n > remaining) {
          msg += `\n\n⚠ Gmail can send only ${remaining} more email${remaining === 1 ? '' : 's'} today — the last ${n - remaining} would fail. Send the rest tomorrow.`;
        }
      } catch (_) { /* quota unavailable — proceed without the guard */ }
    }
    const proceed = await confirmDialog(msg, {
      title: issues.length ? 'Confirm send — blank fields' : 'Confirm send',
      okLabel: `Send ${n} email${n === 1 ? '' : 's'}`,
      cancelLabel: 'Cancel',
      danger: true
    });
    if (!proceed) return;
  }

  // Show progress UI
  $('oc-bulk-progress-container').style.display = 'block';
  $('oc-bulk-actions').innerHTML = `
    <button class="btn" id="oc-bulk-cancel-btn" onclick="cancelOcBulkSend()" style="background:rgba(239,68,68,0.1);color:var(--red);border-color:rgba(239,68,68,0.3);">✕ Cancel</button>
  `;

  const consoleEl = $('oc-bulk-console');
  consoleEl.innerHTML = simulate
    ? `<div style="color:#fbbf24;margin-bottom:4px;">[SIMULATION] Starting dry run · ${selectedRecs.length} recipient${selectedRecs.length !== 1 ? 's' : ''}</div>`
    : `<div style="color:#6b8cff;margin-bottom:4px;">Starting bulk send · ${selectedRecs.length} recipient${selectedRecs.length !== 1 ? 's' : ''} · ${delayMs > 0 ? delayMs / 1000 + 's delay' : 'no delay'}${replyTo ? ' · reply-to: ' + replyTo : ''}</div>`;

  _ocBulkSendingActive = true;
  _ocBulkFailedIds = [];
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < selectedRecs.length; i++) {
    if (!_ocBulkSendingActive) {
      consoleEl.innerHTML += `<div style="color:#fbbf24;">[CANCELLED] Stopped after ${i} of ${selectedRecs.length}.</div>`;
      break;
    }

    const c = selectedRecs[i];
    $('oc-bulk-progress-text').textContent = simulate
      ? `Simulating ${i + 1}/${selectedRecs.length} — ${c.name || c.email}...`
      : `Sending ${i + 1}/${selectedRecs.length} — ${c.name || c.email}...`;

    const dl = $('oc-bulk-deadline')?.value || '';
    const subject = ocMergeTemplate(tmpl.subject, c, { project: proj.title, date: dl });
    const body = ocMergeTemplate(tmpl.body, c, { project: proj.title, date: dl });

    try {
      if (simulate) {
        consoleEl.innerHTML += `<div style="color:#a9ffaf;border-left:2px solid #a9ffaf;padding-left:8px;margin:8px 0 12px 0;text-align:left;line-height:1.5;background:rgba(255,255,255,0.02);padding:8px;border-radius:4px;">
          <strong>[SIMULATION] To:</strong> ${escapeHtml(c.email)} (${escapeHtml(c.name || 'Artist')})<br>
          <strong>Subject:</strong> ${escapeHtml(subject)}<br>
          <div style="color:var(--text3);margin-top:4px;white-space:pre-wrap;font-family:monospace;font-size:11px;background:rgba(0,0,0,0.2);padding:6px;border-radius:3px;">${escapeHtml(body.substring(0, 150))}${body.length > 150 ? '...' : ''}</div>
        </div>`;
        successCount++;
      } else {
        const threadId = ocThreadForStage(c, stage);
        const resp = await sendSingleEmailViaBackend(c.email, subject, body, replyTo, null, threadId, !threadId);
        c[stage] = true;
        ocStamp_(c);
        // Remember the thread this send used (a captured new one for stage 1, or
        // the existing conversation) so the next stage replies into the same place.
        const usedThreadId = (resp && resp.threadId) ? resp.threadId : threadId;
        if (usedThreadId) c.gmailThreadId = usedThreadId;
        successCount++;
        consoleEl.innerHTML += `<div style="color:#a9ffaf;">✓ [${i + 1}/${selectedRecs.length}] ${escapeHtml(c.email)} (${escapeHtml(c.name || 'Artist')})</div>`;
      }
    } catch (err) {
      failCount++;
      _ocBulkFailedIds.push(c.id);
      consoleEl.innerHTML += `<div style="color:#f87171;">✕ [${i + 1}/${selectedRecs.length}] ${escapeHtml(c.email)}: ${escapeHtml(err.message)}</div>`;
    }

    // Update progress bar
    const pct = Math.round((i + 1) / selectedRecs.length * 100);
    $('oc-bulk-progress-pct').textContent = pct + '%';
    $('oc-bulk-progress-fill').style.width = pct + '%';
    consoleEl.scrollTop = consoleEl.scrollHeight;

    // Delay between sends (except after the last one)
    const actualDelay = simulate ? 100 : delayMs;
    if (actualDelay > 0 && i < selectedRecs.length - 1 && _ocBulkSendingActive) {
      await new Promise(res => setTimeout(res, actualDelay));
    }
  }

  _ocBulkSendingActive = false;

  // Finish summary
  $('oc-bulk-progress-text').textContent = simulate
    ? `Simulation Done · ✓ ${successCount} simulated · 0 failed`
    : `Done · ✓ ${successCount} sent · ${failCount > 0 ? '✕ ' + failCount + ' failed' : '0 failed'}`;

  if (simulate) {
    consoleEl.innerHTML += `<div style="color:#fbbf24;border-top:1px solid #2a2a2a;margin-top:6px;padding-top:6px;">Simulation Finished · ${successCount} emails simulated. No emails were sent.</div>`;
  } else {
    consoleEl.innerHTML += `<div style="color:#6b8cff;border-top:1px solid #2a2a2a;margin-top:6px;padding-top:6px;">Finished · ${successCount} succeeded · ${failCount} failed</div>`;
  }
  consoleEl.scrollTop = consoleEl.scrollHeight;

  if (!simulate) {
    await _persistOpenCalls();
    renderOpenCall();
  }

  // Show done actions — with retry button if there were failures (and not in simulation)
  const retryBtn = (_ocBulkFailedIds.length > 0 && !simulate)
    ? `<button class="btn" onclick="sendOcBulkEmails(true)" style="background:rgba(239,68,68,0.08);color:var(--red);border-color:rgba(239,68,68,0.25);">↩ Retry ${_ocBulkFailedIds.length} Failed</button>`
    : '';
  $('oc-bulk-actions').innerHTML = `
    ${retryBtn}
    <button class="btn gold" onclick="closeOcBulkModal()">Done</button>
  `;
}

function cancelOcBulkSend() {
  _ocBulkSendingActive = false;
  const cancelBtn = $('oc-bulk-cancel-btn');
  if (cancelBtn) { cancelBtn.disabled = true; cancelBtn.textContent = 'Cancelling...'; }
}

function ocInitials(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '◦';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function openOcBulkRemoveModal() {
  let modal = $('oc-bulk-remove-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'oc-bulk-remove-modal';
    modal.style.position = 'fixed';
    modal.style.inset = '0';
    modal.style.background = 'rgba(0, 0, 0, 0.75)';
    modal.style.backdropFilter = 'blur(8px)';
    modal.style.display = 'none';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '10000';
    document.body.appendChild(modal);
  }

  modal.style.display = 'flex';
  renderOcBulkRemoveModalContent();
}

function closeOcBulkRemoveModal() {
  const modal = $('oc-bulk-remove-modal');
  if (modal) {
    modal.style.display = 'none';
  }
}

function renderOcBulkRemoveModalContent() {
  const modal = $('oc-bulk-remove-modal');
  if (!modal) return;

  const proj = OPENCALL_DATA.projects[OPENCALL_DATA.activeProjectId];
  if (!proj) return;

  const eligible = proj.contributors || [];

  const listHtml = eligible.length > 0
    ? `<div style="display:flex;gap:6px;margin-bottom:8px;">
        <button type="button" style="font-size:10px;padding:2px 8px;background:transparent;border:1px solid var(--border);color:var(--text3);border-radius:4px;cursor:pointer;" onclick="ocBulkRemoveSelectAll(true)">Select All</button>
        <button type="button" style="font-size:10px;padding:2px 8px;background:transparent;border:1px solid var(--border);color:var(--text3);border-radius:4px;cursor:pointer;" onclick="ocBulkRemoveSelectAll(false)">Deselect All</button>
        <span style="font-size:10px;color:var(--text3);margin-left:auto;align-self:center;" id="oc-bulk-remove-count">0 selected</span>
      </div>
      <div id="oc-bulk-remove-list" style="max-height:300px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;padding:10px;background:var(--input-bg);display:flex;flex-direction:column;gap:2px;">
      ` +
    eligible.map(c => `
        <label class="oc-bulk-remove-item" data-name="${escapeHtml((c.name || '').toLowerCase())}" data-email="${escapeHtml((c.email || '').toLowerCase())}" style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text);cursor:pointer;padding:4px 0;border-radius:4px;transition:background 0.15s;" onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background='transparent'">
          <input type="checkbox" class="oc-bulk-remove-check" value="${c.id}" style="margin:0;cursor:pointer;" onchange="ocBulkRemoveUpdateCount()">
          <span><strong>${escapeHtml(c.name || 'Unnamed')}</strong> <span style="color:var(--text3);">(${escapeHtml(c.email || 'no email')})</span></span>
        </label>
      `).join('') + `</div>`
    : '<div style="font-size:12px;color:var(--text3);font-style:italic;padding:10px 0;">No contributors found in this project.</div>';

  modal.innerHTML = `
    <div class="card" style="width:94%;max-width:500px;max-height:90vh;overflow-y:auto;background:var(--card-bg, #fff);border:1px solid var(--border);border-radius:var(--r3);padding:24px;box-shadow:0 20px 60px rgba(0,0,0,0.4);position:relative;" onclick="event.stopPropagation()">
      <button onclick="closeOcBulkRemoveModal()" style="position:absolute;top:15px;right:15px;background:transparent;border:none;color:var(--text3);font-size:18px;cursor:pointer;line-height:1;">✕</button>
      
      <div style="font-family:'Playfair Display',serif;font-size:20px;font-weight:700;color:var(--red);margin-bottom:4px;">✕ Bulk Remove Contributors</div>
      <div style="font-size:12px;color:var(--text3);margin-bottom:18px;">Select contributors to remove from the "${escapeHtml(proj.title)}" open call.</div>

      <!-- Search Box inside Modal -->
      ${eligible.length > 0 ? `
      <div style="margin-bottom:12px;">
        <input type="search" id="oc-bulk-remove-search" placeholder="Filter list by name or email..." oninput="ocBulkRemoveFilter(this.value)" style="width:100%;padding:8px 12px;font-size:13px;background:var(--input-bg);color:var(--text);border:1px solid var(--border);border-radius:6px;box-sizing:border-box;">
      </div>
      ` : ''}

      <!-- Recipients/Contributors List -->
      <div style="margin-bottom:20px;">
        ${listHtml}
      </div>
      
      <div style="display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;">
        <button class="btn" onclick="closeOcBulkRemoveModal()">Cancel</button>
        <button class="btn danger-btn" id="oc-bulk-remove-btn-submit" onclick="executeOcBulkRemove()" disabled>✕ Remove Selected</button>
      </div>
    </div>`;

  if (eligible.length > 0) {
    ocBulkRemoveUpdateCount();
  }
}

function ocBulkRemoveSelectAll(checked) {
  document.querySelectorAll('.oc-bulk-remove-item').forEach(item => {
    if (item.style.display !== 'none') {
      const cb = item.querySelector('.oc-bulk-remove-check');
      if (cb) cb.checked = checked;
    }
  });
  ocBulkRemoveUpdateCount();
}

function ocBulkRemoveUpdateCount() {
  const total = document.querySelectorAll('.oc-bulk-remove-check').length;
  const checked = document.querySelectorAll('.oc-bulk-remove-check:checked').length;
  const el = $('oc-bulk-remove-count');
  if (el) el.textContent = `${checked} of ${total} selected`;
  const removeBtn = $('oc-bulk-remove-btn-submit');
  if (removeBtn) {
    removeBtn.disabled = checked === 0;
    removeBtn.textContent = `✕ Remove Selected (${checked})`;
  }
}

function ocBulkRemoveFilter(query) {
  const q = query.toLowerCase().trim();
  document.querySelectorAll('.oc-bulk-remove-item').forEach(item => {
    const name = item.getAttribute('data-name') || '';
    const email = item.getAttribute('data-email') || '';
    if (name.includes(q) || email.includes(q)) {
      item.style.display = 'flex';
    } else {
      item.style.display = 'none';
    }
  });
}

async function executeOcBulkRemove() {
  const proj = OPENCALL_DATA.projects[OPENCALL_DATA.activeProjectId];
  if (!proj) return;

  const checks = document.querySelectorAll('.oc-bulk-remove-check:checked');
  const selectedIds = Array.from(checks).map(cb => cb.value);

  if (selectedIds.length === 0) {
    showToast('No contributors selected', 'warn');
    return;
  }

  const ok = await confirmDialog(`Are you sure you want to remove ${selectedIds.length} contributor${selectedIds.length !== 1 ? 's' : ''}? This action cannot be undone.`, { danger: true, okLabel: 'Remove' });
  if (!ok) return;

  // ⚡ Bolt Optimization: Replace O(N) Array.includes with O(1) Set.has inside filter loop
  const selectedIdsSet = new Set(selectedIds);
  proj.contributors = proj.contributors.filter(c => !selectedIdsSet.has(c.id));

  await _persistOpenCalls();
  closeOcBulkRemoveModal();
  renderOpenCall();
  showToast(`Successfully removed ${selectedIds.length} contributor${selectedIds.length !== 1 ? 's' : ''}`);
}

function renderOpenCall() {
  const body = $('opencall-body');
  if (!body) return;

  if (ocBlockedForAuthor_()) { body.innerHTML = ''; return; }

  const bc = $('book-context-oc');
  if (bc) bc.style.display = 'none';

  if (!OPENCALL_DATA.activeProjectId || !OPENCALL_DATA.projects[OPENCALL_DATA.activeProjectId]) {
    const keys = Object.keys(OPENCALL_DATA.projects);
    if (keys.length > 0) {
      OPENCALL_DATA.activeProjectId = keys[0];
    } else {
      OPENCALL_DATA.projects['default'] = {
        id: 'default',
        title: 'General Open Call',
        createdAt: today(),
        contributors: []
      };
      OPENCALL_DATA.activeProjectId = 'default';
    }
  }

  const listRaw = ocList();

  let list = listRaw;

  // Filtering (including Completed view)
  if (ocFilterStage === 'complete') {
    list = list.filter(c => OC_STAGES.every(st => c[st.key]));
  } else if (ocFilterStage) {
    list = list.filter(c => {
      const next = OC_STAGES.find(st => !c[st.key]);
      return next && next.key === ocFilterStage;
    });
  }

  if (ocSearchQuery.trim()) {
    const q = ocSearchQuery.toLowerCase().trim();
    list = list.filter(c =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.photo || '').toLowerCase().includes(q)
    );
  }

  // Sorting (Suggestion 1)
  list.sort((a, b) => {
    if (ocSortBy === 'nameAsc') {
      return (a.name || '').localeCompare(b.name || '');
    } else if (ocSortBy === 'nameDesc') {
      return (b.name || '').localeCompare(a.name || '');
    } else if (ocSortBy === 'dateAsc') {
      return (a.createdAt || '').localeCompare(b.createdAt || '');
    } else if (ocSortBy === 'dateDesc') {
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    } else if (ocSortBy === 'progressDesc' || ocSortBy === 'progressAsc') {
      const getProgress = (c) => OC_STAGES.filter(st => c[st.key]).length;
      return ocSortBy === 'progressDesc' ? getProgress(b) - getProgress(a) : getProgress(a) - getProgress(b);
    }
    return 0;
  });

  const total = listRaw.length;
  const done = listRaw.filter(c => OC_STAGES.every(st => c[st.key])).length;

  const projectOptions = Object.keys(OPENCALL_DATA.projects).map(id => {
    const proj = OPENCALL_DATA.projects[id];
    return `<option value="${id}" ${id === OPENCALL_DATA.activeProjectId ? 'selected' : ''}>${escapeHtml(proj.title)}</option>`;
  }).join('');

  const projectSwitcher = `
    <div class="card oc-project-card">
      <div class="oc-project-header">
        <span class="oc-project-icon">📣</span>
        <span class="oc-project-name">Open Call Portal</span>
      </div>
      <select id="oc-project-select" class="oc-project-select" onchange="ocSwitchProject(this.value)">
        ${projectOptions}
      </select>
      <div class="oc-project-actions">
        <button class="btn sm gold" onclick="ocCreateProject()">＋ New</button>
        <button class="btn sm" onclick="ocRenameProject()">✎ Rename</button>
        <button class="btn sm danger-btn" onclick="ocDeleteProject()">✕ Delete</button>
      </div>
    </div>`;

  const stageCounts = OC_STAGES.map(st => {
    const n = listRaw.filter(c => c[st.key]).length;
    const isDone = n === total && total > 0;
    return `<span class="oc-stage-pill ${isDone ? 'done' : ''}" title="${st.label}">${st.label}: <strong>${n}/${total}</strong></span>`;
  }).join('');

  const activeProj = OPENCALL_DATA.projects[OPENCALL_DATA.activeProjectId];
  if (activeProj) ocEnsureQueues_(activeProj);
  const inboxCount = activeProj ? activeProj.inbox.length : 0;
  const outboxCount = activeProj ? activeProj.outbox.length : 0;
  const lastScannedVal = activeProj ? activeProj.lastScanned : null;
  const lastScannedHtml = lastScannedVal
    ? `<div class="oc-last-scanned">Last scanned: ${formatDateTime(lastScannedVal)}</div>`
    : '';

  // Project Progress Bar
  const pct = total ? Math.round((done / total) * 100) : 0;
  const progressBarHtml = total ? `
    <div class="oc-progress-wrap">
      <div class="row-between oc-progress-label">
        <span>Project Progress</span>
        <strong>${pct}% (${done}/${total} complete)</strong>
      </div>
      <div class="oc-progress-track">
        <div class="oc-progress-fill" style="width:${pct}%;"></div>
      </div>
    </div>` : '';

  // Server-side auto-scan control. The Apps Script runs the reply scan on a
  // timer even when this app is closed; findings land in the Review inbox.
  const sched = _ocScheduleCache();
  const scheduleRowHtml = `
    <div class="oc-sched-row" title="Runs the Gmail reply scan on Google's servers on a timer — findings wait in “Review scan results”, and the digest emails you a summary. Works even when this app is closed. Requires the latest Apps Script deployed.">
      <span class="oc-sched-label">⏱ Auto-scan (server)</span>
      <select id="oc-sched-interval" onchange="ocSetServerSchedule()" ${sheetsUrl ? '' : 'disabled'}>
        <option value="0" ${!sched.enabled ? 'selected' : ''}>Off</option>
        <option value="30" ${sched.enabled && sched.minutes === 30 ? 'selected' : ''}>Every 30 min</option>
        <option value="60" ${sched.enabled && sched.minutes === 60 ? 'selected' : ''}>Every hour</option>
      </select>
      <label class="oc-sched-digest"><input type="checkbox" id="oc-sched-digest" ${sched.digest ? 'checked' : ''} ${sheetsUrl ? '' : 'disabled'} onchange="ocSetServerSchedule()"> Email digest</label>
      <span id="oc-sched-status" class="oc-sched-status">${sched.enabled ? '● on' : ''}</span>
    </div>`;

  const summary = `
    <div class="card oc-summary-card">
      <div class="oc-section-title">Contributors · ${total}</div>
      <div class="oc-scan-controls">
        <select id="oc-scan-days">
          <option value="30">Last 30 days</option>
          <option value="60">Last 60 days</option>
          <option value="120" selected>Last 120 days</option>
        </select>
        <button class="btn sm gold" id="oc-import-gmail-btn" onclick="openOcImportGmailModal()" title="Find artists' submission emails in Gmail and import them as contributors — capturing their submission thread so every stage email replies into it">📨 Import from Gmail</button>
        <button class="btn sm gold" id="oc-scan-btn" onclick="ocScanReplies()" ${total ? '' : 'disabled'}>📥 Scan Gmail Replies</button>
        <button class="btn sm" onclick="exportOpenCallCSV()" ${total ? '' : 'disabled'}>Export CSV</button>
        <button class="btn sm" onclick="ocCopyEmails()" ${total ? '' : 'disabled'}>Copy emails</button>
      </div>
      <div class="oc-stage-counts">${total ? stageCounts : '<span class="oc-empty-note">No contributors yet.</span>'}</div>
      ${progressBarHtml}
      ${scheduleRowHtml}
      ${lastScannedHtml}
    </div>`;

  // Initialize templates if not present
  if (activeProj && !activeProj.templates) {
    activeProj.templates = {
      selectionSent: {
        subject: `[Selected] Lyricalmyrical Collective Open Call`,
        body: `Hi {{name}},\n\nCongratulations! Your work has been selected from our open call to be featured in our upcoming project. We're thrilled to include you!\n\nWe are now entering the layout phase and require one initial piece of info:\n1. The exact name you want to use in the credit index.\n\nPlease reply to this email to let us know.\n\nWarm regards,\nLyricalmyrical Books`
      },
      cmykSent: {
        subject: `[Files Requested] Lyricalmyrical Open Call - ${activeProj.title}`,
        body: `Hi {{name}},\n\nWe are now preparing the print-ready files and require your high-resolution artwork.\n\nPlease send us your files (CMYK profile, 300 DPI, with 3mm bleed) as soon as possible.\n\nThank you again!\n\nWarm regards,\nLyricalmyrical Books`
      },
      preorderSent: {
        subject: `[Pre-orders Open] Lyricalmyrical Collective Project - ${activeProj.title}`,
        body: `Hi {{name}},\n\nWe are thrilled to announce that pre-orders for the collective project are now officially open!\n\nAs selected contributor, you receive a special 50% discount on any number of copies. Use code LMBCOLLECTIVE at checkout:\nhttps://www.lyricalmyricalbooks.com/product/collective-photobook\n\nThank you for being part of this project!\n\nWarm regards,\nLyricalmyrical Books`
      }
    };
  }

  // Templates Editor Panel
  let initialHtml = '';
  if (activeProj && activeProj.templates && activeProj.templates[activeTmplTab]) {
    const rawBody = activeProj.templates[activeTmplTab].body || '';
    const cleanHtml = (rawBody.includes('<') || !rawBody) ? rawBody : parseMarkdownToHtml(rawBody);
    initialHtml = deserializeHtmlToEditor(cleanHtml);
  }

  const tmplOpen = ocUiOpen_('tmpl', false);
  const templatesEditor = activeProj ? `
    <div class="card oc-collapse-card ${tmplOpen ? 'open' : ''}" style="margin-top:0;padding:20px;">
      <div class="row-between oc-collapse-head" onclick="if (event.target.closest('button')) return; ocToggleSection('tmpl')" style="${tmplOpen ? 'border-bottom:1px solid var(--border);padding-bottom:10px;margin-bottom:15px;' : ''}flex-wrap:wrap;gap:8px;">
        <div style="font-family:'Playfair Display',serif;font-size:15px;font-weight:700;color:var(--gold2);">✉ Email Template Designer</div>
        <div style="display:flex;gap:4px;align-items:center;">
          ${tmplOpen ? `
          <button class="btn sm ${activeTmplTab === 'selectionSent' ? 'gold' : ''}" onclick="ocSetTmplTab('selectionSent')">Selection</button>
          <button class="btn sm ${activeTmplTab === 'cmykSent' ? 'gold' : ''}" onclick="ocSetTmplTab('cmykSent')">Request Files</button>
          <button class="btn sm ${activeTmplTab === 'preorderSent' ? 'gold' : ''}" onclick="ocSetTmplTab('preorderSent')">Pre-order</button>` : `
          <span class="oc-collapse-status">3 stage templates · click to edit</span>`}
          <span class="oc-collapse-chevron">${tmplOpen ? '▾' : '▸'}</span>
        </div>
      </div>

      <div class="oc-collapse-body" style="display:${tmplOpen ? 'grid' : 'none'};grid-template-columns:1fr 1fr;gap:20px;align-items:start;">
        <!-- Editor Column -->
        <div style="display:flex;flex-direction:column;gap:12px;">
          <div>
            <label style="font-size:10px;color:var(--text3);font-weight:600;display:block;margin-bottom:4px;text-transform:uppercase;">Subject Line</label>
            <input id="oc-tmpl-subject" value="${escapeHtml(activeProj.templates[activeTmplTab].subject)}" oninput="ocUpdateTmplPreview()" placeholder="Subject Line" style="font-size:13.5px;padding:10px 12px;width:100%;box-sizing:border-box;">
          </div>
          <div>
            <label style="font-size:10px;color:var(--text3);font-weight:600;display:block;margin-bottom:4px;text-transform:uppercase;">Email Body</label>
            <div class="oc-editor-container">
              <div id="oc-tmpl-body" class="oc-rich-editor" contenteditable="true" oninput="ocUpdateTmplPreview()">${initialHtml}</div>
              <div class="oc-editor-toolbar">
                <div class="oc-toolbar-group">
                  <button class="btn sm gold" onclick="ocSaveTemplates()" style="height:32px;padding:0 14px;font-weight:700;letter-spacing:0.02em;">Save</button>
                  <div class="oc-toolbar-divider"></div>
                  <button type="button" class="oc-toolbar-btn" onmousedown="event.preventDefault()" onclick="insertFormattingTag('bold')" title="Bold (Ctrl+B)"><b>B</b></button>
                  <button type="button" class="oc-toolbar-btn" onmousedown="event.preventDefault()" onclick="insertFormattingTag('italic')" title="Italic (Ctrl+I)"><i>I</i></button>
                  <button type="button" class="oc-toolbar-btn" onmousedown="event.preventDefault()" onclick="insertFormattingTag('underline')" title="Underline (Ctrl+U)"><u>U</u></button>
                  <div class="oc-dropdown-container">
                    <button type="button" class="oc-toolbar-btn" onmousedown="event.preventDefault()" onclick="ocToggleColorPalette('fore')" title="Text Color" style="font-weight:bold;color:#c5a880;">A</button>
                    <div id="oc-forecolor-palette" class="oc-color-palette">
                      <div class="oc-color-swatch" style="background:#0e0c0a;" onmousedown="event.preventDefault()" onclick="ocApplyColor('fore', '#0e0c0a')"></div>
                      <div class="oc-color-swatch" style="background:#c8913a;" onmousedown="event.preventDefault()" onclick="ocApplyColor('fore', '#c8913a')"></div>
                      <div class="oc-color-swatch" style="background:#e52e2e;" onmousedown="event.preventDefault()" onclick="ocApplyColor('fore', '#e52e2e')"></div>
                      <div class="oc-color-swatch" style="background:#1e40af;" onmousedown="event.preventDefault()" onclick="ocApplyColor('fore', '#1e40af')"></div>
                      <div class="oc-color-swatch" style="background:#047857;" onmousedown="event.preventDefault()" onclick="ocApplyColor('fore', '#047857')"></div>
                      <div class="oc-color-swatch" style="background:#78350f;" onmousedown="event.preventDefault()" onclick="ocApplyColor('fore', '#78350f')"></div>
                      <div class="oc-color-swatch" style="background:#6b21a8;" onmousedown="event.preventDefault()" onclick="ocApplyColor('fore', '#6b21a8')"></div>
                      <div class="oc-color-swatch" style="background:#4b5563;" onmousedown="event.preventDefault()" onclick="ocApplyColor('fore', '#4b5563')"></div>
                      <div class="oc-color-swatch" style="background:#9ca3af;" onmousedown="event.preventDefault()" onclick="ocApplyColor('fore', '#9ca3af')"></div>
                      <div class="oc-color-swatch" style="background:#ffffff;border:1px solid #ccc;" onmousedown="event.preventDefault()" onclick="ocApplyColor('fore', '#ffffff')"></div>
                    </div>
                  </div>
                  <div class="oc-dropdown-container">
                    <button type="button" class="oc-toolbar-btn" onmousedown="event.preventDefault()" onclick="ocToggleColorPalette('back')" title="Highlight Color" style="background:#fef08a;color:#000;border-radius:4px;width:24px;height:24px;font-size:11px;margin:4px;">H</button>
                    <div id="oc-backcolor-palette" class="oc-color-palette">
                      <div class="oc-color-swatch" style="background:#fef08a;" onmousedown="event.preventDefault()" onclick="ocApplyColor('back', '#fef08a')"></div>
                      <div class="oc-color-swatch" style="background:#bdf5bd;" onmousedown="event.preventDefault()" onclick="ocApplyColor('back', '#bdf5bd')"></div>
                      <div class="oc-color-swatch" style="background:#bfdbfe;" onmousedown="event.preventDefault()" onclick="ocApplyColor('back', '#bfdbfe')"></div>
                      <div class="oc-color-swatch" style="background:#fbcfe8;" onmousedown="event.preventDefault()" onclick="ocApplyColor('back', '#fbcfe8')"></div>
                      <div class="oc-color-swatch" style="background:#fed7aa;" onmousedown="event.preventDefault()" onclick="ocApplyColor('back', '#fed7aa')"></div>
                      <div class="oc-color-swatch" style="background:#ddd6fe;" onmousedown="event.preventDefault()" onclick="ocApplyColor('back', '#ddd6fe')"></div>
                      <div class="oc-color-swatch" style="background:#c8913a;" onmousedown="event.preventDefault()" onclick="ocApplyColor('back', '#c8913a')"></div>
                      <div class="oc-color-swatch" style="background:#e52e2e;" onmousedown="event.preventDefault()" onclick="ocApplyColor('back', '#e52e2e')"></div>
                      <div class="oc-color-swatch" style="background:#e5ddd0;" onmousedown="event.preventDefault()" onclick="ocApplyColor('back', '#e5ddd0')"></div>
                      <div class="oc-color-swatch" style="background:transparent;border:1px dashed #ccc;" onmousedown="event.preventDefault()" onclick="ocApplyColor('back', 'transparent')"></div>
                    </div>
                  </div>
                  <button type="button" class="oc-toolbar-btn" onmousedown="event.preventDefault()" onclick="insertFormattingTag('link')" title="Insert Link">🔗</button>
                  <button type="button" class="oc-toolbar-btn" onmousedown="event.preventDefault()" onclick="insertFormattingTag('clear')" title="Clear Formatting">Tx</button>
                </div>
                <div class="oc-toolbar-group" style="gap:5px;">
                  <button type="button" class="oc-token-btn" onmousedown="event.preventDefault()" onclick="insertFormattingTag('name')" title="Insert Name Pill">name</button>
                  <button type="button" class="oc-token-btn" onmousedown="event.preventDefault()" onclick="insertFormattingTag('photo')" title="Insert Photo Pill">photo</button>
                  <button type="button" class="oc-token-btn" onmousedown="event.preventDefault()" onclick="insertFormattingTag('creditName')" title="Insert Credit Index Pill">creditName</button>
                  <button type="button" class="oc-token-btn" onmousedown="event.preventDefault()" onclick="insertFormattingTag('project')" title="Insert Project Title Pill">project</button>
                  <button type="button" class="oc-token-btn" onmousedown="event.preventDefault()" onclick="insertFormattingTag('date')" title="Insert Deadline Pill">date</button>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Live Preview Column -->
        <div class="oc-preview-box" style="align-self:stretch;display:flex;flex-direction:column;">
          <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.05em;color:var(--text3);border-bottom:1px solid var(--cream3);padding-bottom:6px;margin-bottom:8px;font-weight:700;">Live Preview (Sample)</div>
          <div style="font-size:13.5px;font-weight:700;margin-bottom:8px;color:var(--text);" id="oc-preview-subject">—</div>
          <div style="font-size:13px;color:var(--text2);line-height:1.6;font-family:inherit;flex:1;overflow-y:auto;" id="oc-preview-body">—</div>
        </div>
      </div>
    </div>` : '';

  const searchFilterBar = `
    <div class="card" style="margin-bottom:0;padding:15px;display:flex;flex-direction:column;gap:12px;">
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:space-between;">
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;flex:1;">
          <input type="search" id="oc-search" placeholder="Search artist, email..." value="${escapeHtml(ocSearchQuery)}" oninput="ocSearch(this.value)" style="max-width:300px;">
          
          <select id="oc-filter-stage" onchange="ocFilterByStage(this.value)" style="max-width:200px;">
            <option value="">All pending stages</option>
            <option value="selectionSent" ${ocFilterStage === 'selectionSent' ? 'selected' : ''}>Awaiting Selection</option>
            <option value="creditReceived" ${ocFilterStage === 'creditReceived' ? 'selected' : ''}>Awaiting Credit</option>
            <option value="cmykSent" ${ocFilterStage === 'cmykSent' ? 'selected' : ''}>Awaiting CMYK</option>
            <option value="filesReceived" ${ocFilterStage === 'filesReceived' ? 'selected' : ''}>Awaiting Files</option>
            <option value="preorderSent" ${ocFilterStage === 'preorderSent' ? 'selected' : ''}>Awaiting Pre-order</option>
            <option value="complete" ${ocFilterStage === 'complete' ? 'selected' : ''}>✓ Completed</option>
          </select>
          
          <select id="oc-sort-by" onchange="ocSetSort(this.value)" style="max-width:200px;">
            <option value="dateDesc" ${ocSortBy === 'dateDesc' ? 'selected' : ''}>Newest First</option>
            <option value="dateAsc" ${ocSortBy === 'dateAsc' ? 'selected' : ''}>Oldest First</option>
            <option value="nameAsc" ${ocSortBy === 'nameAsc' ? 'selected' : ''}>Name A-Z</option>
            <option value="nameDesc" ${ocSortBy === 'nameDesc' ? 'selected' : ''}>Name Z-A</option>
            <option value="progressDesc" ${ocSortBy === 'progressDesc' ? 'selected' : ''}>Progress (High to Low)</option>
            <option value="progressAsc" ${ocSortBy === 'progressAsc' ? 'selected' : ''}>Progress (Low to High)</option>
          </select>
        </div>
        
        <div style="display:flex;gap:6px;">
          <button class="btn gold" onclick="openOcBulkModal()" ${total ? '' : 'disabled'}>✉ Bulk Email</button>
          <button class="btn danger-btn" onclick="openOcBulkRemoveModal()" ${total ? '' : 'disabled'} title="Bulk remove contributors">✕ Bulk Remove</button>
          <button class="btn" onclick="exportOpenCallCSV()" ${total ? '' : 'disabled'} title="Export all contributors to CSV">📤 Export CSV</button>
        </div>
      </div>
      <div style="font-size:11px;color:var(--text3);">${total} contributor${total === 1 ? '' : 's'} total · ${list.length} shown</div>
    </div>`;

  const importPanel = ocImportOpen ? `
      <div class="oc-import-panel">
        <div class="oc-import-hint">
          Paste rows from the spreadsheet — one contributor per line, columns separated by tab or comma:
          <strong>Name, Email, Photo file, Credit Name, Notes</strong>. A header row is skipped automatically; existing emails are not duplicated.
          <br>
          <a href="opencall-template.csv" download="opencall-template.csv" style="color:var(--gold2);text-decoration:underline;display:inline-block;margin-top:4px;font-weight:600;">📥 Download Excel / CSV Template</a>
        </div>
        <textarea id="oc-import-text" rows="4" placeholder="Jeremy Ackman, ackmanj@gmail.com, Jeremy_ackman_5.jpg, Jeremy Ackman, Selected" style="font-family:'DM Mono',monospace;"></textarea>
        
        <div class="oc-upload-zone" onclick="triggerOcCsvUpload()" ondragover="handleOcCsvDragOver(event)" ondragleave="handleOcCsvDragLeave(event)" ondrop="handleOcCsvDrop(event)">
          <p>Drag & Drop a <strong>.csv or Excel (.xlsx)</strong> file here, or click to upload</p>
          <span>Columns: Name, Email, Photo (separate several with ;), Credit Name, Notes — you'll see a preview before anything is imported</span>
          <input type="file" id="oc-csv-file-input" accept=".csv,.xlsx,.xls" style="display:none;" onchange="handleOcCsvUpload(this)">
        </div>
        
        <div style="display:flex;gap:8px;margin-top:12px;">
          <button class="btn gold" onclick="ocRunImport()">Import pasted rows</button>
          <button class="btn" onclick="ocToggleImport()">Cancel</button>
        </div>
      </div>` : '';

  const chipsHtml = _ocNewContributorPhotos.map((p, idx) => `
    <span class="oc-photo-chip">
      📷 ${escapeHtml(p)}
      <span class="oc-photo-chip-remove" onclick="removeOcPhotoChip(${idx})" title="Remove photo">✕</span>
    </span>
  `).join('');

  const addForm = `
    <div class="card oc-add-form-card" style="margin-bottom:0;">
      <div class="oc-add-form-header">
        <div class="oc-section-title" style="margin-bottom:0;">Add contributor</div>
        <button class="btn sm" onclick="ocToggleImport()">${ocImportOpen ? 'Close import' : '⬇ Paste / import list'}</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <input id="oc-name" placeholder="Artist name">
        <div style="width:100%;display:flex;flex-direction:column;gap:4px;">
          <input id="oc-email" placeholder="Email" type="email" oninput="checkOcEmailTypo(this.value)">
          <div id="oc-add-email-correction" class="email-suggest-correction" style="display:none;" onclick="applyOcEmailCorrection()"></div>
        </div>
        <div style="width:100%;display:flex;flex-direction:column;gap:4px;">
          <div style="display:flex;gap:6px;width:100%;">
            <input id="oc-photo" placeholder="Photo file name (Enter to add)" style="flex:1;" onkeydown="handleOcPhotoKeydown(event)">
            <button class="btn sm gold" onclick="addOcPhotoChip()" style="padding:0 12px;height:38px;margin:0;">＋</button>
          </div>
          <div id="oc-photo-chips" class="oc-addform-chips">${chipsHtml}</div>
        </div>
        <button class="btn gold" onclick="ocAdd()">Add Contributor</button>
      </div>
      ${importPanel}
    </div>`;

  const cards = list.map(c => {
    const next = ocNextAction(c);

    // Mailing list integration badges and actions
    let mailStatusHtml = '';
    let mailActionsHtml = '';
    if (c.email) {
      const sup = _isCustomerSuppressed(c.email);
      const onList = mailingListHas(c.email);

      if (sup) {
        mailStatusHtml = `<span class="oc-mail-badge sup">unsubscribed</span>`;
        mailActionsHtml = `<button class="btn sm" onclick="toggleCustomerSuppress('${encodeURIComponent(c.email)}')" title="Allow emailing this contributor again">Re-subscribe</button>`;
      } else {
        if (onList) {
          mailStatusHtml = `<span class="oc-mail-badge on">✓ Subscribed</span>`;
        } else {
          mailStatusHtml = `<span class="oc-mail-badge off">not on list</span>`;
          mailActionsHtml = `<button class="btn sm gold" onclick="addBuyerToMailingList('${encodeURIComponent(c.email)}')" title="Add to mailing list">＋ List</button>`;
        }
        mailActionsHtml += ` <button class="btn sm" onclick="toggleCustomerSuppress('${encodeURIComponent(c.email)}')" title="Unsubscribe this contributor">Unsubscribe</button>`;
      }

      // Bounce flag (set by the reply scan when a delivery-failure notice names
      // this address). Show it prominently and let the publisher clear it after
      // fixing the address, so "bounced" never hides behind "no reply yet".
      if (c.undeliverable) {
        mailStatusHtml = `<span class="oc-mail-badge sup" title="A delivery-failure notice was found for this address. Check the email, fix it if needed, then clear this flag and re-send.">⚠ Undeliverable</span> ` + mailStatusHtml;
        mailActionsHtml += ` <button class="btn sm" onclick="ocClearUndeliverable('${c.id}')" title="Clear the bounce flag (e.g. after correcting the address)">Clear bounce</button>`;
      }
    }

    // Direct pipeline email triggers
    let pipelineEmailBtnHtml = '';
    if (c.email && !_isCustomerSuppressed(c.email)) {
      if (!c.selectionSent) {
        pipelineEmailBtnHtml = `<button class="btn sm gold" onclick="ocComposeStageEmail('${c.id}', 'selectionSent')" title="Compose Selection congratulatory email">✉ Send Selection Notice</button>`;
      } else if (c.creditReceived && !c.cmykSent) {
        pipelineEmailBtnHtml = `<button class="btn sm gold" onclick="ocComposeStageEmail('${c.id}', 'cmykSent')" title="Compose CMYK artwork request email">✉ Request Files</button>`;
      } else if (c.cmykSent && c.filesReceived && !c.preorderSent) {
        pipelineEmailBtnHtml = `<button class="btn sm gold" onclick="ocComposeStageEmail('${c.id}', 'preorderSent')" title="Compose Pre-order launch email with contributor info">✉ Send Pre-order Info</button>`;
      }
    }

    const creditNameHtml = c.creditName
      ? `<span class="oc-credit-index" title="Print Credit Name">Index: "${escapeHtml(c.creditName)}"</span>`
      : '';

    const emailCell = c.email
      ? (_isCustomerSuppressed(c.email)
        ? `<span style="text-decoration:line-through;color:var(--text4);">${escapeHtml(c.email)}</span>`
        : `<a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a>`)
      : '<span>no email</span>';

    let gmailLinksHtml = '';
    if (c.email && (c.gmailThreadId || c.creditThreadId || c.filesThreadId)) {
      const links = [];
      // Canonical thread: the conversation every stage email replies into
      // (captured at stage-1 send, or imported from the submission email).
      if (c.gmailThreadId) {
        links.push(`<a href="https://mail.google.com/mail/u/0/#inbox/${c.gmailThreadId}" target="_blank" title="View this contributor's email thread in Gmail">✉ View Thread</a> <span class="oc-thread-preview" onclick="ocToggleInlineThread('${c.id}', '${c.gmailThreadId}', 'Email Thread')" title="Preview email thread inline">👁 Preview</span>`);
      }
      // Reply threads, shown only when they're a different conversation than the
      // canonical one (after promotion they usually coincide).
      if (c.creditThreadId && c.creditThreadId !== c.gmailThreadId) {
        links.push(`<a href="https://mail.google.com/mail/u/0/#inbox/${c.creditThreadId}" target="_blank" title="View credit name reply in Gmail">✉ View Credit Reply</a> <span class="oc-thread-preview" onclick="ocToggleInlineThread('${c.id}', '${c.creditThreadId}', 'Credit Reply')" title="Preview email thread inline">👁 Preview</span>`);
      }
      if (c.filesThreadId && c.filesThreadId !== c.gmailThreadId) {
        links.push(`<a href="https://mail.google.com/mail/u/0/#inbox/${c.filesThreadId}" target="_blank" title="View files reply in Gmail">✉ View Files Reply</a> <span class="oc-thread-preview" onclick="ocToggleInlineThread('${c.id}', '${c.filesThreadId}', 'Files Reply')" title="Preview email thread inline">👁 Preview</span>`);
      }
      gmailLinksHtml = `<span class="oc-gmail-links"> · ${links.join(' / ')}</span>`;
    } else if (c.email && c.selectionSent) {
      // Every follow-up must reply into the artist's thread — no captured
      // thread means the next email would start a brand-new conversation.
      gmailLinksHtml = `<span class="oc-thread-warn" title="No Gmail thread captured for this artist — the next email would start a NEW conversation instead of replying. Send through the app (threads auto-capture), use Import from Gmail, or paste the thread id in the email preview.">⚠ no thread</span>`;
    }

    // Interactive photos list on card (uses the v3 photo-row design system).
    // The star curates: picked photos are what {{photo}} resolves to in every
    // stage email — so the selection email names the winner(s), not all five.
    const photosArr = c.photos || (c.photo ? c.photo.split(/;\s*|,\s*/).map(p => p.trim()).filter(Boolean) : []);
    const picks = Array.isArray(c.selectedPhotos) ? c.selectedPhotos : [];
    const pickStatus = photosArr.length > 1
      ? (picks.length
        ? `<span class="oc-pick-count" title="Emails reference only the starred photo(s)">★ ${picks.length}/${photosArr.length} picked</span>`
        : `<span class="oc-pick-hint" title="Click ☆ on the winning photo — {{photo}} in emails will use it instead of listing all ${photosArr.length}">☆ star the chosen photo</span>`)
      : '';
    const photosHtml = `
      <div class="oc-photo-row">
        <span class="oc-photo-label">📷 Photos:</span>
        ${photosArr.map((p, idx) => {
      const isPicked = picks.includes(p);
      return `
          <span class="oc-photo-chip ${isPicked ? 'picked' : ''}">
            <span class="oc-photo-pick ${isPicked ? 'on' : ''}" onclick="ocTogglePhotoPick('${c.id}', ${idx})" title="${isPicked ? 'Unpick this photo' : 'Pick this photo as a chosen one — emails will reference it'}">${isPicked ? '★' : '☆'}</span>
            ${escapeHtml(p)}
            <span class="oc-photo-chip-remove" onclick="ocRemovePhotoFromContributor('${c.id}', ${idx})" title="Remove photo">✕</span>
          </span>`;
    }).join('')}
        ${pickStatus}
        <span id="oc-add-photo-btn-${c.id}" class="oc-add-photo-trigger" onclick="document.getElementById('oc-add-photo-input-${c.id}').style.display='inline-block'; this.style.display='none'; document.getElementById('oc-add-photo-input-${c.id}').focus();">＋ Add</span>
        <input id="oc-add-photo-input-${c.id}" class="oc-add-photo-input" type="text" placeholder="photo_file.jpg (Enter)" onkeydown="if(event.key==='Enter') { ocAddPhotoToContributor('${c.id}', this.value); } else if(event.key==='Escape') { this.style.display='none'; document.getElementById('oc-add-photo-btn-${c.id}').style.display='inline-flex'; }">
      </div>`;

    // Pipeline Step Tracker Visualizer (Interactive)
    let progressPercent = 0;
    if (c.preorderSent) progressPercent = 100;
    else if (c.filesReceived) progressPercent = 75;
    else if (c.cmykSent) progressPercent = 50;
    else if (c.creditReceived) progressPercent = 25;
    else if (c.selectionSent) progressPercent = 0;

    const isNextStep = (contributor, key) => {
      if (key === 'selectionSent' && !contributor.selectionSent) return true;
      if (key === 'creditReceived' && contributor.selectionSent && !contributor.creditReceived) return true;
      if (key === 'cmykSent' && contributor.creditReceived && !contributor.cmykSent) return true;
      if (key === 'filesReceived' && contributor.cmykSent && !contributor.filesReceived) return true;
      if (key === 'preorderSent' && contributor.filesReceived && !contributor.preorderSent) return true;
      return false;
    };

    const stepHtml = (key, num, label) => {
      const doneVal = c[key];
      const activeVal = !doneVal && isNextStep(c, key);
      const cls = doneVal ? 'done' : activeVal ? 'active' : '';
      return `
        <div class="oc-step ${cls}" onclick="ocToggle('${c.id}','${key}')" title="Click to toggle ${label} stage">
          <div class="oc-step-circle">${doneVal ? '✓' : num}</div>
          <div class="oc-step-label">${label}</div>
        </div>`;
    };

    const pipelineVisualizer = `
      <div class="oc-step-container">
        <div class="oc-step-line"></div>
        <div class="oc-step-line-fill" style="width: ${progressPercent}%;"></div>
        ${stepHtml('selectionSent', '1', 'Selection')}
        ${stepHtml('creditReceived', '2', 'Credit')}
        ${stepHtml('cmykSent', '3', 'CMYK')}
        ${stepHtml('filesReceived', '4', 'Files')}
        ${stepHtml('preorderSent', '5', 'Pre-order')}
      </div>`;

    const notesHtml = c.notes
      ? `<div class="oc-note"><strong>Note:</strong> ${escapeHtml(c.notes)}</div>`
      : '';

    const primaryCtaHtml = pipelineEmailBtnHtml
      ? `<div class="oc-card-primary-cta">${pipelineEmailBtnHtml}</div>`
      : '';

    return `
      <div class="card oc-contributor-card" id="oc-card-${c.id}">
        <div class="oc-card-head">
          <div class="oc-card-identity">
            <div class="oc-avatar" aria-hidden="true">${escapeHtml(ocInitials(c.name))}</div>
            <div class="oc-card-meta">
              <div class="oc-contributor-name">${escapeHtml(c.name || '—')}${creditNameHtml}${mailStatusHtml}</div>
              <div class="oc-email-row">
                ${emailCell}
                ${gmailLinksHtml}
              </div>
              ${photosHtml}
            </div>
          </div>
          <div class="oc-card-actions">
            ${primaryCtaHtml}
            <div class="oc-util-actions">
              ${mailActionsHtml}
              <button class="btn sm" id="oc-scan-single-${c.id}" onclick="ocScanRepliesSingle('${c.id}')" title="Scan Gmail replies for this artist only">↻ Scan</button>
              <button class="btn sm" onclick="openOcEditModal('${c.id}')" title="Edit contributor details">✎ Edit</button>
              <button class="btn sm danger-btn" onclick="ocDelete('${c.id}')" title="Remove contributor">✕ Remove</button>
            </div>
          </div>
        </div>
        ${notesHtml}
        <div class="oc-status-strip">
          ${pipelineVisualizer}
          ${next
        ? `<div class="oc-next-action">${next}${(() => {
          const wd = ocWaitingDays(c);
          return wd !== null && wd >= 2 ? ` <span class="oc-wait-chip" title="No movement for ${wd} day${wd === 1 ? '' : 's'} — measured from the last stage change">⏳ ${wd}d</span>` : '';
        })()}</div>`
        : `<div class="oc-all-complete">✓ All stages complete</div>`}
        </div>
        <div id="oc-inline-thread-${c.id}" class="oc-inline-thread-container" style="display:none;margin-top:12px;padding:12px;background:rgba(0,0,0,0.15);border-radius:6px;border:1px solid var(--border);max-height:280px;overflow-y:auto;font-size:12px;text-align:left;"></div>
      </div>`;
  }).join('');

  const useResend = localStorage.getItem('lm-oc-use-resend') === 'true';
  const resendOpen = ocUiOpen_('resend', false);
  const resendConfigCard = `
    <div class="card oc-resend-card oc-collapse-card ${resendOpen ? 'open' : ''}" style="margin-bottom:0;padding:15px;display:flex;flex-direction:column;gap:8px;">
      <div class="oc-collapse-head" onclick="ocToggleSection('resend')" style="font-family:'Playfair Display',serif;font-size:14px;font-weight:700;color:var(--gold2);display:flex;justify-content:space-between;align-items:center;">
        <span>⚡ Resend API Email</span>
        <span style="display:flex;align-items:center;gap:8px;">
          <span class="oc-collapse-status">${useResend ? 'on' : 'off'}</span>
          <input type="checkbox" id="oc-use-resend" onclick="event.stopPropagation()" onchange="ocToggleResend(this.checked)" ${useResend ? 'checked' : ''} style="cursor:pointer;margin:0;">
          <span class="oc-collapse-chevron">${resendOpen ? '▾' : '▸'}</span>
        </span>
      </div>
      <div id="oc-resend-fields" style="display:${resendOpen && useResend ? 'flex' : 'none'};flex-direction:column;gap:8px;">
        <div>
          <label style="font-size:9px;color:var(--text3);font-weight:600;display:block;margin-bottom:2px;text-transform:uppercase;">Resend API Key</label>
          <input id="oc-resend-key" type="password" placeholder="re_..." value="${escapeHtml(localStorage.getItem('lm-resend-api-key') || '')}" oninput="ocSaveResendConfig()" style="font-size:11px;padding:6px 10px;width:100%;box-sizing:border-box;background:var(--input-bg);color:var(--text);border:1px solid var(--border);border-radius:4px;">
        </div>
        <div>
          <label style="font-size:9px;color:var(--text3);font-weight:600;display:block;margin-bottom:2px;text-transform:uppercase;">Sender Email (Verified)</label>
          <input id="oc-resend-from" type="email" placeholder="e.g. hello@yourdomain.com" value="${escapeHtml(localStorage.getItem('lm-resend-from') || '')}" oninput="ocSaveResendConfig()" style="font-size:11px;padding:6px 10px;width:100%;box-sizing:border-box;background:var(--input-bg);color:var(--text);border:1px solid var(--border);border-radius:4px;">
        </div>
        <div style="font-size:10px;color:var(--text3);line-height:1.3;">
          Local development only: sends through the Node backend at localhost:8787. On the live site, configure Resend in Google Apps Script properties and keep your key off the browser.
        </div>
      </div>
    </div>`;

  const ocFromAlias = localStorage.getItem('lm-oc-fromalias') || '';
  const ocFromName = localStorage.getItem('lm-oc-fromname') || '';
  let ocAliasCache = [];
  try { ocAliasCache = JSON.parse(localStorage.getItem('lm-oc-alias-cache') || '[]'); } catch (_) { ocAliasCache = []; }
  const senderOpen = ocUiOpen_('sender', false);
  const senderConfigCard = `
    <div class="card oc-collapse-card ${senderOpen ? 'open' : ''}" style="margin-bottom:0;padding:15px;display:flex;flex-direction:column;gap:8px;">
      <div class="oc-collapse-head" onclick="ocToggleSection('sender')" style="font-family:'Playfair Display',serif;font-size:14px;font-weight:700;color:var(--gold2);display:flex;justify-content:space-between;align-items:center;">
        <span>✉ Open Call Sender</span>
        <span style="display:flex;align-items:center;gap:8px;">
          <span class="oc-collapse-status">${escapeHtml(ocFromAlias || 'your Gmail')}</span>
          <span class="oc-collapse-chevron">${senderOpen ? '▾' : '▸'}</span>
        </span>
      </div>
      <div class="oc-collapse-body" style="display:${senderOpen ? 'flex' : 'none'};flex-direction:column;gap:8px;">
      <div>
        <label style="font-size:9px;color:var(--text3);font-weight:600;display:block;margin-bottom:2px;text-transform:uppercase;">Send emails as</label>
        <input id="oc-from-alias" list="oc-alias-options" placeholder="default: your Gmail" value="${escapeHtml(ocFromAlias)}" oninput="ocSaveSenderConfig()" style="font-size:11px;padding:6px 10px;width:100%;box-sizing:border-box;background:var(--input-bg);color:var(--text);border:1px solid var(--border);border-radius:4px;">
        <datalist id="oc-alias-options">${ocAliasCache.map(a => `<option value="${escapeHtml(a)}"></option>`).join('')}</datalist>
      </div>
      <div>
        <label style="font-size:9px;color:var(--text3);font-weight:600;display:block;margin-bottom:2px;text-transform:uppercase;">Display name (optional)</label>
        <input id="oc-from-name" placeholder="e.g. Lyricalmyrical Books" value="${escapeHtml(ocFromName)}" oninput="ocSaveSenderConfig()" style="font-size:11px;padding:6px 10px;width:100%;box-sizing:border-box;background:var(--input-bg);color:var(--text);border:1px solid var(--border);border-radius:4px;">
      </div>
      <button class="btn sm" onclick="ocLoadSenderAliases()" ${sheetsUrl ? '' : 'disabled'}>↻ Load my Gmail aliases</button>
      <div style="font-size:10px;color:var(--text3);line-height:1.3;">
        Must be a verified Gmail “Send mail as” alias (Gmail → Settings → Accounts). Sending from your own domain keeps SPF/DKIM valid — fewer emails bounce or land in spam — and replies still thread. Leave blank to send from your Gmail.
      </div>
      </div>
    </div>`;

  const sidebarHtml = `
    <div class="oc-sidebar">
      ${projectSwitcher}
      ${summary}
      ${senderConfigCard}
      ${resendConfigCard}
      ${addForm}
    </div>`;

  // Section hero — Playfair title, one-line subtitle, and *actionable* stats:
  // the two queue counts jump straight to their cards when clicked.
  const heroStatsHtml = total ? `
        <div class="oc-hero-stats">
          <div class="oc-hero-stat">
            <div class="oc-hero-stat-num">${total}</div>
            <div class="oc-hero-stat-label">Contributors</div>
          </div>
          <div class="oc-hero-stat ${inboxCount ? 'alert action' : 'dim'}" ${inboxCount ? `onclick="document.querySelector('.oc-inbox-card')?.scrollIntoView({behavior:'smooth'})" title="Scan findings waiting for your approval — click to review"` : 'title="No scan findings waiting"'}>
            <div class="oc-hero-stat-num">${inboxCount}</div>
            <div class="oc-hero-stat-label">To review</div>
          </div>
          <div class="oc-hero-stat ${outboxCount ? 'ready action' : 'dim'}" ${outboxCount ? `onclick="document.querySelector('.oc-outbox-card')?.scrollIntoView({behavior:'smooth'})" title="Next-stage emails queued — click to send"` : 'title="No emails queued"'}>
            <div class="oc-hero-stat-num">${outboxCount}</div>
            <div class="oc-hero-stat-label">Ready to send</div>
          </div>
          <div class="oc-hero-stat">
            <div class="oc-hero-stat-num">${pct}%</div>
            <div class="oc-hero-stat-label">Complete</div>
          </div>
        </div>` : '';
  const heroHtml = `
    <div class="oc-hero">
      <div class="oc-hero-text">
        <div class="oc-hero-title"><span class="header-mark">✦</span>Open Call</div>
        <div class="oc-hero-subtitle">Guide selected contributors from first notice through pre-order — one premium pipeline.</div>
      </div>
      ${heroStatsHtml}
    </div>`;

  // ── Pipeline funnel: who's waiting at each step, one click to filter ──
  // Segment semantics match the stage filter: "next step is X". Clicking a
  // segment filters the list; clicking it again clears the filter.
  const funnelShortLabels = { selectionSent: 'Selection', creditReceived: 'Credit', cmykSent: 'CMYK', filesReceived: 'Files', preorderSent: 'Pre-order' };
  const funnelCounts = OC_STAGES.map(st => ({
    key: st.key,
    label: funnelShortLabels[st.key] || st.label,
    n: listRaw.filter(c => {
      const nx = OC_STAGES.find(s => !c[s.key]);
      return nx && nx.key === st.key;
    }).length,
  }));
  const funnelSeg = (key, label, n, idx) => `
        <button class="oc-funnel-seg ${ocFilterStage === key ? 'active' : ''} ${n ? '' : 'empty'} ${key === 'complete' ? 'complete' : ''}"
          onclick="ocFilterByStage('${ocFilterStage === key ? '' : key}')"
          title="${key === 'complete' ? 'Artists with every stage done' : `Artists whose next step is “${label}”`} — click to ${ocFilterStage === key ? 'clear the filter' : 'filter the list'}">
          <span class="oc-funnel-num">${n}</span>
          <span class="oc-funnel-label">${idx}${label}</span>
          <span class="oc-funnel-bar"><span style="width:${total ? Math.max(n ? 6 : 0, Math.round(n / total * 100)) : 0}%"></span></span>
        </button>`;
  const funnelHtml = total ? `
    <div class="card oc-funnel-card">
      <div class="oc-funnel">
        ${funnelCounts.map((f, i) => funnelSeg(f.key, f.label, f.n, `${i + 1} · `)).join('')}
        ${funnelSeg('complete', 'Complete', done, '✓ ')}
      </div>
    </div>` : '';

  // ── Review inbox: scan findings awaiting the owner's approval ──
  if (activeProj) ocEnsureQueues_(activeProj);
  const inboxItems = activeProj ? activeProj.inbox.filter(p => activeProj.contributors.some(c => c.id === p.contributorId)) : [];
  const inboxTypeLabels = { creditReceived: '✍️ Credit-name reply detected', filesReceived: '📎 High-res files attachment detected', undeliverable: '⚠ Email bounced (undeliverable)' };
  const inboxRows = inboxItems.map(p => {
    const c = activeProj.contributors.find(x => x.id === p.contributorId);
    const threadLink = p.threadId
      ? `<a class="oc-queue-thread-link" href="https://mail.google.com/mail/u/0/#all/${encodeURIComponent(p.threadId)}" target="_blank" rel="noopener" title="Open the detected email in Gmail">✉ View email ↗</a>`
      : '';
    const creditInput = p.type === 'creditReceived'
      ? `<label class="oc-inbox-credit">Credit name to save: <input id="oc-inbox-credit-${p.id}" type="text" value="${escapeHtml(p.creditName || c.creditName || c.name || '')}" placeholder="Exact name for the credits"></label>`
      : '';
    return `
      <div class="oc-queue-row">
        <div class="oc-queue-row-main">
          <div><strong>${escapeHtml(c.name || c.email)}</strong> — ${inboxTypeLabels[p.type] || p.type} ${threadLink}</div>
          ${creditInput}
        </div>
        <div class="oc-queue-row-actions">
          <button class="btn sm gold" onclick="ocApproveProposal('${p.id}')">✓ Approve</button>
          <button class="btn sm" onclick="ocDismissProposal('${p.id}')">✕ Dismiss</button>
        </div>
      </div>`;
  }).join('');
  const inboxHtml = inboxItems.length ? `
    <div class="card oc-queue-card oc-inbox-card">
      <div class="row-between" style="flex-wrap:wrap;gap:8px;">
        <div class="oc-section-title" style="margin:0;">📥 Review scan results · ${inboxItems.length}</div>
        <button class="btn sm gold" onclick="ocApproveAllProposals()">✓ Approve all</button>
      </div>
      <div class="oc-queue-note">Gmail scans propose updates here — nothing changes on a contributor until you approve it.</div>
      ${inboxRows}
    </div>` : '';

  // ── Ready-to-send outbox: next-stage emails queued for one approved batch ──
  const outboxItems = activeProj ? activeProj.outbox.filter(e => activeProj.contributors.some(c => c.id === e.contributorId)) : [];
  const outboxStageLabels = { cmykSent: 'Request Files', preorderSent: 'Pre-order' };
  const outboxDl = localStorage.getItem('lm-oc-last-deadline') || '';
  const outboxRows = outboxItems.map(e => {
    const c = activeProj.contributors.find(x => x.id === e.contributorId);
    const tmpl = activeProj.templates ? activeProj.templates[e.stageKey] : null;
    const subjectPreview = tmpl ? ocMergeTemplate(tmpl.subject, c, { project: activeProj.title, date: outboxDl }) : '(no template saved for this stage)';
    const missing = tmpl ? findUnfilledMergeFields((tmpl.subject || '') + '\n' + (tmpl.body || ''), c, { project: activeProj.title, date: outboxDl }) : [];
    const warn = (!tmpl || missing.length)
      ? `<span class="oc-queue-warn" title="${!tmpl ? 'Save a template for this stage first' : 'Blank template fields: ' + missing.join(', ')}">⚠ ${!tmpl ? 'no template' : 'blank: ' + missing.join(', ')}</span>`
      : '';
    return `
      <div class="oc-queue-row">
        <div class="oc-queue-row-main">
          <div><strong>${escapeHtml(c.name || c.email)}</strong> <span class="oc-queue-stage">${outboxStageLabels[e.stageKey] || e.stageKey}</span> ${warn}</div>
          <div class="oc-queue-subject">${escapeHtml(subjectPreview)}</div>
        </div>
        <div class="oc-queue-row-actions">
          <button class="btn sm gold" onclick="ocComposeStageEmail('${c.id}','${e.stageKey}')">✎ Review & send</button>
          <button class="btn sm" onclick="ocOutboxRemove('${e.id}')">✕ Remove</button>
        </div>
      </div>`;
  }).join('');
  const outboxHtml = outboxItems.length ? `
    <div class="card oc-queue-card oc-outbox-card">
      <div class="row-between" style="flex-wrap:wrap;gap:8px;">
        <div class="oc-section-title" style="margin:0;">📤 Ready to send · ${outboxItems.length}</div>
        <button class="btn sm gold" id="oc-outbox-sendall-btn" onclick="ocOutboxSendAll()">▶ Send all (${outboxItems.length})</button>
      </div>
      <div class="oc-queue-note">Queued automatically when a reply comes in — each uses its stage template and replies into the contributor's thread. Nothing sends until you confirm.<span id="oc-outbox-status" class="oc-queue-status"></span></div>
      ${outboxRows}
    </div>` : '';

  const mainHtml = `
    <div class="oc-main">
      ${heroHtml}
      ${inboxHtml}
      ${outboxHtml}
      ${funnelHtml}
      ${templatesEditor}
      ${searchFilterBar}
      <div style="display:flex;flex-direction:column;gap:14px;">
        ${cards || `
          <div class="card oc-empty-state">
            <div class="oc-empty-icon">🎨</div>
            <div class="oc-empty-title">${ocSearchQuery || ocFilterStage ? 'No matches found' : 'No contributors yet'}</div>
            <div class="oc-empty-body">${ocSearchQuery || ocFilterStage
      ? 'Try adjusting your search or filter to find contributors.'
      : 'Add your first contributor using the form on the left, or import a list from a spreadsheet.'}
            </div>
            ${(!ocSearchQuery && !ocFilterStage) ? `<button class="btn gold" onclick="document.getElementById('oc-name')?.focus()" style="margin-top:4px;">＋ Add First Contributor</button>` : ''}
          </div>`}
      </div>
    </div>`;

  body.innerHTML = `
    <div class="oc-layout">
      ${sidebarHtml}
      ${mainHtml}
    </div>`;

  // Initialize Template Preview
  setTimeout(ocUpdateTmplPreview, 100);

  // Auto-trigger background scan if lastScanned is stale (Next Move #5).
  // With the server-side schedule on, findings pile up while the app is
  // closed, so scan more eagerly (10 min) to surface them in the inbox.
  const now = Date.now();
  const scanStaleMs = sched.enabled ? 10 * 60 * 1000 : 60 * 60 * 1000;
  const lastScannedTime = lastScannedVal ? new Date(lastScannedVal).getTime() : 0;
  if (sheetsUrl && total > 0 && (now - lastScannedTime > scanStaleMs)) {
    setTimeout(() => ocScanReplies({ background: true }), 1000);
  }

  // Once per session, ask the backend whether the scheduled scan is actually
  // armed (the trigger lives in Apps Script — another device may have changed
  // it) and refresh the control if our cached view was stale.
  if (sheetsUrl && !window._ocSchedStatusFetched) {
    window._ocSchedStatusFetched = true;
    ocRefreshScheduleStatus_();
  }
}

let _ocNewContributorPhotos = [];

function ocToggleResend(checked) {
  localStorage.setItem('lm-oc-use-resend', checked ? 'true' : 'false');
  // Turning it on should reveal the key/sender fields even if the card was
  // collapsed — otherwise the checkbox looks like it did nothing.
  if (checked) localStorage.setItem('lm-oc-ui-resend', 'true');
  renderOpenCall();
}

function ocSaveResendConfig() {
  localStorage.setItem('lm-resend-api-key', $('oc-resend-key')?.value?.trim() || '');
  localStorage.setItem('lm-resend-from', $('oc-resend-from')?.value?.trim() || '');
}

function ocSaveSenderConfig() {
  localStorage.setItem('lm-oc-fromalias', $('oc-from-alias')?.value?.trim() || '');
  localStorage.setItem('lm-oc-fromname', $('oc-from-name')?.value?.trim() || '');
}

async function ocFetchMailSenderInfo() {
  if (!sheetsUrl) throw new Error('Google Sheet not connected');
  const res = await fetch(sheetsUrl, {
    method: 'POST', mode: 'cors',
    body: JSON.stringify({ version: 2, action: 'getmailsenderinfo', payload: {} })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

function _ocScheduleCache() {
  try { return JSON.parse(localStorage.getItem('lm-oc-schedule-cache')) || {}; } catch (_) { return {}; }
}

function _ocScheduleCacheSet(data) {
  const cfg = { enabled: !!data.enabled, minutes: parseInt(data.minutes, 10) || 30, digest: !!data.digest };
  localStorage.setItem('lm-oc-schedule-cache', JSON.stringify(cfg));
  return cfg;
}

async function _ocScheduleRequest(op, extra = {}) {
  const res = await fetch(sheetsUrl, {
    method: 'POST', mode: 'cors',
    body: JSON.stringify({ version: 2, action: 'ocschedule', payload: { op, ...extra } })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

function ocSnapshotContributors_() {
  const out = [];
  Object.values(OPENCALL_DATA.projects || {}).forEach(proj => {
    (proj && Array.isArray(proj.contributors) ? proj.contributors : []).forEach(c => {
      if (!c.email) return;
      out.push({
        email: c.email,
        name: c.name || '',
        selectionSent: !!c.selectionSent,
        creditReceived: !!c.creditReceived,
        cmykSent: !!c.cmykSent,
        filesReceived: !!c.filesReceived,
        undeliverable: !!c.undeliverable
      });
    });
  });
  return out;
}

async function ocPushSnapshot_() {
  const res = await fetch(sheetsUrl, {
    method: 'POST', mode: 'cors',
    body: JSON.stringify({ version: 2, action: 'syncopencallsnapshot', payload: { contributors: ocSnapshotContributors_() } })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

let _ocSnapshotTimer = null;

function ocScheduleSnapshotPush_() {
  if (!sheetsUrl || !navigator.onLine || !_ocScheduleCache().enabled) return;
  clearTimeout(_ocSnapshotTimer);
  _ocSnapshotTimer = setTimeout(() => {
    ocPushSnapshot_().catch(e => console.warn('Open call snapshot push failed (next change retries):', e));
  }, 4000);
}

async function ocSetServerSchedule() {
  if (ocBlockedForAuthor_()) return;
  if (!sheetsUrl) { showToast('Connect your Google Sheet first', 'warn'); return; }
  const minutes = parseInt($('oc-sched-interval')?.value || '0', 10);
  const digest = $('oc-sched-digest')?.checked || false;
  const statusEl = $('oc-sched-status');
  if (statusEl) statusEl.textContent = '…';
  try {
    // Fresh snapshot first, so the very first server run scans the right people.
    if (minutes > 0) await ocPushSnapshot_();
    const data = await _ocScheduleRequest('set', { enabled: minutes > 0, minutes: minutes || 30, digest });
    const cfg = _ocScheduleCacheSet(data);
    if (statusEl) statusEl.textContent = cfg.enabled ? '● on' : '';
    showToast(cfg.enabled
      ? `✓ Server auto-scan every ${cfg.minutes} min${cfg.digest ? ' + email digest' : ''} — findings will wait in “Review scan results”`
      : 'Server auto-scan turned off');
  } catch (e) {
    console.error('Failed to update the scheduled scan:', e);
    if (statusEl) statusEl.textContent = '';
    showToast(`⚠ Could not update the schedule: ${e.message}. Make sure the latest Apps Script (v17) is deployed.`, 'err');
    renderOpenCall(); // snap the control back to the real cached state
  }
}

async function ocRefreshScheduleStatus_() {
  try {
    const before = JSON.stringify(_ocScheduleCache());
    const data = await _ocScheduleRequest('status');
    const after = JSON.stringify(_ocScheduleCacheSet(data));
    // Only re-render when the server disagreed with the cache (e.g. the
    // schedule was changed from another device or the trigger was removed).
    if (before !== after && $('oc-sched-interval')) renderOpenCall();
  } catch (_) { /* old script deployed or offline — control just shows the cache */ }
}

async function ocLoadSenderAliases() {
  if (!sheetsUrl) { showToast('Connect your Google Sheet first', 'warn'); return; }
  const btn = $('oc-from-alias') ? document.querySelector('button[onclick="ocLoadSenderAliases()"]') : null;
  const prev = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Loading…'; }
  try {
    const info = await ocFetchMailSenderInfo();
    const aliases = Array.isArray(info.aliases) ? info.aliases : [];
    localStorage.setItem('lm-oc-alias-cache', JSON.stringify(aliases));
    const dl = $('oc-alias-options');
    if (dl) dl.innerHTML = aliases.map(a => `<option value="${escapeHtml(a)}"></option>`).join('');
    if (aliases.length) {
      showToast(`✓ Loaded ${aliases.length} alias${aliases.length === 1 ? '' : 'es'}. Default sender: ${info.primary || 'your Gmail'}`);
    } else {
      showToast(`No verified "Send as" aliases found — emails send from ${info.primary || 'your Gmail'}`);
    }
  } catch (e) {
    showToast(`Could not load aliases: ${e.message}`, 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = prev; }
  }
}

function handleOcPhotoKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    addOcPhotoChip();
  }
}

function addOcPhotoChip() {
  const input = $('oc-photo');
  if (!input) return;
  const val = input.value.trim();
  if (!val) return;

  const items = val.split(/;\s*|,\s*/).map(p => p.trim()).filter(Boolean);
  items.forEach(item => {
    if (!_ocNewContributorPhotos.includes(item)) {
      _ocNewContributorPhotos.push(item);
    }
  });

  input.value = '';
  renderOcPhotoChips();
}

function removeOcPhotoChip(idx) {
  _ocNewContributorPhotos.splice(idx, 1);
  renderOcPhotoChips();
}

function renderOcPhotoChips() {
  const container = $('oc-photo-chips');
  if (!container) return;
  container.innerHTML = _ocNewContributorPhotos.map((p, idx) => `
    <span class="oc-photo-chip">
      📷 ${escapeHtml(p)}
      <span class="oc-photo-chip-remove" onclick="removeOcPhotoChip(${idx})" title="Remove photo">✕</span>
    </span>
  `).join('');
}

async function ocAddPhotoToContributor(cId, photoName) {
  if (!photoName || !photoName.trim()) return;
  const proj = OPENCALL_DATA.projects[OPENCALL_DATA.activeProjectId];
  if (!proj) return;
  const c = proj.contributors.find(x => x.id === cId);
  if (!c) return;

  if (!c.photos) {
    c.photos = c.photo ? c.photo.split(/;\s*|,\s*/).map(p => p.trim()).filter(Boolean) : [];
  }

  const items = photoName.split(/;\s*|,\s*/).map(p => p.trim()).filter(Boolean);
  let added = false;
  items.forEach(item => {
    if (!c.photos.includes(item)) {
      c.photos.push(item);
      added = true;
    }
  });

  if (added) {
    c.photo = c.photos.join(', ');
    await _persistOpenCalls();
    renderOpenCall();
    showToast('Photo added');
  }
}

async function ocRemovePhotoFromContributor(cId, photoIdx) {
  const proj = OPENCALL_DATA.projects[OPENCALL_DATA.activeProjectId];
  if (!proj) return;
  const c = proj.contributors.find(x => x.id === cId);
  if (!c) return;

  if (!c.photos) {
    c.photos = c.photo ? c.photo.split(/;\s*|,\s*/).map(p => p.trim()).filter(Boolean) : [];
  }

  c.photos.splice(photoIdx, 1);
  c.photo = c.photos.join(', ');
  // A removed photo can't stay a starred pick.
  // ⚡ Bolt Optimization: Replace O(N) Array.includes with O(1) Set.has inside filter loop
  const photosSet = new Set(c.photos);
  if (Array.isArray(c.selectedPhotos)) c.selectedPhotos = c.selectedPhotos.filter(p => photosSet.has(p));
  await _persistOpenCalls();
  renderOpenCall();
  showToast('Photo removed');
}

async function ocAdd() {
  if (ocBlockedForAuthor_()) return;
  const name = ($('oc-name')?.value || '').trim();
  const email = ($('oc-email')?.value || '').trim();
  if (!name && !email) { showToast('Enter a name or email', 'warn'); return; }

  const leftoverPhoto = ($('oc-photo')?.value || '').trim();
  let photos = [..._ocNewContributorPhotos];
  if (leftoverPhoto) {
    const items = leftoverPhoto.split(/;\s*|,\s*/).map(p => p.trim()).filter(Boolean);
    items.forEach(item => {
      if (!photos.includes(item)) photos.push(item);
    });
  }

  const photoString = photos.join(', ');

  ocList().push(newContributor({ name, email, photo: photoString, photos, createdAt: today() }));

  if ($('oc-name')) $('oc-name').value = '';
  if ($('oc-email')) $('oc-email').value = '';
  if ($('oc-photo')) $('oc-photo').value = '';

  _ocNewContributorPhotos = [];

  await _persistOpenCalls();
  renderOpenCall();
  showToast('Contributor added');
}

function ocToggleImport() {
  if (ocBlockedForAuthor_()) return;
  ocImportOpen = !ocImportOpen;
  renderOpenCall();
}

async function ocRunImport() {
  if (ocBlockedForAuthor_()) return;
  const raw = ($('oc-import-text')?.value || '').trim();
  if (!raw) { showToast('Paste some rows first', 'warn'); return; }
  const list = ocList();
  const { contributors, added, skipped } = parseContributorRows(raw, list.map(c => c.email));

  if (!added) { showToast(skipped ? 'All rows already imported' : 'Nothing to import', 'warn'); return; }
  contributors.forEach(c => { c.createdAt = today(); list.push(c); });

  await _persistOpenCalls();
  ocImportOpen = false;
  renderOpenCall();
  showToast(`Imported ${added}${skipped ? ` · ${skipped} duplicate${skipped > 1 ? 's' : ''} skipped` : ''}`);
}

async function ocToggle(id, key) {
  if (ocBlockedForAuthor_()) return;
  const c = ocList().find(x => x.id === id);
  if (!c) return;
  c[key] = !c[key];
  ocStamp_(c);
  // A receive-stage ticked on means the next email is ready — queue it in the
  // "Ready to send" outbox so it can go out in one approved batch.
  let queued = 0;
  const proj = OPENCALL_DATA.projects[OPENCALL_DATA.activeProjectId];
  if (proj && c[key] && (key === 'creditReceived' || key === 'filesReceived')) {
    queued = ocQueueNextStep_(proj, c);
  }
  await _persistOpenCalls();
  renderOpenCall();
  // Immediate, non-blocking confirmation so a stage tick is never silent.
  const stageLabel = OC_STAGES.find(st => st.key === key)?.label || 'Stage';
  const who = c.name || c.email || 'contributor';
  showToast(
    c[key]
      ? `${stageLabel} ✓ marked done for ${who}${queued ? ' · next email queued in “Ready to send”' : ''}`
      : `${stageLabel} cleared for ${who}`,
    c[key] ? 'ok' : 'warn'
  );
}

async function ocDelete(id) {
  if (ocBlockedForAuthor_()) return;
  const c = ocList().find(x => x.id === id);
  if (!c) return;
  const ok = await confirmDialog(`Remove ${c.name || c.email || 'this contributor'} from the open call?`, { danger: true, okLabel: 'Remove' });
  if (!ok) return;
  const list = ocList();
  const i = list.findIndex(x => x.id === id);
  if (i !== -1) list.splice(i, 1);
  await _persistOpenCalls();
  renderOpenCall();
}

function ocReadProposalCreditEdit_(p) {
  if (p.type !== 'creditReceived') return;
  const edited = $(`oc-inbox-credit-${p.id}`)?.value;
  if (edited !== undefined) p.creditName = edited.trim();
}

function ocFlashCard_(cId) {
  const cardEl = $(`oc-card-${cId}`);
  if (cardEl) {
    cardEl.classList.add('flash-green');
    setTimeout(() => cardEl.classList.remove('flash-green'), 2000);
  }
}

async function ocApproveProposal(pid) {
  if (ocBlockedForAuthor_()) return;
  const proj = OPENCALL_DATA.projects[OPENCALL_DATA.activeProjectId];
  if (!proj) return;
  ocEnsureQueues_(proj);
  const p = proj.inbox.find(x => x.id === pid);
  if (!p) return;
  const c = proj.contributors.find(x => x.id === p.contributorId);
  proj.inbox = proj.inbox.filter(x => x.id !== pid);
  if (!c) { await _persistOpenCalls(); renderOpenCall(); return; }
  ocReadProposalCreditEdit_(p);
  const summary = ocApplyProposal(c, p);
  ocStamp_(c);
  const queued = ocQueueNextStep_(proj, c);
  await _persistOpenCalls();
  renderOpenCall();
  ocFlashCard_(c.id);
  showToast(`✓ ${c.name || c.email}: ${summary}${queued ? ' · next email queued in “Ready to send”' : ''}`);
}

async function ocDismissProposal(pid) {
  if (ocBlockedForAuthor_()) return;
  const proj = OPENCALL_DATA.projects[OPENCALL_DATA.activeProjectId];
  if (!proj) return;
  ocEnsureQueues_(proj);
  const p = proj.inbox.find(x => x.id === pid);
  if (!p) return;
  // Remember the dismissal so the same detection is never re-proposed.
  proj.inboxDismissed[ocProposalKey(p)] = new Date().toISOString();
  proj.inbox = proj.inbox.filter(x => x.id !== pid);
  await _persistOpenCalls();
  renderOpenCall();
  showToast('Dismissed — this detection won’t be proposed again', 'warn');
}

async function ocApproveAllProposals() {
  if (ocBlockedForAuthor_()) return;
  const proj = OPENCALL_DATA.projects[OPENCALL_DATA.activeProjectId];
  if (!proj) return;
  ocEnsureQueues_(proj);
  if (!proj.inbox.length) return;
  let applied = 0;
  let queued = 0;
  proj.inbox.forEach(p => {
    const c = proj.contributors.find(x => x.id === p.contributorId);
    if (!c) return;
    ocReadProposalCreditEdit_(p);
    ocApplyProposal(c, p);
    ocStamp_(c);
    applied++;
    queued += ocQueueNextStep_(proj, c);
  });
  proj.inbox = [];
  await _persistOpenCalls();
  renderOpenCall();
  showToast(`✓ Approved ${applied} update${applied === 1 ? '' : 's'}${queued ? ` · ${queued} email${queued === 1 ? '' : 's'} queued in “Ready to send”` : ''}`);
}

async function ocOutboxRemove(eid) {
  if (ocBlockedForAuthor_()) return;
  const proj = OPENCALL_DATA.projects[OPENCALL_DATA.activeProjectId];
  if (!proj) return;
  ocEnsureQueues_(proj);
  const e = proj.outbox.find(x => x.id === eid);
  if (!e) return;
  proj.outboxDismissed[ocOutboxKey(e)] = new Date().toISOString();
  proj.outbox = proj.outbox.filter(x => x.id !== eid);
  await _persistOpenCalls();
  renderOpenCall();
  showToast('Removed — this stage won’t re-queue for that contributor', 'warn');
}

let _ocOutboxSendingActive = false;

async function ocOutboxSendAll() {
  if (ocBlockedForAuthor_()) return;
  if (_ocOutboxSendingActive) return;
  const proj = OPENCALL_DATA.projects[OPENCALL_DATA.activeProjectId];
  if (!proj) return;
  ocEnsureQueues_(proj);
  const entries = [...proj.outbox];
  if (!entries.length) return;

  // Resolve every entry up front; rows with blank merge fields or no saved
  // template are held back rather than sent half-filled.
  const dl = localStorage.getItem('lm-oc-last-deadline') || '';
  const ctx = { project: proj.title, date: dl };
  const jobs = [];
  const held = [];
  entries.forEach(e => {
    const c = proj.contributors.find(x => x.id === e.contributorId);
    const tmpl = proj.templates ? proj.templates[e.stageKey] : null;
    if (!c || !c.email) return;
    if (!tmpl) { held.push({ c, why: 'no template saved for this stage' }); return; }
    const missing = findUnfilledMergeFields((tmpl.subject || '') + '\n' + (tmpl.body || ''), c, ctx);
    if (missing.length) { held.push({ c, why: 'blank fields: ' + missing.join(', ') }); return; }
    jobs.push({ e, c, tmpl });
  });

  if (!jobs.length) {
    showToast(held.length ? `Nothing sendable — ${held[0].c.name || held[0].c.email}: ${held[0].why}` : 'Outbox is empty', 'warn');
    return;
  }

  // Same safety gate as the bulk sender: explicit confirm, blank-field
  // hold-backs called out, and the Gmail daily-quota guard.
  let msg = `Send ${jobs.length} queued email${jobs.length === 1 ? '' : 's'} now?\n\nEach uses its stage template and replies into the contributor's existing thread. They go to real inboxes and can't be unsent.`;
  if (held.length) {
    const lines = held.slice(0, 5).map(h => `• ${h.c.name || h.c.email} — ${h.why}`).join('\n');
    msg += `\n\n⚠ ${held.length} will be held back:\n${lines}${held.length > 5 ? '\n…' : ''}\nUse each row's “Review & send” to fix and send those individually.`;
  }
  if (sheetsUrl) {
    try {
      const info = await ocFetchMailSenderInfo();
      const remaining = info.remainingQuota;
      if (typeof remaining === 'number' && jobs.length > remaining) {
        msg += `\n\n⚠ Gmail can send only ${remaining} more email${remaining === 1 ? '' : 's'} today — the last ${jobs.length - remaining} would fail. Send the rest tomorrow.`;
      }
    } catch (_) { /* quota unavailable — proceed without the guard */ }
  }
  const proceed = await confirmDialog(msg, {
    title: 'Confirm send — outbox',
    okLabel: `Send ${jobs.length} email${jobs.length === 1 ? '' : 's'}`,
    cancelLabel: 'Cancel',
    danger: true
  });
  if (!proceed) return;

  _ocOutboxSendingActive = true;
  const btn = $('oc-outbox-sendall-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Sending…'; }
  const statusEl = $('oc-outbox-status');
  const replyTo = localStorage.getItem('lm-oc-replyto') || '';
  let sent = 0;
  let failed = 0;
  try {
    for (let i = 0; i < jobs.length; i++) {
      const { e, c, tmpl } = jobs[i];
      if (statusEl) statusEl.textContent = `Sending ${i + 1}/${jobs.length} — ${c.name || c.email}…`;
      const subject = ocMergeTemplate(tmpl.subject, c, ctx);
      const body = ocMergeTemplate(tmpl.body, c, ctx);
      try {
        const threadId = ocThreadForStage(c, e.stageKey);
        const resp = await sendSingleEmailViaBackend(c.email, subject, body, replyTo, null, threadId, !threadId);
        c[e.stageKey] = true;
        ocStamp_(c);
        const usedThreadId = (resp && resp.threadId) ? resp.threadId : threadId;
        if (usedThreadId) c.gmailThreadId = usedThreadId;
        proj.outbox = proj.outbox.filter(x => x.id !== e.id);
        sent++;
      } catch (err) {
        console.error('Outbox send failed:', err);
        failed++; // entry stays queued for retry
      }
      if (i < jobs.length - 1) await new Promise(r => setTimeout(r, 1000));
    }
  } finally {
    _ocOutboxSendingActive = false;
  }
  await _persistOpenCalls();
  renderOpenCall();
  showToast(
    failed
      ? `Outbox: ✓ ${sent} sent · ✕ ${failed} failed (kept in the queue — retry with “Send all”)`
      : `✓ Outbox: all ${sent} email${sent === 1 ? '' : 's'} sent`,
    failed ? 'warn' : 'ok'
  );
}

function ocCopyEmails() {
  if (ocBlockedForAuthor_()) return;
  const emails = ocList().map(c => c.email).filter(Boolean);
  if (!emails.length) { showToast('No emails to copy', 'warn'); return; }
  const text = emails.join(', ');
  const done = () => showToast(`Copied ${emails.length} email${emails.length > 1 ? 's' : ''}`);
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, () => showToast('Copy failed', 'err'));
  else { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); done(); }
}

function ocSearch(v) { ocSearchQuery = v || ''; renderOpenCall(); }

function ocFilterByStage(v) { ocFilterStage = v || ''; renderOpenCall(); }

// ── ORDER RECORDING

let _lastOcCorrection = '';

function checkOcEmailTypo(val) {
  const suggestEl = $('oc-add-email-correction');
  if (!suggestEl) return;
  const correction = suggestEmailTypo(val);
  if (correction) {
    _lastOcCorrection = correction;
    suggestEl.style.display = 'inline-block';
    suggestEl.className = 'email-suggest-correction';
    suggestEl.innerHTML = `Did you mean <strong style="text-decoration:underline;">${escapeHtml(correction)}</strong>?`;
  } else {
    _lastOcCorrection = '';
    suggestEl.style.display = 'none';
  }
}

function applyOcEmailCorrection() {
  const emailEl = $('oc-email');
  if (emailEl && _lastOcCorrection) {
    emailEl.value = _lastOcCorrection;
    _lastOcCorrection = '';
    const suggestEl = $('oc-add-email-correction');
    if (suggestEl) suggestEl.style.display = 'none';
    showToast('Email corrected!');
  }
}

const OPENCALL_KEY = 'lm-opencalls';
let OPENCALL_DATA = {
  projects: {},
  activeProjectId: ''
};
let ocSearchQuery = '';
let ocFilterStage = '';

async function loadOpenCalls() {
  let data = null;
  data = await window._fbLoadSettings('openCalls');
  if (!data) { try { data = JSON.parse(localStorage.getItem(OPENCALL_KEY)); } catch (_) { } }
  if (data && typeof data === 'object' && data.projects) {
    OPENCALL_DATA = data;
    Object.values(OPENCALL_DATA.projects).forEach(proj => {
      if (proj && Array.isArray(proj.contributors)) {
        proj.contributors.forEach(c => {
          if (c.creditName === undefined) c.creditName = '';
          if (c.notes === undefined) c.notes = '';
          // Heal records created by the old CSV-file import, which skipped
          // newContributor(): give them real stage booleans and a photos array
          // so pipeline toggles and photo chips work on them.
          OC_STAGES.forEach(st => { if (typeof c[st.key] !== 'boolean') c[st.key] = !!c[st.key]; });
          if (!Array.isArray(c.photos)) {
            c.photos = c.photo ? String(c.photo).split(/;\s*|,\s*/).map(p => p.trim()).filter(Boolean) : [];
          }
        });
      }
      ocEnsureQueues_(proj);
    });
  } else {
    OPENCALL_DATA = {
      projects: {
        'default': {
          id: 'default',
          title: 'General Open Call',
          createdAt: today(),
          contributors: []
        }
      },
      activeProjectId: 'default'
    };
  }
  await migrateLegacyOpenCalls();
  updateOpenCallBadges();
}

async function _persistOpenCalls() {
  // Single choke point: whatever changed, queues never keep stale entries
  // (deleted contributors, stages ticked some other way, bounced addresses).
  Object.values(OPENCALL_DATA.projects || {}).forEach(proj => {
    if (!proj || !Array.isArray(proj.contributors)) return;
    ocEnsureQueues_(proj);
    const pruned = ocPruneQueues(proj.contributors, proj.inbox, proj.outbox);
    proj.inbox = pruned.inbox;
    proj.outbox = pruned.outbox;
  });
  await window._fbSaveSettings('openCalls', OPENCALL_DATA);
  try { localStorage.setItem(OPENCALL_KEY, JSON.stringify(OPENCALL_DATA)); } catch (_) { }
  updateOpenCallBadges();
  ocScheduleSnapshotPush_();
}

async function migrateLegacyOpenCalls() {
  let migrated = false;
  const promises = Object.keys(BOOKS).map(async (bid) => {
    const book = BOOKS[bid];
    try {
      const json = await window._fbLoad(bid);
      if (json) {
        const stateObj = JSON.parse(json);
        if (stateObj && Array.isArray(stateObj.openCall) && stateObj.openCall.length > 0) {
          const projId = 'oc-migrated-' + bid;
          let localMigrated = false;
          if (!OPENCALL_DATA.projects[projId]) {
            OPENCALL_DATA.projects[projId] = {
              id: projId,
              title: (book.title || bid) + ' Open Call',
              createdAt: today(),
              contributors: stateObj.openCall
            };
            if (OPENCALL_DATA.activeProjectId === 'default' && OPENCALL_DATA.projects['default'].contributors.length === 0) {
              OPENCALL_DATA.activeProjectId = projId;
            }
            localMigrated = true;
          }
          stateObj.openCall = [];
          await window._fbSave(bid, JSON.stringify(stateObj));
          return localMigrated;
        }
      }
    } catch (_) { }
    return false;
  });

  const results = await Promise.allSettled(promises);
  for (const res of results) {
    if (res.status === 'fulfilled' && res.value) {
      migrated = true;
    }
  }

  if (migrated) {
    if (OPENCALL_DATA.projects['default'] && OPENCALL_DATA.projects['default'].contributors.length === 0 && Object.keys(OPENCALL_DATA.projects).length > 1) {
      delete OPENCALL_DATA.projects['default'];
    }
    await _persistOpenCalls();
  }
}

async function ocCreateProject() {
  const title = prompt('Enter a title for the new Open Call project:');
  if (!title || !title.trim()) return;
  const id = 'oc-proj-' + Date.now().toString(36);
  OPENCALL_DATA.projects[id] = {
    id: id,
    title: title.trim(),
    createdAt: today(),
    contributors: []
  };
  OPENCALL_DATA.activeProjectId = id;
  await _persistOpenCalls();
  renderOpenCall();
  showToast('✓ Project created!');
}

async function ocRenameProject() {
  const current = OPENCALL_DATA.projects[OPENCALL_DATA.activeProjectId];
  if (!current) return;
  const title = prompt('Enter new project title:', current.title);
  if (!title || !title.trim() || title.trim() === current.title) return;
  current.title = title.trim();
  await _persistOpenCalls();
  renderOpenCall();
  showToast('✓ Project renamed!');
}

async function ocDeleteProject() {
  const currentId = OPENCALL_DATA.activeProjectId;
  const current = OPENCALL_DATA.projects[currentId];
  if (!current) return;
  const ok = await confirmDialog(`Are you sure you want to delete project "${current.title}" and all its contributors?`, { danger: true, okLabel: 'Delete' });
  if (!ok) return;

  delete OPENCALL_DATA.projects[currentId];

  const remaining = Object.keys(OPENCALL_DATA.projects);
  if (remaining.length === 0) {
    OPENCALL_DATA.projects['default'] = {
      id: 'default',
      title: 'General Open Call',
      createdAt: today(),
      contributors: []
    };
    OPENCALL_DATA.activeProjectId = 'default';
  } else {
    OPENCALL_DATA.activeProjectId = remaining[0];
  }
  await _persistOpenCalls();
  renderOpenCall();
  showToast('Project deleted');
}

function ocSwitchProject(id) {
  if (!OPENCALL_DATA.projects[id]) return;
  OPENCALL_DATA.activeProjectId = id;
  renderOpenCall();
}

function ocToggleColorPalette(type) {
  const isFore = type === 'fore';
  const el = isFore ? $('oc-forecolor-palette') : $('oc-backcolor-palette');
  const otherEl = isFore ? $('oc-backcolor-palette') : $('oc-forecolor-palette');

  if (otherEl) otherEl.classList.remove('open');
  if (el) el.classList.toggle('open');

  const closePalette = (e) => {
    if (el && !el.contains(e.target) && !e.target.closest('.oc-dropdown-container')) {
      el.classList.remove('open');
      document.removeEventListener('click', closePalette);
    }
  };
  if (el && el.classList.contains('open')) {
    setTimeout(() => document.addEventListener('click', closePalette), 10);
  }
}

function ocApplyColor(type, val) {
  const editor = $('oc-tmpl-body');
  if (!editor) return;

  editor.focus();

  if (type === 'fore') {
    document.execCommand('foreColor', false, val);
  } else {
    document.execCommand('backColor', false, val);
  }

  const el = type === 'fore' ? $('oc-forecolor-palette') : $('oc-backcolor-palette');
  if (el) el.classList.remove('open');

  ocUpdateTmplPreview();
}

function updateOpenCallBadges() {
  let count = 0;
  if (OPENCALL_DATA && OPENCALL_DATA.projects) {
    Object.values(OPENCALL_DATA.projects).forEach(proj => {
      if (proj && Array.isArray(proj.contributors)) {
        proj.contributors.forEach(c => {
          if (c.email && !_isCustomerSuppressed(c.email)) {
            if (c.creditReceived && !c.cmykSent) count++;
            else if (c.filesReceived && !c.preorderSent) count++;
          }
        });
      }
      // Scan findings waiting for approval are also "waiting on you".
      if (proj && Array.isArray(proj.inbox)) count += proj.inbox.length;
    });
  }

  const badgeEl = $('oc-nav-badge');
  if (badgeEl) {
    if (count > 0) {
      badgeEl.textContent = count;
      badgeEl.style.display = 'inline-flex';
    } else {
      badgeEl.style.display = 'none';
    }
  }

  const hdrBadgeEl = $('oc-hdr-badge');
  if (hdrBadgeEl) {
    if (count > 0) {
      hdrBadgeEl.textContent = count;
      hdrBadgeEl.style.display = 'inline-flex';
    } else {
      hdrBadgeEl.style.display = 'none';
    }
  }
}

async function ocApplyParsedImport_(parsed, sourceLabel) {
  const { contributors, added, skipped } = parsed;
  if (!added) {
    showToast(skipped
      ? `All ${skipped} row${skipped === 1 ? ' is' : 's are'} already in this project — nothing to import`
      : `No importable rows found in ${sourceLabel}`, 'warn');
    return;
  }
  const names = contributors.slice(0, 8).map(c =>
    `• ${c.name || c.email}${c.creditName && c.creditName !== c.name ? ` — credit “${c.creditName}”` : ''}`);
  const more = added > 8 ? `\n…and ${added - 8} more` : '';
  const ok = await confirmDialog(
    `Import ${added} contributor${added === 1 ? '' : 's'} from ${sourceLabel}?` +
    `${skipped ? `\n${skipped} duplicate${skipped === 1 ? '' : 's'} will be skipped.` : ''}\n\n${names.join('\n')}${more}`,
    { title: 'Confirm import', okLabel: `Import ${added}`, cancelLabel: 'Cancel' }
  );
  if (!ok) return;
  const list = ocList();
  contributors.forEach(c => { c.createdAt = today(); list.push(c); });
  await _persistOpenCalls();
  ocImportOpen = false;
  renderOpenCall();
  showToast(`✓ Imported ${added}${skipped ? ` · ${skipped} duplicate${skipped === 1 ? '' : 's'} skipped` : ''}`);
}

function handleOcCsvFile(file) {
  if (!file || ocBlockedForAuthor_()) return;
  const fname = (file.name || '').toLowerCase();
  const isExcel = /\.(xlsx|xls)$/.test(fname);
  const reader = new FileReader();
  reader.onload = async function (e) {
    try {
      let text;
      if (isExcel) {
        // Same SheetJS global the sales-import path uses (loaded in index.html).
        if (typeof XLSX === 'undefined') {
          showToast('Excel support needs an internet connection to load — save the file as .csv and retry', 'err');
          return;
        }
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        text = XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]);
      } else {
        text = e.target.result;
      }
      const parsed = parseContributorRows(text, ocList().map(c => c.email));
      await ocApplyParsedImport_(parsed, file.name || 'the file');
    } catch (err) {
      console.error('Contributor file import failed:', err);
      showToast(`⚠ Could not read ${file.name || 'the file'}: ${err.message}`, 'err');
    }
  };
  if (isExcel) reader.readAsArrayBuffer(file);
  else reader.readAsText(file);
}

function triggerOcCsvUpload() {
  $('oc-csv-file-input')?.click();
}

function handleOcCsvUpload(input) {
  const file = input.files?.[0];
  if (file) handleOcCsvFile(file);
  input.value = ''; // allow re-selecting the same file after a cancel
}

function handleOcCsvDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  e.currentTarget.style.borderColor = 'var(--gold)';
  e.currentTarget.style.background = 'rgba(200, 145, 58, 0.06)';
}

function handleOcCsvDragLeave(e) {
  e.preventDefault();
  e.stopPropagation();
  e.currentTarget.style.borderColor = 'var(--border2)';
  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.01)';
}

function handleOcCsvDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  e.currentTarget.style.borderColor = 'var(--border2)';
  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.01)';

  const file = e.dataTransfer?.files?.[0];
  if (file && /\.(csv|xlsx|xls)$/.test(file.name.toLowerCase())) {
    handleOcCsvFile(file);
  } else {
    showToast('Please upload a .csv or Excel (.xlsx) file', 'warn');
  }
}

function ocComposeStageEmail(cId, stageKey) {
  const proj = OPENCALL_DATA.projects[OPENCALL_DATA.activeProjectId];
  if (!proj) return;
  const c = proj.contributors.find(x => x.id === cId);
  if (!c || !c.email) return;

  let subject = '';
  let body = '';

  const tmpl = (proj.templates && proj.templates[stageKey]) || null;
  if (tmpl) {
    let dl = '';
    if (tmpl.subject.includes('{{date}}') || tmpl.body.includes('{{date}}')) {
      dl = prompt('Enter a deadline date for this email (e.g. July 15th):', localStorage.getItem('lm-oc-last-deadline') || 'July 15th');
      if (dl === null) return; // Cancelled
      if (dl) localStorage.setItem('lm-oc-last-deadline', dl);
    }

    subject = ocMergeTemplate(tmpl.subject, c, { project: proj.title, date: dl || 'July 15th' });
    body = ocMergeTemplate(tmpl.body, c, { project: proj.title, date: dl || 'July 15th' });
  } else {
    if (stageKey === 'selectionSent') {
      subject = `[Selected] Lyricalmyrical Collective Open Call`;
      body = `Hi ${c.name || 'Artist'},\n\nCongratulations! Your work has been selected from our open call to be featured in our upcoming project. We're thrilled to include you!\n\nWe are now entering the layout phase and require one initial piece of info:\n1. The exact name you want to use in the credit index.\n\nPlease reply to this email to let us know.\n\nWarm regards,\nLyricalmyrical Books`;
    } else if (stageKey === 'cmykSent') {
      subject = `[Files Requested] Lyricalmyrical Open Call - ${proj.title}`;
      body = `Hi ${c.name || 'Artist'},\n\nWe are now preparing the print-ready files and require your high-resolution artwork.\n\nPlease send us your files (CMYK profile, 300 DPI, with 3mm bleed) as soon as possible.\n\nThank you again!\n\nWarm regards,\nLyricalmyrical Books`;
    } else if (stageKey === 'preorderSent') {
      subject = `[Pre-orders Open] Lyricalmyrical Collective Project - ${proj.title}`;
      body = `Hi ${c.name || 'Artist'},\n\nWe are thrilled to announce that pre-orders for the collective project are now officially open!\n\nAs selected contributor, you receive a special 50% discount on any number of copies. Use code LMBCOLLECTIVE at checkout:\nhttps://www.lyricalmyricalbooks.com/product/collective-photobook\n\nThank you for being part of this project!\n\nWarm regards,\nLyricalmyrical Books`;
    } else {
      subject = `Regarding Open Call - ${proj.title}`;
      body = `Hi ${c.name || 'Artist'},\n\n...`;
    }
  }

  openOcEmailPreviewModal(cId, stageKey, subject, body, c);
}

function openOcEmailPreviewModal(cId, stageKey, subject, body, c) {
  window._ocPreviewSubject = subject;
  window._ocPreviewBody = body;

  $('oc-email-preview-modal')?.remove();

  const availableThreadId = c.gmailThreadId || (stageKey === 'cmykSent' ? c.creditThreadId : stageKey === 'preorderSent' ? c.filesThreadId : null);

  const modal = document.createElement('div');
  modal.id = 'oc-email-preview-modal';
  modal.className = 'modal-backdrop';
  modal.style.display = 'flex';
  modal.style.alignItems = 'center';
  modal.style.justifyContent = 'center';
  modal.style.position = 'fixed';
  modal.style.inset = '0';
  modal.style.background = 'rgba(0,0,0,0.6)';
  modal.style.backdropFilter = 'blur(4px)';
  modal.style.zIndex = '1000';

  modal.innerHTML = `
    <div class="card" style="max-width:650px;width:90%;margin:0 auto;display:flex;flex-direction:column;box-shadow:var(--shadow2);border:1px solid var(--border);">
      <div class="row-between" style="border-bottom:1px solid var(--border);padding:14px 20px;background:var(--cream2);">
        <div style="font-family:'Playfair Display',serif;font-size:16px;font-weight:700;color:var(--gold2);">✉ Review Email to ${escapeHtml(c.name)}</div>
        <button class="btn sm" onclick="closeOcEmailPreviewModal()" style="padding:4px 8px;font-size:12px;">✕</button>
      </div>
      
      <div style="padding:20px;display:flex;flex-direction:column;gap:12px;max-height:60vh;overflow-y:auto;">
        <div style="background:var(--cream2);border:1px solid var(--border);border-radius:6px;padding:12px;display:flex;flex-direction:column;gap:6px;font-size:13px;text-align:left;">
          <div><strong>To:</strong> ${escapeHtml(c.name)} &lt;${escapeHtml(c.email)}&gt;</div>
          <div style="border-top:1px solid var(--border);padding-top:6px;word-break:break-all;"><strong>Subject:</strong> ${escapeHtml(subject)}</div>
        </div>
        
        <div style="font-size:11px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:0.04em;text-align:left;">Email Body Preview</div>
        <div style="background:#ffffff;color:#000000;border:1px solid var(--border);border-radius:6px;padding:20px;min-height:180px;overflow-y:auto;font-family:'Inter',sans-serif;font-size:14px;line-height:1.6;text-align:left;box-shadow:inset 0 1px 3px rgba(0,0,0,0.05);">
          ${body}
        </div>

        <div style="display:flex;flex-direction:column;gap:6px;margin-top:6px;text-align:left;border-top:1px solid var(--border);padding-top:12px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <input type="checkbox" id="oc-preview-reply-thread" ${availableThreadId ? 'checked' : ''} onchange="document.getElementById('oc-preview-thread-input-container').style.display = this.checked ? 'block' : 'none'" style="cursor:pointer;margin:0;">
            <label for="oc-preview-reply-thread" style="font-size:13px;color:var(--text2);cursor:pointer;user-select:none;font-weight:600;">
              Reply to an email thread instead of starting a new email
            </label>
          </div>
          <div id="oc-preview-thread-input-container" style="display:${availableThreadId ? 'block' : 'none'};margin-left:22px;">
            <input id="oc-preview-thread-id" type="text" placeholder="Gmail Thread ID (e.g. 18f8c4a9d7e3b2a1)" value="${availableThreadId || ''}" style="width:100%;max-width:300px;padding:6px 10px;font-size:12px;background:var(--input-bg);color:var(--text);border:1px solid var(--border);border-radius:4px;box-sizing:border-box;font-family:monospace;">
            <span style="font-size:10px;color:var(--text3);display:block;margin-top:2px;">
              Replies to this thread via GmailApp (requires Google Sheets/Webhook connection).
            </span>
          </div>
        </div>
      </div>
      
      <div class="row-between" style="border-top:1px solid var(--border);padding:14px 20px;background:var(--cream2);justify-content:flex-end;gap:8px;">
        <button class="btn" onclick="closeOcEmailPreviewModal()">Cancel</button>
        <button class="btn" onclick="ocPreviewModalEditInWizard('${cId}', '${stageKey}')">Edit in Wizard</button>
        <button id="oc-preview-send-btn" class="btn gold" onclick="ocPreviewModalSend('${cId}', '${stageKey}')" style="font-weight:700;">Send Email</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
}

function closeOcEmailPreviewModal() {
  $('oc-email-preview-modal')?.remove();
}

async function ocPreviewModalSend(cId, stageKey) {
  const proj = OPENCALL_DATA.projects[OPENCALL_DATA.activeProjectId];
  if (!proj) return;
  const c = proj.contributors.find(x => x.id === cId);
  if (!c || !c.email) return;

  // Safety gate: confirm the real send so a stray click on "Send Email" can't
  // fire a live message. Danger-styled so Cancel is focused.
  const stageLabelMap = { selectionSent: 'Selection Notice', cmykSent: 'Request Files', preorderSent: 'Pre-order Info' };
  const okToSend = await confirmDialog(
    `Send this ${stageLabelMap[stageKey] || 'pipeline'} email to ${c.name || c.email} <${c.email}> now?\n\nIt goes to a real inbox and can't be unsent.`,
    { title: 'Confirm send', okLabel: 'Send email', cancelLabel: 'Cancel', danger: true }
  );
  if (!okToSend) return;

  const subject = window._ocPreviewSubject;
  const htmlBody = window._ocPreviewBody;
  const plainBody = htmlBody.replace(/<[^>]*>/g, '');
  const replyTo = localStorage.getItem('lm-oc-replyto') || '';

  const replyThread = $('oc-preview-reply-thread')?.checked || false;
  const threadId = replyThread ? ($('oc-preview-thread-id')?.value || '').trim() : null;
  // Not replying into an existing thread = we're starting a new one; ask the
  // backend to remember it so every later stage replies into the same thread.
  const captureThread = !threadId;

  const sendBtn = $('oc-preview-send-btn');
  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<span class="spinner" style="width:10px;height:10px;margin-right:4px;"></span>Sending...';
  }

  try {
    const resp = await sendSingleEmailViaBackend(c.email, subject, plainBody, replyTo, htmlBody, threadId, captureThread);
    c[stageKey] = true;
    ocStamp_(c);
    // Promote whichever thread this email used to the contributor's canonical
    // thread, so every subsequent stage email lands in the same conversation.
    const usedThreadId = (resp && resp.threadId) ? resp.threadId : threadId;
    if (usedThreadId) c.gmailThreadId = usedThreadId;
    await _persistOpenCalls();
    closeOcEmailPreviewModal();
    renderOpenCall();
    showToast(`✓ Email sent successfully to ${c.name}!`);
  } catch (err) {
    console.error('Failed to send stage email:', err);
    showToast(`✕ Failed to send email: ${err.message}`, 'err');
  } finally {
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.textContent = 'Send Email';
    }
  }
}

function ocPreviewModalEditInWizard(cId, _stageKey) {
  const proj = OPENCALL_DATA.projects[OPENCALL_DATA.activeProjectId];
  if (!proj) return;
  const c = proj.contributors.find(x => x.id === cId);
  if (!c || !c.email) return;

  const subject = window._ocPreviewSubject;
  const htmlBody = window._ocPreviewBody;

  closeOcEmailPreviewModal();

  switchTab('customers');
  switchCustomersSubTab('campaign');

  openCampaignWizard({
    email: c.email,
    subject: subject,
    body: htmlBody,
    title: `Compose Pipeline Email (${c.email})`
  });
}

async function ocScanReplies(options = {}) {
  if (!sheetsUrl) {
    if (!options.background) showToast('Connect your Google Sheet first to scan replies', 'warn');
    return;
  }

  const proj = OPENCALL_DATA.projects[OPENCALL_DATA.activeProjectId];
  if (!proj || !proj.contributors.length) {
    if (!options.background) showToast('No contributors in this project to scan', 'warn');
    return;
  }

  const btn = $('oc-scan-btn');
  const prevText = btn ? btn.textContent : '';
  if (!options.background && btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>Scanning…';
  }

  const daysBack = parseInt($('oc-scan-days')?.value || 120, 10);

  try {
    const payload = {
      version: 2,
      action: 'scanopencallreplies',
      payload: {
        daysBack: daysBack,
        contributors: proj.contributors.map(c => ({
          email: c.email,
          selectionSent: !!c.selectionSent,
          creditReceived: !!c.creditReceived,
          cmykSent: !!c.cmykSent,
          filesReceived: !!c.filesReceived,
          undeliverable: !!c.undeliverable
        }))
      }
    };

    const res = await fetch(sheetsUrl, {
      method: 'POST',
      mode: 'cors',
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    const updates = data.updates || [];

    // Findings are no longer applied silently — they become proposals in the
    // Review inbox, and stage flags only flip when the owner approves them.
    ocEnsureQueues_(proj);
    const proposals = ocProposalsFromScan(updates, proj.contributors, proj.inbox, proj.inboxDismissed);
    proj.inbox.push(...proposals);

    // Always update lastScanned timestamp on successful scan
    proj.lastScanned = new Date().toISOString();
    await _persistOpenCalls();
    renderOpenCall();

    if (proposals.length > 0) {
      const n = proposals.length;
      if (options.background) {
        showToast(`📥 Scan found ${n} update${n === 1 ? '' : 's'} — review & approve in Open Call`);
      } else {
        const summaryDetails = proposals.map(p => {
          const c = proj.contributors.find(x => x.id === p.contributorId);
          return `• ${c ? (c.name || c.email) : '?'}: ${ocProposalSummary(p)}`;
        });
        await confirmDialog(
          `Gmail scan found ${n} update${n === 1 ? '' : 's'}.\n\nNothing has been applied yet — approve ${n === 1 ? 'it' : 'them'} in “Review scan results”:\n` +
          summaryDetails.join('\n')
        );
      }
    } else {
      if (!options.background) {
        showToast('Scan complete: no new replies found');
      }
    }
  } catch (e) {
    console.error('Failed to scan open call replies:', e);
    if (!options.background) showToast(`⚠ Scan failed: ${e.message}`, 'err');
  } finally {
    if (!options.background && btn) {
      btn.disabled = false;
      btn.textContent = prevText;
    }
  }
}

let _ocSubmissionResults = [];

function openOcImportGmailModal() {
  if (!sheetsUrl) { showToast('Connect your Google Sheet first to import from Gmail', 'warn'); return; }
  const proj = OPENCALL_DATA.projects[OPENCALL_DATA.activeProjectId];
  if (!proj) { showToast('No active open call project', 'warn'); return; }

  _ocSubmissionResults = [];
  let modal = $('oc-import-gmail-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'oc-import-gmail-modal';
    modal.style.position = 'fixed';
    modal.style.inset = '0';
    modal.style.background = 'rgba(0,0,0,0.75)';
    modal.style.backdropFilter = 'blur(8px)';
    modal.style.display = 'none';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '10000';
    modal.onclick = closeOcImportGmailModal;
    document.body.appendChild(modal);
  }
  modal.style.display = 'flex';
  renderOcImportGmailModal();
}

function closeOcImportGmailModal() {
  const modal = $('oc-import-gmail-modal');
  if (modal) modal.style.display = 'none';
}

function renderOcImportGmailModal() {
  const modal = $('oc-import-gmail-modal');
  if (!modal) return;
  const lastQuery = localStorage.getItem('lm-oc-submission-query') || 'subject:(open call)';
  const lastDays = localStorage.getItem('lm-oc-submission-days') || '120';

  const resultsHtml = _ocSubmissionResults.length > 0
    ? `<div style="display:flex;gap:6px;margin:10px 0 6px;">
         <button type="button" class="btn sm" onclick="ocImportGmailSelectAll(true)">Select All</button>
         <button type="button" class="btn sm" onclick="ocImportGmailSelectAll(false)">Deselect All</button>
         <span style="font-size:11px;color:var(--text3);margin-left:auto;align-self:center;">${_ocSubmissionResults.length} found</span>
       </div>` +
    _ocSubmissionResults.map((s, idx) => {
      const n = (s.photos || []).length;
      const list = n ? ': ' + escapeHtml(s.photos.slice(0, 5).join(', ')) + (n > 5 ? ' …' : '') : '';
      return `
        <label style="display:flex;align-items:flex-start;gap:8px;font-size:12px;color:var(--text);cursor:pointer;padding:6px 4px;border-bottom:1px solid var(--border);">
          <input type="checkbox" class="oc-sub-check" value="${idx}" checked style="margin-top:2px;cursor:pointer;">
          <span style="flex:1;">
            <strong>${escapeHtml(s.name || '—')}</strong> <span style="color:var(--text3);">&lt;${escapeHtml(s.email)}&gt;</span><br>
            <span style="color:var(--text3);font-size:11px;">${n} attachment${n === 1 ? '' : 's'}${list}</span>
          </span>
        </label>`;
    }).join('')
    : '<div style="font-size:12px;color:var(--text3);font-style:italic;padding:10px 0;">Run a search to find submission emails. New contributors are matched by sender; anyone already in this project is skipped.</div>';

  modal.innerHTML = `
    <div class="card" style="width:94%;max-width:620px;max-height:90vh;overflow-y:auto;padding:24px;position:relative;" onclick="event.stopPropagation()">
      <button onclick="closeOcImportGmailModal()" style="position:absolute;top:15px;right:15px;background:transparent;border:none;color:var(--text3);font-size:18px;cursor:pointer;">✕</button>
      <div style="font-family:'Playfair Display',serif;font-size:20px;font-weight:700;color:var(--gold2);margin-bottom:4px;">📨 Import Submissions from Gmail</div>
      <div style="font-size:12px;color:var(--text3);margin-bottom:16px;">Find the artists' original submission emails and add them as contributors — each one's thread is captured so every stage email replies into it.</div>

      <label style="font-size:10px;color:var(--text3);font-weight:600;text-transform:uppercase;display:block;margin-bottom:4px;">Gmail search</label>
      <input id="oc-sub-query" value="${escapeHtml(lastQuery)}" placeholder='e.g. label:open-call  or  subject:"open call submission"' style="width:100%;box-sizing:border-box;font-family:monospace;font-size:12px;padding:9px 11px;">
      <div style="display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap;">
        <select id="oc-sub-days" style="font-size:12px;">
          <option value="30" ${lastDays === '30' ? 'selected' : ''}>Last 30 days</option>
          <option value="60" ${lastDays === '60' ? 'selected' : ''}>Last 60 days</option>
          <option value="120" ${lastDays === '120' ? 'selected' : ''}>Last 120 days</option>
          <option value="365" ${lastDays === '365' ? 'selected' : ''}>Last 12 months</option>
        </select>
        <button class="btn sm gold" id="oc-sub-search-btn" onclick="ocImportGmailSearch()">🔍 Search Gmail</button>
      </div>

      <div id="oc-sub-results" style="margin-top:12px;max-height:38vh;overflow-y:auto;">${resultsHtml}</div>

      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;border-top:1px solid var(--border);padding-top:14px;">
        <button class="btn" onclick="closeOcImportGmailModal()">Close</button>
        <button class="btn gold" id="oc-sub-import-btn" onclick="ocImportGmailConfirm()" ${_ocSubmissionResults.length ? '' : 'disabled'}>Import Selected</button>
      </div>
    </div>`;
}

async function ocImportGmailSearch() {
  const proj = OPENCALL_DATA.projects[OPENCALL_DATA.activeProjectId];
  if (!proj) return;
  const query = ($('oc-sub-query')?.value || '').trim();
  if (!query) { showToast('Enter a Gmail search first', 'warn'); return; }
  const daysBack = parseInt($('oc-sub-days')?.value || '120', 10);
  localStorage.setItem('lm-oc-submission-query', query);
  localStorage.setItem('lm-oc-submission-days', String(daysBack));

  const btn = $('oc-sub-search-btn');
  const prev = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Searching…'; }
  try {
    const payload = {
      version: 2,
      action: 'scanopencallsubmissions',
      payload: {
        query,
        daysBack,
        existingEmails: proj.contributors.map(c => c.email).filter(Boolean)
      }
    };
    const res = await fetch(sheetsUrl, { method: 'POST', mode: 'cors', body: JSON.stringify(payload) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    _ocSubmissionResults = data.submissions || [];
    renderOcImportGmailModal();
    if (_ocSubmissionResults.length === 0) showToast('No new submissions matched that search');
  } catch (e) {
    showToast(`⚠ Search failed: ${e.message}`, 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = prev; }
  }
}

function ocImportGmailSelectAll(checked) {
  document.querySelectorAll('.oc-sub-check').forEach(cb => { cb.checked = checked; });
}

async function ocImportGmailConfirm() {
  const proj = OPENCALL_DATA.projects[OPENCALL_DATA.activeProjectId];
  if (!proj) return;
  const picked = Array.from(document.querySelectorAll('.oc-sub-check:checked'))
    .map(cb => _ocSubmissionResults[parseInt(cb.value, 10)])
    .filter(Boolean);
  if (picked.length === 0) { showToast('No submissions selected', 'warn'); return; }

  const existing = new Set(proj.contributors.map(c => (c.email || '').toLowerCase()).filter(Boolean));
  let added = 0;
  picked.forEach(s => {
    const key = (s.email || '').toLowerCase();
    if (!key || existing.has(key)) return;   // never duplicate an existing contributor
    existing.add(key);
    const c = newContributor({
      name: s.name || '',
      email: s.email || '',
      photos: Array.isArray(s.photos) ? s.photos : [],
      createdAt: today(),
      notes: s.subject ? ('Imported from Gmail — ' + s.subject) : 'Imported from Gmail'
    });
    if (s.threadId) c.gmailThreadId = s.threadId;   // canonical thread for every stage
    proj.contributors.push(c);
    added++;
  });

  await _persistOpenCalls();
  closeOcImportGmailModal();
  renderOpenCall();
  if (added > 0) {
    await confirmDialog(`Imported ${added} submission${added === 1 ? '' : 's'} from Gmail.\n\nEach contributor's submission thread was captured, so every stage email will reply into that same conversation.`, { title: 'Import complete', okLabel: 'Great', cancelLabel: 'Close' });
  } else {
    showToast('Nothing imported — those contributors already exist');
  }
}

async function ocScanRepliesSingle(cId) {
  if (!sheetsUrl) {
    showToast('Connect your Google Sheet first to scan replies', 'warn');
    return;
  }

  const proj = OPENCALL_DATA.projects[OPENCALL_DATA.activeProjectId];
  if (!proj) return;
  const c = proj.contributors.find(x => x.id === cId);
  if (!c || !c.email) {
    showToast('Contributor email not found', 'warn');
    return;
  }

  const btn = $(`oc-scan-single-${cId}`);
  const prevText = btn ? btn.textContent : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';
  }

  const daysBack = parseInt($('oc-scan-days')?.value || 120, 10);

  try {
    const payload = {
      version: 2,
      action: 'scanopencallreplies',
      payload: {
        daysBack: daysBack,
        contributors: [{
          email: c.email,
          selectionSent: !!c.selectionSent,
          creditReceived: !!c.creditReceived,
          cmykSent: !!c.cmykSent,
          filesReceived: !!c.filesReceived,
          undeliverable: !!c.undeliverable
        }]
      }
    };

    const res = await fetch(sheetsUrl, {
      method: 'POST',
      mode: 'cors',
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    const updates = data.updates || [];

    // Same approval flow as the bulk scan: findings land in the Review inbox
    // instead of flipping the contributor's stage flags directly.
    ocEnsureQueues_(proj);
    const proposals = ocProposalsFromScan(updates, [c], proj.inbox, proj.inboxDismissed);
    if (proposals.length > 0) {
      proj.inbox.push(...proposals);
      await _persistOpenCalls();
      renderOpenCall();
      showToast(`📥 ${c.name || c.email}: ${proposals.map(ocProposalSummary).join(' & ')} — approve in “Review scan results”`);
    } else {
      showToast(`No new replies found for ${c.name || c.email}`);
    }
  } catch (e) {
    console.error('Failed to scan single open call reply:', e);
    showToast(`⚠ Scan failed: ${e.message}`, 'err');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = prevText;
    }
  }
}

async function ocToggleInlineThread(cId, threadId, title) {
  const container = $(`oc-inline-thread-${cId}`);
  if (!container) return;

  if (container.style.display === 'block' && container.dataset.currentThreadId === threadId) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';
  container.dataset.currentThreadId = threadId;
  container.innerHTML = `
    <div style="display:flex;align-items:center;gap:6px;color:var(--text3);font-style:italic;padding:8px 0;">
      <span class="spinner"></span> Loading ${title}...
    </div>`;

  if (!sheetsUrl) {
    container.innerHTML = `<div style="color:var(--red);padding:4px 0;">Connect Google Sheets first to preview Gmail threads.</div>`;
    return;
  }

  try {
    const destUrl = sheetsUrl + (sheetsUrl.includes('?') ? '&' : '?') + 'action=getThreadContent&threadId=' + threadId;
    const res = await fetch(destUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    if (!data.messages || data.messages.length === 0) {
      container.innerHTML = `<div style="color:var(--text3);font-style:italic;padding:4px 0;">No messages found in this thread.</div>`;
      return;
    }

    const msgsHtml = data.messages.map((msg, idx) => {
      const isMe = msg.from.toLowerCase().includes('lyricalmyrical') || msg.from.toLowerCase().includes('me');
      const dateStr = formatDateTime(msg.date);
      return `
        <div style="margin-bottom:12px;border-bottom:1px solid rgba(255,255,255,0.05);padding-bottom:8px;${idx === data.messages.length - 1 ? 'border-bottom:none;margin-bottom:0;padding-bottom:0;' : ''}">
          <div class="row-between" style="font-size:11px;color:var(--text3);margin-bottom:4px;">
            <strong style="${isMe ? 'color:var(--gold2);' : ''}">${escapeHtml(msg.from)}</strong>
            <span>${dateStr}</span>
          </div>
          <div style="white-space:pre-wrap;line-height:1.5;color:var(--text2);font-family:inherit;background:rgba(255,255,255,0.01);padding:6px;border-radius:4px;border:1px solid rgba(255,255,255,0.02);">${escapeHtml(msg.body)}</div>
          ${msg.attachments && msg.attachments.length > 0 ? `
            <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;">
              ${msg.attachments.map(att => `
                <button type="button" class="pill gray" style="font-size:10px;padding:2px 6px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:var(--text2);cursor:pointer;display:inline-flex;align-items:center;gap:4px;" onclick="downloadOcAttachment('${msg.id}', '${escapeHtml(att.name)}', this)" title="Click to download attachment">
                  📎 ${escapeHtml(att.name)} (${Math.round(att.size / 1024)} KB)
                </button>
              `).join('')}
            </div>
          ` : ''}
        </div>`;
    }).join('');

    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border);padding-bottom:6px;margin-bottom:10px;">
        <strong style="color:var(--gold2);text-transform:uppercase;font-size:10px;letter-spacing:0.05em;">✉ ${title} Preview</strong>
        <button class="btn sm" onclick="document.getElementById('oc-inline-thread-${cId}').style.display='none'" style="padding:0 8px;height:20px;font-size:10px;margin:0;">Hide</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px;">
        ${msgsHtml}
      </div>`;
  } catch (err) {
    console.error('Failed to fetch Gmail thread:', err);
    container.innerHTML = `<div style="color:var(--red);padding:4px 0;">✕ Error: ${escapeHtml(err.message)}</div>`;
  }
}

function openOcEditModal(cId) {
  let modal = $('oc-edit-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'oc-edit-modal';
    modal.style.position = 'fixed';
    modal.style.inset = '0';
    modal.style.background = 'rgba(0, 0, 0, 0.75)';
    modal.style.backdropFilter = 'blur(8px)';
    modal.style.display = 'none';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '10000';
    document.body.appendChild(modal);
  }

  modal.style.display = 'flex';
  renderOcEditModalContent(cId);
}

function closeOcEditModal() {
  const modal = $('oc-edit-modal');
  if (modal) modal.style.display = 'none';
}

function renderOcEditModalContent(cId) {
  const modal = $('oc-edit-modal');
  if (!modal) return;

  const proj = OPENCALL_DATA.projects[OPENCALL_DATA.activeProjectId];
  if (!proj) return;
  const c = proj.contributors.find(x => x.id === cId);
  if (!c) return;

  modal.innerHTML = `
    <div class="card" style="width:94%;max-width:500px;background:var(--card-bg, #fff);border:1px solid var(--border);border-radius:var(--r3);padding:24px;box-shadow:0 20px 60px rgba(0,0,0,0.4);position:relative;" onclick="event.stopPropagation()">
      <button onclick="closeOcEditModal()" style="position:absolute;top:15px;right:15px;background:transparent;border:none;color:var(--text3);font-size:18px;cursor:pointer;line-height:1;">✕</button>
      
      <div style="font-family:'Playfair Display',serif;font-size:20px;font-weight:700;color:var(--gold2);margin-bottom:4px;">✎ Edit Contributor</div>
      <div style="font-size:12px;color:var(--text3);margin-bottom:18px;">Update artist details and internal notes.</div>
      
      <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:20px;">
        <div>
          <label style="font-size:11px;color:var(--text3);font-weight:600;display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.04em;">Artist Name</label>
          <input id="oc-edit-name" type="text" value="${escapeHtml(c.name || '')}" style="width:100%;padding:8px 12px;font-size:13px;background:var(--input-bg);color:var(--text);border:1px solid var(--border);border-radius:6px;box-sizing:border-box;">
        </div>
        
        <div>
          <label style="font-size:11px;color:var(--text3);font-weight:600;display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.04em;">Email Address</label>
          <input id="oc-edit-email" type="email" value="${escapeHtml(c.email || '')}" style="width:100%;padding:8px 12px;font-size:13px;background:var(--input-bg);color:var(--text);border:1px solid var(--border);border-radius:6px;box-sizing:border-box;">
        </div>
        
        <div>
          <label style="font-size:11px;color:var(--text3);font-weight:600;display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.04em;">Credit Name (For credits index)</label>
          <input id="oc-edit-creditname" type="text" value="${escapeHtml(c.creditName || '')}" placeholder="e.g. ${escapeHtml(c.name || '')}" style="width:100%;padding:8px 12px;font-size:13px;background:var(--input-bg);color:var(--text);border:1px solid var(--border);border-radius:6px;box-sizing:border-box;">
        </div>
        
        <div>
          <label style="font-size:11px;color:var(--text3);font-weight:600;display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.04em;">Photos (comma-separated list)</label>
          <input id="oc-edit-photos" type="text" value="${escapeHtml((c.photos || []).join(', '))}" placeholder="e.g. photo1.jpg, photo2.jpg" style="width:100%;padding:8px 12px;font-size:13px;background:var(--input-bg);color:var(--text);border:1px solid var(--border);border-radius:6px;box-sizing:border-box;">
        </div>
        
        <div>
          <label style="font-size:11px;color:var(--text3);font-weight:600;display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.04em;">Internal Notes</label>
          <textarea id="oc-edit-notes" rows="3" style="width:100%;padding:8px 12px;font-size:13px;background:var(--input-bg);color:var(--text);border:1px solid var(--border);border-radius:6px;box-sizing:border-box;font-family:inherit;resize:vertical;">${escapeHtml(c.notes || '')}</textarea>
        </div>
        
        <div>
          <label style="font-size:11px;color:var(--text3);font-weight:600;display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.04em;">Gmail Thread ID (For replying/tracking)</label>
          <input id="oc-edit-threadid" type="text" value="${escapeHtml(c.gmailThreadId || '')}" placeholder="e.g. 18f8c4a9d7e3b2a1" style="width:100%;padding:8px 12px;font-size:13px;background:var(--input-bg);color:var(--text);border:1px solid var(--border);border-radius:6px;box-sizing:border-box;font-family:monospace;">
        </div>
      </div>
      
      <div style="display:flex;justify-content:flex-end;gap:8px;">
        <button class="btn" onclick="closeOcEditModal()">Cancel</button>
        <button class="btn gold" onclick="saveOcContributor('${c.id}')">Save Changes</button>
      </div>
    </div>`;
}

async function ocClearUndeliverable(cId) {
  const proj = OPENCALL_DATA.projects[OPENCALL_DATA.activeProjectId];
  if (!proj) return;
  const c = proj.contributors.find(x => x.id === cId);
  if (!c) return;
  c.undeliverable = false;
  delete c.bounceThreadId;
  await _persistOpenCalls();
  renderOpenCall();
  showToast('✓ Bounce flag cleared');
}

async function saveOcContributor(cId) {
  const proj = OPENCALL_DATA.projects[OPENCALL_DATA.activeProjectId];
  if (!proj) return;
  const c = proj.contributors.find(x => x.id === cId);
  if (!c) return;

  const name = ($('oc-edit-name')?.value || '').trim();
  const email = ($('oc-edit-email')?.value || '').trim();
  const creditName = ($('oc-edit-creditname')?.value || '').trim();
  const notes = ($('oc-edit-notes')?.value || '').trim();
  const gmailThreadId = ($('oc-edit-threadid')?.value || '').trim();
  const photosStr = ($('oc-edit-photos')?.value || '').trim();

  c.name = name;
  c.email = email;
  c.creditName = creditName;
  c.notes = notes;
  c.gmailThreadId = gmailThreadId;

  c.photos = photosStr ? photosStr.split(/;\s*|,\s*/).map(p => p.trim()).filter(Boolean) : [];
  c.photo = c.photos.join(', ');
  // Starred picks must stay a subset of the (possibly renamed) photo list.
  // ⚡ Bolt Optimization: Replace O(N) Array.includes with O(1) Set.has inside filter loop
  const photosSet = new Set(c.photos);
  if (Array.isArray(c.selectedPhotos)) c.selectedPhotos = c.selectedPhotos.filter(p => photosSet.has(p));

  await _persistOpenCalls();
  closeOcEditModal();
  renderOpenCall();
  showToast('✓ Contributor updated');
}

async function downloadOcAttachment(messageId, name, btnEl) {
  if (!sheetsUrl) {
    showToast('Connect Google Sheets first to download attachments', 'warn');
    return;
  }

  const prevHtml = btnEl.innerHTML;
  btnEl.disabled = true;
  btnEl.innerHTML = '<span class="spinner" style="width:10px;height:10px;margin-right:4px;"></span> Downloading...';

  try {
    const destUrl = sheetsUrl + (sheetsUrl.includes('?') ? '&' : '?') + 'action=getAttachment&messageId=' + encodeURIComponent(messageId) + '&name=' + encodeURIComponent(name);
    const res = await fetch(destUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    if (!data.base64) throw new Error('No file content received');

    // Convert base64 to Blob and trigger download
    const byteCharacters = atob(data.base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: data.mime || 'application/octet-stream' });

    downloadBlob(blob, name);

    showToast(`✓ Downloaded: ${name}`);
  } catch (err) {
    console.error('Attachment download failed:', err);
    showToast(`⚠ Download failed: ${err.message}`, 'err');
  } finally {
    btnEl.disabled = false;
    btnEl.innerHTML = prevHtml;
  }
}

function ocUpdateBulkPreview() {
  const proj = OPENCALL_DATA.projects[OPENCALL_DATA.activeProjectId];
  if (!proj) return;
  const stage = $('oc-bulk-stage')?.value || 'selectionSent';
  const tmpl = proj.templates?.[stage];
  if (!tmpl) return;

  const dl = $('oc-bulk-deadline')?.value || '';
  const sub = tmpl.subject
    .replace(/\{\{name\}\}/g, 'Alex Mercer')
    .replace(/\{\{photo\}\}/g, 'alex_artwork.jpg')
    .replace(/\{\{creditName\}\}/g, 'Alex Mercer')
    .replace(/\{\{project\}\}/g, proj.title)
    .replace(/\{\{date\}\}/g, dl);
  const body = tmpl.body
    .replace(/\{\{name\}\}/g, 'Alex Mercer')
    .replace(/\{\{photo\}\}/g, 'alex_artwork.jpg')
    .replace(/\{\{creditName\}\}/g, 'Alex Mercer')
    .replace(/\{\{project\}\}/g, proj.title)
    .replace(/\{\{date\}\}/g, dl);

  const subEl = $('oc-bulk-preview-sub-container');
  const bodyEl = $('oc-bulk-preview-body-container');
  if (subEl) subEl.textContent = 'Subject: ' + sub;
  if (bodyEl) bodyEl.textContent = body;
}

async function ocSaveTemplates() {
  const proj = OPENCALL_DATA.projects[OPENCALL_DATA.activeProjectId];
  if (!proj) return;
  if (!proj.templates) proj.templates = {};

  const subject = ($('oc-tmpl-subject')?.value || '').trim();
  const body = $('oc-tmpl-body')?.innerHTML || '';
  const serializedBody = serializeEditorHtml(body);

  if (!subject && !body) {
    showToast('Nothing to save — template is empty', 'warn');
    return;
  }

  proj.templates[activeTmplTab] = { subject, body: serializedBody };

  await _persistOpenCalls();
  showToast(`✓ ${activeTmplTab === 'selectionSent' ? 'Selection' : activeTmplTab === 'cmykSent' ? 'Request Files' : 'Pre-order'} template saved!`);
}

function exportOpenCallCSV() {
  const proj = OPENCALL_DATA.projects[OPENCALL_DATA.activeProjectId];
  if (!proj || !proj.contributors.length) {
    showToast('Nothing to export in this project', 'warn');
    return;
  }
  const rows = [['Name', 'Email', 'Photo', 'Credit Name', 'Notes', 'Selection Sent', 'Credit Received', 'CMYK Sent', 'Files Received', 'Pre-order Sent', 'Created At']];
  proj.contributors.forEach(c => rows.push([
    c.name || '',
    c.email || '',
    c.photo || '',
    c.creditName || '',
    c.notes || '',
    c.selectionSent ? 'Yes' : 'No',
    c.creditReceived ? 'Yes' : 'No',
    c.cmykSent ? 'Yes' : 'No',
    c.filesReceived ? 'Yes' : 'No',
    c.preorderSent ? 'Yes' : 'No',
    c.createdAt || ''
  ]));
  downloadCsv(toCsv(rows), `opencall-${proj.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${today()}.csv`);
  showToast(`✓ Exported ${proj.contributors.length} contributor${proj.contributors.length === 1 ? '' : 's'}`);
}
export {
  ocList,
  ocBlockedForAuthor_,
  ocEnsureQueues_,
  ocQueueNextStep_,
  ocStamp_,
  ocUiOpen_,
  ocToggleSection,
  ocTogglePhotoPick,
  ocSetSort,
  ocSetTmplTab,
  ocUpdateTmplPreview,
  ocThreadForStage,
  openOcBulkModal,
  ocBulkModalEscHandler,
  closeOcBulkModal,
  renderOcBulkModalContent,
  ocBulkSelectAll,
  ocBulkUpdateCount,
  sendOcBulkTestEmail,
  onOcBulkStageChange,
  sendOcBulkEmails,
  cancelOcBulkSend,
  ocInitials,
  openOcBulkRemoveModal,
  closeOcBulkRemoveModal,
  renderOcBulkRemoveModalContent,
  ocBulkRemoveSelectAll,
  ocBulkRemoveUpdateCount,
  ocBulkRemoveFilter,
  executeOcBulkRemove,
  renderOpenCall,
  ocToggleResend,
  ocSaveResendConfig,
  ocSaveSenderConfig,
  ocFetchMailSenderInfo,
  _ocScheduleCache,
  _ocScheduleCacheSet,
  _ocScheduleRequest,
  ocSnapshotContributors_,
  ocPushSnapshot_,
  ocScheduleSnapshotPush_,
  ocSetServerSchedule,
  ocRefreshScheduleStatus_,
  ocLoadSenderAliases,
  handleOcPhotoKeydown,
  addOcPhotoChip,
  removeOcPhotoChip,
  renderOcPhotoChips,
  ocAddPhotoToContributor,
  ocRemovePhotoFromContributor,
  ocAdd,
  ocToggleImport,
  ocRunImport,
  ocToggle,
  ocDelete,
  ocReadProposalCreditEdit_,
  ocFlashCard_,
  ocApproveProposal,
  ocDismissProposal,
  ocApproveAllProposals,
  ocOutboxRemove,
  ocOutboxSendAll,
  ocCopyEmails,
  ocSearch,
  ocFilterByStage,
  checkOcEmailTypo,
  applyOcEmailCorrection,
  loadOpenCalls,
  _persistOpenCalls,
  migrateLegacyOpenCalls,
  ocCreateProject,
  ocRenameProject,
  ocDeleteProject,
  ocSwitchProject,
  ocToggleColorPalette,
  ocApplyColor,
  updateOpenCallBadges,
  ocApplyParsedImport_,
  handleOcCsvFile,
  triggerOcCsvUpload,
  handleOcCsvUpload,
  handleOcCsvDragOver,
  handleOcCsvDragLeave,
  handleOcCsvDrop,
  ocComposeStageEmail,
  openOcEmailPreviewModal,
  closeOcEmailPreviewModal,
  ocPreviewModalSend,
  ocPreviewModalEditInWizard,
  ocScanReplies,
  openOcImportGmailModal,
  closeOcImportGmailModal,
  renderOcImportGmailModal,
  ocImportGmailSearch,
  ocImportGmailSelectAll,
  ocImportGmailConfirm,
  ocScanRepliesSingle,
  ocToggleInlineThread,
  openOcEditModal,
  closeOcEditModal,
  renderOcEditModalContent,
  ocClearUndeliverable,
  saveOcContributor,
  downloadOcAttachment,
  ocUpdateBulkPreview,
  ocSaveTemplates,
  exportOpenCallCSV,
};
