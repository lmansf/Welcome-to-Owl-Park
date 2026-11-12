# Owl Park cleanup and rebuild: the plan

- Status: the pass is done and every change of it is live. The owner's word of Nov 12 on what was
  waiting (the art is mine to pick; everything else approved as it stood) was carried out in three
  changes: the sounds and the side camera on for every visitor (OP-355, PR 232), the town view and
  the thermal on (OP-356, PR 234), and the courses' own art (OP-348, PR 235, put up again and
  merged on his second and third words of that day). Ticket OP-342. Branch
  `claude/determined-wozniak-3ljxrf`.
- Last updated: 2026-11-12. Live for every visitor: the cleanup's five milestones (OP-343 to
  OP-346, OP-349), the first flight (OP-347), the art pass (OP-348: the Great Hollow, the courses'
  ground, and the neon and ink courses on art of their own realms; 4.32 of the owner's 10 dollars
  spent), the flight at any frame rate (OP-353), three small controls on a phone (OP-354), the
  sound set (OP-350), the side camera (OP-351, OP-352), the town view (OP-336) and the thermal
  (OP-340). No feature of the pass is behind a flag (`friends`, from before it, is the one flag
  left). Looked at and left, with why in the log: one HUD style (B4).
- What comes next is the owner's to choose: on Nov 12 he asked for one larger-than-life change
  that would make the park far more inviting to a new player or bring a player back. The one
  recommended, and why, is the log's last entry. Nothing of it is built.
- Still the owner's to say: OP-335 and OP-341 (each needs a change under `.github/`, which his
  rules keep his unless he says so of that change); the "at the park" quest step (naming the
  place changes a logged step's words); OP-357 (the art tool's own tests are not part of CI and
  three have gone stale).
- To pick up after a break: no outside visitor has come since the cleanup went live (last read
  Nov 12). Read the play log first, owl by owl (the correction under Baseline says why), then the
  punch list's items 14 and 16 and the log's last entries.
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

Read again late on Nov 11 (`game.v_session_end` joined to `game.fact_session`, `game.v_course_run`),
before any of this pass was live. Test visits left out (`is_test`: 21 of the 41 visits since Nov 9 are
the park's own checks, each under half a minute): 20 visits by about ten owls, 15 of them ending in
`m3-hall`. Those 15 left half a minute after coming into the hall (median 28 s; a quarter within 13 s,
three quarters within three minutes). No course run has started since Nov 10. So few visits cannot
show a milestone moving in a day; they do say where visits end, and the first quest where owls arrive
(B1) goes ahead of the phone pass.

**Corrected on Nov 12.** The numbers above counted every visit the log does not mark as a test, and
that was wrong. Read owl by owl:

- Of the 20 visits of Nov 9 to 11, 10 were one owl on a phone that has come on every day since
  Nov 1 (49 visits; a keeper's, by its pattern), 3 were automated by their pattern (they start inside
  the park, stay in one room for under 30 seconds, and each is a new owl), and 7 were outside
  visitors (4 owls).
- Of the 15 that ended in `m3-hall`, 11 were the keeper's and the automated ones. The outside
  visitors' median visit was 12.3 minutes, not half a minute in the hall.
- What every outside visit since Nov 1 does show (24 visits by 12 owls, so small numbers): on a
  phone 11 of 13 visits never reached the arcade or a course; the six visits that did reach one
  lasted 15 to 75 minutes, against a median of 3.6 minutes for the rest; two owls came back on
  another day; every outside visitor was a guest; and no two were ever in the park at once.

Where this file's milestones and log quote 15 of 19 or 15 of 20, read them with this correction. The
first flight (B1) was built on that figure. Its case now rests on the third point: most visits never
reach play, and the hall is where a guest has the roots, the glide and the thermal to play with.
To tell outside visitors apart: leave out any owl with thirty visits or more, and any visit that
starts inside the park, stays in one room and lasts under 30 seconds.

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
| 1 | Nothing says what to do on arrival: no quest owl or first quest where owls arrive; every quest owl stands in a realm room (V) | `lobby`, `m3-hall` | A first thing to do where owls arrive, with the feather trail leading to it (bigger change B1; a guest may take no quest, so it is the hall's root runs) | B1 (OP-347): the feather trail leads a new owl to the Great Hollow's roots, tips say how to hop up and glide, the first glide is marked. A first quest stays locked to guests by the ticket rules, which are not this pass's |
| 2 | A course never says how it is played: no goal, no controls (hold Jump to glide, flap, dash), no clock though the gold prize is timed (V at arrival) | all three courses | A start card, first-time prompts at the first gust, stone, sign and bench, the run's clock in the strip | M2: tips in the room at the first of each thing (the goal and the moves at the way in), and the clock with the gold time in the strip |
| 3 | A quick tap of Jump is a tiny hop (a short press rose 52 px, a hold 145; the first step of each course is 90 to 120) (V) | everywhere | Raise the least height a jump reaches so a tap clears a first step | M1: a tap now rises 83 to 128 px, a tapped flap is nearly a whole one |
| 4 | Falls look like floor: pits and water are drawn as the same ground as safe floor, hazards faint (V) | all three courses | Draw every pit as a pit, the same way in each course | M1: the walk ends at a bank; a bramble dip or the street lies a step below it, and in the ink course the walk is flooded with still water; a rule test refuses a pit drawn as a walk |
| 5 | The hut at the end is open with no bell rung and has no way back; coming in again starts the run over (C, confirmed) | `canopy-3`, `canopy-hut` | The hut's doorway holds until every bell is rung and says what is missing | M1: the doorway waits and says how many bells are rung |
| 6 | A fall is an instant silent put-back with the camera sliding after; some rooms have no bench; a room entered from its far end sends a fall to its other end (C, confirmed) | courses | A fall beat, a bench where a fall costs a whole room, and the way in as the fall-back | M1: a blink, the camera cut with the owl, a line; back to the nearer of the bench and the way in; one bench added (`circuit-3`) |
| 7 | The play key skips the result card: a new run started 0.4 s after the crash (V) | arcade | No play key for a moment after a run ends | M3: Play again is not pressable and holds no focus for 0.9 s |
| 8 | No pause; Escape or Close ends a run at once with nothing paid and no question (V) | arcade | Pause first, with Keep playing and Leave | M3: Escape or Close pauses; Keep playing, or Leave the game |
| 9 | Unclear rules: "Tap to flap" on a computer; a drag toward the target fires into the ground (V) | arcade | Name the keys; a forward drag is no shot | M3: Space to flap; the arrows named for Talon Toss; a pull forward is no shot |
| 10 | The prompt for anything is a pill in the far bottom corner; nothing shows at the thing (V) | everywhere | A prompt over the thing in reach as well | M2: a prompt on the floor at the owl's own feet, with the key on a computer |
| 11 | A statue 500 px tall on the near rim hides the player's owl and wears a doorway's sign (V) | `m3-hall` | Tall art fades while the player's owl is behind it; the sign moves onto its doorway | M4: tall standing art goes see-through while the visitor's own owl is behind it; a doorway at the hall's end has its sign beside it, by the sign's own edge |
| 12 | The pad's label is cut off on a phone: "Look in t..." (V) | phone | A label that fits | M5: the label takes the width its words need |
| 13 | One place, two names: quest steps say "the great tree" and "the glass street", the signs say other names (V) | quests, signs, Menu | One name per place | M4: the quest screens show each place by the name the walked park's signs and Menu give it; the Menu's map says what Neon Roost is (the arcade). Left: one step that reads "at the park" for the arcade's leaf pile (its words are the play log's) |
| 14 | Human objects where owl ones belong: a trapdoor with a ladder, a plank hut door, park-bench checkpoints, a door booth, a vending machine (V) | courses, `m3-hall` | Swap to the kit's knot-holes and perches where it has them; list the rest for the artists | left for the artists, with the list (see the log, M4): each is its realm kit's own slot, and the kit has no owl piece to stand in for any of them in all three courses alike |
| 15 | Hazards drawn by code read as debug boxes; building faces drawn solid are walked through (V, C) | courses | Each hazard drawn as the thing it is; faces behind the owl | M1: thorns, mist, falls and wires redrawn with no box of colour. The faces: left alone, and why: see the log, M4 |
| 16 | A jump and one flap reaches the wires; a full jump on the waterfall ledge reaches the falls (worked out) | `circuit-2`, `circuit-3`, `brush-2` | Check with the bots, then lift the hazards | left for now: the high wires are what stops a glide over the whole act, and the kid bots pass. Look again at the log's fall spots once there are runs to read |
| 17 | Offline builds: thorns over safe floor do nothing, so a preview plays easier than the live park (C, confirmed) | previews | One fall rule for both | M1: a preview judges a fall and sends it back as the room server does |
| 18 | The camera eases by the frame, not by time, so it trails further on a slow device; the backdrop shows under the walkway; goals crowd the screen's corners (C, V) | courses | Bigger change B2 | B2 (OP-351, OP-352), on for every visitor since Nov 12 (OP-355): the view eases by time, leads the owl's travel, holds through a jump and keeps up with a fall. The backdrop's layers are as they were |
| 19 | A direction held through a doorway keeps walking the owl in the next room (V) | doorways | Wait for a fresh push after a doorway taken with Up | M4: a direction held across a change of view (side to above, above to side) is not a walk until it is let go or points elsewhere |
| 20 | The feather trail is faint; edge chips are arrows with no words; HUD words stay lit over the dark between rooms (V) | everywhere | Contrast, a word on each chip, dim with the room | M4: the trail's feathers are pale and edged dark; a course's chips say Next part, Back, Finish or where they lead; a course's strip and the actions fade with the room |
| 21 | Words: a one-player game "to play with whoever is in the park"; three ways to word an ending; developer wording a player can meet; fallback emoji symbols (V, C) | arcade, Menu | One wording pass | M3 for the arcade's lines. Left: the puzzle's emoji faces (a fallback for art that ships), and lines in the ticket and friends screens |
| 22 | Almost no sound: only the Menu's knock was found (C, partial) | everywhere | Bigger change B3 | B3 (OP-350), on for every visitor since Nov 12 (OP-355), under the Settings switch: thirteen cues for the visitor's own owl |
| 23 | The HUD's screens do not share a style: seven corner sizes, five button heights, three golds (C) | HUD, Menu | Bigger change B4 | left: one style for the HUD's screens (B4) was counted and looked at again on Nov 12 and left, with why, in the log. The three controls under 44 px on a phone are 44 |
| 24 | Home screen on a phone held upright sits in half the width; the free way in is the smallest button (V) | home | Full width; a 44 px target | M5: the free way in is 44 px tall. The upright home screen's width is as it was |

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

- **M1. Courses you can read and survive (OP-343, merged as PR 224 on Nov 12).** Items 3, 4, 5, 6, 15, 16, 17. Done
  when: a tap clears the first step of each course; no pit is drawn as floor; the hut cannot be entered
  a bell short; a fall shows where it puts the owl and never costs more than a screen or two; the bots
  pass with the baseline no longer. Should move: course runs quit before the first bench.
  What it changed, in short:
  - The jump (`packages/shared/src/jump.ts`): the speed a rise is cut to on letting go, 180 to 640.
    One number, shared with the glass climb, whose pilot never used a short hop.
  - The kit (`KitRun.sunk`, `shade`, `flood`; the `hazard` layer): a pit is drawn one of two ways. A
    drop is a stretch of the ground line with no top piece, its texture a step below the walk and in
    shadow, with the realm's hazard art (the realm kit's hazard slot) in it at full strength; both are
    in the new hazard layer, under everything an owl stands on. A flooded walk keeps its run and has
    still water painted over its top. The canopy and the neon course use drops; the ink course, which
    has no hazard art yet, is flooded.
  - The fall (`coursebook.ts`): back to the nearer of the run's bench in the room and the way the owl
    came in. The room server remembers the way in for as long as it holds the owl (in memory only).
  - The hut (`course.ts`, `endsCourse`, `doorWaitsOn`): a doorway into a room where a course only
    ends waits for every part.
- **M2. Say what to do (OP-344, merged as PR 225 on Nov 12).** Items 2, 10. Done when: each course opens with its goal and
  its moves, tips name the key or button, the strip shows the clock, and a prompt says what Interact
  does where the owl stands. Should move: course runs that reach the first bench, and course clears.
  What it changed, in short:
  - Tips (`courseTips.ts`, `courseTipSigns.ts`, the words in `courseWords.ts`): a few words in the
    room at the first of each thing, shown while the owl is near it and about as high as it, one at a
    time. A thing up high has its tip hung under it.
  - The clock (`objectiveStrip.ts`): the run's time, and the gold time while it can still be beaten.
  - The prompt (`reachPrompt.ts`): on the floor at the owl's feet, under a doorway's sign where one
    lies there. Not for a doorway seen from the side (its arrow says up) or for Decorate.
- **M3. The arcade (OP-345, merged as PR 227 on Nov 12).** Items 7, 8, 9, 21. Done when: a result card cannot be skipped by
  accident, a run can be paused, each game names its keys. Left for later, with the reason on the
  ticket: Moon Flap's difficulty (wants the day's scores, not one script's try), the score wall off
  screen from mid floor, the feather counter over the first cabinet's sign (PR 221 is open on those
  cabinets).
- **M4. The Great Hollow and the ways through (OP-346, merged as PR 226 on Nov 12).** Items 11, 13, 19, 20; 14 and the
  faces of 15 looked at and left, with the reasons in the log. Done when: a key held through a doorway
  between a side view and a view from above leaves the owl standing; the visitor's own owl shows behind
  tall art; every doorway sign, Menu place and quest step names a place one way. Should move: visits
  that end in the Great Hollow (15 of 19 at the baseline), and trips back through a doorway within five
  seconds. What it changed, in short:
  - The held key (`doors.ts`, `carriedIn`, `stillCarried`): the direction held as the owl comes in
    across a change of view does not steer, and held up does not take a doorway, until it is let go or
    turns more than 40 degrees. Between two rooms seen the same way nothing changes.
  - See-through (`seeThrough.ts`, `seeThroughArt.ts`): in a room seen from above, standing art taller
    than an owl fades to a third while the visitor's own owl is behind it.
  - Signs (`DoorDef.labelAnchor`, `hollowHall.ts` `endSign`): a doorway in a room's side has its sign
    beside it by the sign's near edge.
  - Names (`npcs.ts` `placeWords`, `placeShown`): shown words name a place as the walked park does.
  - Chips (`hints.ts` `sideChipWords`), the trail's colour, and the room's own HUD parts fading with it.
- **M5. The phone pass (OP-349, merged as PR 227 on Nov 12).** Items 12, 24 and what the phone looks found. Eight rooms
  looked at on a phone-sized touch screen, upright (390x844) and sideways (844x390). Done when: the
  pad's label is read whole, the thumbstick does not hide the owl, and the free way in is a full-size
  button. Should move: phone visits' length. What it changed, in short:
  - The pad's Interact label takes the width its words need, up to the limit it had: "Browse the
    stall", not "Browse the...".
  - Held sideways the thumbstick lay over the owl at every course's way in. It fades to a third while
    the visitor's own owl is under it and no thumb is on it (`joystick.ts` `underStick`).
  - The home screen's free way in is 44 px tall (it was the smallest button, 40).
  - Left as it is: a course held upright says "This part of the park plays with your phone on its
    side.", which is by design.

## Bigger changes, after the cleanup

- **B1. A first flight where owls arrive (OP-347, merged with M4 as PR 226 on Nov 12).** Goal: an owl that has just come in has something to do
  within ten seconds, and has jumped, flapped and glided before it meets a course. Why it beats what
  is there: 15 of 20 visits end in the Great Hollow, half a minute after the owl comes in. The first
  plan was a first quest given at the way in. The play log says who those visitors are: every one is a
  guest (a spectator, OP-191), and quests are locked to guests by the room server, which is the ticket
  rules' business and not this pass's. That is also why no quest has been started since Nov 1; it was
  never that the quest owls stand a doorway further on. So the first thing to do has to be one a guest
  may do: the hall's own root runs (OP-308), which nothing leads to and nothing explains. Steps: the
  feather trail leads a new owl to the nearest root run before any doorway; tips stand at the first
  root, the stump and the landing, as a course's do (M2); a line when the first glide lands, and the
  trail goes on to a doorway. Done when: a new owl's first minute has a jump, a flap and a glide in it
  (browser test), and the play log shows fewer visits ending in `m3-hall` in their first minute.
  A first quest for ticket holders can follow once the log shows ticket holders.
- **B2. The camera in side-view rooms (OP-351; on for every visitor since Nov 12, OP-355).** Goal: the
  camera shows where the owl is going. Why it beats what is there: a course is played by jumping at
  what comes next, and with the owl dead centre the next ledge or pit is half a screen away at best;
  the whole view rose and fell with every hop; and it eased by a share each frame, so at half the
  frames (a slow phone) it trailed the owl. What it is (`apps/park/src/game/sideCamera.ts`, rules only,
  tested): the view leads the way the owl travels, up to a sixth of the screen, more the faster, and
  swings round in about half a second when it turns; it holds the height the owl last stood at
  through a whole jump, climbs with a flap on top or rising air, and follows a fall down at once; and
  it eases by time. Rooms seen from above keep their camera. A fall already cuts to the owl
  (milestone 1). Not done: framing a goal that is high up. Done when: the rule tests and a browser
  test pass, the flag check passes, and the owner has played with it (it was behind `?cam=1` until
  his word of Nov 12). Should move: course runs that reach the first bench; falls per run.
  It keeps up (OP-352, Nov 12, a PR of its own after PR 228): the view is carried along with the owl before it
  eases, so a walking owl has its whole lead on the screen at any frame rate, a falling owl stays 24
  px under the height held, and an owl in rising air 40 px over it. Measured in the park before and
  after, in the log.
- **B3. A small sound set (OP-350; on for every visitor since Nov 12, OP-355).** Goal: every move a
  player makes is heard, from one module, one switch. Why it beats what is there: the park is silent
  but for a knock as the Menu opens, so nothing a player presses is answered by anything but what they
  can see, and there is nothing to time a flap by. What it is: a table of thirteen cues
  (`apps/park/src/game/sfxCues.ts`), each a few short tones or breaths of noise made on the spot, and
  one player (`sfx.ts`). The moves' cues are read off the owl's own flight as it changes (`airCues`:
  left the ground rising, a flap spent, wings spread, caught by rising air, landed as hard as it fell),
  so the keys, the buttons and a tap all sound the same and a press that did nothing is silent. A
  course's moments (a part, a feather, a bench, a fall, a shortcut, the finish), a dash and a doorway
  add theirs. Only the visitor's own owl is heard. The Settings switch "Sounds" turns all of it off.
  Done when: the rule tests and a browser test pass, the flag check passes, and the owner has listened
  (a sound board went to him in the session; it was behind `?sfx=1` until his word of Nov 12).
  Should move: course runs that reach the first bench; visit length.
- **B4. One HUD style.** Goal: one set of sizes, corners and colours for the Menu, the cards, the
  shop and the arcade.
- **B5. Movement that forgives (OP-353, in review).** Goal: the flight is the same game at any frame
  rate, and a slow device is not a harder park. Why it beats what is there: on a clock the test
  drives, the same presses gave two games. A hop that comes down 3 px inside the end of the canopy
  course's first step landed at 50 frames a second and fell past it at 10; a dash through 30 px of
  thorns was a fall at 50 and stepped over them at 10. The test bots step the owl's place with its
  flight, so they certified a game slow devices did not get. What it is: the flight asks where the
  owl is at each of its own steps, along its walk (it asked where the last frame drew it, a frame's
  walk behind); thorns are looked for along the way the owl came since the last frame
  (`thornsBetween`); and the grace for a jump after stepping off a ledge's end is 120 ms, not 90
  (`EDGE_GRACE_MS`): what a thirty-frames-a-second phone had while its owl was read a frame late,
  now the same on every device. Done when: the two browser tests on a driven clock pass (they fail
  on what is live at ten frames a second), the rule tests, `pnpm check`, the bots. Should move:
  falls per course run on phones toward the computers' rate; runs that reach the first bench.

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
  - The style check (`pnpm kit:check`) held the first build back, rightly: it measures each screen's
    walkway against the bands of `docs/TREE_STYLE.md`, and a drop and its bramble counted as walkway.
    Hazards are now their own layer, which the check counts as neither backdrop nor walkway (as it
    does the trunk and walls). The bands themselves are untouched. The ink course could not pass with a
    sunk river: its walkway's numbers had been carried by the path that was painted over the water,
    and its stones and paper cliffs alone are harder and paler than the band allows. So its river is
    the walk flooded (water over the path, the earth and stone showing under it), which keeps every
    screen inside the bands with more room than it had on main. The water stands a little over the
    walking line, over the grass that grows on the walk: with the grass showing above it, the river
    read as a strip of ground with water under it. Three small changes in `brush-2` stand on their
    own: the waterfall is drawn solid and comes down into the river, and a lantern lights the far bank.
  - Item 16 left alone, and why: see the list.
  - Building faces an owl walks in front of (item 15, second half) moved to M4: it changes how every
    ledge's body is drawn in every kit room, the tree's included, and wants its own look.
- 2026-11-11: milestone 2 built (OP-344). Choices made on the way:
  - Tips in the room, not a start card. A card is one more thing to close before playing and needs a
    memory of who has seen it; a tip stands where the thing is, is read when it is needed, and is
    passed by a player who knows it. They show on every visit.
  - The prompt lies at the owl's feet, not over its head or over the thing: over the head it lay
    across the face of whoever stood behind, and over the thing would need each thing's height. One
    place for every kind of thing, where the visitor is already looking.
  - Seen on the way and left for M5 (the phone pass): on a phone held sideways the thumbstick lies
    over the owl at a course's way in.
- 2026-11-11: milestone 4 built (OP-346). Choices made on the way:
  - The held key. Measured first: Up held out of a course walked the owl 1,000 px across the Great
    Hollow in three seconds. The rule is by view, not by key: across a change of view a held direction
    means nothing (a doorway on the hall's rim can face any way, a course always starts to the east),
    so the owl stands until a fresh push; between two rooms seen the same way a held direction still
    points where the owl was going, and it walks on as before. A thumbstick may waver 40 degrees and
    still be the push it came in with; any walking key added or let go is a new push.
  - See-through is for the visitor's own owl only. Other owls stay hidden behind things, which is what
    says the thing stands in front of them.
  - The end doorway's sign had been set half a long label in from its doorway (Nov 9) so that no word
    slipped under the doorway's art; on a computer the short sign stood 340 px from its doorway, on the
    idol's face. Standing the sign's own near edge at the art keeps what Nov 9 wanted at any length.
  - Names. Quest text is worded once for every owl by the room server, and the play log records those
    words, so they are left as they are: the quest screens put the walked park's names in as they show
    them. One step still reads "at the park" (the arcade's leaf pile has no place name); naming it would
    change a logged step's words, so it waits for the owner's word.
  - Left alone, item 14 (human objects). The trapdoor and ladder (`kit-hatch-down`), the plank door
    (`kit-clearing-hut-door-open`), the three checkpoint benches (`kit-*-checkpoint-bench`), the door
    booth (`kit-neon-rooftop-door-open`) and the vending machine (`kit-neon-vending-machine`) are each
    the realm kit's own slot, drawn from a stand-in. The kit has a perch for the canopy only, and
    benches in one course and perches in the others would be less consistent, not more. For the
    artists: a knot-hole in the floor for the way down, a woven door for the hut, a perch with a lantern
    for a checkpoint, a roost door for the booth.
  - Left alone, the faces (item 15). A ledge's body is drawn solid down to the ground and an owl on
    the ground walks in front of it. Drawing it darker, or behind, changes the walkway that
    `pnpm kit:check` measures on every screen of every kit room, and the ink rooms sit at the edge of
    their bands already. It belongs with the art pass (a face texture per realm), not with a recolour.
  - The trail's look is only brighter. Where it leads is bigger change B1's.
- 2026-11-11: bigger change B1 built (OP-347), ahead of the phone pass. Choices made on the way:
  - Not a quest. The visitors who leave from the Great Hollow are guests, and the room server gives a
    guest no quest. The hall's root runs are free to everyone and were explained by nothing.
  - The roots are one more of the trail's "games of the room's own" (`featherTrail.ts`, `PLAY_SPOTS`):
    the floor before each inner run's first root, one find between the two. Standing there finds
    them, and the trail leads on to a doorway as before.
  - Two tips, drawn by the course's own signs: how to hop up, at the first root; how to glide, up on
    the knot or the stump. They show until this device's owl has glided off a root once, and then no
    more (one mark kept with the doorways tried). A line marks that glide.
  - A glide counts from the stump's height and 320 px or further: a hop between roots or a step off
    the first one is not it.
- 2026-11-11: the art pass begun (OP-348), on the owner's word that day: "the art is kind of clunky
  and ugly and disconnected". Eighteen rooms looked at side by side. The rooms that are one painting
  each hold together. What does not: the Great Hollow, the courses' borrowed ground, and the canopy's
  repeating plank wall. Part one, with the art that exists and no spend:
  - The Great Hollow's floor is the painting the owner chose on Nov 10; what lay over it was not
    matched to it. Its plaza rings were placeholder shapes in the tree's moss greens (now the
    moonbeam's light pooled on the floor and a ring of stones); the shadows at the feet of its roots,
    doorways and idols were drawn under the painting (now over it); the roots and idols kept the cold
    light they were painted in (now multiplied by the room's); the neon idol's glow, sized for an idol
    twice as tall, lit the roots 400 px away green (now the idol's size); and each root had an amber
    box round its strip of floor (now a soft footprint; a solid perch that is part of a room's
    painting keeps its amber edge, the owner's ask of Nov 7).
  - Tried and rolled back: toning the neon course's roofs (the treetop's silvered planks, a stand-in)
    toward its night. A dark tone fails the walkway's lightness and contrast on one screen of
    `circuit-3`; a pale one fails the palette check. The bands and the palette are the owner's and are
    not loosened, so the courses' ground waits for part two.
  - Part two is new paintings through `tools/art`: a neon wall, an ink ground, the canopy's trunk wall.
    It needs the owner's yes to spend (asked: a cap of 10 dollars) and his pick from contact sheets.
- 2026-11-12: the art pass, the courses' ground (OP-348), with the art that exists and no spend. Looked
  at closely, what made the ground clunky was three faults in how the kit lays its pieces, not the
  pieces:
  - The pieces of one painted row were each laid by their own highest pixel. In a row of grass that
    is a different height in every piece (the earth path's from 14 to 37), so neighbours cut from one
    painting sat as much as 23 px apart: a step in every mound of all three courses. A row is now laid
    on one line (`rowTop` in `kit.ts`), its boxes side by side as they were painted.
  - A platform body's side was framed with shade and a creeper even where another body begins at it.
    Since milestone 1 drew pits as drops, that put a dark band and a vine down every pit's edge, a
    slit in the ground. This one was milestone 1's own doing. A side is framed only where it stands
    free (`kitFrames` in `edges.ts`).
  - A run shorter than one of its ends had both ends laid whole, one over the other and out past the
    run: the ink course's first stone step was drawn 200 px wide and stood 120. Each end now shows
    only its outer part (`KitDraw.crop`).
  - The neon course stood on the tree's cut stone, with walls of the treetop's silvered planks:
    cream and bleached wood in a violet night. Both are stand-ins from another realm's kit. They are
    now drawn multiplied by a blue (`NEON_LIGHT`, `KitRun.tint` and `shade`), a stone and a wall lit
    by the street's own signs. This takes back the "tried and rolled back" of Nov 11: a tone does
    pass, when it is aimed. The check measures how far a colour family's pixels lean off the
    palette, so the blue has to be as full as the palette's sky blue (a greyer one drifts 13 to 19
    against the 13 allowed) and light enough to keep the walkway's contrast over 7.5. Candidates were
    put through the check itself until one held all eight screens: 0x96c0ff.
  - Left, with the reason: a step at least an end long keeps its overlapped ends. Cut the same way,
    one screen of `brush-falls` goes from 13.96 to 14.11 against the 14.0 the style check allows a
    walkway's contrast, and the band is not loosened. Also left for paintings: the tone of the earth
    path's middle pieces against its ends, the ink course's green mounds on its paper, the ink
    pond's flat water, and a row and a wall of the neon realm's own.
- 2026-11-11: B3 built (OP-350), hidden behind `?sfx=1`. Choices made on the way:
  - No sound files: every cue is made in code, as the Menu's knock and the loader's hoot already are.
    They are stand-ins. A sound designer replaces one by giving its name a recording.
  - The gains were set by measurement, not by ear (this session has no ears): each cue was rendered
    in a browser and its loudest 50 ms compared with the Menu's knock. What sounds at every jump sits
    level with the knock, a glide 6 dB under it, a course's moments 1 to 3 dB over it. The owner's ear
    decides: the sound board lets him mark each one keep, change or drop.
  - Nothing rests on a tone under 200 Hz, which a phone does not play: a landing has a knock of noise.
  - Each cue has its own shortest gap, so a held key or five feathers at once is one sound.
  - Not done: other owls' sounds (80 owls jumping would be a din; a quiet, near-only version can
    follow), music, a volume slider, the arcade's games (PR 221 is open on its cabinets).
- 2026-11-11: B2 built (OP-351), hidden behind `?cam=1`. Choices made on the way:
  - The band a jump may rise in before the view climbs is a whole jump and a little (161 px): at 120
    a plain jump still nudged the view. A flap on top of a jump takes the owl out of it, which is
    when what is above matters.
  - In a view 442 px across (a narrow window; see the correction below) a sixth is a lead of 70 px:
    small, and right for that width.
  - The lead follows travel, not facing: a glide carried backwards by a wind leads backwards.
  - It goes up in one flag-hidden PR with the sound set, each behind its own flag.
- 2026-11-12: PR 228's browser suite was red, then mended. Both new browser tests timed their keys
  from outside the page, and a slow runner made them test something else:
  - The sound test's second Space (the flap) came after the hop had landed: a second jump, no flap.
    The page now makes that press itself, on the frame the owl is up.
  - The camera test walked the owl back to within reach of the doorway it came in by, and a key let
    go late walked it out of the room. It now turns and hops well clear of the door, the first pit
    and the first step (a hop under a ledge lands on it, and the view rightly climbs).
  - Measuring the test's margins showed what the camera does in a narrow view (442 px): of a 70 px
    lead, 30 to 50 px are eaten by the view's own ease trailing the walk (more at fewer frames a
    second). The test now checks what does not change with the frame rate; the rule is next to fix.
- 2026-11-12: the side camera keeps up (OP-352), a PR of its own after PR 228. What was measured in
  the park with `?cam=1` as PR 228 has it, and after:
  - A walk: the view was ahead of the owl by 181 to 190 px of a 219 px lead at 1280 wide, and by 37 to
    40 of 69 in a view 442 px wide (14 to 22 with the processor slowed six times). After: 223 of
    225, and 68 of 69, slowed or not.
  - The drop off the fern floor's high bough (380 px): the owl was 103 to 132 px under the height
    the view held by the foot of it as the test runner draws it, 253 by the rules at sixty frames
    a second (the height was eased, and the view eased to it again). After: 22 to 23, the band.
  - The gust in the trunk's third storey: the owl was 220 to 237 px over the height held as it
    rose, and on a phone held sideways it went up under the goals bar at the top of the screen.
    After: 41 to 42, with the bough it is making for in the view beside it.
  - How: "carried, then eased" (`carriedTo` in `sideCamera.ts`). The view first goes as far as the
    owl went this step, then eases away what is left. What moves steadily is followed with nothing
    trailing, and a start, a stop or a turn is still eased. The height is eased once, not twice.
    In rising air the band over the owl is 40 px, not a whole jump's 161.
  - The flight goes in steps of its own (120 a second), and a frame holds one more or one fewer of
    them than the last: the camera is given the owl's height as its speed has carried it since the
    last step, so the view moves every frame by the same.
  - The camera's longest step is 250 ms, up from 100: at ten frames a second and under, the old
    cap made the camera lose time every frame.
  - Left for the owner's eye: the view meets the edge of its band at the owl's own speed (the
    usual way of a camera window). If that reads as a kick at the start of a long fall, the edge
    can be made soft.
- 2026-11-12: B5 built (OP-353). How it was found and what was chosen:
  - A browser test can drive the page's clock (`page.clock`: the game's loop, its timers and
    `Date.now()` all follow it), so a frame is exactly as long as the test says and a slow runner
    changes nothing. The same walk, jump and dash were played at 20 ms a frame and at 100.
  - The walk was already by the clock. What was not: the flight's many steps a frame all read the
    owl's place as the last frame left it. Coming down onto a ledge, the ledge's near end was not
    yet under the owl for a frame's walk (4 px at sixty frames a second, 9 at thirty, 26 at ten),
    and by the next frame the owl was under its top.
  - Going off a ledge's end the same lateness held the owl on it a frame longer, then gave the 90
    ms of grace: 107 ms at sixty frames a second, 123 at thirty. Read on time, every device would
    have had 90. The grace is 120, so no usual device loses what it had. The climb keeps its own 90.
  - Thorns: 20 in the courses, the thinnest four 30 px, all 450 px tall or more. A walk or a glide
    cannot step over one above nine frames a second; a dash (900 px a second) can from thirty down.
    The look along the move is a straight line between two frames, at most 7 px under the arc a
    jump really took in the longest frame it is used for (150 ms), so an owl that cleared a hazard
    is not read as through it. A longer frame is a stall: only where the owl is counts.
  - Not done: a ledge's end is still its end (no reaching past it to land), and pits are looked for
    where the owl stands, which no frame steps over.
- 2026-11-12, a correction to the camera's notes (OP-351, OP-352). They called the 442 px view "a
  phone held upright" and "the phone most players hold". A phone held upright does not play a room
  seen from the side: it is asked to turn (`turnPhone.ts`, and milestone 5's own note above). On its
  side its view is 1948 px wide (measured at 844 by 390), where the ease trailed a walk by the same
  39 px of a 302 px lead: a small gain. The 442 px numbers are a narrow window on a computer and the
  browser tests' phone project. A tablet held upright is not asked to turn and is between the two:
  625 px wide at 820 by 1180, a lead of 101 px, of which an ease alone left 62. What a phone player
  gets from OP-352 is the drop and the gust; a tablet player held upright, the walk's lead as well.
  The notes here, the code's comments, PR 229's description and the board now say so.
- 2026-11-12: one HUD style (B4), looked at again and left. Counted: 23 corner values (13 of them
  plain sizes from 3 to 28 px), two golds besides the Menu's amber (#ffd36a 71 times, #c9a227 21), and
  control heights from 28 to 64 px. Looked at side by side on a computer and a phone: the play
  screen's chips are one family (navy, gold line, pill), the Menu is its own sheet of wood by
  design (OP-108, with its own tokens and tests), and nothing reads as two styles colliding. Moving
  44 files onto one token set would change no screen a player could tell apart, and would need a
  look at every screen at three sizes to be sure of that. Not worth its risk; left, with the count
  here for whoever restyles the HUD with the artists.
  - What the look did find: on a phone every play screen's controls are 44 px or more either way.
    Under it were three: the Say wheel's two buttons, the Settings screen's Close and the home
    screen's three links, all 40 px tall. They are 44 now. (The Settings switches are 34 px tall
    inside rows that are labels: the whole row is the target.)
- 2026-11-12: the owner's word on what was waiting: the art is mine to pick, and everything else is
  approved as it stood. Carried out as three changes, each through the gate: the sounds and the side
  camera on for every visitor (OP-355), the town view and the thermal on (OP-356), and the courses'
  new paintings (OP-348).
  - OP-355. `flags.ts` loses `sounds` and `sideCam`. The room scene makes its sounds' player always,
    and every room seen from the side is steered by `sideCamera.ts`: the old follow of those rooms
    (the owl dead centre, eased by a share each frame) is gone, and rooms seen from above keep
    theirs. The line under Sounds in Settings is the draft he approved. No rule of either changes:
    this is what has been live behind the flags since PR 228 and PR 229.
  - The browser tests of both now open plain addresses, and fail on `main`, where a plain address
    plays nothing and has no side camera. The test that a plain address stays silent is gone: it is
    no longer true.
  - Looked at with the camera on, at 1440 by 900 and 1024 by 768: three storeys of the tree, the
    street of nests, the arcade's lobby, the three ways into the hall's tree and a room of each
    course. The owl is in frame in each and nothing is cut off; a room one screen wide is held by
    its own walls, as before.
  - To roll back: revert the change; the flags come back and both are hidden again.
  - Not carried out, and why. OP-335 and OP-341 each need a change under `.github/`, which the
    owner's rules keep his unless he says so of that change. The "at the park" quest step: naming
    the place changes a logged step's words. Both are still his to say.
- 2026-11-12: OP-356, the town view and the thermal on for every visitor. `flags.ts` loses `town`
  and `thermal`. Every room seen from above has the town view's zoom and edges, the Great Hollow
  its opening look, and its thermal lifts an owl gliding in the moonbeam at its heart. The room
  server has known the thermal since OP-340, so nothing of it changes.
  - The browser tests of both open plain addresses now and fail on `main`. The two that held a
    plain address to the old view and to a plain jump are gone: they are no longer true.
  - Looked at with the town view on, at 1440 by 900 and 1024 by 768: the twelve rooms seen from
    above. Each fills the screen from its back wall down, with nothing past its edges.
  - Run with both on before it went up, since the wider view is in every room seen from above: on
    a computer the town view, thermal, park, lobby, trail, way back, travel, activities, arcade,
    collection, chat, leave, sleep, which-owl, sizes, skin, mirror, nests, escape, party, home,
    loader and realm-start tests (121 passed); on the phone project the town view, thermal, park,
    zoom, stick, lobby and pad tests (54 passed).
  - To roll back: revert the change; the flags come back and both are hidden again.
- 2026-11-12: the order of the last two changes, and why. The courses' own art (OP-348) went up
  first, as PR 233, and its checks were green. The merge sweep did not merge it: it leaves to the
  owner any change GitHub cannot show, and the art record's 121 new lines are 119 KB. That is the
  sweep doing its job, so nothing was done to get round it. This branch is the only one the
  session may push to, so PR 233 was closed and OP-356 went up in its place. That had a cost seen
  only afterwards: a pull request that was closed is the owner's to call back, so the art is not
  put up again without his word. Its commit is kept on the branch once OP-356 is in. Next time,
  with one branch and a change the sweep will hold, put the change that can merge up first.
- 2026-11-12: the art pass, the courses' own paintings (OP-348, its second part). The owner gave
  the pick to me. What this commit holds: a rooftop deck (seed 9917) and a wall of corrugated sheet
  (seed 7719) for the neon course, and an ink-washed bank (seed 9922) for the ink course. The blue
  that made borrowed stone pass as the street's (`NEON_LIGHT`) is gone with the stone.
  - The first picks did not ship. At a thumbnail's size they looked right, and they passed the
    style check. Laid in the rooms at full size the deck ran from white at one end to blue at the
    other (a run is cut into ends and middles from different stretches, so a deck was a patchwork),
    and the bank's pale top band changed thickness (hard steps where pieces met). Kept for next
    time: look at a row butted in its room at full size before calling it picked.
  - Levelling could not mend the first deck. The tool brings each column's average colour to the
    row's, and a column of that deck is half pale slab and half dark beam, so the averages came
    level while the slabs stayed white at one end and blue at the other. Tried and dropped:
    levelling by the top face alone, with the lamp left out, and the slab and the beam each to its
    own colour (that turned the blue end pastel). The fault was the paint, so it was painted again,
    the prompt asking for the same light, tone and top edge from end to end and no lamp on a
    walked row.
  - The ink realm's rooms sit in a narrow place in the style check, and each round of banks met a
    different rule by a hair. An even bank with a thin line of moss was 0.94 short of the
    mountains' highlights on one screen. A bright cream band with no moss left the backdrop's own
    pine trees as that screen's only moss, 0.16 over the palette's drift at 1 % of the screen. The
    fourth round asked for the cream band and the moss line both, and holds all five rooms. In all
    36 paintings (12 decks, 8 walls, 16 banks), 4.32 of the 10 dollars.
  - The cave behind the falls keeps its fitted stone: the ink rock there takes the walkway's
    contrast to 14.44 against the 14 allowed.
  - Found and left. The style check paints a pit's water as a plain box of its colour, and the park
    paints it with shade, a top line and streaks (`drawWater` in `kitView.ts`), so a river screen
    measures about 1 lower in contrast in the check than a player sees. The bank that ships passes
    as the check stands, so the check is not touched. And `pnpm art:test` is not part of CI and
    fails three stale tests on `main` (OP-357); the two of its tests that count the kit's runs and
    textures are brought up to date.
  - Left for the artists: seams are fainter, not gone, and a ledge short enough to be two end
    pieces shows its join. The thin rows, the pipe and the plank are in the kits and laid nowhere.
- 2026-11-12: OP-356 merged (PR 234, `7c41c0e`) and is live: the deploy (run 305) ran on the merge
  commit. Every feature of the pass is on for every visitor. The branch was started again from
  `main` and holds two commits with no pull request open: the courses' own art (OP-348) and this
  note. The play log, read again at 13:58 UTC, after the deploy: still no real visit since Nov 11.
  - For the record, since both switch-on pull requests argued it and neither had run it: the tests
    as merged, run against `main` as it stood before each. Before PR 234 (`0fad22f`), all six tests
    of `e2e/townView.spec.ts` and `e2e/thermal.spec.ts` fail. Before PR 232 (`5cc6ad2`), the sounds
    test and both side-camera tests of `e2e/park.spec.ts` fail; its fourth camera test, that a room
    seen from above keeps its camera, passes, as it should.
  - A mistake of mine on the Ticket Board, mended as far as it can be. I wrote four of my Activity
    Log rows to row numbers I remembered, and the QA agent's run had filled those rows in between:
    its lines for OP-304, OP-319, OP-320 and OP-324 (each accepted, staying Done) were written
    over. Its verdicts are whole in those tickets' Notes, no status changed, and the log has a row
    for each saying what happened. Kept for next time: the board is shared, so add to the log by
    appending and never write to a row number from memory.
- 2026-11-12: the owner's word on the report: make every change live. The one change not live
  was the courses' own art, so it goes up again as a new pull request from the branch as it stood
  (the art's commit and this plan, on top of `main`). The sweep will leave it to him as before;
  his word is the yes it waits for, so it is merged on that word when its checks are green. Not
  taken as said of them, and still his: the two changes under `.github/` (OP-335, OP-341), the
  "at the park" quest step, OP-357, and the other sessions' open pull requests.
- 2026-11-12: the courses' own art merged (PR 235, `29b2018`) on the owner's word, and is live: the
  deploy (run 308) ran on the merge commit. `main` had moved twice while its checks ran (two pull
  requests of the owner's, sharing no file with it), so the full check and the kit check were run on
  the branch merged with the new `main` before it went in; `main`'s tree after the merge is the tree
  that was checked. Every change of the pass is live.
- 2026-11-12: the baseline corrected (see Baseline). I had not read the log owl by owl: half of the
  visits I called real were a keeper's phone and automated visits. Kept for next time: before
  quoting the play log, list the owls behind the visits.
- 2026-11-12: the owner asked for one larger-than-life change, to make the park far more inviting to
  a new player or to bring one back. Recommended, and waiting for his word (nothing is built): bring
  the guardian to life. The park's own account of itself is that its attractions are legendary owls,
  larger than life; in the game they are still statues four owls tall, and the painted great horned
  owl (`guardian.png`) stands only at the `grove` start. The change: that owl, eight or more owls
  tall, alive at the heart of `m3-hall`, where every visitor comes in. It breathes, its eyes follow
  the nearest owl, it turns its head to a newcomer, answers a hoot with its own, and its wingbeat is
  the thermal that is already there. Later: it knows an owl that has come before, its mood follows
  the park's moon, and owls gathered under it are lifted together.
  - Why this one. The log's outside visitors mostly never reach play, were never in the park with
    another visitor, and are guests for whom nothing counts. A living giant in the first hall is
    play that needs no finding, company in an empty park, and the same for every player.
  - What it should move: visits that end in `m3-hall` within a minute (down), visits that reach the
    arcade or a course (up), owls back on another day (up).
  - The first slice would hide behind a flag, change nothing on the room server and spend nothing:
    the painting that exists, enlarged, until a larger one is painted.
  - Weighed and set aside: an arrival by air (a glide down the tree in place of the walk from the
    nest), which gets a new owl playing at once but gives the park no face; and replays of earlier
    visitors' flights, which need stored data the owner's rules keep his.
