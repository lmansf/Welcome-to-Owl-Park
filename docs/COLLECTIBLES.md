# Collectibles

- Status: BUILT; Purchases is groundwork only, PLANNED (OP-049 for the founder perk)
- Verified against: main 67ca3ab (2026-10-23) by the doc agent for headings and paths only; the numbers are Claude Code's as written
- Code: packages/shared/src/collectibles.ts, book.ts, shop.ts; apps/edge/src/Collections.ts, sqlStore.ts; apps/park/src/collect, apps/park/src/game/itemArt.ts
- Tickets: OP-013, OP-014, OP-015, OP-025, OP-029
- Related: docs/QUESTS.md, docs/ARCHITECTURE.md section 8

Visitors collect wearables (hats, glasses, collars), little pets that trot after their owl,
effects (glows, sparkles, eyes on fire) and emotes. Everything that can ever be bought can also
be earned in the park. This document is the catalogue, the numbers, and how the pieces fit.

## The loop

- **Quests** from the NPC owls pay feathers and, usually, a collectible: a fixed one for story
  quests, otherwise one picked by the quest's difficulty (unowned variants are likelier).
- **Feathers** come from quests, from flopping into leaf piles, and from duplicates. They buy
  collectibles in **Nova's feather shop**: a free gift each day, three new items each day, a
  featured shelf and this week's eight.
- A **duplicate** pays feathers instead.

The half-day finds on hiding spots, crafting and the home time zone are retired: quests and the
shop replace them. The quests, NPC owls, leaf piles and the shop are in [QUESTS.md](QUESTS.md).

## The catalogue

| Kind | Items | Colourways | Variants |
| --- | --- | --- | --- |
| Wearables: head 35, face 11, neck 12 | 58 | 10 (hue rotations of the art) | 580 |
| Pets | 24 | 8 (hue rotations) | 192 |
| Effects | 24 | 16 (tint colours) | 384 |
| Emotes | 24 | 1 | 24 |
| **Total** | 130 | | **1,180** |

The launch set was 118 items (1,068 variants). Drop 1, for Owlloween and the first frost, adds
eight wearables (Bat Headband, Candy Corn Cap, Earmuffs, Holly Crown, Mummy Wrap, Jack-o'-Lantern
Shades, Candy Necklace, Vampire Collar) and four pets (Little Ghost, Pumpkin Sprite, Snow Bunny,
Black Kitten). They can be earned all year, like everything else, and are the featured shelf in
their season.

Ids, names and rarities live in `CATALOGUE`; variant ids are `<item>~<colourway>` (`witch-hat~3`)
and bare ids for emotes (`hoot`).

## Defaults

| Setting | Default |
| --- | --- |
| A quest's collectible | rarity by the quest's difficulty, rare or better for weekly quests (`rewardOdds` in `quests.ts`); unowned variants 4 times as likely |
| Duplicate payout | 5 / 10 / 25 / 60 feathers by rarity (`DUPLICATE_FEATHERS` in `collectibles.ts`) |
| Shop prices | 40 / 90 / 220 / 500 feathers by rarity, plus a free gift each day (`shop.ts`) |
| Pickup distance (quest items) | 56 px on the server, 40 px before the client asks (`PICKUP_RADIUS`) |
| Starter pack | Hoot, Wing Flap, Sparkle (Gold) (`STARTER_PACK`); never sold |
| Identity | per device (a collector token in the browser); email linking later |

## Identity

- **Collector token** (`owl-park:collector` in localStorage): HMAC-signed `{k: "col", cid, iat}`
  with `PASS_SIGNING_KEY`. `GET /api/pass` takes it (header `X-Collector` or `?collector=`) and
  returns `{pass, exp, collector}`; a missing or forged token starts a new collection.
- The **park pass** carries the `cid` (and the browser's zone, which nothing uses any more). The
  pass's own id stays one owl per page load, so two tabs of one browser are two owls sharing one
  collection.
- Collector tokens and passes are distinct shapes; neither verifies as the other.

## Server (`apps/edge`)

- **`Collections`** Durable Object (SQLite, one for the park, `getByName('park')`, migration
  `v3`): `collectors(cid, tz, tz_set_at, feathers, equipped, created_at)`,
  `owned(cid, variant, source, at)` (source: quest, shop, gift, granted, bought; found and crafted
  for history), `earned` (leaf-pile feathers and the gift, per day) and `quests` (progress). The old `drops` table stays
  as history. The rules are the platform-free `CollectionBook` (`book.ts`) and `QuestBook`
  (`questbook.ts`) in `packages/shared/src`, shared with the local mode and unit-tested; the SQL
  store is `apps/edge/src/sqlStore.ts`.
- The **room object** handles the socket side: it carries the collector id per socket, checks
  quest talks, uses and pickups against the owl's position on the server clock, and keeps a small
  cache of what each collector owns to vet worn items and emotes (a look naming something unknown
  triggers a fresh read, so items bought over HTTP are recognised).

### API

| Endpoint | Auth | Answer |
| --- | --- | --- |
| `GET /api/pass` | collector token (optional) | `{pass, exp, collector}` |
| `GET /api/collection` | pass | `{cid, owned, feathers, equipped}` |
| `GET /api/shop` | pass | `{rotation: {featured, weekly, daily, ...}, owned, feathers}` |
| `POST /api/shop/buy {variant}` | pass | `{ok, variant, price, feathers}` or `{ok: false, reason: unknown, not-offered, owned or feathers}` |
| `POST /api/shop/gift` | pass | `{ok, variant, dup, feathers, total}` or `{ok: false, reason: taken or none}` |
| `POST /api/admin/grant {cid, variant, source}` | `X-Admin-Key` | `{ok, variant, added}`; idempotent |

### Socket frames (protocol v4)

Client: `emote {e}`, looks that may carry `wear: {head, face, neck, pet, fx}`, and the quest
frames in [QUESTS.md](QUESTS.md). Server: `emote {id, e}` (to everyone else) and the quest frames.
Worn items the collector does not own are dropped before a look is broadcast. Emotes are limited
to one per 1.5 s per owl.

## Client (`apps/park`)

- `CollectionService`: `EdgeCollections` (room server: HTTP for inventory and the shop; the room
  socket for quests) or `LocalCollections` (no server: the same rules in localStorage; used by the
  local and Supabase transports, development and the end-to-end tests; `?collector=` pins the
  collection for tests).
- **Wearables** sit on anchors measured from whichever owl art is loaded (crown, eye line,
  top of the chest: `apps/park/src/collect/pixels.ts`), turn with the owl, follow its bob and
  emotes. **Pets** trot after their owl. **Effects** are capped particle rigs and glows.
  **Emotes** animate a pose container and burst a few shapes; no letters anywhere.
- **Colourways** of wearables and pets rotate the hue of the art by hand on a canvas (Safari's
  canvas has no `filter`); colourway 0 is the art as painted.
- Until painted art ships every wearable and pet has a drawn placeholder (`itemArt.ts`).
- HUD: feathers in the top bar; from the **Menu**, the **owl builder** (`ui/owlBuilder.ts`: the
  whole screen, the owl drawn big and alive by `game/BuilderScene.ts`, and tabs for its kind,
  colours, wear, pets and effects, a card per item with its colourway dots; a tap puts it on or
  takes it off, and what is not owned yet shows greyed with where to find it). The **emote wheel**
  (`ui/emoteWheel.ts`: the owned emotes round a ring, eight a page) has its own button beside the
  Menu, and on a keyboard 1 to 8 play the emotes as the wheel numbers them, without opening it.
  The quest tracker, the quests screen, dialogue and shop are in [QUESTS.md](QUESTS.md).
- Test hooks on `window.owlPark`: `collection()`, `equip(variant)`, `emote(e)`, and the quest and
  shop hooks.

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
   variants by id. (To keep an item out of rewards and the shop, a flag is the follow-up.)
2. Update the variant total in `collectibles.test.ts` and in this document.
3. Draw a placeholder in `itemArt.ts` for new wearables and pets (or ship their art), and an
   effect rig in `fx.ts` or an animation in `emotes.ts` for new effects and emotes.
4. Optionally add a `FEATURED_SETS` entry in `shop.ts` with the drop's dates and items.
5. Deploy: new variants enter quest rewards and the shop rotation at once.

## Purchases [groundwork only; PLANNED (OP-049 founder perk, store link)]

Everything purchasable can be earned in the park, and purchases sell a **specific** variant, never a random
draw (paid random draws are restricted in several countries and cost collectors' trust). The
plumbing is `POST /api/admin/grant {cid, variant, source: "bought"}`: a Shopify `orders/paid`
webhook, once the store exists, verifies the order and grants the variant. Open design: how a
checkout learns the buyer's collector id (for example, the park opens the shop with the collector
id in the cart attributes), which is also where email linking fits.
