/**
 * One safe area along the top of the screen (OP-369). Two things share it. Down the left, in the
 * HUD's own flow under the top bar, stand the cards and status chips a visitor is shown one under
 * another: the welcome card, the keepers' ribbon, a guest's "Just looking" badge, an activity's cards
 * on a phone. In the middle stand a course's objective strip and the two-second notices. Each was
 * placed by its own file at a fixed height, so a guest's badge lay over the ribbon's words and the
 * strip lay over the ribbon's end (the owner's audit of Nov 12). Here the middle ones are put under
 * whatever they would lie over, the strip first and the notices under it, and again whenever any of
 * them comes, goes or changes size. The left ones need no placing: they are in the flow.
 *
 * TODO-DOCS (OP-369): docs/CAPACITY.md (the busy ribbon) says the notices move below the ribbon by
 * `ribbon.ts`; they and a course's objective strip are placed here now, under whatever they would
 * lie over. docs/PLAYBOOK.md's "Just looking" badge is under the ribbon and any card, on a computer
 * too. docs/TESTING.md's list of the room server's browser tests gains `hudStack.spec.ts`.
 */

/** A box on the screen, in CSS px. */
export interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** How far apart two chips of the top area stay, in CSS px. */
export const TOP_GAP = 6;

/**
 * The top a chip `wide` across and `tall` takes, set at `left`, so that it lies over none of
 * `others`: `base`, or just under the lowest of those it would touch. A chip moved down past one
 * box is tried again against the rest, so it ends clear of them all.
 */
export function clearTop(chip: { left: number; wide: number; tall: number }, base: number, others: readonly Box[], gap = TOP_GAP): number {
  let top = base;
  for (let moved = true; moved; ) {
    moved = false;
    for (const o of others) {
      const beside = chip.left >= o.right + gap || chip.left + chip.wide <= o.left - gap;
      const apart = top >= o.bottom + gap || top + chip.tall <= o.top - gap;
      if (!beside && !apart) {
        top = o.bottom + gap;
        moved = true;
      }
    }
  }
  return top;
}

/** What stands down the left of the top area (and, on a computer, an activity's cards at its right): whatever of these is on screen. */
const STANDING = '[data-ribbon], .spectator.show, .welcome.show, .nest-welcome.show, .cards > *';
/** What is placed in the middle, in the order it is placed: the course's objective strip, then the notices. */
const STRIP = '#objective-strip';
const NOTICES = '.notices';

const onScreen = (el: Element): Box | null => {
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1 || getComputedStyle(el).visibility === 'hidden') return null;
  return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
};

/**
 * Keeps the top area's middle clear of its left (OP-369): sets `--strip-top` and `--notices-top` on
 * the HUD, which the objective strip and the notices take as their tops, and sets them again
 * whenever one of the area's pieces comes, goes or changes size, or the window does.
 */
export function watchTopStack(root: HTMLElement): { place(): void } {
  const place = () => {
    const bar = root.querySelector('.bar');
    const barBox = bar ? onScreen(bar) : null;
    // Under the top bar; with no bar on screen (the home screen, a full screen over the park) nothing is placed.
    if (!barBox) return;
    const base = Math.round(barBox.bottom) + 8;
    const standing = [...root.querySelectorAll(STANDING)].flatMap((el) => onScreen(el) ?? []);
    const mid = window.innerWidth / 2;
    const strip = root.querySelector<HTMLElement>(STRIP);
    const stripBox = strip ? onScreen(strip) : null;
    const others = [...standing];
    if (strip && stripBox) {
      const wide = stripBox.right - stripBox.left;
      const tall = stripBox.bottom - stripBox.top;
      const top = clearTop({ left: mid - wide / 2, wide, tall }, base, others);
      root.style.setProperty('--strip-top', `${top}px`);
      others.push({ left: mid - wide / 2, right: mid + wide / 2, top, bottom: top + tall });
    }
    const notices = root.querySelector<HTMLElement>(NOTICES);
    const noticesBox = notices ? onScreen(notices) : null;
    // No notice up just now: where the next one will come is set from a notice's usual size.
    const wide = noticesBox ? noticesBox.right - noticesBox.left : 280;
    const tall = noticesBox ? noticesBox.bottom - noticesBox.top : 34;
    root.style.setProperty('--notices-top', `${clearTop({ left: mid - wide / 2, wide, tall }, base, others)}px`);
  };

  const sizes = new ResizeObserver(place);
  const watched = new Set<Element>();
  const watch = () => {
    for (const el of root.querySelectorAll(`.bar, [data-ribbon], .spectator, .welcome, .nest-welcome, .cards, ${STRIP}, ${NOTICES}`)) {
      if (watched.has(el)) continue;
      watched.add(el);
      sizes.observe(el);
    }
    place();
  };
  // Pieces made later (a course's strip, the welcome card) are the HUD's own children: watched as they come.
  new MutationObserver(watch).observe(root, { childList: true });
  window.addEventListener('resize', place);
  watch();
  return { place };
}
