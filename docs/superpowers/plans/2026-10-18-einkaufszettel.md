# Einkaufszettel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gemeinsamer Einkaufszettel mit „Wird knapp“-Vorschlägen, Abhaken, Abschließen mit Buchung in den Bestand und Archiv mit Kopieren.

**Architecture:** Zwei neue Supabase-Tabellen (`shopping_lists`, `shopping_items`) und vier Postgres-Funktionen (`open_list`, `add_to_list`, `copy_list`, `finish_list`) in einer eigenen SQL-Datei; reine Logik in `src/shopping.ts` (getestet); ein Realtime-Hook `useShopping` nach dem Muster von `useInventory`; drei Komponenten (Zettel, Abschließen-Sheet, Archiv) und ein neuer Tab.

**Tech Stack:** wie bisher – Vite, React 19, TypeScript 7, Vitest 5, supabase-js 2, Supabase Postgres.

**Spec:** `docs/superpowers/specs/2026-10-18-einkaufszettel-design.md`

**Schritte mit [Nutzer]** macht der Mensch selbst (SQL im Supabase-Dashboard ausführen, iPhone-Test, Push-Freigabe).

**Konventionen dieses Repos:** Commit-Messages auf Englisch, enden mit Leerzeile und `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nie pushen ohne Freigabe. Ohne Supabase-Backend wird mit `npx tsc`, `npm test` und `VITE_SUPABASE_URL=https://example.supabase.co VITE_SUPABASE_KEY=dummy npx vite build --outDir "$TEMP/myfood-dist"` geprüft (danach Ordner löschen). Mobile-Regeln: Felder 16 px (global gesetzt), Raster-Spalten `minmax(0, 1fr)`, Tippflächen ≥ 44 px, Fieldsets `min-width: 0`.

---

## Dateistruktur

```
supabase/2026-10-18-einkaufszettel.sql   neu: Tabellen, Indizes, RLS, Grants, Funktionen, Realtime
README.md                                 + Einrichtungsschritt
src/types.ts                              + ShoppingList, ShoppingItem
src/shopping.ts (+ .test.ts)              neu: suggestions, arrangeList, initialFinishRows, buildBookings
src/api.ts                                + Zettel-Zugriffe, friendly() für Zettel-Duplikate
src/useShopping.ts                        neu: offener Zettel + Realtime
src/components/FinishSheet.tsx            neu: Bottom Sheet „Einkauf abschließen“
src/components/Archive.tsx                neu: frühere Einkäufe + kopieren
src/components/ShoppingList.tsx           neu: Zettel-Ansicht
src/App.tsx                               + Tab „Einkauf“
src/styles.css                            + Zettel-Styles
```

---

### Task 1: SQL-Migration und README

**Files:**
- Create: `supabase/2026-10-18-einkaufszettel.sql`
- Modify: `README.md`

- [ ] **Step 1: `supabase/2026-10-18-einkaufszettel.sql` anlegen**

```sql
-- myfood: Einkaufszettel. Run once in the Supabase SQL editor, after schema.sql.

create table public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
-- At most one open list.
create unique index shopping_lists_one_open on public.shopping_lists ((finished_at is null)) where finished_at is null;

create table public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.shopping_lists(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  name text not null check (length(trim(name)) > 0),
  quantity int not null default 1 check (quantity >= 1),
  checked boolean not null default false,
  created_at timestamptz not null default now()
);
-- A product appears at most once per list.
create unique index shopping_items_one_per_product on public.shopping_items (list_id, product_id) where product_id is not null;

-- Same rules as stock: every signed-in household member may do everything, anonymous users nothing.
alter table public.shopping_lists enable row level security;
alter table public.shopping_items enable row level security;
create policy household on public.shopping_lists for all to authenticated using (true) with check (true);
create policy household on public.shopping_items for all to authenticated using (true) with check (true);
grant select, insert, update, delete on table public.shopping_lists, public.shopping_items to authenticated;
revoke all on table public.shopping_lists, public.shopping_items from anon;

-- Id of the open list; creates it if there is none (the partial index keeps it unique under races).
create function public.open_list()
returns uuid language plpgsql set search_path = '' as $$
declare v_list uuid;
begin
  select id into v_list from public.shopping_lists where finished_at is null;
  if found then return v_list; end if;
  insert into public.shopping_lists default values on conflict do nothing returning id into v_list;
  if v_list is null then
    select id into v_list from public.shopping_lists where finished_at is null;
  end if;
  return v_list;
end $$;

-- Adds to the open list; an item already on it (same product, or same free text) gets more quantity.
create function public.add_to_list(p_product_id uuid, p_name text, p_quantity int default 1)
returns public.shopping_items language plpgsql set search_path = '' as $$
declare
  v_list uuid := public.open_list();
  v_item public.shopping_items;
begin
  if p_product_id is not null then
    insert into public.shopping_items (list_id, product_id, name, quantity)
    values (v_list, p_product_id, trim(p_name), p_quantity)
    on conflict (list_id, product_id) where product_id is not null
      do update set quantity = shopping_items.quantity + excluded.quantity
    returning * into v_item;
  else
    update public.shopping_items set quantity = quantity + p_quantity
      where list_id = v_list and product_id is null and lower(trim(name)) = lower(trim(p_name))
      returning * into v_item;
    if not found then
      insert into public.shopping_items (list_id, name, quantity)
      values (v_list, trim(p_name), p_quantity)
      returning * into v_item;
    end if;
  end if;
  return v_item;
end $$;

-- Copies all items of an archived list (unchecked) into the open list, skipping what is already there.
create function public.copy_list(p_from uuid)
returns int language plpgsql set search_path = '' as $$
declare
  v_list uuid := public.open_list();
  v_count int;
begin
  insert into public.shopping_items (list_id, product_id, name, quantity)
  select v_list, i.product_id, i.name, i.quantity
  from public.shopping_items i
  where i.list_id = p_from and i.list_id <> v_list
    and not exists (
      select 1 from public.shopping_items o
      where o.list_id = v_list
        and (o.product_id = i.product_id
             or (i.product_id is null and o.product_id is null and lower(trim(o.name)) = lower(trim(i.name))))
    );
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Books the given checked items into stock, archives the list, opens a new one and
-- moves the unchecked items onto it. All or nothing.
-- p_bookings: [{ "item_id": uuid, "quantity": int, "best_before": "YYYY-MM-DD" | null }]
create function public.finish_list(p_list uuid, p_bookings jsonb)
returns int language plpgsql set search_path = '' as $$
declare
  v_finished timestamptz;
  v_new uuid;
  v_booking jsonb;
  v_item public.shopping_items;
  v_product uuid;
  v_count int := 0;
begin
  select finished_at into v_finished from public.shopping_lists where id = p_list for update;
  if not found then raise exception 'Diesen Einkauf gibt es nicht mehr.'; end if;
  if v_finished is not null then raise exception 'Dieser Einkauf wurde schon abgeschlossen.'; end if;

  for v_booking in select value from jsonb_array_elements(coalesce(p_bookings, '[]'::jsonb)) loop
    select * into v_item from public.shopping_items
      where id = (v_booking->>'item_id')::uuid and list_id = p_list and checked;
    if not found then continue; end if;
    v_product := v_item.product_id;
    if v_product is null then
      select id into v_product from public.products where lower(trim(name)) = lower(trim(v_item.name)) limit 1;
      if v_product is null then
        insert into public.products (name) values (trim(v_item.name)) returning id into v_product;
      end if;
    end if;
    perform public.add_stock(v_product, (v_booking->>'quantity')::int, nullif(v_booking->>'best_before', '')::date);
    v_count := v_count + 1;
  end loop;

  update public.shopping_lists set finished_at = now() where id = p_list;
  insert into public.shopping_lists default values returning id into v_new;
  update public.shopping_items set list_id = v_new where list_id = p_list and not checked;
  return v_count;
end $$;

revoke execute on function public.open_list(), public.add_to_list(uuid, text, int), public.copy_list(uuid), public.finish_list(uuid, jsonb) from public, anon;
grant execute on function public.open_list(), public.add_to_list(uuid, text, int), public.copy_list(uuid), public.finish_list(uuid, jsonb) to authenticated;

alter publication supabase_realtime add table public.shopping_lists, public.shopping_items;
```

- [ ] **Step 2: README ergänzen**

In `README.md` direkt nach Schritt 2 der Einrichtung (`2. *SQL Editor*: Inhalt von \`supabase/schema.sql\` einfügen und ausführen.`) diese Zeile einfügen:

```markdown
   Für den Einkaufszettel danach zusätzlich `supabase/2026-10-18-einkaufszettel.sql` ausführen.
```

- [ ] **Step 3: Commit**

```bash
git add supabase/2026-10-18-einkaufszettel.sql README.md
git commit -m "feat: add shopping list schema and functions"
```

- [ ] **Step 4: [Nutzer] SQL ausführen**

Anleitung ausgeben und auf Bestätigung warten: Supabase → *SQL Editor* → Inhalt von `supabase/2026-10-18-einkaufszettel.sql` einfügen → *Run*. Erwartet: „Success. No rows returned“. (Vor dem Ausführen soll das Code-Review dieser Task abgeschlossen sein, weil sich das Skript nicht zweimal ausführen lässt.)

---

### Task 2: Typen und Zettel-Logik

**Files:**
- Modify: `src/types.ts` (am Ende anhängen)
- Create: `src/shopping.ts`
- Test: `src/shopping.test.ts`

- [ ] **Step 1: Typen anhängen** – ans Ende von `src/types.ts`:

```ts

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
```

- [ ] **Step 2: Failing test schreiben** – `src/shopping.test.ts`:

```ts
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
```

- [ ] **Step 3: Test laufen lassen, er muss scheitern**

Run: `npm test`
Expected: FAIL, „Cannot find module './shopping'“.

- [ ] **Step 4: `src/shopping.ts` implementieren**

```ts
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
```

- [ ] **Step 5: Tests grün**

Run: `npm test`
Expected: PASS, alle Tests (34 bisherige + 6 neue = 40).

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/shopping.ts src/shopping.test.ts
git commit -m "feat: add shopping list logic"
```

---

### Task 3: Datenzugriff und Realtime-Hook

**Files:**
- Modify: `src/api.ts`
- Create: `src/useShopping.ts`

- [ ] **Step 1: `friendly()` in `src/api.ts` ersetzen** – die ganze Funktion durch:

```ts
// Unique-key violations are the DB errors a user can trigger with normal input.
function friendly(error: { message: string; code?: string }): string {
  if (error.code !== '23505') return error.message;
  if (error.message.includes('barcode')) return 'Dieser Barcode gehört schon zu einem anderen Produkt.';
  if (error.message.includes('shopping_items')) return 'Das steht schon auf dem Zettel.';
  return 'Für dieses Produkt gibt es schon einen Eintrag mit diesem MHD. Dort die Menge ändern und diesen Eintrag löschen.';
}
```

- [ ] **Step 2: Import-Zeilen in `src/api.ts` anpassen** – die Zeile `import type { Product, StockItem } from './types';` ersetzen durch:

```ts
import type { Booking } from './shopping';
import type { Product, ShoppingItem, ShoppingList, StockItem } from './types';
```

- [ ] **Step 3: Zettel-Funktionen ans Ende von `src/api.ts` anhängen**

```ts

// --- Einkaufszettel ---

export type ArchivedList = ShoppingList & { finished_at: string; shopping_items: { count: number }[] };

export const openList = () => run<string>(supabase.rpc('open_list'));
export const loadListItems = (listId: string) => run<ShoppingItem[]>(supabase.from('shopping_items').select('*').eq('list_id', listId));
export const addToList = (productId: string | null, name: string, quantity = 1) =>
  run<ShoppingItem>(supabase.rpc('add_to_list', { p_product_id: productId, p_name: name, p_quantity: quantity }));
export const updateItem = (id: string, patch: Partial<Pick<ShoppingItem, 'quantity' | 'checked'>>) =>
  run<null>(supabase.from('shopping_items').update(patch).eq('id', id));
export const deleteItem = (id: string) => run<null>(supabase.from('shopping_items').delete().eq('id', id));
/** Undo of a removal: writes the previous row back. */
export const restoreItem = (prev: ShoppingItem) => run<null>(supabase.from('shopping_items').upsert(prev));
/** Returns how many items were copied. */
export const copyList = (fromId: string) => run<number>(supabase.rpc('copy_list', { p_from: fromId }));
/** Returns how many items were booked into stock. */
export const finishList = (listId: string, bookings: Booking[]) =>
  run<number>(supabase.rpc('finish_list', { p_list: listId, p_bookings: bookings }));
export const loadArchive = () =>
  run<ArchivedList[]>(
    supabase.from('shopping_lists').select('*, shopping_items(count)').not('finished_at', 'is', null).order('finished_at', { ascending: false }),
  );
```

- [ ] **Step 4: `src/useShopping.ts` anlegen**

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadListItems, openList } from './api';
import { supabase } from './supabase';
import type { ShoppingItem } from './types';

let channelCount = 0;

// Same pattern as useInventory: any change reloads the open list.
export function useShopping() {
  const [listId, setListId] = useState<string | null>(null);
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);

  const reload = useCallback(async () => {
    const call = ++latest.current; // only the newest reload may write state
    try {
      const id = await openList();
      const rows = await loadListItems(id);
      if (call !== latest.current) return;
      setListId(id);
      setItems(rows);
      setError(null);
    } catch (e) {
      if (call === latest.current) setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void reload();
    const channel = supabase
      .channel(`shopping-${++channelCount}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_lists' }, () => void reload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_items' }, () => void reload())
      .subscribe((status, err) => {
        // Rejoins (after sleep/offline) don't replay missed changes, so catch up.
        if (status === 'SUBSCRIBED') void reload();
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.error('realtime', status, err);
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [reload]);

  return { listId, items, error, reload };
}
```

- [ ] **Step 5: Prüfen**

Run: `npx tsc && npm test`
Expected: keine Typfehler, 40 Tests grün.

- [ ] **Step 6: Commit**

```bash
git add src/api.ts src/useShopping.ts
git commit -m "feat: add shopping list data access and realtime hook"
```

---

### Task 4: Abschließen-Sheet

**Files:**
- Create: `src/components/FinishSheet.tsx`

- [ ] **Step 1: `src/components/FinishSheet.tsx` anlegen**

```tsx
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { finishList } from '../api';
import { buildBookings, initialFinishRows, type FinishRow } from '../shopping';
import type { ShoppingItem } from '../types';

interface Props {
  listId: string;
  items: ShoppingItem[];
  onClose: () => void;
  onFinished: (booked: number) => Promise<void>;
}

export function FinishSheet({ listId, items, onClose, onFinished }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [rows, setRows] = useState<FinishRow[]>(() => initialFinishRows(items));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Native modal like the edit sheet: focus trap and Escape come from the browser.
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const update = (index: number, patch: Partial<FinishRow>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onFinished(await finishList(listId, buildBookings(rows)));
    } catch (err) {
      // All or nothing in the DB: the sheet stays open with every input intact.
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const toBook = rows.filter((r) => r.book).length;

  return (
    <dialog ref={ref} className="sheet" aria-labelledby={titleId} onClose={onClose} onCancel={(e) => busy && e.preventDefault()}>
      <form onSubmit={submit}>
        <header className="sheet-head">
          <h2 id={titleId}>Einkauf abschließen</h2>
          <button type="button" className="icon" aria-label="Schließen" disabled={busy} onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="sheet-body">
          <p className="hint">Was in den Bestand soll, mit Menge und optional MHD.</p>
          {rows.map((r, i) => (
            <fieldset key={r.item.id} className="booking">
              <label className="check">
                <input type="checkbox" checked={r.book} onChange={(e) => update(i, { book: e.target.checked })} />
                <span>
                  {r.item.name}
                  {r.book && !r.item.product_id && <span className="hint"> · wird als Produkt übernommen</span>}
                </span>
              </label>
              {r.book && (
                <div className="pair">
                  <label>
                    Menge
                    <input type="number" inputMode="numeric" min={1} required value={r.quantity} onChange={(e) => update(i, { quantity: Number(e.target.value) })} />
                  </label>
                  <label>
                    MHD
                    <input type="date" value={r.bestBefore} onChange={(e) => update(i, { bestBefore: e.target.value })} />
                  </label>
                </div>
              )}
            </fieldset>
          ))}
        </div>
        <footer className="sheet-foot">
          {error && <p className="error">{error}</p>}
          <button type="button" className="secondary" disabled={busy} onClick={onClose}>
            Abbrechen
          </button>
          <button disabled={busy}>{toBook ? `${toBook} buchen & abschließen` : 'Abschließen'}</button>
        </footer>
      </form>
    </dialog>
  );
}
```

- [ ] **Step 2: Prüfen**

Run: `npx tsc`
Expected: keine Ausgabe.

- [ ] **Step 3: Commit**

```bash
git add src/components/FinishSheet.tsx
git commit -m "feat: add finish shopping sheet"
```

---

### Task 5: Archiv

**Files:**
- Create: `src/components/Archive.tsx`

- [ ] **Step 1: `src/components/Archive.tsx` anlegen**

```tsx
import { useEffect, useState } from 'react';
import { copyList, loadArchive, loadListItems, type ArchivedList } from '../api';
import { formatDate, todayISO } from '../inventory';
import type { Notify, ShoppingItem } from '../types';

interface Props {
  onClose: () => void;
  onCopied: () => Promise<void>;
  notify: Notify;
}

// Local calendar date of a timestamp, German style.
const dateOf = (timestamp: string) => formatDate(todayISO(new Date(timestamp)));

export function Archive({ onClose, onCopied, notify }: Props) {
  const [lists, setLists] = useState<ArchivedList[] | null>(null);
  const [selected, setSelected] = useState<ArchivedList | null>(null);
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadArchive().then(setLists, (e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!selected) return;
    setItems([]);
    loadListItems(selected.id).then(
      (rows) => setItems(rows.sort((a, b) => a.name.localeCompare(b.name, 'de'))),
      (e: Error) => setError(e.message),
    );
  }, [selected]);

  async function copy() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const count = await copyList(selected.id);
      await onCopied();
      notify({ text: count ? `${count} übernommen` : 'Alles stand schon drauf' });
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <div className="archive-head">
        <button type="button" className="link" onClick={selected ? () => setSelected(null) : onClose}>
          ← {selected ? 'Frühere Einkäufe' : 'Einkaufszettel'}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {selected ? (
        <section>
          <h2>Einkauf vom {dateOf(selected.finished_at)}</h2>
          <ul className="items">
            {items.map((item) => (
              <li key={item.id} className="item">
                <span className="name">{item.name}</span>
                <span className="qty">{item.quantity}×</span>
              </li>
            ))}
          </ul>
          <div className="actions copy-action">
            <button type="button" disabled={busy || !items.length} onClick={() => void copy()}>
              Auf aktuellen Zettel kopieren
            </button>
          </div>
        </section>
      ) : (
        <section>
          <h2>Frühere Einkäufe</h2>
          {lists?.length === 0 && <p className="empty">Noch keine abgeschlossenen Einkäufe.</p>}
          <ul className="items">
            {lists?.map((list) => (
              <li key={list.id}>
                <button type="button" className="archive-row" onClick={() => setSelected(list)}>
                  <span>{dateOf(list.finished_at)}</span>
                  <span className="qty">{list.shopping_items[0]?.count ?? 0} Einträge</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
```

- [ ] **Step 2: Prüfen**

Run: `npx tsc`
Expected: keine Ausgabe.

- [ ] **Step 3: Commit**

```bash
git add src/components/Archive.tsx
git commit -m "feat: add shopping archive with copy"
```

---

### Task 6: Zettel-Ansicht, Tab und Styles

**Files:**
- Create: `src/components/ShoppingList.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css` (am Ende anhängen)

- [ ] **Step 1: `src/components/ShoppingList.tsx` anlegen**

```tsx
import { useState, type FormEvent } from 'react';
import { addToList, deleteItem, restoreItem, updateItem } from '../api';
import { findProductByName } from '../inventory';
import { arrangeList, suggestions } from '../shopping';
import type { Notify, Product, ShoppingItem, StockItem } from '../types';
import { useShopping } from '../useShopping';
import { Archive } from './Archive';
import { FinishSheet } from './FinishSheet';

interface Props {
  products: Product[];
  stock: StockItem[];
  notify: Notify;
  onStockChanged: () => Promise<void>;
}

export function ShoppingList({ products, stock, notify, onStockChanged }: Props) {
  const { listId, items, error, reload } = useShopping();
  const [text, setText] = useState('');
  const [finishing, setFinishing] = useState(false);
  const [archive, setArchive] = useState(false);
  const proposals = suggestions(products, stock, items);
  const { open, checked } = arrangeList(items, products);

  // Failures show as a toast; on success the list reloads (realtime also does).
  async function act(action: () => Promise<unknown>) {
    try {
      await action();
      await reload();
    } catch (e) {
      notify({ text: `Fehler: ${(e as Error).message}` });
    }
  }

  function add(e: FormEvent) {
    e.preventDefault();
    const name = text.trim();
    if (!name) return;
    const product = findProductByName(products, name); // exact match → product item, else free text
    setText('');
    void act(() => addToList(product?.id ?? null, product?.name ?? name));
  }

  function addAll() {
    void act(async () => {
      for (const s of proposals) await addToList(s.product.id, s.product.name, s.quantity);
    });
  }

  function decrease(item: ShoppingItem) {
    if (item.quantity > 1) return void act(() => updateItem(item.id, { quantity: item.quantity - 1 }));
    void act(async () => {
      await deleteItem(item.id);
      notify({
        text: `${item.name} entfernt`,
        undo: async () => {
          await restoreItem(item);
          await reload();
        },
      });
    });
  }

  if (archive) return <Archive onClose={() => setArchive(false)} onCopied={reload} notify={notify} />;

  const row = (item: ShoppingItem) => (
    <li key={item.id} className={item.checked ? 'item done' : 'item'}>
      <button type="button" className="tick" aria-pressed={item.checked} onClick={() => void act(() => updateItem(item.id, { checked: !item.checked }))}>
        <span className="box" aria-hidden="true">
          {item.checked ? '✓' : ''}
        </span>
        <span className="name">{item.name}</span>
        <span className="qty">{item.quantity}×</span>
      </button>
      {!item.checked && (
        <>
          <button type="button" className="step" aria-label={`${item.name}: eins weniger`} onClick={() => decrease(item)}>
            −
          </button>
          <button type="button" className="step" aria-label={`${item.name}: eins mehr`} onClick={() => void act(() => updateItem(item.id, { quantity: item.quantity + 1 }))}>
            +
          </button>
        </>
      )}
    </li>
  );

  return (
    <>
      {error && <p className="error">Einkaufszettel konnte nicht geladen werden: {error}</p>}
      <form className="add-item" onSubmit={add}>
        <input aria-label="Auf den Zettel" placeholder="Auf den Zettel …" list="shopping-products" autoComplete="off" value={text} onChange={(e) => setText(e.target.value)} />
        <datalist id="shopping-products">
          {products.map((p) => (
            <option key={p.id} value={p.name} />
          ))}
        </datalist>
        <button aria-label="Hinzufügen" disabled={!text.trim()}>
          +
        </button>
      </form>

      {proposals.length > 0 && (
        <section className="card low">
          <div className="low-head">
            <h2>Wird knapp</h2>
            <button type="button" className="link" onClick={addAll}>
              Alle übernehmen
            </button>
          </div>
          <div className="chips">
            {proposals.map((s) => (
              <button key={s.product.id} type="button" className="chip" onClick={() => void act(() => addToList(s.product.id, s.product.name, s.quantity))}>
                + {s.product.name} ({s.quantity})
              </button>
            ))}
          </div>
        </section>
      )}

      {items.length === 0 && <p className="empty">Der Zettel ist leer.</p>}
      {open.map((g) => (
        <section key={g.title}>
          <h2>{g.title}</h2>
          <ul className="items">{g.items.map(row)}</ul>
        </section>
      ))}
      {checked.length > 0 && (
        <section>
          <h2>Im Wagen ({checked.length})</h2>
          <ul className="items">{checked.map(row)}</ul>
        </section>
      )}

      <button type="button" className="link archive-link" onClick={() => setArchive(true)}>
        Frühere Einkäufe
      </button>

      <div className="finish-bar">
        <button type="button" disabled={!checked.length || !listId} onClick={() => setFinishing(true)}>
          Einkauf abschließen
        </button>
      </div>

      {finishing && listId && (
        <FinishSheet
          listId={listId}
          items={items}
          onClose={() => setFinishing(false)}
          onFinished={async (booked) => {
            setFinishing(false);
            notify({ text: `Einkauf abgeschlossen, ${booked} gebucht` });
            await Promise.all([reload(), onStockChanged()]);
          }}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Tab in `src/App.tsx` einbauen**

Import ergänzen (alphabetisch zu den anderen Komponenten):
```tsx
import { ShoppingList } from './components/ShoppingList';
```
Die beiden Zeilen
```tsx
type Tab = 'bestand' | 'scan' | 'add';
const TABS: [Tab, string][] = [['bestand', 'Bestand'], ['scan', 'Scannen'], ['add', 'Hinzufügen']];
```
ersetzen durch:
```tsx
type Tab = 'bestand' | 'einkauf' | 'scan' | 'add';
const TABS: [Tab, string][] = [['bestand', 'Bestand'], ['einkauf', 'Einkauf'], ['scan', 'Scannen'], ['add', 'Hinzufügen']];
```
Direkt nach der Zeile `{tab === 'bestand' && <Dashboard … />}` einfügen:
```tsx
        {tab === 'einkauf' && <ShoppingList products={products} stock={stock} notify={notify} onStockChanged={reload} />}
```

- [ ] **Step 3: Styles ans Ende von `src/styles.css` anhängen**

```css

/* Einkaufszettel */
.add-item { display: grid; grid-template-columns: minmax(0, 1fr) 52px; gap: 8px; margin: 12px 0; }
.add-item button { min-height: 44px; padding: 0; font-size: 1.25rem; }
.low-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.low-head h2 { margin: 0; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chip { max-width: 100%; min-height: 44px; padding: 8px 14px; border: 1px solid var(--line); border-radius: 999px; background: var(--bg); color: var(--text); text-align: left; overflow-wrap: anywhere; }
.items { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: 6px; }
.item { display: flex; align-items: center; gap: 6px; min-height: 52px; padding: 4px; background: var(--card); border: 1px solid var(--line); border-radius: 10px; }
.item .tick { flex: 1; min-width: 0; display: flex; align-items: center; gap: 12px; padding: 8px; background: transparent; color: var(--text); text-align: left; }
.item .box { flex: none; width: 24px; height: 24px; display: grid; place-items: center; border: 2px solid var(--accent); border-radius: 6px; color: var(--bg); font-weight: 700; }
.item.done .box { background: var(--accent); }
.item .name { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.item.done .name { color: var(--muted); text-decoration: line-through; }
.item .qty { color: var(--muted); white-space: nowrap; }
.item > .name { padding: 8px 12px; }
.item > .qty { padding-right: 12px; }
.item .step { min-width: 44px; min-height: 44px; padding: 0; border: 1px solid var(--line); background: var(--bg); color: var(--text); font-size: 1.25rem; }
.archive-link { display: block; margin: 16px auto; }
/* Stays above the tab bar while the list scrolls; --tabs-h is measured in Task 7. */
.finish-bar { position: sticky; bottom: calc(var(--tabs-h, 52px) + env(safe-area-inset-bottom)); padding: 8px 0; background: var(--bg); }
.finish-bar button { width: 100%; min-height: 48px; }
.archive-head { padding: 8px 0; }
.archive-row { width: 100%; min-height: 52px; display: flex; justify-content: space-between; align-items: center; gap: 8px; border: 1px solid var(--line); background: var(--card); color: var(--text); text-align: left; }
.copy-action { margin-top: 12px; }
.booking { min-width: 0; margin: 0; padding: 0 0 12px; border: 0; border-bottom: 1px solid var(--line); display: grid; gap: 8px; }
.booking .check { min-height: 44px; color: var(--text); }
.booking .check input { flex: none; width: 22px; height: 22px; }
```

- [ ] **Step 4: Prüfen**

Run: `npx tsc && npm test && VITE_SUPABASE_URL=https://example.supabase.co VITE_SUPABASE_KEY=dummy npx vite build --outDir "$TEMP/myfood-dist" && rm -rf "$TEMP/myfood-dist"`
Expected: keine Typfehler, 40 Tests grün, Build erfolgreich.

- [ ] **Step 5: Commit**

```bash
git add src/components/ShoppingList.tsx src/App.tsx src/styles.css
git commit -m "feat: add shopping list tab"
```

---

### Task 7: Sichtprüfung im Handy-Viewport

Ohne Login kommt man nicht an den Tab; deshalb eine temporäre Vorschauseite mit Beispieldaten (wird **nicht** committet). Die Datenbank wird dabei nicht angesprochen, solange nichts angetippt wird.

**Files (temporär, am Ende löschen):** `preview.html`, `src/preview.tsx`, `.claude/launch.json`

- [ ] **Step 1: Vorschau anlegen**

`.claude/launch.json`:
```json
{ "version": "0.0.1", "configurations": [ { "name": "myfood-dev", "runtimeExecutable": "npm", "runtimeArgs": ["run", "dev"], "port": 5173 } ] }
```

`preview.html`:
```html
<!doctype html>
<html lang="de"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" /><title>preview</title></head>
<body><div id="root"></div><script type="module" src="/src/preview.tsx"></script></body></html>
```

`src/preview.tsx` (rendert Zettel-Zeilen, Vorschläge und das Sheet mit statischen Daten über dieselben CSS-Klassen; ruft keine API auf):
```tsx
// Temporary visual check (not committed): ?view=list | finish
import { createRoot } from 'react-dom/client';
import './styles.css';
import { FinishSheet } from './components/FinishSheet';
import type { ShoppingItem } from './types';

const items: ShoppingItem[] = [
  { id: 'i1', list_id: 'l1', product_id: 'p1', name: 'Bio Vollmilch 3,8 % Fett laktosefrei', quantity: 2, checked: false, created_at: '' },
  { id: 'i2', list_id: 'l1', product_id: null, name: 'Grillkohle', quantity: 1, checked: true, created_at: '' },
  { id: 'i3', list_id: 'l1', product_id: 'p3', name: 'Äpfel', quantity: 6, checked: true, created_at: '' },
];
const view = new URLSearchParams(location.search).get('view');

createRoot(document.getElementById('root')!).render(
  <div className="app">
    <form className="add-item"><input placeholder="Auf den Zettel …" /><button>+</button></form>
    <section className="card low">
      <div className="low-head"><h2>Wird knapp</h2><button type="button" className="link">Alle übernehmen</button></div>
      <div className="chips"><button className="chip">+ Butter (1)</button><button className="chip">+ Spaghetti No. 5 Vollkorn (3)</button></div>
    </section>
    <section><h2>Milchprodukte</h2><ul className="items">
      <li className="item"><button className="tick"><span className="box" /><span className="name">{items[0].name}</span><span className="qty">2×</span></button><button className="step">−</button><button className="step">+</button></li>
    </ul></section>
    <section><h2>Im Wagen (2)</h2><ul className="items">
      <li className="item done"><button className="tick"><span className="box">✓</span><span className="name">Grillkohle</span><span className="qty">1×</span></button></li>
    </ul></section>
    {Array.from({ length: 15 }, (_, n) => <p key={n}>Füllzeile {n}</p>)}
    <div className="finish-bar"><button>Einkauf abschließen</button></div>
    <nav className="tabs"><button>Bestand</button><button aria-current="page">Einkauf</button><button>Scannen</button><button>Hinzufügen</button></nav>
    {view === 'finish' && <FinishSheet listId="l1" items={items} onClose={() => {}} onFinished={async () => {}} />}
  </div>,
);
```

- [ ] **Step 2: Messen** – Dev-Server über die Browser-Pane starten (`preview_start` mit `myfood-dev`), Viewport 375×812 und 320×640, Seiten `/preview.html?view=list` und `/preview.html?view=finish`. Per JavaScript prüfen:
  - `document.documentElement.scrollWidth === innerWidth` (kein Überlauf)
  - alle `input, select` haben `font-size: 16px`
  - Höhe von `.tabs` (`getBoundingClientRect().height`) – Unterkante von `.finish-bar` muss beim Scrollen direkt über der Tab-Leiste liegen
  - im Sheet: kein horizontaler Überlauf, Footer sichtbar bei 375×560

- [ ] **Step 3: `--tabs-h` festlegen** – Weicht die gemessene Tab-Leistenhöhe (ohne Safe-Area) von 52 px ab, in `src/styles.css` in der ersten `:root { … }`-Regel (ganz oben in der Datei) die Variable `--tabs-h: <gemessen, gerundet>px;` ergänzen. Bei 52 px nichts ändern.

- [ ] **Step 4: Aufräumen und committen**

```bash
rm -f preview.html src/preview.tsx && rm -rf .claude
git status --short   # darf nur src/styles.css zeigen, falls Step 3 etwas geändert hat
git add src/styles.css && git commit -m "fix: align finish bar with tab bar height"   # nur falls geändert
```

Hinweis an den Nutzer: Chrome am Rechner bildet iOS-Layoutfehler nicht ab; maßgeblich ist Task 8.

---

### Task 8: Abnahme am iPhone

- [ ] **Step 1: [Nutzer] Push freigeben**, dann `git push origin main`; Deployment unter *Actions* abwarten.
- [ ] **Step 2: [Nutzer] Test am iPhone** (zwei Geräte, falls vorhanden) unter `https://felixsnowedin.github.io/myfood/`:
  - Tab „Einkauf“ öffnet einen leeren Zettel; zweites Gerät zeigt denselben.
  - Produkt per Vorschlag und Freitext hinzufügen; gleiches Produkt erneut → Menge steigt.
  - „Wird knapp“: einzeln und „Alle übernehmen“; danach verschwinden die Vorschläge.
  - − / +, Entfernen mit Rückgängig.
  - Auf Gerät A abhaken → Gerät B zeigt es ohne Neuladen unter „Im Wagen“.
  - „Einkauf abschließen“: MHD eintragen, Freitext optional buchen → Bestand zeigt die Einträge, nicht abgehakte stehen auf dem neuen Zettel.
  - „Frühere Einkäufe“ → Einkauf öffnen → kopieren → Meldung „n übernommen“; erneut kopieren → „Alles stand schon drauf“.
  - Kein Zoom beim Tippen, kein seitliches Verschieben, „Einkauf abschließen“ immer über der Tab-Leiste, Sheet-Footer erreichbar.
- [ ] **Step 3:** Gefundene Fehler mit superpowers:systematic-debugging beheben, committen, Liste erneut durchgehen.
