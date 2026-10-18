export type FillLevel = 'voll' | 'angebrochen' | 'fast_leer';

export interface Product {
  id: string;
  name: string;
  barcode: string | null;
  category: string;
  min_stock: number;
  created_at: string;
}

export interface StockItem {
  id: string;
  product_id: string;
  quantity: number;
  best_before: string | null; // ISO date YYYY-MM-DD
  fill_level: FillLevel;
  planned_for: string | null;
  created_at: string;
}

export interface Toast {
  text: string;
  undo?: () => Promise<void>;
}
export type Notify = (toast: Toast) => void;
export type ChangeKind = 'consume' | 'advance';
export type ChangeFn = (kind: ChangeKind, item: StockItem, product: Product) => Promise<void>;

export interface ShoppingList {
  id: string;
  created_at: string;
  finished_at: string | null;
}

export interface ShoppingItem {
  id: string;
  list_id: string;
  product_id: string | null; // null = free text
  name: string;
  quantity: number;
  checked: boolean;
  created_at: string;
}

export interface Booking {
  item_id: string;
  quantity: number;
  best_before: string | null;
}
