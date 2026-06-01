/* Lyricalmyrical — Open Call automation
 *
 * Turns the manual "Collective Photobook open call" spreadsheet into a
 * three-stage mail-merge run from a Gmail menu. For each artist row it
 * creates a Gmail DRAFT (you review + send by hand), and a reply scanner
 * auto-ticks the "received" columns when artists write back.
 *
 * Stages (each only fires once the previous one is marked Sent):
 *   1. Selection      — "you're in, reply with your credit name"
 *   2. CMYK / files    — "send the print-ready TIFF"
 *   3. Pre-order       — "pre-orders are open, here's your code"
 *
 * Next year: clear the artist rows, paste the new list, tweak the three
 * template rows on the "Open Call Templates" tab, click the menu buttons.
 *
 * Templates use {{name}} and {{photo}} placeholders.
 *
 * NOTE: this file is independent of the sheet-sync backend in Code.gs.
 * Both can live in the same Apps Script project; if onOpen already exists
 * there, merge the two onOpen bodies (see onOpen note below).
 */

// Header labels we read on the artist sheet. Match the existing columns.
const OC_COL = {
  name: 'Artist Name',
  email: 'Email Address',
  photo: 'Photo Files',
  selectionSent: 'Email Sent',
  creditReceived: 'Name for Credits Received',
  filesReceived: 'High-Res Files Received',
  cmykSent: 'CMYK Email Sent',
  preorderSent: 'Pre-Order Email Sent'
};

const OC_TEMPLATES_SHEET = 'Open Call Templates';

// One row per stage. `gateOn` is the Sent column that must already be TRUE
// before this stage is eligible (null = first stage, always eligible).
// `sentCol` is the column this stage would eventually flip (used to skip
// rows that are already done — we never flip it ourselves since drafts
// aren't sent yet).
const OC_STAGES = [
  { key: 'selection', label: 'Stage 1 — Selection', gateOn: null,                  sentCol: 'selectionSent' },
  { key: 'cmyk',      label: 'Stage 2 — CMYK / files', gateOn: 'selectionSent',    sentCol: 'cmykSent' },
  { key: 'preorder',  label: 'Stage 3 — Pre-order',  gateOn: 'cmykSent',           sentCol: 'preorderSent' }
];

// ─────────────────────────────────────────────────────────────
// Menu
// ─────────────────────────────────────────────────────────────
// If Code.gs (or another file) already defines onOpen, delete this one and
// add the addMenu lines below into that existing onOpen instead.
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📤 Open Call')
    .addItem('Stage 1 — draft selection emails', 'ocDraftSelection')
    .addItem('Stage 2 — draft CMYK / file requests', 'ocDraftCmyk')
    .addItem('Stage 3 — draft pre-order emails', 'ocDraftPreorder')
    .addSeparator()
    .addItem('Scan replies → update tracking', 'ocScanReplies')
    .addSeparator()
    .addItem('Set up / reset template tab', 'ocSetupTemplates')
    .addToUi();
}

// Menu entry points (Apps Script menu items can't pass args).
function ocDraftSelection() { ocDraftStage_('selection'); }
function ocDraftCmyk()      { ocDraftStage_('cmyk'); }
function ocDraftPreorder()  { ocDraftStage_('preorder'); }

// ─────────────────────────────────────────────────────────────
// Core: build drafts for one stage
// ─────────────────────────────────────────────────────────────
function ocDraftStage_(stageKey) {
  const ui = SpreadsheetApp.getUi();
  const stage = OC_STAGES.find(s => s.key === stageKey);
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const tmpl = ocGetTemplate_(stageKey);
  if (!tmpl) {
    ui.alert(`No template found for "${stage.label}". Run "Set up / reset template tab" first.`);
    return;
  }

  const sheet = ocFindArtistSheet_(ss);
  if (!sheet) { ui.alert('Could not find the artist sheet (looked for an "Artist Name" header).'); return; }

  const { rows, col } = ocReadRows_(sheet);
  const existingDrafts = ocExistingDraftKeys_();

  let created = 0, skippedDone = 0, skippedGate = 0, skippedDup = 0, skippedNoEmail = 0;

  rows.forEach(r => {
    const email = (r[col[OC_COL.email]] || '').toString().trim();
    const name = (r[col[OC_COL.name]] || '').toString().trim();
    if (!email || !name) { skippedNoEmail++; return; }

    // Already completed this stage?
    if (ocIsTrue_(r[col[OC_COL[stage.sentCol]]])) { skippedDone++; return; }
    // Previous stage not done yet?
    if (stage.gateOn && !ocIsTrue_(r[col[OC_COL[stage.gateOn]]])) { skippedGate++; return; }

    const photo = (r[col[OC_COL.photo]] || '').toString().trim();
    const subject = tmpl.subject;
    const body = tmpl.body.replace(/\{\{name\}\}/g, name).replace(/\{\{photo\}\}/g, photo);

    // Skip if we already drafted this exact email (lets you re-run safely).
    if (existingDrafts.has(ocDraftKey_(email, subject))) { skippedDup++; return; }

    GmailApp.createDraft(email, subject, body);
    existingDrafts.add(ocDraftKey_(email, subject));
    created++;
  });

  ui.alert(
    `${stage.label}\n\n` +
    `Drafts created: ${created}\n` +
    `Already sent (skipped): ${skippedDone}\n` +
    `Waiting on prior stage: ${skippedGate}\n` +
    `Draft already existed: ${skippedDup}\n` +
    `Missing name/email: ${skippedNoEmail}\n\n` +
    `Open Gmail → Drafts to review and send. The "${OC_COL[stage.sentCol]}" box stays FALSE until you actually send and tick it.`
  );
}

// ─────────────────────────────────────────────────────────────
// Reply scanning: auto-tick "credit received" and "files received"
// ─────────────────────────────────────────────────────────────
function ocScanReplies() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ocFindArtistSheet_(ss);
  if (!sheet) { ui.alert('Could not find the artist sheet.'); return; }

  const { rows, col, firstDataRow } = ocReadRows_(sheet);
  let creditTicks = 0, fileTicks = 0;

  rows.forEach((r, i) => {
    const email = (r[col[OC_COL.email]] || '').toString().trim();
    if (!email) return;
    const rowNum = firstDataRow + i;

    // Credit name: any reply from the artist after a selection email went out.
    if (ocIsTrue_(r[col[OC_COL.selectionSent]]) && !ocIsTrue_(r[col[OC_COL.creditReceived]])) {
      if (GmailApp.search(`from:${email} newer_than:120d`, 0, 1).length > 0) {
        sheet.getRange(rowNum, col[OC_COL.creditReceived] + 1).setValue(true);
        creditTicks++;
      }
    }

    // High-res files: a reply WITH an attachment from the artist.
    if (ocIsTrue_(r[col[OC_COL.cmykSent]]) && !ocIsTrue_(r[col[OC_COL.filesReceived]])) {
      if (GmailApp.search(`from:${email} has:attachment newer_than:120d`, 0, 1).length > 0) {
        sheet.getRange(rowNum, col[OC_COL.filesReceived] + 1).setValue(true);
        fileTicks++;
      }
    }
  });

  ui.alert(`Reply scan complete.\n\nCredit-name replies detected: ${creditTicks}\nFile attachments detected: ${fileTicks}\n\nThese are heuristics (sender match) — spot-check anything surprising.`);
}

// ─────────────────────────────────────────────────────────────
// Template tab: create / reset with the current wording, placeholderized
// ─────────────────────────────────────────────────────────────
function ocSetupTemplates() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(OC_TEMPLATES_SHEET);
  if (!sheet) sheet = ss.insertSheet(OC_TEMPLATES_SHEET);
  sheet.clear();

  const defaults = [
    ['Stage', 'Subject', 'Body (use {{name}} and {{photo}})'],
    ['selection',
     'Your photo has been selected — Lyricalmyrical Collective Photobook',
     'Hi {{name}},\n\nCongratulations! Your photo "{{photo}}" has been selected from our open call to be featured in the first Lyricalmyrical Collective Photobook. We\'re thrilled to include your work!\n\nWe are now entering the book design phase and require one initial piece of information:\n1. The exact name you want to use in the credits at the back of the book.\n\nPlease reply to this email by the end of the week with: "The exact name for my credit is: [your name]"\n\nNEXT STEPS\nWe\'ll be in touch with instructions for sending your high-resolution CMYK files once the printer and color profile are finalized. We\'ll also share pre-order details and special contributor discounts soon.\n\nThank you so much for sharing your work with us!\n\nWarm regards,\nLyricalmyrical Books'],
    ['cmyk',
     'Print-ready files needed — Lyricalmyrical Collective Photobook',
     'Hi {{name}},\n\nWe\'re moving ahead with the book design for the Lyricalmyrical Collective Photobook!\n\nFor the next step, we need your high-quality, print-ready file for "{{photo}}".\n\nRequired file preparation:\n- Format: high-quality .TIFF\n- Color profile: CMYK (to be confirmed with our printer); make any final color adjustments after conversion\n- File naming (very important): FINAL_{{photo}}\n\nPlease reply to this email chain with the file attached.\n\nWe\'ll be in touch shortly about pre-orders and special contributor discounts!\n\nWarm regards,\nLyricalmyrical Books'],
    ['preorder',
     'Pre-orders are open — Lyricalmyrical Collective Photobook',
     'Hi {{name}},\n\nWe are thrilled to announce that pre-orders for the Lyricalmyrical Collective Photobook are now officially open!\n\nAs per the open call submission instructions: https://www.lyricalmyricalbooks.com/open-call-collective-book\n\nSelected artists in the book receive a 50% discount code for any number of copies (shipping not included; all orders ship from Toronto, Canada). Use code LMBCOLLECTIVE at checkout:\nhttps://www.lyricalmyricalbooks.com/product/collective-photobook\n\nThank you again for being part of this project!\n\nWarm regards,\nLyricalmyrical Books']
  ];

  sheet.getRange(1, 1, defaults.length, 3).setValues(defaults);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#0f172a').setFontColor('#ffffff');
  sheet.setColumnWidth(1, 90);
  sheet.setColumnWidth(2, 360);
  sheet.setColumnWidth(3, 600);
  sheet.getRange(2, 1, defaults.length - 1, 3).setVerticalAlignment('top').setWrap(true);

  SpreadsheetApp.getUi().alert(`"${OC_TEMPLATES_SHEET}" tab is ready. Edit the Subject/Body cells to taste — {{name}} and {{photo}} are filled in per artist.`);
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

// Finds the artist sheet by locating one whose header row contains "Artist Name".
function ocFindArtistSheet_(ss) {
  const target = OC_COL.name.toLowerCase();
  return ss.getSheets().find(sh => {
    const lastCol = sh.getLastColumn();
    if (lastCol < 1) return false;
    const header = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(v => v.toString().trim().toLowerCase());
    return header.indexOf(target) !== -1;
  }) || null;
}

// Reads the artist sheet into { rows, col, firstDataRow }.
// `col` maps a header label → 0-based array index within each row.
function ocReadRows_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const header = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(v => v.toString().trim());
  const col = header.reduce((m, h, i) => (m[h] = i, m), {});
  const firstDataRow = 2;
  const rows = lastRow >= firstDataRow
    ? sheet.getRange(firstDataRow, 1, lastRow - 1, lastCol).getValues()
    : [];
  return { rows, col, firstDataRow };
}

// Reads one stage's subject + body from the templates tab.
function ocGetTemplate_(stageKey) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(OC_TEMPLATES_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return null;
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues();
  const match = values.find(row => row[0].toString().trim().toLowerCase() === stageKey);
  if (!match || !match[1] || !match[2]) return null;
  return { subject: match[1].toString(), body: match[2].toString() };
}

// Treats true / "TRUE" / "true" / "yes" / 1 as checked.
function ocIsTrue_(v) {
  if (v === true) return true;
  const s = (v == null ? '' : v).toString().trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === '1';
}

// Dedup key for an existing draft.
function ocDraftKey_(email, subject) {
  return email.toLowerCase() + '|' + subject.trim().toLowerCase();
}

// Set of recipient|subject keys for drafts that already exist.
function ocExistingDraftKeys_() {
  const keys = new Set();
  GmailApp.getDrafts().forEach(d => {
    const msg = d.getMessage();
    (msg.getTo() || '').split(',').forEach(to => {
      const addr = to.replace(/.*<|>.*/g, '').trim();
      if (addr) keys.add(ocDraftKey_(addr, msg.getSubject() || ''));
    });
  });
  return keys;
}
