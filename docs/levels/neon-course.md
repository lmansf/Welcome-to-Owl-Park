# The neon realm's course

- Status: BUILT FROM THE KIT, keepers only: its three rooms, the neon signs on their circuits, the live wires and the three breakers, drawn from the neon kit with no new art. Its name is still to be picked. Not built yet: a shortcut in each act, the dash-only gap, the hidden room, the secret character, the nod to another realm, and the reward (the bandana and the emote are stand-ins).
- Verified against: main 3bd77a0 (2026-11-06); every hop checked by the route check (`perchTiers`) with both flaps (the triple jump, OP-239) and the dash
- Code: `packages/shared/src/circuit.ts` (the signs and their circuits), `packages/shared/rooms/neonCourse.ts` (the rooms and the course), `apps/park/src/game/neonSigns.ts` (the signs on the page). Built on `packages/shared/src/updraft.ts` (the park-time clock the updrafts switch on), `course.ts`, `routes.ts`, `perches.ts` and `packages/shared/rooms/index.ts` (`COMMONS_OF`)
- Related: `docs/levels/README.md` (the shared rules, the physics and how to read the tables), `docs/levels/brushstroke-bridges.md` (the same build, for the ink-wash realm)

The neon realm's course, after its Commons in the hollow hall: over the rooftops of the neon city at
night, through a block where the power is out, and up the tallest roof to its antenna. Its one new
mechanic is the neon sign on a circuit: the signs are wired on two circuits that take turns, and a
sign is stood on only while it is lit.

## 1. At a glance

- **Objective:** switch on three breakers, one in each act, then reach the finish shrine on the
  tallest roof.
- **Size:** three acts, eight screens (3 + 3 + 2), in three rooms joined by doors.
- **Gold time:** 1:40, to be tried in play.
- **Down is left, up is right:** each room's way back is its left-hand door and its way on is its
  right-hand one. The shrine's roof has the rooftop door home to the neon Commons.

| Room | Act | Screens | Width | What it is |
| --- | --- | --- | ---: | --- |
| `circuit-1` | 1, The Rooftops | 1.1 to 1.3 | 4800 | One sign up to a high roof, a glide over the street, then two signs in turn; breaker 1 |
| `circuit-2` | 2, The Power Cut | 2.1 to 2.3 | 4800 | Signs between live wires over a dark block, faster circuits; breaker 2 |
| `circuit-3` | 3, The Antenna | 3.1, 3.2 | 3200 | A climb of four signs to the tallest roof; breaker 3, the shrine |

## 2. The mechanic: neon signs on circuits

- A sign is a perch of its room (`signPerches`), so the room server believes an owl standing on
  one; each page leaves out the signs that are dark as it steps its owl (`litPerches`), as it does a
  brush stone's faded ink.
- The circuits take turns by park time (the room server's clock), so every page sees the same sign
  lit. Circuit `a` is lit from the start of each turn, circuit `b` half a turn behind. On the
  rooftops (acts 1 and 3) a turn is 4 s and each circuit is lit 2.4 s, so both are lit for 0.4 s at
  each change; in the power cut (act 2) a turn is 3.2 s and each is lit 2 s.
- A sign flickers for its last 0.6 s (`SIGN_WARN_MS`), then goes dark: an owl on it falls. A dark
  sign is still drawn, dimmed, so an owl sees where it will light.
- The drops between buildings are the course's pits (the street far below, with live neon tubes
  standing in it): landing in one puts the owl back at its last bench. Live wires (`look: 'wires'`)
  hang over the dark block in act 2 and over the climb in act 3: touching them is a fall too.

## 3. The ledges, act by act

Every ledge is the room's: `x` its west end, `w` its width, `top` its height over the ground line.
The ground line is the roofs' own deck; a sign's row says which circuit it is on.

### Act 1: The Rooftops (`circuit-1`)

| Ledge | x | w | top | What it is | Reached from |
| --- | ---: | ---: | ---: | --- | --- |
| `ac1` | 300 | 200 | 120 | An air unit on the deck | the deck |
| `s1` (a) | 700 | 180 | 230 | A sign | the deck, straight up |
| `b1` | 1000 | 400 | 420 | The high roof, bench 1 | `s1` only (from the deck it is a rise of 420) |
| `bridge1` | 1900 | 240 | 300 | A footbridge over the street, lost feather 1 | a glide down off `b1` |
| `s2` (a) | 3000 | 180 | 200 | A sign | the second deck |
| `s3` (b) | 3300 | 180 | 380 | A sign | `s2` |
| `b2` | 3620 | 360 | 540 | The breaker's roof, breaker 1 | `s3` only: without either sign it is out of reach |
| `board1` | 4200 | 200 | 400 | A billboard, lost feather 2 | a glide down off `b2` |

The street from 1400 to 2700 is 1300 wide: past a level glide with the dash (1175), so the way over
is the glide down off `b1`, which only the first sign reaches.

### Act 2: The Power Cut (`circuit-2`)

| Ledge | x | w | top | What it is | Reached from |
| --- | ---: | ---: | ---: | --- | --- |
| `s4` (a) | 450 | 160 | 220 | A sign | the first deck |
| `r1` | 800 | 300 | 420 | The first dark roof, its water tank | `s4` only |
| `s5` (b) | 1350 | 160 | 470 | A sign between the wires | `r1` |
| `s6` (a) | 1750 | 160 | 500 | A sign between the wires | `s5` |
| `r2` | 2050 | 250 | 540 | The breaker's roof, breaker 2 | `s6` |
| `bridge2` | 2750 | 160 | 100 | A footbridge stub over the street, lost feather 3 | the middle deck (bench 3) |
| `s7` (a) | 2550 | 160 | 200 | A sign | the middle deck |
| `s8` (b) | 2850 | 160 | 380 | A sign | `s7` or `bridge2` |
| `r3` | 3500 | 260 | 540 | The tall roof, its satellite dish | `s8` only |
| `board2` | 4500 | 200 | 480 | A billboard, lost feather 4 | a glide down off `r3` |

Over the dark block the wires hang under the signs (up to 420) and above them (from 680): a single
jump between the signs passes, a jump with the flap meets the wires above, and a glide off `r1`
from as high as the wires above let it, even with the dash, meets the wires below before it is past
them. The route check does not count hazards in the air, so the test checks that line itself.

### Act 3: The Antenna (`circuit-3`)

| Ledge | x | w | top | What it is | Reached from |
| --- | ---: | ---: | ---: | --- | --- |
| `s9` (a) | 500 | 160 | 180 | A sign | the deck |
| `m1` | 800 | 200 | 380 | A roof, breaker 3 | `s9` only |
| `board3` | 1500 | 200 | 260 | A billboard, lost feather 5 | a glide down off `m1` |
| `s10` (b), `s11` (a), `s12` (b) | 1250, 1600, 1950 | 160 | 470, 520, 540 | Signs up to the mast | each from the one before |
| `m2` | 2250 | 120 | 540 | The mast's roof | `s12` |
| `summit` | 2600 | 600 | 540 | The tallest roof: the shrine and the door home | `m2` |

Sparks off the antenna's guy wires fill the air from 700 up over the climb, so the signs are taken
one at a time and not glided past.

## 4. The scenes

- Act 1: a vending machine hums by the rooftop door back to the Commons; a pigeon coop on the high
  roof watches the signs blink; a noodle stall keeps its lanterns lit on its own battery by the door
  to the dark block.
- Act 2: the water tank's little lantern is the only light left on the first dark roof; a satellite
  dish on the tall roof still points at the sky.
- Act 3: the antenna on the tallest roof blinks red over the shrine, by the rooftop door home.

## 5. The art

All from the neon kit: the signs (`kit-neon-sign-platform`, drawn lit or dark by the page), the
roofs' parapets, the footbridges, billboards and air units, the doors, the bench, the lost feather
and the shrine. The kit has no breaker yet, so the page draws the breakers in plain shapes. The
roofs are clad in silvered planks and the decks edged in stone, so the walkway reads lighter than the
night behind it (`tools/kit/preview.py --check` passes every screen).
