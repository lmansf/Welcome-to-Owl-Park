/**
 * The one guard every game key listener asks first (Logan, 2026-11-03): a key typed into a text field (the
 * Feedback form's note, a name, an email, any input, textarea, select or editable text) belongs to
 * that field, not to the park or a minigame. A listener that hears such a key returns at once, without
 * preventDefault or stopPropagation, so the letter is typed. A phone's on-screen keyboard sends the
 * same keys (W, A, S, D, the space bar), and while it composes a word it sends keys with no code at all.
 */

/** Just enough of an element to tell a text field: the DOM's own, or a test's plain object. */
interface Fieldish {
  tagName?: string;
  isContentEditable?: boolean;
}

/** Whether `el` takes typing: an input, a textarea, a select, or editable text. */
export function isTextField(el: unknown): boolean {
  if (!el || typeof el !== 'object') return false;
  const f = el as Fieldish;
  if (f.isContentEditable) return true;
  const tag = typeof f.tagName === 'string' ? f.tagName.toUpperCase() : '';
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/** Whether a key event belongs to a text field: aimed at one, or part of a word a phone's keyboard is composing. */
export function typingInField(e: { target?: EventTarget | null; isComposing?: boolean; keyCode?: number }): boolean {
  if (e.isComposing || e.keyCode === 229) return true;
  return isTextField(e.target);
}

/**
 * Calls `release` whenever a text field takes the focus, so keys held as it does (a walk, a jump, a
 * dash) are let go: their key-ups go to the field, and the owl would otherwise walk on while the
 * visitor types. Returns the way to stop listening.
 */
export function releaseOnTyping(doc: Pick<Document, 'addEventListener' | 'removeEventListener'>, release: () => void): () => void {
  const onFocus = (e: Event) => {
    if (isTextField(e.target)) release();
  };
  doc.addEventListener('focusin', onFocus);
  return () => doc.removeEventListener('focusin', onFocus);
}
