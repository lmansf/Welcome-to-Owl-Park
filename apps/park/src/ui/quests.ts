import { MAX_ACTIVE_QUESTS, TASKS_BONUS, TASK_FEATHERS, getNpc, placeName, variantName, type ActiveQuestView, type NpcDef, type QuestOfferView, type QuestReward } from '@owl-park/shared';
import type { QuestState } from '../collect/quests';
import type { TaskState } from '../collect/tasks';

export interface QuestActions {
  accept(quest: string): Promise<unknown>;
  abandon(quest: string): Promise<unknown>;
  handIn(quest: string): Promise<unknown>;
  /** Collect a finished quest from the quests screen: handed in at its giver, who stands in this room (the owl walks up first). */
  collect(quest: string): Promise<unknown>;
  /** Nova's shop (from her dialogue). */
  openShop(): void;
}

export interface QuestUi {
  openDialogue(npc: NpcDef): void;
  closeDialogue(): void;
  /** The NPC whose dialogue is open, if any. */
  dialogueNpc(): string | null;
  /**
   * The quests journal, drawn into the Menu's Quests tab (OP-108): `host` is the tab's panel and
   * `shown` says whether it still shows the Quests tab, so a quest that changes redraws it only then.
   */
  mountJournal(host: HTMLElement, shown: () => boolean): void;
  /** Back to its first tab (Under way), for the J key and the Menu's Quests tab opened afresh. */
  resetJournal(): void;
  /** The room the owl is in: the lobby shows its welcome, and a finished quest can be collected where its giver stands. */
  setRoom(room: string): void;
}

const CSS = `
#hud .welcome{margin-top:8px;display:none;width:min(330px,calc(100vw - 24px));background:rgba(12,30,54,.72);border:1px solid rgba(246,241,227,.18);border-radius:12px;padding:7px 11px;font-size:13px;line-height:1.3;backdrop-filter:blur(6px)}
#hud .welcome.show{display:block}
#hud .welcome b{display:block;font-size:12px;color:#FFD36A;letter-spacing:.02em}
#hud .sheet{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(max(12px,env(safe-area-inset-bottom)) + 62px);width:min(520px,calc(100vw - 20px));max-height:min(72vh,640px);display:none;flex-direction:column;gap:10px;pointer-events:auto;background:rgba(12,30,54,.95);border:1px solid rgba(246,241,227,.18);border-radius:18px;padding:14px;box-shadow:0 10px 40px rgba(0,0,0,.55);overflow:auto}
#hud .sheet.open{display:flex}
#hud .sheet header{display:flex;align-items:center;gap:10px}
#hud .sheet h2{margin:0;font-size:16px}
#hud .sheet header .sub{font-size:12px;opacity:.75;flex:1}
#hud .sheet .x{min-height:36px;padding:6px 12px}
#hud .sheet .say{font-style:italic;font-size:14px;opacity:.95;margin:0}
#hud .sheet h3{margin:6px 0 0;font-size:12px;letter-spacing:.06em;text-transform:uppercase;opacity:.7}
#hud .qcard{background:rgba(246,241,227,.06);border:1px solid rgba(246,241,227,.12);border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:6px}
#hud .qcard.ready{border-color:#9FE8FF}
#hud .qcard .top{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
#hud .qcard .top b{font-size:14px;flex:1;min-width:140px}
#hud .qcard .prog{font-size:12px;font-weight:700;padding:2px 9px;border-radius:999px;background:rgba(255,211,106,.16);color:#FFD36A;border:1px solid rgba(255,211,106,.35)}
#hud .qcard.ready .prog{background:rgba(159,232,255,.14);color:#9FE8FF;border-color:rgba(159,232,255,.4)}
#hud .qcard .collect{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;font-size:13px}
#hud .chips{display:flex;gap:4px;flex-wrap:wrap}
#hud .chip{font-size:11px;padding:2px 7px;border-radius:999px;background:rgba(246,241,227,.1);border:1px solid rgba(246,241,227,.15)}
#hud .chip.easy{color:#8FE3A8}#hud .chip.medium{color:#FFD36A}#hud .chip.hard{color:#FF8C8C}
#hud .qcard ol{margin:0;padding-left:20px;font-size:13px;display:flex;flex-direction:column;gap:2px}
#hud .qcard li.done{opacity:.55;text-decoration:line-through}
#hud .qcard li.now{font-weight:700}
#hud .qcard .meta{font-size:12px;opacity:.8;display:flex;gap:10px;flex-wrap:wrap;align-items:center}
#hud .qcard .row2{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap}
#hud .qcard button{min-height:36px;padding:6px 14px}
#hud .qcard .quote{font-style:italic;font-size:13px;opacity:.9}
#hud .sheet .empty{font-size:13px;opacity:.8}
#hud .sheet .who{font-size:13px;display:flex;flex-direction:column;gap:4px}
#hud .layer .modal.quests{width:min(560px,calc(100vw - 24px))}
#hud .quests h3{margin:6px 0 0;font-size:12px;letter-spacing:.06em;text-transform:uppercase;opacity:.7}
#hud .quests .empty{font-size:13.5px;opacity:.85;margin:0}
#hud .quests .who{font-size:13.5px;display:flex;flex-direction:column;gap:6px}
#hud .quests .who span{padding:8px 10px;border-radius:10px;background:rgba(246,241,227,.06)}
#hud .quests [role=tabpanel]{display:flex;flex-direction:column;gap:10px}
#hud .quests .today{font-size:14px;gap:8px}
#hud .quests .today .task{padding:8px 10px;border-radius:10px;background:rgba(246,241,227,.06)}
#hud .today{display:flex;flex-direction:column;gap:4px;font-size:13px}
#hud .today .task{display:flex;gap:8px;align-items:baseline}
#hud .today .task b{width:16px;flex:none;color:#FFD36A}
#hud .today .task span{flex:1}
#hud .today .task i{font-style:normal;opacity:.75;font-size:12px}
#hud .today .task.done span{opacity:.6;text-decoration:line-through}
`;

const CHIP_WORDS = { easy: 'Easy', medium: 'Medium', hard: 'Hard', short: 'Short', long: 'Long', story: 'Story', daily: 'Today', weekly: 'This week' } as const;

/** "5 h", "40 min", "3 days": how long until `at`. */
export function timeLeft(at: number, now = Date.now()): string {
  const ms = Math.max(0, at - now);
  const min = Math.ceil(ms / 60_000);
  if (min < 60) return `${min} min`;
  const h = Math.round(ms / 3_600_000);
  if (h < 36) return `${h} h`;
  return `${Math.round(ms / 86_400_000)} days`;
}

export function rewardText(r: QuestReward): string {
  const item = r.item === 'pick' ? ' and a collectible' : r.item ? ` and ${variantName(r.item)}` : '';
  return `${r.feathers} feathers${item}`;
}

const npcName = (id: string) => getNpc(id)?.name ?? 'a friend';
const npcPlace = (id: string) => placeName(getNpc(id)?.room ?? '');

/** A quest's progress in the quests screen: its steps done of all of them ("2/5"), or Done once it is ready to hand in. */
export function progressText(q: Pick<ActiveQuestView, 'ready' | 'step' | 'steps'>): string {
  return q.ready ? 'Done' : `${q.step}/${q.steps.length}`;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function button(label: string, cls: string, onClick: () => void, disabled = false): HTMLButtonElement {
  const b = el('button', cls, label);
  b.disabled = disabled;
  b.addEventListener('click', onClick);
  return b;
}

function chips(q: { difficulty: string; length: string; cadence: string }): HTMLElement {
  const box = el('div', 'chips');
  box.append(
    el('span', `chip ${q.difficulty}`, CHIP_WORDS[q.difficulty as keyof typeof CHIP_WORDS] ?? q.difficulty),
    el('span', 'chip', q.length === 'medium' ? 'Medium length' : (CHIP_WORDS[q.length as keyof typeof CHIP_WORDS] ?? q.length)),
    el('span', 'chip', CHIP_WORDS[q.cadence as keyof typeof CHIP_WORDS] ?? q.cadence),
  );
  return box;
}

function steps(texts: string[], current: number | null, progress?: { count: number; need: number } | null): HTMLOListElement {
  const ol = el('ol');
  texts.forEach((t, i) => {
    const li = el('li', current === null ? '' : i < current ? 'done' : i === current ? 'now' : '');
    li.textContent = i === current && progress && progress.need > 1 ? `${t} (${progress.count} of ${progress.need})` : t;
    ol.appendChild(li);
  });
  return ol;
}

type JournalTab = 'underway' | 'today' | 'more';

/**
 * The quest HUD. Quests live in the Menu (OP-083): the Quests tab (from the Menu or J) lists every
 * quest carried with its progress, and a finished one is collected there; today's tasks and who has
 * more are its other tabs. Nothing about quests stays on the play screen, where the lobby keeps only
 * its welcome. Talking to an NPC owl opens its dialogue (hand in, take on, or open Nova's shop).
 * `onOpen` makes room before a screen or the dialogue opens; `back` returns from the quests screen to
 * the Menu.
 */
export function createQuestUi(root: HTMLElement, bar: HTMLElement, state: QuestState, actions: QuestActions, onOpen: () => void, tasks: TaskState): QuestUi {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const welcome = el('div', 'welcome');
  welcome.append(el('b', '', 'Welcome to Owl Park'), document.createTextNode('Walk through the turnstiles to enter the park.'));
  bar.insertAdjacentElement('afterend', welcome);

  /** The Menu's Quests tab, while it shows: the journal draws itself there. */
  let host: HTMLElement | null = null;
  let hostShown: () => boolean = () => false;
  let tab: JournalTab = 'underway';
  const dialogue = el('section', 'sheet dialogue');
  dialogue.setAttribute('aria-label', 'Talking');
  root.append(dialogue);

  let talking: NpcDef | null = null;
  let greeting = '';
  let room = '';
  /** A request from a button is under way: buttons wait for it. */
  let pending = false;

  const run = async (fn: () => Promise<unknown>) => {
    if (pending) return;
    pending = true;
    render();
    try {
      await fn();
    } finally {
      pending = false;
      render();
    }
  };

  /** A quest carried: in the quests screen (`inJournal`, with its progress, Collect and Drop) or in its giver's dialogue. */
  const activeCard = (q: ActiveQuestView, inJournal: boolean): HTMLElement => {
    const card = el('div', `qcard${q.ready ? ' ready' : ''}`);
    card.dataset['quest'] = q.id;
    const top = el('div', 'top');
    top.append(el('b', '', q.title));
    if (inJournal) {
      const prog = el('span', 'prog', progressText(q));
      prog.dataset['progress'] = '';
      top.append(prog);
    }
    top.append(chips(q));
    card.appendChild(top);
    card.appendChild(steps([...q.steps, `Take it back to ${npcName(q.giver)}`], q.ready ? q.steps.length : q.step, q.current));
    if (inJournal && q.ready) {
      const row = el('div', 'collect');
      // The giver hands the reward over: from here when it stands in this room, otherwise it says where.
      if (getNpc(q.giver)?.room === room) row.append(el('span', '', `Done! ${npcName(q.giver)} has your reward.`), button('Collect', '', () => void run(() => actions.collect(q.id)), pending));
      else row.append(el('span', '', `Done! Take it back to ${npcName(q.giver)} at ${npcPlace(q.giver)} to collect.`));
      card.appendChild(row);
    }
    const row = el('div', 'row2');
    const meta = el('div', 'meta');
    meta.append(el('span', '', `Reward: ${rewardText(q.reward)}`));
    if (q.endsAt) meta.append(el('span', '', `ends in ${timeLeft(q.endsAt)}`));
    row.appendChild(meta);
    if (inJournal && !q.ready) row.appendChild(button('Drop', 'ghost', () => void run(() => actions.abandon(q.id)), pending));
    card.appendChild(row);
    return card;
  };

  const offerCard = (q: QuestOfferView, full: boolean): HTMLElement => {
    const card = el('div', 'qcard');
    card.dataset['offer'] = q.id;
    const top = el('div', 'top');
    top.append(el('b', '', q.title), chips(q));
    card.append(top, el('div', 'quote', `"${q.offer}"`));
    card.appendChild(steps([...q.steps, `Take it back to ${npcName(q.giver)}`], null));
    const row = el('div', 'row2');
    row.append(el('div', 'meta', `Reward: ${rewardText(q.reward)}`), button(full ? 'Your hands are full' : 'Take it on', full ? 'ghost' : '', () => void run(() => actions.accept(q.id)), full || pending));
    card.appendChild(row);
    return card;
  };

  /** At the front gate, the way in: the lobby's welcome, the one line the play screen keeps. */
  const renderWelcome = () => welcome.classList.toggle('show', room === 'lobby');

  const header = (title: string, sub: string, onClose: () => void, closeLabel: string) => {
    const h = el('header');
    h.append(el('h2', '', title), el('span', 'sub', sub), button('Close', 'ghost x', onClose));
    h.lastElementChild!.setAttribute('aria-label', closeLabel);
    return h;
  };

  const renderJournal = () => {
    if (!host || !host.isConnected || !hostShown()) return;
    const board = state.board;
    host.innerHTML = '';
    const box = el('div', 'quests journal');
    host.appendChild(box);
    const focused = (document.activeElement as HTMLElement | null)?.dataset?.['tab'] ?? null;
    const sum = el('p', 'qsum', board ? `${board.active.length} of ${MAX_ACTIVE_QUESTS} carried · ${board.feathers} feathers` : 'Loading…');
    sum.dataset['sub'] = '';
    box.appendChild(sum);
    const today = tasks.view;
    const tabs: Array<[JournalTab, string]> = [
      ['underway', board ? `Under way (${board.active.length})` : 'Under way'],
      ['today', today ? `Today (${tasks.done} of ${today.tasks.length})` : 'Today'],
      ['more', 'Find more'],
    ];
    const nav = el('nav', 'tabs');
    nav.setAttribute('role', 'tablist');
    for (const [id, label] of tabs) {
      const b = button(label, '', () => {
        tab = id;
        renderJournal();
        box.querySelector<HTMLElement>(`[data-tab="${id}"]`)?.focus();
      });
      b.dataset['tab'] = id;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(id === tab));
      nav.appendChild(b);
    }
    box.appendChild(nav);
    const panel = el('div');
    panel.setAttribute('role', 'tabpanel');
    panel.dataset['panel'] = tab;
    box.appendChild(panel);
    if (focused) box.querySelector<HTMLElement>(`[data-tab="${focused}"]`)?.focus();
    if (tab === 'today') {
      if (!today) return void panel.appendChild(el('p', 'empty', 'Loading today’s tasks…'));
      const list = el('div', 'today');
      for (const t of today.tasks) {
        const done = t.done >= t.count;
        const row = el('div', `task${done ? ' done' : ''}`);
        row.append(el('b', '', done ? '✓' : '•'), el('span', '', t.text), el('i', '', `${t.done} of ${t.count}`));
        list.appendChild(row);
      }
      panel.append(list, el('p', 'empty', `${today.bonus ? 'All three done, bonus paid.' : `Each task pays ${TASK_FEATHERS} feathers, and all three ${TASKS_BONUS} more.`} New tasks in ${timeLeft(today.endsAt)}.`));
      return;
    }
    if (!board) return void panel.appendChild(el('p', 'empty', 'Loading your quests…'));
    if (tab === 'more') {
      const givers = Object.entries(board.offers).filter(([, list]) => list.length);
      panel.appendChild(el('h3', '', 'Who has quests for you'));
      const who = el('div', 'who');
      for (const [npc, list] of givers) who.appendChild(el('span', '', `${npcName(npc)} at ${npcPlace(npc)}: ${list.length === 1 ? list[0]!.title : `${list.length} quests`}`));
      if (!givers.length) who.appendChild(el('span', 'empty', 'Nobody right now. New quests arrive every day at midnight, park time.'));
      panel.append(who, el('p', 'empty', `Daily quests change in ${timeLeft(board.nextDay)}; weekly ones in ${timeLeft(board.nextWeek)}.`));
      return;
    }
    if (board.active.length) for (const q of [...board.active].sort((a, b) => Number(b.ready) - Number(a.ready))) panel.appendChild(activeCard(q, true));
    else {
      const newcomer = !board.storyDone.includes('story-welcome') ? ` New here? Start with ${npcName('bramble')} at ${npcPlace('bramble')}.` : '';
      panel.appendChild(el('p', 'empty', `No quests under way. Owls with a gold "!" over their heads have something for you.${newcomer}`));
      panel.appendChild(
        button('See who has quests', 'ghost', () => {
          tab = 'more';
          renderJournal();
          box.querySelector<HTMLElement>('[data-tab="more"]')?.focus();
        }),
      );
    }
  };

  const renderDialogue = () => {
    if (!talking || !dialogue.classList.contains('open')) return;
    const npc = talking;
    dialogue.innerHTML = '';
    dialogue.dataset['npc'] = npc.id;
    dialogue.appendChild(header(npc.name, npc.role, () => closeDialogue(), `Stop talking to ${npc.name}`));
    const ready = state.readyFor(npc.id);
    const underway = state.underwayFor(npc.id);
    const offers = state.offersFrom(npc.id);
    dialogue.appendChild(el('p', 'say', ready.length ? 'Oh, you did it! Let me see...' : greeting));
    for (const q of ready) {
      const card = el('div', 'qcard ready');
      card.dataset['quest'] = q.id;
      const row = el('div', 'row2');
      row.append(el('b', '', q.title), button('Hand it in', '', () => void run(() => actions.handIn(q.id)), pending));
      card.append(row, el('div', 'meta', `Reward: ${rewardText(q.reward)}`));
      dialogue.appendChild(card);
    }
    if (offers.length) {
      dialogue.appendChild(el('h3', '', 'Quests'));
      const full = (state.board?.active.length ?? 0) >= MAX_ACTIVE_QUESTS;
      for (const q of offers) dialogue.appendChild(offerCard(q, full));
    }
    if (underway.length) {
      dialogue.appendChild(el('h3', '', 'Under way'));
      for (const q of underway) dialogue.appendChild(activeCard(q, false));
    }
    if (npc.shop) {
      const row = el('div', 'row2');
      row.append(el('span', 'meta', 'A free gift every day, three new things every day and eight every week.'), button('Open the shop', '', () => actions.openShop()));
      dialogue.appendChild(row);
    } else if (!ready.length && !offers.length && !underway.length) {
      dialogue.appendChild(el('p', 'empty', 'Nothing to ask of you right now. Come back tomorrow!'));
    }
  };

  const render = () => {
    renderJournal();
    renderDialogue();
  };

  const closeDialogue = () => {
    talking = null;
    dialogue.classList.remove('open');
    delete dialogue.dataset['npc'];
  };

  state.onChange(render);
  tasks.onChange(renderJournal);
  render();

  return {
    setRoom(r) {
      room = r;
      renderWelcome();
      renderJournal();
    },
    openDialogue(npc) {
      onOpen();
      talking = npc;
      greeting = npc.greetings[Math.floor(Math.random() * npc.greetings.length)] ?? '';
      dialogue.classList.add('open');
      renderDialogue();
    },
    closeDialogue,
    dialogueNpc: () => (dialogue.classList.contains('open') ? (talking?.id ?? null) : null),
    mountJournal(el, shown) {
      host = el;
      hostShown = shown;
      renderJournal();
    },
    resetJournal() {
      tab = 'underway';
    },
  };
}
