# Owl Park

Owl Park is a virtual owl park you visit online. Every visitor is an owl. You wander
2D rooms by tapping where you want to go, and you see everyone else who is there right
now doing the same. This repository holds the park application.

Two buttons sit at the bottom. **Emotes** opens the emote wheel. **Menu** leads to everything
else: Say (a prewritten phrase in a bubble over your owl, seen by everyone in the room), the owl
builder (your owl's kind, colours, and what it wears, its pet and its effect), the quests, the
settings (kept on the device) and Feedback. On a computer the keyboard works too: WASD or the
arrow keys walk while held, E uses whatever the owl is standing at (the gift shop, the Realm Vote,
a lantern, the fishing line), T opens Say, 1 to 8 play an emote at once, M opens the Menu, Q the
owl builder, J the quests, and Escape closes whatever is open.

Version 1 is **presence only**: owls appear, walk, change rooms, and leave. There is no typing:
owls talk in prewritten phrases (see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), section 11).
Owls also find **collectibles** around the park (wearables, pets, effects and emotes), a few
every half day: see [docs/COLLECTIBLES.md](docs/COLLECTIBLES.md).

## Run it locally

Requirements: Node 22 and pnpm 10 (`corepack enable` or `npm i -g pnpm`).

```bash
pnpm install
pnpm dev          # http://localhost:5173
```

Open the URL in two browser tabs: each tab is its own owl, and they see each other.
That zero-backend mode uses the browser's BroadcastChannel and needs no configuration.

For internet multiplayer there are two backends (see [docs/DEPLOY.md](docs/DEPLOY.md)):

```bash
pnpm dev:edge     # the authoritative room server (Cloudflare Worker + Durable Object), local, no account needed
```

or copy `apps/park/.env.example` to `apps/park/.env.local` with a Supabase project URL and anon
key to use Supabase Realtime instead (no server code, higher message cost as rooms fill).

Useful query parameters while developing:

| Parameter | Effect |
| --- | --- |
| `?debug=1` | Draw walkable areas, doors and spawn points |
| `?room=market` | Start in a given room (`hub`, `grove`, `market`) |
| `?transport=local` | Force a transport: `local` (tabs on one device), `supabase`, or `edge` (room server) |
| `?id=owl-a&look=%23C9A227,%23F6F1E3,%23FF2AA1` | Fixed id and colours (tests) |
| `?collector=e2e-a` | Fixed collection when there is no room server (tests) |

## Check it

```bash
pnpm typecheck    # TypeScript, strict
pnpm test         # unit tests: geometry, walks, protocol, transports, the room server's rules
pnpm build        # production bundle in apps/park/dist
pnpm exec playwright install chromium   # once: downloads the test browser (add --with-deps on a bare Linux box)
pnpm e2e          # Playwright: desktop + phone on the local transport, then the room server over real WebSockets
pnpm load -- --url http://localhost:8787 --bots 3 --seconds 30   # bot swarm against a running room server
```

## Layout

```
apps/park/            the browser app (Vite + TypeScript + Phaser 3)
  public/art/         original SVG art: rooms, set pieces, owl layers (swappable)
  src/game/           scenes, owl avatar, ambience, SVG loader, worn items, pets, effects, emotes
  src/collect/        the visitor's collection: room server or this device (local rules)
  src/net/            transport interface + local (tabs) + Supabase Realtime + room server
  src/ui/             HUD overlay (DOM)
  e2e/                Playwright tests (local transport, and the room server)
apps/edge/            the room server: Cloudflare Worker + Durable Object (hibernating WebSockets)
  src/Room.ts         the rules, with no platform dependency (unit-tested in Node)
  src/RoomObject.ts   the Durable Object adapter; src/index.ts the router; src/pass.ts guest passes
  src/Collections.ts  every collection, quest and feather (Durable Object, SQLite; tables in src/sqlStore.ts)
packages/shared/      protocol v1 + v4, geometry and walk maths, target resolution, room data, collectibles, quests, the shop
tools/                render-svg.mjs (rasterize art exactly as the game will), load/swarm.mjs (bot swarm)
docs/                 architecture, art pipeline, deployment
```

## Docs

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the original tap-to-move room games worked, what we replicate, and the architecture decision for v1 and beyond.
- [docs/ART-PIPELINE.md](docs/ART-PIPELINE.md): how to replace the placeholder art.
- [docs/COLLECTIBLES.md](docs/COLLECTIBLES.md): wearables, pets, effects and emotes: the catalogue, the numbers and the server.
- [docs/QUESTS.md](docs/QUESTS.md): quests, NPC owls, leaf piles, feathers, the feather shop and owl species.
- [docs/ACTIVITIES.md](docs/ACTIVITIES.md): things to do in the park: the lantern beam, the stage quiz, fishing, the robot owl's copy game and three small tasks a day.
- [docs/NESTS.md](docs/NESTS.md): every owl's own nest on the street outside the turnstiles: decorating it, the day's furniture gift, and visiting other owls' nests.
- [docs/FEEDBACK.md](docs/FEEDBACK.md): Feedback in the Menu, where notes are kept, and the keepers' page that reads them.
- [docs/DEPLOY.md](docs/DEPLOY.md): Cloudflare, GitHub Pages and Supabase setup, all on free tiers.

## Ground rules baked into the code

- Realm names stay out of this public repository; rooms use neutral ids and visitors see no realm names in the park (places are "the great tree", "the treehouse clearing", "the neon street"; the NPC owls' names are approved canon).
- The only visible text in the art is the approved closed-realm sign wording.
- Nothing a visitor types is ever sent to other visitors in v1 (there is no text input).
