# Owl Park

Owl Park is a virtual owl park you visit online. Every visitor is an owl. You wander
2D rooms by tapping where you want to go, and you see everyone else who is there right
now doing the same. This repository holds the park application.

Version 1 is **presence only**: owls appear, walk, change rooms, and leave. No chat yet.

## Run it locally

Requirements: Node 22 and pnpm 10 (`corepack enable` or `npm i -g pnpm`).

```bash
pnpm install
pnpm dev          # http://localhost:5173
```

Open the URL in two browser tabs: each tab is its own owl, and they see each other.
That zero-backend mode uses the browser's BroadcastChannel and needs no configuration.

For internet multiplayer, copy `apps/park/.env.example` to `apps/park/.env.local` and
fill in a Supabase project URL and anon key (see [docs/DEPLOY.md](docs/DEPLOY.md)).

Useful query parameters while developing:

| Parameter | Effect |
| --- | --- |
| `?debug=1` | Draw walkable areas, doors and spawn points |
| `?room=market` | Start in a given room (`hub`, `grove`, `market`) |
| `?transport=local` | Force the zero-backend transport even when Supabase is configured |
| `?id=owl-a&look=%23C9A227,%23F6F1E3,%23FF2AA1` | Fixed id and colours (tests) |

## Check it

```bash
pnpm typecheck    # TypeScript, strict
pnpm test         # unit tests (geometry, walks, both transports)
pnpm build        # production bundle in apps/park/dist
pnpm e2e          # Playwright: desktop + phone, including two owls on one device
```

## Layout

```
apps/park/            the browser app (Vite + TypeScript + Phaser 3)
  public/art/         original SVG art: rooms, set pieces, owl layers (swappable)
  src/game/           scenes, owl avatar, ambience, SVG loader
  src/net/            transport interface + local (tabs) + Supabase Realtime
  src/rooms/          room definitions: walkable polygons, doors, spawns
  src/ui/             HUD overlay (DOM)
  e2e/                Playwright tests
packages/shared/      protocol types, geometry and walk maths, room schema
tools/                render-svg.mjs: rasterize art exactly as the game will
docs/                 architecture decision record, art pipeline, deployment
```

## Docs

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the original tap-to-move room games worked, what we replicate, and the architecture decision for v1 and beyond.
- [docs/ART-PIPELINE.md](docs/ART-PIPELINE.md): how to replace the placeholder art.
- [docs/DEPLOY.md](docs/DEPLOY.md): GitHub Pages and Supabase setup, all on free tiers.

## Ground rules baked into the code

- Realm names stay out of this public repository; rooms use neutral ids and visitors see no names in the park.
- The only visible text in the art is the approved closed-realm sign wording.
- Nothing a visitor types is ever sent to other visitors in v1 (there is no text input).
