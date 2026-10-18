import { describe, expect, it } from 'vitest';
import { categoryFromOffTags, categoryOf } from './categories';

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
  it('ignores the plant-based "...-and-beverages" parent tag', () => {
    expect(categoryFromOffTags(['en:plant-based-foods-and-beverages', 'en:cereals-and-potatoes', 'en:breads'])).toBe('Brot & Backwaren');
  });
  it('puts canned vegetables into Vorrat', () => {
    expect(categoryFromOffTags(['en:plant-based-foods-and-beverages', 'en:canned-foods', 'en:canned-vegetables', 'en:vegetables'])).toBe('Vorrat & Konserven');
  });
  it('puts milk chocolate into Snacks', () => {
    expect(categoryFromOffTags(['en:snacks', 'en:sweet-snacks', 'en:chocolates', 'en:milk-chocolates'])).toBe('Snacks & Süßes');
  });
});

describe('categoryOf', () => {
  it('keeps known categories and maps unknown ones to Sonstiges', () => {
    expect(categoryOf('Tiefkühl')).toBe('Tiefkühl');
    expect(categoryOf('Gibt es nicht')).toBe('Sonstiges');
  });
});
