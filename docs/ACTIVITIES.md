# Things to do in the park

The first wave of activities (C30): lanterns that a room lights together under the great tree, a
quiz on the stump stage answered by standing in a zone, fishing from the jetty in the treehouse
clearing, the neon street's robot owl and its copy game, and three small tasks a day. Every number
and every visitor-facing word below is a default waiting on the owner's approval. Each activity
stands where the paintings already have it: the glows, the bobber and the line are drawn, there is
no new art.

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

## Neon Roost, the arcade (off the neon street's east end)

A doorway under a joystick sign where the neon street bends away leads into the arcade (C40): a
hall with three game cabinets along its back wall under the score wall. Each cabinet is a spot in
the room data with its game's name on its marquee; standing at it, **Play Hoot & Hop**, **Play Moon
Flap** or **Play Nest Knockdown** (or E) opens the game over the whole screen, drawn as neon
line-art in the cabinet's colours, with the visitor's own owl (its kind, colours and what it wears,
without its pet or effect) as the player. A cabinet can be switched off (`live` in
`packages/shared/src/arcade.ts`): its screen goes dark and reads "Hatching Soon", and standing at it
says so.

| Game | How it plays | Score | 1 to 6 feathers at |
| --- | --- | --- | --- |
| Hoot & Hop | Tap (or Space) to hop a lane on; cross five lanes of drones and noodle carts to the far kerb and back. Each crossing quickens the traffic by a tenth (up to twice its speed); a bump ends the run. | crossings | 1, 3, 5, 8, 12, 17 |
| Moon Flap | Tap (or Space) to flap; fly through the gaps between neon branches, which come every 1.5 s. Touching a branch or the ground ends the run. | gaps passed | 2, 5, 10, 15, 25, 40 |
| Nest Knockdown | Pull back and let go (or aim with the arrow keys and press Space) at stacks of neon crates on stands. A crate struck is knocked off with all that stood on it alone. Ten stacks, three shots each: a stack down in one shot scores 3, in two 2, in three 1; a stack still standing ends the run. | points (at most 30) | 2, 5, 9, 14, 20, 26 |

The first time each park day a run beats the day's best on the wall for its game, it pays 3
feathers more. A run's feathers are inside the activities' shared cap (25 a park day), so the
arcade adds nothing to what a day in the park can pay. The games are free: the shop stays the only
place feathers are spent. Every run counts toward "Play a round in the arcade", a task at a game.

**The score wall** above the cabinets shows each game's best five of the park day, best first (the
earlier of two equal scores first), as small portraits in the owls' own colours with their scores:
no names anywhere. Each owl's own best of the day is underneath its column, and the game's screen
shows "Today's best" and "Your best". The wall starts empty at the park's midnight.

**The room server keeps it honest.** The page plays the run; the room server starts it (`run`, at
the cabinet, with a seed for the run's course, kept on the visitor's socket so it outlasts the
object's sleep), and takes its result once (`score`). A result it could not have reached in the
time the run took is refused (`plausibleRun`): a crossing takes at least six hops of 180 ms, the
branches come at a fixed pace, and a shot takes at least 1.2 s. It pays through the `Collections`
ledger (`ArcadeBook` over the SQLite table `arcade_scores`, which keeps only the day's best per owl
and game) and sends the changed column of the wall to everyone in the arcade.

## Three small tasks a day

The same three for everyone each park day (`dailyTasks`), one from each slot and never the same
kind twice:

1. at the lanterns: light 3, or light 5, or light the whole beam;
2. at a game: catch a fish, or 3, or answer a quiz question right, or copy a tune, or play a round
   in the arcade (while one of its cabinets is live);
3. around the park: flop into 2 leaf piles, or browse 2 stalls, or answer a quiz question right,
   or copy 2 tunes.

Each task pays 4 feathers, and all three 8 more. They show in Quests (the Menu, or J), on its
Today tab, and as a line in the tracker, with a toast as each moves along; they change at the
park's midnight.

## Feathers

The activities share one cap: at most 25 feathers a park day per collector
(`PLAY_FEATHERS_PER_DAY`); the tasks pay on top of it. For scale (canon C31): the daily quests pay
15, 25 and 40, leaf piles at most 40 a day, and an active day in the park comes to 100 to 150.

## Wire protocol and the room server

Protocol 6 (`packages/shared/src/edge.ts`) adds one client frame, `act`, with a request number
`r`: `a` is `light`, `cast`, `reel`, `copy`, `note` (with `e`, an emote id) or `tasks`; protocol 8
adds the arcade's `run` (with `g`, the game) and `score` (with `g`, the score `s`, the run's seed
`k`, and for Nest Knockdown its shots `n`), and the `wall` frame. The answer is an `act` frame
with the same `r`. The room also pushes `lanterns` (the beam, to everyone in the
hub when a lantern is lit, and to a newcomer), `quiz` (a question closed: the right zone and the
owls in it), `paid` (feathers for a full beam or a right answer) and `tasks` (the day's tasks when
something moved them).

The room server (`RoomObject`) checks every activity against the owl's position on its own clock
(plus 40 px of slack), allows one note of the copy game per 250 ms, and pays through the
`Collections` ledger (`play`). Times on the wire are server milliseconds; the page converts them
to its own clock, and runs the quiz card on the server's clock.

## The page (`apps/park`)

- `game/activities.ts`: the room's activity layer: the action buttons where the owl stands, the
  answers and pushes, and the cards; `game/Lanterns.ts`, `game/QuizStage.ts` and
  `game/Fishing.ts` draw the glows, the zones and the line.
- `ui/activities.ts`: the quiz and copy cards (top right on wide screens, under the top bar on
  phones, where the tracker steps aside); `ui/quests.ts`: today's tasks in the quests screen and
  the tracker; `collect/tasks.ts` keeps them.
- `collect/local.ts`: the local mode runs `Activities` for the one owl on the device; its beam is
  that page's alone, and its quiz settles on a timer while the owl is in the hub. Its arcade runs
  are checked and paid by the same rules, and its wall shows this browser's scores.
- `arcade/`: the three games themselves (`hop.ts`, `flap.ts`, `knock.ts`), plain rules stepped in
  fixed slices from the run's seed; `game/ArcadeScene.ts` draws one over the room;
  `ui/arcadeScreen.ts` is its screen (the score, how to play, the run's end and Play again);
  `game/arcade.ts` puts the names on the marquees and the wall on the board and runs a run from
  Play to its pay.

## Tests

- `packages/shared/src/activities.test.ts` and `roomActivities.test.ts`: placement on the floors,
  the rules, the quiz schedule, the tasks and the ledger.
- `apps/park/e2e/activities.spec.ts` (this device): one owl lights the whole beam, a catch at the
  pond, a copied tune and a wrong note, and a right quiz answer (it waits for the next question,
  up to 90 s).
- `packages/shared/src/arcade.test.ts`, `arcadebook.test.ts`: the bands, the time check, the
  day's-best bonus, the wall and the cap; `apps/park/src/arcade/*.test.ts`: each game's rules, and
  that every stack of Nest Knockdown can be knocked down in its three shots.
- `apps/park/e2e/arcade.spec.ts` (this device, a phone and a computer): a run of each game, played
  by its rules, paid and on the wall; Play again; back out to the street.
- `apps/park/e2e/edge.spec.ts` (the room server): two owls light the beam together and are both
  paid, a catch, a tune danced for another owl, and an arcade run paid and shown on another owl's
  wall. `apps/edge/test/RoomObject.test.ts` checks a run's start at its cabinet, a result too quick
  for its time, a run kept through the object's sleep, and the cap.

## Waiting on the owner

All of it: the numbers above, and the words (the button labels, the cards' lines, the toasts, the
task texts, the quiz questions and answers, and the names of the catches).
