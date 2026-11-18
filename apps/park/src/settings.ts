/**
 * The visitor's settings, kept on this device only (localStorage): what the screen shows and how much
 * of the park moves on its own. Nothing here goes to the park's server.
 */
export interface Settings {
  /** The thumbstick on touch screens; without it the owl walks where the floor is tapped. */
  thumbstick: boolean;
  /** Calm motion: no drifting fireflies, gold dust or neon rain. On by default when the device asks for less motion. */
  calm: boolean;
  /** "Show what owls say": the bubbles of prewritten phrases over the owls. */
  bubbles: boolean;
  /** The park's sounds (the Menu's knock on wood, OP-108). On by default; off mutes them all. */
  sound: boolean;
  /** The feather trail (OP-307): feathers toward a doorway not tried yet, and a glint on each such doorway. On by default. */
  trail: boolean;
  /** Text size (OP-386): the HUD, the Menu and every panel drawn this much larger, in percent. Pinch zoom stays off (OP-104). */
  text: TextSize;
}

/** The text sizes offered: as made, half again, and twice. */
export const TEXT_SIZES = [100, 150, 200] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

function isTextSize(v: unknown): v is TextSize {
  return typeof v === 'number' && (TEXT_SIZES as readonly number[]).includes(v);
}

/** The settings that are on or off. */
type Switch = Exclude<keyof Settings, 'text'>;
const SWITCHES: readonly Switch[] = ['thumbstick', 'calm', 'bubbles', 'sound', 'trail'];

export const SETTINGS_KEY = 'owl-park:settings';

export function defaultSettings(reducedMotion: boolean): Settings {
  return { thumbstick: true, calm: reducedMotion, bubbles: true, sound: true, trail: true, text: 100 };
}

/** Settings from what storage holds: each switch a boolean and the text size one of TEXT_SIZES, else its default. Anything else is dropped. */
export function parseSettings(raw: string | null, reducedMotion: boolean): Settings {
  const out = defaultSettings(reducedMotion);
  let v: unknown = null;
  try {
    v = raw ? JSON.parse(raw) : null;
  } catch {
    v = null;
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  const o = v as Record<string, unknown>;
  for (const k of SWITCHES) if (typeof o[k] === 'boolean') out[k] = o[k];
  if (isTextSize(o['text'])) out.text = o['text'];
  return out;
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;

export class SettingsStore {
  private value: Settings;
  private readonly listeners = new Set<(s: Settings) => void>();

  constructor(
    private readonly storage: Store | null,
    reducedMotion: boolean,
  ) {
    let raw: string | null = null;
    try {
      raw = storage?.getItem(SETTINGS_KEY) ?? null;
    } catch {
      raw = null;
    }
    this.value = parseSettings(raw, reducedMotion);
  }

  get(): Settings {
    return { ...this.value };
  }

  set(patch: Partial<Settings>): void {
    const next = { ...this.value };
    for (const k of SWITCHES) if (typeof patch[k] === 'boolean') next[k] = patch[k];
    if (isTextSize(patch.text)) next.text = patch.text;
    if ((Object.keys(next) as Array<keyof Settings>).every((k) => next[k] === this.value[k])) return;
    this.value = next;
    try {
      this.storage?.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch {
      /* private mode: kept for this visit only */
    }
    for (const cb of this.listeners) cb(this.get());
  }

  /** Called with the new settings after each change; returns a function that stops listening. */
  onChange(cb: (s: Settings) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
}

/** The store for this page: localStorage when it can be used, and the device's reduced-motion wish. */
export function deviceSettings(): SettingsStore {
  let storage: Store | null = null;
  try {
    storage = globalThis.localStorage ?? null;
  } catch {
    storage = null;
  }
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return new SettingsStore(storage, reduced);
}
