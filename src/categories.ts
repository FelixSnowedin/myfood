// Fridge and freezer first, then the pantry. Kept general for any household;
// empty categories cost nothing.
export const CATEGORIES = [
  'Milchprodukte',
  'Obst & Gemüse',
  'Fleisch & Fisch',
  'Brot & Backwaren',
  'Tiefkühl',
  'Nudeln, Reis & Trockenware',
  'Backzutaten',
  'Konserven',
  'Eingelegtes',
  'Öl & Essig',
  'Gewürze & Kräuter',
  'Saucen & Würzpasten',
  'Pastasaucen & Pesto',
  'Aufstriche',
  'Nüsse & Trockenobst',
  'Snacks & Süßes',
  'Getränke',
  'Sonstiges',
] as const;

export type Category = (typeof CATEGORIES)[number];

// Exact Open Food Facts tags; first match wins. Substrings would misfire,
// e.g. "beverages" inside "en:plant-based-foods-and-beverages".
// OFF adds all parent tags, so specific groups must come before their parents
// (pesto before sauces, spices and capers before condiments, nuts before snacks).
const OFF_TAGS: [string, Category][] = [
  ['en:frozen-foods', 'Tiefkühl'],
  ['en:beverages', 'Getränke'],
  ['en:pestos', 'Pastasaucen & Pesto'],
  ['en:pasta-sauces', 'Pastasaucen & Pesto'],
  ['en:vegetable-oils', 'Öl & Essig'],
  ['en:vinegars', 'Öl & Essig'],
  ['en:pickles', 'Eingelegtes'],
  ['en:capers', 'Eingelegtes'],
  ['en:dairies', 'Milchprodukte'], // before spreads: butter is a dairy spread
  ['en:cheeses', 'Milchprodukte'],
  ['en:yogurts', 'Milchprodukte'],
  ['en:milks', 'Milchprodukte'],
  ['en:sweet-spreads', 'Aufstriche'],
  ['en:salted-spreads', 'Aufstriche'],
  ['en:plant-based-spreads', 'Aufstriche'],
  ['en:jams', 'Aufstriche'],
  ['en:herbs-and-spices', 'Gewürze & Kräuter'],
  ['en:salts', 'Gewürze & Kräuter'],
  ['en:sauces', 'Saucen & Würzpasten'],
  ['en:condiments', 'Saucen & Würzpasten'],
  ['en:nuts', 'Nüsse & Trockenobst'],
  ['en:dried-fruits', 'Nüsse & Trockenobst'],
  ['en:snacks', 'Snacks & Süßes'],
  ['en:chocolates', 'Snacks & Süßes'],
  ['en:confectioneries', 'Snacks & Süßes'],
  ['en:canned-foods', 'Konserven'],
  ['en:meats', 'Fleisch & Fisch'],
  ['en:fishes', 'Fleisch & Fisch'],
  ['en:seafood', 'Fleisch & Fisch'],
  ['en:breads', 'Brot & Backwaren'],
  ['en:pastries', 'Brot & Backwaren'],
  ['en:fruits', 'Obst & Gemüse'],
  ['en:vegetables', 'Obst & Gemüse'],
  ['en:fresh-fruits', 'Obst & Gemüse'],
  ['en:fresh-vegetables', 'Obst & Gemüse'],
  ['en:flours', 'Backzutaten'],
  ['en:sugars', 'Backzutaten'],
  ['en:baking-powders', 'Backzutaten'],
  ['en:baking-mixes', 'Backzutaten'],
  ['en:cocoa-powders', 'Backzutaten'],
  ['en:pastas', 'Nudeln, Reis & Trockenware'],
  ['en:rices', 'Nudeln, Reis & Trockenware'],
  ['en:cereal-grains', 'Nudeln, Reis & Trockenware'],
  ['en:breakfast-cereals', 'Nudeln, Reis & Trockenware'],
  ['en:legumes', 'Nudeln, Reis & Trockenware'], // canned ones matched Konserven above
];

export function categoryFromOffTags(tags: string[]): Category {
  return OFF_TAGS.find(([tag]) => tags.includes(tag))?.[1] ?? 'Sonstiges';
}

/** Unknown category values are treated as Sonstiges. */
export function categoryOf(value: string): Category {
  return (CATEGORIES as readonly string[]).includes(value) ? (value as Category) : 'Sonstiges';
}
