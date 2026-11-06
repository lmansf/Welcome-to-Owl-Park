/**
 * What the park is, said plainly (the site audit's Quick wins and Do this quarter, Nov 5): the home
 * screen's lead and its chatroom-worlds line, the presence line under them (fed by /api/counts), the gate's
 * price line, and two short screens the home screen opens: About the park and Safety and privacy.
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
 * - OUTSIDE_MENTIONS: a dated mention of the park somewhere else (a listing, a write-up), once one exists.
 *
 * The second audit (Nov 5) added the free way in on the home screen (Look around free), a line for the
 * spare minutes in a browser tab, what there is to do as the jobs it does, who the park is not for,
 * the ticket's terms (who takes the payment, a ticket that does not work, refunds: the owner's answers
 * of Nov 1), and the questions visitors ask, which the About page also marks up for search engines.
 */
import { createModal, modalHeader } from './modal';
import { SPECTATOR_WORDS } from './spectator';

/** What a guest gets, as the turnstiles say it. */
const SPECTATOR_GUEST_NOTE = SPECTATOR_WORDS.guestNote;

/** The Day Ticket's price as shown to visitors ("$3.99"), or null to leave the figure out. The owner's call. */
export const DAY_TICKET_PRICE: string | null = null;

/** Who keeps the park, in the owner's words: a name and one line, or null to leave it out. The owner's to fill in. */
export const KEEPER: { name: string; line: string } | null = null;

/** Moments from the park for About the park: an approved picture under public/ and what it shows. The owner approves each. */
export const STILLS: readonly { src: string; alt: string }[] = [];

/** Real players' words, with their permission: what they said and how they want to be named. */
export const PLAYER_QUOTES: readonly { words: string; who: string }[] = [];

/** A dated mention of the park somewhere else (a listing, a write-up), for the home screen. Real ones only, once they exist. */
export const OUTSIDE_MENTIONS: readonly { where: string; date: string }[] = [];

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
  /** The About page's lead and the page's description for search engines (the second audit's wording). */
  lead: 'A cozy park you visit in your browser, no download. Enter free as a guest, wander as an owl, alongside everyone else who is here right now.',
  /** In the home screen's headline, under the park's name (D1.1). */
  tagline: 'A cozy park you visit in your browser',
  /** Under the headline, which already says what the park is: the rest of the lead. */
  homeLead: 'No download. Enter free as a guest, wander as an owl, alongside everyone else who is here right now.',
  /** The home screen's free way in, beside Make your owl (D2.1): a ready-made owl, straight in. */
  lookAround: 'Look around free',
  /** Under the entry buttons. */
  welcome: 'Built for anyone who misses the old chatroom worlds.',
  /** The home screen's two small buttons. */
  aboutButton: 'About the park',
  safetyButton: 'Safety and privacy',
  aboutTitle: 'About the park',
  safetyTitle: 'Safety and privacy',
} as const;

/** What there is to do, as the jobs it does (D1.3): a spare few minutes, the old worlds, and an owl and nest others see. */
export const DO_LINES: readonly string[] = [
  'A spare 20 minutes in a browser tab: quests from the park’s owls, quick arcade games, fishing, the stage quiz and leaf piles to jump in.',
  'Dress your owl in what you find, and decorate a nest of your own. Open the nest to visitors, and other owls can walk in and see it.',
];

/** Who it is for, and who it is not for (D1.2, D2.B). */
export const WHO_LINES: readonly string[] = [
  ABOUT_WORDS.welcome,
  'For the spare minutes in a browser tab you would rather not spend alone: everyone who is in the park at the same time wanders it with you.',
  'It is not for anyone who wants to chat freely with strangers: owls talk with set phrases only. And it is not finished: the park is in early preview, with more on the way before it fully opens.',
];

/** The Day Ticket's terms (the owner's answers of Nov 1): who takes the payment, a ticket that does not work, and refunds. */
export const TICKET_TERMS: readonly string[] = [
  'A Day Ticket is paid for in the store’s checkout, which Shopify runs; the park never sees a card number.',
  'A ticket works for its owl on any screen. Its time starts at its first scan at the turnstiles.',
  'A ticket can be refunded until it is used or it expires, so a ticket that will not scan at the turnstiles can be refunded. To ask, reply to the store’s order email, or send a feedback note from the park’s Menu.',
];

/** A question visitors ask, and its answer in the park’s words. */
export interface Faq {
  q: string;
  a: string;
}

/**
 * What Owl Park is, in one "Owl Park is ..." sentence and one after it (the SEO audit: a page opens with
 * a definition a search engine can quote). About's first part and the first question both say it.
 */
export const WHAT_IT_IS = 'Owl Park is a cozy park you visit in your browser, with no download. You make an owl, then wander the park alongside everyone else who is here right now.';

/**
 * How to write to the park (the SEO audit: a contact route on every page). Only the routes that exist
 * today: a feedback note from the Menu, and the store's order email for a ticket. A contact address
 * waits for the owner.
 */
export const CONTACT_LINES: readonly string[] = [
  'To write to the park, send a feedback note from the Menu inside the park. Only the park’s keepers read it.',
  'For a ticket, reply to the store’s order email.',
];

/** The questions visitors ask (the second audit's FAQ, D5.5): the price only once the owner sets one, the keeper only once named. */
export function faq(price: string | null = DAY_TICKET_PRICE, keeper: typeof KEEPER = KEEPER): Faq[] {
  const list: Faq[] = [
    { q: 'What is Owl Park?', a: WHAT_IT_IS },
    { q: 'Is it free?', a: `Guests come in free. ${SPECTATOR_GUEST_NOTE} A Day Ticket lets an owl keep everything it wins, and opens the quests and the shops.` },
    {
      q: 'What does a Day Ticket cost?',
      a: price ? `A Day Ticket is ${price}. Your ticket’s time starts at the turnstiles.` : 'The store’s checkout shows the price before you pay. Your ticket’s time starts at the turnstiles.',
    },
    { q: 'Who takes the payment?', a: TICKET_TERMS[0]! },
    { q: 'Can I get a refund?', a: TICKET_TERMS[2]! },
    { q: 'Is there typed chat?', a: 'No. Owls talk only with the 24 set phrases on the Say wheel, so nobody can type a message to anyone in the park.' },
    { q: 'What does the park keep?', a: 'The owl, what it has found, and which rooms it visited, with no name, email or home address. Playing needs no account and no password: the owl lives in this browser.' },
    { q: 'Does it need a download?', a: 'No. The park opens in your browser, on a computer or a phone.' },
  ];
  if (keeper) list.splice(4, 0, { q: 'Who keeps the park?', a: `${keeper.name}. ${keeper.line}` });
  return list;
}

/** One part of a screen: a heading and its short paragraphs. */
export interface AboutPart {
  heading: string;
  lines: readonly string[];
  /** Questions and answers, one after the other (each question is shown bold). */
  faq?: true;
}

/** About the park: what it is, what there is to do, who it is for and not for, tickets, and what is coming. */
export function aboutParts(): AboutPart[] {
  const parts: AboutPart[] = [
    {
      heading: 'What it is',
      lines: [WHAT_IT_IS],
    },
    {
      heading: 'What there is to do',
      lines: DO_LINES,
    },
    {
      heading: 'Who it is for',
      lines: WHO_LINES,
    },
    { heading: 'Tickets', lines: [ticketLine(), ...TICKET_TERMS] },
  ];
  if (KEEPER) parts.push({ heading: 'Who keeps the park', lines: [`${KEEPER.name}. ${KEEPER.line}`] });
  if (PLAYER_QUOTES.length) parts.push({ heading: 'What owls say', lines: PLAYER_QUOTES.map((q) => `“${q.words}” ${q.who}`) });
  parts.push({ heading: 'Questions', lines: faq().flatMap((f) => [f.q, f.a]), faq: true });
  parts.push({ heading: 'Contact', lines: CONTACT_LINES });
  parts.push({ heading: 'What is coming', lines: ['New rooms and things to do arrive as they are ready. Every change, with its date, is listed at exploreowlpark.com/changelog.'] });
  return parts;
}

/** Safety and privacy: chat, what the park keeps, buying, and who runs it. */
export function safetyParts(): AboutPart[] {
  const parts: AboutPart[] = [
    {
      heading: 'Chat is set phrases only',
      lines: [
        'There is no typed chat. Owls talk only with the 24 set phrases on the Say wheel, so nobody can type a message to anyone in the park.',
        'The only things anyone types are a feedback note, which only the park’s keepers read, and, where it is offered, an email to protect an owl.',
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
        'Nothing is sold inside the park. A Day Ticket is bought in the store’s checkout, and a card always asks first before the store opens.',
        'The feather shop takes only feathers earned in play, never money. Guests can play free; they keep nothing they win.',
      ],
    },
  ];
  if (KEEPER) parts.push({ heading: 'Who runs the park', lines: [`${KEEPER.name}. ${KEEPER.line}`] });
  return parts;
}

export type InfoKind = 'about' | 'safety';

export interface InfoScreens {
  open(kind: InfoKind, opener: HTMLElement): void;
  close(): void;
  isOpen(): boolean;
}

const CSS = `
#hud .modal.info{width:min(520px,calc(100vw - 24px));gap:14px}
#hud .info .i-part h3{margin:0 0 4px;font-size:16px;color:#FFD36A}
#hud .info .i-part p{margin:0 0 6px;font-size:15px;line-height:1.45}
#hud .info .i-part[data-faq] p:nth-of-type(odd){margin:10px 0 2px;font-weight:700}
#hud .info .i-stills{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px}
#hud .info .i-stills img{width:100%;border-radius:12px;display:block}
`;

let styled = false;

/** About the park and Safety and privacy: one card, opened from the home screen. */
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
    if (p.faq) s.dataset['faq'] = '';
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
      const title = kind === 'about' ? ABOUT_WORDS.aboutTitle : ABOUT_WORDS.safetyTitle;
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
      for (const p of kind === 'about' ? aboutParts() : safetyParts()) box.appendChild(part(p));
      modal.open(opener);
    },
    close: () => modal.close(),
    isOpen: () => modal.isOpen(),
  };
}
