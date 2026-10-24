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

## Controls

- **Keyboard**: WASD or the arrow keys walk, E does what the owl stands at, the space bar hops, M
  opens the Menu, T the Say wheel, 1 to 8 play an emote, Q goes to the mirror in the owl's nest
  (where Your owl is), J the quests, Escape closes (`apps/park/src/ui/keyboard.ts`). A space bar on
  a focused button presses the button instead.
- **Touch screens**: a pad like a handheld's (OP-082, `apps/park/src/ui/hud.ts`). The thumbstick
  walks from the bottom-right corner; on the left, **Interact** (the hand, nearer the middle) does
  what E does and lights up gold where there is something to do, **Jump** (the arrow, nearer the
  corner) hops, and the **Menu** is the small dark button in the corner, with **Emotes** (the
  smile) above them. All see-through like the stick, each at least 44 px and none overlapping.
  Tapping the floor still walks there, and the gold buttons over the stick still say what can be
  done where the owl stands.
- **The hop** is a look, not a move: the owl's drawing goes up and comes down in 0.4 s with a
  two-frame flap while its place, its walk and what it stands at stay as they are, so a hop can
  cross nothing. It is its own state beside emotes (`game/hop.ts`), so flight (OP-084) can later
  turn its lift into a real height. It travels as an emote frame (`JUMP_EMOTE`, `jump`) that every
  owl has without collecting it: no quest counts it, no collection is asked. A page sends one at
  most every 0.6 s (`JUMP_EVERY_MS`); the room server passes one every 0.48 s and drops the rest,
  apart from emotes' own limit. No sound.

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

## The arcade (off the neon street's east end)

A doorway under a joystick sign where the neon street bends away leads into the arcade: a hall
with three game cabinets along its back wall under a blank score board (`packages/shared/src/arcade.ts`).
Each cabinet is a spot in the room data and will play one game, as the visitor's own owl. Until a
cabinet's game is live its screen is switched off and reads "Hatching Soon", and an owl standing
at it is told the same; none is live yet, so the arcade pays nothing and has no daily task.

## The mirror (in every nest)

Your owl, the editor for an owl's kind, colours, wear, pets and effects, is at a standing mirror in
every nest, against the back wall between the lamp's spot and the round window (OP-077). Standing on the floor in front of it, the button
**Look in the mirror** (E, or the pad's Interact) turns the owl to it and opens Your owl, every
tab, and the owl in the room is the preview: the room's own camera draws the owl and its mirror in
the editor's stage, and each choice shows on it at once. A mirror changes only the owl looking in,
so a visitor can use the mirror in someone else's nest, and nothing of the host's changes. The
mirror is part of the room, not a piece of furniture, so an unfurnished nest has it too.

The ways to it: **Go to your nest** on the home screen puts the owl inside its nest, before the
mirror and facing it; the Menu's **Go home** goes to the nest too; and **Q** goes to the mirror from
anywhere (home to stand before it from outside, walking up to it in a nest, and from in front of
it, into Your owl). The Menu no longer has a Your owl tile. The first visit's **Make your owl**
still opens the editor in place, on the home screen. The first time a device's owl is home, the
mirror glints once, with no words.

The mirror is drawn in code (`apps/park/src/game/mirror.ts`): a dark wooden oval on a stand with a
gold line inside and silvery glass, in the nest painting's warm wood and gold. Its place and the
floor in front of it are room data (`NEST_MIRROR`, the `mirror` spot and spawn in `NEST_ROOM`).

## Three small tasks a day

The same three for everyone each park day (`dailyTasks`), one from each slot and never the same
kind twice:

1. at the lanterns: light 3, or light 5, or light the whole beam;
2. at a game: catch a fish, or 3, or answer a quiz question right, or copy a tune;
3. around the park: flop into 2 leaf piles, or browse 2 stalls, or answer a quiz question right,
   or copy 2 tunes.

Each task pays 4 feathers, and all three 8 more. They show in Quests (the Menu, or J), on its
Today tab; a task done says so with its feathers, a step along one says nothing over the room
(OP-083). They change at the park's midnight.

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

The room server (`RoomObject`) checks every activity against the owl's position on its own clock
(plus 40 px of slack), allows one note of the copy game per 250 ms, and pays through the
`Collections` ledger (`play`). Times on the wire are server milliseconds; the page converts them
to its own clock, and runs the quiz card on the server's clock.

## The page (`apps/park`)

- `game/activities.ts`: the room's activity layer: the action buttons where the owl stands, the
  answers and pushes, and the cards; `game/Lanterns.ts`, `game/QuizStage.ts` and
  `game/Fishing.ts` draw the glows, the zones and the line.
- `ui/activities.ts`: the quiz and copy cards (top right on wide screens, under the top bar on
  phones); `ui/quests.ts`: today's tasks in the quests screen; `collect/tasks.ts` keeps them.
- `collect/local.ts`: the local mode runs `Activities` for the one owl on the device; its beam is
  that page's alone, and its quiz settles on a timer while the owl is in the hub.

## Tests

- `packages/shared/src/activities.test.ts` and `roomActivities.test.ts`: placement on the floors,
  the rules, the quiz schedule, the tasks and the ledger.
- `apps/park/e2e/activities.spec.ts` (this device): one owl lights the whole beam, a catch at the
  pond, a copied tune and a wrong note, and a right quiz answer (it waits for the next question,
  up to 90 s).
- `apps/park/e2e/edge.spec.ts` (the room server): two owls light the beam together and are both
  paid, a catch, and a tune danced for another owl.

## Waiting on the owner

All of it: the numbers above, and the words (the button labels, the cards' lines, the toasts, the
task texts, the quiz questions and answers, and the names of the catches).
