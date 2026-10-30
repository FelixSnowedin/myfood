import { CATEGORIES, categoryOf } from './categories';
import type { ChangeKind, FillLevel, Product, StockItem } from './types';

export const FILL_LABEL: Record<FillLevel, string> = { voll: 'voll', angebrochen: 'angebrochen', fast_leer: 'fast leer' };

const NO_DATE = '9999-12-31';
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const byDate = (a: StockItem, b: StockItem) => cmp(a.best_before ?? NO_DATE, b.best_before ?? NO_DATE);
const byName = (a: Row, b: Row) => a.product.name.localeCompare(b.product.name, 'de');

export function todayISO(now = new Date()): string {
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Today + mean learned days, rounded down (rather too early than too late); '' if nothing learned yet. */
export function suggestBestBefore(product: Product | undefined, today: string): string {
  if (!product?.mhd_days_count) return '';
  return addDays(today, Math.floor((product.mhd_days_sum ?? 0) / product.mhd_days_count));
}

export function formatDate(iso: string): string {
  return iso.split('-').reverse().join('.');
}

export type ExpiryStatus = 'expired' | 'soon' | 'ok' | 'none';

export function expiryStatus(bestBefore: string | null, today: string): ExpiryStatus {
  if (!bestBefore) return 'none';
  if (bestBefore < today) return 'expired';
  if (bestBefore <= addDays(today, 3)) return 'soon';
  return 'ok';
}

export function nextFill(level: FillLevel): FillLevel | null {
  if (level === 'voll') return 'angebrochen';
  if (level === 'angebrochen') return 'fast_leer';
  return null;
}

/** Toast text for a change, computed from the row as it was before. */
export function describeChange(kind: ChangeKind, prev: StockItem, name: string): string {
  const next = kind === 'advance' ? nextFill(prev.fill_level) : null;
  return next ? `${name}: ${FILL_LABEL[next]}` : `${name} −1 (noch ${prev.quantity - 1})`;
}

export function findProductByName(products: Product[], name: string): Product | undefined {
  const wanted = name.trim().toLowerCase();
  return products.find((p) => p.name.trim().toLowerCase() === wanted);
}

/** Free stock before stock planned for something ("Geplant für"), then the soonest MHD. */
export function pickConsumeTarget(stock: StockItem[], productId: string): StockItem | undefined {
  return stock.filter((s) => s.product_id === productId).sort((a, b) => Number(!!a.planned_for) - Number(!!b.planned_for) || byDate(a, b))[0];
}

export interface LowStock {
  product: Product;
  total: number;
}

export function lowStock(products: Product[], stock: StockItem[]): LowStock[] {
  const totals = new Map<string, number>();
  for (const s of stock) totals.set(s.product_id, (totals.get(s.product_id) ?? 0) + s.quantity);
  return products
    .map((product) => ({ product, total: totals.get(product.id) ?? 0 }))
    .filter(({ product, total }) => product.min_stock > 0 && total < product.min_stock)
    .sort((a, b) => a.product.name.localeCompare(b.product.name, 'de'));
}

export type Row = StockItem & { product: Product };
export type SortKey = 'mhd' | 'name' | 'neu';

export interface ViewOptions {
  search: string;
  category: string; // '' = all
  sort: SortKey;
  group: boolean;
}

export interface Group {
  title: string; // '' when ungrouped
  rows: Row[];
}

const COMPARE: Record<SortKey, (a: Row, b: Row) => number> = {
  mhd: (a, b) => byDate(a, b) || byName(a, b),
  name: (a, b) => byName(a, b) || byDate(a, b),
  neu: (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
};

export function buildView(products: Product[], stock: StockItem[], opts: ViewOptions): Group[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  const query = opts.search.trim().toLowerCase();
  const rows = stock
    .flatMap((s) => {
      const product = byId.get(s.product_id);
      return product ? [{ ...s, product }] : [];
    })
    .filter((r) => !query || r.product.name.toLowerCase().includes(query))
    .filter((r) => !opts.category || categoryOf(r.product.category) === opts.category)
    .sort(COMPARE[opts.sort]);

  if (!opts.group) return rows.length ? [{ title: '', rows }] : [];
  return CATEGORIES.map((title) => ({ title, rows: rows.filter((r) => categoryOf(r.product.category) === title) })).filter((g) => g.rows.length);
}
