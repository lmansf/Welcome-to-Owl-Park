# 5. One phone on a 3G network

Run `2026-10-30-slow-phone`, this machine: the park under wrangler dev on port 8797, the stand-in store on port 8791, 2026-10-30T08:39:19.643Z to 2026-10-30T08:39:58.618Z. Park 0d2cec6, harness 0d2cec6.

**Hypothesis.** A phone on 3G comes into the hub and can play (its owl walks, the others are there), and the load screen's bar shows the bytes as they come: it only grows, in steps, while the park loads (OP-129).

**Verdict: held.** Abort fired: no. Rollback confirmed: yes.

**Blast radius.** One scripted phone page in the throwaway park, its network and processor slowed.

**Rollback.** async rollback(ctx) {
    await ctx.state.context?.close();
  }

## What the harness saw

- As expected: a phone on 3G into the hub by address: online in 12.5 s (08:39:51)
- As expected: the load screen's bar while the phone loaded: 15 steps between empty and full, 0 back, up to 100%, up 9.6 s (08:39:51)
- As expected: the phone on 3G at play: its owl walked where it was told, 10 other owls in view of the room (08:39:52)

## The steady state through the run

![The move echo times (p95) and the failing checks](graph.svg)

| Time | Phase | Health | Latency p95 | Errors | Checkout | Journey |
| --- | --- | --- | --- | --- | --- | --- |
| 08:39:38 | before | ok (200) | ok (7 ms) | ok (0%) | ok (56 ms) | ok (1556 ms) |
| 08:39:43 | experiment | ok (200) | ok (9 ms) | ok (0%) | - | - |
| 08:39:48 | experiment | ok (200) | ok (9 ms) | ok (0%) | - | - |
| 08:39:58 | after | ok (200) | ok (11 ms) | ok (0%) | ok (72 ms) | ok (1861 ms) |

## Proposed tickets

None. (proposed-tickets.json; the QA agent reviews and files them.)
