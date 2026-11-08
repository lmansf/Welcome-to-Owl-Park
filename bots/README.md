# Playtest bots

Scripted owls that play the park on every pull request (`.github/workflows/playtest.yml`). None of this
is part of the game's bundle: the bots read the game's rules from `packages/shared` and open the page
the way a visitor does.

Two kinds of bot run side by side:

- **The kid sim** (`sim/`, `pnpm --filter @owl-park/bots playtest`): every room seen from the side,
  including every act of every course, played in Node with the game's own flight, footing, updrafts,
  wind, brush ink, neon signs, pits, thorns and dash. A kid bot plays each hop thousands of ways (where
  it stands, when it taps Jump again, whether it dashes, whether it drops before it glides) and the
  share that lands is the hop's clear rate. From those it finds the fewest tries to every doorway, leaf
  pile, hiding spot, bench, part, lost feather and shrine, from every way into the room.
- **The browser walk** (`browser/`, `pnpm --filter @owl-park/bots walk`): every room of the park opened
  in Chromium at 1440x900 and at a phone's 390x844 with touch, from every spawn. It records errors the
  page throws or logs, whether the owl comes in on the screen and on the floor, every doorway at floor
  height walked through (and where it led), doorways a button covers on a phone, and a screenshot.

`report.mjs` puts both together in the run's summary (the **Playtest** check) and keeps the
screenshots and the full results with the run.

## The kid bar

The owner's bar for every course: something a ten-year-old can do in a few tries. The bots read that as
**every hop a course needs lands at least 50% of a kid's tries** (`KID_BAR` in `sim/playtest.ts`). At
50% a kid makes a hop every other try, so three tries clear it seven times in eight. The summary also
gives each course's falls a kid can expect on a clear and the chance of a clean run.

## What fails the check

- a stuck spot: a ledge or stretch of floor a kid can get to with no way from it to any doorway (and,
  in a course, no pit to fall back to a bench by);
- a doorway, leaf pile, hiding spot or course piece no route reaches from any way in;
- a spawn that stands on nothing;
- a hop a course needs that lands under the kid bar;
- a room that won't open in the browser, or a doorway a walk to it doesn't go through.

Everything else the bots see (errors in the console, an owl off the screen, a doorway under a button on
a phone, a hard hop to an optional feather) is listed under "Worth a look" and fails nothing.

## New rooms and courses are covered with nothing to add

Nothing is listed by hand. The sim plays every room with `map: 2` in `ROOMS`, reads every course in
`COURSES` through its acts, and finds the targets from each room's own definition (its doors,
`INTERACTABLES` leaf piles, `spots`, and `course` pieces). The walk opens every room in `ROOMS` from
every spawn, from a plan written fresh from `packages/shared` each run (`pnpm plan`). Add a room, a
doorway or a course, and the next run plays it.

## Turning a miss into a lasting check

Every finding has a key that stays the same from run to run (`stuck:brush-1:c1`,
`unreachable:canopy-3:hut`, `bar:circuit:circuit-1:floor0>bridge1`, `walk:l1:to-market`). The check
fails on any key that `baseline.json` doesn't list, so a miss the bots catch fails every pull request
until it is fixed, and once fixed it can't come back unnoticed.

- **Fix it** (the room's ledges, the column's timing): the finding goes away and the check passes.
- **Can't fix it yet**: list its key in `baseline.json` with a reason. The summary still shows it, under
  "Known". When it's fixed, the summary lists it under "Fixed" so the line can come out.
- **The bots got it wrong** (a kid can do it and the sim says no): fix the bot, not the baseline, and add
  a test to `sim/owl.test.ts` that holds the bot to the game's rule it missed.

## Running it

```
pnpm --filter @owl-park/bots test       # the bot's own checks, quick
pnpm --filter @owl-park/bots playtest   # the kid sim over every room (a few minutes), out/sim.json
pnpm --filter @owl-park/bots walk       # the browser walk (needs Playwright's Chromium), out/browser
pnpm --filter @owl-park/bots report     # the summary, out/summary.md
```

One room by itself: `out/rooms/<room>.json` holds each target's tries, its route hop by hop, and each
hop's clear rate and share of falls.
