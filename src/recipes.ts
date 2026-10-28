import { findProductByName } from './inventory';
import type { Product, Recipe, RecipeIngredient, ShoppingItem, StockItem } from './types';

/** One ingredient for plan_recipe: `add` goes onto the list, the rest of `quantity` is reserved from free stock/list. */
export interface PlanLine {
  product_id: string | null;
  name: string;
  add: number;
  quantity: number;
}

export const reservedTotal = (item: ShoppingItem) => Object.values(item.reserved ?? {}).reduce((a, b) => a + b, 0);

/** Cleans recipe names and "Geplant für" texts for comparing: „Pizza am Freitag!“ → „pizza freitag“. */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(fur|fuer|zum|zur|am|an|das|die|der|den)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

// ponytail: rough similarity (equal, one contains the other, 1–2 typos) – enough to catch duplicates.
/** Compares two already normalized names. */
export function similar(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (Math.min(a.length, b.length) >= 4 && (a.includes(b) || b.includes(a))) return true;
  return distance(a, b) <= (Math.max(a.length, b.length) >= 6 ? 2 : 1);
}

export const findSimilarRecipe = (recipes: Recipe[], name: string, exceptId?: string) =>
  recipes.find((r) => r.id !== exceptId && similar(norm(r.name), norm(name)));

/** The most recently used recipes first; never used ones by name. */
export function recentRecipes(recipes: Recipe[], count: number): Recipe[] {
  return [...recipes]
    .sort((a, b) => (b.last_used_at ?? '').localeCompare(a.last_used_at ?? '') || a.name.localeCompare(b.name, 'de'))
    .slice(0, count);
}

export function searchRecipes(recipes: Recipe[], query: string, limit = 5): Recipe[] {
  const q = norm(query);
  if (q.length < 2) return [];
  return recipes.filter((r) => norm(r.name).includes(q)).sort((a, b) => a.name.localeCompare(b.name, 'de')).slice(0, limit);
}

const productOf = (products: Product[], ing: RecipeIngredient) =>
  products.find((p) => p.id === ing.product_id) ?? findProductByName(products, ing.name);

function openItemOf(items: ShoppingItem[], product: Product | undefined, name: string) {
  const wanted = name.trim().toLowerCase();
  return items.find(
    (i) => !i.checked && (product ? i.product_id === product.id : i.product_id === null && i.name.trim().toLowerCase() === wanted),
  );
}

export interface PlanRow {
  ingredient: RecipeIngredient;
  product?: Product;
  free: number; // unreserved in stock and on the list
  add: number; // what goes on the list when checked
  checked: boolean; // by default only what is not free yet
  note: string;
}

/** Per ingredient: free means stock without "Geplant für" and list quantity not reserved for a recipe. */
export function planRecipe(recipe: Recipe, products: Product[], stock: StockItem[], items: ShoppingItem[]): PlanRow[] {
  return recipe.items.map((ingredient) => {
    const product = productOf(products, ingredient);
    const rows = product ? stock.filter((s) => s.product_id === product.id) : [];
    const item = openItemOf(items, product, ingredient.name);
    const freeStock = rows.filter((s) => !s.planned_for).reduce((a, s) => a + s.quantity, 0);
    const freeList = item ? item.quantity - reservedTotal(item) : 0;
    const need = Math.max(0, ingredient.quantity - freeStock - freeList);
    const notes = [
      ...(freeStock ? [`${freeStock}× im Bestand`] : []),
      ...(freeList ? [`${freeList}× schon auf dem Zettel`] : []),
      ...rows.filter((s) => s.planned_for).map((s) => `${s.quantity}× im Bestand für ${s.planned_for}`),
      ...Object.entries(item?.reserved ?? {}).map(([name, q]) => `${q}× auf dem Zettel für ${name}`),
    ];
    return { ingredient, product, free: freeStock + freeList, add: need || ingredient.quantity, checked: need > 0, note: notes.join(' · ') };
  });
}

export const planLines = (rows: PlanRow[]): PlanLine[] =>
  rows.map((r) => ({
    product_id: r.product?.id ?? null,
    name: r.product?.name ?? r.ingredient.name,
    add: r.checked ? r.add : 0,
    quantity: r.ingredient.quantity,
  }));

/** What is planned for a recipe right now, as plan lines – to undo a change to that plan. */
export function currentPlan(name: string, items: ShoppingItem[], stock: StockItem[], products: Product[]): PlanLine[] {
  const lines = new Map<string, PlanLine>();
  const put = (productId: string | null, itemName: string, add: number, quantity: number) => {
    const key = productId ?? itemName.trim().toLowerCase();
    const line = lines.get(key) ?? { product_id: productId, name: itemName, add: 0, quantity: 0 };
    lines.set(key, { ...line, add: line.add + add, quantity: line.quantity + quantity });
  };
  for (const i of items) {
    const q = i.reserved?.[name];
    if (q && !i.checked) put(i.product_id, i.name, q, q);
  }
  for (const s of stock) {
    const product = products.find((p) => p.id === s.product_id);
    if (s.planned_for === name && product) put(product.id, product.name, 0, s.quantity);
  }
  return [...lines.values()];
}

/** Recipes something is planned for: reserved on the open list or "Geplant für" in stock. */
export function plannedRecipes(recipes: Recipe[], items: ShoppingItem[], stock: StockItem[]): string[] {
  const names = new Set<string>();
  for (const i of items) if (!i.checked) Object.keys(i.reserved ?? {}).forEach((n) => names.add(n));
  const known = new Set(recipes.map((r) => r.name));
  for (const s of stock) if (s.planned_for && known.has(s.planned_for)) names.add(s.planned_for);
  return [...names].sort((a, b) => a.localeCompare(b, 'de'));
}

/** Line under an item: „für Lasagne“, or the split „1× Lasagne · 1× Chili · 1× frei“. */
export function itemTag(item: ShoppingItem): string {
  const parts = Object.entries(item.reserved ?? {});
  if (!parts.length) return '';
  const free = item.quantity - reservedTotal(item);
  if (parts.length === 1 && free <= 0) return `für ${parts[0][0]}`;
  return [...parts.map(([name, q]) => `${q}× ${name}`), ...(free > 0 ? [`${free}× frei`] : [])].join(' · ');
}

/** Reservations after lowering the quantity: free units go first, then the latest reservation. */
export function shrinkReserved(reserved: Record<string, number> = {}, quantity: number): Record<string, number> {
  const next = { ...reserved };
  let over = Object.values(next).reduce((a, b) => a + b, 0) - quantity;
  for (const name of Object.keys(next).reverse()) {
    if (over <= 0) break;
    const take = Math.min(over, next[name]);
    next[name] -= take;
    over -= take;
    if (!next[name]) delete next[name];
  }
  return next;
}

export interface RecipeIdea {
  key: string; // normalized, for dismissing
  name: string;
  items: RecipeIngredient[];
}

/** At least 2 different products in stock planned for a similar text that is no recipe yet. */
export function recipeIdeas(products: Product[], stock: StockItem[], recipes: Recipe[], dismissed: ReadonlySet<string>): RecipeIdea[] {
  const groups: { key: string; name: string; items: Map<string, RecipeIngredient> }[] = [];
  for (const s of stock) {
    const product = products.find((p) => p.id === s.product_id);
    const key = s.planned_for ? norm(s.planned_for) : '';
    if (!product || !key || findSimilarRecipe(recipes, key)) continue;
    let group = groups.find((g) => similar(g.key, key));
    if (!group) {
      const name = s.planned_for!.trim();
      groups.push((group = { key, name: name[0].toUpperCase() + name.slice(1), items: new Map() }));
    }
    const prev = group.items.get(product.id);
    group.items.set(product.id, { product_id: product.id, name: product.name, quantity: (prev?.quantity ?? 0) + s.quantity });
  }
  return groups
    .filter((g) => g.items.size >= 2 && !dismissed.has(g.key))
    .map((g) => ({ key: g.key, name: g.name, items: [...g.items.values()] }));
}
