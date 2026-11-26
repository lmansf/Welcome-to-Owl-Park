import { NEST_WORDS, doorTarget, rectCenter, type DoorDef } from '@owl-park/shared';
import { describe, expect, it } from 'vitest';
import { NEST_ROOM, ROOMS } from '../rooms';
import { DOOR_PROMPT_PX, doorPromptAt } from './doorPrompt';

/**
 * A way out a new owl must find is offered where it stands near it (the Nov 25 QA walk): at the nest's
 * door the action button said Decorate, and the course gates in the treehouse clearing and the ink garden
 * had no words and no prompt.
 */
const door = (room: { doors: readonly DoorDef[] }, id: string) => room.doors.find((d) => d.id === id)!;
/** A step out in front of a doorway, on its room's floor. */
const inFront = (d: DoorDef) => ({ x: rectCenter(d.rect).x, y: d.rect.y + d.rect.h + 30 });

describe('doorways with words of their own', () => {
  it('offers the nest’s way out, To the park, at its door, and nothing from the mirror across the room', () => {
    const out = door(NEST_ROOM, 'to-street');
    expect(out.prompt).toBe(NEST_WORDS.toPark);
    expect(doorPromptAt(NEST_ROOM.doors, inFront(out))?.id).toBe('to-street');
    expect(doorPromptAt(NEST_ROOM.doors, NEST_ROOM.spawns['mirror']!)).toBeNull();
  });

  it('signs and offers the ink garden’s moon gate, the way on to Brushstroke Bridges', () => {
    const ink = ROOMS['ink']!;
    const gate = door(ink, 'to-course');
    expect(gate.label).toMatch(/Brushstroke Bridges/);
    expect(gate.prompt).toMatch(/Brushstroke Bridges/);
    expect(doorPromptAt(ink.doors, inFront(gate))?.id).toBe('to-course');
    expect(doorPromptAt(ink.doors, ink.spawns['default']!)).toBeNull();
  });

  it('gives the treehouse clearing a signed way on to Updraft Canopy on the new map, offered at its foot', () => {
    const grove = ROOMS['grove']!;
    const path = door(grove, 'to-course');
    expect(doorTarget(path, 3)).toEqual({ room: 'canopy-1', spawn: 'from-gate' });
    expect(path.label).toMatch(/Updraft Canopy/);
    expect(path.prompt).toMatch(/Updraft Canopy/);
    expect(doorPromptAt(grove.doors, inFront(path))?.id).toBe('to-course');
    expect(doorPromptAt(grove.doors, grove.spawns['default']!)).toBeNull();
  });

  it('leaves out a doorway the caller skips (the one the owl just came in by), and any further than its reach', () => {
    const out = door(NEST_ROOM, 'to-street');
    expect(doorPromptAt(NEST_ROOM.doors, inFront(out), (d) => d.id === 'to-street')).toBeNull();
    const far = { x: out.rect.x + out.rect.w + DOOR_PROMPT_PX + 1, y: out.rect.y };
    expect(doorPromptAt(NEST_ROOM.doors, far)).toBeNull();
  });
});
