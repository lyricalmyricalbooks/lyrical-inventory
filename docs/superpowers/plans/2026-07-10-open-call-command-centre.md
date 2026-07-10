# Open Call Command Centre Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Build an accessible, action-first Open Call command centre without changing contributor data, Gmail behavior, or offline persistence.

**Architecture:** Add one pure summary helper to turn contributor and queue state into attention-rail metrics. Recompose \`renderOpenCall()\` around semantic action cards, a labelled filterable pipeline, priority queues, progressive campaign tools, and contributor work items; use a final scoped CSS layer for the responsive visual system.

**Tech Stack:** Vanilla JavaScript ES modules, Vite, CSS custom properties, Vitest, ESLint.

## Global Constraints

- Preserve the existing \`OPENCALL_DATA\` schema and \`_persistOpenCalls()\` flow.
- Preserve publisher-only access, Gmail actions, queue confirmations, template IDs, and window-exported handler names.
- Do not add a framework, backend, secret, or third-party dependency.
- Keep all controls keyboard-accessible with visible focus and 44px touch targets.
- Scope visual rules to \`#opencall-body\` and retain desktop, tablet, and mobile layouts.
- Do not edit Apps Script, \`public/gas-code.txt\`, backend, Firestore rules, or email copy.

---

### Task 1: Create reliable attention-rail metrics

**Files:**

- Modify: \`src/lib/opencall.js:15-35\`
- Modify: \`tests/opencall.test.js:1-40\`

**Interfaces:**

- Consumes: \`OC_STAGES\` and \`ocWaitingDays(contributor, now)\`.
- Produces: \`ocAttentionSummary(contributors, inbox, outbox, now)\` returning \`{ reviewCount, readyCount, waitingCount, oldestWaitingDays }\`.
- Used by: \`renderOpenCall()\` in \`src/main.js\`.

- [ ] **Step 1: Write the failing test**

\`\`\`js
import { OC_STAGES, ocAttentionSummary, newContributor } from '../src/lib/opencall.js';

it('summarizes review, send, and stalled-contributor attention items', () => {
  const stalled = newContributor({ name: 'Ada' });
  stalled.lastStageAt = '2026-07-01';
  const fresh = newContributor({ name: 'Grace' });
  fresh.lastStageAt = '2026-07-09';
  const summary = ocAttentionSummary(
    [stalled, fresh],
    [{ id: 'inbox-1' }, { id: 'inbox-2' }],
    [{ id: 'outbox-1' }],
    new Date('2026-07-10T12:00:00Z').getTime(),
  );
  expect(summary).toEqual({ reviewCount: 2, readyCount: 1, waitingCount: 1, oldestWaitingDays: 9 });
});
\`\`\`

- [ ] **Step 2: Run the focused test to verify it fails**

Run: \`npx vitest run tests/opencall.test.js\`

Expected: FAIL because \`ocAttentionSummary\` is not exported.

- [ ] **Step 3: Implement the minimal helper**

\`\`\`js
export function ocAttentionSummary(contributors = [], inbox = [], outbox = [], now = Date.now()) {
  const waitingDays = (contributors || [])
    .filter(c => !OC_STAGES.every(stage => c[stage.key]))
    .map(c => ocWaitingDays(c, now));
  const stalledDays = waitingDays.filter(days => days >= 4);
  return {
    reviewCount: (inbox || []).length,
    readyCount: (outbox || []).length,
    waitingCount: stalledDays.length,
    oldestWaitingDays: stalledDays.length ? Math.max(...stalledDays) : 0,
  };
}
\`\`\`

- [ ] **Step 4: Run focused and full logic checks**

Run: \`npx vitest run tests/opencall.test.js; npm run test\`

Expected: both commands pass.

- [ ] **Step 5: Commit**

\`\`\`powershell
git add src/lib/opencall.js tests/opencall.test.js
git commit -m "feat: summarize open call attention items"
\`\`\`

### Task 2: Recompose the Open Call renderer as an action-first workspace

**Files:**

- Modify: \`src/main.js:24,4021-4781\`

**Interfaces:**

- Consumes: \`ocAttentionSummary\`, existing \`ocFilterByStage\`, \`ocToggleSection\`, \`ocComposeStageEmail\`, and proposal/outbox handlers.
- Produces: semantic classes \`.oc-command-header\`, \`.oc-attention-rail\`, \`.oc-pipeline\`, \`.oc-priority-queues\`, \`.oc-campaign-tools\`, and \`.oc-work-item\`.
- Used by: existing Open Call handlers and Task 3 styles.

- [ ] **Step 1: Import the summary helper and calculate with valid queues**

\`\`\`js
import {
  OC_STAGES, ocNextAction, newContributor, parseContributorRows, findUnfilledMergeFields,
  ocAttentionSummary,
} from './lib/opencall.js';

const inboxItems = activeProj ? activeProj.inbox.filter(p => activeProj.contributors.some(c => c.id === p.contributorId)) : [];
const outboxItems = activeProj ? activeProj.outbox.filter(e => activeProj.contributors.some(c => c.id === e.contributorId)) : [];
const attention = ocAttentionSummary(listRaw, inboxItems, outboxItems);
\`\`\`

- [ ] **Step 2: Replace passive hero stats with semantic attention buttons**

\`\`\`js
const attentionCard = ({ count, label, detail, target, filter = '' }) => \`
  <button type="button" class="oc-attention-card \${count ? 'has-work' : 'clear'}"
    onclick="\${filter ? \`ocFilterByStage('\${filter}')\` : \`document.querySelector('\${target}')?.scrollIntoView({behavior:'smooth',block:'start'})\`}"
    aria-label="\${escapeHtml(label)}: \${count}. \${escapeHtml(detail)}">
    <span class="oc-attention-number">\${count}</span>
    <span class="oc-attention-label">\${escapeHtml(label)}</span>
    <span class="oc-attention-detail">\${escapeHtml(detail)}</span>
  </button>\`;
\`\`\`

Render review, waiting, and ready-to-send cards inside \`.oc-attention-rail\`; add \`.is-primary\` to the highest-priority non-zero card. Preserve existing queue scroll destinations.

- [ ] **Step 3: Make pipeline state explicit and reversible**

\`\`\`js
const funnelSeg = (key, label, n, idx) => \`
  <button type="button" class="oc-funnel-seg \${ocFilterStage === key ? 'active' : ''}"
    aria-pressed="\${ocFilterStage === key}"
    onclick="ocFilterByStage('\${ocFilterStage === key ? '' : key}')">
    <span class="oc-funnel-num">\${n}</span>
    <span class="oc-funnel-label">\${idx} · \${escapeHtml(label)}</span>
    <span class="oc-funnel-state">\${n ? \`\${n} waiting\` : 'Clear'}</span>
  </button>\`;
\`\`\`

Wrap segments in \`<nav class="oc-pipeline" aria-label="Filter contributors by next pipeline stage">\` and show a Clear filter button only when \`ocFilterStage\` is set.

- [ ] **Step 4: Put priority queues before campaign administration**

Use the existing inbox/outbox render blocks unchanged in behavior, then create:

\`\`\`js
const campaignToolsOpen = ocUiOpen_('campaign-tools', false);
const campaignToolsHtml = \`
  <section class="oc-campaign-tools \${campaignToolsOpen ? 'open' : ''}">
    <button type="button" class="oc-campaign-tools-toggle" aria-expanded="\${campaignToolsOpen}"
      onclick="ocToggleSection('campaign-tools')">Campaign tools <span>\${campaignToolsOpen ? 'Hide' : 'Show'}</span></button>
    <div class="oc-campaign-tools-body" \${campaignToolsOpen ? '' : 'hidden'}>
      \${templatesEditor}\${searchFilterBar}
    </div>
  </section>\`;
\`\`\`

Keep \`#oc-tmpl-subject\`, \`#oc-tmpl-body\`, \`#oc-preview-subject\`, and \`#oc-preview-body\` unchanged within \`templatesEditor\`.

- [ ] **Step 5: Convert contributor cards into progressive work items**

Keep every existing handler, but place the identity/current status/one primary CTA before details. Place photos, full stepper, Gmail links, edit, and remove actions inside native details:

\`\`\`html
<article class="card oc-contributor-card oc-work-item" id="oc-card-\${c.id}">
  <header class="oc-work-item-header">…existing avatar, identity, current status, and primary CTA…</header>
  <div class="oc-work-item-progress" aria-label="\${completedStages} of 5 stages complete">…compact labelled progress…</div>
  <details class="oc-work-item-details">
    <summary>Contributor details</summary>
    …existing photos, Gmail links, stage controls, edit, and remove actions…
  </details>
</article>
\`\`\`

- [ ] **Step 6: Verify renderer behavior**

Run: \`npm run lint\`

Expected: PASS. Manually verify project switching, stage filtering/clearing, queue routes, campaign-tool disclosure, template preview, contributor details, and all former contributor actions.

- [ ] **Step 7: Commit**

\`\`\`powershell
git add src/main.js
git commit -m "feat: build open call command centre"
\`\`\`

### Task 3: Apply premium scoped CSS and verify the rendered product

**Files:**

- Modify: \`src/style.css:4826-5091\`

**Interfaces:**

- Consumes: classes created in Task 2.
- Produces: responsive command-centre visual system scoped to \`#opencall-body\`.

- [ ] **Step 1: Add the command-centre token and layout layer**

\`\`\`css
#opencall-body {
  --oc-canvas: #f6f1e8;
  --oc-paper: rgba(255, 253, 249, .94);
  --oc-ink: #2c251e;
  --oc-muted: #74695e;
  --oc-gold: #bd7d19;
  --oc-gold-soft: #fff0d1;
  --oc-line: rgba(115, 82, 28, .16);
  --oc-focus: rgba(189, 125, 25, .42);
  --oc-shadow: 0 18px 48px rgba(58, 39, 15, .10), 0 2px 8px rgba(58, 39, 15, .05);
}
#opencall-body .oc-attention-rail { display:grid; grid-template-columns:1.35fr repeat(2, 1fr); gap:12px; }
#opencall-body .oc-attention-card { min-height:124px; text-align:left; padding:18px; border:1px solid var(--oc-line); border-radius:18px; background:var(--oc-paper); transition:transform .25s cubic-bezier(.4,0,.2,1), box-shadow .25s cubic-bezier(.4,0,.2,1); }
#opencall-body .oc-attention-card.is-primary { color:#fffdf8; background:#332a20; border-color:#332a20; }
#opencall-body .oc-attention-card:hover { transform:translateY(-2px); box-shadow:var(--oc-shadow); }
\`\`\`

- [ ] **Step 2: Style pipeline, queue rows, work items, and details**

\`\`\`css
#opencall-body .oc-pipeline { display:flex; gap:8px; overflow-x:auto; padding:4px; }
#opencall-body .oc-funnel-seg { min-width:130px; min-height:88px; border-radius:14px; }
#opencall-body .oc-funnel-seg[aria-pressed="true"] { background:var(--oc-gold-soft); box-shadow:inset 0 -3px var(--oc-gold); }
#opencall-body .oc-work-item { padding:18px; }
#opencall-body .oc-work-item-header { display:grid; grid-template-columns:auto minmax(0,1fr) auto; gap:14px; align-items:center; }
#opencall-body .oc-work-item-details summary { min-height:44px; display:flex; align-items:center; cursor:pointer; }
#opencall-body :is(button,input,select,summary):focus-visible { outline:3px solid var(--oc-focus); outline-offset:3px; }
\`\`\`

- [ ] **Step 3: Add responsive and reduced-motion rules**

\`\`\`css
@media (max-width: 1100px) { #opencall-body .oc-sidebar { position:static; max-height:none; } #opencall-body .oc-attention-rail { grid-template-columns:repeat(3,1fr); } }
@media (max-width: 760px) { #opencall-body .oc-attention-rail { grid-template-columns:1fr; } #opencall-body .oc-work-item-header { grid-template-columns:auto minmax(0,1fr); } #opencall-body .oc-work-item-header .btn { grid-column:1 / -1; width:100%; } }
@media (prefers-reduced-motion: reduce) { #opencall-body *, #opencall-body *::before, #opencall-body *::after { scroll-behavior:auto; transition-duration:.01ms; animation-duration:.01ms; } }
\`\`\`

- [ ] **Step 4: Run automated verification**

Run: \`npm run lint; npm run lint:contrast; npm run test; npm run build\`

Expected: all commands exit 0.

- [ ] **Step 5: Perform visual and interaction QA**

Run: \`npm run dev\`

Check at 1440px, 768px, and 375px. Exercise empty/mixed states, attention routing, pipeline filtering, campaign tools, template preview, contributor details, photo selection, Gmail actions, and bulk-email dry-run. Keyboard-tab all controls, confirm focus and Escape modal behavior. Capture the implementation and compare it with the selected Campaign Command Centre concept across hierarchy, spacing, typography, palette, controls, responsiveness, and above-the-fold copy.

- [ ] **Step 6: Commit**

\`\`\`powershell
git add src/style.css
git commit -m "style: polish open call command centre"
\`\`\`

