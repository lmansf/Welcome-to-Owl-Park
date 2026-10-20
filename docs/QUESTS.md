# Quests, NPC owls, leaf piles and the feather shop

Collectibles are earned now, not found lying around: NPC owls give quests, quests pay feathers
and collectibles, leaf piles turn up the odd feather, and Nova's feather shop sells a rotating
shelf for feathers. This document is the design, the numbers and how to add more. The
catalogue of collectibles itself is in [COLLECTIBLES.md](COLLECTIBLES.md).

Everything below is data and rules in `packages/shared/src` (no platform code), so the room
server and the zero-backend local mode run the same rules and Node unit-tests them.

## The loop

1. An owl with a gold **!** over its head has quests. Walk up (or tap it) and **talk**: the
   dialogue shows what it offers, what you are doing for it and what you can hand back.
2. **Take on** a quest. Its steps show in the tracker under the top bar and in the journal (J).
3. Do the steps in order: talk to someone, visit a place, flop into leaf piles, browse the
   market stalls, bask in the moonbeam, play an emote for someone, or find things a quest hides
   (acorns, lost gears, moonstones) that only you can see.
4. When it is done the giver shows a gold **?**: go back and **hand it in** for feathers and,
   usually, a collectible (a duplicate pays feathers instead).
5. Spend feathers in **Nova's feather shop** on the neon street.

The park clock is Eastern time (`PARK_TIME_ZONE` in `parktime.ts`): daily quests, the shop's daily
card and its featured shelf turn at midnight; weekly quests and the weekly shelf turn on Monday.

## NPC owls (`npcs.ts`)

Six residents, two per room, drawn as ordinary owls in catalogue wear (no new art). Each has a
spot, a facing, a few greetings and idle emotes. Their names and lines are visitor-facing text
and wait on the owner's approval before release.

| Id | Room | Role | Story quest |
| --- | --- | --- | --- |
| bramble | hub | keeper of the great tree | Welcome to Owl Park (the first quest) |
| pip | hub | lantern keeper | The lantern round |
| hazel | grove | forager | The acorn stash |
| juniper | grove | treehouse builder | Survey of the treetops |
| nova | market | keeper of the feather shop | Window shopping (and the shop) |
| flicker | market | tinkerer | Spare parts |

Every NPC also gives template quests (errands, tours, emotes, finding things, the grand quests);
leaf-pile quests come from the hub and grove owls, browsing from the market owls and basking in
the moonbeam from the hub owls.

Talking needs the owl within 120 px (feet to feet, `NPC_TALK_RADIUS`); an emote counts "for" an
NPC within 220 px (`NPC_EMOTE_RADIUS`). Quest text names places by their public descriptions
(`PLACE_NAMES`: the great tree, the treehouse clearing, the neon street), never realm names.

## Interactables (`interactables.ts`)

| Kind | Where | Use | Shared |
| --- | --- | --- | --- |
| leaf-pile | 1 in the hub, 3 in the grove | flop in: a poof of smoke and leaves | yes: gone for everyone for 90 to 150 s |
| stall | 3 on the market street | browse | no |
| moonbeam | the middle of the hub | bask | no |

A flop finds feathers 40 % of the time (1 to 3), at most 40 feathers a park day per collector
(`LEAF_FEATHER_CHANCE`, `LEAF_FEATHERS`, `LEAF_FEATHERS_PER_DAY`). One use per visitor every 1.2 s.
Leaf piles are drawn from leaf shapes, no painted art.

## Quests (`quests.ts`, `questCatalog.ts`, `questbook.ts`)

A quest is a giver, an ordered list of steps (goals) and a reward; handing it back to the giver
is the step after the last.

| Goal | Counts |
| --- | --- |
| `talk {npc}` | talking to that NPC |
| `visit {room}` | arriving in that room (a visit to the room you stand in when you accept is done at once) |
| `interact {what, count, room?, distinct?}` | uses of interactables of a kind; `distinct` wants different ones |
| `emote {emote, npc?, room?}` | playing an emote, near an NPC or in a room |
| `gather {item, count, room}` | picking up quest items placed on that room's hiding spots, for this collector only |

- **Type**: talk, visit, interact, emote, gather, or mixed. **Difficulty**: easy, medium, hard.
  **Length** by steps: 1 short, 2 or 3 medium, 4 to 6 long. **Cadence**: story (once), daily or weekly.
- **Catalogue**: 114 quests. Six hand-written story quests (the welcome quest first; the others
  unlock after it). Eight templates expanded in bulk over the givers and the three difficulties:
  leaves, errand, tour, show, gather, browse, bask and grand. The first seven, at every difficulty,
  form the daily pool (96); the grand quests (medium and hard, four to six steps) the weekly pool
  (12). Ids are stable: `<template>-<giver>-<difficulty>`, for example `leaves-hazel-medium`.
- **Offers**: each park day one easy, one medium and one hard daily quest (different givers and
  templates); each week one medium and one hard weekly quest (different givers). The same for
  every visitor, chosen by a seeded shuffle of the day or week; plus any story quest whose
  prerequisites are handed in. A visitor carries at most 4 quests (`MAX_ACTIVE_QUESTS`).
- **Progress** is server-authoritative: the room checks where the owl stands for talks, uses,
  hand-ins and pickups. Only the current step of a quest can move. Daily and weekly quests not
  handed in expire with their day or week.

### Rewards (canon C31; the owner may tune them)

| Setting | Default |
| --- | --- |
| Daily quest feathers | easy 15, medium 25, hard 40 (`DAILY_QUEST_FEATHERS`) |
| Weekly quest feathers | 150, about seven times a daily quest (`WEEKLY_QUEST_FEATHERS`) |
| A daily quest's collectible | easy 70/27/3/0, medium 45/40/13/2, hard 20/45/30/5 % common/uncommon/rare/epic (`REWARD_ODDS`) |
| A weekly quest's collectible | always rare or better: rare 80 %, epic 20 % (`WEEKLY_REWARD_ODDS`) |
| Within a rarity | a variant not yet owned is 4 times as likely (`REWARD_UNOWNED_BOOST`) |
| Duplicate | pays 5 / 10 / 25 / 60 feathers by rarity (`DUPLICATE_FEATHERS`) |
| Story quests | a fixed collectible each and 40 to 70 feathers (the welcome quest: Leaf Crown and 50) |

An active day comes to about 100 to 150 feathers: 80 from the three daily quests, up to 40 from
leaf piles, and some from duplicates. A common costs about a third of that, an epic four to five
days.

### Adding quests

- **In bulk**: add a template to `TEMPLATES` in `questCatalog.ts` (a function from giver,
  difficulty and a seed key to steps and words), or add givers to an existing one. Every giver x
  difficulty becomes a quest with a stable id.
- **One-off**: add a `QuestDef` to `STORY_QUESTS` (or a dated set, the same way).
- Never rename or remove an id that has shipped: progress rows refer to quests by id (rows for
  ids no longer in the catalogue are dropped quietly).
- `quests.test.ts` checks every quest: real NPCs, rooms, interactables and rewards, emotes every
  visitor owns from the start, enough hiding spots for gather steps, public-safe words, and offers
  from different givers.

## The feather shop (`shop.ts`)

| Shelf | What | Changes |
| --- | --- | --- |
| Today's gift | one collectible, free, once a park day per visitor (60/32/8 % common/uncommon/rare, `GIFT_ODDS`); one already owned pays its duplicate feathers | daily |
| Today's three | three items at the usual prices (each 40/35/20/5 % common/uncommon/rare/epic, `DAILY_ITEM_ODDS`) | daily |
| Featured | a curated set in its dates (`FEATURED_SETS`: Owlloween 19 to 31 October, First frost from 1 November), 4 a day turning through the set; otherwise the week's rarest (a rare and an epic) | daily in a set, else Mondays |
| This week | 3 common, 3 uncommon, 1 rare, 1 epic (`WEEKLY_MIX`) | Mondays |

All of a day's items are different items.

Prices: common 40, uncommon 90, rare 220, epic 500 feathers (`SHOP_PRICES`). The starter pack is
never sold. A buy checks the offer is on the shelf now, not owned, and affordable. Crafting is
retired: the shop replaces it.

## Server (`apps/edge`)

- **`Collections`** Durable Object adds `quests (cid, quest, period, step, count, seen, items,
  accepted_at, done_at)` (period: `''` for story quests, the park day or week otherwise) and
  `earned (cid, day, source, n)` for the daily leaf-pile cap. The old `drops` table stays as
  history; nothing reads it. The SQL store is `src/sqlStore.ts`, tested against SQLite in Node.
- **Room object**: routes quest frames per visitor in order, checks reach on the server clock
  (with 40 px of slack, `REACH_SLACK`), counts arrivals and emotes itself, and keeps shared
  objects (leaf piles) per room: who used one, and when it is back (also in its storage, so an
  evicted object brings them back).
- **HTTP**: `GET /api/shop`, `POST /api/shop/buy {variant}` and `POST /api/shop/gift` with the
  pass; `GET /api/collection` as before. `POST /api/collection/craft` and `/api/collection/tz` are
  gone. Who took today's gift is kept in the `earned` table.

### Socket frames (protocol v4)

Client (each with a request number `r`): `quests`, `talk {npc}`, `accept {quest}`,
`abandon {quest}`, `handin {quest}`, `use {target}`, `gather {quest, n}`.
Server: `quests {board, updates}` (an answer with its `r`, or a push after an arrival or an emote),
`handin` (thanks, feathers, the collectible, the board), `useResult` (feathers found, the
balance, progress), `objects` (shared objects used up, after the welcome), `used {id, by, until}`
(to everyone in the room), `refused {r, reason}` (unknown target, too far, too fast, offline).
Old pages speaking v3 are refused and reload themselves.

## Client (`apps/park`)

- `QuestLink` (`src/collect/service.ts`): the room server's over the socket, or the local mode's
  in this browser (same rules, leaf piles per page).
- Scene: NPC owls with name plates and markers (gold ! new quest, gold ? hand back, pale ? a step
  asks for them), leaf piles with the flop and poof, glows under the stalls and the moonbeam,
  quest-item markers, and the action buttons (E runs the first). Tapping an NPC or a pile walks
  up and does it on arrival.
- HUD: feathers in the top bar, the quest tracker, the journal (J), the NPC dialogue and the shop.
- Test hooks on `window.owlPark`: `quests()`, `talk(npc)`, `use(target)`, `accept(quest)`,
  `abandon(quest)`, `handIn(quest)`, `gather(quest, n)`, `shop()`, `buy(variant)`, `gift()`.

## The Quest Log sheet

The owner's Quest Log (a Google Sheet in the project Drive, not in this repository) mirrors the
catalogue for planning: quests, NPCs, interactables and shop settings by the same ids as the code,
and a log of changes. It holds no visitor data. When quests change in code, update the sheet in
the same change.

## Owl species (`species.ts`)

Visitors choose a kind of owl in the owl panel: great horned, barn, burrowing, snowy, or screech.
Each species has a drawn size (the screech owl is tiny, 0.62) and natural colours a visitor can
apply with one tap and still recolour. The barn, burrowing and snowy owls have their own painted
layers (`owl-barn-body` and so on, `art: true` in `species.ts`), loaded the first time an owl of
that kind shows up; until then, and for the screech owl until its art is approved, a species is
drawn with the great horned owl's layers at its own size. Hats, glasses and scarves sit where each
species' crown, eyes and chest are, measured from the layers it wears. The screech owl is meant for
founders only; until founder status exists it is open to everyone (`FOUNDER_SPECIES_OPEN`).
