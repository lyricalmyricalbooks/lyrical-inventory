// Exercise the actual Apps Script routing, without any production credentials.
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const source = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../apps-script/Code.gs'), 'utf8');
function run(payload, response) {
  const fetch = vi.fn(() => response);
  const ctx = { UrlFetchApp: { fetch }, ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({ setMimeType: () => JSON.parse(text) }) }, Utilities: { base64Encode: () => 'JVBERi0=' }, Logger: { log() {} } };
  vm.createContext(ctx); vm.runInContext(source, ctx);
  return { result: ctx.doPost({ postData: { contents: JSON.stringify({ version: 2, action: 'proxychitchats', payload }) } }), fetch };
}
describe('Chit Chats serverless proxy', () => {
  it('refuses other hosts and invalid methods before forwarding tokens', () => {
    for (const payload of [
      { endpoint: 'https://evil.example/api/v1/clients/123/shipments', apiKey: 'fake' },
      { endpoint: 'https://chitchats.com/api/v1/clients/123/shipments/ABC/buy', apiKey: 'fake', method: 'GET' },
      { endpoint: 'https://chitchats.com/labels/shipments/abc.pdf', apiKey: 'fake', isArtifact: true, method: 'POST' },
    ]) { const { result, fetch } = run(payload); expect(result.error).toBeTruthy(); expect(fetch).not.toHaveBeenCalled(); }
  });
  it('forwards staging buys with the raw authorization token and no redirects', () => {
    const { result, fetch } = run({ endpoint: 'https://staging.chitchats.com/api/v1/clients/123/shipments/ABC/buy', apiKey: 'fake', method: 'PATCH', jsonPayload: { postage_type: 'chit_chats_select' } }, { getResponseCode: () => 200, getContentText: () => '{}', getAllHeaders: () => ({}) });
    expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: 'patch', followRedirects: false, headers: { Authorization: 'fake' } });
  });
  it('returns official PDF bytes for the browser cache', () => {
    const { result } = run({ endpoint: 'https://chitchats.com/labels/shipments/abc.pdf?auth_token=fake', apiKey: 'fake', isArtifact: true }, { getResponseCode: () => 200, getBlob: () => ({ getBytes: () => [37, 80, 68, 70, 45] }) });
    expect(result, JSON.stringify(result)).toMatchObject({ base64: 'JVBERi0=' });
  });
});
