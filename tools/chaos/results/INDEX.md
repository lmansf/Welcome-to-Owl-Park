# Chaos runs (OP-132)

Every run of the harness (tools/chaos/run.mjs), pass or fail, newest last. Verdicts: **held** (the
hypothesis held and the steady state came back), **failed** (it did not), **aborted** (a steady-state
check failed for more than 30 s and the rollback ran), **not started** (the steady state did not hold
before the experiment), **not runnable** (the experiment needs what this park does not have). Kept by
the doc agent; runs older than 90 days roll up to one line each.

| Started (UTC) | Experiment | Verdict | Abort | Rollback confirmed | Proposed tickets | Run |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-10-30 06:57 | 1. The room server killed mid-session | failed | no | yes | 1 | [2026-10-30-room-server-killed](2026-10-30-room-server-killed/result.md) |
| 2026-10-30 06:58 | 4. The hub filled to its cap, then one more | failed | no | yes | 1 | [2026-10-30-rooms-full](2026-10-30-rooms-full/result.md) |
| 2026-10-30 06:59 | 7. One visitor floods the room with emotes | held | no | yes | 0 | [2026-10-30-emote-flood](2026-10-30-emote-flood/result.md) |
| 2026-10-30 06:59 | 1. The room server killed mid-session | failed | no | yes | 1 | [2026-10-30-room-server-killed-2](2026-10-30-room-server-killed-2/result.md) |
| 2026-10-30 07:01 | 4. The hub filled to its cap, then one more | failed | no | yes | 1 | [2026-10-30-rooms-full-2](2026-10-30-rooms-full-2/result.md) |
| 2026-10-30 07:02 | 7. One visitor floods the room with emotes | held | no | yes | 0 | [2026-10-30-emote-flood-2](2026-10-30-emote-flood-2/result.md) |
