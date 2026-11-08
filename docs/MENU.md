# The Menu: its shell, its tabs and its look

- Status: current
- Verified against: branch claude/op-202-docs off main 01e9722 (2026-11-02)
- Code: apps/park/src/ui/menuShell.ts, apps/park/src/ui/menuTheme.ts, apps/park/src/ui/menuTabs.ts, apps/park/src/ui/hud.ts, apps/park/src/ui/settingsScreen.ts, apps/park/src/settings.ts, apps/park/src/ui/menuTheme.test.ts
- Tickets: OP-108, OP-109, OP-110, OP-114, OP-130, OP-167, OP-172
- Related: docs/PLAYBOOK.md section 7, docs/QUESTS.md, docs/FEEDBACK.md, docs/GLOSSARY.md, docs/TESTING.md

The Menu is the one sheet the Menu button opens in the park. This page is for whoever changes it or
makes a realm's skin for it (OP-109): what the shell does, what each tab shows, every token that
dresses it with its day and night values, and the clarity rules no theme may break. Every
visitor-facing word on it is a default waiting on the owner's approval.

## The shell [BUILT (OP-108)]

`createMenuShell` (`apps/park/src/ui/menuShell.ts`) draws one shell for every tab. Its look comes
only from the theme's tokens (`apps/park/src/ui/menuTheme.ts`), so a skin changes the wood and never
the layout.

- **Shape.** On a screen 600 px wide or less it rises from the bottom, the full width and 70 % of the
  screen high (`70dvh`), with a grabber on top. Wider, it is a card, at most 560 px wide and 600 px
  high. Its height never changes with the tab, so the tabs never move under a finger.
- **Tabs.** Across the top, each with its icon and its word always shown: Quests, Collection, Nest,
  Map, Settings (`MENU_TABS`). The tab shown is told by its weight (800 against 500) and an amber bar
  under it, not by colour alone. The arrow keys, Home and End move between tabs. A tab with news shows
  a red dot (Quests, for a new or finished quest).
- **Opening.** The Menu button, or M (opens on the Map tab) or J (opens on Quests). It opens on the
  tab last shown, else Quests, and puts the focus on that tab.
- **Closing.** One tap: the Menu button again, the dimmed park, Close, a swipe down on its top (more
  than 60 px down, under 50 px across), Escape, or a phone's back (the shell adds one history entry
  while it is open). The focus goes back to what opened it. Tab stays inside the open Menu.
- **Sound.** It opens with a soft knock on wood, made on the spot with Web Audio (no sound file),
  unless Settings has Sounds off.
- **Motion.** It moves for `motionMs` (200 ms) unless Calm motion is on or the device asks for
  reduced motion; then it opens and closes at once.
- **Day and night.** `themeAt` picks `day` from 07:00 to 18:59 on the visitor's own clock and
  `night` otherwise, each time the Menu opens.

Say is not in the Menu: it is its own button on the bar beside the Menu and Emotes (T on a keyboard).

## The tabs [BUILT]

The tabs are wired in `apps/park/src/ui/hud.ts`; each is drawn each time it is shown
(`apps/park/src/ui/menuTabs.ts` unless named).

| Tab | What it shows |
| --- | --- |
| Quests | the quest journal and today's tasks (`ui/quests.ts`, `docs/QUESTS.md`). Before the park, a line that quests show once in. For a spectator (OP-191), a locked line and a button to get a Day Ticket |
| Collection | how many things the owl has of how many, overall and by kind (things to wear, pets, effects, emotes), its feathers, and the style sets (OP-110): each set's pieces with a tick on those owned, and its capstone as a silhouette (the `--m-silhouette` filter) until the set is complete |
| Nest | the owl's nest: away from it, a button to the Map with the nest's card open (travel home is on the Map, OP-130); at home, a line on Decorate and the mirror. The friend code card when accounts are on (OP-139), today's furniture gift, and visiting |
| Map | the park on a grid of three columns and five rows (`MAP_PLACES`, `MAP_PATHS`): closed arches read "Coming soon" with dashed paths; "You are here" on the owl's place; a place walked into is lit and sparkles the first time this device shows it (`MAP_LIT_KEY`). A tap opens its card; travel is a button held for `HOLD_MS` (350 ms, OP-130), and a key press acts at once |
| Settings | the rows of `settingsRows` (`ui/settingsScreen.ts`), the same as the home screen's Settings: Send feedback first (OP-167); On screen (Thumbstick on touch screens, Show what owls say); Sound (Sounds: the knock as the Menu opens); Motion (Calm motion); Screen (Full screen, where the browser allows it); Controls (the keys, `KEY_HELP`, and a line on the touch controls). Then the friend code card, Which owl are you? (OP-076), the tickets on this owl as a closed row (OP-172), and Leaving: the Home screen, and Leave the park when inside it |

The settings themselves live on this device only (`apps/park/src/settings.ts`, `SETTINGS_KEY`).

## The tokens [BUILT (OP-108)]

A theme is a `MenuTokens` object. `tokenStyle` writes it on the shell's layer as CSS custom
properties, `--m-<name>`, and the shell's CSS reads nothing else for its look. Two themes exist:
`DAY` (light wood) and `NIGHT` (dark walnut, which copies `DAY` and changes the colours and the
knock's pitch). `MENU_THEMES` holds both.

| Property | What it dresses | Day | Night |
| --- | --- | --- | --- |
| `--m-surface` | the sheet's wood; the border round a tab's dot | `#EAD7B7` | `#23170F` |
| `--m-grain` | the wood grain over the sheet: an inline SVG of five wavy lines, tiled 360 x 150 | lines `#7A5230` at 0.16 | lines `#E9C9A0` at 0.07 |
| `--m-raised` | cards, map pins, quest cards; the shown tab's ground (70 %) | `#F6EBD7` | `#30221A` |
| `--m-branch` | the carved branch along the top edge: an inline SVG, 18 px tall, tiled 400 px | bough `#8A5A2B`, leaves `#5E7D3A` | bough `#7A5434`, leaves `#7E9B55` |
| `--m-frame` | the sheet's border, Close and ghost buttons, map paths and pins; mixed thinner for card borders, the tab row's line and meter tracks | `#8A5A2B` | `#7A5434` |
| `--m-accent` | the shown tab's bar, main buttons, meter fills, the pin you are on, a picked pin, the travel card, the Quests sub-tab shown | `#E0A030` | `#E7A93B` |
| `--m-on-accent` | text on an accent button | `#2A1B10` | `#23170F` |
| `--m-text` | all text | `#2A1B10` | `#F6EBD9` |
| `--m-muted` | notes and second lines, closed and unlit pins, pieces not owned | `#5A4330` | `#CDB89A` |
| `--m-focus` | the keyboard focus ring (3 px) | `#1F5FAD` | `#FFD36A` |
| `--m-icon-main` | the tab icons' main tone | `#6B4423` | `#E9D3B0` |
| `--m-icon-accent` | the tab icons' second tone (55 % until the tab is shown) | `#E0A030` | `#E7A93B` |
| `--m-scrim` | the dimmed park behind the sheet | `rgba(20, 12, 6, 0.45)` | `rgba(4, 3, 2, 0.55)` |
| `--m-shadow` | the sheet's shadow | `0 -10px 40px rgba(42, 27, 16, 0.35)` | `0 -10px 40px rgba(0, 0, 0, 0.6)` |
| `--m-silhouette` | a set's capstone before the set is complete (a CSS filter) | `brightness(0) opacity(0.4)` | `brightness(0) invert(1) opacity(0.35)` |
| `--m-radius` | the sheet's corners | `22px` | `22px` |
| `--m-card-radius` | cards and pins | `14px` | `14px` |
| `--m-tab-radius` | the tabs' top corners | `12px` | `12px` |
| `--m-motion` | how long it opens and closes | `200ms` | `200ms` |
| `--m-easing` | the open and close easing | `ease` | `ease` |
| `--m-body` | every text size, notes included | `16px` | `16px` |
| `--m-heading` | the Menu's title | `20px` | `20px` |
| `--m-target` | the least height (and width) of every button, row and the header; a tab is this plus 18 px | `44px` | `44px` |

Four tokens are not CSS properties: `grainLine` and `grainAlpha` (the grain's colour and strength,
kept apart so the contrast check can count them), and `tapHz` and `tapGain` (the knock's pitch and
loudness: day 520 Hz, night 440 Hz, both 0.18).

## The clarity rules [BUILT (OP-108)]

No theme or skin may break these. `apps/park/src/ui/menuTheme.test.ts` checks every theme in
`MENU_THEMES`:

- Text (`text`) and notes (`muted`) are 4.5:1 or better (WCAG contrast, `contrast`) against the
  wood, against the wood under a grain line (`blend(grainLine, surface, grainAlpha)`), and against
  `raised`.
- Text on a button (`onAccent` on `accent`) is 4.5:1 or better.
- The focus ring is 3:1 or better against the wood.
- Body text is 16 px or more (`bodyPx`), headings larger than body text, touch targets 44 px or more
  (`targetPx`).
- The motion is 200 ms (`motionMs`), and the knock is quiet (`tapGain` above 0, at most 0.3).
- `tokenStyle` gives every property, the grain and the branch drawn inline, and no `http` address:
  the Menu downloads nothing for its look.

The shown tab told by its weight and its bar as well as its colour is held by the shell's CSS, which
no token changes.

OPEN QUESTION: `menuTheme.test.ts` says the active tab's bar stands out from the wood at 3:1, but
checks only the focus ring. The day theme's bar (`accent` `#E0A030` on `surface` `#EAD7B7`) is about
1.6:1; the night theme's is about 8.4:1.

## A realm's skin [PLANNED (OP-109)]

A skin is one more `MenuTokens` value and nothing else, so it can never move a tab or shrink a
button. To make one: copy `DAY` (or `NIGHT`), change the values, add it to `MENU_THEMES`, and run
`pnpm test`: the clarity rules then check it like the base themes. Nothing yet picks a skin by realm;
`themeAt` picks only day or night (OP-074's seasons may pick later).

Not every colour on the sheet is a token today: the news dot is `#D7263D` and a held travel
button's fill is `rgba(12,30,54,.3)`, both written in the shell's CSS.

OPEN QUESTION: whether the news dot and the hold fill should become tokens before the first skin.

## Tests

- `apps/park/src/ui/menuTheme.test.ts`: the clarity rules, day and night by the clock, the properties.
- `apps/park/src/ui/menuTabs.test.ts`: the Map's travel cards and the sparkle (OP-130).
- `apps/park/e2e/park.spec.ts`: the keys (M, T, J, Escape), the five tabs, the park kept in sight and
  every way to close it, day and night wood. `pad.spec.ts`: travel home held on the Map.
  `feedback.spec.ts`: Send feedback first in Settings.
