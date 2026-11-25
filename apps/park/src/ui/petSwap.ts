/**
 * Swapping the worn pet in one tap (OP-263, D7): a tap on the owl's own pet, for an
 * owl that holds two pets or more, offers Swap pet beside the owl's other actions for a few seconds; each
 * press puts on the next pet it owns, in catalogue order, then no pet, then the first again. The choice is
 * an ordinary wardrobe change (the room checks it as any look), so it lasts a reload. An owl with one pet
 * or none is offered nothing: the wardrobe's pet slot is enough.
 */
import { allVariants, parseVariant, variantName } from '@owl-park/shared';

/** How long Swap pet stays offered after a tap on the pet, or after the last swap. */
export const PET_SWAP_MS = 6000;

export const PET_SWAP_WORDS = {
  swap: 'Swap pet',
  /** Said once the new pet is on. */
  now: (name: string) => `${name} is walking with you now`,
  none: 'No pet with you for now',
} as const;

let order: Map<string, number> | null = null;
const rank = (id: string): number => {
  if (!order) order = new Map(allVariants().map((v, i) => [v, i]));
  return order.get(id) ?? Number.MAX_SAFE_INTEGER;
};

/** The pets an owl holds, each once, in catalogue order. */
export function ownedPets(owned: readonly string[]): string[] {
  return [...new Set(owned)].filter((id) => parseVariant(id)?.item.kind === 'pet').sort((a, b) => rank(a) - rank(b));
}

/** Whether Swap pet is offered: two pets or more to swap between. */
export function canSwapPet(pets: readonly string[]): boolean {
  return pets.length >= 2;
}

/** The pet a press of Swap pet puts on after `current`: the next owned one, then none, then the first. */
export function nextPet(pets: readonly string[], current: string | undefined): string | null {
  const cycle: Array<string | null> = [...pets, null];
  const at = cycle.indexOf(current ?? null);
  return at < 0 ? (pets[0] ?? null) : cycle[(at + 1) % cycle.length]!;
}

/** What the owl hears once the pet is swapped. */
export function swapWords(pet: string | null): string {
  return pet ? PET_SWAP_WORDS.now(variantName(pet)) : PET_SWAP_WORDS.none;
}
