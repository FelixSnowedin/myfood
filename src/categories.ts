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

// Exact Open Food Facts tags; first match wins. Substrings would misfire,
// e.g. "beverages" inside "en:plant-based-foods-and-beverages".
const OFF_TAGS: [string, Category][] = [
  ['en:frozen-foods', 'Tiefkühl'],
  ['en:canned-foods', 'Vorrat & Konserven'],
  ['en:beverages', 'Getränke'],
  ['en:snacks', 'Snacks & Süßes'],
  ['en:chocolates', 'Snacks & Süßes'],
  ['en:confectioneries', 'Snacks & Süßes'],
  ['en:dairies', 'Milchprodukte'],
  ['en:cheeses', 'Milchprodukte'],
  ['en:yogurts', 'Milchprodukte'],
  ['en:milks', 'Milchprodukte'],
  ['en:meats', 'Fleisch & Fisch'],
  ['en:fishes', 'Fleisch & Fisch'],
  ['en:seafood', 'Fleisch & Fisch'],
  ['en:breads', 'Brot & Backwaren'],
  ['en:pastries', 'Brot & Backwaren'],
  ['en:fruits', 'Obst & Gemüse'],
  ['en:vegetables', 'Obst & Gemüse'],
  ['en:fresh-fruits', 'Obst & Gemüse'],
  ['en:fresh-vegetables', 'Obst & Gemüse'],
  ['en:condiments', 'Gewürze & Saucen'],
  ['en:sauces', 'Gewürze & Saucen'],
  ['en:spices', 'Gewürze & Saucen'],
  ['en:pastas', 'Vorrat & Konserven'],
  ['en:rices', 'Vorrat & Konserven'],
  ['en:breakfast-cereals', 'Vorrat & Konserven'],
];

export function categoryFromOffTags(tags: string[]): Category {
  return OFF_TAGS.find(([tag]) => tags.includes(tag))?.[1] ?? 'Sonstiges';
}

/** Unknown category values are treated as Sonstiges. */
export function categoryOf(value: string): Category {
  return (CATEGORIES as readonly string[]).includes(value) ? (value as Category) : 'Sonstiges';
}
