import { describe, expect, it } from 'vitest';
import {
  currentPlan,
  findSameRecipe,
  findSimilarRecipe,
  itemTag,
  norm,
  planLines,
  planRecipe,
  plannedAliases,
  plannedRecipes,
  recentRecipes,
  recipeIdeas,
  searchRecipes,
  shrinkReserved,
  similar,
} from './recipes';
import type { Product, Recipe, ShoppingItem, StockItem } from './types';

const p = (id: string, name: string): Product => ({ id, name, barcode: null, category: 'Sonstiges', min_stock: 0, created_at: '2026-10-01T00:00:00Z' });
const s = (id: string, product_id: string, quantity: number, planned_for: string | null = null): StockItem =>
  ({ id, product_id, quantity, best_before: null, fill_level: 'voll', planned_for, created_at: '2026-10-01T00:00:00Z' });
const i = (id: string, name: string, product_id: string | null, quantity = 1, reserved: Record<string, number> = {}, checked = false): ShoppingItem =>
  ({ id, list_id: 'l1', product_id, name, quantity, checked, reserved, created_at: '2026-10-01T00:00:00Z' });
const r = (id: string, name: string, items: [string | null, string, number][] = [], last_used_at: string | null = null): Recipe =>
  ({ id, name, items: items.map(([product_id, n, quantity]) => ({ product_id, name: n, quantity })), last_used_at, created_at: '2026-10-01T00:00:00Z' });

const products = [p('hack', 'Hackfleisch'), p('zw', 'Zwiebeln'), p('mozz', 'Mozzarella'), p('tom', 'Tomaten')];

describe('norm and similar names', () => {
  it('cleans case, accents, punctuation and filler words', () => {
    expect(norm('  Pizza am Freitag! ')).toBe('pizza freitag');
    expect(norm('Gemüse-Curry für Gäste')).toBe('gemuse curry gaste');
  });
  it('finds equal, contained and slightly misspelled recipe names', () => {
    const recipes = [r('1', 'Lasagne'), r('2', 'Chili con carne')];
    expect(findSimilarRecipe(recipes, 'lasagna')?.id).toBe('1');
    expect(findSimilarRecipe(recipes, 'Chili')?.id).toBe('2');
    expect(findSimilarRecipe(recipes, 'Risotto')).toBeUndefined();
    expect(findSimilarRecipe(recipes, 'Lasagne', '1')).toBeUndefined();
  });
  it('compares word by word: typos only inside longer words, no partial words', () => {
    expect(similar('chili con carne', 'chili sin carne')).toBe(false);
    expect(similar('pizza', 'pizza freitag')).toBe(true);
    expect(similar('reis', 'reissalat')).toBe(false);
    expect(similar('gemusecurry', 'gemuesecurry')).toBe(true);
    expect(similar('', 'pizza')).toBe(false);
  });
  it('prefers the recipe with the same name over a merely similar one', () => {
    const recipes = [r('1', 'Chili con carne'), r('2', 'Chili')];
    expect(findSimilarRecipe(recipes, 'chili!')?.id).toBe('2');
    expect(findSameRecipe(recipes, 'Chili sin carne')).toBeUndefined();
    expect(findSameRecipe(recipes, ' chili CON carne')?.id).toBe('1');
  });
});

describe('recent and search', () => {
  const recipes = [r('1', 'Lasagne', [], '2026-10-20'), r('2', 'Chili', [], '2026-10-27'), r('3', 'Risotto'), r('4', 'Omelett')];
  it('puts the most recently used first, never used ones by name', () => {
    expect(recentRecipes(recipes, 3).map((x) => x.name)).toEqual(['Chili', 'Lasagne', 'Omelett']);
  });
  it('searches from two letters, ignoring case and accents', () => {
    expect(searchRecipes(recipes, 'r')).toEqual([]);
    expect(searchRecipes(recipes, 'RIS').map((x) => x.name)).toEqual(['Risotto']);
  });
});

describe('planRecipe', () => {
  const lasagne = r('1', 'Lasagne', [['hack', 'Hackfleisch', 1], ['zw', 'Zwiebeln', 1], ['mozz', 'Mozzarella', 2], [null, 'Basilikum', 1]]);

  it('unchecks what is free in stock, checks what is missing', () => {
    const rows = planRecipe(lasagne, products, [s('a', 'zw', 3)], []);
    expect(rows.map((x) => [x.ingredient.name, x.checked, x.add, x.note])).toEqual([
      ['Hackfleisch', true, 1, ''],
      ['Zwiebeln', false, 1, '3× im Bestand'],
      ['Mozzarella', true, 2, ''],
      ['Basilikum', true, 1, ''],
    ]);
  });
  it('does not count stock planned for something else or list quantity reserved for another recipe', () => {
    const stock = [s('a', 'mozz', 1, 'Pizza')];
    const items = [i('i1', 'Hackfleisch', 'hack', 1, { Chili: 1 })];
    const rows = planRecipe(lasagne, products, stock, items);
    expect(rows[0]).toMatchObject({ checked: true, add: 1, note: '1× auf dem Zettel für Chili' });
    expect(rows[2]).toMatchObject({ checked: true, add: 2, note: '1× im Bestand für Pizza' });
  });
  it('counts free list quantity and only adds what is still missing', () => {
    const rows = planRecipe(lasagne, products, [], [i('i1', 'Mozzarella', 'mozz', 1)]);
    expect(rows[2]).toMatchObject({ checked: true, add: 1, note: '1× schon auf dem Zettel' });
  });
  it('counts what is already planned for this recipe (also under a similar text) and leaves it alone', () => {
    const stock = [s('a', 'mozz', 1, 'lasagna am Sonntag'), s('b', 'mozz', 1, 'Pizza')];
    const items = [i('i1', 'Hackfleisch', 'hack', 1, { Lasagne: 1 })];
    const rows = planRecipe(lasagne, products, stock, items);
    expect(rows[0]).toMatchObject({ mine: 1, checked: false, note: '1× schon für Lasagne vorgemerkt' });
    expect(rows[2]).toMatchObject({ mine: 1, checked: true, add: 1, note: '1× schon für Lasagne vorgemerkt · 1× im Bestand für Pizza' });
    expect(planLines(rows).slice(0, 3).map((l) => [l.add, l.quantity])).toEqual([[0, 0], [1, 1], [1, 1]]);
  });
  it('matches free-text ingredients to products by name', () => {
    const recipe = r('2', 'X', [[null, 'zwiebeln', 1]]);
    expect(planRecipe(recipe, products, [s('a', 'zw', 1)], [])[0]).toMatchObject({ checked: false, product: { id: 'zw' } });
  });
  it('turns rows into plan lines: unchecked rows add nothing', () => {
    const rows = planRecipe(lasagne, products, [s('a', 'zw', 3)], []);
    expect(planLines(rows).slice(0, 2)).toEqual([
      { product_id: 'hack', name: 'Hackfleisch', add: 1, quantity: 1 },
      { product_id: 'zw', name: 'Zwiebeln', add: 0, quantity: 1 },
    ]);
  });
});

describe('current plan and planned recipes', () => {
  const items = [i('i1', 'Hackfleisch', 'hack', 2, { Lasagne: 1, Chili: 1 }), i('i2', 'Mozzarella', 'mozz', 2, { Lasagne: 2 }, true)];
  const stock = [s('a', 'zw', 1, 'Lasagne'), s('b', 'tom', 1, 'Pizza'), s('c', 'hack', 1, 'Lasagne')];

  it('collects what is reserved on the open list and planned in stock', () => {
    expect(currentPlan('Lasagne', items, stock, products)).toEqual([
      { product_id: 'hack', name: 'Hackfleisch', add: 1, quantity: 2 },
      { product_id: 'zw', name: 'Zwiebeln', add: 0, quantity: 1 },
    ]);
  });
  it('lists recipes from open items and stock, stock only for texts that mean a recipe', () => {
    expect(plannedRecipes([r('1', 'Lasagne')], items, stock)).toEqual(['Chili', 'Lasagne']);
    const lasagnaOnly = [s('a', 'zw', 1, 'lasagna am Sonntag')];
    expect(plannedRecipes([r('1', 'Lasagne')], [], lasagnaOnly)).toEqual(['Lasagne']);
  });
  it('finds other texts meaning a recipe and includes them in its current plan', () => {
    const withAlias = [...stock, s('d', 'mozz', 2, 'lasagna am Sonntag')];
    const recipes = [r('1', 'Lasagne'), r('2', 'Pizza')];
    expect(plannedAliases(recipes, 'Lasagne', withAlias)).toEqual(['lasagna am Sonntag']);
    expect(plannedAliases(recipes, 'Pizza', withAlias)).toEqual([]);
    expect(currentPlan('Lasagne', [], withAlias, products, ['lasagna am Sonntag']).map((l) => [l.name, l.quantity])).toEqual([
      ['Zwiebeln', 1],
      ['Hackfleisch', 1],
      ['Mozzarella', 2],
    ]);
  });
});

describe('item tags and shrinking', () => {
  it('describes reservations', () => {
    expect(itemTag(i('i1', 'Hack', 'hack', 1, { Lasagne: 1 }))).toBe('für Lasagne');
    expect(itemTag(i('i1', 'Hack', 'hack', 3, { Lasagne: 1, Chili: 1 }))).toBe('1× Lasagne · 1× Chili · 1× frei');
    expect(itemTag(i('i1', 'Hack', 'hack', 1))).toBe('');
  });
  it('takes free units first, then the latest reservation', () => {
    expect(shrinkReserved({ Lasagne: 1, Chili: 1 }, 2)).toEqual({ Lasagne: 1, Chili: 1 });
    expect(shrinkReserved({ Lasagne: 1, Chili: 1 }, 1)).toEqual({ Lasagne: 1 });
    expect(shrinkReserved({ Lasagne: 2 }, 1)).toEqual({ Lasagne: 1 });
    expect(shrinkReserved(undefined, 1)).toEqual({});
  });
});

describe('recipeIdeas', () => {
  it('suggests a recipe from 2+ products planned for a similar text', () => {
    const stock = [s('a', 'mozz', 1, 'Pizza'), s('b', 'tom', 2, 'pizza am Freitag'), s('c', 'zw', 1, 'Suppe')];
    expect(recipeIdeas(products, stock, [], new Set())).toEqual([
      { kind: 'new', key: 'pizza', name: 'Pizza', items: [{ product_id: 'mozz', name: 'Mozzarella', quantity: 1 }, { product_id: 'tom', name: 'Tomaten', quantity: 2 }] },
    ]);
  });
  it('needs two different products for a new recipe and skips dismissed ideas', () => {
    const twice = [s('a', 'mozz', 1, 'Pizza'), s('b', 'mozz', 1, 'Pizza')];
    expect(recipeIdeas(products, twice, [], new Set())).toEqual([]);
    const stock = [s('a', 'mozz', 1, 'Lasagna'), s('b', 'tom', 1, 'Lasagne')];
    expect(recipeIdeas(products, stock, [], new Set(['lasagna']))).toEqual([]);
  });
  it('suggests extending an existing recipe with products planned for it but missing in it', () => {
    const lasagne = r('1', 'Lasagne', [['mozz', 'Mozzarella', 2]]);
    const stock = [s('a', 'mozz', 1, 'Lasagne'), s('b', 'tom', 2, 'lasagna am Sonntag'), s('c', 'zw', 1, 'Lasagne')];
    const ideas = recipeIdeas(products, stock, [lasagne], new Set());
    expect(ideas.map((x) => [x.kind, x.key, x.name, x.items.map((i) => i.name)])).toEqual([['extend', '1:tom,zw', 'Lasagne', ['Tomaten', 'Zwiebeln']]]);
    expect(recipeIdeas(products, stock, [lasagne], new Set(['1:tom,zw']))).toEqual([]);
    // a further missing product brings the idea back
    const more = [...stock, s('d', 'hack', 1, 'Lasagne')];
    expect(recipeIdeas(products, more, [lasagne], new Set(['1:tom,zw'])).map((x) => x.key)).toEqual(['1:hack,tom,zw']);
  });
});
