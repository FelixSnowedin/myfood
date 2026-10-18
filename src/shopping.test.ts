import { describe, expect, it } from 'vitest';
import { arrangeList, buildBookings, initialFinishRows, suggestions } from './shopping';
import type { Product, ShoppingItem, StockItem } from './types';

const p = (id: string, name: string, category = 'Sonstiges', min_stock = 0): Product =>
  ({ id, name, barcode: null, category, min_stock, created_at: '2026-10-01T00:00:00Z' });
const s = (id: string, product_id: string, quantity: number): StockItem =>
  ({ id, product_id, quantity, best_before: null, fill_level: 'voll', planned_for: null, created_at: '2026-10-01T00:00:00Z' });
const i = (id: string, name: string, product_id: string | null, quantity = 1, checked = false): ShoppingItem =>
  ({ id, list_id: 'l1', product_id, name, quantity, checked, created_at: '2026-10-01T00:00:00Z' });

describe('suggestions', () => {
  const products = [p('p1', 'Milch', 'Milchprodukte', 3), p('p2', 'Butter', 'Milchprodukte', 1), p('p3', 'Eier', 'Sonstiges', 0)];
  const stock = [s('a', 'p1', 1)];

  it('suggests the missing amount for products below their minimum', () => {
    expect(suggestions(products, stock, []).map((x) => [x.product.name, x.quantity])).toEqual([['Butter', 1], ['Milch', 2]]);
  });
  it('leaves out products already on the list', () => {
    expect(suggestions(products, stock, [i('i1', 'Milch', 'p1')]).map((x) => x.product.name)).toEqual(['Butter']);
  });
});

describe('arrangeList', () => {
  const products = [p('p1', 'Milch', 'Milchprodukte'), p('p2', 'Äpfel', 'Obst & Gemüse'), p('p3', 'Joghurt', 'Milchprodukte')];

  it('groups open items by category in fixed order, free text and unknown products under Sonstiges', () => {
    const items = [i('i1', 'Milch', 'p1'), i('i2', 'Grillkohle', null), i('i3', 'Äpfel', 'p2'), i('i4', 'Joghurt', 'p3'), i('i5', 'Weg', 'gone')];
    expect(arrangeList(items, products).open.map((g) => [g.title, g.items.map((x) => x.id)])).toEqual([
      ['Milchprodukte', ['i4', 'i1']],
      ['Obst & Gemüse', ['i3']],
      ['Sonstiges', ['i2', 'i5']],
    ]);
  });
  it('puts checked items separately, sorted by name', () => {
    const items = [i('i1', 'Milch', 'p1', 1, true), i('i2', 'Äpfel', 'p2', 1, true), i('i3', 'Joghurt', 'p3')];
    const result = arrangeList(items, products);
    expect(result.checked.map((x) => x.id)).toEqual(['i2', 'i1']);
    expect(result.open.flatMap((g) => g.items.map((x) => x.id))).toEqual(['i3']);
  });
});

describe('finish rows', () => {
  const items = [i('i1', 'Milch', 'p1', 2, true), i('i2', 'Grillkohle', null, 1, true), i('i3', 'Käse', 'p3', 1, false)];

  it('starts with checked items only; products booked, free text not', () => {
    expect(initialFinishRows(items).map((r) => [r.item.id, r.book, r.quantity, r.bestBefore])).toEqual([
      ['i1', true, 2, ''],
      ['i2', false, 1, ''],
    ]);
  });
  it('builds bookings for rows marked to book, empty date as null', () => {
    const rows = initialFinishRows(items);
    rows[1] = { ...rows[1], book: true, bestBefore: '2026-11-01' };
    expect(buildBookings(rows)).toEqual([
      { item_id: 'i1', quantity: 2, best_before: null },
      { item_id: 'i2', quantity: 1, best_before: '2026-11-01' },
    ]);
  });
});
