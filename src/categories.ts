export const CATEGORIES = [
  'Milchprodukte',
  'Obst & Gemüse',
  'Fleisch & Fisch',
  'Brot & Backwaren',
  'Tiefkühl',
  'Vorrat & Konserven',
  'Getränke',
  'Snacks & Süßes',
  'Gewürze & Saucen',
  'Sonstiges',
] as const;

export type Category = (typeof CATEGORIES)[number];

// Order matters: first keyword found in any tag wins.
const OFF_KEYWORDS: [string, Category][] = [
  ['frozen', 'Tiefkühl'],
  ['beverages', 'Getränke'],
  ['snacks', 'Snacks & Süßes'],
  ['sweets', 'Snacks & Süßes'],
  ['chocolates', 'Snacks & Süßes'],
  ['dairies', 'Milchprodukte'],
  ['cheeses', 'Milchprodukte'],
  ['yogurts', 'Milchprodukte'],
  ['milks', 'Milchprodukte'],
  ['meats', 'Fleisch & Fisch'],
  ['fishes', 'Fleisch & Fisch'],
  ['seafood', 'Fleisch & Fisch'],
  ['fruits', 'Obst & Gemüse'],
  ['vegetables', 'Obst & Gemüse'],
  ['breads', 'Brot & Backwaren'],
  ['pastries', 'Brot & Backwaren'],
  ['condiments', 'Gewürze & Saucen'],
  ['sauces', 'Gewürze & Saucen'],
  ['spices', 'Gewürze & Saucen'],
  ['canned', 'Vorrat & Konserven'],
  ['cereals', 'Vorrat & Konserven'],
  ['pastas', 'Vorrat & Konserven'],
  ['rices', 'Vorrat & Konserven'],
];

export function categoryFromOffTags(tags: string[]): Category {
  for (const [keyword, category] of OFF_KEYWORDS) {
    if (tags.some((tag) => tag.includes(keyword))) return category;
  }
  return 'Sonstiges';
}
