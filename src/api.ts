import { supabase } from './supabase';
import type { Booking } from './shopping';
import type { Product, ShoppingItem, ShoppingList, StockItem } from './types';

async function run<T>(query: PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error(friendly(error));
  return data as T;
}

// Unique-key violations are the DB errors a user can trigger with normal input.
function friendly(error: { message: string; code?: string }): string {
  if (error.code !== '23505') return error.message;
  if (error.message.includes('barcode')) return 'Dieser Barcode gehört schon zu einem anderen Produkt.';
  if (error.message.includes('shopping_items')) return 'Das steht schon auf dem Zettel.';
  return 'Für dieses Produkt gibt es schon einen Eintrag mit diesem MHD. Dort die Menge ändern und diesen Eintrag löschen.';
}

// Fails when nothing matched, e.g. another device deleted the row meanwhile.
async function updateOne(table: 'products' | 'stock', id: string, patch: object, gone: string) {
  const rows = await run<{ id: string }[]>(supabase.from(table).update(patch).eq('id', id).select('id'));
  if (!rows.length) throw new Error(gone);
}

// Functions returning a composite may come back as an all-null object instead of null.
const rowOrNull = (row: StockItem | null) => (row?.id ? row : null);

export const loadProducts = () => run<Product[]>(supabase.from('products').select('*'));
export const loadStock = () => run<StockItem[]>(supabase.from('stock').select('*'));

export const createProduct = (product: { name: string; barcode: string | null; category: string }) =>
  run<Product>(supabase.from('products').insert(product).select().single());
export const updateProduct = (id: string, patch: Partial<Omit<Product, 'id' | 'created_at'>>) =>
  updateOne('products', id, patch, 'Das Produkt gibt es nicht mehr.');
export const deleteProduct = (id: string) => run<null>(supabase.from('products').delete().eq('id', id));

export const addStock = (productId: string, quantity: number, bestBefore: string | null) =>
  run<StockItem>(supabase.rpc('add_stock', { p_product_id: productId, p_quantity: quantity, p_best_before: bestBefore }));
export const updateStock = (id: string, patch: Partial<Omit<StockItem, 'id' | 'product_id' | 'created_at'>>) =>
  updateOne('stock', id, patch, 'Den Eintrag gibt es nicht mehr.');
export const deleteStock = (id: string) => run<null>(supabase.from('stock').delete().eq('id', id));

/** Both return the row as it was before, or null if it no longer exists. */
export const consume = async (stockId: string) =>
  rowOrNull(await run<StockItem | null>(supabase.rpc('consume', { p_stock_id: stockId })));
export const advanceFill = async (stockId: string) =>
  rowOrNull(await run<StockItem | null>(supabase.rpc('advance_fill', { p_stock_id: stockId })));

/** Undo: writes the previous row back, re-inserting it if it was deleted. */
export const restoreStock = (prev: StockItem) => run<null>(supabase.from('stock').upsert(prev));

// --- Einkaufszettel ---

export type ArchivedList = ShoppingList & { finished_at: string; shopping_items: { count: number }[] };

export const openList = () => run<string>(supabase.rpc('open_list'));
export const loadListItems = (listId: string) => run<ShoppingItem[]>(supabase.from('shopping_items').select('*').eq('list_id', listId));
export const addToList = (productId: string | null, name: string, quantity = 1) =>
  run<ShoppingItem>(supabase.rpc('add_to_list', { p_product_id: productId, p_name: name, p_quantity: quantity }));
export const updateItem = (id: string, patch: Partial<Pick<ShoppingItem, 'quantity' | 'checked'>>) =>
  run<null>(supabase.from('shopping_items').update(patch).eq('id', id));
export const deleteItem = (id: string) => run<null>(supabase.from('shopping_items').delete().eq('id', id));
/** Undo of a removal: adds it back to the open list (merges if it was re-added meanwhile). */
export const restoreItem = (prev: ShoppingItem) => addToList(prev.product_id, prev.name, prev.quantity);
/** Returns how many items were copied. */
export const copyList = (fromId: string) => run<number>(supabase.rpc('copy_list', { p_from: fromId }));
/** Returns how many items were booked into stock. */
export const finishList = (listId: string, bookings: Booking[]) =>
  run<number>(supabase.rpc('finish_list', { p_list: listId, p_bookings: bookings }));
export const loadArchive = () =>
  run<ArchivedList[]>(
    supabase.from('shopping_lists').select('*, shopping_items(count)').not('finished_at', 'is', null).order('finished_at', { ascending: false }),
  );
