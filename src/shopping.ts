import { CATEGORIES, categoryOf } from './categories';
import { lowStock } from './inventory';
import type { Product, ShoppingItem, StockItem } from './types';

export interface Suggestion {
  product: Product;
  quantity: number; // missing amount up to the minimum
}

/** Products below their minimum that are not on the list yet. */
export function suggestions(products: Product[], stock: StockItem[], items: ShoppingItem[]): Suggestion[] {
  const onList = new Set(items.map((item) => item.product_id));
  return lowStock(products, stock)
    .filter(({ product }) => !onList.has(product.id))
    .map(({ product, total }) => ({ product, quantity: product.min_stock - total }));
}

export interface ItemGroup {
  title: string;
  items: ShoppingItem[];
}

const byName = (a: ShoppingItem, b: ShoppingItem) => a.name.localeCompare(b.name, 'de');

/** Open items grouped by product category (free text under Sonstiges); checked items separately. */
export function arrangeList(items: ShoppingItem[], products: Product[]): { open: ItemGroup[]; checked: ShoppingItem[] } {
  const categoryById = new Map(products.map((p) => [p.id, categoryOf(p.category)]));
  const categoryOfItem = (item: ShoppingItem) => (item.product_id && categoryById.get(item.product_id)) || 'Sonstiges';
  const open = items.filter((item) => !item.checked);
  return {
    open: CATEGORIES.map((title) => ({ title, items: open.filter((item) => categoryOfItem(item) === title).sort(byName) })).filter(
      (g) => g.items.length,
    ),
    checked: items.filter((item) => item.checked).sort(byName),
  };
}

export interface FinishRow {
  item: ShoppingItem;
  book: boolean;
  quantity: number;
  bestBefore: string; // '' = no date
}

export interface Booking {
  item_id: string;
  quantity: number;
  best_before: string | null;
}

/** Rows of the finish sheet: checked items; products are booked by default, free text is not. */
export function initialFinishRows(items: ShoppingItem[]): FinishRow[] {
  return items
    .filter((item) => item.checked)
    .map((item) => ({ item, book: item.product_id !== null, quantity: item.quantity, bestBefore: '' }));
}

export function buildBookings(rows: FinishRow[]): Booking[] {
  return rows.filter((r) => r.book).map((r) => ({ item_id: r.item.id, quantity: r.quantity, best_before: r.bestBefore || null }));
}
