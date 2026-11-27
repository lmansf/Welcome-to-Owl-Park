import { describe, expect, it } from 'vitest';
import { LANE_SPEED, ROOM_H, WALK_SPEED } from '@owl-park/shared';
import { ROOMS } from '../rooms';
import { ESCAPE_DOOR, interactablesIn } from '@owl-park/shared';
import { FOLLOW_EASE, cameraBounds, coveredBy, followEaseAt, followLead, keptAbove, rowAcross } from './hudInset';
import { restAt, townZoom } from './townView';

describe('the HUD safe area (OP-278)', () => {
  it('a side-view room lets the camera scroll past its top and bottom by what the HUD covers', () => {
    // The hollow hall at 1440x900 (zoom 0.9, pixel ratio 1): Menu, Emotes and Say 64 px up, the owl count 50 px down.
    const b = cameraBounds({ w: 1600, h: 4800 }, { top: 50, bottom: 64 }, 1 / 0.9);
    expect(b.x).toBe(0);
    expect(b.w).toBe(1600);
    expect(b.y).toBeCloseTo(-50 / 0.9);
    expect(b.y + b.h).toBeCloseTo(4800 + 64 / 0.9);
  });

  it('a room seen from above scrolls past its bottom too, so a leaf pile on the floor comes out from under Menu (OP-292)', () => {
    // The Party Grove at 1440x813 (zoom 813/900): its floor runs to y 900, the bottom of the screen.
    const zoom = 813 / 900;
    const b = cameraBounds({ w: 4800, h: 900 }, { top: 46, bottom: 64 }, 1 / zoom);
    expect(b.y + b.h).toBeCloseTo(900 + 64 / zoom);
    // A pile at y 820 can be brought above the HUD's band.
    const lowest = b.y + b.h - 813 / zoom; // the camera's lowest scroll
    expect((820 - lowest) * zoom).toBeLessThan(813 - 64);
  });

  it('nothing covered, or no sensible scale, leaves the room as it is', () => {
    expect(cameraBounds({ w: 1600, h: 4800 }, { top: 0, bottom: 0 }, 1)).toEqual({ x: 0, y: -0, w: 1600, h: 4800 });
    expect(cameraBounds({ w: 1600, h: 4800 }, { top: 50, bottom: 64 }, 0)).toEqual({ x: 0, y: 0, w: 1600, h: 4800 });
  });

  it('measures the top from boxes in the top half and the bottom from boxes in the bottom half', () => {
    const h = 900;
    const edges = coveredBy(
      [
        { top: 10, bottom: 46, width: 120, height: 36 }, // the owl count
        { top: 836, bottom: 888, width: 110, height: 52 }, // Menu
        { top: 830, bottom: 882, width: 52, height: 52 }, // Say, a little taller
        { top: 0, bottom: 0, width: 0, height: 0 }, // a hidden control
      ],
      h,
    );
    expect(edges).toEqual({ top: 46, bottom: 70 });
  });

  it('neither edge takes more than a quarter of the screen', () => {
    expect(coveredBy([{ top: 300, bottom: 400, width: 50, height: 100 }], 400)).toEqual({ top: 0, bottom: 100 });
  });
});

describe('a screen narrower than it is tall: the room’s front edge above Menu, Emotes and Say (OP-496)', () => {
  // A computer's window at 360x740 and the owner's 500x860 (pixel ratio 1): Menu, Emotes and Say make a row 64 px
  // up from the foot of the screen, and 124 px once it wraps onto two lines as an action button joins it.
  const screens = [
    { w: 360, h: 740 },
    { w: 500, h: 860 },
  ];
  /** Where a room point `y` is on the screen (CSS px down from its top) with the owl at `owlY`, the camera at rest. */
  function screenY(room: { size: { w: number; h: number } }, screen: { w: number; h: number }, row: number, owlY: number, y: number, frontUp = true): number {
    const zoom = townZoom(room.size, screen, 1);
    const view = { w: screen.w / zoom, h: screen.h / zoom };
    const b = cameraBounds(room.size, { top: 0, bottom: row }, 1 / zoom, frontUp ? { viewH: view.h } : undefined);
    // The plaza's camera centres above the owl (followLead); the bounds hold it.
    const at = restAt({ x: room.size.w / 2, y: owlY - followLead(room.size.h, false, view.h, ROOM_H) }, view, b);
    return (y - (at.y - view.h / 2)) * zoom;
  }

  it('is what a screen narrower than it is tall has; a computer held wide, or a phone on its side, has none', () => {
    expect(rowAcross({ w: 360, h: 740 })).toBe(true);
    expect(rowAcross({ w: 500, h: 860 })).toBe(true);
    expect(rowAcross({ w: 1280, h: 800 })).toBe(false);
    expect(rowAcross({ w: 915, h: 412 })).toBe(false);
  });

  it.each(screens)('in the clearing at $w wide, the sealed hollow’s doorway and an owl at it stand above the row, wrapped or not, wherever the owl is', (screen) => {
    const grove = ROOMS[ESCAPE_DOOR.room]!;
    const foot = ESCAPE_DOOR.rect.y + ESCAPE_DOOR.rect.h;
    for (const row of [64, 124]) {
      const top = screen.h - row;
      // The owl anywhere from the back of the clearing's floor to its front edge.
      for (const owlY of [ROOM_H, 1000, ESCAPE_DOOR.at.y, grove.size.h - 15]) {
        expect(screenY(grove, screen, row, owlY, foot), `doorway's foot, row ${row}, owl at ${owlY}`).toBeLessThanOrEqual(top);
        expect(screenY(grove, screen, row, owlY, grove.size.h), `front edge, row ${row}, owl at ${owlY}`).toBeCloseTo(top, 5);
      }
      expect(screenY(grove, screen, row, ESCAPE_DOOR.at.y, ESCAPE_DOOR.at.y), `owl at the doorway, row ${row}`).toBeLessThan(top - 30);
    }
  });

  it.each(screens)('on the neon street at $w wide, every leaf pile stands above the row, wherever the owl is', (screen) => {
    const market = ROOMS['market']!;
    const piles = interactablesIn('market').filter((d) => d.kind === 'leaf-pile');
    expect(piles.length).toBeGreaterThan(0);
    for (const row of [64, 124]) {
      for (const owlY of [ROOM_H, 1100, market.size.h - 15]) {
        for (const p of piles) expect(screenY(market, screen, row, owlY, p.pos.y + 4), `${p.id}, row ${row}, owl at ${owlY}`).toBeLessThanOrEqual(screen.h - row);
      }
    }
  });

  it('the bug before: with only room to scroll, the clearing’s front lay under the row while the owl stood up the clearing', () => {
    const grove = ROOMS['grove']!;
    const screen = { w: 360, h: 740 };
    expect(screenY(grove, screen, 64, ROOM_H, ESCAPE_DOOR.rect.y + ESCAPE_DOOR.rect.h, false)).toBeGreaterThan(screen.h - 64);
  });

  it('hides no more of the back wall than the row is deep, and holds the view still up and down', () => {
    const size = { w: 4800, h: 1250 };
    const zoom = 740 / 1250;
    const viewH = 740 / zoom;
    const b = cameraBounds(size, { top: 0, bottom: 64 }, 1 / zoom, { viewH });
    expect(b.h).toBeCloseTo(viewH);
    expect(b.y).toBeCloseTo(64 / zoom);
    expect(b.y + b.h).toBeCloseTo(size.h + 64 / zoom);
    expect(b.x).toBe(0);
    expect(b.w).toBe(size.w);
  });

  it('leaves alone a room deeper than the view (it scrolls), and a screen with nothing along its foot (a phone)', () => {
    // The Great Hollow at 360x740: deeper than the town view shows.
    const hall = ROOMS['m3-hall']!;
    const zoom = townZoom(hall.size, { w: 360, h: 740 }, 1);
    const viewH = 740 / zoom;
    expect(viewH).toBeLessThan(hall.size.h);
    expect(cameraBounds(hall.size, { top: 0, bottom: 64 }, 1 / zoom, { viewH })).toEqual(cameraBounds(hall.size, { top: 0, bottom: 64 }, 1 / zoom));
    // A phone: Menu and Say up top, nothing covered along the foot.
    const size = { w: 4800, h: 1250 };
    expect(cameraBounds(size, { top: 0, bottom: 0 }, 1, { viewH: 1250 })).toEqual(cameraBounds(size, { top: 0, bottom: 0 }, 1));
  });

  it('the prompt at an owl’s feet on the floor’s front edge rises to end above the row, and is left where it is when it clears it', () => {
    expect(keptAbove(1240, 40, 1250)).toBe(1210);
    expect(keptAbove(1100, 40, 1250)).toBe(1100);
    expect(keptAbove(1240, 40, null)).toBe(1240);
  });
});

describe('the camera in a room taller than a screen (a plaza, Nov 8)', () => {
  it('centres above the owl, so a guardian painted along the back stays in view at its idol', () => {
    const market = ROOMS['market']!;
    expect(market.size.h).toBeGreaterThan(ROOM_H);
    const idol = market.doors.find((d) => d.id === 'idol')!;
    const owl = { y: idol.rect.y + idol.rect.h / 2 };
    const lead = followLead(market.size.h, false, ROOM_H, ROOM_H);
    const top = Math.max(0, owl.y - lead - ROOM_H / 2);
    // The robot owl's chest, painted at y 270 above the stall's idol spot, with room to spare for its head.
    expect(top).toBeLessThan(270 - 80);
    // And the owl itself stays well on screen, clear of the HUD along the bottom.
    expect(owl.y - top).toBeLessThan(ROOM_H * 0.8);
  });

  it('centres on the owl in a room one screen tall, and in a room seen from the side', () => {
    expect(followLead(ROOM_H, false, ROOM_H, ROOM_H)).toBe(0);
    expect(followLead(4800, true, ROOM_H, ROOM_H)).toBe(0);
  });

  it('centres on the owl in the Great Hollow, an oval with ways all round it: its owls come in at the back and most of what a newcomer is led to is on its front rim (OP-396)', () => {
    const hall = ROOMS['m3-hall']!;
    expect(hall.bowl).toBeDefined();
    expect(hall.size.h).toBeGreaterThan(ROOM_H);
    expect(followLead(hall.size.h, false, 1500, ROOM_H, true)).toBe(0);
    // The rule's own reason, held to the room: the knothole an owl comes in by is in the back half, and of the
    // ways to somewhere to play (the arcade's hatch and the courses) more are in the front half than the back.
    const midY = hall.size.h / 2;
    const at = (id: string) => {
      const d = hall.doors.find((door) => door.id === id)!;
      return d.rect.y + d.rect.h / 2;
    };
    expect(at('up')).toBeLessThan(midY);
    const play = hall.doors.filter((d) => d.id === 'down' || d.id.startsWith('course-')).map((d) => d.rect.y + d.rect.h / 2);
    expect(play.length).toBeGreaterThanOrEqual(3);
    expect(play.filter((y) => y > midY).length).toBeGreaterThan(play.filter((y) => y <= midY).length);
    // A plaza keeps its lead.
    expect(followLead(ROOMS['market']!.size.h, false, ROOM_H, ROOM_H)).toBeGreaterThan(0);
  });

  it('eases to a carried owl by the share that keeps it where a walking owl is in the view (OP-287)', () => {
    // How far ahead of the middle of the view the follow leaves an owl, in frames of its own going.
    const ahead = (pace: number, share: number) => (pace * (1 - share)) / share;
    expect(followEaseAt(WALK_SPEED)).toBeCloseTo(FOLLOW_EASE, 12);
    const lane = followEaseAt(LANE_SPEED);
    expect(lane).toBeCloseTo(3 / 14, 12);
    expect(ahead(LANE_SPEED, lane)).toBeCloseTo(ahead(WALK_SPEED, FOLLOW_EASE), 6);
    // At the walk's share the carried owl would be twice as far ahead.
    expect(ahead(LANE_SPEED, FOLLOW_EASE)).toBeCloseTo(2 * ahead(WALK_SPEED, FOLLOW_EASE), 6);
    // The faster the owl the nearer the camera keeps to it, and never past it.
    expect(followEaseAt(LANE_SPEED * 4)).toBeGreaterThan(lane);
    expect(followEaseAt(LANE_SPEED * 4)).toBeLessThan(1);
  });
});
