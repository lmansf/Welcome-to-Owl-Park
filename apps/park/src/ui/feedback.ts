import { FEEDBACK_KINDS, FEEDBACK_MAX_CHARS, FEEDBACK_MIN_CHARS, cleanFeedbackText, type FeedbackKind } from '@owl-park/shared';
import type { FeedbackOutcome } from '../net/feedback';
import { createModal, modalHeader } from './modal';

export interface FeedbackScreen {
  /** `fromMenu` adds the way back to the Menu. */
  open(fromMenu: boolean, opener?: HTMLElement | null): void;
  close(): void;
  isOpen(): boolean;
}

/** Sends what the visitor wrote (the HUD adds the room and the screen size). */
export type SendFeedback = (kind: FeedbackKind, text: string) => Promise<FeedbackOutcome>;

const LABELS: Record<FeedbackKind, string> = { bug: 'Bug', idea: 'Idea', praise: 'Praise', other: 'Other' };

const PROMPTS: Record<FeedbackKind | 'none', string> = {
  none: "Tell the park's keepers what is on your mind.",
  bug: 'What went wrong, and where in the park?',
  idea: 'What would make the park better?',
  praise: 'What do you love about the park?',
  other: "What would you like the park's keepers to know?",
};

/** What the screen says once a note is sent, or why it was not; `done` closes the screen. */
export function feedbackReply(outcome: FeedbackOutcome): { text: string; done: boolean } {
  switch (outcome) {
    case 'sent':
      return { text: "Thank you! Your note is with the park's keepers.", done: true };
    case 'kept':
      return { text: 'Thank you! This park has no server to send it to, so your note is saved on this device.', done: true };
    case 'busy':
      return { text: 'One note at a time, please. Try again in half a minute.', done: false };
    case 'full':
      return { text: 'That is plenty of notes for today, thank you! Please try again tomorrow.', done: false };
    default:
      return { text: 'Your note did not send. Check your connection and try again.', done: false };
  }
}

const CSS = `
#hud .layer .modal.feedback{width:min(520px,calc(100vw - 24px))}
@media (max-width:600px),(pointer:coarse){#hud .layer.feedback-layer{align-items:flex-start;padding-top:max(10px,env(safe-area-inset-top))}}
#hud .feedback .kinds{display:flex;gap:6px;flex-wrap:wrap}
#hud .feedback .kinds button{min-height:36px;padding:6px 14px;font-size:13px;background:rgba(246,241,227,.08);color:#F6F1E3;border:1px solid rgba(246,241,227,.18);box-shadow:none}
#hud .feedback .kinds button[aria-pressed=true]{background:#C9A227;color:#0C1E36}
#hud .feedback textarea{font:inherit;font-size:16px;line-height:1.4;width:100%;min-height:112px;resize:vertical;padding:10px 12px;border-radius:12px;border:1px solid rgba(246,241,227,.25);background:rgba(246,241,227,.06);color:#F6F1E3}
#hud .feedback textarea::placeholder{color:rgba(246,241,227,.55)}
#hud .feedback textarea:focus{outline:2px solid #C9A227;outline-offset:1px}
#hud .feedback .fb-foot{display:flex;align-items:center;gap:10px}
#hud .feedback .fb-count{font-size:12px;opacity:.7;flex:1}
#hud .feedback .fb-lead{font-size:15px;margin:0}
#hud .feedback .fb-note{font-size:12px;opacity:.75;margin:0}
#hud .feedback .fb-status{font-size:13px;margin:0;color:#FFD36A}
#hud .feedback .fb-status:empty{display:none}
`;

/**
 * Feedback, from the Menu: what kind of note, a few words, Send. On a phone it sits at the top of
 * the screen, so the keyboard never covers what the visitor is typing. Visitors are asked to leave
 * out personal details.
 */
export function createFeedbackScreen(root: HTMLElement, send: SendFeedback, toast: (message: string, ms: number) => void, back: () => void): FeedbackScreen {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const modal = createModal(root, { name: 'feedback', label: 'Feedback', layout: 'card', sheet: false });
  const box = modal.box;
  box.innerHTML = `
    <p class="fb-lead">Found a bug? Have an idea?</p>
    <div class="kinds" role="group" aria-label="What kind of note"></div>
    <textarea data-fb-text maxlength="${FEEDBACK_MAX_CHARS}" aria-label="Your note"></textarea>
    <p class="fb-note">Please leave out names, emails and other personal details.</p>
    <p class="fb-status" role="status" aria-live="polite" data-fb-status></p>
    <div class="fb-foot"><span class="fb-count" data-fb-count></span><button data-fb-send>Send</button></div>`;

  const $ = <T extends Element>(sel: string) => box.querySelector(sel) as T;
  const text = $<HTMLTextAreaElement>('[data-fb-text]');
  const count = $<HTMLElement>('[data-fb-count]');
  const status = $<HTMLElement>('[data-fb-status]');
  const sendBtn = $<HTMLButtonElement>('[data-fb-send]');
  const kindsEl = $<HTMLElement>('.kinds');
  let kind: FeedbackKind | null = null;
  let sending = false;

  const kindButtons = FEEDBACK_KINDS.map((k) => {
    const b = document.createElement('button');
    b.textContent = LABELS[k];
    b.dataset['kind'] = k;
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => {
      kind = kind === k ? null : k;
      refresh();
    });
    kindsEl.appendChild(b);
    return b;
  });

  const refresh = () => {
    for (const b of kindButtons) b.setAttribute('aria-pressed', String(b.dataset['kind'] === kind));
    text.placeholder = PROMPTS[kind ?? 'none'];
    const n = text.value.length;
    count.textContent = `${n} / ${FEEDBACK_MAX_CHARS}`;
    sendBtn.disabled = sending || cleanFeedbackText(text.value).length < FEEDBACK_MIN_CHARS;
    sendBtn.textContent = sending ? 'Sending…' : 'Send';
  };
  text.addEventListener('input', () => {
    status.textContent = '';
    refresh();
  });
  // The park's own keys leave text fields alone, so Escape is heard here too.
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') modal.close();
  });

  sendBtn.addEventListener('click', async () => {
    if (sendBtn.disabled) return;
    sending = true;
    status.textContent = '';
    refresh();
    const outcome = await send(kind ?? 'other', cleanFeedbackText(text.value));
    sending = false;
    const reply = feedbackReply(outcome);
    if (reply.done) {
      text.value = '';
      kind = null;
      modal.close();
      toast(reply.text, 5000);
    } else status.textContent = reply.text;
    refresh();
  });
  refresh();

  return {
    open(fromMenu, opener) {
      box.querySelector(':scope > header')?.remove();
      box.prepend(modalHeader('Feedback', { onBack: fromMenu ? back : null, onClose: () => modal.close(), closeLabel: 'Close feedback' }));
      modal.open(opener);
      refresh();
      // With a keyboard the words come next; a phone keeps its keyboard down until the visitor taps.
      if (globalThis.matchMedia?.('(pointer: fine)').matches) text.focus({ preventScroll: true });
    },
    close: () => modal.close(),
    isOpen: () => modal.isOpen(),
  };
}
