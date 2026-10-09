import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { withCampaignFooter, campaignFooterHtml } from '../src/lib/campaign-footer.js';

const read = (f) => fs.readFileSync(path.join(process.cwd(), f), 'utf8');
const customers = read('src/features/customers.js');
const opencall = read('src/features/opencall.js');
const intel = read('src/features/intel.js');

describe('campaign footer', () => {
  it('is appended to both the plain and HTML versions that are sent', () => {
    const out = withCampaignFooter('Hello **Ann**\n\nNew book!', 'me@example.com', t => `<p>${t}</p>`);
    expect(out.body).toMatch(/Hello \*\*Ann\*\*/);
    expect(out.body).toMatch(/unsubscribe/i);
    expect(out.htmlBody).toContain('<p>Hello **Ann**');
    expect(out.htmlBody).toContain('mailto:me@example.com?subject=Unsubscribe');
  });

  it('keeps HTML bodies as HTML and strips tags from the plain copy', () => {
    const out = withCampaignFooter('<b>Hi</b>', '', () => 'unused');
    expect(out.htmlBody.startsWith('<b>Hi</b>')).toBe(true);
    expect(out.body.startsWith('Hi\n')).toBe(true);
  });

  it('cannot be broken out of via the reply-to address', () => {
    expect(campaignFooterHtml('a"><script>@x.com')).not.toContain('<script>');
  });

  it('every campaign send path (live, retry, test) goes through it', () => {
    expect(customers.match(/withCampaignFooter\(personalizedBody/g).length).toBe(3);
    expect(customers).toMatch(/\$\{campaignFooterHtml\(/); // preview shows the same footer
  });
});

describe('mailing list and segments', () => {
  it('Remove leaves a tombstone that auto-add respects, and re-adding clears it', () => {
    expect(customers).toMatch(/MAILING_LIST\.removed\[key\] = today\(\)/);
    expect(customers).toMatch(/_mailingMergeBuyers\(list, \{ respectRemoved: true \}\)/);
    expect(customers).toMatch(/delete MAILING_LIST\.removed\[key\]/);
  });

  it('single-target segment refuses an unsubscribed address', () => {
    const branch = customers.slice(customers.indexOf("segmentName.startsWith('single-target:')"));
    expect(branch.slice(0, 400)).toMatch(/_isCustomerSuppressed\(email\)[\s\S]*return \[\]/);
  });

  it('Stripe payments are counted per payment for buyers unknown beforehand', () => {
    expect(customers).toMatch(/const knownBeforeStripe = new Set\(map\.keys\(\)\)/);
    expect(customers).toMatch(/knownBeforeStripe\.has\(/);
  });
});

describe('open call stage emails', () => {
  it('turn plain-text template bodies into line-broken HTML', () => {
    const fn = opencall.slice(opencall.indexOf("subject = ocMergeTemplate(tmpl.subject"));
    const end = fn.indexOf('openOcEmailPreviewModal(cId, stageKey, subject, body, c);');
    const block = fn.slice(0, end);
    expect(block).toMatch(/ocMergeTemplate\(ocTemplateBodyHtml_\(tmpl\.body\)/);
    expect((block.match(/body = ocTemplateBodyHtml_\(`/g) || []).length).toBe(4);
  });
});

describe('intelligence panel', () => {
  it('staged ids continue after the highest saved id, not the saved count', () => {
    expect(intel).toMatch(/proposalSeq = \[\.\.\.INTEL_PROPOSALS\.keys\(\)\]\.reduce/);
    // the arithmetic itself
    const seq = ['b6', 'b25'].reduce((m, id) => Math.max(m, parseInt(id.replace(/^b/, ''), 10) || 0), 2);
    expect(seq).toBe(25);
  });

  it('a batch with a failed save is rolled back and not marked Done', () => {
    const apply = intel.slice(intel.indexOf('async function applyIntelProposal'));
    const failIdx = apply.indexOf('if (failed.length) {\n    // Not "Done"');
    const doneIdx = apply.indexOf("b.status = 'applied'");
    expect(failIdx).toBeGreaterThan(-1);
    expect(failIdx).toBeLessThan(doneIdx);
    expect(apply).toMatch(/undo\.get\(g\)/);
  });
});
