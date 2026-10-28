import { describe, expect, it } from 'vitest';
import {
  currentPlan,
  findSimilarRecipe,
  itemTag,
  norm,
  planLines,
  planRecipe,
  plannedRecipes,
  recentRecipes,
  recipeIdeas,
  searchRecipes,
  shrinkReserved,
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
  it('lists recipes from open items and stock, stock only for known recipe names', () => {
    expect(plannedRecipes([r('1', 'Lasagne')], items, stock)).toEqual(['Chili', 'Lasagne']);
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
      { key: 'pizza', name: 'Pizza', items: [{ product_id: 'mozz', name: 'Mozzarella', quantity: 1 }, { product_id: 'tom', name: 'Tomaten', quantity: 2 }] },
    ]);
  });
  it('needs two different products, skips existing recipes and dismissed ideas', () => {
    const twice = [s('a', 'mozz', 1, 'Pizza'), s('b', 'mozz', 1, 'Pizza')];
    expect(recipeIdeas(products, twice, [], new Set())).toEqual([]);
    const stock = [s('a', 'mozz', 1, 'Lasagna'), s('b', 'tom', 1, 'Lasagne')];
    expect(recipeIdeas(products, stock, [r('1', 'Lasagne')], new Set())).toEqual([]);
    expect(recipeIdeas(products, stock, [], new Set(['lasagna']))).toEqual([]);
  });
});
