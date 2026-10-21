import { describe, expect, it } from 'vitest';
import { FEEDBACK_MAX_CHARS, cleanFeedbackText, parseFeedback } from './feedback';

describe('feedback from visitors', () => {
  it('takes a kind and a few words, with the room and the screen size when they look right', () => {
    expect(parseFeedback({ kind: 'idea', text: '  More ponds please!  ', room: 'grove', screen: '390x844' })).toEqual({ kind: 'idea', text: 'More ponds please!', room: 'grove', screen: '390x844' });
    expect(parseFeedback({ kind: 'bug', text: 'Stuck by the gate', room: '../etc', screen: 'huge' })).toEqual({ kind: 'bug', text: 'Stuck by the gate', room: null, screen: null });
  });

  it('refuses the wrong kind, too few or too many words, and anything that is not an object', () => {
    expect(parseFeedback({ kind: 'rant', text: 'hello there' })).toBeNull();
    expect(parseFeedback({ kind: 'bug', text: ' a ' })).toBeNull();
    expect(parseFeedback({ kind: 'bug', text: 'x'.repeat(FEEDBACK_MAX_CHARS + 1) })).toBeNull();
    expect(parseFeedback({ kind: 'bug', text: 42 })).toBeNull();
    expect(parseFeedback([{ kind: 'bug', text: 'hello' }])).toBeNull();
    expect(parseFeedback(null)).toBeNull();
  });

  it('keeps line breaks but drops control characters and long runs of blank lines', () => {
    expect(cleanFeedbackText('one\r\ntwo\u0007\n\n\n\nthree\u0000')).toBe('one\ntwo\n\nthree');
  });
});
