import { describe, it, expect, beforeEach, vi } from 'vitest';
import { dropFilesIntoInput, setDropzoneDrag } from '../src/lib/dropzone.js';

function dragEvent(files) {
  return { preventDefault: vi.fn(), dataTransfer: files === undefined ? undefined : { files } };
}

describe('receipt drop zones', () => {
  beforeEach(() => {
    document.body.innerHTML = '<label id="dz" class="dropzone"></label><input id="file" type="file">';
  });

  it('lights the zone while a file hovers and clears it when the file leaves', () => {
    const ev = dragEvent();
    setDropzoneDrag(ev, 'dz', true);
    expect(document.getElementById('dz').classList.contains('drag')).toBe(true);
    expect(ev.preventDefault).toHaveBeenCalled();
    setDropzoneDrag(dragEvent(), 'dz', false);
    expect(document.getElementById('dz').classList.contains('drag')).toBe(false);
  });

  it('does nothing when the zone is not on the page', () => {
    expect(() => setDropzoneDrag(dragEvent(), 'missing', true)).not.toThrow();
  });

  it('clears the highlight on drop and reports whether files arrived', () => {
    document.getElementById('dz').classList.add('drag');
    const empty = dragEvent([]);
    expect(dropFilesIntoInput(empty, 'dz', 'file')).toBe(false);
    expect(empty.preventDefault).toHaveBeenCalled();
    expect(document.getElementById('dz').classList.contains('drag')).toBe(false);
    expect(dropFilesIntoInput(dragEvent(), 'dz', 'file')).toBe(false);
  });

  it('hands dropped files to the input', () => {
    const input = document.getElementById('file');
    const files = { length: 1, 0: new File(['x'], 'receipt.pdf') };
    let assigned = null;
    Object.defineProperty(input, 'files', { configurable: true, set(v) { assigned = v; }, get() { return assigned; } });
    expect(dropFilesIntoInput(dragEvent(files), 'dz', 'file')).toBe(true);
    expect(assigned).toBe(files);
  });

  it('reports no drop when the input is missing', () => {
    document.getElementById('file').remove();
    expect(dropFilesIntoInput(dragEvent({ length: 1 }), 'dz', 'file')).toBe(false);
  });
});
