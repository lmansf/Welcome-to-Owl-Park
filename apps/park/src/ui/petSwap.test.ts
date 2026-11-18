import { describe, expect, it } from 'vitest';
import { PET_SWAP_WORDS, canSwapPet, nextPet, ownedPets, swapWords } from './petSwap';

const EGG = 'painted-egg~0';
const BUNNY = 'rainbow-bunny~0';

describe('swapping the worn pet in one tap (OP-263)', () => {
  it('lists only the pets an owl holds, once each, in catalogue order', () => {
    expect(ownedPets([BUNNY, 'leaf-crown~0', EGG, BUNNY])).toEqual([EGG, BUNNY]);
    expect(ownedPets(['leaf-crown~0'])).toEqual([]);
  });

  it('is offered with two pets or more, never to an owl with only the egg', () => {
    expect(canSwapPet([EGG, BUNNY])).toBe(true);
    expect(canSwapPet([EGG])).toBe(false);
    expect(canSwapPet([])).toBe(false);
  });

  it('goes egg, bunny, no pet, and round again', () => {
    const pets = [EGG, BUNNY];
    expect(nextPet(pets, EGG)).toBe(BUNNY);
    expect(nextPet(pets, BUNNY)).toBeNull();
    expect(nextPet(pets, undefined)).toBe(EGG);
  });

  it('starts from the first pet when the one worn is not one the owl holds', () => {
    expect(nextPet([EGG, BUNNY], 'hedgehog~0')).toBe(EGG);
  });

  it('says which pet is on now, by its name', () => {
    expect(swapWords(BUNNY)).toBe('Rainbow Bunny is walking with you now');
    expect(swapWords(null)).toBe(PET_SWAP_WORDS.none);
  });
});
