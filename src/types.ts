export type FillLevel = 'voll' | 'angebrochen' | 'fast_leer';

export interface Product {
  id: string;
  name: string;
  barcode: string | null;
  category: string;
  min_stock: number;
  created_at: string;
  // Missing until supabase/2026-10-28-mhd-vorschlag.sql has been run.
  mhd_days_sum?: number;
  mhd_days_count?: number;
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
  // Recipe name → quantity reserved for it; the rest is free. Missing until supabase/2026-10-28-rezepte.sql has been run.
  reserved?: Record<string, number>;
}

export interface Booking {
  item_id: string;
  quantity: number;
  best_before: string | null;
  planned_for: string | null;
}

export interface RecipeIngredient {
  product_id: string | null; // null = free text
  name: string;
  quantity: number;
}

export interface Recipe {
  id: string;
  name: string;
  items: RecipeIngredient[];
  last_used_at: string | null;
  created_at: string;
}
