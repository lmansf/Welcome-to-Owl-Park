# Things to do in the park

- Status: the first wave BUILT (C36); quests in the Menu BUILT (OP-083); the jump BUILT (OP-082, OP-084); the arcade's three games BUILT (OP-038, OP-059, OP-137); the stained-glass climb BUILT, its realm gated; the perches BUILT (OP-084); seasons PLANNED
- Verified against: branch claude/op-202-docs off main 01e9722 (2026-11-02)
- Code: packages/shared/src/activities.ts, roomActivities.ts, arcade.ts, arcadebook.ts, climb.ts, climbbook.ts, book.ts, routes.ts, interactables.ts, npcs.ts; packages/shared/rooms/index.ts (perches); apps/park/src/game/activities.ts, arcade.ts, ArcadeScene.ts, climb.ts, Npc.ts; apps/park/src/arcade/; apps/park/src/ui/activities.ts, arcadeScreen.ts
- Tickets: OP-004, OP-026, OP-037, OP-038, OP-059, OP-082, OP-083, OP-084, OP-114, OP-135, OP-137, OP-152, OP-191; planned OP-074
- Related: docs/QUESTS.md, docs/PLAYBOOK.md section 7, designs/the-stained-glass-climb.md, docs/TESTING.md

The first wave of activities (C30): lanterns that a room lights together under the great tree, a
quiz on the stump stage answered by standing in a zone, fishing from the jetty in the treehouse
clearing, the neon street's robot owl and its copy game, and three small tasks a day. Every number
and every visitor-facing word below is a default waiting on the owner's approval. Each activity
stands where the paintings already have it: the glows, the bobber and the line are drawn, there is
no new art.

Where things sit in a realm (OP-152, the owner's rule of 2026-10-31): the screen an owl arrives on
holds the realm's quick, repeatable fun (leaf piles and fishing in the grove, the robot owl's copy
game in the market, the climb's portal in the glass realm), and quest givers and payoffs sit at
least a full screen from arrival. A realm is under 25 s of walking end to end, so the old 45 s
target is restated as "payoff on the farthest screen". Hazel stands at the grove's west end
(800, 800), Juniper at its east end (4150, 845), and Flicker east in the market (2800, 820); Nova
and the feather shop stay by the market's arrival, and the idols stay at each entrance.

The rules are data and functions in `packages/shared/src`, so the room server and the
zero-backend local mode run the same ones and Node tests them:

- `activities.ts`: places, numbers and pure rules (the beam, the quiz schedule, the bite, the
  tunes, the day's tasks);
- `roomActivities.ts`: the activities of one room (`Activities`), run by the room server for
  everyone in a room and by the local mode for the one owl on the device;
- `book.ts`: `play()` pays an activity under its daily cap and counts it toward the day's tasks.

## The lantern beam (the hub's west bay)

Seven paper lanterns hang from the beam in the painting (`LANTERNS`). Standing on the floor under
the beam (`LANTERN_FLOOR`), **Light a lantern** (or E) lights the dark lantern nearest above the
owl, at most 90 px to either side.

| | Default |
| --- | --- |
| One owl lights a lantern every | 2.5 s |
| A lantern burns | 25 s |
| The whole beam, once all seven are lit, glows | 45 s, then goes dark for the next round |
| Each owl that lit one of the full beam earns | 4 feathers, plus 1 for each other owl who helped (up to 4 more) |

Owls lighting together fill the beam quickly; one owl alone can do it if it keeps moving along
the beam (seven lanterns take 15 s at best, and the first burns 25 s). A newcomer sees the beam as
it burns, and the room server keeps it in storage, so a recycled server brings it back.

## The stage quiz (the hub's east bay)

A question opens every 90 s on the park clock, the same moment for everyone. It stays open 20 s;
then the answer shows for 8 s. The three answers stand in three zones on the floor in front of the
stump stage, lettered A, B and C (`QUIZ_ZONES`): where an owl stands when the question closes is
its answer, and the right zone earns 3 feathers. While the owl is in the bay, the question and its
answers show on a card under the top bar.

The bank (`QUIZ_BANK`) holds 16 owl facts; the rounds walk it seven at a time so every question
comes up before any repeats, and the right answer moves from zone to zone. The room server wakes
the hub when each question closes (the Durable Object's alarm, while owls are in the hub), pays
the owls standing in the right zone, and keeps the last round it settled so none is paid twice.

## Fishing (the treehouse clearing's pond)

At the end of the jetty (within 80 px of `FISHING_SPOT`), **Cast a line**. A fish bites 2.5 to 8 s
later; the bobber dips and the button says **Reel in now!** for 1.4 s (the room server allows
another 350 ms for the trip). Reeling in too early or too late, the fish gets away. One cast per
owl every 1.5 s.

| Catch | Chance | Feathers |
| --- | --- | --- |
| a silver minnow | 40 % | 1 |
| a striped perch | 28 % | 2 |
| a speckled trout | 17 % | 3 |
| a whiskery catfish | 8 % | 4 |
| an old boot | 5 % | 0 |
| a golden koi | 2 % | 8 |

## The robot owl's copy game (the neon street)

In front of the giant robot owl (`COPY_SPOT`), **Copy the robot owl's tune**. The robot plays a
tune of emotes (its eyes flash with each note and the card shows it), then the owl plays it back
from the card's buttons, each note within 6 s. The first tune has 3 notes and each tune copied
brings one a note longer, up to 7. Each tune copied pays 1 feather, and the longest 3 more; a
wrong note or a slow one ends the game. The robot uses the starter pair (Hoot and Wing Flap) and up
to two more emotes the owl owns, so every owl can play. The right notes are danced for everyone in
the street.

## The arcade, Neon Roost (off the neon street's east end) [BUILT (OP-038, OP-059, OP-137)]

The arcade is "Neon Roost" (`ARCADE_NAME`) and "the Owl Park arcade" in public; the names were
knockout-screened (OP-036). The rules are `packages/shared/src/arcade.ts` and `arcadebook.ts`; the
room is `arcade`.

**The hall.** Three screens (`arcade`, `arcade-mid`, `arcade-end`), entered from the neon street at
its west end. A bay per game, each with the game's title sign over its cabinet, and the score wall on
the board in the middle. The cabinets from west to east are Hoot & Hop, Moon Flap and Talon Toss
(`CABINETS`); each is a spot in the room data. All three are live. A cabinet whose game is not live
would show a dark screen reading "Hatching Soon" (`CABINET_OFF`) and no sign, and say so to an owl at
it. Each game is drawn from its painted field and pieces (`apps/park/src/arcade/paint.ts`) once every
piece has loaded, and in neon lines until then.

**A run.** Play at a cabinet asks the room for a run: the room starts it with a seed and keeps it
under the owl's collector in the collections object, not on the socket, so it outlasts a dropped
connection (OP-137). Each game opens on a how-to card before its first run on a device
(`owl-park:arcade-how-to`). The game plays on the page over the room (`ArcadeScene`, in the HUD's
arcade screen). Past the owl's best, the page sends `act` `record` with the score so far, at most
once a second (`RECORD_EVERY_MS`); the room keeps it as the owl's best and shows it on the wall,
paying nothing, so a run cut short keeps its best. The end sends `act` `score`; the room checks it
against the time the run took (`plausibleRun`, `leastRunMs`) and pays. A new best and the day's best
are judged against the standings as the run started. A run left open longer than `RUN_MAX_MS`
(20 minutes) is forgotten.

| Game | How it plays | Score | Feather bands (1 to 6) |
| --- | --- | --- | --- |
| Hoot & Hop | hop four ways up the field from the kerb to the perch: up is forward, left and right a column, down a row back (the arrow keys or WASD, a swipe on the field, a flick of the pad's stick; a tap is a hop up). Lanes of noodle carts, drones and, from level 4, bats; rivers crossed on logs from level 4. Ten levels laid out by hand, then levels from the run's seed, each quicker; three lives (`HOP_LIVES`) | a point for each row first reached in a level and one for the perch: seven a level (`HOP_LANES` + 2) | 7, 21, 35, 56, 84, 119 |
| Moon Flap | tap (Space, or the pad's Interact on a touch screen) to flap through the gaps between neon branches on a night flight; a branch or the ground ends the run | the gaps passed | 2, 5, 10, 15, 25, 40 |
| Talon Toss | pull back and launch at three targets on their stands (a stack of crates, a tower, a nest sheltered under a plank), five shots at each (`KNOCK_LEVELS`, `KNOCK_SHOTS`), on a physics engine (matter.js, fetched only for this game). A shot ends once everything has been still a second, eight seconds at most | a point for each crate or plank knocked to the ground, broken or off the field, and `KNOCK_NEST_POINTS` (8) for the nest; 30 at most (`KNOCK_MAX_SCORE`) | 2, 5, 9, 14, 20, 26 |

**Moon Flap's owl** (OP-135) flies in its own flight body with its wings out, as it flies in the park
(OP-084, OP-136): a stroke of the wings at each flap, a beat every 560 ms while it hovers before the
first, a 650 ms tumble off a branch, and standing with its wings folded once the run is over.

**Pay.** A run pays 0 to 6 feathers, one for each band its score reaches (`runFeathers`), and 3 more
(`DAY_BEST_FEATHERS`) the first time a day the owl beats the day's best on the wall in that game, all
inside the activities' shared daily cap (`PLAY_FEATHERS_PER_DAY`). The task "Play a round in the
arcade" (`ARCADE_TASK`) joins the day's second slot while a cabinet is live.

**The score wall.** Today's best five per game (`WALL_SIZE`), as owl portraits in the owl's colours
and kind (`PortraitLook`), no names and no collector ids, reset at the park's midnight. It is kept by
`ArcadeBook` over the collections object's `arcade_scores` table (this browser's storage in the local
mode), and pushed to the room as the `wall` frame.

Spectators (OP-191) play practice runs: checked like any, but they keep nothing for the wall, pay
nothing and move no task.

## The stained-glass climb [BUILT; the realm gated]

The design is `designs/the-stained-glass-climb.md`; the rules are `packages/shared/src/climb.ts`
(the simulation and the nights), `climbCity.ts` (the tower) and `climbbook.ts` (the pay).

**The realm and the portal.** The room `glass` is two screens behind the hub's stained-glass arch:
the arch back to the hub and the idol on the west screen, the portal at the foot of a tall window on
the east. It is gated (`gated: true`): closed until the keepers open it with the realms setting
(`RealmsSettings`: `open`, `portal`, `night`; the Actions workflow `realms.yml` or the keepers' page).
Out of the box nothing is open and the portal is off (`REALMS_DEFAULTS`). With the portal off, Climb
at the portal says "Pardon Our Feathers" (`PORTAL_OFF`).

**A climb.** Climb at the portal asks the room for a run, or the open one: a run survives any socket
and is forgotten an hour after it started (`CLIMB_RUN_MAX_MS`). The climb is a solo platformer up a
tower of backlit glass, played on the page as the visitor's own owl: a short heavy jump with a cut, a
double jump, a dash, a cling and kick off walls, and a pogo off a hazard. Panes of glass are its
health; a hazard cracks one, thorns send the owl back to its last safe ground, and the last pane gone
returns the owl to the bench it last stood on with its panes relit. Nothing is ever lost but time.
Stop and Escape close the screen and send nothing; the run waits.

**The bands.** The tower has six height bands (`BAND_COUNT`), named First storey to Fifth storey and
The clouds (`BAND_NAMES`). Each band line reached goes to the room as `act` `ascent`; the room checks
every band above the run's banked one against its floor (the scripted route's time less 20 %,
`CLIMB_FLOOR_MARGIN`) and pays it.

| Band | 1 | 2 | 3 | 4 | 5 | 6 (the clouds) |
| --- | --- | --- | --- | --- | --- | --- |
| Feathers (`BAND_FEATHERS`) | 1 | 1 | 2 | 2 | 2 | 2 |
| Brisk feather | none | +1 | +1 | +1 | +1 | +1 |

Each band pays once a park day, inside the shared daily cap: ten for the whole tower. A band climbed
within its brisk window (the high road's scripted time through it times `CLIMB_BRISK_FACTOR`, 1.1)
pays `BRISK_FEATHERS` (1) on top; band 1 has no high road and no brisk feather. Reaching the clouds
grants the Glass Circlet (`CLOUDS_ITEM`, a head wearable) the first time ever.

**The moon.** The park's moon sets the night's difficulty: an eight-phase cycle of 28 days
(`MOON_CYCLE_DAYS`, `MOON_PHASE_DAYS`, `parkMoon`), easy around the new moon, hard at the full moon,
medium between (`moonTier`). The keepers can name a night instead (`night` in the realms setting).
The three nights (`NIGHTS`) share the tower `city-2`: easy has 4 panes and the hazards at 0.9 pace,
medium 3 panes at 1, hard 2 panes at 1.15. A run is judged by the night it started under.

Spectators (OP-191) climb practice runs: banked as any, but paying nothing and granting no item, so
the same bands pay once the owl has a ticket that day. The six tower pieces (`climb-*`) are drawn in
plain glass by the climb scene until their art ships.

## Three small tasks a day

The same three for everyone each park day (`dailyTasks`), one from each slot and never the same
kind twice:

1. at the lanterns: light 3, or light 5, or light the whole beam;
2. at a game: catch a fish, or 3, or answer a quiz question right, or copy a tune, or play a round
   in the arcade (`ARCADE_TASK`, while a cabinet is live);
3. around the park: flop into 2 leaf piles, or browse 2 stalls, or answer a quiz question right,
   or copy 2 tunes.

Each task pays 4 feathers, and all three 8 more. They show in Quests (the Menu, or J) on its
Today tab, with their progress; a finished task says so; they change at the park's midnight. The
on-screen tracker and the per-step progress toast went with OP-083.

## Quests on screen [BUILT (OP-083)]

Quests live in the Menu, not on the screen (OP-083; `apps/park/src/ui/quests.ts`, `hud.ts`
`questNews`). No pop-ups during play: a new or finished quest shows a 2 s line at the top edge
("New quest: its name", "Quest complete: its name") and a gold dot on the Menu button and the
Menu's Quests tile, cleared when Quests opens; the dot shows on a computer's Menu too. Quests lists
every quest carried with its title, its next step and its progress (2/5), finished ones first;
there is no cap, the screen scrolls. Collect on a finished quest walks the owl to its giver and
hands it in there (the owner's call, 2026-10-23). The quest state and reward rules are unchanged
(`docs/QUESTS.md`). The on-screen tracker and the daily tasks' progress toast are gone; the lobby's
welcome line stays. The owner kept the New quest line for now. The preview's feedback nudge
(PLANNED, OP-063) should use the same line and dot when it is built.

## Talking to characters [BUILT (OP-114)]

The park's characters (the NPC owls: quest givers, the shopkeeper) are talked to with Interact (the
"!" on the pad, or E). Within `NPC_TALK_RADIUS` (120 px) of one, the nearest in reach offers "Talk to"
its name, and a "!" over it shows the one Interact would talk to now (`setApproach` in
`apps/park/src/game/Npc.ts`): Interact's mark on a dark pill, one colour in every realm. It shows
only while talking is what Interact would do, not while the owl stands at a spot first (such as the
gift shop) or is asleep. It pops in, bobs once a second (still under calm motion) and fades as the
owl walks off; a quest's marker rises above it meanwhile. A tap on the character talks too: its tap
area is its drawn body grown by `NPC_TAP_EXTRA` (20 px). A dialogue closes once the owl wanders
`NPC_TALK_RADIUS` + `REACH_SLACK` + 40 px away.

## Emotes and the jump [BUILT (OP-082, OP-084)]

The emotes an owl can play are collectibles (`docs/COLLECTIBLES.md`): 24 in the catalogue, every
owl starts with Hoot and Wing Flap (plus the Sparkle effect), and the rest come from quests and the
shop. The emote wheel (the Emotes button; 1 to 8 on a keyboard) plays one; the room server relays
the emote's id to everyone else in the room, checks that the owl owns it, and allows one per 1.5 s
per owl.

The jump is a move every owl has, not a collectible: flight (OP-084, `packages/shared/src/flight.ts`).
Jump on the pad, or the space bar, jumps; a second press in the air flaps once more; Jump held on the
way down glides, one down for `GLIDE_SLOPE` (3) along. Its physics is the climb's. Flight is a height
above the owl's spot on the floor plan, so doorways, spots and walks are as before, and it carries
the owl up onto the perches (below). The controls: `docs/PLAYBOOK.md`, section 7; the air state on
the wire: `docs/ARCHITECTURE.md`.

## Up on the perches [BUILT (OP-084)]

The jump, the second flap in the air and the glide reach perches: raised places an owl stands on,
part of the room data (`perches` in `packages/shared/rooms/index.ts`). Each perch is tiered by what
reaching it from the floor takes (`perchTiers`, `packages/shared/src/routes.ts`): 1, single jumps;
2, a jump and the second flap somewhere on the way; 3, only a glide. A quest never asks for more than
a tier 1 perch (`docs/TESTING.md`). A thing up on a perch (its `top`) is in reach only from that
perch, and a thing on the floor only from the floor.

- **The hub** (the west wing's back wall): the root bench under the lantern beam, a jump up (tier 1,
  `hub-bench`), and the beam itself, a jump and the flap up from the bench (tier 2, `hub-beam`). A
  leaf pile waits on the beam.
- **The grove's treetop walk** (the east wing): the fallen log on the lawn, a jump up; the ladder up
  the middle tree, a rung halfway and the porch at its top, a jump each, with a leaf pile on the
  porch; from the porch the loft's deck, a jump more. All single jumps (tier 1); the porch is also a
  jump and the flap straight from the floor. The far treehouse on the left tree is across the gap from
  the loft, past the painted rope bridge, and only a glide gets there (tier 3, `grove-hut`); a leaf
  pile waits in it.
- **The market's rooftops**: on the west screen the stall row's roof, a jump up from the curb all
  along it, and along it the neon signboards at its east end; the feather shop's roof at the giant
  robot owl's feet, a jump up from the curb right of the shop's door; on the east screen the stalls'
  roofs, a jump up from the plaza. All single jumps (tier 1). The big food stall's roof and the big
  tent's ridge stand higher: a jump and the flap from in front of each (tier 2). No gap in the street
  needs a glide.

## Seasons [PLANNED (OP-074)]

The owner's decisions of 2026-10-23: a seasonal switch first (a Worker setting with start and end
dates that turns an event's layer, actions and tasks on and off with no deploy; the base paintings
never change, an event is an overlay plus room data), then snow and snowballs for everyone,
everywhere outdoors (the lobby, the street of nests, the hub, every open realm and the arcade; no
snow indoors, not even through a nest's window; the neon market realm gets its own neon-palette
reskin), from mid-December after the preview. A snowball is thrown at an owl you tap, arcs, lands
with a puff and plays a shiver emote on the target: no feathers lost, no words, no opt-out. One
throw every 2 seconds, held by the room server; a daily task "Throw 5 snowballs". Later in the
calendar: a Superb Owl Sunday tie-in (2027-02-14), spring and summer events to be designed, and a
hay maze for Halloween 2027, seasonal only. Each event's art spend is approved by the owner before
anything generates.

## Feathers

The activities share one cap: at most 25 feathers a park day per collector
(`PLAY_FEATHERS_PER_DAY`); the tasks pay on top of it. For scale (canon C31): the daily quests pay
15, 25 and 40, leaf piles at most 40 a day, and an active day in the park comes to 100 to 150.

## Wire protocol and the room server

Protocol 6 (`packages/shared/src/edge.ts`) adds one client frame, `act`, with a request number
`r`: `a` is `light`, `cast`, `reel`, `copy`, `note` (with `e`, an emote id) or `tasks`. The answer
is an `act` frame with the same `r`. The room also pushes `lanterns` (the beam, to everyone in the
hub when a lantern is lit, and to a newcomer), `quiz` (a question closed: the right zone and the
owls in it), `paid` (feathers for a full beam or a right answer) and `tasks` (the day's tasks when
something moved them).

The arcade and the climb add `act` kinds (`ACT_KINDS`): `run` (with `g`, the game) starts or
resumes an arcade run, `record` keeps its best so far, `score` ends it; `climb` starts or resumes a
climb and `ascent` banks a band. The room pushes `wall` (the score wall). The protocol's version is
`EDGE_PROTOCOL_VERSION` (15); `docs/ARCHITECTURE.md` section 4 has the frames.

The room server (`RoomObject`) checks every activity against the owl's position on its own clock
(plus 40 px of slack), allows one note of the copy game per 250 ms, and pays through the
`Collections` ledger (`play`). Times on the wire are server milliseconds; the page converts them
to its own clock, and runs the quiz card on the server's clock.

## The page (`apps/park`)

- `game/activities.ts`: the room's activity layer: the action buttons where the owl stands, the
  answers and pushes, and the cards; `game/Lanterns.ts`, `game/QuizStage.ts` and
  `game/Fishing.ts` draw the glows, the zones and the line.
- `ui/activities.ts`: the quiz and copy cards (top right on wide screens, under the top bar on
  phones); `ui/quests.ts`: today's tasks in the quests screen (the tracker is gone, OP-083);
  `collect/tasks.ts` keeps them.
- `game/arcade.ts`: the arcade in its room (the title signs, the score wall's portraits, a run from
  Play to its pay); `game/ArcadeScene.ts` draws the game over the room; `arcade/hop.ts`,
  `arcade/flap.ts` and `arcade/knock.ts` are the three games' simulations, `arcade/paint.ts` their
  painted fields and pieces, `ui/arcadeScreen.ts` the HUD's arcade screen and its how-to cards.
- `game/climb.ts`: the climb at the portal (the run, the screen, each `ascent`); `ui/climbScreen.ts`
  its screen.
- `collect/local.ts`: the local mode runs `Activities` for the one owl on the device; its beam is
  that page's alone, and its quiz settles on a timer while the owl is in the hub.
- Spectators (OP-191, `docs/ARCHITECTURE.md` section 4): every game plays and the room answers
  `practice: true` with nothing paid. The page then toasts the game's own line with "With a Day
  Ticket this would have earned N feathers." (a caught fish's feathers, the copy game's tunes and win,
  the beam's least share `LANTERN_FEATHERS`, the quiz's `QUIZ_FEATHERS`; `wouldHaveEarned` in
  `ui/spectator.ts`) and opens the Day Ticket's card at most once every five minutes. The arcade's
  and the climb's result cards say "Nice run! With a Day Ticket this would have earned N feathers."
  over Get a Day Ticket and Play again (`runFeathers`, `BAND_FEATHERS`; the day's best and the brisk
  bonus are left out). Today's tasks are locked: the Quests tab sells a Day Ticket instead.

## Tests

- `packages/shared/src/activities.test.ts` and `roomActivities.test.ts`: placement on the floors,
  the rules, the quiz schedule, the tasks and the ledger.
- `apps/park/e2e/activities.spec.ts` (this device): one owl lights the whole beam, a catch at the
  pond, a copied tune and a wrong note, and a right quiz answer (it waits for the next question,
  up to 90 s).
- `apps/park/e2e/edge.spec.ts` (the room server): two owls light the beam together and are both
  paid, a catch, and a tune danced for another owl.
- The arcade: `packages/shared/src/arcade.test.ts` and `arcadebook.test.ts`, `apps/park/src/arcade/*.test.ts`,
  `apps/edge/test/arcade.test.ts`, and `apps/park/e2e/arcade.spec.ts` (with `arcadePlay.ts`).
- The climb: `packages/shared/src/climb.test.ts` (its floors and brisk windows frozen) and
  `climbbook.test.ts`, `apps/edge/test/climb.test.ts`, and `apps/park/e2e/climb.spec.ts` (with
  `climbPlay.ts`, on `desktop`, `phone` and `edge`).
- The perches: `packages/shared/src/routes.test.ts`, `packages/shared/rooms/rooms.test.ts` and
  `apps/park/e2e/perches.spec.ts`.

## Waiting on the owner

All of it: the numbers above, and the words (the button labels, the cards' lines, the toasts, the
task texts, the quiz questions and answers, and the names of the catches).
