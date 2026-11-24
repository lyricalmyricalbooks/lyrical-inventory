// @vitest-environment jsdom
// Buttons are drawn with the record's code inside their handler. A bare
// '${code}' broke the button as soon as the code held an apostrophe, a quote
// or a backslash. jsArg writes it so the handler always gets the code back.
import { describe, expect, it } from 'vitest';
import { jsArg } from '../src/lib/html.js';

function clickWith(code) {
  let got;
  window.__pick = (v) => { got = v; };
  document.body.innerHTML = `<button onclick="__pick(${jsArg(code)})">Go</button>`;
  document.querySelector('button').click();
  return got;
}

describe('jsArg', () => {
  it.each([
    ['plain', 'bk-42'],
    ['an apostrophe', "O'Brien-12"],
    ['a double quote', 'say "hi"'],
    ['a trailing backslash', 'id\\'],
    ['an attempt to break out', "x');alert(1);//"],
    ['markup', '<b>bold</b> & co'],
    ['a line break', 'two\nlines'],
  ])('hands the handler the exact code when it holds %s', (_label, code) => {
    expect(clickWith(code)).toBe(code);
  });

  it('passes a number through as text, as the quoted form did', () => {
    expect(clickWith(7)).toBe('7');
  });
});
