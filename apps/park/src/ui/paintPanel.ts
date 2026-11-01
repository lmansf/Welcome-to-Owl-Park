/**
 * The ledge painter's panel (OP-156, `?paint=1` with a keeper's token): the tools (select, ledge,
 * wall, hazard, front, spot), with the spot tool the room's named spots to pick from (each placed one
 * ticked), Suggest, Undo, Delete, Save and Try, the picked item's numbers, and a line saying whether
 * the draft is saved. It sits at the right under the top bar, under the Menu and the screens that open
 * over the room, and takes taps on itself only. Its buttons never keep the keyboard, so the space bar
 * still jumps and the arrow keys still walk.
 */
import { TOOLS, type Tool } from '../paint/editor';

/** Where the draft stands: being read, saved as it is, changed since, being saved, or a save or read that failed. */
export type PaintState = 'loading' | 'saved' | 'unsaved' | 'saving' | 'error';

export interface PaintView {
  tool: Tool;
  /** The picked item's numbers, or what the tool does. */
  readout: string;
  state: PaintState;
  status: string;
  canUndo: boolean;
  canDelete: boolean;
  /** The owl stands on the draft's ledges in this page (Try). */
  trying: boolean;
  /** Reading or saving: the buttons that change the draft wait. */
  busy: boolean;
  /** The name the spot tool places next, and those of the room's names placed in the draft. */
  naming: string | null;
  placed: readonly string[];
}

/** One of the room's named spots as the list shows it: its id, and what it is (shown on hover). */
export interface PanelName {
  id: string;
  hint: string;
}

export interface PaintActions {
  tool(t: Tool): void;
  suggest(): void;
  undo(): void;
  remove(): void;
  save(): void;
  tryDraft(on: boolean): void;
  /** A name picked in the spot tool's list. */
  name(id: string): void;
}

export interface PaintPanel {
  show(view: PaintView): void;
  destroy(): void;
}

const TOOL_WORDS: Record<Tool, string> = { select: 'Select', ledge: 'Ledge', wall: 'Wall', hazard: 'Hazard', front: 'Front', spot: 'Spot' };
/** Each tool's colour, as its items are drawn. */
const TOOL_COLOURS: Record<Tool, string> = { select: '#F6F1E3', ledge: '#5BE37D', wall: '#FF4D4D', hazard: '#FF9F1C', front: '#3D8BFF', spot: '#C77DFF' };

// Inside #hud, so the Menu and the screens over the room (z-index 20 there) cover it; #hud's own button style is put back to the panel's.
const CSS = `
#hud .paint-panel{position:absolute;z-index:15;right:max(8px,env(safe-area-inset-right));top:calc(max(10px,env(safe-area-inset-top)) + 58px);width:min(300px,calc(100vw - 16px));
  display:flex;flex-direction:column;gap:6px;padding:8px;border-radius:10px;pointer-events:auto;color:#F6F1E3;background:rgba(12,30,54,.88);
  border:1px solid rgba(246,241,227,.22);box-shadow:0 4px 14px rgba(0,0,0,.45);font:12px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
#hud .paint-panel h2{margin:0;font-size:12px;font-weight:700;letter-spacing:.04em;color:#FFD36A}
#hud .paint-panel .row{display:flex;flex-wrap:wrap;gap:4px}
#hud .paint-panel button{min-height:32px;padding:4px 9px;border-radius:7px;border:1px solid rgba(246,241,227,.3);background:rgba(246,241,227,.08);color:#F6F1E3;
  font:inherit;font-weight:700;box-shadow:none;cursor:pointer;touch-action:manipulation}
#hud .paint-panel button[data-tool]::before{content:'';display:inline-block;width:8px;height:8px;margin-right:5px;border-radius:50%;background:var(--c)}
#hud .paint-panel button[aria-pressed=true]{background:#C9A227;color:#0C1E36;border-color:#C9A227}
#hud .paint-panel button:disabled{opacity:.45;cursor:default}
#hud .paint-panel .names{max-height:136px;overflow-y:auto}
#hud .paint-panel .names[hidden]{display:none}
#hud .paint-panel .names button{min-height:28px;padding:2px 7px;font:600 11px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace}
#hud .paint-panel .names button[data-placed=true]{border-color:#C77DFF}
#hud .paint-panel .readout{min-height:1.35em;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap}
#hud .paint-panel .status{font-weight:700}
#hud .paint-panel .status[data-state=saved]{color:#9CFF57}
#hud .paint-panel .status[data-state=unsaved]{color:#FFD36A}
#hud .paint-panel .status[data-state=error]{color:#FF8A80}
`;

/** The panel, in `parent` (the HUD), for the room `room` and its named spots, west to east. */
export function mountPaintPanel(parent: HTMLElement, room: string, actions: PaintActions, names: readonly PanelName[] = []): PaintPanel {
  const style = document.createElement('style');
  style.textContent = CSS;
  const panel = document.createElement('div');
  panel.className = 'paint-panel';
  panel.dataset.paintPanel = room;
  panel.setAttribute('role', 'group');
  panel.setAttribute('aria-label', 'Ledge painter');
  // A press on the panel never takes the keyboard from the park.
  panel.addEventListener('mousedown', (e) => e.preventDefault());
  const button = (words: string, act: () => void, data: Record<string, string>): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = words;
    for (const [k, v] of Object.entries(data)) b.dataset[k] = v;
    b.addEventListener('click', act);
    return b;
  };
  const title = document.createElement('h2');
  title.textContent = `Painter: ${room}`;
  const tools = document.createElement('div');
  tools.className = 'row';
  const toolButtons = TOOLS.map((t) => {
    const b = button(TOOL_WORDS[t], () => actions.tool(t), { tool: t });
    b.style.setProperty('--c', TOOL_COLOURS[t]);
    b.setAttribute('aria-pressed', 'false');
    return b;
  });
  tools.append(...toolButtons);
  // The spot tool's names: one to pick, then a tap on the playfield places it.
  const list = document.createElement('div');
  list.className = 'row names';
  list.dataset.paintNames = '';
  list.setAttribute('role', 'group');
  list.setAttribute('aria-label', 'Named spots');
  list.hidden = true;
  const nameButtons = names.map((n) => {
    const b = button(n.id, () => actions.name(n.id), { spot: n.id, placed: 'false' });
    b.title = n.hint;
    b.setAttribute('aria-pressed', 'false');
    return b;
  });
  if (nameButtons.length) list.append(...nameButtons);
  else list.textContent = 'This room has no named spots.';
  const acts = document.createElement('div');
  acts.className = 'row';
  const suggest = button('Suggest', () => actions.suggest(), { paint: 'suggest' });
  const undo = button('Undo', () => actions.undo(), { paint: 'undo' });
  const remove = button('Delete', () => actions.remove(), { paint: 'delete' });
  const save = button('Save', () => actions.save(), { paint: 'save' });
  let trying = true;
  const tryIt = button('Try', () => actions.tryDraft(!trying), { paint: 'try' });
  tryIt.title = 'Your owl stands on the draft’s ledges, in this page only: the room keeps its own.';
  acts.append(suggest, undo, remove, save, tryIt);
  const readout = document.createElement('div');
  readout.className = 'readout';
  readout.dataset.paintReadout = '';
  const status = document.createElement('div');
  status.className = 'status';
  status.dataset.paintStatus = '';
  status.setAttribute('aria-live', 'polite');
  panel.append(title, tools, list, acts, readout, status);
  parent.append(panel);
  document.head.append(style);
  return {
    show(v) {
      for (const b of toolButtons) b.setAttribute('aria-pressed', String(b.dataset['tool'] === v.tool));
      trying = v.trying;
      tryIt.setAttribute('aria-pressed', String(v.trying));
      undo.disabled = v.busy || !v.canUndo;
      remove.disabled = v.busy || !v.canDelete;
      save.disabled = v.busy;
      if (readout.textContent !== v.readout) readout.textContent = v.readout;
      if (status.textContent !== v.status) status.textContent = v.status;
      status.dataset.state = v.state;
      list.hidden = v.tool !== 'spot';
      for (const b of nameButtons) {
        const id = b.dataset['spot'] ?? '';
        const placed = v.placed.includes(id);
        const words = placed ? `✓ ${id}` : id;
        if (b.textContent !== words) b.textContent = words;
        b.dataset['placed'] = String(placed);
        b.setAttribute('aria-pressed', String(v.naming === id));
        b.disabled = v.busy;
      }
    },
    destroy() {
      panel.remove();
      style.remove();
    },
  };
}
