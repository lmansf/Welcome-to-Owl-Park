import { LOST_FEATHERS, type ObjectiveKind } from '@owl-park/shared';
import { COURSE_WORDS, clearTime } from './courseWords';

/**
 * The objective strip (OP-224): a line at the top of the screen while the owl is in a parkour course,
 * one pip for each part of the course's objective (bells, breakers or seals), lit as each is done, and
 * the lost feathers found. It sits under the bar, where quest news shows elsewhere (a course has no
 * quests). While a run is under way it also shows the run's clock, and the gold time for as long as
 * the run can still beat it (OP-344): the gold prize was timed against a clock nobody could see.
 */
export interface ObjectiveStrip {
  /** `clock`: when the run under way started (this page's clock, ms) and the course's gold time; null with no run. */
  show(kind: ObjectiveKind, parts: readonly string[], done: ReadonlySet<string>, feathers: number, clock?: RunClock | null): void;
  destroy(): void;
}

export interface RunClock {
  startedAt: number;
  goldMs: number;
}

/** The clock's words `ms` into a run: the time, and the gold time while it can still be beaten. */
export function clockWords(ms: number, goldMs: number): string {
  const time = clearTime(ms);
  return ms < goldMs ? `${time} · ${COURSE_WORDS.goldUnder(clearTime(goldMs))}` : time;
}

const CSS = `
#objective-strip{position:absolute;z-index:9;left:50%;transform:translateX(-50%);top:calc(max(10px,env(safe-area-inset-top)) + 54px);display:flex;gap:14px;align-items:center;padding:6px 14px;border-radius:999px;background:rgba(12,30,54,.86);border:1px solid rgba(255,211,106,.45);color:#F6F1E3;font:700 13px/1.2 system-ui,sans-serif;white-space:nowrap;pointer-events:none;box-shadow:0 4px 14px rgba(0,0,0,.35)}
#objective-strip .pips{display:inline-flex;gap:5px;margin-left:6px;vertical-align:-1px}
#objective-strip .pip{display:inline-block;width:10px;height:10px;border-radius:50%;border:2px solid rgba(255,211,106,.7)}
#objective-strip .pip.on{background:#FFD36A;border-color:#FFD36A}
#objective-strip .clock{font-variant-numeric:tabular-nums;opacity:.92}
`;

let styled = false;

export function createObjectiveStrip(parent: HTMLElement): ObjectiveStrip {
  if (!styled) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    styled = true;
  }
  const root = document.createElement('div');
  root.id = 'objective-strip';
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  root.dataset['objective'] = '';
  parent.appendChild(root);
  // The clock ticks by itself between the room's answers: its words are set afresh twice a second.
  const time = document.createElement('span');
  time.className = 'clock';
  time.dataset['objectiveClock'] = '';
  let clock: RunClock | null = null;
  const tick = () => {
    if (clock) time.textContent = clockWords(Date.now() - clock.startedAt, clock.goldMs);
  };
  const timer = setInterval(tick, 500);
  return {
    show(kind, parts, done, feathers, run = null) {
      const n = parts.filter((p) => done.has(p)).length;
      root.replaceChildren();
      const left = document.createElement('span');
      left.dataset['objectiveParts'] = `${n}/${parts.length}`;
      left.textContent = `${COURSE_WORDS.parts[kind]} ${n}/${parts.length}`;
      const pips = document.createElement('span');
      pips.className = 'pips';
      pips.setAttribute('aria-hidden', 'true');
      for (const p of parts) {
        const i = document.createElement('i');
        i.className = done.has(p) ? 'pip on' : 'pip';
        i.dataset['part'] = p;
        pips.appendChild(i);
      }
      left.appendChild(pips);
      const right = document.createElement('span');
      right.dataset['objectiveFeathers'] = `${feathers}/${LOST_FEATHERS}`;
      right.textContent = `${COURSE_WORDS.feathers} ${feathers}/${LOST_FEATHERS}`;
      root.append(left, right);
      clock = run;
      if (clock) {
        tick();
        root.append(time);
      }
    },
    destroy() {
      clearInterval(timer);
      root.remove();
    },
  };
}
