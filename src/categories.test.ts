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
    expect(categoryFromOffTags(['en:plant-based-foods-and-beverages', 'en:canned-foods', 'en:canned-vegetables', 'en:vegetables'])).toBe('Konserven');
  });
  it('puts pesto into Pastasaucen, not Saucen or Konserven', () => {
    expect(categoryFromOffTags(['en:condiments', 'en:sauces', 'en:pestos', 'en:canned-foods'])).toBe('Pastasaucen & Pesto');
  });
  it('puts spices and capers before the condiments parent', () => {
    expect(categoryFromOffTags(['en:condiments', 'en:herbs-and-spices', 'en:spices'])).toBe('Gewürze & Kräuter');
    expect(categoryFromOffTags(['en:condiments', 'en:capers'])).toBe('Eingelegtes');
  });
  it('puts salted nuts into Nüsse, not Snacks', () => {
    expect(categoryFromOffTags(['en:snacks', 'en:salty-snacks', 'en:nuts-and-their-products', 'en:nuts'])).toBe('Nüsse & Trockenobst');
  });
  it('keeps butter in Milchprodukte although it is a spread', () => {
    expect(categoryFromOffTags(['en:dairies', 'en:spreads', 'en:spreadable-fats', 'en:butters'])).toBe('Milchprodukte');
  });
  it('puts hummus into Aufstriche and canned beans into Konserven', () => {
    expect(categoryFromOffTags(['en:spreads', 'en:salted-spreads', 'en:hummus'])).toBe('Aufstriche');
    expect(categoryFromOffTags(['en:canned-foods', 'en:legumes', 'en:beans'])).toBe('Konserven');
    expect(categoryFromOffTags(['en:legumes', 'en:lentils'])).toBe('Nudeln, Reis & Trockenware');
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
