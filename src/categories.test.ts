import { describe, expect, it } from 'vitest';
import { categoryFromOffTags } from './categories';

describe('categoryFromOffTags', () => {
  it('maps dairy tags', () => {
    expect(categoryFromOffTags(['en:dairies', 'en:yogurts'])).toBe('Milchprodukte');
  });
  it('prefers frozen over the food type', () => {
    expect(categoryFromOffTags(['en:vegetables', 'en:frozen-foods'])).toBe('Tiefkühl');
  });
  it('prefers beverages over fruits', () => {
    expect(categoryFromOffTags(['en:fruits-based-foods', 'en:beverages', 'en:fruit-juices'])).toBe('Getränke');
  });
  it('falls back to Sonstiges', () => {
    expect(categoryFromOffTags(['en:something-else'])).toBe('Sonstiges');
    expect(categoryFromOffTags([])).toBe('Sonstiges');
  });
});
