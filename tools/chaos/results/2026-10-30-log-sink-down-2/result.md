# 8. The collection log’s database unreachable

Run `2026-10-30-log-sink-down-2`, this machine: the park under wrangler dev on port 8797, the stand-in store on port 8791, 2026-10-30T08:44:11.105Z to 2026-10-30T08:45:20.310Z. Park 0d2cec6, harness 0d2cec6.

**Hypothesis.** With the collection log down, new owls still get their starter pack at once, and its rows wait in the outbox and reach the log once it is back, each once (OP-107).

**Verdict: held.** Abort fired: no. Rollback confirmed: yes.

**Blast radius.** The throwaway park's collection log only (sent to the stand-in store in place of the log function), and five new scripted visitors.

**Rollback.** async rollback(ctx) {
    if (ctx.state.down) await storeFault(ctx.park, { clear: true });
    await Promise.all((ctx.state.newcomers ?? []).map((v) => v.leave()));
  }

## What the harness saw

- As expected: new owls in with their starter pack while the log was down: 5 of 5 played their first emote (08:44:32)
- As expected: the log while it was down: 11 sends refused, 0 starter rows taken (08:44:50)
- As expected: the starter-pack rows once the log was back: 20 new owls' rows taken (at least the 15 of their starter packs), 24 s after it came back; 0 rows sent twice (08:45:14)

## The steady state through the run

![The move echo times (p95) and the failing checks](graph.svg)

| Time | Phase | Health | Latency p95 | Errors | Checkout | Journey |
| --- | --- | --- | --- | --- | --- | --- |
| 08:44:30 | before | ok (200) | ok (7 ms) | ok (0%) | ok (51 ms) | ok (1964 ms) |
| 08:44:35 | experiment | ok (200) | ok (15 ms) | ok (0%) | - | - |
| 08:44:40 | experiment | ok (200) | ok (7 ms) | ok (0%) | - | - |
| 08:44:45 | experiment | ok (200) | ok (8 ms) | ok (0%) | - | - |
| 08:44:50 | experiment | ok (200) | ok (7 ms) | ok (0%) | - | - |
| 08:44:55 | experiment | ok (200) | ok (6 ms) | ok (0%) | - | - |
| 08:45:00 | experiment | - | - | - | ok (37 ms) | - |
| 08:45:00 | experiment | ok (200) | ok (6 ms) | ok (0%) | - | - |
| 08:45:05 | experiment | ok (200) | ok (5 ms) | ok (0%) | - | - |
| 08:45:10 | experiment | ok (200) | ok (9 ms) | ok (0%) | - | - |
| 08:45:20 | after | ok (200) | ok (9 ms) | ok (0%) | ok (31 ms) | ok (1691 ms) |

## Proposed tickets

None. (proposed-tickets.json; the QA agent reviews and files them.)
