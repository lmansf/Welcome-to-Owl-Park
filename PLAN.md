# Owl Park cleanup and rebuild: the plan

- Status: the pass is done and every change of it is live. The owner's word of Nov 12 on what was
  waiting (the art is mine to pick; everything else approved as it stood) was carried out in three
  changes: the sounds and the side camera on for every visitor (OP-355, PR 232), the town view and
  the thermal on (OP-356, PR 234), and the courses' own art (OP-348, PR 235, put up again and
  merged on his second and third words of that day). Ticket OP-342. Branch
  `claude/determined-wozniak-3ljxrf`.
- Last updated: 2026-11-13. Live for every visitor: the cleanup's five milestones (OP-343 to
  OP-346, OP-349), the first flight (OP-347), the art pass (OP-348: the Great Hollow, the courses'
  ground, and the neon and ink courses on art of their own realms; 4.32 of the owner's 10 dollars
  spent), the flight at any frame rate (OP-353), three small controls on a phone (OP-354), the
  sound set (OP-350), the side camera (OP-351, OP-352), the town view (OP-336) and the thermal
  (OP-340). No feature of the pass is behind a flag (`friends`, from before it, is the one flag
  left). Looked at and left, with why in the log: one HUD style (B4).
- Since the pass (Nov 12), both under the owner's standing brief and neither the larger change he
  asked for: OP-358, the board's P1 from the QA walk (on a page whose room connection is down, the
  Menu map forgot the turnstiles after one trip), merged and live (PR 238); and OP-360, the ink
  course's first screen laid for a newcomer's plays, under "After the pass" below, from the first
  phone runs since the pass went live (11 falls in two runs), merged and live (PR 239).
- The larger change (OP-359): on Nov 12 the owner asked for one larger-than-life change that
  would make the park far more inviting to a new player or bring a player back. The one
  recommended was to bring the guardian to life, and his word the same day was "I like it, and I
  like it living in the heart of the great hollow". Its first slice is merged and live behind
  `?guardian=1` (PR 240), as "After the pass" below says. Switching it on for every visitor is a
  change of its own, after his look; four things about it are his to say (its lids, the carving on
  the rim, its size, and whether it goes on as it is or waits for a painting in parts).
- Asked for the same day and filed as OP-362: a critique of the art across the park against what
  a top studio ships, with a verdict and ranked fixes. Delivered on Nov 12 as a document for the
  owner, with pictures (the link is on the ticket). Verdict: not triple-A; about 2 of 5 across ten
  things a top studio checks; ten gaps ranked; about a third of the fixes need no money. Its gaps
  map onto the tickets of his audit of Nov 12 (OP-364 to OP-378); the four that had none are
  OP-397 to OP-400. Nothing was generated or changed under it.
- OP-396, found while building the guardian: the Great Hollow's camera rested two ways in one
  visit. Merged and live (PR 241, Nov 13). Under "After the pass" below.
- From the owner's audit of Nov 12 (tickets OP-363 to OP-395, filed by another session), this
  session takes the ones in its remit, one pull request at a time: OP-365 first (the quiz's size
  boxes, his yes on the ticket), under "After the pass" below; then OP-369 (the HUD's chips
  overlapping) and OP-370 (the hall at arrival). OP-368 (the second click at the turnstiles) is in
  the gate's code, which his rules keep his, so it is left for his word.
- Still the owner's to say: OP-335 and OP-341 (each needs a change under `.github/`, which his
  rules keep his unless he says so of that change); the "at the park" quest step (naming the
  place changes a logged step's words); OP-357 (the art tool's own tests are not part of CI and
  three have gone stale).
- To pick up after a break: no outside visitor has come since the cleanup went live (last read
  Nov 12, 14:10 Eastern); the one owl that has played since is a keeper's phone. Read the play log
  first, owl by owl (the correction under Baseline says why), then "After the pass" and the log's
  last entries.
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

## After the pass

### OP-360: the ink course's first screen forgives a first-timer

- Goal: a visitor who holds the stick toward the goal and presses Jump near an edge gets across
  `brush-1`, and a fall costs a moment, not the screen.
- What the play log says (Nov 12, the only phone runs of the ink course since the pass went live;
  a keeper's phone, so a player who knows the game): two runs of `brush-1`, 11 falls. The first run
  fell four times in thirty seconds, each time back at the door, and left. The second fell seven
  times in two minutes: three within four seconds, two within one second. Every crossing of the
  screen took at least one fall. One outside visitor has tried the course on a phone (Nov 10): one
  fall, no bench reached.
- What a first-timer does there, played on the game's own flight rules (the bots' owl, the stick
  held east, Jump pressed 60 px before an edge to 20 px after it, held for a tap up to the whole
  flight; no steering back in the air):

  | Crossing | Plain plays that land | What happens |
  | --- | --- | --- |
  | the first bridge's end up to the cliff `c1` | 0 of 25 without a flap; 84 of 160 with one or two | the cliff is 260 px up over a 260 px gap: Jump and both flaps, timed |
  | `c1` down to the stone `k2` | 13 of 27 | walking off lands; a Jump at the very edge overshoots the stone by 35 to 70 px |
  | the second bridge's end to the stone `k3` | 16 of 27 | walking the 40 px gap drops the owl under the stone; a late Jump overshoots |
  | the third bridge's end up to the cliff `c2` | 0 of 25 without a flap | as the first cliff |
  | `c2` down to the far bank | 6 of 27 | only a Jump held all the way (a glide) gets across |

  The kid sim rates the screen 100%, because its kid picks the best take-off spot, steers back over
  the ledge in the air and lets go of Jump over it. That is a player who already flies well.
- And after a fall: the owl is put on its bench, a step from a ledge's end, and a thumbstick still
  held walks it off again (the falls one and two seconds apart).
- What changes, and why it beats what is there:
  1. After a fall a held push waits until it is let go or pushed another way, the rule a doorway
     already has (`carried`, OP-346). A fall then ends where the owl is put.
  2. A brush stone paints when an owl lands on it or passes low over it. An overshoot lands on
     the bridge it has just painted, where today it lands in the water beside a stone it cleared.
  3. The first screen is laid again around its three beats (a bridge, two bridges in a row, a
     glide): solid rock at each cliff's foot, so the bridge ends on ground and a missed climb is a
     second try, not a fall; rising air beside each cliff, so a held Jump rises to it (the tip for
     rising air then stands at the first cliff, where it is first needed); the third stone reaches
     back to the bridge before it; dry ground under the long glide.
  4. The table above becomes a test beside the kid sim: every crossing of a course's first screen,
     played the plain ways.
- Steps: (1), then (2) with the page, the bots and the rule tests; (3) with the style check and the
  looks; (4); the browser tests on a held clock; the walk on a computer and a phone.
- Done when: every crossing of `brush-1` lands for the plain plays (the table, before and after, in
  the pull request), the kid sim, `pnpm check` and the browser suite pass, and it is live.
- Should move: falls per phone run in `brush-1` (5.5 on Nov 12) and runs that reach the first seal.
- Not in it: the course's other screens and the other two courses. They get the same table, and a
  ticket each if it shows the same faults.
- As built (Nov 12):
  - The way across the pond is level at the first stone's height. Each bridge runs onto ground:
    the first onto an island under the first paper cliff, the third onto an island under the
    second, which steps down onto the far bank. Each stone starts where the walk before it ends.
    The far bank begins under the second cliff, so the long glide and the upward stroke are over
    dry ground. The benches stand at the cliffs' feet, on the way every owl takes.
  - The cliffs are the high road. Rising air beside each carries a held Jump up (from the last
    strides of the bridge before it), both flaps climb them as before, and a miss comes down on
    the island. The column over the pond and its wind are gone; the first wind is the rain's.
  - A stone paints when an owl lands on it or passes over it no higher than a jump with every flap
    rises (`BRUSH_SWEEP`). The first stone reaches 40 px out over the water, so a jump from the
    bank's last strides passes over it.
  - The newcomer bot (`bots/sim/newcomer.ts`) plays the plain plays on the game's own flight:

    | What a newcomer does | Before | Now |
    | --- | --- | --- |
    | walks east from the first stone, nothing pressed | falls at the end of the first bridge | crosses the pond |
    | jumps once on the way across, anywhere, a tap to the whole flight | 0 of 315 plays cross | all 250 cross |
    | adds a flap or two after the jump | not played before | all 360 cross |
    | from the bank's floor, jumps in the last 220 px before the water | 3 of 55 come down on the first stone or its bridge | all 55 |
    | off either cliff, walks off or jumps at its edge with any hold | 13 of 27 land off the first, 6 of 27 off the second | all 52 land |
    | holds Jump from the last strides of the bridge before a cliff | glides under the cliff into the water | rises to the cliff, all 24 |

  - What is given up: with no ink painted, the cliffs and the stones past the first could not be
    reached at all; now an owl that glides well can reach them from the door. The seal still
    cannot be reached without the upward stroke. A room test holds both.
  - The kid sim is unchanged for the course (weakest hop 80%, in its third act; 0.2 falls on a
    clear) and passes; the room's three screens are inside the style check's bands and palette.

### OP-359: the guardian alive at the heart of the Great Hollow (first slice, behind `?guardian=1`)

- Goal: an owl that walks through the turnstiles meets something that looks back. A great horned
  owl about nine owls tall sits at the heart of the first big room, breathing, and it notices the
  newcomer: the park gets a face, and the first room a reason to look up and stay.
- Why it beats what is there. The first big room greets a newcomer with a floor, nine doorways and
  a line of feathers; nothing in it is alive. The park's story makes its guardians colossal and
  living; in the game they are idols about four owls tall on the rim, and the great horned owl is
  only the treehouse clearing's. From the play log (outside visitors, Nov 1 to 12, small numbers):
  on a phone 11 of 13 visits never reached the arcade or a course, the six visits that did lasted
  15 to 75 minutes against a median of 3.6 for the rest, every outside visitor was a guest, and no
  two were ever in the park at once. A guest alone in a big room needs the room itself to answer.
- The owner's word (Nov 12): yes, and it lives at the heart of the Great Hollow. A larger painting
  is still his to pick and pay for; this slice uses the one painting that exists, enlarged a
  little (soft on a big screen).
- What the slice is, all of it in the page and behind the flag `guardian`:
  1. Where: on the hall's middle line, its foot between the inner ends of the two root runs, as in
     the picture the owner saw. From where an owl comes in it is seen whole, under the owl; it
     stands clear of the knothole's sign; the heart's light and rising air are at its chest.
  2. Alive, and an owl. An owl's eyes are fixed in its head: it looks at a thing by turning its
     head. So the guardian's head follows the owl it attends to (the one that last called to it,
     else a newcomer, else the nearest), slowly; it blinks; it dozes when no owl is near and wakes
     as one comes. When an owl comes in by the knothole it lifts its head, tilts it the way owls
     do at something new, and gives one low hoot. It answers a hoot with its own, a bow with a
     bow, a tilt with a tilt. While an owl rides the rising air at the heart its breath deepens,
     the motes in the column surge with it, and it watches the rider go up.
  3. Drawn from the one painting. The page cuts it at the neck into a head and a body, draws lids
     for the blink, and puts them together each frame into one picture. No image file is added.
  4. It never hides the visitor's own owl: it stands among the owls with its foot as its depth and
     goes see-through while the visitor's own owl is behind it, the rule every tall thing in the
     park has (OP-346), over the shape of its head and body and not its frame.
  5. The feather trail goes round it: no feather is laid behind it.
  6. The clearing's idol on the rim is the same painting. With the flag on it stands as a carving
     (one tone of wood, still), so the living owl is not in the room twice.
  7. Its hoot is a cue in the sound table, low and soft, under the Sounds switch.
  8. Near it the camera keeps its face in view (added while building: see "As built").
- Not in it: the room server, the room's data, the gate, tickets, stored data, new art, spend. So
  it has no footprint yet (an owl can walk where its bough lies; a footprint is room data, and
  comes with switching it on); other owls behind it are hidden as behind any tall thing; it does
  not know an owl that has come before, follow the moon, lift owls gathered under it, or show from
  the gate. Those are later slices.
- Steps: the rules as a pure file with tests (who it attends to, how its head goes there, when it
  blinks, dozes, hoots and beats); the picture (cut, lids, one composed image); the scene's wiring
  behind the flag; the see-through shape; the trail; the carving; the cue; a browser test with the
  flag on and one that says a plain address has none of it; the looks at 1440x900 and 1024x768.
- Done when: with `?guardian=1` the guardian is in the hall and does each thing in 2 to 7, the
  tests say so, a plain address is as it was (the whole browser suite green), the pull request is
  labelled `flag-hidden` and through the gate, and the owner has pictures and a note of what to
  look at on his phone.
- Should move, once it is on for every visitor (behind the flag only the owner sees it): visits
  that end in the hall within a minute (down); visits that reach the arcade or a course (up); owls
  back on another day (up).
- As built (Nov 12):
  - It stands on the hall's middle line with its foot 142 px in front of the root runs, 1.06 times
    the painting's size: about nine owls tall. No way into the hall sets an owl down hidden behind
    it (a test holds every spawn to that), and its ear tufts end 167 px under the owl that comes in
    by the knothole.
  - Its mind is a pure file (`guardian.ts`): asleep until an owl comes in; 0.9 s later its eyes
    open (shut, half, open); it attends to that owl; at 1.7 s it tilts its head nine degrees and
    back; at 2.5 s it hoots once, its head lifting. It answers a hoot 0.65 s after it, one answer
    for a crowd's hoots and no more than one hoot in 2.6 s. It answers a bow and a tilt in kind,
    for owls that own those emotes (every owl has the hoot). It blinks every 3 to 8 s, dozes when
    no owl has been within 1,500 px of its face for 9 s, and beats while an owl rides the rising
    air. Its head eases by an exact spring, the same at any frame rate.
  - The painting is cut in the page (`guardianArt.ts`): the head above a neck line that dips under
    the chin, the body below it with its own feathers mirrored on up under where the head was, a
    lid over each eye drawn from the brow's colour. At rest head over body is the painting, pixel
    for pixel. The two are put together each frame into one texture shown by a plain image, so it
    fades as one when it goes see-through.
  - The engine the park builds (`src/engine/phaser.cjs`) has no render-texture game object; the
    texture manager's own dynamic texture does the same job with nothing added to the build.
  - The camera near it. The first pictures showed the fault: followed as in any room, an owl a few
    strides out in front has the guardian's head off the top of the screen, and everything the
    guardian does it does with its head. So on the floor round it (760 px either side, 900 px out
    in front) the camera shows its head and the owl both, moved only as far as that takes and
    drawn back only when one screen cannot hold the two, never to less than 0.72 of the owl's own
    zoom. Where even that cannot hold both (a phone held sideways, the owl well out in front) the
    owl stays whole on the screen with as much of the head as fits. Measured: on a computer the
    whole guardian is in view from 800 px out in front; on a phone held sideways its face is in
    view to about 500 px out.
  - The carving: with the flag on, the treehouse clearing's idol on the rim is the same painting in
    one tone of wood, and still.
  - In calm motion its hoot is the sound and the rings alone, and no motes rise.
- What the building showed, and what is left:
  - Found on the way, and its own ticket (OP-396): after the hall's opening look, and after a ride
    on the rising air, the camera loses the lead that keeps the back of the room in view over the
    owl (the scene fits the camera and then starts following again, and the follow call resets the
    lead). Every owl through the turnstiles has it. Not part of this slice: it changes the view for
    every visitor, so it goes up as an ordinary change of its own (the section below).
  - The roots' tips ("Hop up the roots...") stand over the inner ends of the two root runs, and at
    the hall's zoom their words reach over the guardian's sides by a few px.
  - An owl set down in the hall's middle (a plain link to the hall, travel by the map) stands at
    the front of its bough.
  - Each page works its guardian out for itself, so two visitors can see it attend to different
    owls. Telling the room is a later slice, and the room server's.
  - The owner's audit of Nov 12 was turned into tickets by another session the same night (OP-363
    to OP-395). OP-370 (the hall at arrival) names the guardian as the landmark its arrival view
    frames, once this slice is on.

### OP-396: the Great Hollow's camera rests the same however the owl came by it

- What was wrong: in a room seen from above that is taller than a screen the camera rests a fifth
  of the view above the owl (`hudInset.ts`, `followLead`; made for the plazas on Nov 8, so what is
  painted along a plaza's back stays in view). The Great Hollow had that lead on a plain address
  and lost it after its opening look, and after a ride on its rising air, until the window was
  resized. Every owl through the turnstiles gets the opening look, so one visit saw the hall two
  ways: on the owl at first, a fifth above it once the owl was back from a course. And at the end
  of a ride the view jumped by up to that fifth in one frame.
- Cause: the engine's follow call clears the lead and puts the camera on the owl, and the scene
  called it after fitting the camera (which sets the lead) at the end of the opening look and of a
  ride. The guardian's view (OP-359) had the two the other way round, which kept the lead but let
  the camera drop to the owl and slide back up.
- The choice, and why it is not "put the lead back": the hall's ways were measured. An owl comes
  in at the back (the knothole, y 280 of 2,380), and of the four places a newcomer is led to,
  three are on the front rim (the arcade's hatch at y 2,145, the neon and ink courses at y 2,028;
  the canopy course is at the back). With the lead an owl walking down the hall sees 450 px ahead
  of it on a computer and about 280 on a phone held sideways; with the camera on the owl it sees
  750 and about 465. The lead's reason is a painted back wall with the room's doorways along it,
  and the oval has ways all round. So the hall has no lead, for every arrival: the view every owl
  through the turnstiles has had since the town view went live, now also the view of an owl back
  from a course. The plazas keep theirs.
- The change: `followLead` is told whether the room has ways all round it (a room with a bowl) and
  gives no lead there. One helper in `RoomScene.ts`, `followOwl`, puts the camera back on the owl
  wherever something else had it (a room coming in, the end of the opening look, the end of a ride,
  the guardian's view, the mirror, Decorate): followed first, fitted second, then set where the
  follow would ease it to. A plaza on a phone now comes in with its camera at rest; it came in on
  the owl and slid up to its lead under the fade.
- Tests, each failing on main: on a held clock, on a computer and a phone, the camera rests the
  same after the opening look as on a plain address, and the frame after a ride ends it is where it
  rested before; at the end of the guardian's third test, handed back, the camera comes to rest
  once; a unit test holds the rule to its reason (the knothole in the hall's back half, more of
  the ways to play in its front half). The held-clock helpers moved from the guardian's spec into
  `e2e/helpers.ts`.
- Should move: nothing the play log counts on its own. It is the newcomer's view of the first big
  room, the same on every visit to it; OP-370 (the hall at arrival) builds on it.
- Left, and a ticket if the owner wants it: a camera that looks where the owl is going in rooms
  seen from above (the side camera's idea, OP-351, for the town view) would show more of the way
  ahead than either a lead or none. It changes the feel of every room seen from above, so it would
  be built behind a flag for his look on a phone.

### OP-365: the quiz's answers are cards of words

- What was wrong: every answer in Which owl are you showed a dashed box that said "96 × 96" where
  its picture will go (OP-326, so an artist knows what to paint). It is the second screen a new
  visitor ever sees, and the owner's audit of Nov 12 read it as a park not finished. His word the
  same day, on the ticket: words alone in the public quiz, the boxes kept behind the painter's or
  keeper's flag.
- The change: `ui/whichOwl.ts` adds the picture slot only on a painter's or keeper's tab
  (`showsArtBoxes`: `?paint=1` or `?keeper=1` in the address). Every other visitor sees a card of
  words, 120 px tall on a computer and an upright phone and 76 on a phone on its side. On a phone
  held upright three answers stack one to a row, where three columns left each a word wide. The
  questions, the answers' words, the points and the colour card are as they were, and
  `docs/QUIZ-ART.md` is still the list to paint from.
- Tests: every card of every run in `e2e/whichOwl.spec.ts` has no picture slot and no "N × N" in
  its words (on main each answer has one); a test of the painter's tab holds what artists keep
  (the box, its size, its art key); a unit test of the rule.
- Should move: the share of first-time visitors who get through the quiz to an owl. Small
  numbers: read owl by owl.
- Seen and left: the feedback button at the screen's left edge sits over the first answer on a
  phone held upright, before and after. That is OP-369's (one safe area for the HUD).

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
- 2026-11-12: `main`'s browser suite went red on the art's merge commit, and this change's first run
  was red too, each on a different test neither had touched. Neither was chance, and one was the
  park's own fault.
  - The canopy's "a step off the end of a bough" test watched the page's own frames for the owl in
    the air. The drop takes 0.37 s and the flight catches up with however long a frame was (OP-353),
    so a runner drawing fewer than three frames a second never draws the owl in it. Driven by hand:
    at frames of 0.4 s and over a fall is counted and the owl is never seen in the air, the very
    state the failed run reported. The park is right there. The test now runs on a clock it moves
    itself, at fifty frames a second and at ten.
  - The room server's "a leaf pile is shared" test failed with the pile not among the second owl's
    objects: that owl was no longer in the grove. An owl that comes in with no doorway named, on top
    of another, is given a spot up to 220 px from the spawn and walks over to it (its step aside),
    and the grove's way to the hub is 65 px from its spawn: one such arrival in fifteen was walked
    out through it (20 of 300 rolls of the room's own rule; 3 of 45 arrivals on a room server run
    here). Nineteen rooms had some share of it. Small in the live park, where visitors come in by
    named doorways that spread arrivals by 60 px, which reaches no way out; it bites a link straight
    to a room, and every test that opens two owls in one. The room now gives no arrival a spot whose
    walk over would pass through a way out (`walkCrossesExit`): 0 of 300 rolls in every room, 0 of
    45 arrivals on the room server, and the second owl still stands apart from the first every time.
  - Kept for next time: a red test on code a change did not touch is a finding until shown
    otherwise; "it passed on the last run" was true of both of these for weeks.
- 2026-11-12: PR 236 merged through the sweep (e48c5a2) and live (deploy run 310 on the merge
  commit). `main` had moved while its CI waited (PR 237), so `pnpm check` was run on the two merged
  before the merge, and `main`'s tree after it was that tree.
- 2026-11-12: OP-358, the board's P1 from the QA walk: through the turnstiles the Menu map
  travelled once, and in the next room every place inside asked for the turnstiles again. The cause
  is not in the gate's rules. On a network that lets the page through and not the room's socket
  (the QA walk's remote browser), the page still asks the Worker for the owl's map as it comes into
  each room. The Worker has seen that owl walk into no room, so it answers "not through the gate",
  and the page took its word over what it knew. In the Great Hollow the room and its way in say
  "through the gate" again, which is why the first trip worked. The page now takes the room
  server's word once a room has let its owl in (`takeKeptTravel`), and keeps its own map until
  then, as a browser with no room server does. A room server that has the owl still turns a travel
  away when the gate was left on another screen. The browser test walks through the turnstiles with
  every room's socket closed and travels three times; on `main` it fails in the first room
  travelled to. With the room connected the map already worked, and that test now makes three trips
  in a row too.
- 2026-11-12: the first phone runs since the pass went live, read from the play log, are what
  OP-360 above is built on. Kept for next time: the kid sim answers "can a kid who flies well make
  this hop"; it does not answer "what happens to the plays a newcomer makes first", and the second
  is what the log shows.
- 2026-11-12: OP-358 merged through the sweep (PR 238, b95c86f) and live (deploy run 311 on the
  merge commit). `main`'s own CI is green again on PR 236's merge commit.
- 2026-11-12: OP-360 built, as "After the pass" says. Three things the building showed:
  - A level way beats a stepped one. The first lay-out stepped down ten px from piece to piece so a
    walker could not miss; walking back west each ten px step up was a lip nobody could see, and an
    owl that walked into it fell under the island. Level, with each piece starting where the last
    ends, a walker crosses both ways a bridge is painted.
  - The sweep has to be as high as a jump with every flap. At a jump's own rise (180) a double flap
    off an island still went over the next stone unpainted and came down past it (12 of 912 plays).
  - One browser run failed with the page reloading under it. Not the test and not the park: a file
    had changed under the dev server seconds before (it reloads the page it serves). Reproduced by
    touching a file before a run; CI serves a still checkout.
  Found on the way and left: the way back west across the pond is a flier's (a Jump held in each
  column glides back over the stones, painting them; a walker meets water at the second island's
  west end); on a phone the bench's tip and the "Checkpoint" toast overlap for a second; the second
  bridge is drawn through the sleeping crane's rock, as the higher bridge was through its neck.
- 2026-11-12: OP-360 merged through the sweep (PR 239, 8632d91) with every check green, and is
  live (deploy run 312 on the merge commit). The same day the owner said yes to the guardian
  (OP-359) and where it lives, and asked for a critique of the art across the park (OP-362). The
  guardian's first slice is planned under "After the pass".
- 2026-11-12: OP-359's first slice built, as "After the pass" says, behind `?guardian=1`. Kept for
  next time: look at the thing from where a player stands before calling it done. The rules and
  their tests were green while the guardian's face was off the top of the screen for any owl
  standing in front of it; only the pictures showed it, and the camera's rule near it came from
  them. And a worker restart mid-run (two browser runs at once ran the machine out of memory)
  lost nothing because the work was on disk; it is now pushed as a checkpoint before any long run.
- 2026-11-12: OP-359's first slice merged through the sweep (PR 240, f9f1197), every check green,
  and is live behind `?guardian=1` (deploy run 313 on the merge commit). The art critique (OP-362)
  delivered to the owner as a document with pictures; four tickets filed from it (OP-397 to
  OP-400).
- 2026-11-12: OP-396 built, as "After the pass" says. Kept for next time: the ticket said "put the
  lead back", and the before and after pictures said otherwise: with the lead back, the hall's
  front rim, where the arcade's hatch and two courses are, was off the bottom of the screen for an
  owl standing in the middle of the floor. A bug that makes a room behave two ways is a question
  about which of the two is right, and the answer is in where the room's things are, not in which
  came first. Also: the dev server reloads the first page opened after a served file changes, so a
  run starts with a throwaway page load.
- 2026-11-13: OP-396's first run of the checks failed on one test the change does not touch: the
  first flight's (`e2e/park.spec.ts`, OP-347), twice, the line that marks the glide not on screen.
  Not the camera: the test's steps take the same time with main's code as with the branch's. That
  shard's runner was 1.7 to 2.9 times slower than the table of usual times, and the test raced
  real time in two places. It pushed west and then jumped, and on a slow enough runner the owl has
  walked off the stump and down to the floor before the jump comes (seen on one core, with main's
  code too). And it looked for a four-second line after five steps of its own, each most of a
  second on two cores. It now jumps first and then pushes (the glide comes off the stump at any
  gap between the two keys, tried from none to three seconds), and the page notes the line as it
  comes. Kept for next time: a test that passes on a quick machine has still to be read for what
  it races, and `taskset -c 0` in front of a test run is a cheap slow runner.
- 2026-11-13: OP-396 merged through the gate (PR 241, 75872b9) on its second run of the checks,
  every one green, and is live (deploy run 314 on the merge commit). While those checks ran,
  OP-365 was built in a working copy of its own (`git worktree`, its own dev server on another
  port), so the wait on one pull request was not a wait on the next.
- 2026-11-13: OP-365's first run of the checks was red on one test it does not touch: the
  guardian's second (`e2e/guardian.spec.ts`), timed out at 45 s twice. It draws about 170 frames,
  each when the test moves the held clock: 23 s here on four cores, 38 on two, and past 45 on one,
  the same failure as the runner's. It and the first of OP-396's camera tests (40 s on a slow
  runner) now have the slow allowance their neighbours have. Kept for next time: a held clock
  takes the park's time out of a test, not the machine's; count the frames a test draws and give
  it the allowance for a runner three times slower than this one.
