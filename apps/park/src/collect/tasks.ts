import type { TaskView } from '@owl-park/shared';

type Listener = (view: TaskView | null) => void;

/**
 * Today's three tasks as the page knows them: replaced by every answer and push from the room's
 * activities. The HUD (the journal's Today list and the tracker's line) listens.
 */
export class TaskState {
  view: TaskView | null = null;
  private readonly listeners = new Set<Listener>();

  set(view: TaskView | null): void {
    this.view = view;
    for (const cb of this.listeners) cb(view);
  }

  onChange(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** How many of today's tasks are done. */
  get done(): number {
    return this.view?.tasks.filter((t) => t.done >= t.count).length ?? 0;
  }
}
