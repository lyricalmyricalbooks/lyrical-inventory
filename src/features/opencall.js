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
  formatDateTime,
  isAuthor,
  sheetsUrl,
  showToast,
  switchTab,
  today,
} from '../main.js';
import {
  _isCustomerSuppressed,
  mailingListHas,
  openCampaignWizard,
  sendSingleEmailViaBackend,
  suggestEmailTypo,
  switchCustomersSubTab,
} from './customers.js';
import { confirmDialog } from '../lib/modal.js';
import { escapeHtml } from '../lib/html.js';
import { toCsv } from '../lib/csv.js';
import { downloadBlob, downloadCsv } from '../lib/download.js';
import { ensureXlsx } from '../lib/external-scripts.js';
import {
  OC_STAGES, newContributor, parseContributorRows, findUnfilledMergeFields,
  ocProposalKey, ocProposalSummary, ocProposalsFromScan, ocApplyProposal,
  ocOutboxKey, ocOutboxAdditions, ocPruneQueues, ocMergeTemplate, ocWaitingDays,
  ocCurrentStage, ocNudgeDue, ocNudgeTemplateKey, ocProblems, ocMatchesFilter, ocFilterCounts,
  ocMatchesSearch, ocSortContributors, OC_NUDGE_AFTER_DAYS,
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
  renderOcList();
}

function ocSetTmplTab(val) {
  // Keep the tab being left's unsaved edits under its own name first.
  ocStashTmplDraft_();
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

let _ocBulkSendingActive = false;
let _ocBulkFailedIds = []; // ids of contributors that failed in the last send
// When the bulk sender is opened from ticked rows: only those start checked.
let _ocBulkPreselect = null;

function ocThreadForStage(c, stageKey) {
  return c.gmailThreadId
    || (stageKey === 'cmykSent' ? c.creditThreadId
      : stageKey === 'preorderSent' ? c.filesThreadId
        : null)
    || null;
}

// Contributors who can get a stage's email (or, in re-send mode, already have).
function ocBulkEligible_(proj, stage, resendMode) {
  const cs = proj.contributors.filter(c => c.email);
  if (stage === 'selectionSent') return cs.filter(c => resendMode ? c.selectionSent : !c.selectionSent);
  if (stage === 'cmykSent') return cs.filter(c => resendMode ? c.cmykSent : (c.creditReceived && !c.cmykSent));
  if (stage === 'preorderSent') return cs.filter(c => resendMode ? c.preorderSent : (c.cmykSent && c.filesReceived && !c.preorderSent));
  return [];
}

function openOcBulkModal(preselectIds) {
  _ocBulkPreselect = Array.isArray(preselectIds) && preselectIds.length ? new Set(preselectIds) : null;
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
  // Opened from ticked rows: start on the stage most of them are ready for.
  const proj = ocActiveProject_();
  const stageEl = $('oc-bulk-stage');
  if (_ocBulkPreselect && proj && stageEl) {
    const best = ['selectionSent', 'cmykSent', 'preorderSent']
      .map(st => ({ st, n: ocBulkEligible_(proj, st, false).filter(c => _ocBulkPreselect.has(c.id)).length }))
      .sort((a, b) => b.n - a.n)[0];
    if (best && best.n) stageEl.value = best.st;
    const resendEl = $('oc-bulk-resend-toggle');
    if (resendEl) resendEl.checked = false;
  }
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
  _ocBulkPreselect = null;
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
  } else {
    eligible = ocBulkEligible_(proj, stage, resendMode);
  }
  const isChecked = (c) => retryMode || !_ocBulkPreselect || _ocBulkPreselect.has(c.id);
  const notReady = _ocBulkPreselect && !retryMode
    ? [..._ocBulkPreselect].filter(id => !eligible.some(c => c.id === id)).length
    : 0;

  const listHtml = eligible.length > 0
    ? `<div style="display:flex;gap:6px;margin-bottom:8px;">
        <button type="button" style="font-size:var(--text-2xs);padding:2px 8px;background:transparent;border:var(--stroke-hair) solid var(--border);color:var(--text3);border-radius:var(--r);cursor:pointer;" onclick="ocBulkSelectAll(true)">Select All</button>
        <button type="button" style="font-size:var(--text-2xs);padding:2px 8px;background:transparent;border:var(--stroke-hair) solid var(--border);color:var(--text3);border-radius:var(--r);cursor:pointer;" onclick="ocBulkSelectAll(false)">Deselect All</button>
        <span style="font-size:var(--text-2xs);color:var(--text3);margin-left:auto;align-self:center;" id="oc-bulk-recipient-count">${eligible.length} recipient${eligible.length !== 1 ? 's' : ''}</span>
      </div>` +
    eligible.map(c => `
        <label style="display:flex;align-items:center;gap:8px;font-size:var(--text-sm);color:var(--text);cursor:pointer;padding:4px 0;border-radius:var(--r);transition:background 0.15s;" onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background='transparent'">
          <input type="checkbox" class="oc-bulk-recipient-check" value="${c.id}" ${isChecked(c) ? 'checked' : ''} style="margin:0;cursor:pointer;" onchange="ocBulkUpdateCount()">
          <span><strong>${escapeHtml(c.name || 'Unnamed')}</strong> <span style="color:var(--text3);">(${escapeHtml(c.email)})</span></span>
        </label>
      `).join('')
    : '<div style="font-size:var(--text-sm);color:var(--text3);font-style:italic;padding:10px 0;">No eligible contributors found for this stage.</div>';

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
    <div class="card" style="width:94%;max-width:660px;max-height:90vh;overflow-y:auto;background:var(--card-bg, #fff);border:var(--stroke-hair) solid var(--border);border-radius:var(--r3);padding:24px;box-shadow:var(--elev-4);position:relative;" onclick="event.stopPropagation()">
      <button type="button" class="modal-close-btn" onclick="closeOcBulkModal()" style="position:absolute;top:15px;right:15px;" aria-label="Close dialog" title="Close (Esc)">✕</button>
      
      <div style="font-family:var(--font-display);font-size:20px;font-weight:700;color:var(--gold-text);margin-bottom:4px;">✉ Send Bulk Pipeline Emails</div>
      <div style="font-size:var(--text-sm);color:var(--text3);margin-bottom:18px;">Personalize and send stage emails to selected contributors.</div>

      <!-- Stage + Re-send Row -->
      <div style="display:grid;grid-template-columns:1fr auto auto;gap:12px;align-items:end;margin-bottom:14px;">
        <div>
          <label style="font-size:var(--text-xs);color:var(--text3);font-weight:600;display:block;margin-bottom:5px;text-transform:uppercase;letter-spacing:0.04em;">Pipeline Stage</label>
          <select id="oc-bulk-stage" onchange="onOcBulkStageChange(this.value)" style="width:100%;padding:8px 12px;font-size:var(--text-base);background:var(--input-bg);color:var(--text);border:var(--stroke-hair) solid var(--border);border-radius:var(--r);">
            <option value="selectionSent" ${stage === 'selectionSent' ? 'selected' : ''}>Stage 1 — Selection Notice</option>
            <option value="cmykSent" ${stage === 'cmykSent' ? 'selected' : ''}>Stage 2 — Request Files (CMYK)</option>
            <option value="preorderSent" ${stage === 'preorderSent' ? 'selected' : ''}>Stage 3 — Pre-order Launch Info</option>
          </select>
        </div>
        <label style="display:flex;align-items:center;gap:6px;font-size:var(--text-sm);color:var(--text2);cursor:pointer;white-space:nowrap;padding-bottom:4px;" title="Also show contributors who already received this stage email">
          <input type="checkbox" id="oc-bulk-resend-toggle" onchange="renderOcBulkModalContent()" style="cursor:pointer;">
          Re-send mode
        </label>
        <label style="display:flex;align-items:center;gap:6px;font-size:var(--text-sm);color:var(--text2);cursor:pointer;white-space:nowrap;padding-bottom:4px;" title="Simulate sending without actually delivering any emails">
          <input type="checkbox" id="oc-bulk-simulate-toggle" style="cursor:pointer;">
          Simulate (Dry Run)
        </label>
      </div>

      <!-- Recipients -->
      <div style="margin-bottom:14px;">
        <div style="font-size:var(--text-xs);color:var(--text3);font-weight:600;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.04em;">Recipients</div>
        ${notReady ? `<div style="font-size:var(--text-xs);color:var(--text3);margin-bottom:6px;">${notReady} of your ticked contributor${notReady === 1 ? ' isn’t' : 's aren’t'} at this stage, so ${notReady === 1 ? 'it’s' : 'they’re'} not listed.</div>` : ''}
        <div id="oc-bulk-recipients" style="max-height:170px;overflow-y:auto;border:var(--stroke-hair) solid var(--border);border-radius:var(--r);padding:10px;background:var(--input-bg);display:flex;flex-direction:column;gap:2px;">
          ${listHtml}
        </div>
      </div>

      <!-- Reply-To, Delay & Deadline Row -->
      <div style="display:grid;grid-template-columns:1fr 120px 140px;gap:12px;align-items:end;margin-bottom:14px;">
        <div>
          <label style="font-size:var(--text-xs);color:var(--text3);font-weight:600;display:block;margin-bottom:5px;text-transform:uppercase;letter-spacing:0.04em;">Reply-To (optional)</label>
          <input id="oc-bulk-replyto" type="email" placeholder="e.g. hello@lyricalmyricalbooks.com" style="width:100%;padding:8px 12px;font-size:var(--text-sm);background:var(--input-bg);color:var(--text);border:var(--stroke-hair) solid var(--border);border-radius:var(--r);box-sizing:border-box;">
        </div>
        <div>
          <label style="font-size:var(--text-xs);color:var(--text3);font-weight:600;display:block;margin-bottom:5px;text-transform:uppercase;letter-spacing:0.04em;">Deadline ({{date}})</label>
          <input id="oc-bulk-deadline" type="text" placeholder="e.g. July 15th" value="${escapeHtml(dl)}" oninput="localStorage.setItem('lm-oc-last-deadline', this.value); ocUpdateBulkPreview();" style="width:100%;padding:8px 12px;font-size:var(--text-sm);background:var(--input-bg);color:var(--text);border:var(--stroke-hair) solid var(--border);border-radius:var(--r);box-sizing:border-box;">
        </div>
        <div>
          <label style="font-size:var(--text-xs);color:var(--text3);font-weight:600;display:block;margin-bottom:5px;text-transform:uppercase;letter-spacing:0.04em;">Delay</label>
          <select id="oc-bulk-delay" style="width:100%;padding:8px 10px;font-size:var(--text-sm);background:var(--input-bg);color:var(--text);border:var(--stroke-hair) solid var(--border);border-radius:var(--r);">
            <option value="0">No delay</option>
            <option value="1000" selected>1s between sends</option>
            <option value="2000">2s between sends</option>
            <option value="5000">5s between sends</option>
          </select>
        </div>
      </div>

      <!-- Template Preview -->
      <div style="margin-bottom:14px;border:var(--stroke-hair) solid var(--border);border-radius:var(--r);overflow:hidden;">
        <div style="font-size:var(--text-2xs);text-transform:uppercase;letter-spacing:0.06em;font-weight:700;color:var(--text3);padding:8px 12px;background:rgba(255,255,255,0.03);border-bottom:var(--stroke-hair) solid var(--border);">Template Preview (sample data)</div>
        <div style="padding:12px;max-height:120px;overflow-y:auto;">
          <div id="oc-bulk-preview-sub-container" style="font-size:var(--text-sm);font-weight:700;color:var(--text);margin-bottom:6px;">Subject: ${escapeHtml(previewSub)}</div>
          <div id="oc-bulk-preview-body-container" style="font-size:var(--text-xs);color:var(--text2);line-height:1.6;white-space:pre-wrap;">${previewBody}</div>
        </div>
        <div style="padding:8px 12px;border-top:var(--stroke-hair) solid var(--border);background:rgba(255,255,255,0.02);">
          <span style="font-size:var(--text-2xs);color:var(--text3);">Tokens: <code style="background:rgba(255,255,255,0.06);padding:1px 5px;border-radius:var(--r);font-size:var(--text-2xs);">{{name}}</code> <code style="background:rgba(255,255,255,0.06);padding:1px 5px;border-radius:var(--r);font-size:var(--text-2xs);">{{photo}}</code> <code style="background:rgba(255,255,255,0.06);padding:1px 5px;border-radius:var(--r);font-size:var(--text-2xs);">{{creditName}}</code> <code style="background:rgba(255,255,255,0.06);padding:1px 5px;border-radius:var(--r);font-size:var(--text-2xs);">{{project}}</code> <code style="background:rgba(255,255,255,0.06);padding:1px 5px;border-radius:var(--r);font-size:var(--text-2xs);">{{date}}</code> — replace with per-contributor data</span>
        </div>
      </div>

      <!-- Test Email -->
      <div style="margin-bottom:16px;padding:10px 12px;background:rgba(255,255,255,0.02);border:var(--stroke-hair) dashed var(--border);border-radius:var(--r);display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <span style="font-size:var(--text-xs);color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:0.04em;">Test Send</span>
        <input id="oc-bulk-test-email" type="email" placeholder="your@email.com" style="flex:1;min-width:140px;padding:6px 10px;font-size:var(--text-sm);background:var(--input-bg);color:var(--text);border:var(--stroke-hair) solid var(--border);border-radius:var(--r);">
        <button class="btn sm" onclick="sendOcBulkTestEmail()" ${tmpl ? '' : 'disabled'} title="Send the template to yourself using sample data">📨 Send Test</button>
      </div>

      <!-- Progress Bar (Initially Hidden) -->
      <div id="oc-bulk-progress-container" style="display:none;margin-bottom:16px;">
        <div class="row-between" style="font-size:var(--text-sm);color:var(--text2);margin-bottom:6px;">
          <span id="oc-bulk-progress-text">Sending emails...</span>
          <strong id="oc-bulk-progress-pct">0%</strong>
        </div>
        <div style="width:100%;background:rgba(255,255,255,0.06);height:8px;border-radius:var(--r);overflow:hidden;border:var(--stroke-hair) solid var(--border);">
          <div id="oc-bulk-progress-fill" style="width:0%;background:linear-gradient(90deg, var(--gold), var(--gold2));height:100%;transition:width 0.3s ease;"></div>
        </div>
        <div id="oc-bulk-console" style="font-family:var(--font-mono);font-size:var(--text-xs);background:var(--ink);color:#a9ffaf;padding:10px;border-radius:var(--r);max-height:120px;overflow-y:auto;margin-top:10px;border:var(--stroke-hair) solid #2a2a2a;line-height:1.5;"></div>
      </div>
      
      <div style="display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;" id="oc-bulk-actions">
        <button class="btn" onclick="closeOcBulkModal()">Cancel</button>
        <button class="btn gold" id="oc-bulk-send-btn" onclick="sendOcBulkEmails(false)" ${eligible.length > 0 ? '' : 'disabled'}>✉ Send ${eligible.length > 0 ? eligible.length + ' Email' + (eligible.length !== 1 ? 's' : '') : 'Emails'}</button>
      </div>
    </div>`;
  // Ticked-rows mode starts with only some boxes checked — sync the count/button.
  if (_ocBulkPreselect && eligible.length) ocBulkUpdateCount();
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
    : `<div style="color:#6b8cff;margin-bottom:4px;">Starting bulk send · ${selectedRecs.length} recipient${selectedRecs.length !== 1 ? 's' : ''} · ${delayMs > 0 ? delayMs / 1000 + 's delay' : 'no delay'}${replyTo ? ' · reply-to: ' + escapeHtml(replyTo) : ''}</div>`;

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
        <button type="button" style="font-size:var(--text-2xs);padding:2px 8px;background:transparent;border:var(--stroke-hair) solid var(--border);color:var(--text3);border-radius:var(--r);cursor:pointer;" onclick="ocBulkRemoveSelectAll(true)">Select All</button>
        <button type="button" style="font-size:var(--text-2xs);padding:2px 8px;background:transparent;border:var(--stroke-hair) solid var(--border);color:var(--text3);border-radius:var(--r);cursor:pointer;" onclick="ocBulkRemoveSelectAll(false)">Deselect All</button>
        <span style="font-size:var(--text-2xs);color:var(--text3);margin-left:auto;align-self:center;" id="oc-bulk-remove-count">0 selected</span>
      </div>
      <div id="oc-bulk-remove-list" style="max-height:300px;overflow-y:auto;border:var(--stroke-hair) solid var(--border);border-radius:var(--r);padding:10px;background:var(--input-bg);display:flex;flex-direction:column;gap:2px;">
      ` +
    eligible.map(c => `
        <label class="oc-bulk-remove-item" data-name="${escapeHtml((c.name || '').toLowerCase())}" data-email="${escapeHtml((c.email || '').toLowerCase())}" style="display:flex;align-items:center;gap:8px;font-size:var(--text-sm);color:var(--text);cursor:pointer;padding:4px 0;border-radius:var(--r);transition:background 0.15s;" onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background='transparent'">
          <input type="checkbox" class="oc-bulk-remove-check" value="${c.id}" style="margin:0;cursor:pointer;" onchange="ocBulkRemoveUpdateCount()">
          <span><strong>${escapeHtml(c.name || 'Unnamed')}</strong> <span style="color:var(--text3);">(${escapeHtml(c.email || 'no email')})</span></span>
        </label>
      `).join('') + `</div>`
    : '<div style="font-size:var(--text-sm);color:var(--text3);font-style:italic;padding:10px 0;">No contributors found in this project.</div>';

  modal.innerHTML = `
    <div class="card" style="width:94%;max-width:500px;max-height:90vh;overflow-y:auto;background:var(--card-bg, #fff);border:var(--stroke-hair) solid var(--border);border-radius:var(--r3);padding:24px;box-shadow:var(--elev-4);position:relative;" onclick="event.stopPropagation()">
      <button type="button" class="modal-close-btn" onclick="closeOcBulkRemoveModal()" style="position:absolute;top:15px;right:15px;" aria-label="Close dialog" title="Close (Esc)">✕</button>
      
      <div style="font-family:var(--font-display);font-size:20px;font-weight:700;color:var(--red);margin-bottom:4px;">✕ Bulk Remove Contributors</div>
      <div style="font-size:var(--text-sm);color:var(--text3);margin-bottom:18px;">Select contributors to remove from the "${escapeHtml(proj.title)}" open call.</div>

      <!-- Search Box inside Modal -->
      ${eligible.length > 0 ? `
      <div style="margin-bottom:12px;">
        <input type="search" id="oc-bulk-remove-search" placeholder="Filter list by name or email..." oninput="ocBulkRemoveFilter(this.value)" style="width:100%;padding:8px 12px;font-size:var(--text-base);background:var(--input-bg);color:var(--text);border:var(--stroke-hair) solid var(--border);border-radius:var(--r);box-sizing:border-box;">
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

// ── Screen state ───────────────────────────────────────────────────────────
// The page is drawn in two layers: renderOpenCall() builds the whole screen
// (header, to-do strip, queues, settings), renderOcList() redraws only the
// stage tabs and the contributor list. Search, filters, sorting, selection and
// expanding a row go through the second, so typing in the search box keeps
// its focus and an unsaved template draft is never thrown away by a filter.
let ocAddOpen = false;
const _ocExpanded = new Set();
const _ocSelected = new Set();
// Unsaved template edits, per template tab, so a full redraw (approving a
// scan result, starring a photo) can't silently discard a half-written email.
const _ocTmplDrafts = {};
let _ocTmplDirty = false;

// The email templates the designer edits. The two reminders are replies into
// the artist's thread for when they've gone quiet on a request.
const OC_TMPL_TABS = [
  { key: 'selectionSent', label: 'Selection' },
  { key: 'cmykSent', label: 'Request files' },
  { key: 'preorderSent', label: 'Pre-order' },
  { key: 'nudgeCredit', label: 'Reminder · credit name' },
  { key: 'nudgeFiles', label: 'Reminder · files' },
];

function ocDefaultTemplates_(title) {
  return {
    selectionSent: {
      subject: `[Selected] Lyricalmyrical Collective Open Call`,
      body: `Hi {{name}},\n\nCongratulations! Your work has been selected from our open call to be featured in our upcoming project. We're thrilled to include you!\n\nWe are now entering the layout phase and require one initial piece of info:\n1. The exact name you want to use in the credit index.\n\nPlease reply to this email to let us know.\n\nWarm regards,\nLyricalmyrical Books`
    },
    cmykSent: {
      subject: `[Files Requested] Lyricalmyrical Open Call - ${title}`,
      body: `Hi {{name}},\n\nWe are now preparing the print-ready files and require your high-resolution artwork.\n\nPlease send us your files (CMYK profile, 300 DPI, with 3mm bleed) as soon as possible.\n\nThank you again!\n\nWarm regards,\nLyricalmyrical Books`
    },
    preorderSent: {
      subject: `[Pre-orders Open] Lyricalmyrical Collective Project - ${title}`,
      body: `Hi {{name}},\n\nWe are thrilled to announce that pre-orders for the collective project are now officially open!\n\nAs selected contributor, you receive a special 50% discount on any number of copies. Use code LMBCOLLECTIVE at checkout:\nhttps://www.lyricalmyricalbooks.com/product/collective-photobook\n\nThank you for being part of this project!\n\nWarm regards,\nLyricalmyrical Books`
    },
    nudgeCredit: {
      subject: `Quick reminder — your credit name for {{project}}`,
      body: `Hi {{name}},\n\nJust a gentle reminder — we still need the exact name you'd like printed in the credit index for {{project}}.\n\nCould you reply to this email with it when you have a moment?\n\nThank you!\n\nWarm regards,\nLyricalmyrical Books`
    },
    nudgeFiles: {
      subject: `Quick reminder — your files for {{project}}`,
      body: `Hi {{name}},\n\nA friendly reminder that we're still waiting on your high-resolution files for {{project}} (CMYK profile, 300 DPI, with 3mm bleed).\n\nIf you've already sent them, please ignore this — otherwise just reply to this email with them attached.\n\nThank you!\n\nWarm regards,\nLyricalmyrical Books`
    },
  };
}

// Fill in any template a project doesn't have yet (older projects predate the
// reminder templates) without touching the ones the owner already edited.
function ocEnsureTemplates_(proj) {
  if (!proj) return;
  if (!proj.templates || typeof proj.templates !== 'object') proj.templates = {};
  const defaults = ocDefaultTemplates_(proj.title);
  Object.keys(defaults).forEach(k => { if (!proj.templates[k]) proj.templates[k] = defaults[k]; });
}

// Template bodies are saved as HTML by the designer, but the built-in defaults
// are plain text — give those line breaks so they don't arrive as one paragraph.
function ocTemplateBodyHtml_(body) {
  const raw = String(body || '');
  return (raw.includes('<') || !raw) ? raw : parseMarkdownToHtml(raw);
}

function ocActiveProject_() {
  return OPENCALL_DATA.projects[OPENCALL_DATA.activeProjectId] || null;
}

function ocEnsureActiveProject_() {
  if (OPENCALL_DATA.activeProjectId && OPENCALL_DATA.projects[OPENCALL_DATA.activeProjectId]) return;
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

// "3 min ago" / "yesterday" style age for the last-checked line.
function ocAgo_(iso) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return '';
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

function ocPlural_(n, one, many = one + 's') {
  return `${n} ${n === 1 ? one : many}`;
}

// Stage tabs: what each "next step" means in plain words, and whose move it is.
const OC_TAB_DEFS = [
  { key: '', label: 'Everyone' },
  { key: 'selectionSent', label: 'New', who: 'you', tip: 'Selection email not sent yet' },
  { key: 'creditReceived', label: 'Awaiting credit name', who: 'artist', tip: 'Waiting for the artist to reply with their credit name' },
  { key: 'cmykSent', label: 'Request files', who: 'you', tip: 'Credit name is in — send the files request' },
  { key: 'filesReceived', label: 'Awaiting files', who: 'artist', tip: 'Waiting for the artist to send high-res files' },
  { key: 'preorderSent', label: 'Pre-order email', who: 'you', tip: 'Files are in — send the pre-order email' },
  { key: 'complete', label: 'Done', tip: 'Every stage complete' },
];

const OC_PROBLEM_LABELS = {
  noEmail: { text: 'No email', tip: 'Add an email address before anything can be sent' },
  bounced: { text: 'Bounced', tip: 'A delivery-failure notice was found for this address. Check it, fix it if needed, then clear the flag.' },
  unsubscribed: { text: 'Unsubscribed', tip: 'This address unsubscribed — the app will not email it until it is re-subscribed' },
  noThread: { text: 'No thread', tip: 'No Gmail conversation is linked — the next email would start a new conversation instead of replying. Import from Gmail or paste the thread id in Edit.' },
};

// Stash the template editor's unsaved text before a redraw replaces it.
function ocStashTmplDraft_() {
  if (!_ocTmplDirty) return;
  const sub = $('oc-tmpl-subject');
  const bodyEl = $('oc-tmpl-body');
  if (!sub || !bodyEl) return;
  _ocTmplDrafts[activeTmplTab] = { subject: sub.value, html: bodyEl.innerHTML };
  _ocTmplDirty = false;
}

function ocMarkTmplDirty() {
  _ocTmplDirty = true;
  const flag = $('oc-tmpl-unsaved');
  if (flag) flag.hidden = false;
}

function renderOpenCall() {
  const body = $('opencall-body');
  if (!body) return;

  if (ocBlockedForAuthor_()) { body.innerHTML = ''; return; }

  const bc = $('book-context-oc');
  if (bc) bc.style.display = 'none';

  ocStashTmplDraft_();
  ocEnsureActiveProject_();

  const activeProj = ocActiveProject_();
  ocEnsureQueues_(activeProj);
  ocEnsureTemplates_(activeProj);

  const listRaw = ocList();
  const total = listRaw.length;
  const counts = ocFilterCounts(listRaw, { isSuppressed: _isCustomerSuppressed });
  const done = counts.complete;
  const pct = total ? Math.round((done / total) * 100) : 0;

  const contributorsById = new Map(activeProj.contributors.map(c => [c.id, c]));
  const inboxItems = activeProj.inbox.filter(p => contributorsById.has(p.contributorId));
  const outboxItems = activeProj.outbox.filter(e => contributorsById.has(e.contributorId));
  const sched = _ocScheduleCache();
  const lastScannedVal = activeProj.lastScanned || null;

  body.innerHTML = `
    <div class="oc-layout oc-shell">
      ${ocTopbarHtml_(activeProj, { total, done, pct, sched, lastScannedVal })}
      ${ocAddOpen ? ocAddPanelHtml_() : ''}
      ${total ? ocTodoHtml_(counts, inboxItems.length, outboxItems.length) : ''}
      ${ocInboxHtml_(inboxItems, contributorsById)}
      ${ocOutboxHtml_(activeProj, outboxItems, contributorsById)}
      <section class="card oc-list-card" aria-label="Contributors">
        <div id="oc-tabs" class="oc-tabs" role="group" aria-label="Filter by stage"></div>
        <div class="oc-list-toolbar">
          <input type="search" id="oc-search" placeholder="Search name, email, credit, photo, notes…" value="${escapeHtml(ocSearchQuery)}" oninput="ocSearch(this.value)" aria-label="Search contributors">
          <select id="oc-sort-by" onchange="ocSetSort(this.value)" aria-label="Sort contributors">
            <option value="dateDesc" ${ocSortBy === 'dateDesc' ? 'selected' : ''}>Newest first</option>
            <option value="dateAsc" ${ocSortBy === 'dateAsc' ? 'selected' : ''}>Oldest first</option>
            <option value="waitingDesc" ${ocSortBy === 'waitingDesc' ? 'selected' : ''}>Waiting longest</option>
            <option value="nameAsc" ${ocSortBy === 'nameAsc' ? 'selected' : ''}>Name A–Z</option>
            <option value="nameDesc" ${ocSortBy === 'nameDesc' ? 'selected' : ''}>Name Z–A</option>
            <option value="progressDesc" ${ocSortBy === 'progressDesc' ? 'selected' : ''}>Furthest along</option>
            <option value="progressAsc" ${ocSortBy === 'progressAsc' ? 'selected' : ''}>Least along</option>
          </select>
        </div>
        <div id="oc-list-head" class="oc-list-head"></div>
        <div id="oc-list" class="oc-list"></div>
      </section>
      <div class="oc-settings">
        <div class="oc-settings-label">Emails &amp; settings</div>
        ${ocTemplatesEditorHtml_(activeProj)}
        ${ocAutomationHtml_(sched, lastScannedVal)}
      </div>
    </div>`;

  renderOcList();

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

function ocTopbarHtml_(activeProj, { total, done, pct, sched, lastScannedVal }) {
  const projectOptions = Object.keys(OPENCALL_DATA.projects).map(id => {
    const proj = OPENCALL_DATA.projects[id];
    return `<option value="${escapeHtml(id)}" ${id === OPENCALL_DATA.activeProjectId ? 'selected' : ''}>${escapeHtml(proj.title)}</option>`;
  }).join('');

  const checked = lastScannedVal
    ? `Replies last checked ${ocAgo_(lastScannedVal)}${sched.enabled ? ` · auto-check every ${sched.minutes === 30 ? '30 min' : 'hour'}` : ''}`
    : (sheetsUrl ? 'Replies not checked yet' : 'Connect your Google Sheet to send emails and check replies');

  return `
    <div class="card oc-topbar">
      <div class="oc-topbar-main">
        <div class="oc-topbar-titles">
          <div class="sec-kicker"><span class="sec-kicker-dot"></span>Open call</div>
          <div class="oc-project-picker">
            <select id="oc-project-select" class="oc-project-select" onchange="ocSwitchProject(this.value)" aria-label="Open call project">
              ${projectOptions}
            </select>
            <button type="button" class="oc-icon-btn" popovertarget="oc-project-menu" aria-label="Project options" title="New, rename or delete project">⋯</button>
            <div id="oc-project-menu" class="oc-menu" popover ontoggle="ocPlaceMenu(event)">
              <button type="button" class="oc-menu-item" popovertarget="oc-project-menu" popovertargetaction="hide" onclick="ocCreateProject()">＋ New project</button>
              <button type="button" class="oc-menu-item" popovertarget="oc-project-menu" popovertargetaction="hide" onclick="ocRenameProject()">✎ Rename this project</button>
              <button type="button" class="oc-menu-item is-danger" popovertarget="oc-project-menu" popovertargetaction="hide" onclick="ocDeleteProject()">✕ Delete this project</button>
            </div>
          </div>
          <div class="oc-topbar-meta">
            ${total
              ? `<span><strong>${total}</strong> contributor${total === 1 ? '' : 's'}</span><span aria-hidden="true">·</span><span><strong>${done}</strong> finished</span>
                 <span class="oc-meter" role="img" aria-label="${pct}% of contributors finished"><span style="width:${pct}%"></span></span><span class="oc-meter-pct">${pct}%</span>`
              : '<span>No contributors yet</span>'}
          </div>
        </div>
        <div class="oc-topbar-actions">
          <button type="button" class="btn gold" onclick="ocToggleAddPanel()" aria-expanded="${ocAddOpen}">${ocAddOpen ? '✕ Close' : '＋ Add contributors'}</button>
          <button type="button" class="btn" id="oc-import-gmail-btn" onclick="openOcImportGmailModal()" title="Find artists' submission emails in Gmail and import them as contributors — capturing their submission thread so every stage email replies into it">📨 Import from Gmail</button>
          <button type="button" class="btn" id="oc-scan-btn" onclick="ocScanReplies()" ${total ? '' : 'disabled'} title="Look through Gmail for credit-name replies, files and bounces. Findings wait for your approval.">📥 Check replies</button>
          <button type="button" class="btn" popovertarget="oc-more-menu" aria-label="More actions">More ▾</button>
          <div id="oc-more-menu" class="oc-menu" popover ontoggle="ocPlaceMenu(event)">
            <button type="button" class="oc-menu-item" popovertarget="oc-more-menu" popovertargetaction="hide" onclick="openOcBulkModal()" ${total ? '' : 'disabled'}>✉ Email a stage in bulk…</button>
            <button type="button" class="oc-menu-item" popovertarget="oc-more-menu" popovertargetaction="hide" onclick="ocCopyEmails()" ${total ? '' : 'disabled'}>⧉ Copy every email address</button>
            <button type="button" class="oc-menu-item" popovertarget="oc-more-menu" popovertargetaction="hide" onclick="exportOpenCallCSV()" ${total ? '' : 'disabled'}>⬇ Download as spreadsheet (CSV)</button>
            <button type="button" class="oc-menu-item is-danger" popovertarget="oc-more-menu" popovertargetaction="hide" onclick="openOcBulkRemoveModal()" ${total ? '' : 'disabled'}>✕ Remove several contributors…</button>
          </div>
        </div>
      </div>
      <div class="oc-topbar-foot">${escapeHtml(checked)}</div>
    </div>`;
}

// Place a popover menu under the button that opened it (popovers otherwise
// open centred on the screen). Phones get the centred sheet — it's easier to
// reach than a menu hanging off the right edge.
function ocPlaceMenu(e) {
  const menu = e.target;
  if (!menu) return;
  if (e.newState !== 'open') { menu.classList.remove('is-placed'); return; }
  const trigger = document.querySelector(`[popovertarget="${menu.id}"]:not([popovertargetaction])`);
  if (!trigger || window.innerWidth < 560) {
    menu.classList.add('is-sheet');
    menu.style.left = menu.style.top = '';
  } else {
    menu.classList.remove('is-sheet');
    const r = trigger.getBoundingClientRect();
    const w = menu.offsetWidth || 272;
    const h = menu.offsetHeight || 0;
    menu.style.left = `${Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(r.bottom + 6, window.innerHeight - h - 8))}px`;
  }
  menu.classList.add('is-placed');
  menu.querySelector('.oc-menu-item:not(:disabled)')?.focus();
}

function ocAddPanelHtml_() {
  const chipsHtml = _ocNewContributorPhotos.map((p, idx) => `
    <span class="oc-photo-chip">
      📷 ${escapeHtml(p)}
      <span class="oc-photo-chip-remove" role="button" tabindex="0" onclick="removeOcPhotoChip(${idx})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();removeOcPhotoChip(${idx});}" title="Remove photo" aria-label="Remove ${escapeHtml(p)}">✕</span>
    </span>
  `).join('');

  return `
    <div class="card oc-add-panel">
      <div class="oc-add-grid">
        <div class="oc-add-col">
          <div class="oc-panel-title">Add one artist</div>
          <label class="oc-field"><span>Name</span><input id="oc-name" type="text" placeholder="Artist name" autocomplete="off"></label>
          <label class="oc-field"><span>Email</span>
            <input id="oc-email" placeholder="name@example.com" type="email" oninput="checkOcEmailTypo(this.value)" autocomplete="off">
          </label>
          <div id="oc-add-email-correction" class="email-suggest-correction" style="display:none;" role="button" tabindex="0" onclick="applyOcEmailCorrection()"></div>
          <label class="oc-field"><span>Photo files <em>(press Enter after each)</em></span>
            <span class="oc-inline-add">
              <input id="oc-photo" type="text" placeholder="e.g. river_at_dusk.jpg" onkeydown="handleOcPhotoKeydown(event)">
              <button type="button" class="btn sm" onclick="addOcPhotoChip()" aria-label="Add photo">＋</button>
            </span>
          </label>
          <div id="oc-photo-chips" class="oc-addform-chips">${chipsHtml}</div>
          <button type="button" class="btn gold" onclick="ocAdd()">Add contributor</button>
        </div>
        <div class="oc-add-col">
          <div class="oc-panel-title">Or bring in a whole list</div>
          <div class="oc-upload-zone" role="button" tabindex="0" onclick="triggerOcCsvUpload()" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();triggerOcCsvUpload();}" ondragover="handleOcCsvDragOver(event)" ondragleave="handleOcCsvDragLeave(event)" ondrop="handleOcCsvDrop(event)">
            <p>Drop a <strong>spreadsheet</strong> here, or click to choose one</p>
            <span>Excel or CSV · columns: Name, Email, Photo (separate several with ;), Credit name, Notes · you'll see a preview first</span>
            <input type="file" id="oc-csv-file-input" accept=".csv,.xlsx,.xls" style="display:none;" onchange="handleOcCsvUpload(this)">
          </div>
          ${ocImportOpen ? `
          <label class="oc-field"><span>Paste rows from a spreadsheet</span>
            <textarea id="oc-import-text" rows="4" placeholder="Jeremy Ackman, ackmanj@gmail.com, Jeremy_ackman_5.jpg, Jeremy Ackman, Selected" style="font-family:var(--font-mono);"></textarea>
          </label>
          <div class="oc-inline-actions">
            <button type="button" class="btn gold sm" onclick="ocRunImport()">Import pasted rows</button>
            <button type="button" class="btn sm" onclick="ocToggleImport()">Cancel</button>
          </div>` : `
          <div class="oc-inline-actions">
            <button type="button" class="btn sm" onclick="ocToggleImport()">⎘ Paste rows instead</button>
            <a class="oc-text-link" href="opencall-template.csv" download="opencall-template.csv">Download a blank template</a>
          </div>`}
          <div class="oc-add-hint">Already-listed email addresses are skipped, so importing the same list twice is safe.</div>
        </div>
      </div>
    </div>`;
}

// "Needs you" strip — each tile is a shortcut to the work behind its number.
function ocTodoHtml_(counts, inboxCount, outboxCount) {
  const tile = ({ n, label, sub, tone, onclick, tip }) => `
    <button type="button" class="oc-todo-tile ${n ? `is-${tone}` : 'is-clear'}" ${n ? `onclick="${onclick}"` : 'disabled'} title="${escapeHtml(tip)}">
      <span class="oc-todo-num">${n}</span>
      <span class="oc-todo-label">${label}</span>
      <span class="oc-todo-sub">${n ? sub : 'All clear'}</span>
    </button>`;
  const filterTile = (key) => `ocFilterByStage('${key}');document.getElementById('oc-tabs')?.scrollIntoView({behavior:'smooth',block:'start'})`;
  return `
    <div class="oc-todo" role="group" aria-label="What needs you">
      ${tile({ n: inboxCount, label: 'Replies to confirm', sub: 'Review what Gmail found', tone: 'alert', tip: 'Credit names, files and bounces found in Gmail — nothing changes until you approve', onclick: "document.querySelector('.oc-inbox-card')?.scrollIntoView({behavior:'smooth'})" })}
      ${tile({ n: outboxCount, label: 'Emails ready to send', sub: 'Next-step emails queued', tone: 'go', tip: 'Next-stage emails queued up after a reply came in', onclick: "document.querySelector('.oc-outbox-card')?.scrollIntoView({behavior:'smooth'})" })}
      ${tile({ n: counts.selectionSent, label: 'Selection emails to send', sub: 'Show who hasn’t heard yet', tone: 'go', tip: 'Artists who have not received their selection email', onclick: filterTile('selectionSent') })}
      ${tile({ n: counts.nudge, label: 'Need a reminder', sub: `Quiet for ${OC_NUDGE_AFTER_DAYS}+ days`, tone: 'warn', tip: `Artists who haven't answered a request in ${OC_NUDGE_AFTER_DAYS} days or more`, onclick: filterTile('nudge') })}
      ${tile({ n: counts.problems, label: 'Problems', sub: 'Bounced, missing or unlinked', tone: 'alert', tip: 'Bounced or missing addresses, unsubscribes, and artists with no linked Gmail conversation', onclick: filterTile('problems') })}
    </div>`;
}

function ocInboxHtml_(inboxItems, contributorsById) {
  if (!inboxItems.length) return '';
  const inboxTypeLabels = { creditReceived: '✍️ Sent their credit name', filesReceived: '📎 Sent high-res files', undeliverable: '⚠ Email bounced (undeliverable)' };
  const rows = inboxItems.map(p => {
    const c = contributorsById.get(p.contributorId);
    const threadLink = p.threadId
      ? `<a class="oc-queue-thread-link" href="https://mail.google.com/mail/u/0/#all/${encodeURIComponent(p.threadId)}" target="_blank" rel="noopener" title="Open the detected email in Gmail">✉ View email ↗</a>`
      : '';
    const creditInput = p.type === 'creditReceived'
      ? `<label class="oc-inbox-credit">Credit name to save: <input id="oc-inbox-credit-${p.id}" type="text" value="${escapeHtml(p.creditName || c.creditName || c.name || '')}" placeholder="Exact name for the credits"></label>`
      : '';
    return `
      <div class="oc-queue-row">
        <div class="oc-queue-row-main">
          <div><strong>${escapeHtml(c.name || c.email)}</strong> — ${inboxTypeLabels[p.type] || escapeHtml(p.type)} ${threadLink}</div>
          ${creditInput}
        </div>
        <div class="oc-queue-row-actions">
          <button type="button" class="btn sm gold" onclick="ocApproveProposal('${p.id}')">✓ Approve</button>
          <button type="button" class="btn sm" onclick="ocDismissProposal('${p.id}')">✕ Dismiss</button>
        </div>
      </div>`;
  }).join('');
  return `
    <div class="card oc-queue-card oc-inbox-card">
      <div class="oc-queue-head">
        <div class="oc-panel-title">📥 Replies to confirm · ${inboxItems.length}</div>
        <button type="button" class="btn sm gold" onclick="ocApproveAllProposals()">✓ Approve all</button>
      </div>
      <div class="oc-queue-note">Gmail found these — nothing changes on a contributor until you approve it.</div>
      ${rows}
    </div>`;
}

function ocOutboxHtml_(activeProj, outboxItems, contributorsById) {
  if (!outboxItems.length) return '';
  const outboxStageLabels = { cmykSent: 'Request files', preorderSent: 'Pre-order' };
  const outboxDl = localStorage.getItem('lm-oc-last-deadline') || '';
  const rows = outboxItems.map(e => {
    const c = contributorsById.get(e.contributorId);
    const tmpl = activeProj.templates ? activeProj.templates[e.stageKey] : null;
    const subjectPreview = tmpl ? ocMergeTemplate(tmpl.subject, c, { project: activeProj.title, date: outboxDl }) : '(no template saved for this stage)';
    const missing = tmpl ? findUnfilledMergeFields((tmpl.subject || '') + '\n' + (tmpl.body || ''), c, { project: activeProj.title, date: outboxDl }) : [];
    const warn = (!tmpl || missing.length)
      ? `<span class="oc-queue-warn" title="${!tmpl ? 'Save a template for this stage first' : 'Blank template fields: ' + missing.join(', ')}">⚠ ${!tmpl ? 'no template' : 'blank: ' + missing.join(', ')}</span>`
      : '';
    return `
      <div class="oc-queue-row">
        <div class="oc-queue-row-main">
          <div><strong>${escapeHtml(c.name || c.email)}</strong> <span class="oc-queue-stage">${outboxStageLabels[e.stageKey] || escapeHtml(e.stageKey)}</span> ${warn}</div>
          <div class="oc-queue-subject">${escapeHtml(subjectPreview)}</div>
        </div>
        <div class="oc-queue-row-actions">
          <button type="button" class="btn sm gold" onclick="ocComposeStageEmail('${c.id}','${e.stageKey}')">✎ Review &amp; send</button>
          <button type="button" class="btn sm" onclick="ocOutboxRemove('${e.id}')">✕ Remove</button>
        </div>
      </div>`;
  }).join('');
  return `
    <div class="card oc-queue-card oc-outbox-card">
      <div class="oc-queue-head">
        <div class="oc-panel-title">📤 Emails ready to send · ${outboxItems.length}</div>
        <button type="button" class="btn sm gold" id="oc-outbox-sendall-btn" onclick="ocOutboxSendAll()">▶ Send all (${outboxItems.length})</button>
      </div>
      <div class="oc-queue-note">Queued automatically when a reply comes in — each uses its stage template and replies into the artist's thread. Nothing sends until you confirm.<span id="oc-outbox-status" class="oc-queue-status"></span></div>
      ${rows}
    </div>`;
}

// ── The contributor list ──────────────────────────────────────────────────
function ocVisibleContributors_() {
  const opts = { isSuppressed: _isCustomerSuppressed };
  const filtered = ocList().filter(c =>
    ocMatchesFilter(c, ocFilterStage, opts) && ocMatchesSearch(c, ocSearchQuery));
  return ocSortContributors(filtered, ocSortBy);
}

function renderOcList() {
  const listEl = $('oc-list');
  if (!listEl) return;
  const all = ocList();

  // Drop selections/expansions for contributors that no longer exist.
  const ids = new Set(all.map(c => c.id));
  [..._ocSelected].forEach(id => { if (!ids.has(id)) _ocSelected.delete(id); });
  [..._ocExpanded].forEach(id => { if (!ids.has(id)) _ocExpanded.delete(id); });

  ocRenderTabs_(all);
  const list = ocVisibleContributors_();
  ocRenderListHead_(list, all.length);

  if (!list.length) {
    const filtered = ocSearchQuery.trim() || ocFilterStage;
    listEl.innerHTML = `
      <div class="oc-empty-state">
        <div class="oc-empty-icon">${filtered ? '🔍' : '🎨'}</div>
        <div class="oc-empty-title">${filtered ? 'Nobody matches' : 'No contributors yet'}</div>
        <div class="oc-empty-body">${filtered
          ? 'Try another search, or clear the filters to see everyone.'
          : 'Add artists one at a time, drop in a spreadsheet, or pull their submission emails straight from Gmail.'}</div>
        <div class="oc-inline-actions" style="justify-content:center;">
          ${filtered
            ? '<button type="button" class="btn" onclick="ocClearFilters()">Clear filters</button>'
            : `<button type="button" class="btn gold" onclick="ocToggleAddPanel(true)">＋ Add contributors</button>
               <button type="button" class="btn" onclick="openOcImportGmailModal()">📨 Import from Gmail</button>`}
        </div>
      </div>`;
    return;
  }

  listEl.innerHTML = list.map(ocRowHtml_).join('');
}

// Stage tabs double as the list filter; each count is exactly what that tab shows.
function ocRenderTabs_(all) {
  const tabsEl = $('oc-tabs');
  if (!tabsEl) return;
  if (!all.length) { tabsEl.innerHTML = ''; return; }
  const counts = ocFilterCounts(all, { isSuppressed: _isCustomerSuppressed });
  const tabs = [...OC_TAB_DEFS];
  // Special views only appear once they have something in them (or are active).
  if (counts.nudge || ocFilterStage === 'nudge') tabs.push({ key: 'nudge', label: 'Need a reminder', tone: 'warn', tip: `No reply to a request in ${OC_NUDGE_AFTER_DAYS}+ days` });
  if (counts.problems || ocFilterStage === 'problems') tabs.push({ key: 'problems', label: 'Problems', tone: 'alert', tip: 'Bounced or missing addresses, unsubscribes, no linked Gmail conversation' });
  tabsEl.innerHTML = tabs.map((t, i) => {
    const n = counts[t.key] || 0;
    const on = ocFilterStage === t.key;
    const step = (i >= 1 && i <= OC_STAGES.length) ? `<span class="oc-tab-step">${i}</span>` : '';
    const whose = t.who ? (t.who === 'you' ? ' · your move' : ' · waiting on the artist') : '';
    return `<button type="button" class="oc-tab ${on ? 'is-on' : ''} ${t.who ? `is-${t.who}` : ''} ${t.tone ? `is-${t.tone}` : ''} ${n ? '' : 'is-empty'}"
      aria-pressed="${on}" onclick="ocFilterByStage('${on && t.key ? '' : t.key}')" title="${escapeHtml(t.tip || 'Show everyone')}${whose}">${step}<span class="oc-tab-label">${t.label}</span><span class="oc-tab-count">${n}</span></button>`;
  }).join('');
}

// The strip above the rows: a count line normally, the bulk-action bar while
// anything is ticked.
function ocRenderListHead_(list = ocVisibleContributors_(), total = ocList().length) {
  const headEl = $('oc-list-head');
  if (!headEl) return;
  if (!total) { headEl.innerHTML = ''; return; }
  const selectedVisible = list.filter(c => _ocSelected.has(c.id)).length;
  const allVisibleSelected = list.length > 0 && selectedVisible === list.length;
  const anyOpen = list.some(c => _ocExpanded.has(c.id));
  const q = ocSearchQuery.trim();
  headEl.innerHTML = _ocSelected.size ? `
    <div class="oc-selbar" role="region" aria-label="Selected contributors">
      <label class="oc-check"><input type="checkbox" ${allVisibleSelected ? 'checked' : ''} onchange="ocSelectAllVisible(this.checked)" aria-label="Select everyone shown"></label>
      <strong>${_ocSelected.size} selected</strong>
      <div class="oc-selbar-actions">
        <button type="button" class="btn sm gold" onclick="ocEmailSelected()">✉ Email selected</button>
        <button type="button" class="btn sm" onclick="ocCopyEmails(true)">⧉ Copy emails</button>
        <button type="button" class="btn sm danger-btn" onclick="ocRemoveSelected()">✕ Remove</button>
        <button type="button" class="btn sm" onclick="ocClearSelection()">Clear</button>
      </div>
    </div>` : `
    <div class="oc-list-meta">
      <label class="oc-check"><input type="checkbox" onchange="ocSelectAllVisible(this.checked)" ${list.length ? '' : 'disabled'} aria-label="Select everyone shown"></label>
      <span>${list.length === total ? `Showing all ${total}` : `Showing ${list.length} of ${total}`}${q ? ` matching “${escapeHtml(q)}”` : ''}</span>
      ${(ocFilterStage || q) ? '<button type="button" class="oc-text-link" onclick="ocClearFilters()">Clear filters</button>' : ''}
      <span class="oc-list-meta-spacer"></span>
      ${list.length ? `<button type="button" class="oc-text-link" onclick="ocExpandAll(${anyOpen ? 'false' : 'true'})">${anyOpen ? 'Collapse all' : 'Expand all'}</button>` : ''}
    </div>`;
}

// Which pipeline email this artist is ready for right now (the same gating
// the outbox uses, plus the first selection email).
function ocSendStageFor_(c) {
  if (!c.selectionSent) return 'selectionSent';
  if (c.creditReceived && !c.cmykSent) return 'cmykSent';
  if (c.cmykSent && c.filesReceived && !c.preorderSent) return 'preorderSent';
  return null;
}

// One plain-language line about where this artist is, plus the single most
// useful button for it.
function ocRowStatus_(c) {
  const stage = ocCurrentStage(c);
  const suppressed = c.email && _isCustomerSuppressed(c.email);
  const waited = ocWaitingDays(c);
  const waitTxt = waited !== null && waited >= 1 ? ` · ${waited} day${waited === 1 ? '' : 's'}` : '';
  const sendLabels = { selectionSent: '✉ Send selection', cmykSent: '✉ Request files', preorderSent: '✉ Send pre-order' };

  if (!c.email) return { text: 'Add an email address to get started', tone: 'alert', cta: `<button type="button" class="btn sm" onclick="openOcEditModal('${c.id}')">✎ Add email</button>` };
  if (c.undeliverable) return { text: 'Last email bounced — check the address', tone: 'alert', cta: `<button type="button" class="btn sm" onclick="openOcEditModal('${c.id}')">✎ Fix email</button>` };
  if (stage === 'complete') return { text: 'All stages complete', tone: 'done', cta: '' };
  if (suppressed) return { text: 'Unsubscribed — emails paused', tone: 'muted', cta: '' };

  const send = ocSendStageFor_(c);
  if (send) {
    const what = { selectionSent: 'Send the selection email', cmykSent: 'Credit name is in — request the files', preorderSent: 'Files are in — send the pre-order email' }[send];
    return { text: `Your move: ${what}${waitTxt}`, tone: 'you', cta: `<button type="button" class="btn sm gold" onclick="ocComposeStageEmail('${c.id}','${send}')">${sendLabels[send]}</button>` };
  }
  const owes = stage === 'creditReceived' ? 'their credit name' : 'their high-res files';
  const nudged = ocDaysAgoLabel_(c.lastNudgedAt);
  if (ocNudgeDue(c)) {
    return { text: `Waiting on ${owes}${waitTxt}${nudged ? ` · reminded ${nudged}` : ''}`, tone: 'warn', cta: `<button type="button" class="btn sm" onclick="ocComposeNudge('${c.id}')">↻ Send reminder</button>` };
  }
  return { text: `Waiting on ${owes}${waitTxt}${nudged ? ` · reminded ${nudged}` : ''}`, tone: 'artist', cta: '' };
}

function ocDaysAgoLabel_(iso) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return '';
  const d = Math.max(0, Math.floor((Date.now() - t) / 86400000));
  return d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
}

function ocRowHtml_(c) {
  const open = _ocExpanded.has(c.id);
  const selected = _ocSelected.has(c.id);
  const status = ocRowStatus_(c);
  const stageIdx = OC_STAGES.findIndex(st => !c[st.key]);
  const doneCount = OC_STAGES.filter(st => c[st.key]).length;
  const track = OC_STAGES.map((st, i) => {
    const cls = c[st.key] ? 'is-done' : (i === stageIdx ? 'is-next' : '');
    return `<span class="oc-track-seg ${cls}" title="${escapeHtml(st.label)}${c[st.key] ? ' ✓' : ''}"></span>`;
  }).join('');
  const problems = ocProblems(c, _isCustomerSuppressed)
    // The status line already says it for these two.
    .filter(p => !(p === 'noEmail' || (p === 'bounced')))
    .map(p => `<span class="oc-flag" title="${escapeHtml(OC_PROBLEM_LABELS[p].tip)}">${OC_PROBLEM_LABELS[p].text}</span>`).join('');
  const name = c.name || c.email || 'Unnamed';

  return `
    <article class="oc-row ${open ? 'is-open' : ''} ${selected ? 'is-selected' : ''} tone-${status.tone}" id="oc-card-${c.id}">
      <div class="oc-row-main">
        <label class="oc-check"><input type="checkbox" ${selected ? 'checked' : ''} onchange="ocToggleSelect('${c.id}', this.checked)" aria-label="Select ${escapeHtml(name)}"></label>
        <button type="button" class="oc-row-toggle" id="oc-row-toggle-${c.id}" aria-expanded="${open}" aria-controls="oc-row-detail-${c.id}" onclick="ocToggleExpand('${c.id}')">
          <span class="oc-avatar" aria-hidden="true">${escapeHtml(ocInitials(c.name))}</span>
          <span class="oc-row-who">
            <span class="oc-row-name">${escapeHtml(name)}${c.creditName && c.creditName !== c.name ? `<span class="oc-row-credit">as “${escapeHtml(c.creditName)}”</span>` : ''}</span>
            <span class="oc-row-email">${c.email ? escapeHtml(c.email) : 'no email'}</span>
          </span>
        </button>
        <div class="oc-row-progress">
          <span class="oc-track" role="img" aria-label="${doneCount} of ${OC_STAGES.length} stages done">${track}</span>
          <span class="oc-row-status">${escapeHtml(status.text)}</span>
          ${problems ? `<span class="oc-row-flags">${problems}</span>` : ''}
        </div>
        <div class="oc-row-cta">${status.cta}</div>
        <button type="button" class="oc-row-chevron" onclick="ocToggleExpand('${c.id}')" aria-label="${open ? 'Hide' : 'Show'} details for ${escapeHtml(name)}" tabindex="-1">${open ? '▴' : '▾'}</button>
      </div>
      ${open ? `<div class="oc-row-detail" id="oc-row-detail-${c.id}">${ocDetailHtml_(c)}</div>` : ''}
    </article>`;
}

// Everything about one artist: contact, conversation, photos, the clickable
// stage tracker and the less-common actions.
function ocDetailHtml_(c) {
  let mailStatusHtml = '';
  let mailActionsHtml = '';
  if (c.email) {
    const sup = _isCustomerSuppressed(c.email);
    const onList = mailingListHas(c.email);
    if (sup) {
      mailStatusHtml = `<span class="oc-mail-badge sup">unsubscribed</span>`;
      mailActionsHtml = `<button type="button" class="btn sm" onclick="toggleCustomerSuppress('${encodeURIComponent(c.email)}')" title="Allow emailing this contributor again">Re-subscribe</button>`;
    } else {
      if (onList) {
        mailStatusHtml = `<span class="oc-mail-badge on">✓ On mailing list</span>`;
      } else {
        mailStatusHtml = `<span class="oc-mail-badge off">not on mailing list</span>`;
        mailActionsHtml = `<button type="button" class="btn sm" onclick="addBuyerToMailingList('${encodeURIComponent(c.email)}')" title="Add to mailing list">＋ Mailing list</button>`;
      }
      mailActionsHtml += ` <button type="button" class="btn sm" onclick="toggleCustomerSuppress('${encodeURIComponent(c.email)}')" title="Stop all emails to this contributor">Unsubscribe</button>`;
    }
    if (c.undeliverable) {
      mailStatusHtml = `<span class="oc-mail-badge sup" title="${escapeHtml(OC_PROBLEM_LABELS.bounced.tip)}">⚠ Undeliverable</span> ` + mailStatusHtml;
      mailActionsHtml += ` <button type="button" class="btn sm" onclick="ocClearUndeliverable('${c.id}')" title="Clear the bounce flag (e.g. after correcting the address)">Clear bounce</button>`;
    }
  }

  const emailCell = c.email
    ? (_isCustomerSuppressed(c.email)
      ? `<span style="text-decoration:line-through;color:var(--text3);">${escapeHtml(c.email)}</span>`
      : `<a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a>`)
    : '<span>no email</span>';

  let gmailLinksHtml = '';
  if (c.email && (c.gmailThreadId || c.creditThreadId || c.filesThreadId)) {
    const links = [];
    const link = (tid, label) => `<a href="https://mail.google.com/mail/u/0/#inbox/${encodeURIComponent(tid)}" target="_blank" rel="noopener" title="Open in Gmail">✉ ${label} ↗</a> <button type="button" class="oc-thread-preview" onclick="ocToggleInlineThread('${c.id}', '${escapeHtml(tid)}', '${label}')" title="Read the conversation here">👁 Read here</button>`;
    // Canonical thread: the conversation every stage email replies into.
    if (c.gmailThreadId) links.push(link(c.gmailThreadId, 'Conversation'));
    if (c.creditThreadId && c.creditThreadId !== c.gmailThreadId) links.push(link(c.creditThreadId, 'Credit reply'));
    if (c.filesThreadId && c.filesThreadId !== c.gmailThreadId) links.push(link(c.filesThreadId, 'Files reply'));
    gmailLinksHtml = `<span class="oc-gmail-links">${links.join('<span aria-hidden="true"> · </span>')}</span>`;
  } else if (c.email && c.selectionSent) {
    gmailLinksHtml = `<span class="oc-thread-warn" title="${escapeHtml(OC_PROBLEM_LABELS.noThread.tip)}">⚠ no linked conversation</span>`;
  }

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
          <span class="oc-photo-pick ${isPicked ? 'on' : ''}" role="button" tabindex="0" aria-pressed="${isPicked}" onclick="ocTogglePhotoPick('${c.id}', ${idx})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();ocTogglePhotoPick('${c.id}', ${idx});}" title="${isPicked ? 'Unpick this photo' : 'Pick this photo — emails will reference it'}">${isPicked ? '★' : '☆'}</span>
          ${escapeHtml(p)}
          <span class="oc-photo-chip-remove" role="button" tabindex="0" onclick="ocRemovePhotoFromContributor('${c.id}', ${idx})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();ocRemovePhotoFromContributor('${c.id}', ${idx});}" title="Remove photo" aria-label="Remove ${escapeHtml(p)}">✕</span>
        </span>`;
      }).join('')}
      ${pickStatus}
      <button type="button" id="oc-add-photo-btn-${c.id}" class="oc-add-photo-trigger" onclick="document.getElementById('oc-add-photo-input-${c.id}').style.display='inline-block'; this.style.display='none'; document.getElementById('oc-add-photo-input-${c.id}').focus();">＋ Add</button>
      <input id="oc-add-photo-input-${c.id}" class="oc-add-photo-input" type="text" placeholder="photo_file.jpg (Enter)" aria-label="New photo file name" onkeydown="if(event.key==='Enter') { ocAddPhotoToContributor('${c.id}', this.value); } else if(event.key==='Escape') { this.style.display='none'; document.getElementById('oc-add-photo-btn-${c.id}').style.display='inline-flex'; }">
    </div>`;

  // Clickable stage tracker — ticking a stage by hand is how the owner records
  // something that happened outside the app.
  let progressPercent = 0;
  if (c.preorderSent) progressPercent = 100;
  else if (c.filesReceived) progressPercent = 75;
  else if (c.cmykSent) progressPercent = 50;
  else if (c.creditReceived) progressPercent = 25;
  const stageIdx = OC_STAGES.findIndex(st => !c[st.key]);
  const stepHtml = (st, i) => {
    const doneVal = c[st.key];
    const cls = doneVal ? 'done' : (i === stageIdx ? 'active' : '');
    return `
      <button type="button" class="oc-step ${cls}" onclick="ocToggle('${c.id}','${st.key}')" aria-pressed="${!!doneVal}" title="${doneVal ? 'Mark “' + st.label + '” as not done' : 'Mark “' + st.label + '” as done'}">
        <span class="oc-step-circle">${doneVal ? '✓' : i + 1}</span>
        <span class="oc-step-label">${st.label}</span>
      </button>`;
  };

  const nudgeKey = ocNudgeTemplateKey(c);
  // Offered early here (before it's due); once due, the row's own button has it.
  const canNudge = nudgeKey && c.email && !c.undeliverable && !_isCustomerSuppressed(c.email) && !ocNudgeDue(c);
  const nudgeLabel = '↻ Send a reminder now';

  return `
    <div class="oc-detail-grid">
      <div class="oc-detail-contact">
        <div class="oc-email-row">${emailCell} ${mailStatusHtml}</div>
        ${gmailLinksHtml ? `<div class="oc-email-row">${gmailLinksHtml}</div>` : ''}
        ${c.creditName ? `<div class="oc-credit-line">Credit index: <strong>${escapeHtml(c.creditName)}</strong></div>` : ''}
        ${c.createdAt ? `<div class="oc-credit-line">Added ${escapeHtml(c.createdAt)}${c.nudgeCount ? ` · ${ocPlural_(c.nudgeCount, 'reminder')} sent` : ''}</div>` : ''}
      </div>
      <div class="oc-detail-actions">
        ${canNudge ? `<button type="button" class="btn sm" onclick="ocComposeNudge('${c.id}')" title="Send a friendly reminder, replying into their conversation">${nudgeLabel}</button>` : ''}
        <button type="button" class="btn sm" id="oc-scan-single-${c.id}" onclick="ocScanRepliesSingle('${c.id}')" title="Check Gmail for replies from this artist only">📥 Check replies</button>
        <button type="button" class="btn sm" onclick="openOcEditModal('${c.id}')" title="Edit contributor details">✎ Edit</button>
        <button type="button" class="btn sm danger-btn" onclick="ocDelete('${c.id}')" title="Remove contributor">✕ Remove</button>
      </div>
    </div>
    ${photosHtml}
    ${c.notes ? `<div class="oc-note"><strong>Note:</strong> ${escapeHtml(c.notes)}</div>` : ''}
    <div class="oc-status-strip">
      <div class="oc-step-container">
        <div class="oc-step-line"></div>
        <div class="oc-step-line-fill" style="width: ${progressPercent}%;"></div>
        ${OC_STAGES.map(stepHtml).join('')}
      </div>
      <div class="oc-step-hint">Tick a stage by hand if it happened outside the app.</div>
    </div>
    ${mailActionsHtml ? `<div class="oc-detail-mail">${mailActionsHtml}</div>` : ''}
    <div id="oc-inline-thread-${c.id}" class="oc-inline-thread-container" style="display:none;margin-top:12px;padding:12px;background:var(--surface-sunken);border-radius:var(--r);border:var(--stroke-hair) solid var(--border);max-height:280px;overflow-y:auto;font-size:12px;text-align:left;"></div>`;
}

function ocToggleExpand(id) {
  if (_ocExpanded.has(id)) _ocExpanded.delete(id);
  else _ocExpanded.add(id);
  renderOcList();
  $(`oc-row-toggle-${id}`)?.focus({ preventScroll: true });
}

function ocExpandAll(open) {
  ocVisibleContributors_().forEach(c => { if (open) _ocExpanded.add(c.id); else _ocExpanded.delete(c.id); });
  renderOcList();
}

function ocToggleSelect(id, checked) {
  if (checked) _ocSelected.add(id);
  else _ocSelected.delete(id);
  $(`oc-card-${id}`)?.classList.toggle('is-selected', !!checked);
  // Only the strip above the rows changes — the rows, their open threads and
  // keyboard focus stay put.
  ocRenderListHead_();
}

function ocSelectAllVisible(checked) {
  ocVisibleContributors_().forEach(c => { if (checked) _ocSelected.add(c.id); else _ocSelected.delete(c.id); });
  renderOcList();
}

function ocClearSelection() {
  _ocSelected.clear();
  renderOcList();
}

function ocClearFilters() {
  ocFilterStage = '';
  ocSearchQuery = '';
  const s = $('oc-search');
  if (s) s.value = '';
  renderOcList();
}

function ocSelectedContributors_() {
  return ocList().filter(c => _ocSelected.has(c.id));
}

function ocEmailSelected() {
  const ids = ocSelectedContributors_().map(c => c.id);
  if (!ids.length) { showToast('Select some contributors first', 'warn'); return; }
  openOcBulkModal(ids);
}

async function ocRemoveSelected() {
  if (ocBlockedForAuthor_()) return;
  const sel = ocSelectedContributors_();
  if (!sel.length) return;
  const names = sel.slice(0, 8).map(c => `• ${c.name || c.email || 'Unnamed'}`).join('\n');
  const ok = await confirmDialog(
    `Remove ${ocPlural_(sel.length, 'contributor')} from “${ocActiveProject_()?.title || 'this project'}”?\n\n${names}${sel.length > 8 ? `\n…and ${sel.length - 8} more` : ''}\n\nThis can't be undone.`,
    { title: 'Remove contributors', danger: true, okLabel: `Remove ${sel.length}` });
  if (!ok) return;
  const ids = new Set(sel.map(c => c.id));
  const proj = ocActiveProject_();
  proj.contributors = proj.contributors.filter(c => !ids.has(c.id));
  _ocSelected.clear();
  await _persistOpenCalls();
  renderOpenCall();
  showToast(`Removed ${ocPlural_(sel.length, 'contributor')}`);
}

function ocToggleAddPanel(force) {
  if (ocBlockedForAuthor_()) return;
  ocAddOpen = typeof force === 'boolean' ? force : !ocAddOpen;
  renderOpenCall();
  if (ocAddOpen) {
    const nameEl = $('oc-name');
    nameEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    nameEl?.focus({ preventScroll: true });
  }
}

// A friendly "still waiting on…" reply into the artist's conversation. It
// doesn't tick any stage — it just records that a reminder went out, so the
// app stops suggesting another one for a few days.
function ocComposeNudge(cId) {
  if (ocBlockedForAuthor_()) return;
  const proj = ocActiveProject_();
  if (!proj) return;
  const c = proj.contributors.find(x => x.id === cId);
  if (!c || !c.email) return;
  const key = ocNudgeTemplateKey(c);
  if (!key) { showToast('Nothing to remind this artist about right now', 'warn'); return; }
  ocEnsureTemplates_(proj);
  const tmpl = proj.templates[key];
  const ctx = { project: proj.title, date: localStorage.getItem('lm-oc-last-deadline') || '' };
  const subject = ocMergeTemplate(tmpl.subject, c, ctx);
  const body = ocMergeTemplate(ocTemplateBodyHtml_(tmpl.body), c, ctx);
  openOcEmailPreviewModal(cId, 'nudge', subject, body, c);
}

function ocTemplatesEditorHtml_(activeProj) {
  if (!activeProj) return '';
  if (!OC_TMPL_TABS.some(t => t.key === activeTmplTab)) activeTmplTab = 'selectionSent';
  const saved = activeProj.templates[activeTmplTab] || { subject: '', body: '' };
  const draft = _ocTmplDrafts[activeTmplTab];
  const subjectVal = draft ? draft.subject : saved.subject;
  const initialHtml = draft ? draft.html : deserializeHtmlToEditor(ocTemplateBodyHtml_(saved.body));
  const tmplOpen = ocUiOpen_('tmpl', false);
  const tabBtn = (t) => `<button type="button" class="oc-tmpl-tab ${activeTmplTab === t.key ? 'is-on' : ''}" aria-pressed="${activeTmplTab === t.key}" onclick="ocSetTmplTab('${t.key}')">${t.label}${_ocTmplDrafts[t.key] ? ' •' : ''}</button>`;
  const swatches = (type, colors) => colors.map(col => `<div class="oc-color-swatch" style="background:${col};${col === '#ffffff' ? 'border:var(--stroke-hair) solid #ccc;' : col === 'transparent' ? 'border:var(--stroke-hair) dashed #ccc;' : ''}" onmousedown="event.preventDefault()" onclick="ocApplyColor('${type}', '${col}')"></div>`).join('');

  return `
    <div class="card oc-collapse-card oc-settings-card ${tmplOpen ? 'open' : ''}">
      <div class="oc-collapse-head" role="button" tabindex="0" aria-expanded="${tmplOpen}" onclick="ocToggleSection('tmpl')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();ocToggleSection('tmpl');}">
        <div>
          <div class="oc-panel-title">✉ Email templates</div>
          <div class="oc-settings-sub">The wording for each stage email and reminder. Names, photos and dates fill in per artist.</div>
        </div>
        <span class="oc-collapse-chevron" aria-hidden="true">${tmplOpen ? '▾' : '▸'}</span>
      </div>
      ${tmplOpen ? `
      <div class="oc-tmpl-tabs" role="group" aria-label="Choose a template">${OC_TMPL_TABS.map(tabBtn).join('')}</div>
      <div class="oc-tmpl-grid">
        <div class="oc-tmpl-editor">
          <label class="oc-field"><span>Subject line</span>
            <input id="oc-tmpl-subject" type="text" value="${escapeHtml(subjectVal)}" oninput="ocMarkTmplDirty(); ocUpdateTmplPreview()" placeholder="Subject line">
          </label>
          <div class="oc-field"><span>Email body</span>
            <div class="oc-editor-container">
              <div id="oc-tmpl-body" class="oc-rich-editor" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Email body" oninput="ocMarkTmplDirty(); ocUpdateTmplPreview()">${initialHtml}</div>
              <div class="oc-editor-toolbar">
                <div class="oc-toolbar-group">
                  <button type="button" class="oc-toolbar-btn" onmousedown="event.preventDefault()" onclick="insertFormattingTag('bold')" title="Bold (Ctrl+B)"><b>B</b></button>
                  <button type="button" class="oc-toolbar-btn" onmousedown="event.preventDefault()" onclick="insertFormattingTag('italic')" title="Italic (Ctrl+I)"><i>I</i></button>
                  <button type="button" class="oc-toolbar-btn" onmousedown="event.preventDefault()" onclick="insertFormattingTag('underline')" title="Underline (Ctrl+U)"><u>U</u></button>
                  <div class="oc-dropdown-container">
                    <button type="button" class="oc-toolbar-btn" onmousedown="event.preventDefault()" onclick="ocToggleColorPalette('fore')" title="Text colour"><span class="oc-color-a">A</span></button>
                    <div id="oc-forecolor-palette" class="oc-color-palette">${swatches('fore', ['#0e0c0a', '#E8402A', '#e52e2e', '#1e40af', '#047857', '#78350f', '#6b21a8', '#4b5563', '#9ca3af', '#ffffff'])}</div>
                  </div>
                  <div class="oc-dropdown-container">
                    <button type="button" class="oc-toolbar-btn" onmousedown="event.preventDefault()" onclick="ocToggleColorPalette('back')" title="Highlight colour"><span class="oc-color-h">H</span></button>
                    <div id="oc-backcolor-palette" class="oc-color-palette">${swatches('back', ['#fef08a', '#bdf5bd', '#bfdbfe', '#fbcfe8', '#fed7aa', '#ddd6fe', '#E8402A', '#e52e2e', '#e5ddd0', 'transparent'])}</div>
                  </div>
                  <button type="button" class="oc-toolbar-btn" onmousedown="event.preventDefault()" onclick="insertFormattingTag('link')" title="Insert link">🔗</button>
                  <button type="button" class="oc-toolbar-btn" onmousedown="event.preventDefault()" onclick="insertFormattingTag('clear')" title="Clear formatting">Tx</button>
                </div>
                <div class="oc-toolbar-group" style="gap:5px;" aria-label="Insert a detail that fills in per artist">
                  <button type="button" class="oc-token-btn" onmousedown="event.preventDefault()" onclick="insertFormattingTag('name')" title="The artist's name">name</button>
                  <button type="button" class="oc-token-btn" onmousedown="event.preventDefault()" onclick="insertFormattingTag('photo')" title="The chosen photo file(s)">photo</button>
                  <button type="button" class="oc-token-btn" onmousedown="event.preventDefault()" onclick="insertFormattingTag('creditName')" title="The name for the credit index">creditName</button>
                  <button type="button" class="oc-token-btn" onmousedown="event.preventDefault()" onclick="insertFormattingTag('project')" title="This project's title">project</button>
                  <button type="button" class="oc-token-btn" onmousedown="event.preventDefault()" onclick="insertFormattingTag('date')" title="A deadline you type when sending">date</button>
                </div>
              </div>
            </div>
          </div>
          <div class="oc-inline-actions">
            <button type="button" class="btn gold" onclick="ocSaveTemplates()">Save template</button>
            <span id="oc-tmpl-unsaved" class="oc-unsaved" ${draft ? '' : 'hidden'}>● Unsaved changes</span>
          </div>
        </div>
        <div class="oc-preview-box">
          <div class="oc-preview-label">Preview · sample artist</div>
          <div class="oc-preview-subject" id="oc-preview-subject">—</div>
          <div class="oc-preview-body" id="oc-preview-body">—</div>
        </div>
      </div>` : ''}
    </div>`;
}

function ocAutomationHtml_(sched, lastScannedVal) {
  const open = ocUiOpen_('sender', false);
  const useResend = localStorage.getItem('lm-oc-use-resend') === 'true';
  const ocFromAlias = localStorage.getItem('lm-oc-fromalias') || '';
  const ocFromName = localStorage.getItem('lm-oc-fromname') || '';
  const scanDays = localStorage.getItem('lm-oc-scan-days') || '120';
  let ocAliasCache = [];
  try { ocAliasCache = JSON.parse(localStorage.getItem('lm-oc-alias-cache') || '[]'); } catch (_) { ocAliasCache = []; }
  const summary = [
    `from ${ocFromAlias || 'your Gmail'}`,
    sched.enabled ? `auto-check ${sched.minutes === 30 ? 'every 30 min' : 'hourly'}` : 'auto-check off',
  ].join(' · ');

  return `
    <div class="card oc-collapse-card oc-settings-card ${open ? 'open' : ''}">
      <div class="oc-collapse-head" role="button" tabindex="0" aria-expanded="${open}" onclick="ocToggleSection('sender')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();ocToggleSection('sender');}">
        <div>
          <div class="oc-panel-title">⚙ Sending &amp; reply checking</div>
          <div class="oc-settings-sub">${escapeHtml(summary)}</div>
        </div>
        <span class="oc-collapse-chevron" aria-hidden="true">${open ? '▾' : '▸'}</span>
      </div>
      <div class="oc-collapse-body oc-auto-grid" style="display:${open ? 'grid' : 'none'};">
        <fieldset class="oc-fieldset">
          <legend>Checking for replies</legend>
          <label class="oc-field"><span>Look back</span>
            <select id="oc-scan-days" onchange="localStorage.setItem('lm-oc-scan-days', this.value)">
              <option value="30" ${scanDays === '30' ? 'selected' : ''}>Last 30 days</option>
              <option value="60" ${scanDays === '60' ? 'selected' : ''}>Last 60 days</option>
              <option value="120" ${scanDays === '120' ? 'selected' : ''}>Last 120 days</option>
            </select>
          </label>
          <label class="oc-field" title="Runs the Gmail reply check on Google's servers on a timer — findings wait in “Replies to confirm”, and the digest emails you a summary. Works even when this app is closed. Requires the latest Apps Script deployed.">
            <span>Check automatically (even with the app closed)</span>
            <select id="oc-sched-interval" onchange="ocSetServerSchedule()" ${sheetsUrl ? '' : 'disabled'}>
              <option value="0" ${!sched.enabled ? 'selected' : ''}>Off</option>
              <option value="30" ${sched.enabled && sched.minutes === 30 ? 'selected' : ''}>Every 30 minutes</option>
              <option value="60" ${sched.enabled && sched.minutes === 60 ? 'selected' : ''}>Every hour</option>
            </select>
          </label>
          <label class="oc-check-line"><input type="checkbox" id="oc-sched-digest" ${sched.digest ? 'checked' : ''} ${sheetsUrl ? '' : 'disabled'} onchange="ocSetServerSchedule()"> Email me a summary when something is found <span id="oc-sched-status" class="oc-sched-status">${sched.enabled ? '● on' : ''}</span></label>
          ${lastScannedVal ? `<div class="oc-last-scanned">Last checked: ${formatDateTime(lastScannedVal)}</div>` : ''}
        </fieldset>
        <fieldset class="oc-fieldset">
          <legend>Who emails come from</legend>
          <label class="oc-field"><span>Send as</span>
            <input id="oc-from-alias" type="text" list="oc-alias-options" placeholder="default: your Gmail" value="${escapeHtml(ocFromAlias)}" oninput="ocSaveSenderConfig()">
            <datalist id="oc-alias-options">${ocAliasCache.map(a => `<option value="${escapeHtml(a)}"></option>`).join('')}</datalist>
          </label>
          <label class="oc-field"><span>Display name (optional)</span>
            <input id="oc-from-name" type="text" placeholder="e.g. Lyricalmyrical Books" value="${escapeHtml(ocFromName)}" oninput="ocSaveSenderConfig()">
          </label>
          <button type="button" class="btn sm" onclick="ocLoadSenderAliases()" ${sheetsUrl ? '' : 'disabled'}>↻ Load my Gmail aliases</button>
          <div class="oc-add-hint">Must be a verified Gmail “Send mail as” address (Gmail → Settings → Accounts). Sending from your own domain means fewer emails bounce or land in spam, and replies still thread. Leave blank to send from your Gmail.</div>
        </fieldset>
        <fieldset class="oc-fieldset">
          <legend>Developer sending (local only)</legend>
          <label class="oc-check-line"><input type="checkbox" id="oc-use-resend" onchange="ocToggleResend(this.checked)" ${useResend ? 'checked' : ''}> Send through Resend on this computer</label>
          <div id="oc-resend-fields" style="display:${useResend ? 'flex' : 'none'};flex-direction:column;gap:8px;">
            <label class="oc-field"><span>Resend API key</span>
              <input id="oc-resend-key" type="password" placeholder="re_..." value="${escapeHtml(localStorage.getItem('lm-resend-api-key') || '')}" oninput="ocSaveResendConfig()">
            </label>
            <label class="oc-field"><span>Sender email (verified)</span>
              <input id="oc-resend-from" type="email" placeholder="e.g. hello@yourdomain.com" value="${escapeHtml(localStorage.getItem('lm-resend-from') || '')}" oninput="ocSaveResendConfig()">
            </label>
          </div>
          <div class="oc-add-hint">Only for testing on a developer machine. On the live site, sending goes through your connected Google account.</div>
        </fieldset>
      </div>
    </div>`;
}

let _ocNewContributorPhotos = [];

function ocToggleResend(checked) {
  localStorage.setItem('lm-oc-use-resend', checked ? 'true' : 'false');
  // The key/sender fields show and hide with the checkbox, in place.
  const fields = $('oc-resend-fields');
  if (fields) fields.style.display = checked ? 'flex' : 'none';
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
  // The paste box lives in the Add panel — make sure it's showing.
  if (ocImportOpen) ocAddOpen = true;
  renderOpenCall();
  if (ocImportOpen) $('oc-import-text')?.focus();
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

// Copies every address in the project, or just the ticked ones.
function ocCopyEmails(onlySelected = false) {
  if (ocBlockedForAuthor_()) return;
  const source = onlySelected === true ? ocSelectedContributors_() : ocList();
  const emails = source.map(c => c.email).filter(Boolean);
  if (!emails.length) { showToast('No emails to copy', 'warn'); return; }
  const text = emails.join(', ');
  const done = () => showToast(`Copied ${emails.length} email${emails.length > 1 ? 's' : ''}`);
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, () => showToast('Copy failed', 'err'));
  else { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); done(); }
}

// Both redraw only the list, so the search box keeps its focus while typing.
function ocSearch(v) { ocSearchQuery = v || ''; renderOcList(); }

function ocFilterByStage(v) { ocFilterStage = v || ''; renderOcList(); }

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
  // Selections, open rows and template drafts all belong to the old project.
  _ocSelected.clear();
  _ocExpanded.clear();
  Object.keys(_ocTmplDrafts).forEach(k => delete _ocTmplDrafts[k]);
  _ocTmplDirty = false;
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

  ocMarkTmplDirty();
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

async function handleOcCsvFile(file) {
  if (!file || ocBlockedForAuthor_()) return;
  const fname = (file.name || '').toLowerCase();
  const isExcel = /\.(xlsx|xls)$/.test(fname);
  let xlsx;
  if (isExcel) {
    try {
      xlsx = await ensureXlsx();
    } catch {
      showToast('Excel support could not load. Check your connection or save the file as .csv.', 'err');
      return;
    }
  }
  const reader = new FileReader();
  reader.onload = async function (e) {
    try {
      let text;
      if (isExcel) {
        const wb = xlsx.read(new Uint8Array(e.target.result), { type: 'array' });
        text = xlsx.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]);
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
  e.currentTarget.style.background = 'rgba(232,  64,  42, 0.06)';
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

  const availableThreadId = c.gmailThreadId
    || (stageKey === 'cmykSent' ? c.creditThreadId
      : stageKey === 'preorderSent' ? c.filesThreadId
        : stageKey === 'nudge' ? (c.creditThreadId || c.filesThreadId)
          : null);

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
        <div style="font-family:var(--font-ui);font-size:16px;font-weight:700;color:var(--gold-text);">✉ Review Email to ${escapeHtml(c.name)}</div>
        <button type="button" class="btn sm" onclick="closeOcEmailPreviewModal()" style="padding:4px 8px;font-size:12px;" aria-label="Close dialog" title="Close (Esc)">✕</button>
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
  const stageLabelMap = { selectionSent: 'Selection Notice', cmykSent: 'Request Files', preorderSent: 'Pre-order Info', nudge: 'reminder' };
  const okToSend = await confirmDialog(
    `Send this ${stageLabelMap[stageKey] || 'pipeline'} email to ${c.name || c.email} <${c.email}> now?\n\nIt goes to a real inbox and can't be unsent.`,
    { title: 'Confirm send', okLabel: 'Send email', cancelLabel: 'Cancel', danger: true }
  );
  if (!okToSend) return;

  const subject = window._ocPreviewSubject;
  const htmlBody = window._ocPreviewBody;
  // Let the browser's parser produce the text version; a tag-stripping regex
  // can leave half-tags behind in the plain-text copy.
  const plainBody = new DOMParser().parseFromString(htmlBody, 'text/html').body.textContent || '';
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
    if (stageKey === 'nudge') {
      // A reminder moves no stage — it just pauses the "needs a reminder"
      // prompt for this artist for a few days.
      c.lastNudgedAt = new Date().toISOString();
      c.nudgeCount = (c.nudgeCount || 0) + 1;
    } else {
      c[stageKey] = true;
      ocStamp_(c);
    }
    // Promote whichever thread this email used to the contributor's canonical
    // thread, so every subsequent stage email lands in the same conversation.
    const usedThreadId = (resp && resp.threadId) ? resp.threadId : threadId;
    if (usedThreadId) c.gmailThreadId = usedThreadId;
    await _persistOpenCalls();
    closeOcEmailPreviewModal();
    renderOpenCall();
    showToast(stageKey === 'nudge' ? `✓ Reminder sent to ${c.name || c.email}` : `✓ Email sent successfully to ${c.name || c.email}!`);
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

  const daysBack = parseInt($('oc-scan-days')?.value || localStorage.getItem('lm-oc-scan-days') || 120, 10);

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
         <span style="font-size:var(--text-xs);color:var(--text3);margin-left:auto;align-self:center;">${_ocSubmissionResults.length} found</span>
       </div>` +
    _ocSubmissionResults.map((s, idx) => {
      const n = (s.photos || []).length;
      const list = n ? ': ' + escapeHtml(s.photos.slice(0, 5).join(', ')) + (n > 5 ? ' …' : '') : '';
      return `
        <label style="display:flex;align-items:flex-start;gap:8px;font-size:var(--text-sm);color:var(--text);cursor:pointer;padding:6px 4px;border-bottom:var(--stroke-hair) solid var(--border);">
          <input type="checkbox" class="oc-sub-check" value="${idx}" checked style="margin-top:2px;cursor:pointer;">
          <span style="flex:1;">
            <strong>${escapeHtml(s.name || '—')}</strong> <span style="color:var(--text3);">&lt;${escapeHtml(s.email)}&gt;</span><br>
            <span style="color:var(--text3);font-size:var(--text-xs);">${n} attachment${n === 1 ? '' : 's'}${list}</span>
          </span>
        </label>`;
    }).join('')
    : '<div style="font-size:var(--text-sm);color:var(--text3);font-style:italic;padding:10px 0;">Run a search to find submission emails. New contributors are matched by sender; anyone already in this project is skipped.</div>';

  modal.innerHTML = `
    <div class="card" style="width:94%;max-width:620px;max-height:90vh;overflow-y:auto;padding:24px;position:relative;" onclick="event.stopPropagation()">
      <button type="button" class="modal-close-btn" onclick="closeOcImportGmailModal()" style="position:absolute;top:15px;right:15px;" aria-label="Close dialog" title="Close (Esc)">✕</button>
      <div style="font-family:var(--font-display);font-size:20px;font-weight:700;color:var(--gold-text);margin-bottom:4px;">📨 Import Submissions from Gmail</div>
      <div style="font-size:var(--text-sm);color:var(--text3);margin-bottom:16px;">Find the artists' original submission emails and add them as contributors — each one's thread is captured so every stage email replies into it.</div>

      <label style="font-size:var(--text-2xs);color:var(--text3);font-weight:600;text-transform:uppercase;display:block;margin-bottom:4px;">Gmail search</label>
      <input id="oc-sub-query" value="${escapeHtml(lastQuery)}" placeholder='e.g. label:open-call  or  subject:"open call submission"' style="width:100%;box-sizing:border-box;font-family:monospace;font-size:var(--text-sm);padding:9px 11px;">
      <div style="display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap;">
        <select id="oc-sub-days" style="font-size:var(--text-sm);">
          <option value="30" ${lastDays === '30' ? 'selected' : ''}>Last 30 days</option>
          <option value="60" ${lastDays === '60' ? 'selected' : ''}>Last 60 days</option>
          <option value="120" ${lastDays === '120' ? 'selected' : ''}>Last 120 days</option>
          <option value="365" ${lastDays === '365' ? 'selected' : ''}>Last 12 months</option>
        </select>
        <button class="btn sm gold" id="oc-sub-search-btn" onclick="ocImportGmailSearch()">🔍 Search Gmail</button>
      </div>

      <div id="oc-sub-results" style="margin-top:12px;max-height:38vh;overflow-y:auto;">${resultsHtml}</div>

      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;border-top:var(--stroke-hair) solid var(--border);padding-top:14px;">
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

  const daysBack = parseInt($('oc-scan-days')?.value || localStorage.getItem('lm-oc-scan-days') || 120, 10);

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
        <div style="margin-bottom:12px;border-bottom:var(--stroke-hair) solid rgba(255,255,255,0.05);padding-bottom:8px;${idx === data.messages.length - 1 ? 'border-bottom:none;margin-bottom:0;padding-bottom:0;' : ''}">
          <div class="row-between" style="font-size:var(--text-xs);color:var(--text3);margin-bottom:4px;">
            <strong style="${isMe ? 'color:var(--gold2);' : ''}">${escapeHtml(msg.from)}</strong>
            <span>${dateStr}</span>
          </div>
          <div style="white-space:pre-wrap;line-height:1.5;color:var(--text2);font-family:inherit;background:rgba(255,255,255,0.01);padding:6px;border-radius:var(--r);border:var(--stroke-hair) solid rgba(255,255,255,0.02);">${escapeHtml(msg.body)}</div>
          ${msg.attachments && msg.attachments.length > 0 ? `
            <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;">
              ${msg.attachments.map(att => `
                <button type="button" class="pill gray" style="font-size:var(--text-2xs);padding:2px 6px;background:rgba(255,255,255,0.05);border:var(--stroke-hair) solid rgba(255,255,255,0.1);color:var(--text2);cursor:pointer;display:inline-flex;align-items:center;gap:4px;" onclick="downloadOcAttachment('${msg.id}', '${escapeHtml(att.name)}', this)" title="Click to download attachment">
                  📎 ${escapeHtml(att.name)} (${Math.round(att.size / 1024)} KB)
                </button>
              `).join('')}
            </div>
          ` : ''}
        </div>`;
    }).join('');

    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:var(--stroke-hair) solid var(--border);padding-bottom:6px;margin-bottom:10px;">
        <strong style="color:var(--gold2);text-transform:uppercase;font-size:var(--text-2xs);letter-spacing:0.05em;">✉ ${title} Preview</strong>
        <button class="btn sm" onclick="document.getElementById('oc-inline-thread-${cId}').style.display='none'" style="padding:0 8px;height:20px;font-size:var(--text-2xs);margin:0;">Hide</button>
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
    <div class="card" style="width:94%;max-width:500px;background:var(--card-bg, #fff);border:var(--stroke-hair) solid var(--border);border-radius:var(--r3);padding:24px;box-shadow:var(--elev-4);position:relative;" onclick="event.stopPropagation()">
      <button type="button" class="modal-close-btn" onclick="closeOcEditModal()" style="position:absolute;top:15px;right:15px;" aria-label="Close dialog" title="Close (Esc)">✕</button>
      
      <div style="font-family:var(--font-display);font-size:20px;font-weight:700;color:var(--gold-text);margin-bottom:4px;">✎ Edit Contributor</div>
      <div style="font-size:var(--text-sm);color:var(--text3);margin-bottom:18px;">Update artist details and internal notes.</div>
      
      <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:20px;">
        <div>
          <label style="font-size:var(--text-xs);color:var(--text3);font-weight:600;display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.04em;">Artist Name</label>
          <input id="oc-edit-name" type="text" value="${escapeHtml(c.name || '')}" style="width:100%;padding:8px 12px;font-size:var(--text-base);background:var(--input-bg);color:var(--text);border:var(--stroke-hair) solid var(--border);border-radius:var(--r);box-sizing:border-box;">
        </div>
        
        <div>
          <label style="font-size:var(--text-xs);color:var(--text3);font-weight:600;display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.04em;">Email Address</label>
          <input id="oc-edit-email" type="email" value="${escapeHtml(c.email || '')}" style="width:100%;padding:8px 12px;font-size:var(--text-base);background:var(--input-bg);color:var(--text);border:var(--stroke-hair) solid var(--border);border-radius:var(--r);box-sizing:border-box;">
        </div>
        
        <div>
          <label style="font-size:var(--text-xs);color:var(--text3);font-weight:600;display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.04em;">Credit Name (For credits index)</label>
          <input id="oc-edit-creditname" type="text" value="${escapeHtml(c.creditName || '')}" placeholder="e.g. ${escapeHtml(c.name || '')}" style="width:100%;padding:8px 12px;font-size:var(--text-base);background:var(--input-bg);color:var(--text);border:var(--stroke-hair) solid var(--border);border-radius:var(--r);box-sizing:border-box;">
        </div>
        
        <div>
          <label style="font-size:var(--text-xs);color:var(--text3);font-weight:600;display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.04em;">Photos (comma-separated list)</label>
          <input id="oc-edit-photos" type="text" value="${escapeHtml((c.photos || []).join(', '))}" placeholder="e.g. photo1.jpg, photo2.jpg" style="width:100%;padding:8px 12px;font-size:var(--text-base);background:var(--input-bg);color:var(--text);border:var(--stroke-hair) solid var(--border);border-radius:var(--r);box-sizing:border-box;">
        </div>
        
        <div>
          <label style="font-size:var(--text-xs);color:var(--text3);font-weight:600;display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.04em;">Internal Notes</label>
          <textarea id="oc-edit-notes" rows="3" style="width:100%;padding:8px 12px;font-size:var(--text-base);background:var(--input-bg);color:var(--text);border:var(--stroke-hair) solid var(--border);border-radius:var(--r);box-sizing:border-box;font-family:inherit;resize:vertical;">${escapeHtml(c.notes || '')}</textarea>
        </div>
        
        <div>
          <label style="font-size:var(--text-xs);color:var(--text3);font-weight:600;display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.04em;">Gmail Thread ID (For replying/tracking)</label>
          <input id="oc-edit-threadid" type="text" value="${escapeHtml(c.gmailThreadId || '')}" placeholder="e.g. 18f8c4a9d7e3b2a1" style="width:100%;padding:8px 12px;font-size:var(--text-base);background:var(--input-bg);color:var(--text);border:var(--stroke-hair) solid var(--border);border-radius:var(--r);box-sizing:border-box;font-family:monospace;">
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
  delete _ocTmplDrafts[activeTmplTab];
  _ocTmplDirty = false;

  await _persistOpenCalls();
  renderOpenCall();
  const label = OC_TMPL_TABS.find(t => t.key === activeTmplTab)?.label || 'Email';
  showToast(`✓ “${label}” template saved`);
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

// ── Decoupled Open Call Portal

// Project Actions

function parseMarkdownToHtml(text) {
  let html = escapeHtml(text);

  // Restore safe HTML tags that might have been escaped
  // 1. Restore <mark style="..."> and </mark>
  html = html.replace(/&lt;mark style=&quot;(.*?)&quot;&gt;/gi, '<mark style="$1">');
  html = html.replace(/&lt;mark&gt;/gi, '<mark>');
  html = html.replace(/&lt;\/mark&gt;/gi, '</mark>');

  // 2. Restore <span style="..."> and </span>
  html = html.replace(/&lt;span style=&quot;(.*?)&quot;&gt;/gi, '<span style="$1">');
  html = html.replace(/&lt;span&gt;/gi, '<span>');
  html = html.replace(/&lt;\/span&gt;/gi, '</span>');

  // 3. Restore other basic tags if they typed them
  html = html.replace(/&lt;strong&gt;/gi, '<strong>').replace(/&lt;\/strong&gt;/gi, '</strong>');
  html = html.replace(/&lt;em&gt;/gi, '<em>').replace(/&lt;\/em&gt;/gi, '</em>');
  html = html.replace(/&lt;br&gt;/gi, '<br>');

  // bold **text** or __text__
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');
  // italic *text* or _text_
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  html = html.replace(/_(.*?)_/g, '<em>$1</em>');
  // links [label](url)
  html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" style="color:var(--gold2);text-decoration:underline;">$1</a>');
  // line breaks
  html = html.replace(/\n/g, '<br>');
  return html;
}

function insertFormattingTag(tag) {
  const editor = $('oc-tmpl-body');
  if (!editor) return;

  editor.focus();

  const selection = window.getSelection();
  let range;
  if (selection.rangeCount > 0) {
    range = selection.getRangeAt(0);
  } else {
    range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
  }

  const selectedText = selection.toString();

  if (tag === 'bold') {
    document.execCommand('bold', false, null);
  } else if (tag === 'italic') {
    document.execCommand('italic', false, null);
  } else if (tag === 'underline') {
    document.execCommand('underline', false, null);
  } else if (tag === 'link') {
    const url = prompt('Enter URL:', 'https://');
    if (!url) return;
    document.execCommand('createLink', false, url);
  } else if (tag === 'clear') {
    document.execCommand('removeFormat', false, null);
  } else if (tag === 'highlight') {
    const mark = document.createElement('mark');
    mark.style.backgroundColor = '#fef08a';
    mark.style.color = '#000000';
    mark.style.padding = '2px 4px';
    mark.style.borderRadius = '4px';
    mark.textContent = selectedText || 'highlighted text';
    range.deleteContents();
    range.insertNode(mark);
    range.setStartAfter(mark);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  } else if (tag === 'color') {
    const span = document.createElement('span');
    span.style.color = '#c5a880';
    span.textContent = selectedText || 'colored text';
    range.deleteContents();
    range.insertNode(span);
    range.setStartAfter(span);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  } else {
    const badge = document.createElement('span');
    badge.className = 'oc-token-badge';
    badge.setAttribute('contenteditable', 'false');
    badge.setAttribute('data-token', tag);
    badge.textContent = `{{${tag}}}`;

    range.deleteContents();
    range.insertNode(badge);
    range.setStartAfter(badge);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  ocMarkTmplDirty();
  ocUpdateTmplPreview();
}

function serializeEditorHtml(html) {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  const badges = tempDiv.querySelectorAll('.oc-token-badge');
  badges.forEach(badge => {
    const token = badge.getAttribute('data-token');
    badge.replaceWith(`{{${token}}}`);
  });
  return tempDiv.innerHTML;
}

function deserializeHtmlToEditor(html) {
  let res = html;
  const tokens = ['name', 'photo', 'creditName', 'project', 'date'];
  tokens.forEach(t => {
    const regex = new RegExp(`\\{\\{${t}\\}\\}`, 'g');
    res = res.replace(regex, `<span class="oc-token-badge" contenteditable="false" data-token="${t}">{{${t}}}</span>`);
  });
  return res;
}

// Apply a parsed file import: preview what's about to happen (count, dupes,
// first few names) → confirm → add. Routes through the same parser and
// newContributor() the paste path uses, so file uploads get identical
// behavior: all 5 columns honored, stage flags initialized, photos split.

// Preset Compose Actions

// ── Open Call: import submissions from Gmail (intake) ─────────────────────
// Finds the artists' original "here are my photos" emails and turns each into a
// contributor — name, email, photo filenames, and the submission thread id, so
// every later stage email replies into that same thread.

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
  renderOcList,
  ocPlaceMenu,
  ocMarkTmplDirty,
  ocToggleExpand,
  ocExpandAll,
  ocToggleSelect,
  ocSelectAllVisible,
  ocClearSelection,
  ocClearFilters,
  ocEmailSelected,
  ocRemoveSelected,
  ocToggleAddPanel,
  ocComposeNudge,
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
  parseMarkdownToHtml,
  insertFormattingTag,
  serializeEditorHtml,
  deserializeHtmlToEditor,
};
