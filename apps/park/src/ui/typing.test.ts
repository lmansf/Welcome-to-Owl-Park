import { describe, expect, it } from 'vitest';
import { isTextField, releaseOnTyping, typingInField } from './typing';

describe('isTextField', () => {
  it('is an input, a textarea, a select or editable text', () => {
    expect(isTextField({ tagName: 'INPUT' })).toBe(true);
    expect(isTextField({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isTextField({ tagName: 'select' })).toBe(true);
    expect(isTextField({ tagName: 'DIV', isContentEditable: true })).toBe(true);
  });

  it('is not a button, the page, or nothing', () => {
    expect(isTextField({ tagName: 'BUTTON' })).toBe(false);
    expect(isTextField({ tagName: 'BODY', isContentEditable: false })).toBe(false);
    expect(isTextField(null)).toBe(false);
    expect(isTextField(undefined)).toBe(false);
  });
});

describe('typingInField', () => {
  it("is a key aimed at a text field, or a phone keyboard's composing key", () => {
    expect(typingInField({ target: { tagName: 'TEXTAREA' } as unknown as EventTarget })).toBe(true);
    expect(typingInField({ target: null, isComposing: true })).toBe(true);
    expect(typingInField({ target: null, keyCode: 229 })).toBe(true);
    expect(typingInField({ target: { tagName: 'CANVAS' } as unknown as EventTarget, keyCode: 68 })).toBe(false);
  });
});

describe('releaseOnTyping', () => {
  it('lets go when a text field takes the focus, until it stops listening', () => {
    const handlers = new Map<string, (e: Event) => void>();
    const doc = {
      addEventListener: (type: string, fn: (e: Event) => void) => handlers.set(type, fn),
      removeEventListener: (type: string) => handlers.delete(type),
    } as unknown as Document;
    let released = 0;
    const stop = releaseOnTyping(doc, () => released++);
    handlers.get('focusin')?.({ target: { tagName: 'BUTTON' } } as unknown as Event);
    expect(released).toBe(0);
    handlers.get('focusin')?.({ target: { tagName: 'TEXTAREA' } } as unknown as Event);
    expect(released).toBe(1);
    stop();
    expect(handlers.has('focusin')).toBe(false);
  });
});
