# 7. One visitor floods the room with emotes

Run `2026-10-30-emote-flood-2`, this machine: the park under wrangler dev on port 8797, the stand-in store on port 8791, 2026-10-30T07:02:06.236Z to 2026-10-30T07:02:46.848Z. Park b9daa6a, harness b9daa6a.

**Hypothesis.** A visitor sending 50 emotes a second is throttled (its extra emotes dropped, then its socket closed), and nobody else in the room lags or loses a move (OP-089).

**Verdict: held.** Abort fired: no. Rollback confirmed: yes.

**Blast radius.** One extra scripted visitor in the throwaway park's hub, flooding for 10 s at most.

**Rollback.** async rollback(ctx) {
    await ctx.state.flooder?.leave();
  }

## What the harness saw

- As expected: the flood's emotes the others saw played: 1 of 41 sent over 838 ms (07:02:41)
- As expected: the flooding socket closed by the room: after 838 ms and 41 emotes: code 4003 (too many frames) (07:02:41)
- As expected: the others' move echo p95 from the flood's start: 7 ms (75 moves) (07:02:41)
- As expected: moves the others lost from the flood's start: 0 of 75 (07:02:41)

## The steady state through the run

![The move echo times (p95) and the failing checks](graph.svg)

| Time | Phase | Health | Latency p95 | Errors | Checkout | Journey |
| --- | --- | --- | --- | --- | --- | --- |
| 07:02:26 | before | ok (200) | ok (14 ms) | ok (0%) | ok (47 ms) | ok (1348 ms) |
| 07:02:31 | experiment | ok (200) | ok (6 ms) | ok (0%) | - | - |
| 07:02:36 | experiment | ok (200) | ok (7 ms) | ok (0%) | - | - |
| 07:02:41 | experiment | ok (200) | ok (6 ms) | ok (0%) | - | - |
| 07:02:46 | after | ok (200) | ok (7 ms) | ok (0%) | ok (31 ms) | ok (1156 ms) |

## Proposed tickets

None. (proposed-tickets.json; the QA agent reviews and files them.)
