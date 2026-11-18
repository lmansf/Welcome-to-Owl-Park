/**
 * Calm motion (OP-375, Dec 1 plan D8): every large fade, flash, camera move and glow in the park, listed
 * in one place with how strong it is normally and how strong it is with Calm motion on. The code that
 * runs each one reads its strength from here, so the list and the park cannot drift apart, and a test
 * checks that with Calm motion on nothing listed runs at full strength.
 *
 * Calm motion is a Setting (settings.ts). A first visit from a device that asks for less motion (the
 * browser's prefers-reduced-motion) starts with it on; the visitor can still turn it off.
 *
 * Effects already calm elsewhere, kept out of the numbers here because they are simply off in calm
 * motion: the drifting room particles (ambience.ts), the Climb's camera shake and thorn flash
 * (ClimbScene.ts), the fall blink (RoomScene.fellTo), the walk's waddle and the landing dust (Owl.ts),
 * the doorway marks' bob and the barrier glow (treeView.ts), the feather trail's glints (featherTrailView.ts).
 */

/** One listed effect: what it is, and its strength normally and in calm motion, in the unit named. */
export interface MotionEffect {
  what: string;
  unit: 'ms' | 'px' | 'count' | 'share';
  full: number;
  calm: number;
}

export const MOTION = {
  /** A room comes up from dark as the owl arrives. */
  roomFadeIn: { what: 'a room fading in', unit: 'ms', full: 350, calm: 120 },
  /** An owl that came by a mover sees its room come up in half the time (movers.ts). */
  moverFadeIn: { what: 'a room fading in after a mover', unit: 'ms', full: 180, calm: 90 },
  /** The room goes dark as the owl leaves by a doorway. */
  roomFadeOut: { what: 'a room fading out', unit: 'ms', full: 220, calm: 120 },
  /** Decorating a nest: the camera glides to the spot picked. */
  nestPan: { what: 'the camera gliding to a nest spot', unit: 'ms', full: 380, calm: 0 },
  /** Worn glows that breathe in and out (aura, neon outline, shadow aura, sunbeam). */
  glowPulse: { what: 'worn glows pulsing', unit: 'share', full: 1, calm: 0 },
  /** The lightning effect's bolt flashing by the owl's head. */
  boltFlash: { what: 'a lightning bolt flashing', unit: 'share', full: 1, calm: 0 },
  /** Sparks or bits thrown out at once (lightning, glitch), per burst. */
  sparkBurst: { what: 'sparks thrown out in a burst', unit: 'count', full: 10, calm: 3 },
  /** The glitch effect jolting the whole owl sideways. */
  glitchJolt: { what: 'the glitch effect jolting the owl', unit: 'px', full: 8, calm: 0 },
  /** A burst of confetti off the owl's head. */
  confettiBurst: { what: 'a burst of confetti', unit: 'count', full: 14, calm: 5 },
  /** Stars, runes and a moon circling and bobbing round the owl's head. */
  orbit: { what: 'halos circling the owl', unit: 'share', full: 1, calm: 0 },
  /** Screens and cards sliding, fading and pulsing on the page (the HUD's CSS animations and transitions). */
  pageAnimation: { what: 'screens and cards sliding and pulsing', unit: 'ms', full: 1000, calm: 0 },
} as const satisfies Record<string, MotionEffect>;

export type MotionId = keyof typeof MOTION;

/** How strong one listed effect is, normally or in calm motion. */
export function motion(id: MotionId, calm: boolean): number {
  const e = MOTION[id];
  return calm ? e.calm : e.full;
}

/** The class the HUD carries while Calm motion is on: its screens then move little or not at all. */
export const CALM_CLASS = 'calm-motion';

/**
 * The HUD's screens in calm motion: every animation and transition over almost at once (so code that
 * waits for one to end still hears it end), nothing looping, nothing scrolling smoothly.
 */
export const CALM_CSS = `
#hud.${CALM_CLASS} *,#hud.${CALM_CLASS} *::before,#hud.${CALM_CLASS} *::after{animation-duration:.01ms !important;animation-iteration-count:1 !important;animation-delay:0s !important;transition-duration:.01ms !important;transition-delay:0s !important;scroll-behavior:auto !important}
`;

let styled = false;

/** Keeps the HUD's calm class in step with the setting. Returns a function that stops. */
export function keepHudCalm(hud: HTMLElement, calm: () => boolean, onChange: (cb: () => void) => () => void): () => void {
  if (!styled && typeof document !== 'undefined') {
    const st = document.createElement('style');
    st.textContent = CALM_CSS;
    document.head.appendChild(st);
    styled = true;
  }
  const apply = () => hud.classList.toggle(CALM_CLASS, calm());
  apply();
  return onChange(apply);
}
