/**
 * An owl asleep a long while (OP-126). "Still here?" asks with one big button; any touch or key
 * answers it, since the room wakes the owl on any input and closes the card. With no answer the owl
 * leaves its room, freeing its place, and the screen here waits for a tap to bring it home to its nest.
 *
 * TODO-DOCS (OP-126): docs/PLAYBOOK.md gets a note on idle owls: asleep after 45 s with nothing done
 * on the page; "Still here?" after 10 minutes asleep, never in the owl's own nest; no answer in a
 * minute and it leaves its room as any visitor does (the room server sees a normal leave, so the
 * place frees and the session ends there); `?sleep=`, `?away=` and `?answer=` (seconds) shorten
 * them for a visit. Sleeping is one flag on the owl (`rest` frames, protocol v11), never logged.
 */
export interface Away {
  /** "Still here?" over the park. */
  ask(): void;
  /** The card goes: the owl woke, or left. */
  close(): void;
  /** The owl has left its room: a screen that brings it back home with a tap. */
  gone(back: () => void): void;
  /** What shows now, for the browser tests. */
  shown(): 'ask' | 'gone' | null;
}

export const AWAY_WORDS = {
  ask: 'Still here?',
  askMore: 'Your owl has been asleep for a while.',
  here: "I'm here!",
  gone: 'Your owl dozed off and went home to its nest.',
  back: 'Come back',
} as const;

const CSS = `
#hud .away{position:fixed;inset:0;z-index:40;display:none;align-items:center;justify-content:center;pointer-events:auto;background:rgba(6,14,28,.58)}
#hud .away.open{display:flex}
#hud .away .card{display:flex;flex-direction:column;align-items:center;gap:14px;width:min(360px,calc(100vw - 32px));padding:22px 18px;text-align:center;background:rgba(12,30,54,.97);border:1px solid rgba(246,241,227,.18);border-radius:22px;box-shadow:0 18px 60px rgba(0,0,0,.6);color:#F6F1E3}
#hud .away h2{margin:0;font-size:22px}
#hud .away p{margin:0;font-size:16px;line-height:1.35;opacity:.9}
#hud .away button{min-height:56px;min-width:180px;padding:10px 24px;font-size:20px;font-weight:800;border-radius:28px;border:0;background:#C9A227;color:#0C1E36;cursor:pointer}
#hud .away button:focus-visible{outline:3px solid #FFD36A;outline-offset:3px}
`;

let styled = false;

export function createAway(root: HTMLElement): Away {
  if (!styled) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    styled = true;
  }
  const layer = document.createElement('div');
  layer.className = 'away';
  const card = document.createElement('div');
  card.className = 'card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  const title = document.createElement('h2');
  const text = document.createElement('p');
  const button = document.createElement('button');
  card.append(title, text, button);
  layer.append(card);
  root.append(layer);

  let state: 'ask' | 'gone' | null = null;
  let onButton: () => void = () => {};
  button.addEventListener('click', () => onButton());

  const show = (next: 'ask' | 'gone', words: { title: string; text: string; button: string }, then: () => void) => {
    state = next;
    layer.dataset['away'] = next;
    card.setAttribute('aria-label', words.title);
    title.textContent = words.title;
    text.textContent = words.text;
    button.textContent = words.button;
    button.dataset['away'] = next === 'ask' ? 'here' : 'back';
    onButton = then;
    layer.classList.add('open');
    button.focus();
  };
  const hide = () => {
    state = null;
    delete layer.dataset['away'];
    layer.classList.remove('open');
  };

  return {
    ask: () => show('ask', { title: AWAY_WORDS.ask, text: AWAY_WORDS.askMore, button: AWAY_WORDS.here }, hide),
    close: () => {
      if (state === 'ask') hide();
    },
    gone: (back) =>
      show('gone', { title: AWAY_WORDS.ask, text: AWAY_WORDS.gone, button: AWAY_WORDS.back }, () => {
        hide();
        back();
      }),
    shown: () => state,
  };
}
