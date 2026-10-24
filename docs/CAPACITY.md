# Capacity: caps, full rooms and busy nights

What the park holds today, what happens at the cap, and what is planned for busy nights (OP-075).
The process for adding and removing capacity, with its dry run, is OP-075's to write once it is
built; this file states what exists and marks the rest **planned**. The measurements behind the
numbers are in `docs/ARCHITECTURE.md`, section 6 (OP-068); what to do when the park is in trouble
is `docs/PLAYBOOK.md`.

## The caps (built)

Room caps are the server's `ROOM_CAPS` variable (a JSON object in `apps/edge/wrangler.jsonc`), or
the defaults in `apps/edge/src/rooms.ts`:

| Room | Default cap |
| --- | --- |
| The lobby | 80 |
| The hub | 80 |
| The storybook realm (`grove`) | 40 |
| The neon market realm (`market`) | 40 |
| The arcade | 40 |
| The street of nests (`homes`) | 40 |
| A nest (every nest shares the `nest` entry) | 12, and the owner always gets into its own nest |
| Any other room id | 40 |

A cap set in `ROOM_CAPS` must be 1 to 120. Changing a cap is a change to `wrangler.jsonc` and a
deploy (`docs/DEPLOY.md`); there is no switch for it yet.

Two more limits: at most 8 sockets per client address per object (`MAX_SOCKETS_PER_IP` in
`wrangler.jsonc`; a household shares one address), and the free plan's daily request caps
(`docs/PLAYBOOK.md`, section 5).

## At the cap (built)

- The room server answers a `full` frame and closes the socket with code 4010
  (`apps/edge/src/Room.ts`, `join`).
- The page shows "That part of the park is full right now. Try again in a moment." and walks the
  owl back to the room it came from, or to the hub (`apps/park/src/game/RoomScene.ts`,
  `roomFull`). There is no queue and no place is held.
- A nest's owner is let in however full the nest is (`overCap`); visitors are not.

## What the park holds (measured, OP-068)

With the whole park in one object (`ROOM_SHARDING=single`, today's setting), the park holds about
80 owls walking at once in total. One room holds its cap of 80 even with every owl walking every
second. Past the limit, moves lag by seconds and then every owl in the park is dropped at once;
pages reconnect on their own, from half a second up to eight seconds apart.

With one object per room (`ROOM_SHARDING=room`, a setting and a deploy), each room holds its own
cap and a room that overloads no longer takes the others with it: the four rooms at their caps
(240 owls, all walking) held with an echo p95 of 39 ms. Switch to it before a day that may bring
more than about 80 owls at once, such as opening night (`docs/PLAYBOOK.md`, section 5). Each busy
room's object is then awake, and billed, on its own (`docs/ARCHITECTURE.md`, section 3).

## Planned (OP-075, In progress)

Nothing below exists in the code yet. OP-075 builds all three; Claude reviews the words.

1. **The queue**: a Worker setting with an on/off toggle and a threshold (the live owl count across
   the park, taken from OP-068's measurement). When it is on, or the count passes the threshold,
   new arrivals do not enter the lobby. They see a waiting screen, part of the home screen
   (OP-065): "Your place in line: N", a rough wait, and the park's name. Admission is handed out
   in order by the room server, a place is held for a set number of minutes once called, and the
   screen polls on its own. Owls already inside are untouched. A ticket's clock does not start in
   the queue (C35: it starts at the first gate scan). Default: the queue sits in front of the
   whole park, lobby and street of nests included.
2. **The ribbon**: a thin banner on the home screen and in every room, toggled by a setting with
   its own words (default "It's busy tonight; things may be slow"), shown to everyone,
   dismissible for the visit. It comes on by itself when the queue is on and can be on alone.
3. **The capacity process** (this file, once written by OP-075 after a dry run): how a room's cap
   is raised by a setting; how a second copy of a room is opened (the same painting, its own owls
   and cap) and how the gate and doorways route new arrivals to the least-full copy; how a copy is
   drained and closed; what each step costs on Cloudflare's tiers and who runs it (the owner or
   Claude Code), with the exact commands or dashboard clicks and how to verify each. Room
   instances (`hub-1`, `hub-2`) are not built; the protocol and ids leave room for them
   (`docs/ARCHITECTURE.md`, section 6).

Open points carried on OP-075: the wait estimate's math; what chat, friends (OP-050), votes and
daily tasks assume about one copy per room; whether the queue's words mention the store (no, by
default).

## What QA tests (OP-088, Blocked by OP-075)

Fill the hub to 80 and a realm to 40 with a script or headless tabs, then add one more real
visitor.

- Pass: the extra visitor sees the behaviour this file documents (today: the "full" toast and the
  walk back; once OP-075 lands: the queue or the ribbon), is admitted when someone leaves, and the
  room stays responsive for the 80 already in it (movement latency under 300 ms).
- Fail: silent refusal, a blank screen, a crash, or existing visitors lagging.
- Record peak Worker and room-server CPU and memory.
- Run it against a throwaway copy of the room server, as OP-068 did, never the live park: a run
  against the live park would also spend the free plan's daily requests. The load tools are
  `tools/load/swarm.mjs` and `tools/load/run-steps.mjs`; the Load test workflow
  (`.github/workflows/load-test.yml`) deploys the throwaway copy and deletes it afterwards.
