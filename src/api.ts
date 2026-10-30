import { supabase } from './supabase';
import type { PlanLine } from './recipes';
import type { Booking, Product, Recipe, ShoppingItem, ShoppingList, StockItem } from './types';

async function run<T>(query: PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error(friendly(error));
  return data as T;
}

// Unique-key violations are the DB errors a user can trigger with normal input.
function friendly(error: { message: string; code?: string }): string {
  // SQL file not run yet: functions/tables/columns unknown to PostgREST or Postgres.
  if (['PGRST202', 'PGRST204', 'PGRST205', '42P01', '42703', '42883'].includes(error.code ?? '')) {
    const file = /update_recipe|recipe_ideas|p_also/.test(error.message)
      ? '2026-10-30-rezepte-nachbesserungen.sql'
      : /recipe|reserved/.test(error.message)
        ? '2026-10-28-rezepte.sql'
        : '2026-10-18-einkaufszettel.sql';
    return `Datenbank noch nicht eingerichtet: supabase/${file} im Supabase SQL Editor ausführen.`;
  }
  if (error.code !== '23505') return error.message;
  if (error.message.includes('barcode')) return 'Dieser Barcode gehört schon zu einem anderen Produkt.';
  if (error.message.includes('shopping_items')) return 'Das steht schon auf dem Zettel.';
  if (error.message.includes('recipes')) return 'Ein Rezept mit diesem Namen gibt es schon.';
  return 'Für dieses Produkt gibt es schon einen Eintrag mit diesem MHD und „Geplant für“. Dort die Menge ändern und diesen Eintrag löschen.';
}

// Fails when nothing matched, e.g. another device deleted the row meanwhile.
async function updateOne(table: 'products' | 'stock' | 'shopping_items' | 'recipes', id: string, patch: object, gone: string) {
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
export const updateItem = (id: string, patch: Partial<Pick<ShoppingItem, 'quantity' | 'checked' | 'reserved'>>) =>
  updateOne('shopping_items', id, patch, 'Den Eintrag gibt es nicht mehr.');
export const deleteItem = (id: string) => run<null>(supabase.from('shopping_items').delete().eq('id', id));
/** Undo of a removal: adds it back to the open list (merges if it was re-added meanwhile), with its reservations. */
export async function restoreItem(prev: ShoppingItem) {
  const item = await addToList(prev.product_id, prev.name, prev.quantity);
  if (!Object.keys(prev.reserved ?? {}).length) return;
  const reserved = { ...item.reserved };
  for (const [name, q] of Object.entries(prev.reserved!)) reserved[name] = (reserved[name] ?? 0) + q;
  await updateItem(item.id, { reserved });
}
/** Returns how many items were copied. */
export const copyList = (fromId: string) => run<number>(supabase.rpc('copy_list', { p_from: fromId }));
/** Returns how many items were booked into stock. */
export const finishList = (listId: string, bookings: Booking[]) =>
  run<number>(supabase.rpc('finish_list', { p_list: listId, p_bookings: bookings }));
export const loadArchive = () =>
  run<ArchivedList[]>(
    supabase.from('shopping_lists').select('*, shopping_items(count)').not('finished_at', 'is', null).order('finished_at', { ascending: false }),
  );

// --- Rezepte ---

export const loadRecipes = () => run<Recipe[]>(supabase.from('recipes').select('*'));
/** Updating renames reservations and "Geplant für" along with the recipe. */
export const saveRecipe = (id: string | null, recipe: Pick<Recipe, 'name' | 'items'>) =>
  id
    ? run<null>(supabase.rpc('update_recipe', { p_id: id, p_name: recipe.name, p_items: recipe.items }))
    : run<null>(supabase.from('recipes').insert({ ...recipe, last_used_at: new Date().toISOString() })); // new ones show up under „Zuletzt“
export const deleteRecipe = (id: string) => run<null>(supabase.from('recipes').delete().eq('id', id));
/** Puts what is missing on the list and reserves the rest from free list quantity and stock, all for this recipe. */
export const planRecipe = (name: string, lines: PlanLine[]) => run<null>(supabase.rpc('plan_recipe', { p_recipe: name, p_items: lines }));
/** Reserved quantity leaves the list (not what is in the cart), stock planned for the recipe or one of
 * its aliases (other "Geplant für" texts meaning it) becomes free. */
export const unplanRecipe = (name: string, aliases: string[] = []) =>
  run<null>(supabase.rpc('unplan_recipe', aliases.length ? { p_recipe: name, p_also: aliases } : { p_recipe: name }));
export const loadDismissedIdeas = async () =>
  new Set((await run<{ key: string }[]>(supabase.from('recipe_ideas_dismissed').select('key'))).map((r) => r.key));
export const dismissIdea = (key: string) => run<null>(supabase.from('recipe_ideas_dismissed').upsert({ key }));
