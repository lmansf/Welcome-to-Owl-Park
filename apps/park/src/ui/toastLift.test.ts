import { describe, expect, it } from 'vitest';
import { TOAST_GAP, toastLift, type Box } from './toastLift';

const box = (left: number, top: number, w: number, h: number): Box => ({ left, right: left + w, top, bottom: top + h });

describe('the tips kept clear of the chips at the screen’s edge (OP-415)', () => {
  // A computer at 1440 x 813: the tips' column 520 wide at the bottom middle, one tip 40 high, 76 px up.
  const column = box(460, 813 - 76 - 40, 520, 40);

  it('lifts the warm air’s tip above the arcade’s chip on the bottom edge', () => {
    // The chip pointing down at the hatch, as the Great Hollow's chips stand: 44 high, its middle 84 up.
    const chip = box(560, 813 - 84 - 22, 300, 44);
    const lift = toastLift(column, [chip]);
    expect(lift).toBeGreaterThan(0);
    const tip = { ...column, top: column.top - lift, bottom: column.bottom - lift };
    expect(tip.bottom).toBeLessThanOrEqual(chip.top - TOAST_GAP);
  });

  it('leaves the tips where they are with no chip under them, or the chips off to the side', () => {
    expect(toastLift(column, [])).toBe(0);
    expect(toastLift(column, [box(20, 700, 200, 44), box(1220, 700, 200, 44), box(560, 100, 300, 44)])).toBe(0);
  });

  it('goes up past two chips stacked over each other, and no higher than the top of the screen', () => {
    const low = box(600, 700, 260, 44);
    const high = box(640, 650, 260, 44);
    const lift = toastLift(column, [low, high]);
    expect(column.bottom - lift).toBeLessThanOrEqual(high.top - TOAST_GAP);
    const tall = box(460, 400, 520, 360);
    expect(toastLift(tall, [box(600, 300, 260, 44), box(600, 700, 260, 44)], 60)).toBe(400 - 60);
  });

  it('lifts nothing for an empty column', () => {
    expect(toastLift(box(460, 737, 520, 0), [box(560, 707, 300, 44)])).toBe(0);
  });
});
