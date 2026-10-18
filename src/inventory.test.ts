import { describe, expect, it } from 'vitest';
import {
  addDays, buildView, describeChange, expiryStatus, findProductByName, formatDate, lowStock, pickConsumeTarget, todayISO,
} from './inventory';
import type { Product, StockItem } from './types';

const p = (id: string, name: string, category = 'Sonstiges', min_stock = 0): Product =>
  ({ id, name, barcode: null, category, min_stock, created_at: '2026-10-01T00:00:00Z' });
const s = (id: string, product_id: string, quantity: number, best_before: string | null, created_at = '2026-10-01T00:00:00Z'): StockItem =>
  ({ id, product_id, quantity, best_before, fill_level: 'voll', planned_for: null, created_at });

describe('dates', () => {
  it('adds days across month boundaries', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
  });
  it('adds days across year boundaries', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
  });
  it('takes today from the local calendar date', () => {
    expect(todayISO(new Date(2026, 9, 18, 23, 30))).toBe('2026-10-18');
  });
  it('classifies expiry relative to today', () => {
    const today = '2026-10-18';
    expect(expiryStatus(null, today)).toBe('none');
    expect(expiryStatus('2026-10-17', today)).toBe('expired');
    expect(expiryStatus('2026-10-18', today)).toBe('soon');
    expect(expiryStatus('2026-10-21', today)).toBe('soon');
    expect(expiryStatus('2026-10-22', today)).toBe('ok');
  });
  it('formats ISO dates German style', () => {
    expect(formatDate('2026-10-05')).toBe('05.10.2026');
  });
});

describe('describeChange', () => {
  const prev = { ...s('s1', 'p1', 3, null) };
  it('describes consume', () => {
    expect(describeChange('consume', prev, 'Milch')).toBe('Milch −1 (noch 2)');
  });
  it('describes a fill level step', () => {
    expect(describeChange('advance', prev, 'Milch')).toBe('Milch: angebrochen');
    expect(describeChange('advance', { ...prev, fill_level: 'angebrochen' }, 'Milch')).toBe('Milch: fast leer');
  });
  it('describes the last fill step as consume', () => {
    expect(describeChange('advance', { ...prev, quantity: 1, fill_level: 'fast_leer' }, 'Milch')).toBe('Milch −1 (noch 0)');
  });
});

describe('findProductByName', () => {
  const products = [p('p1', 'Milch'), p('p2', 'Hafermilch')];
  it('matches case- and whitespace-insensitively', () => {
    expect(findProductByName(products, ' milch ')?.id).toBe('p1');
  });
  it('does not match substrings', () => {
    expect(findProductByName(products, 'Hafer')).toBeUndefined();
  });
});

describe('pickConsumeTarget', () => {
  it('picks the earliest date, undated last, ignores other products', () => {
    const stock = [s('a', 'p1', 1, null), s('b', 'p1', 1, '2026-11-01'), s('c', 'p1', 1, '2026-10-20'), s('d', 'p2', 1, '2026-10-01')];
    expect(pickConsumeTarget(stock, 'p1')?.id).toBe('c');
  });
  it('returns undefined without stock', () => {
    expect(pickConsumeTarget([], 'p1')).toBeUndefined();
  });
});

describe('lowStock', () => {
  it('lists products below their minimum, including empty ones', () => {
    const products = [p('p1', 'Milch', 'Milchprodukte', 2), p('p2', 'Butter', 'Milchprodukte', 1), p('p3', 'Eier', 'Sonstiges', 0), p('p4', 'Mehl', 'Sonstiges', 1)];
    const stock = [s('a', 'p1', 1, null), s('b', 'p3', 1, null), s('c', 'p4', 2, null)];
    expect(lowStock(products, stock).map((l) => [l.product.name, l.total])).toEqual([['Butter', 0], ['Milch', 1]]);
  });
  it('sums all entries of a product', () => {
    const products = [p('p1', 'Milch', 'Milchprodukte', 3), p('p2', 'Butter', 'Milchprodukte', 3)];
    const stock = [s('a', 'p1', 2, '2026-10-20'), s('b', 'p1', 1, '2026-10-25'), s('c', 'p2', 1, '2026-10-20'), s('d', 'p2', 1, null)];
    expect(lowStock(products, stock).map((l) => [l.product.name, l.total])).toEqual([['Butter', 2]]);
  });
});

describe('buildView', () => {
  const products = [p('p1', 'Milch', 'Milchprodukte'), p('p2', 'Apfel', 'Obst & Gemüse'), p('p3', 'Käse', 'Milchprodukte'), p('p4', 'Alt', 'Gibt es nicht')];
  const stock = [
    s('a', 'p1', 1, '2026-10-25', '2026-10-03T00:00:00Z'),
    s('b', 'p2', 1, '2026-10-20', '2026-10-01T00:00:00Z'),
    s('c', 'p3', 1, null, '2026-10-02T00:00:00Z'),
    s('d', 'p1', 1, '2026-10-19', '2026-10-04T00:00:00Z'),
    s('e', 'p4', 1, null),
  ];
  const base = { search: '', category: '', sort: 'mhd' as const, group: true };

  it('groups in category order, sorted by date with undated last', () => {
    const view = buildView(products, stock, base);
    expect(view.map((g) => [g.title, g.rows.map((r) => r.id)])).toEqual([
      ['Milchprodukte', ['d', 'a', 'c']],
      ['Obst & Gemüse', ['b']],
      ['Sonstiges', ['e']],
    ]);
  });
  it('filters by search text and category', () => {
    expect(buildView(products, stock, { ...base, search: 'KÄ' }).flatMap((g) => g.rows.map((r) => r.id))).toEqual(['c']);
    expect(buildView(products, stock, { ...base, category: 'Obst & Gemüse' }).flatMap((g) => g.rows.map((r) => r.id))).toEqual(['b']);
  });
  it('returns one untitled group when ungrouped, sorted by name or newest', () => {
    const byName = buildView(products, stock, { ...base, group: false, sort: 'name' });
    expect(byName).toHaveLength(1);
    expect(byName[0].title).toBe('');
    expect(byName[0].rows.map((r) => r.product.name)).toEqual(['Alt', 'Apfel', 'Käse', 'Milch', 'Milch']);
    const newest = buildView(products, stock, { ...base, group: false, sort: 'neu' });
    expect(newest[0].rows.map((r) => r.id)).toEqual(['d', 'a', 'c', 'b', 'e']);
  });
  it('treats unknown categories as Sonstiges when filtering', () => {
    expect(buildView(products, stock, { ...base, category: 'Sonstiges' }).flatMap((g) => g.rows.map((r) => r.id))).toEqual(['e']);
  });
  it('returns no groups when nothing matches', () => {
    expect(buildView(products, stock, { ...base, search: 'xyz' })).toEqual([]);
    expect(buildView(products, stock, { ...base, search: 'xyz', group: false })).toEqual([]);
  });
});
