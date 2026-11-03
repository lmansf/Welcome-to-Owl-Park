import { LOST_FEATHERS, type ObjectiveKind } from '@owl-park/shared';
import { COURSE_WORDS } from './courseWords';

/**
 * The objective strip (OP-224): a line at the top of the screen while the owl is in a parkour course,
 * one pip for each part of the course's objective (bells, breakers or seals), lit as each is done, and
 * the lost feathers found. It sits under the bar, where quest news shows elsewhere (a course has no
 * quests).
 */
export interface ObjectiveStrip {
  show(kind: ObjectiveKind, parts: readonly string[], done: ReadonlySet<string>, feathers: number): void;
  destroy(): void;
}

const CSS = `
#objective-strip{position:absolute;z-index:9;left:50%;transform:translateX(-50%);top:calc(max(10px,env(safe-area-inset-top)) + 54px);display:flex;gap:14px;align-items:center;padding:6px 14px;border-radius:999px;background:rgba(12,30,54,.86);border:1px solid rgba(255,211,106,.45);color:#F6F1E3;font:700 13px/1.2 system-ui,sans-serif;white-space:nowrap;pointer-events:none;box-shadow:0 4px 14px rgba(0,0,0,.35)}
#objective-strip .pips{display:inline-flex;gap:5px;margin-left:6px;vertical-align:-1px}
#objective-strip .pip{display:inline-block;width:10px;height:10px;border-radius:50%;border:2px solid rgba(255,211,106,.7)}
#objective-strip .pip.on{background:#FFD36A;border-color:#FFD36A}
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
  return {
    show(kind, parts, done, feathers) {
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
    },
    destroy() {
      root.remove();
    },
  };
}
