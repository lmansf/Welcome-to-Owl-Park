# Owl Park cleanup and rebuild: the plan

- Status: in progress. Ticket OP-342. Branch `claude/determined-wozniak-3ljxrf`.
- Last updated: 2026-11-11, milestone 1 in review (OP-343).
- Read first: `FABLE.md` (the owner's rules; it wins over this file).

The owner's brief (Nov 11): a full cleanup pass of the game, end to end, as a player meets it. Two
focuses: clunky mechanics (a 10 year old should manage every step in a few tries) and anything that
breaks the illusion. Fix from the top of a ranked punch list down, redoing whole systems where that
beats patching. Then a few bigger changes that most improve how the game feels to play.

This file is the memory of that work: pick it up here after any break.

## How each milestone is judged

1. The playtest bots pass and `bots/baseline.json` is no longer.
2. The merge gate in `FABLE.md` section 5: `pnpm check` and CI green, a test that fails on `main`,
   a look at 1440x900 and 1024x768, other open PRs named, the wording rules.
3. The play log (`game` schema, visits not marked as tests) against the baseline below.
4. A fresh walk of what changed, on a computer and a phone-sized screen.

A milestone that makes things worse is rolled back and the reason is written in the log at the foot
of this file.

## Baseline (2026-11-11)

| Measure | Value |
| --- | --- |
| Visits since Nov 9 that end in `m3-hall` | 15 of 19 |
| Course runs quit | 8 of 9, most with one fall or none and before the first bench |
| Quests started since Nov 1 | none |
| Phone visits, median length | under two minutes |
| Kid bots: weakest needed hop | canopy 83%, brush 80%, circuit 90%; no stuck spots |

The bots rate every hop as easy enough, so runs are not quit because hops are too hard. The walk
points at what comes before the hop: nothing says how a course is played, a tap of Jump is a tiny
hop, and falls look like floor.

## The walk and what it covered

Five walkers played the 24 rooms a visitor can reach on the live map (from `lobby`: `homes`,
`m3-hall`, `grove`, `market`, `glass`, `hub`, `arcade`, and the canopy, brush and circuit courses),
on a computer and a phone-sized screen. They were cut off part way, so coverage is uneven:

- Played with real input: the three arcade games, and six of the Great Hollow's nine doorways out
  and back (12 room changes recorded frame by frame).
- Looked at and measured, not played: the home screen, the quiz and its reveal, the nest on arrival,
  the first screens of all three courses, walking and jumping.
- Read in the code only (each such finding is confirmed before it is fixed): the rest of the courses.
- Not reached yet: the Treetop Commons and its gate, the nests' street, decorating, the Menu, the
  realm starts in play, quests in play, and almost everything on a phone. These are walked as their
  milestones come up.

## The punch list, worst first

State: open, or the PR that fixed it, or left alone and why. V = verified in play or by
measurement; C = read in the code, to confirm.

| # | What a player meets | Where | Fix planned | State |
| --- | --- | --- | --- | --- |
| 1 | Nothing says what to do on arrival: no quest owl or first quest where owls arrive; every quest owl stands in a realm room (V) | `lobby`, `m3-hall` | A first quest given where owls arrive, with the feather trail leading to it (bigger change B1) | open |
| 2 | A course never says how it is played: no goal, no controls (hold Jump to glide, flap, dash), no clock though the gold prize is timed (V at arrival) | all three courses | A start card, first-time prompts at the first gust, stone, sign and bench, the run's clock in the strip | open, M2 |
| 3 | A quick tap of Jump is a tiny hop (a short press rose 52 px, a hold 145; the first step of each course is 90 to 120) (V) | everywhere | Raise the least height a jump reaches so a tap clears a first step | M1: a tap now rises 83 to 128 px, a tapped flap is nearly a whole one |
| 4 | Falls look like floor: pits and water are drawn as the same ground as safe floor, hazards faint (V) | all three courses | Draw every pit as a pit, the same way in each course | M1: the walk ends at a bank; water, a bramble dip or the street lies a step below; a rule test refuses a pit drawn as a walk |
| 5 | The hut at the end is open with no bell rung and has no way back; coming in again starts the run over (C, confirmed) | `canopy-3`, `canopy-hut` | The hut's doorway holds until every bell is rung and says what is missing | M1: the doorway waits and says how many bells are rung |
| 6 | A fall is an instant silent put-back with the camera sliding after; some rooms have no bench; a room entered from its far end sends a fall to its other end (C, confirmed) | courses | A fall beat, a bench where a fall costs a whole room, and the way in as the fall-back | M1: a blink, the camera cut with the owl, a line; back to the nearer of the bench and the way in; one bench added (`circuit-3`) |
| 7 | The play key skips the result card: a new run started 0.4 s after the crash (V) | arcade | No play key for a moment after a run ends | open, M3 |
| 8 | No pause; Escape or Close ends a run at once with nothing paid and no question (V) | arcade | Pause first, with Keep playing and Leave | open, M3 |
| 9 | Unclear rules: "Tap to flap" on a computer; a drag toward the target fires into the ground (V) | arcade | Name the keys; a forward drag is no shot | open, M3 |
| 10 | The prompt for anything is a pill in the far bottom corner; nothing shows at the thing (V) | everywhere | A prompt over the thing in reach as well | open, M2 |
| 11 | A statue 500 px tall on the near rim hides the player's owl and wears a doorway's sign (V) | `m3-hall` | Tall art fades while the player's owl is behind it; the sign moves onto its doorway | open, M4 |
| 12 | The pad's label is cut off on a phone: "Look in t..." (V) | phone | A label that fits | open, M5 |
| 13 | One place, two names: quest steps say "the great tree" and "the glass street", the signs say other names (V) | quests, signs, Menu | One name per place | open, M4 |
| 14 | Human objects where owl ones belong: a trapdoor with a ladder, a plank hut door, park-bench checkpoints, a door booth, a vending machine (V) | courses, `m3-hall` | Swap to the kit's knot-holes and perches where it has them; list the rest for the artists | open, M4 |
| 15 | Hazards drawn by code read as debug boxes; building faces drawn solid are walked through (V, C) | courses | Each hazard drawn as the thing it is; faces behind the owl | M1: thorns, mist, falls and wires redrawn with no box of colour. The faces: open, M4 |
| 16 | A jump and one flap reaches the wires; a full jump on the waterfall ledge reaches the falls (worked out) | `circuit-2`, `circuit-3`, `brush-2` | Check with the bots, then lift the hazards | left for now: the high wires are what stops a glide over the whole act, and the kid bots pass. Look again at the log's fall spots once there are runs to read |
| 17 | Offline builds: thorns over safe floor do nothing, so a preview plays easier than the live park (C, confirmed) | previews | One fall rule for both | M1: a preview judges a fall and sends it back as the room server does |
| 18 | The camera eases by the frame, not by time, so it trails further on a slow device; the backdrop shows under the walkway; goals crowd the screen's corners (C, V) | courses | Bigger change B2 | open |
| 19 | A direction held through a doorway keeps walking the owl in the next room (V) | doorways | Wait for a fresh push after a doorway taken with Up | open, M4 |
| 20 | The feather trail is faint; edge chips are arrows with no words; HUD words stay lit over the dark between rooms (V) | everywhere | Contrast, a word on each chip, dim with the room | open, M4 |
| 21 | Words: a one-player game "to play with whoever is in the park"; three ways to word an ending; developer wording a player can meet; fallback emoji symbols (V, C) | arcade, Menu | One wording pass | open, M3 |
| 22 | Almost no sound: only the Menu's knock was found (C, partial) | everywhere | Bigger change B3 | open |
| 23 | The HUD's screens do not share a style: seven corner sizes, five button heights, three golds (C) | HUD, Menu | Bigger change B4 | open |
| 24 | Home screen on a phone held upright sits in half the width; the free way in is the smallest button (V) | home | Full width; a 44 px target | open, M5 |

Left alone, and why:

- The pale line round the floor in rooms seen from above: the owner's own ask (Nov 7), see
  `apps/park/src/game/walkFloor.ts`.
- The "which owl are you" quiz and the owl builder (its reveal hides the owl, its pictures are emoji):
  PRs 219 and 223 from another session rebuild them.
- The first arcade cabinet's Play spot: PR 221 from another session.
- Ticket, gate and checkout wording and screens: off limits (`FABLE.md` section 6).
- Art quality: the artists replace every asset. Only inconsistent or misleading art is touched.

## Milestones

Each leaves the game playable with the bots and the gate passing, and has its own PR and preview link.

- **M1. Courses you can read and survive (OP-343, in review).** Items 3, 4, 5, 6, 15, 16, 17. Done
  when: a tap clears the first step of each course; no pit is drawn as floor; the hut cannot be entered
  a bell short; a fall shows where it puts the owl and never costs more than a screen or two; the bots
  pass with the baseline no longer. Should move: course runs quit before the first bench.
  What it changed, in short:
  - The jump (`packages/shared/src/jump.ts`): the speed a rise is cut to on letting go, 180 to 640.
    One number, shared with the glass climb, whose pilot never used a short hop.
  - The kit (`KitRun.sunk`, `shade`, `fill`): a drop is a stretch of the ground line with no top
    piece, its texture a step below the walk and in shadow, or painted as still water where the realm
    has no texture for it. Each realm's hazard art (the realm kit's hazard slot) stands in it at full
    strength. The ink realm has no hazard art yet, so its water is painted by the game.
  - The fall (`coursebook.ts`): back to the nearer of the run's bench in the room and the way the owl
    came in. The room server remembers the way in for as long as it holds the owl (in memory only).
  - The hut (`course.ts`, `endsCourse`, `doorWaitsOn`): a doorway into a room where a course only
    ends waits for every part.
- **M2. Say what to do.** Items 2, 10. Done when: each course opens with its goal and its three moves,
  first-time prompts name the key or button, the strip shows the clock, and a prompt stands over the
  thing in reach. Should move: course runs that reach the first bench, and course clears.
- **M3. The arcade.** Items 7, 8, 9, 21. Done when: a result card cannot be skipped by accident, a run
  can be paused, each game names its keys.
- **M4. The Great Hollow and the ways through.** Items 11, 13, 14, 19, 20.
- **M5. The phone pass.** Items 12, 24 and whatever the phone walk finds: the stick, Jump, Dash, the
  pad, every room at 844x390 and upright.

## Bigger changes, after the cleanup

- **B1. A first quest where owls arrive.** Goal: an owl that has just come in is given something to
  do within ten seconds. Why it beats what is there: 15 of 19 visits end in the Great Hollow and no
  quest has been started since Nov 1, because every quest owl stands a doorway further on. Steps: a
  quest owl at the arrival spot; a first quest whose steps are the game's moves (walk, hop a root,
  glide, take a doorway, ring a first bell); the feather trail leads to the quest owl first. Done
  when: the play log shows quests started and fewer visits ending in `m3-hall`.
- **B2. The camera in side-view rooms.** Goal: the camera shows where the owl is going. Why: it eases
  by the frame, so it lags on slow devices; it has no look-ahead; it slides after a fall. Steps: ease
  by time; look ahead of the owl's flight; frame the goal when it is high; cut under the fall's fade.
  Behind a flag first.
- **B3. A small sound set.** Goal: every move a player makes is heard, from one module, one switch.
  Behind a flag first; the owner listens before it is on.
- **B4. One HUD style.** Goal: one set of sizes, corners and colours for the Menu, the cards, the
  shop and the arcade.
- **B5. Movement that forgives.** Goal: the walk runs inside the flight's fixed step so it does not
  depend on the frame rate; a little more grace at a ledge's edge; thin hazards tested along the
  path moved, not at a point.

## Log

- 2026-11-11: plan written after the walk. Five walkers at once used up the account's usage limit
  and were cut off part way; work from here is one thing at a time. Findings read from the code and
  not yet played are confirmed before they are fixed.
- 2026-11-11: milestone 1 built (OP-343). Choices made on the way, each the sensible default:
  - The tap. 640 and not higher: the shortest press there is still rises less than a held one (83
    against 145 px), so a held jump keeps its meaning, and a press of a fifteenth of a second clears
    every course's first step. A fixed-height jump was the other choice; it would have taken the low
    hop away from players who use it.
  - Lily pads and pond-edge stones are gone from the ink course's water: they looked stood on.
  - The neon drop shows the street with live tubes too close together to land among. The street is
    the realm's own ground texture in shadow, because a realm's rooms may name only its kit's slots.
  - A fall blinks the room dark for a quarter second (not with calm motion on) and the camera cuts
    with the owl. A longer beat (the owl seen in the water first) is left for the sound and feel work.
  - Item 16 left alone, and why: see the list.
  - Building faces an owl walks in front of (item 15, second half) moved to M4: it changes how every
    ledge's body is drawn in every kit room, the tree's included, and wants its own look.
