import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsStore } from '../settings';
import { renderSettings } from './menuTabs';
import { FEEDBACK_ROW_WORDS, settingsRows } from './settingsScreen';

/**
 * Just enough of a page for the Settings rows to be drawn in a test (the unit tests run without a
 * browser): elements with their classes, data and children, a click, and `[data-…]` lookups.
 */
class FakeEl {
  className = '';
  textContent = '';
  innerHTML = '';
  scrollTop = 0;
  readonly dataset: Record<string, string> = {};
  readonly children: Array<FakeEl | string> = [];
  private readonly attrs = new Map<string, string>();
  private readonly clicks: Array<() => void> = [];
  constructor(readonly tagName: string) {}
  append(...nodes: Array<FakeEl | string>): void {
    this.children.push(...nodes);
  }
  appendChild(node: FakeEl): FakeEl {
    this.children.push(node);
    return node;
  }
  setAttribute(k: string, v: string): void {
    this.attrs.set(k, v);
  }
  getAttribute(k: string): string | null {
    return this.attrs.get(k) ?? null;
  }
  addEventListener(type: string, cb: () => void): void {
    if (type === 'click') this.clicks.push(cb);
  }
  click(): void {
    for (const cb of this.clicks) cb();
  }
  /** Its own words and its children's, in order. */
  text(): string {
    return [this.textContent, ...this.children.map((c) => (typeof c === 'string' ? c : c.text()))].join(' ').replace(/\s+/g, ' ').trim();
  }
  /** Every element below this one, in page order. */
  all(): FakeEl[] {
    return this.children.flatMap((c) => (typeof c === 'string' ? [] : [c, ...c.all()]));
  }
  /** `[data-name]` or `[data-name="value"]`, the only selectors the rows ask for. */
  querySelectorAll(sel: string): FakeEl[] {
    const m = /^\[data-([a-z-]+)(?:="([^"]*)")?\]$/.exec(sel);
    if (!m) throw new Error(`the fake page reads no ${sel}`);
    const key = m[1]!.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    return this.all().filter((e) => key in e.dataset && (m[2] === undefined || e.dataset[key] === m[2]));
  }
}

const fakeDocument = () => ({
  createElement: (tag: string) => new FakeEl(tag),
  head: new FakeEl('head'),
  fullscreenEnabled: false,
  fullscreenElement: null,
});

const store = () => new SettingsStore(null, false);
const isRow = (e: FakeEl | string): e is FakeEl => typeof e !== 'string';

describe('Settings put Send feedback first (OP-167)', () => {
  beforeEach(() => {
    vi.stubGlobal('document', fakeDocument());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('draws the Send feedback row before every other row, heading or setting', () => {
    const rows = settingsRows(store(), () => undefined, () => undefined) as unknown as FakeEl[];
    const first = rows[0]!;
    expect(first.dataset['feedbackRow']).toBe('');
    expect(first.text()).toContain(FEEDBACK_ROW_WORDS.title);
    const [button] = first.querySelectorAll('[data-screen="feedback"]');
    expect(button?.tagName).toBe('button');
    expect(button?.textContent).toBe(FEEDBACK_ROW_WORDS.button);
    // Its hook for the Menu's redraw keeps the focus on it (menuShell.ts refresh).
    expect(button?.dataset['key']).toBe('feedback');
    // The settings themselves follow it, and none comes before it.
    expect(rows.slice(1).some((r) => r.querySelectorAll('[data-setting]').length > 0)).toBe(true);
    expect(rows.filter((r) => 'feedbackRow' in r.dataset)).toHaveLength(1);
  });

  it('opens the Feedback form from its button, and only from its button', () => {
    const open = vi.fn();
    const s = store();
    const rows = settingsRows(s, () => undefined, open) as unknown as FakeEl[];
    for (const r of rows) for (const sw of r.querySelectorAll('[data-setting]')) sw.click();
    expect(open).not.toHaveBeenCalled();
    rows[0]!.querySelectorAll('[data-screen="feedback"]')[0]!.click();
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("is the first row of the Menu's Settings tab too, with no second way to Feedback below it", async () => {
    const feedback = vi.fn();
    const panel = new FakeEl('div');
    renderSettings(
      panel as unknown as HTMLElement,
      { settings: store(), tickets: () => Promise.resolve(null), canLeave: true, feedback, title: () => undefined, leave: () => undefined, account: null },
      () => undefined,
    );
    await Promise.resolve();
    const wrap = panel.children.filter(isRow)[0]!;
    expect(wrap.className).toBe('settings');
    expect(wrap.children.filter(isRow)[0]?.dataset['feedbackRow']).toBe('');
    const buttons = panel.querySelectorAll('[data-screen="feedback"]');
    expect(buttons).toHaveLength(1);
    buttons[0]!.click();
    expect(feedback).toHaveBeenCalledTimes(1);
    // The ways out stay where they were, after the settings.
    expect(panel.querySelectorAll('[data-screen="title"]')).toHaveLength(1);
    expect(panel.querySelectorAll('[data-screen="leave"]')).toHaveLength(1);
  });
});
