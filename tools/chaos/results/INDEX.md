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
| 2026-10-30 08:38 | 3. The store's webhook answered 500, then too late | held | no | yes | 0 | [2026-10-30-webhook-dropped](2026-10-30-webhook-dropped/result.md) |
| 2026-10-30 08:39 | 5. One phone on a 3G network | held | no | yes | 0 | [2026-10-30-slow-phone](2026-10-30-slow-phone/result.md) |
| 2026-10-30 08:40 | 6. A visitor's clock 10 minutes fast | held | no | yes | 0 | [2026-10-30-clock-skew](2026-10-30-clock-skew/result.md) |
| 2026-10-30 08:40 | 8. The collection log’s database unreachable | held | no | yes | 0 | [2026-10-30-log-sink-down](2026-10-30-log-sink-down/result.md) |
| 2026-10-30 08:41 | 3. The store's webhook answered 500, then too late | held | no | yes | 0 | [2026-10-30-webhook-dropped-2](2026-10-30-webhook-dropped-2/result.md) |
| 2026-10-30 08:42 | 5. One phone on a 3G network | held | no | yes | 0 | [2026-10-30-slow-phone-2](2026-10-30-slow-phone-2/result.md) |
| 2026-10-30 08:43 | 6. A visitor's clock 10 minutes fast | held | no | yes | 0 | [2026-10-30-clock-skew-2](2026-10-30-clock-skew-2/result.md) |
| 2026-10-30 08:44 | 8. The collection log’s database unreachable | held | no | yes | 0 | [2026-10-30-log-sink-down-2](2026-10-30-log-sink-down-2/result.md) |
