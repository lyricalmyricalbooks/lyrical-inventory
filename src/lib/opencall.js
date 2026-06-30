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
