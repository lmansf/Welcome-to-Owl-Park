# 3. The store's webhook answered 500, then too late

Run `2026-10-30-webhook-dropped`, this machine: the park under wrangler dev on port 8797, the stand-in store on port 8791, 2026-10-30T08:38:34.905Z to 2026-10-30T08:39:17.774Z. Park 0d2cec6, harness 0d2cec6.

**Hypothesis.** A paid-order webhook the Worker fails (a 500, or no answer in the 5 s the store waits) is sent again by the store, and the order gets its one ticket and one claim-link email, never two.

**Verdict: held.** Abort fired: no. Rollback confirmed: yes.

**Blast radius.** Two orders in the stand-in store, and the throwaway park's answers about them; nothing else the store answers is touched.

**Rollback.** async rollback(ctx) {
    if (ctx.state.faulted) await storeFault(ctx.park, { clear: true });
  }

## What the harness saw

- As expected: order A's first delivery, the store failing: HTTP 500 {"error":"try again"} in 41 ms (08:38:56)
- As expected: order A sent again, then once more: HTTP 200 {"tickets":1,"sent":true} in 43 ms; HTTP 200 {"tickets":1,"sent":true} in 28 ms; emails 1 (08:38:56)
- As expected: order B's first delivery, the store's answer held back: no answer within 5 s (08:39:12)
- As expected: order B sent again while the first delivery was still at work, then once more: HTTP 200 {"tickets":1,"sent":true} in 3063 ms; HTTP 200 {"tickets":1,"sent":true} in 24 ms; emails 1 (08:39:12)

## The steady state through the run

![The move echo times (p95) and the failing checks](graph.svg)

| Time | Phase | Health | Latency p95 | Errors | Checkout | Journey |
| --- | --- | --- | --- | --- | --- | --- |
| 08:38:55 | before | ok (200) | ok (6 ms) | ok (0%) | ok (49 ms) | ok (1960 ms) |
| 08:39:00 | experiment | ok (200) | ok (8 ms) | ok (0%) | - | - |
| 08:39:05 | experiment | ok (200) | ok (6 ms) | ok (0%) | - | - |
| 08:39:10 | experiment | ok (200) | ok (5 ms) | ok (0%) | - | - |
| 08:39:17 | after | ok (200) | ok (6 ms) | ok (0%) | ok (27 ms) | ok (1526 ms) |

## Proposed tickets

None. (proposed-tickets.json; the QA agent reviews and files them.)
