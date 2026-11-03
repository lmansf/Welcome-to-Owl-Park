import { describe, expect, it } from 'vitest';
import { FEEDBACK_MAX_CHARS, cleanFeedbackText, parseFeedback, redactFeedbackText } from './feedback';

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

  describe('personal details taken out before a note is kept (OP-236)', () => {
    it('replaces emails, written plainly or spelt out', () => {
      expect(redactFeedbackText('email me at sam.smith+owls@gmail.com thanks')).toBe('email me at [email] thanks');
      expect(redactFeedbackText('my mom is SAM.SMITH@school.k12.fl.us')).toBe('my mom is [email]');
      expect(redactFeedbackText('its sammy at gmail dot com')).toBe('its [email]');
      expect(redactFeedbackText('sammy(at)yahoo(dot)com')).toBe('[email]');
    });

    it('replaces phone numbers however they are written, and card-length numbers', () => {
      expect(redactFeedbackText('call 813-555-0142 pls')).toBe('call [phone] pls');
      expect(redactFeedbackText('(813) 555 0142')).toBe('[phone]');
      expect(redactFeedbackText('+1 813.555.0142')).toBe('[phone]');
      expect(redactFeedbackText('text 8135550142')).toBe('text [phone]');
      expect(redactFeedbackText('my number is 555-0142')).toBe('my number is [phone]');
      expect(redactFeedbackText('4111 1111 1111 1111')).toBe('[number]');
    });

    it('replaces web links, handles and street addresses', () => {
      expect(redactFeedbackText('see https://example.com/my-page?x=1 ok')).toBe('see [link] ok');
      expect(redactFeedbackText('www.mysite.net is mine')).toBe('[link] is mine');
      expect(redactFeedbackText('go to coolowls.com/me')).toBe('go to [link]');
      expect(redactFeedbackText('follow @owl_kid.99 on insta')).toBe('follow [handle] on insta');
      expect(redactFeedbackText('I live at 1234 Oak Hill Drive in town')).toBe('I live at [address] in town');
      expect(redactFeedbackText('42 Elm St.')).toBe('[address]');
    });

    it('keeps scores, levels, times, dates and ordinary words as they are', () => {
      for (const note of [
        'I scored 12345 in the hop game and 980 in flight',
        'level 3 room 2 the door at 10:30 did not open',
        'stuck on 2026-11-02 at the gate, 3 times',
        'got 1st place! the 5 owls were at the pond',
        'it was at the top dot of the map',
        'lag on my phone at home, co-op mode please',
        'I walked 3 steps then the court went dark',
      ]) {
        expect(redactFeedbackText(note)).toBe(note);
      }
    });

    it('is what parseFeedback hands back, and never longer than a note may be', () => {
      expect(parseFeedback({ kind: 'bug', text: 'broken, reach me at kid@example.com' })?.text).toBe('broken, reach me at [email]');
      const long = `${'a'.repeat(FEEDBACK_MAX_CHARS - 10)} 12 a st b`;
      expect(redactFeedbackText(long).length).toBeLessThanOrEqual(FEEDBACK_MAX_CHARS);
    });

    it('takes a note of the most characters in little time (no pattern runs away)', () => {
      const started = performance.now();
      for (const fill of ['a', '1', '1 ', 'a at ', '@', '.a', '12 a ']) redactFeedbackText(fill.repeat(Math.floor(FEEDBACK_MAX_CHARS / fill.length)));
      expect(performance.now() - started).toBeLessThan(500);
    });
  });
});
