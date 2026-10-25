/**
 * The Menu's look (OP-108): every colour, pattern, shape, sound and motion the menu shell uses, in
 * this one file, as CSS custom properties on the shell. A realm's skin (OP-109) is a set of these
 * values and nothing else, so a skin can never move a tab or shrink a button. Two base themes: light
 * wood by day and a dark night variant, picked by the visitor's own clock for now (OP-074's seasons
 * can pick later).
 *
 * The clarity rules no theme or skin may break, which menuTheme.test.ts checks for every theme here:
 * body text 16 px or more, touch targets 44 px or more, every text colour 4.5:1 or better against its
 * surface (the wood grain's lines included), and the active tab told by its weight and bar as well as
 * its colour.
 *
 * TODO-DOCS (OP-108): a docs/MENU.md with these tokens (each `--m-*` name, what it dresses, its day and
 * night values) and the clarity rules above, for whoever makes a realm's skin (OP-109). The Menu is now
 * tabs (Quests, Collection, Nest, Map, Settings) and Say is its own button on the bar: PLAYBOOK.md
 * section 7, GLOSSARY.md (Menu, Pad; `ui/menu.ts` is gone, the shell is `ui/menuShell.ts`),
 * FEEDBACK.md and ARCHITECTURE.md (Feedback, the ways out and Home screen are in the Settings tab, Go
 * home in the Nest tab; Say on the bar) and QUESTS.md (Quests is the Menu's first tab) still describe
 * the list of tiles. Settings gained Sounds (the knock as the Menu opens).
 */

/** One theme: the values the shell's CSS reads, each a custom property `--m-<name>`. */
export interface MenuTokens {
  /** The sheet's wood, and the grain over it (an inline SVG, never a picture to download). */
  surface: string;
  grain: string;
  /** The grain lines' colour and strength, kept here so the contrast check can count them. */
  grainLine: string;
  grainAlpha: number;
  /** Cards and rows inside the sheet. */
  raised: string;
  /** The carved branch along the sheet's top edge (an inline SVG) and the frame's colour. */
  branch: string;
  frame: string;
  /** Amber: the active tab's bar, the main buttons. */
  accent: string;
  /** Text on an amber button. */
  onAccent: string;
  text: string;
  /** Second lines and notes. */
  muted: string;
  /** The keyboard focus ring. */
  focus: string;
  /** The two tones of the tab icons. */
  iconMain: string;
  iconAccent: string;
  scrim: string;
  shadow: string;
  /** A piece still hidden (a style set's capstone before it is earned): a filter that turns its art into one quiet tone. */
  silhouette: string;
  /** Corner radii: the sheet, the cards, the tabs. */
  radius: number;
  cardRadius: number;
  tabRadius: number;
  /** The open and close: how long, and its easing (none when the device or the owl asks for calm motion). */
  motionMs: number;
  easing: string;
  /** The type: body size (the rules' floor is 16), headings, small notes (still 16: nothing smaller). */
  bodyPx: number;
  headingPx: number;
  /** The smallest a button may be either way. */
  targetPx: number;
  /** The open sound: a soft knock on wood, its pitch and loudness (0 to 1); muted with the park's sounds. */
  tapHz: number;
  tapGain: number;
}

const svg = (body: string, w: number, h: number) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>${body}</svg>`)}")`;

/** Wood grain: long, gently wavy lines, tiled; drawn in the theme's grain colour. */
function grain(color: string, alpha: number): string {
  const line = (y: number, a: number, b: number) => `<path d='M0 ${y} C 60 ${y + a}, 120 ${y - b}, 180 ${y} S 300 ${y + b}, 360 ${y}' fill='none' stroke='${color}' stroke-opacity='${alpha}' stroke-width='1.4'/>`;
  return svg([line(14, 5, 3), line(40, 3, 6), line(71, 6, 2), line(103, 2, 5), line(132, 5, 4)].join(''), 360, 150);
}

/** The carved branch along the top edge: a bough with a few leaves, in the frame colour. */
function branch(wood: string, leaf: string): string {
  return svg(
    `<path d='M0 9 C 70 3, 140 15, 210 8 S 330 2, 400 9' fill='none' stroke='${wood}' stroke-width='5' stroke-linecap='round'/>` +
      `<path d='M96 9 q 10 -10 22 -8 q -8 10 -22 8z M250 6 q 12 -9 24 -5 q -10 9 -24 5z M330 6 q -9 -9 -21 -7 q 7 9 21 7z' fill='${leaf}'/>`,
    400,
    18,
  );
}

/** Light wood, for the day. */
export const DAY: MenuTokens = {
  surface: '#EAD7B7',
  grain: grain('#7A5230', 0.16),
  grainLine: '#7A5230',
  grainAlpha: 0.16,
  raised: '#F6EBD7',
  branch: branch('#8A5A2B', '#5E7D3A'),
  frame: '#8A5A2B',
  accent: '#E0A030',
  onAccent: '#2A1B10',
  text: '#2A1B10',
  muted: '#5A4330',
  focus: '#1F5FAD',
  iconMain: '#6B4423',
  iconAccent: '#E0A030',
  scrim: 'rgba(20, 12, 6, 0.45)',
  shadow: '0 -10px 40px rgba(42, 27, 16, 0.35)',
  silhouette: 'brightness(0) opacity(0.4)',
  radius: 22,
  cardRadius: 14,
  tabRadius: 12,
  motionMs: 200,
  easing: 'ease',
  bodyPx: 16,
  headingPx: 20,
  targetPx: 44,
  tapHz: 520,
  tapGain: 0.18,
};

/** Dark walnut, for the night. */
export const NIGHT: MenuTokens = {
  ...DAY,
  surface: '#23170F',
  grain: grain('#E9C9A0', 0.07),
  grainLine: '#E9C9A0',
  grainAlpha: 0.07,
  raised: '#30221A',
  branch: branch('#7A5434', '#7E9B55'),
  frame: '#7A5434',
  accent: '#E7A93B',
  onAccent: '#23170F',
  text: '#F6EBD9',
  muted: '#CDB89A',
  focus: '#FFD36A',
  iconMain: '#E9D3B0',
  iconAccent: '#E7A93B',
  scrim: 'rgba(4, 3, 2, 0.55)',
  shadow: '0 -10px 40px rgba(0, 0, 0, 0.6)',
  silhouette: 'brightness(0) invert(1) opacity(0.35)',
  tapHz: 440,
};

export type MenuThemeId = 'day' | 'night';
export const MENU_THEMES: Readonly<Record<MenuThemeId, MenuTokens>> = { day: DAY, night: NIGHT };

/** Light wood from 7 in the morning until 7 in the evening on the visitor's own clock, the night variant otherwise. */
export function themeAt(date: Date): MenuThemeId {
  const h = date.getHours();
  return h >= 7 && h < 19 ? 'day' : 'night';
}

/** The theme as custom properties for the shell's style attribute (`--m-surface: ...`). */
export function tokenStyle(t: MenuTokens): string {
  const px = (n: number) => `${n}px`;
  const props: Record<string, string> = {
    surface: t.surface,
    grain: t.grain,
    raised: t.raised,
    branch: t.branch,
    frame: t.frame,
    accent: t.accent,
    'on-accent': t.onAccent,
    text: t.text,
    muted: t.muted,
    focus: t.focus,
    'icon-main': t.iconMain,
    'icon-accent': t.iconAccent,
    scrim: t.scrim,
    shadow: t.shadow,
    silhouette: t.silhouette,
    radius: px(t.radius),
    'card-radius': px(t.cardRadius),
    'tab-radius': px(t.tabRadius),
    motion: `${t.motionMs}ms`,
    easing: t.easing,
    body: px(t.bodyPx),
    heading: px(t.headingPx),
    target: px(t.targetPx),
  };
  return Object.entries(props)
    .map(([k, v]) => `--m-${k}:${v}`)
    .join(';');
}

// ---------- contrast, for the clarity rules ----------

/** A colour's channels, from #rrggbb. */
export function rgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`not a colour: ${hex}`);
  return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)];
}

/** `top` laid over `under` at this strength. */
export function blend(top: string, under: string, alpha: number): string {
  const a = rgb(top);
  const b = rgb(under);
  return `#${a.map((c, i) => Math.round(c * alpha + b[i]! * (1 - alpha)).toString(16).padStart(2, '0')).join('')}`;
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The contrast ratio of two colours (WCAG): 1 to 21. */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}
