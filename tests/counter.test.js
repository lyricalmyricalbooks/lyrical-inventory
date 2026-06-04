import { describe, it, expect, beforeEach } from 'vitest';
import { setupCounter } from '../src/counter.js';

describe('setupCounter', () => {
  let mockElement;

  beforeEach(() => {
    mockElement = {
      innerHTML: '',
      listeners: {},
      addEventListener(event, callback) {
        if (!this.listeners[event]) {
          this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
      },
      click() {
        if (this.listeners['click']) {
          this.listeners['click'].forEach(cb => cb());
        }
      }
    };
  });

  it('initializes the element with count 0', () => {
    setupCounter(mockElement);
    expect(mockElement.innerHTML).toBe('Count is 0');
  });

  it('increments the count on click', () => {
    setupCounter(mockElement);

    mockElement.click();
    expect(mockElement.innerHTML).toBe('Count is 1');

    mockElement.click();
    expect(mockElement.innerHTML).toBe('Count is 2');
  });
});
