# Collectibles

Visitors find things scattered around the park: wearables (hats, glasses, collars), little pets
that trot after their owl, effects (glows, sparkles, eyes on fire) and emotes. Everything that
can ever be bought can also be found. This document is the design, the numbers, and how the
pieces fit.

## The loop

- Every visitor has a **home time zone** (the browser's, on the first visit). Their day splits
  into two **windows**: 00:00 to 11:59 (morning) and 12:00 to 23:59 (afternoon), local time.
- Each window holds **two or three finds** for that visitor, on the park's **hiding spots**
  (`spots` in `packages/shared/rooms/index.ts`, 9 or 10 per room). A visit in the morning and
  one in the afternoon give 4 to 6 finds a day.
- Finds are **personal**: only the finder sees their sparkles, so nobody camps or competes.
- Walking onto a sparkle picks it up (the room server checks the owl is standing there).
- A **duplicate** pays **feathers**; feathers **craft** any variant the visitor still lacks.
- Unclaimed finds vanish when the window turns. The HUD says how many are left and when new
  ones arrive ("2 finds left this morning · new finds at 12:00").

One server is enough for every time zone: windows are arithmetic on the collector's zone
(`windowKeyAt`, `nextWindowAt` in `packages/shared/src/collectibles.ts`), not timers.

## The catalogue (launch)

| Kind | Items | Colourways | Variants |
| --- | --- | --- | --- |
| Wearables: head 30, face 10, neck 10 | 50 | 10 (hue rotations of the art) | 500 |
| Pets | 20 | 8 (hue rotations) | 160 |
| Effects | 24 | 16 (tint colours) | 384 |
| Emotes | 24 | 1 | 24 |
| **Total** | 118 | | **1,068** |

A visitor finding three things a day, every day, gets about 1,095 finds a year; with duplicates
paying feathers and monthly drops adding items, there is always more to find. Ids, names and
rarities live in `CATALOGUE`; variant ids are `<item>~<colourway>` (`witch-hat~3`) and bare ids
for emotes (`hoot`).

## Defaults (named constants in `packages/shared/src/collectibles.ts`)

| Setting | Default |
| --- | --- |
| Rarity of a find | common 60 %, uncommon 28 %, rare 10 %, epic 2 % (`RARITY_WEIGHTS`) |
| Within a rarity | a variant not yet owned is 4 times as likely (`UNOWNED_BOOST`) |
| Finds per window | 2 or 3 (`DROPS_MIN`, `DROPS_MAX`) |
| Duplicate payout | 5 / 10 / 25 / 60 feathers by rarity (`DUPLICATE_FEATHERS`) |
| Crafting cost | 50 / 100 / 250 / 600 feathers by rarity (`CRAFT_COST`) |
| Pickup distance | 56 px on the server, 40 px before the client asks (`PICKUP_RADIUS`) |
| Home time zone changes | once every 30 days; the first visit counts (`TZ_CHANGE_COOLDOWN_DAYS`) |
| Starter pack | Hoot, Wing Flap, Sparkle (Gold) (`STARTER_PACK`) |
| Identity | per device (a collector token in the browser); email linking later |

## Identity

- **Collector token** (`owl-park:collector` in localStorage): HMAC-signed `{k: "col", cid, iat}`
  with `PASS_SIGNING_KEY`. `GET /api/pass` takes it (header `X-Collector` or `?collector=`) and
  the browser's `?tz=`, and returns `{pass, exp, collector}`; a missing or forged token starts a
  new collection.
- The **park pass** gains `cid` and `tz`. The pass's own id stays one owl per page load, so two
  tabs of one browser are two owls sharing one collection.
- Collector tokens and passes are distinct shapes; neither verifies as the other.

## Server (`apps/edge`)

- **`Collections`** Durable Object (SQLite, one for the park, `getByName('park')`, migration
  `v3`): `collectors(cid, tz, tz_set_at, feathers, equipped, created_at)`,
  `owned(cid, variant, source, at)` (source: found, crafted, granted, bought) and
  `drops(cid, win, n, room, x, y, variant, claimed_at)`. The rules are the platform-free
  `CollectionBook` in `packages/shared/src/book.ts`, shared with the local mode and unit-tested.
- A window's drops are generated on its first request from `HMAC-SHA256(secret, "drops|cid|window")`
  and the collection as it stands, then stored, so they never shift as the collection grows.
  Older windows' rows are deleted when a new window is generated.
- The **room object** handles the socket side: it carries the collector id per socket, checks
  pickups against the owl's position on the server clock, and keeps a small cache of what each
  collector owns to vet worn items and emotes (a look naming something unknown triggers a fresh
  read, so items crafted over HTTP are recognised).

### API

| Endpoint | Auth | Answer |
| --- | --- | --- |
| `GET /api/pass` | collector token (optional) | `{pass, exp, collector}` |
| `GET /api/collection` | pass | `{cid, owned, feathers, equipped, tz, tzLockedUntil, window, next}` |
| `POST /api/collection/craft {variant}` | pass | `{ok, variant, feathers}` or `{ok: false, reason: unknown, owned or feathers}` |
| `POST /api/collection/tz {tz}` | pass | `{ok, tz, tzLockedUntil}` or `{ok: false, reason: invalid or locked}` |
| `POST /api/admin/grant {cid, variant, source}` | `X-Admin-Key` | `{ok, variant, added}`; idempotent |

### Socket frames (protocol v3)

Client: `drops` (this window's unclaimed finds), `pickup {n}`, `emote {e}`, and looks that may
carry `wear: {head, face, neck, pet, fx}`. Server: `drops {window, next, drops: [{n, room, x, y,
kind}], feathers}` (only where and what kind, never which item), `found {n, variant, dup,
feathers}`, `missed {n, reason: far, gone or busy}`, `emote {id, e}` (to everyone else). Worn
items the collector does not own are dropped before a look is broadcast. Emotes are limited to
one per 1.5 s per owl.

## Client (`apps/park`)

- `CollectionService`: `EdgeCollections` (room server: HTTP for inventory, crafting and the time
  zone; the room socket for drops and pickups) or `LocalCollections` (no server: the same rules
  in localStorage; used by the local and Supabase transports, development and the end-to-end
  tests; `?collector=` and `?tz=` pin both for tests).
- **Wearables** sit on anchors measured from whichever owl art is loaded (crown, eye line,
  top of the chest: `apps/park/src/collect/pixels.ts`), turn with the owl, follow its bob and
  emotes. **Pets** trot after their owl. **Effects** are capped particle rigs and glows.
  **Emotes** animate a pose container and burst a few shapes; no letters anywhere.
- **Colourways** of wearables and pets rotate the hue of the art by hand on a canvas (Safari's
  canvas has no `filter`); colourway 0 is the art as painted.
- Until painted art ships every wearable and pet has a drawn placeholder (`itemArt.ts`).
- HUD: the finds counter, the **Collection** panel (tabs, a card per item with its colourway dots,
  wear or take off, craft with feathers, the home time zone) and the **Emotes** tray.
- Test hooks on `window.owlPark`: `collection()`, `drops()`, `pickup(n)`, `equip(variant)`, `emote(e)`.

## Art for wearables and pets

Keys are `item-<id>` (`ITEM_ART` in `apps/park/src/game/itemArt.ts`, separate from the `ART` table
the art tools parse). The loader tries `<key>.svg`, then `@2x`/1x WebP and PNG under
`apps/park/public/art/`. Canvas conventions, in owl canvas units (the owl is 200 x 240):

| Slot | Canvas | Placed by |
| --- | --- | --- |
| head | 140 x 100 | bottom-centre on the crown (a hat's band at the bottom edge) |
| face | 120 x 60 | centre on the eye line; lenses about 52 apart |
| neck | 130 x 80 | the band across the top fifth, centred on the top of the chest |
| pet | 90 x 90 | feet on the bottom edge, centred, facing right |

Paint each item once in a clear, saturated main colour with neutral details (white, grey, black
stay neutral under a hue rotation); the other colourways are rotations of it. The art pipeline
(`tools/art`) does not list these keys yet; adding an item table to it is the next step there.

## Adding a monthly drop

1. Add `ItemDef`s to `CATALOGUE` with new ids. Never rename or remove an id: collections refer to
   variants by id. (To retire an item from finds, a `droppable: false` flag is the follow-up.)
2. Update the variant total in `collectibles.test.ts` and in this document.
3. Draw a placeholder in `itemArt.ts` for new wearables and pets (or ship their art), and an
   effect rig in `fx.ts` or an animation in `emotes.ts` for new effects and emotes.
4. Deploy: new variants enter drops at once (by rarity, unowned first).

## Purchases (groundwork only)

Everything purchasable is findable, and purchases sell a **specific** variant, never a random
draw (paid random draws are restricted in several countries and cost collectors' trust). The
plumbing is `POST /api/admin/grant {cid, variant, source: "bought"}`: a Shopify `orders/paid`
webhook, once the store exists, verifies the order and grants the variant. Open design: how a
checkout learns the buyer's collector id (for example, the park opens the shop with the collector
id in the cart attributes), which is also where email linking fits.
