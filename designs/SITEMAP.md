# Design documents

Design documents written with the Elephant-Goldfish Model (`CLAUDE.md`, the EGM section). Each is
drafted from a Goldfish-reviewed brief, reviewed by the Goldfish swarm, and then reviewed by a human
before anything is built against it. Realm working names, other games and the owner's details stay
out of these files as they do everywhere in this public repository.

| Design | Date | Author | Components | Description |
| --- | --- | --- | --- | --- |
| [The stained-glass climb](the-stained-glass-climb.md) | 2026-10-26 | the owner, with Claude Code | `packages/shared` (climb, climbbook, edge, parktime, rooms), `apps/edge` (Collections, RoomObject, Overflow, index), `apps/park` (ClimbScene, climbScreen, RoomScene, hud) | A third realm: a shared stained-glass room off a hub arch, and inside it a portal to a solo platformer climb on the arcade's run model, with a park moon setting the night and the overflow object's `realms` setting to open it; revised after the Goldfish review |
