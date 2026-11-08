import { describe, expect, it } from 'vitest';
import { ROOM_H } from '@owl-park/shared';
import { ROOMS } from '../rooms';
import { cameraBounds, coveredBy, followLead } from './hudInset';

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
});
