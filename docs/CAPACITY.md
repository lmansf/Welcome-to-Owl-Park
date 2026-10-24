# Busy nights: adding and removing capacity

How the park bends instead of breaking on a night busier than it holds (OP-075): the busy ribbon,
the line in front of the park, bigger rooms, one object per room, and copies of a room. Written
from what the park runs on (`docs/ARCHITECTURE.md`, sections 3 and 6) and rehearsed on a throwaway
copy (section 9). The incident playbook (`docs/PLAYBOOK.md`) links here.

Who does what: the owner holds the admin key and the Cloudflare and GitHub accounts, and decides;
Claude Code changes settings in `apps/edge/wrangler.jsonc` and deploys through GitHub when asked,
and watches the numbers. Everything on the capacity page works without a deploy.

## 1. What the park runs on, and what runs out

One Cloudflare Worker serves the page and the API; the rooms live in Durable Objects (the room
objects). `ROOM_SHARDING` in `apps/edge/wrangler.jsonc` decides how many:

- `single` (as deployed): the whole park in one object.
- `room`: one object per room, so each room holds its own cap.

What runs out first is an object's fan-out: every move goes to everyone else in its room. Measured
(OP-068): one object holds 80 owls walking at once (echo p95 71 ms) and overloads at 120 (moves lag
by seconds, then Cloudflare closes every socket in it with 1013 and the owls reconnect). With the
whole park in one object, the whole park holds about what one busy room does: about 80 owls walking
at once. Room caps, as deployed: lobby and hub 80, the grove, the market, the arcade and the street
40, a nest 12; the server takes caps from 1 to 120.

The tools, cheapest first:

| Tool | What it does | How | Deploy? |
| --- | --- | --- | --- |
| The busy ribbon | tells everyone it is busy | the capacity page | no |
| The line | new owls wait past a number of owls in the park | the capacity page | no |
| One object per room | each room holds its own cap | `ROOM_SHARDING=room` | yes |
| A copy of a room | a second room with the same painting, its own owls and cap | the capacity page (one object per room only) | no |
| A bigger room | raises a room's cap (up to 120) | `ROOM_CAPS` | yes |

## 2. The capacity page

`/admin/capacity` on the park's address, opened with the admin key like the other keepers' pages.
It needs `ADMIN_KEY` on the Worker (OP-001); until it is set, every setting stays at its default (no
line, no ribbon, no copies) and the page stays locked. A change reaches every new arrival within half
a minute: each Worker keeps what it read for three seconds while anything is on, and for thirty on a
quiet night, so a quiet park costs the overflow object almost nothing. Owls already in a room get the
ribbon at once; the home screen asks for it every minute.

The same settings answer to the admin API, for a script or a phone without the page:

    curl -H "X-Admin-Key: <the admin key>" https://<the park>/api/admin/capacity
    curl -H "X-Admin-Key: <the admin key>" -H "Content-Type: application/json" \
      -d '{"line":{"mode":"auto","threshold":80}}' https://<the park>/api/admin/capacity

A POST takes any of `{"line": {"mode", "threshold", "holdMin"}}`, `{"ribbon": {"on", "words"}}` and
`{"copy": {"room", "n", "state"}}`, and answers with every setting and each room's owls, copy by copy.

## 3. The busy ribbon

A thin banner across the top of the home screen and every room. On: everyone sees it. Its words are
the ribbon's own (`It's busy tonight; things may be slow`) unless the keepers write theirs (one line,
up to 90 characters, shown as plain text). It comes on by itself while the line is in front of the
park, and can be on alone. An owl may hide it for the rest of its visit; new words bring it back.

Verify: the page reads "On for everyone"; `/api/notice` answers the words; an owl in a room sees it.

## 4. The line

Modes: **off** (no line), **on by itself** (a line forms once the park holds `threshold` owls, and
stays until it has emptied), and **on** (every new owl goes through it, and it lets owls in while
the park holds fewer than `threshold`). `holdMin` is how long a called owl's place is held: 3 minutes
unless changed, up to 15.

- **Who waits**: a new arrival. The line sits in front of the whole park, the lobby, the street and
  the nests included, since the room objects are what overflow. An owl already inside walks on from
  room to room: every room's welcome gives it an entry (good for three hours, renewed by every room),
  and its next room checks that. A page that opens straight into a room without one is sent back
  to the home screen to wait.
- **The waiting screen**: part of the home screen. It says the owl's place, a rough wait, that the
  page updates on its own, and, for an owl holding a ticket, that the ticket's time starts at the
  turnstiles, not in the line (C35: a ticket starts at its first scan at the gate). It never
  mentions the store. When the owl's turn comes it walks into the lobby by itself.
- **Turns**: numbers are called strictly in order as places free up. Free places are the threshold,
  less the owls in the park, less owls called whose place is still held, less owls let in during the
  last 20 seconds (a page takes a few seconds to reach its room). The line moves every five seconds
  while anyone is in it. An owl whose turn passed while it was away (its phone locked, say) is told
  so and joins again at the back.
- **The rough wait**: the line's pace is the owls it called in the last ten minutes, divided by ten
  (owls a minute); the wait is the owl's place divided by that, rounded up. Before the line has
  moved at all the screen says the wait shows once it starts moving.
- **Counting the park**: the overflow object asks the room objects how many owls they hold, at most
  every five seconds and only while the line is on and someone is arriving or waiting. With one
  object per room it counts every room and copy; the nests (each their own object then) are left out.
- **What it costs**: each waiting owl's page asks where it stands every 5 seconds near the front and
  every 15 seconds further back, and the Worker answers from what it keeps, without asking the line
  (one Durable Object request per Worker every three seconds, plus one per arrival and one per turn).
  A hundred owls waiting come to roughly 30,000 Worker requests an hour: a line that lasts hours does
  not fit the free plan's 100,000 a day (`docs/PLAYBOOK.md`, section 5). Buy Workers Paid before a
  night that may need one.
- **Settings to start from**: as deployed (one object), on by itself at 80. With one object per room,
  the sum of the caps you are willing to fill, for example 240 for the lobby, the hub, the grove and
  the market at their caps.

## 5. A bigger room

`ROOM_CAPS` in the `vars` of `apps/edge/wrangler.jsonc`, a JSON object of caps by room id, then a
deploy (a push to `main`, or Actions → Deploy to Cloudflare → Run workflow):

    "ROOM_CAPS": "{\"hub\":100}"

The server takes 1 to 120. Past 80 busy owls one object overloads (section 1), so a copy (section 7)
is the better way to fit more owls into a room; a bigger cap suits a room of calm owls.

Verify: the capacity page shows the room's new cap.

## 6. One object per room

`"ROOM_SHARDING": "room"` in the `vars` of `apps/edge/wrangler.jsonc`, then a deploy. Each room then
holds its own cap (240 busy owls across four rooms held at p95 39 ms, against an overload with one
object). What changes for visitors: the park-wide count in the HUD covers only the owl's own room
(`/api/counts` still adds up every room), and the lanterns and the quiz start afresh in the hub's
own object. Cost: each room's object is awake, and billed on Workers Paid, on its own while owls are
in it (`docs/ARCHITECTURE.md`, section 3). Switching back is the same edit and a deploy; owls connected
at the time reconnect on their own.

Verify: the capacity page's copies section says one object per room.

## 7. A second copy of a room

Only with one object per room. On the capacity page, under Rooms and copies, **Open copy 2** beside
the room (or `{"copy": {"room": "hub", "n": 2, "state": "open"}}`). A room may have up to eight
copies (2 to 9).

- **Routing**: every owl that heads for the room (through a door, the turnstiles, Play, or a dropped
  socket coming back) is sent by the Worker to the copy with the most free places, the room itself
  counting as copy 1. A dropped socket goes back to the copy it was in while that copy is still there
  and has a place.
- **What a copy shares**: the room's painting, doors, NPC owls and quests. What it keeps for itself:
  its owls and its cap, its leaf piles, the lantern beam and the quiz (in the hub), and its phrases
  and emotes (owls in different copies do not see or hear each other).
- **What does not care about copies**: an owl's collection, feathers, quests, daily tasks, tickets and
  votes live with the owl (the collections object and the ticket book), so they follow it into any
  copy. Friends (OP-050, later): a friend's location will have to name the copy, room and number, for
  "go to my friend" to land beside them.
- **Cost**: each copy is one more object awake while owls are in it; nothing while it is empty.

Verify: the copy's count rises on the capacity page; `/api/counts` adds the copies into the room's
number.

## 8. Draining and closing a copy

1. **Drain** it on the capacity page: no new owls go to it. Owls inside stay until they leave (a
   door, the Menu, or closing the page); one whose socket drops may come back to it meanwhile.
2. Wait until its count reads 0 (Refresh).
3. **Close** it. Closing a copy that still has owls is allowed after a confirm: they stay until they
   leave, but none can come back to it (a dropped socket goes to another copy).

To bring one back, **Reopen** a draining copy, or **Open** it again once closed.

## 9. The rehearsal (dry run)

Run it again with Actions → Load test → Run workflow, mode `capacity`: it deploys a throwaway copy of
the Worker with one object per room and the hub's cap at 30 (`tools/load/throwaway-config.mjs`),
rehearses with bots (`tools/load/capacity-dry-run.mjs`), and deletes the copy. The live park is never
touched; a run spends a few hundred of the day's free requests.

First run, 2026-10-24 (Load test run 4, from the branch that built this): 18 seconds of bots, about
forty seconds with the deploy and the delete.

| Step | What happened |
| --- | --- |
| 20 owls into the hub | all in the hub itself |
| Open copy 2 of the hub | the change took 0.23 s; the first owl went to copy 2 0.39 s after it opened |
| 24 more owls into the hub | 18 to copy 2, 6 to the hub itself: 26 and 18 inside |
| Drain copy 2, then 6 more owls | 1 to copy 2 still, 4 to the hub itself until it was full (30), 1 turned away (room full) |
| Copy 2's 19 owls leave | the capacity page read 0 within 0.1 s; copy 2 closed |
| The line on, at the 30 owls inside; 8 owls arrive | places 1 to 8 |
| An owl without its turn opens a room | turned away to the line (4012) |
| 4 owls inside leave | the first 4 in line called 8.5 to 8.7 s later; each opened the lobby with its entry; the other 4 moved up to places 1 to 4 |

What it showed:

- Opening a copy takes effect at once, and newcomers go where there is room, but not in perfectly
  even turns: each Worker weighs counts up to two seconds old, and several Workers served the
  arrivals. Every room still held its cap.
- A change reaches every Worker within three seconds, so an owl or two may still reach a copy just
  drained. Wait for the count to read 0 before closing it, as the page says.
- With the room itself full and its only copy draining, newcomers to that room are turned away as
  full and go back where they came from. On a busy night, open another copy before draining one.
- The line called owls about eight seconds after places freed: it moves every five seconds, and a
  waiting page looks every five seconds near the front.

## 10. Defaults chosen (OP-075's open questions)

- **Durable Objects or a single process**: Durable Objects, so more capacity is one object per room
  and then copies of a room, each its own object; no second host or router.
- **Copies only with one object per room**: with the whole park in one object a copy would share
  that object's fan-out and add no room.
- **The wait**: the line's pace over the last ten minutes (section 4).
- **The line's place in the park**: in front of the whole park, lobby and street included.
- **The store**: the line's words never mention it.
- **Chat, votes, daily tasks, friends**: per copy for what owls see and hear; per owl for everything
  kept (section 7).
- **Off until turned on**: the line and the ribbon start off, so nothing changes for visitors until
  the keepers decide, and they cannot be switched before the admin key is set (OP-001).
