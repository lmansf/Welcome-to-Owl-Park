---
name: owl-park-elephant
description: Loads Owl Park's project context (the docs map, the architecture, the rules for this public repository) before an EGM brainstorm, draft, review or bootstrap. Use at the start of any design or spec work on the park.
---

# Owl Park: the Elephant's context loader

Read these before drafting or reviewing anything, in this order:

1. `CLAUDE.md` (repository root): the monorepo layout, the checks before a push, the art rules, and
   what stays out of this public repository. It also sets `EGM artifact directory: EGM`.
2. `docs/README.md`: the map of the docs, how they are written (header block, markers, names),
   and which file answers which question. `docs/` is the doc agent's; Claude Code does not edit it.
3. `docs/ARCHITECTURE.md` section 0, then the section for the area the design touches.
4. `docs/GLOSSARY.md` for any term the code or the board uses.

The code, by package:

- `apps/park`: the Vite + Phaser client.
- `packages/shared`: the wire protocol, geometry and room data (`packages/shared/rooms/index.ts`
  holds `CLOSED_SIGNS`, the only words a closed realm's blockade may show).
- `apps/edge`: the Cloudflare Worker, both Durable Objects and `wrangler.jsonc`.
- `apps/park-log`: the collection log's Supabase Edge Function (its own README).
- `tools/art`: the art pipeline (`tools/art/README.md`, `docs/ART-PIPELINE.md`).

Verification: `pnpm check` (typecheck, unit tests, build) and `pnpm e2e` (Playwright).

Rules that bind every EGM artifact for this project:

- Rooms are named by their ids (`hub`, `grove`, `market`, `lobby`, `homes`, `arcade`, `nest-<id>`)
  or public descriptions, never by realm names. No other game is named. The owner's details stay out.
- A brief or draft under `EGM/` may discuss unreleased work; a design doc that is committed may not.
- Design docs default to `docs/designs/<feature>.md` in EGM; confirm the folder with the owner before
  the first one is written, because `docs/` belongs to the doc agent.
- The bootstrap READMEs, once generated, are the directory-level map: start from the root
  `README.md` and follow its links down.
