import { MAX_ACTIVE_QUESTS, getNpc, placeName, variantName, type ActiveQuestView, type NpcDef, type QuestOfferView, type QuestReward } from '@owl-park/shared';
import type { QuestState } from '../collect/quests';

export interface QuestActions {
  accept(quest: string): Promise<unknown>;
  abandon(quest: string): Promise<unknown>;
  handIn(quest: string): Promise<unknown>;
  /** Nova's shop (from her dialogue). */
  openShop(): void;
}

export interface QuestUi {
  openDialogue(npc: NpcDef): void;
  closeDialogue(): void;
  /** The NPC whose dialogue is open, if any. */
  dialogueNpc(): string | null;
  toggleJournal(): void;
  closeJournal(): void;
  isJournalOpen(): boolean;
  /** The room the owl is in: the lobby shows its welcome instead of the quests. */
  setRoom(room: string): void;
}

const CSS = `
#hud .tracker{margin-top:8px;display:none;flex-direction:column;gap:6px;width:min(330px,calc(100vw - 24px));pointer-events:auto;cursor:pointer}
#hud .tracker.show{display:flex}
#hud .tracker .tq{background:rgba(12,30,54,.72);border:1px solid rgba(246,241,227,.18);border-radius:12px;padding:7px 11px;font-size:13px;line-height:1.3;backdrop-filter:blur(6px)}
#hud .tracker .tq b{display:block;font-size:12px;color:#FFD36A;letter-spacing:.02em}
#hud .tracker .tq.ready b{color:#9FE8FF}
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

/**
 * The quest HUD: a tracker under the top bar (the quests under way, or where to start), the
 * journal (J) with every quest carried and who has more, and the dialogue that opens when
 * talking to an NPC owl (hand in, take on, or open Nova's shop).
 */
export function createQuestUi(root: HTMLElement, bar: HTMLElement, state: QuestState, actions: QuestActions, onOpen: () => void): QuestUi {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const tracker = el('div', 'tracker');
  tracker.setAttribute('role', 'button');
  tracker.setAttribute('aria-label', 'Quests under way: open the journal');
  bar.insertAdjacentElement('afterend', tracker);

  const journal = el('section', 'sheet journal');
  journal.setAttribute('aria-label', 'Quest journal');
  const dialogue = el('section', 'sheet dialogue');
  dialogue.setAttribute('aria-label', 'Talking');
  root.append(journal, dialogue);

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

  const activeCard = (q: ActiveQuestView, withDrop: boolean): HTMLElement => {
    const card = el('div', `qcard${q.ready ? ' ready' : ''}`);
    card.dataset['quest'] = q.id;
    const top = el('div', 'top');
    top.append(el('b', '', q.title), chips(q));
    card.appendChild(top);
    card.appendChild(steps([...q.steps, `Take it back to ${npcName(q.giver)}`], q.ready ? q.steps.length : q.step, q.current));
    const row = el('div', 'row2');
    const meta = el('div', 'meta');
    meta.append(el('span', '', `Reward: ${rewardText(q.reward)}`));
    if (q.endsAt) meta.append(el('span', '', `ends in ${timeLeft(q.endsAt)}`));
    row.appendChild(meta);
    if (withDrop && !q.ready) row.appendChild(button('Drop', 'ghost', () => void run(() => actions.abandon(q.id)), pending));
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

  const renderTracker = () => {
    const board = state.board;
    tracker.innerHTML = '';
    if (room === 'lobby') {
      // Quests happen inside the park: at the front gate, the way in.
      const line = el('div', 'tq');
      line.append(el('b', '', 'Welcome to Owl Park'), document.createTextNode('Walk through the turnstiles to enter the park.'));
      tracker.appendChild(line);
      return void tracker.classList.add('show');
    }
    if (!board) return void tracker.classList.remove('show');
    const active = [...board.active].sort((a, b) => Number(b.ready) - Number(a.ready)).slice(0, 2);
    for (const q of active) {
      const line = el('div', `tq${q.ready ? ' ready' : ''}`);
      line.append(el('b', '', q.title));
      line.append(document.createTextNode(q.ready ? `Done! Take it back to ${npcName(q.giver)} at ${npcPlace(q.giver)}.` : q.current ? `${q.current.text}${q.current.need > 1 ? ` · ${q.current.count} of ${q.current.need}` : ''}` : ''));
      tracker.appendChild(line);
    }
    if (!active.length && !board.storyDone.includes('story-welcome')) {
      const line = el('div', 'tq');
      line.append(el('b', '', 'New here?'), document.createTextNode(`Talk to ${npcName('bramble')} at ${npcPlace('bramble')}.`));
      tracker.appendChild(line);
    }
    if (board.active.length > active.length) tracker.appendChild(el('div', 'tq', `+${board.active.length - active.length} more in the journal`));
    tracker.classList.toggle('show', tracker.childElementCount > 0);
  };

  const header = (title: string, sub: string, onClose: () => void, closeLabel: string) => {
    const h = el('header');
    h.append(el('h2', '', title), el('span', 'sub', sub), button('Close', 'ghost x', onClose));
    h.lastElementChild!.setAttribute('aria-label', closeLabel);
    return h;
  };

  const renderJournal = () => {
    if (!journal.classList.contains('open')) return;
    const board = state.board;
    journal.innerHTML = '';
    journal.appendChild(header('Quests', board ? `${board.active.length} of ${MAX_ACTIVE_QUESTS} carried · ${board.feathers} feathers` : 'Loading…', () => journal.classList.remove('open'), 'Close quests'));
    if (!board) return;
    if (board.active.length) for (const q of board.active) journal.appendChild(activeCard(q, true));
    else journal.appendChild(el('p', 'empty', 'No quests under way. Owls with a gold "!" over their heads have something for you.'));
    const givers = Object.entries(board.offers).filter(([, list]) => list.length);
    journal.appendChild(el('h3', '', 'Who has quests for you'));
    const who = el('div', 'who');
    for (const [npc, list] of givers) who.appendChild(el('span', '', `${npcName(npc)} at ${npcPlace(npc)}: ${list.length === 1 ? list[0]!.title : `${list.length} quests`}`));
    if (!givers.length) who.appendChild(el('span', 'empty', 'Nobody right now. New quests arrive every day at midnight, park time.'));
    journal.appendChild(who);
    journal.appendChild(el('p', 'empty', `Daily quests change in ${timeLeft(board.nextDay)}; weekly ones in ${timeLeft(board.nextWeek)}.`));
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
    renderTracker();
    renderJournal();
    renderDialogue();
  };

  const closeDialogue = () => {
    talking = null;
    dialogue.classList.remove('open');
    delete dialogue.dataset['npc'];
  };

  tracker.addEventListener('click', () => {
    onOpen();
    journal.classList.add('open');
    renderJournal();
  });
  state.onChange(render);
  render();

  return {
    setRoom(r) {
      room = r;
      renderTracker();
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
    toggleJournal() {
      const open = !journal.classList.contains('open');
      if (open) onOpen();
      journal.classList.toggle('open', open);
      renderJournal();
    },
    closeJournal() {
      journal.classList.remove('open');
    },
    isJournalOpen: () => journal.classList.contains('open'),
  };
}
