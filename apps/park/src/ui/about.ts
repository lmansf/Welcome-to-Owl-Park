/**
 * What the park is, said plainly (the site audit's Quick wins and Do this quarter, Nov 5): the home
 * screen's lead and its grown-ups line, the presence line under them (fed by /api/counts), the gate's
 * price line, and two short screens the home screen opens: About the park and A note for grown-ups.
 * The same words stand in public/about/index.html for search engines and anyone without scripts
 * (about.test.ts keeps the two in step).
 *
 * Some of it waits on the owner and stays hidden until it is filled in, never made up:
 * - DAY_TICKET_PRICE: the Day Ticket's price as the owner wants it shown (the store runs an
 *   early-preview discount, so which figure to show is the owner's call).
 * - KEEPER: who keeps the park, in the owner's own words (no personal details go in this public
 *   repository without the owner's say).
 * - STILLS: three moments from the park, with alt text, once the owner approves the pictures.
 * - PLAYER_QUOTES: real words from real players, with their permission.
 */
import { createModal, modalHeader } from './modal';

/** The Day Ticket's price as shown to visitors ("$3.99"), or null to leave the figure out. The owner's call. */
export const DAY_TICKET_PRICE: string | null = null;

/** Who keeps the park, in the owner's words: a name and one line, or null to leave it out. The owner's to fill in. */
export const KEEPER: { name: string; line: string } | null = null;

/** Moments from the park for About the park: an approved picture under public/ and what it shows. The owner approves each. */
export const STILLS: readonly { src: string; alt: string }[] = [];

/** Real players' words, with their permission: what they said and how they want to be named. */
export const PLAYER_QUOTES: readonly { words: string; who: string }[] = [];

/** The tickets in one line: the price when the owner has set one, the guest rule either way. */
export function ticketLine(price: string | null = DAY_TICKET_PRICE): string {
  const rule = 'Guests play free and keep nothing they win; ticketed owls keep everything.';
  return price ? `Day Ticket: ${price} for today. ${rule}` : rule;
}

/** How many owls are in the park, as the home screen says it (D3.1); null hides the line. */
export function presenceLine(n: number | null): string | null {
  if (n === null || !Number.isFinite(n) || n < 0) return null;
  if (n === 0) return 'Nobody is in the park right now, so you would have it to yourself.';
  if (n === 1) return '1 owl in the park right now, so you would have the place almost to yourself.';
  return `${Math.round(n)} owls in the park right now.`;
}

/** Every word the home screen adds about the park, for the owner's approval. */
export const ABOUT_WORDS = {
  /** Under the park's name. */
  lead: 'A cozy park you visit in your browser, no download. Wander as an owl, alongside everyone else who is here right now.',
  /** Under the entry buttons. */
  welcome: 'Built for anyone who misses the old chatroom worlds: grown-up owls welcome.',
  /** The home screen's two small buttons. */
  aboutButton: 'About the park',
  grownUpsButton: 'A note for grown-ups',
  aboutTitle: 'About the park',
  grownUpsTitle: 'A note for grown-ups',
} as const;

/** One part of a screen: a heading and its short paragraphs. */
export interface AboutPart {
  heading: string;
  lines: readonly string[];
}

/** About the park: what it is, what there is to do, who it is for and not for, tickets, and what is coming. */
export function aboutParts(): AboutPart[] {
  const parts: AboutPart[] = [
    {
      heading: 'What it is',
      lines: ['Owl Park is a cozy park you visit in your browser, with no download. You make an owl, then wander the park alongside everyone else who is here right now.'],
    },
    {
      heading: 'What there is to do',
      lines: ['Quests from the park’s owls, quick arcade games, fishing, the stage quiz, leaf piles to jump in, and a nest of your own to decorate.'],
    },
    {
      heading: 'Who it is for',
      lines: [ABOUT_WORDS.welcome, 'It is not a place to chat freely: owls talk with set phrases only. And it is not finished: the park is in early preview, with more on the way before it fully opens.'],
    },
    { heading: 'Tickets', lines: [ticketLine()] },
  ];
  if (KEEPER) parts.push({ heading: 'Who keeps the park', lines: [`${KEEPER.name}. ${KEEPER.line}`] });
  if (PLAYER_QUOTES.length) parts.push({ heading: 'What owls say', lines: PLAYER_QUOTES.map((q) => `“${q.words}” ${q.who}`) });
  parts.push({ heading: 'What is coming', lines: ['New rooms and things to do arrive as they are ready. Every change, with its date, is listed at exploreowlpark.com/changelog.'] });
  return parts;
}

/** A note for grown-ups: chat, what the park keeps, buying, and who runs it. */
export function grownUpParts(): AboutPart[] {
  const parts: AboutPart[] = [
    {
      heading: 'Chat is set phrases only',
      lines: [
        'There is no typed chat. Owls talk only with the 24 set phrases on the Say wheel, so nobody can type a message to anyone in the park.',
        'The only things anyone types are a feedback note, which only the park’s keepers read, and, where it is offered, a grown-up’s email to protect an owl.',
      ],
    },
    {
      heading: 'What the park keeps',
      lines: [
        'Playing needs no account and no password: the owl lives in this browser.',
        'The park keeps the owl, what it has found, and which rooms it visited, with no name, email or home address. A feedback note keeps the room and the device it came from, never a name.',
        'An email given to protect an owl is used only to send its links, and is never shown to anyone.',
      ],
    },
    {
      heading: 'Buying',
      lines: [
        'Nothing is sold inside the park. A Day Ticket is bought in the store’s checkout, and before the store opens a card says: Ask a grown-up before buying.',
        'The feather shop takes only feathers earned in play, never money. Guests can play free; they keep nothing they win.',
      ],
    },
  ];
  if (KEEPER) parts.push({ heading: 'Who runs the park', lines: [`${KEEPER.name}. ${KEEPER.line}`] });
  return parts;
}

export type InfoKind = 'about' | 'grown-ups';

export interface InfoScreens {
  open(kind: InfoKind, opener: HTMLElement): void;
  close(): void;
  isOpen(): boolean;
}

const CSS = `
#hud .modal.info{width:min(520px,calc(100vw - 24px));gap:14px}
#hud .info .i-part h3{margin:0 0 4px;font-size:16px;color:#FFD36A}
#hud .info .i-part p{margin:0 0 6px;font-size:15px;line-height:1.45}
#hud .info .i-stills{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px}
#hud .info .i-stills img{width:100%;border-radius:12px;display:block}
`;

let styled = false;

/** About the park and A note for grown-ups: one card, opened from the home screen. */
export function createInfoScreens(root: HTMLElement): InfoScreens {
  if (!styled) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    styled = true;
  }
  const modal = createModal(root, { name: 'info', label: ABOUT_WORDS.aboutTitle, layout: 'card' });
  const box = modal.box;
  box.dataset['info'] = '';
  const part = (p: AboutPart) => {
    const s = document.createElement('section');
    s.className = 'i-part';
    const h = document.createElement('h3');
    h.textContent = p.heading;
    s.appendChild(h);
    for (const line of p.lines) {
      const para = document.createElement('p');
      para.textContent = line;
      s.appendChild(para);
    }
    return s;
  };
  return {
    open(kind, opener) {
      const title = kind === 'about' ? ABOUT_WORDS.aboutTitle : ABOUT_WORDS.grownUpsTitle;
      box.setAttribute('aria-label', title);
      box.dataset['info'] = kind;
      box.replaceChildren(modalHeader(title, { onClose: () => modal.close(), closeLabel: `Close ${title.toLowerCase()}` }));
      if (kind === 'about' && STILLS.length) {
        const grid = document.createElement('div');
        grid.className = 'i-stills';
        for (const still of STILLS) {
          const img = document.createElement('img');
          img.src = still.src;
          img.alt = still.alt;
          img.loading = 'lazy';
          grid.appendChild(img);
        }
        box.appendChild(grid);
      }
      for (const p of kind === 'about' ? aboutParts() : grownUpParts()) box.appendChild(part(p));
      modal.open(opener);
    },
    close: () => modal.close(),
    isOpen: () => modal.isOpen(),
  };
}
