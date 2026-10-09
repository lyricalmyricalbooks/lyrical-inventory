import { describe, it, expect, vi } from 'vitest';
import { escapeHtml, safeHttpUrl } from '../src/lib/html.js';

const PAYLOAD = '"><img src=x onerror=alert(1)>';

describe('safeHttpUrl', () => {
  it('accepts http(s) and upgrades bare hosts', () => {
    expect(safeHttpUrl('https://pay.example.com/me')).toBe('https://pay.example.com/me');
    expect(safeHttpUrl('pay.example.com/me')).toBe('https://pay.example.com/me');
  });
  it('rejects script schemes and empties', () => {
    expect(safeHttpUrl('javascript:alert(1)')).toBe('');
    expect(safeHttpUrl('data:text/html,<b>')).toBe('');
    expect(safeHttpUrl('')).toBe('');
    expect(safeHttpUrl(null)).toBe('');
  });
  it('cannot break out of an href attribute', () => {
    const wrap = document.createElement('div');
    wrap.innerHTML = `<a href="${escapeHtml(safeHttpUrl('https://x.com" onfocus="alert(1)" autofocus="'))}">p</a>`;
    expect(wrap.firstChild.getAttributeNames()).toEqual(['href']);
  });
});

describe('escaped sinks render payloads as text', () => {
  it('ledger-style cell', () => {
    const td = document.createElement('td');
    td.innerHTML = `<div>${escapeHtml(PAYLOAD)}</div>`;
    expect(td.querySelector('img')).toBeNull();
    expect(td.textContent).toBe(PAYLOAD);
  });
  it('address lines joined with <br>', () => {
    const el = document.createElement('div');
    el.innerHTML = [PAYLOAD, 'Toronto'].map(escapeHtml).join('<br>');
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelectorAll('br').length).toBe(1);
  });
  it('JSON-encoded onclick args survive apostrophes and injection', () => {
    const name = `Mary's');window.__pwn=1;//${PAYLOAD}`;
    const spy = vi.fn();
    window.downloadOcAttachment = spy;
    const wrap = document.createElement('div');
    wrap.innerHTML = `<button onclick="downloadOcAttachment(${escapeHtml(JSON.stringify(name))}, this)">x</button>`;
    wrap.firstChild.click();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toBe(name);
    expect(window.__pwn).toBeUndefined();
  });
  it('srcdoc preview keeps markup out of the host page', () => {
    const wrap = document.createElement('div');
    wrap.innerHTML = `<iframe sandbox="" srcdoc="${escapeHtml(PAYLOAD)}"></iframe>`;
    expect(wrap.querySelector('img')).toBeNull();
    expect(wrap.firstChild.getAttribute('srcdoc')).toBe(PAYLOAD);
  });
});
