import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CALM_CLASS, CALM_CSS, MOTION, keepHudCalm, motion, type MotionId } from './calmMotion';
import { MOVER_FADE_IN_MS } from './game/movers';
import { defaultSettings, parseSettings } from './settings';

const ids = Object.keys(MOTION) as MotionId[];

/** The park's own code (tests and this list left out), as text. */
function parkCode(dir = fileURLToPath(new URL('.', import.meta.url))): string {
  let out = '';
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out += parkCode(p);
    else if (name.endsWith('.ts') && !name.endsWith('.test.ts') && name !== 'calmMotion.ts') out += readFileSync(p, 'utf8');
  }
  return out;
}

describe('calm motion (OP-375, D8)', () => {
  it('with Calm motion on, no listed effect runs at full strength', () => {
    for (const id of ids) {
      expect(motion(id, true), id).toBeLessThan(motion(id, false));
      expect(motion(id, true), id).toBeGreaterThanOrEqual(0);
    }
  });

  it('with it off, every effect is as it was before calm motion covered it', () => {
    expect(motion('roomFadeIn', false)).toBe(350);
    expect(motion('roomFadeOut', false)).toBe(220);
    expect(motion('moverFadeIn', false)).toBe(MOVER_FADE_IN_MS);
    expect(motion('nestPan', false)).toBe(380);
    expect(motion('glitchJolt', false)).toBe(8);
    expect(motion('confettiBurst', false)).toBe(14);
  });

  it('flashes, jolts, glides and glows are off altogether, not only softer', () => {
    for (const id of ['boltFlash', 'glitchJolt', 'nestPan', 'glowPulse', 'orbit', 'pageAnimation'] as const) expect(motion(id, true), id).toBe(0);
  });

  it('every listed effect is read by the code that runs it, so the list and the park stay one', () => {
    const code = parkCode();
    for (const id of ids) {
      if (id === 'pageAnimation') continue; // the HUD's CSS below
      expect(code.includes(`'${id}'`) || code.includes(`MOTION.${id}`), id).toBe(true);
    }
  });

  it("the HUD's screens in calm motion: every animation and transition over at once, nothing looping", () => {
    expect(CALM_CSS).toContain(`#hud.${CALM_CLASS} *`);
    expect(CALM_CSS).toMatch(/animation-duration:\.01ms !important/);
    expect(CALM_CSS).toMatch(/animation-iteration-count:1 !important/);
    expect(CALM_CSS).toMatch(/transition-duration:\.01ms !important/);
  });

  it("the HUD carries the calm class while the setting is on, and drops it when it is turned off", () => {
    const classes = new Set<string>();
    const hud = { classList: { toggle: (c: string, on: boolean) => (on ? classes.add(c) : classes.delete(c)) } } as unknown as HTMLElement;
    let calm = true;
    let changed: (() => void) | null = null;
    const stop = keepHudCalm(hud, () => calm, (cb) => ((changed = cb), () => (changed = null)));
    expect(classes.has(CALM_CLASS)).toBe(true);
    calm = false;
    changed!();
    expect(classes.has(CALM_CLASS)).toBe(false);
    stop();
    expect(changed).toBeNull();
  });

  it("a first visit from a device that asks for less motion starts with Calm motion on, and the visitor's own choice stands", () => {
    expect(defaultSettings(true).calm).toBe(true);
    expect(defaultSettings(false).calm).toBe(false);
    expect(parseSettings(null, true).calm).toBe(true);
    expect(parseSettings(JSON.stringify({ calm: false }), true).calm).toBe(false);
  });
});
