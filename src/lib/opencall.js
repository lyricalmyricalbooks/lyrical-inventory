// Open-call pipeline — pure helpers (no DOM, no Firebase) so they can be
// unit-tested in isolation. The UI layer in main.js imports these.

// The five stages every contributor moves through, in order. `hint` is the
// "next action" shown when that stage is the first one not yet ticked.
export const OC_STAGES = [
  { key: 'selectionSent',  label: 'Selected',        hint: 'Send the selection email' },
  { key: 'creditReceived', label: 'Credit name',     hint: 'Awaiting credit-name reply' },
  { key: 'cmykSent',       label: 'Files requested',  hint: 'Send the CMYK/files request' },
  { key: 'filesReceived',  label: 'Files in',         hint: 'Awaiting high-res files' },
  { key: 'preorderSent',   label: 'Pre-order',        hint: 'Send the pre-order email' },
];

// First stage not yet ticked = the next thing to do. null when all done.
export function ocNextAction(contributor) {
  const stage = OC_STAGES.find(st => !contributor[st.key]);
  return stage ? stage.hint : null;
}

// A fresh contributor with every stage flag cleared.
export function newContributor({ name = '', email = '', photo = '', photos = [], createdAt = '', creditName = '', notes = '' } = {}) {
  const flags = {};
  OC_STAGES.forEach(st => { flags[st.key] = false; });
  
  let finalPhotos = [...photos];
  if (finalPhotos.length === 0 && photo) {
    finalPhotos = photo.split(/;\s*|,\s*/).map(p => p.trim()).filter(Boolean);
  }
  const finalPhoto = photo || finalPhotos.join(', ');

  return {
    id: 'oc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    name, email, photo: finalPhoto, photos: finalPhotos, createdAt, creditName, notes, ...flags,
  };
}

// Parse pasted spreadsheet rows ("Name, Email, Photo", tab- or comma-
// separated) into new contributors. Skips a header row, blank lines, and
// any email already present in `existingEmails` (case-insensitive).
// Returns { contributors, added, skipped }.
export function parseContributorRows(raw, existingEmails = []) {
  const seen = new Set(existingEmails.map(e => (e || '').toLowerCase()).filter(Boolean));
  const contributors = [];
  let added = 0, skipped = 0;

  (raw || '').split(/\r?\n/).forEach(line => {
    if (!line.trim()) return;
    const isTab = line.includes('\t');
    const cols = isTab ? line.split('\t').map(p => p.trim()) : line.split(',').map(p => p.trim());
    const [name = '', email = '', photo = ''] = cols;
    // Header row: "Artist Name" alone, or a "name … email" header pair.
    if (/^artist\s*name$/i.test(name) || (/^name$/i.test(name) && /e-?mail/i.test(email))) return;
    if (!name && !email) return;
    const key = email.toLowerCase();
    if (key && seen.has(key)) { skipped++; return; }
    if (key) seen.add(key);
    
    // Support multiple photos in the photo column (separated by comma or semicolon)
    const photos = photo ? photo.split(/;\s*|,\s*/).map(p => p.trim()).filter(Boolean) : [];
    contributors.push(newContributor({ name, email, photo, photos }));
    added++;
  });

  return { contributors, added, skipped };
}

// Merge fields a stage template can reference, in the order they're shown to
// the user. Each maps to how the value is resolved for a contributor.
export const OC_MERGE_FIELDS = ['name', 'photo', 'creditName', 'project', 'date'];

// ── Approval inbox ─────────────────────────────────────────────────────────
// Gmail scans no longer flip stage flags directly: each finding becomes a
// *proposal* the owner approves or dismisses in the Review inbox. A proposal's
// `type` is 'creditReceived', 'filesReceived', or 'undeliverable'.

// Stable identity for dedupe: the same detection (same contributor, same kind,
// same Gmail thread) must never be proposed twice — including after a dismiss.
export function ocProposalKey(p) {
  return `${p.contributorId}:${p.type}:${p.threadId || ''}`;
}

// Human line for toasts and the scan summary dialog.
export function ocProposalSummary(p) {
  if (!p) return '';
  if (p.type === 'creditReceived') {
    return 'Credit-name reply detected' + (p.creditName ? ` (proposed: “${p.creditName}”)` : '');
  }
  if (p.type === 'filesReceived') return 'High-res files attachment detected';
  if (p.type === 'undeliverable') return 'Email bounced (undeliverable)';
  return '';
}

// Turn raw scan updates (the webhook's shape: { email, creditReceived?,
// creditName?, creditThreadId?, filesReceived?, filesThreadId?, undeliverable?,
// bounceThreadId? }) into proposals. Skips updates for unknown emails, stages
// the contributor already has, proposals already pending, and detections the
// owner previously dismissed.
export function ocProposalsFromScan(updates, contributors, pending = [], dismissed = {}) {
  const byEmail = new Map();
  (contributors || []).forEach(c => {
    if (c && c.email) byEmail.set(String(c.email).toLowerCase(), c);
  });
  const seen = new Set((pending || []).map(ocProposalKey));
  const out = [];
  (updates || []).forEach(up => {
    if (!up) return;
    const c = byEmail.get(String(up.email || '').toLowerCase());
    if (!c) return;
    const add = (type, threadId, extra) => {
      const p = {
        id: 'ocp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        contributorId: c.id,
        type,
        threadId: threadId || '',
        detectedAt: new Date().toISOString(),
        ...extra,
      };
      const key = ocProposalKey(p);
      if (seen.has(key) || (dismissed && dismissed[key])) return;
      seen.add(key);
      out.push(p);
    };
    if (up.creditReceived && !c.creditReceived) add('creditReceived', up.creditThreadId, { creditName: String(up.creditName || '').trim() });
    if (up.filesReceived && !c.filesReceived) add('filesReceived', up.filesThreadId, {});
    if (up.undeliverable && !c.undeliverable) add('undeliverable', up.bounceThreadId, {});
  });
  return out;
}

// Apply an approved proposal to its contributor (mutates). Returns the summary
// line for the confirmation toast, or '' for an unknown type.
export function ocApplyProposal(contributor, proposal) {
  if (!contributor || !proposal) return '';
  if (proposal.type === 'creditReceived') {
    contributor.creditReceived = true;
    if (proposal.threadId) contributor.creditThreadId = proposal.threadId;
    if (proposal.creditName) contributor.creditName = proposal.creditName;
    return 'Credit name received' + (proposal.creditName ? ` (“${proposal.creditName}”)` : '');
  }
  if (proposal.type === 'filesReceived') {
    contributor.filesReceived = true;
    if (proposal.threadId) contributor.filesThreadId = proposal.threadId;
    return 'High-res files received';
  }
  if (proposal.type === 'undeliverable') {
    contributor.undeliverable = true;
    if (proposal.threadId) contributor.bounceThreadId = proposal.threadId;
    return 'Marked undeliverable (bounced)';
  }
  return '';
}

// ── Next-step outbox ───────────────────────────────────────────────────────
// The moment a receive-stage ticks, the next send-stage email is queued in the
// "Ready to send" outbox — mirrors the gating pipelineEmailBtnHtml uses.

// The send-stage this contributor is ready for, or null.
export function ocNextSendStage(c) {
  if (!c) return null;
  if (c.creditReceived && !c.cmykSent) return 'cmykSent';
  if (c.filesReceived && !c.preorderSent) return 'preorderSent';
  return null;
}

export function ocOutboxKey(e) {
  return `${e.contributorId}:${e.stageKey}`;
}

// Outbox entries to queue for this contributor right now (0 or 1). Skips
// contributors with no email or a bounced address, stages already queued, and
// stages the owner removed from the outbox before.
export function ocOutboxAdditions(contributor, existing = [], dismissed = {}) {
  if (!contributor || !contributor.email || contributor.undeliverable) return [];
  const stageKey = ocNextSendStage(contributor);
  if (!stageKey) return [];
  const entry = {
    id: 'oce_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    contributorId: contributor.id,
    stageKey,
    createdAt: new Date().toISOString(),
  };
  const key = ocOutboxKey(entry);
  if ((existing || []).some(e => ocOutboxKey(e) === key)) return [];
  if (dismissed && dismissed[key]) return [];
  return [entry];
}

// Drop queue entries that no longer make sense: proposals whose stage got
// ticked some other way, and outbox entries whose contributor was deleted,
// bounced, already got the email, or lost the prerequisite stage.
export function ocPruneQueues(contributors, inbox, outbox) {
  const byId = new Map((contributors || []).map(c => [c.id, c]));
  const prunedInbox = (inbox || []).filter(p => {
    const c = byId.get(p.contributorId);
    if (!c) return false;
    if (p.type === 'creditReceived') return !c.creditReceived;
    if (p.type === 'filesReceived') return !c.filesReceived;
    if (p.type === 'undeliverable') return !c.undeliverable;
    return false;
  });
  const prunedOutbox = (outbox || []).filter(e => {
    const c = byId.get(e.contributorId);
    return !!c && !c.undeliverable && ocNextSendStage(c) === e.stageKey;
  });
  return { inbox: prunedInbox, outbox: prunedOutbox };
}

// Resolve {{token}} merge fields the way every sender does — creditName falls
// back to the contributor's name, name falls back to 'Artist'.
export function ocMergeTemplate(str, contributor = {}, context = {}) {
  const c = contributor || {};
  const ctx = context || {};
  return String(str == null ? '' : str)
    .replace(/\{\{name\}\}/g, c.name || 'Artist')
    .replace(/\{\{photo\}\}/g, c.photo || '')
    .replace(/\{\{creditName\}\}/g, c.creditName || c.name || 'Artist')
    .replace(/\{\{project\}\}/g, ctx.project || '')
    .replace(/\{\{date\}\}/g, ctx.date || '');
}

// Which merge fields in `template` would resolve to an empty string for this
// contributor — i.e. the email would go out with that spot blank (the classic
// 'your photo "" has been selected' bug). `context` supplies the non-contributor
// values (project title, deadline). `creditName` falls back to the contributor
// name, mirroring the sender. Returns the offending field names, in OC_MERGE_FIELDS
// order; an empty array means every referenced token has data.
export function findUnfilledMergeFields(template, contributor = {}, context = {}) {
  const text = String(template || '');
  const c = contributor || {};
  const ctx = context || {};
  const resolved = {
    name: c.name || '',
    photo: c.photo || '',
    creditName: c.creditName || c.name || '',
    project: ctx.project || '',
    date: ctx.date || '',
  };
  return OC_MERGE_FIELDS.filter(field => {
    const token = '{{' + field + '}}';
    return text.includes(token) && !String(resolved[field]).trim();
  });
}
