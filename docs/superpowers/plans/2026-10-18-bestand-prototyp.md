# Bestand-Prototyp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Web-Prototyp, mit dem ein Haushalt seinen Lebensmittelbestand gemeinsam pflegt: eintragen (manuell oder per Barcode), schnell austragen (−1, Füllstand, Scan), Dashboard mit „Wird knapp“.

**Architecture:** Statische React-App (Vite) ohne eigenen Server. Supabase liefert Postgres, Login und Realtime; Gleichzeitigkeits-kritische Logik (Zusammenlegen, −1) liegt in Postgres-Funktionen. Reine Logik (Sortieren, Kategorien, Open-Food-Facts-Auswertung) liegt in kleinen, getesteten TS-Modulen; die Komponenten sind dünn.

**Tech Stack:** Vite, React, TypeScript, Vitest, @supabase/supabase-js, barcode-detector (zxing-wasm-Ersatz für iOS), Open Food Facts API v2, GitHub Pages + GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-18-bestand-prototyp-design.md`

**Schritte mit [Nutzer]** macht der Mensch selbst (Konten, Schlüssel). Der Agent gibt nur die Anleitung und wartet.

---

## Dateistruktur

```
package.json, index.html, vite.config.ts, tsconfig.json, .gitignore, .env.example
supabase/schema.sql            Tabellen, Constraints, RLS, Funktionen, Realtime
.github/workflows/deploy.yml   Build + Test + Deploy auf GitHub Pages
src/
  main.tsx                     Einstieg
  env.d.ts                     Typen für VITE_-Variablen
  styles.css                   gesamtes CSS
  types.ts                     Product, StockItem, FillLevel, Toast/Notify/ChangeFn
  categories.ts (+ .test.ts)   Kategorienliste, Open-Food-Facts-Tags → Kategorie
  off.ts (+ .test.ts)          Open-Food-Facts-Abfrage und -Auswertung
  inventory.ts (+ .test.ts)    reine Bestandslogik (Ansicht, Wird knapp, MHD, Texte)
  supabase.ts                  Supabase-Client
  api.ts                       alle Datenbankzugriffe
  useInventory.ts              Laden + Realtime-Abo
  App.tsx                      Login-Weiche, Tabs, Toast mit Rückgängig, Austrage-Aktion
  components/Login.tsx
  components/Dashboard.tsx
  components/EditDialog.tsx
  components/AddForm.tsx       manuell und nach Scan
  components/Scanner.tsx       Kamera, Barcode, Modus Hinzufügen/Verbrauchen
```

---

### Task 1: Projekt-Grundgerüst

**Files:**
- Create: `package.json`, `index.html`, `vite.config.ts`, `tsconfig.json`, `.gitignore`, `.env.example`, `src/main.tsx`, `src/App.tsx`, `src/env.d.ts`, `src/styles.css`

- [ ] **Step 1: `package.json` anlegen**

```json
{
  "name": "myfood",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run --passWithNoTests"
  }
}
```

- [ ] **Step 2: Abhängigkeiten installieren**

Run:
```bash
npm install react react-dom @supabase/supabase-js barcode-detector
npm install -D vite @vitejs/plugin-react typescript vitest @types/react @types/react-dom
```
Expected: `package.json` enthält `dependencies` und `devDependencies`, `package-lock.json` existiert.

- [ ] **Step 3: Konfigurationsdateien anlegen**

`vite.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// ponytail: relative base, so the build works under any GitHub Pages subpath
export default defineConfig({ base: './', plugins: [react()] });
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["vite/client"]
  },
  "include": ["src", "vite.config.ts"]
}
```

`.gitignore`:
```
node_modules
dist
.env.local
```

`.env.example`:
```
VITE_SUPABASE_URL=https://<projekt>.supabase.co
VITE_SUPABASE_KEY=<publishable- bzw. anon-Schlüssel>
```

`index.html`:
```html
<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>myfood</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/env.d.ts`:
```ts
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_KEY: string;
}
```

`src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`src/App.tsx` (Platzhalter, wird in Task 7 ersetzt):
```tsx
export default function App() {
  return <h1>myfood</h1>;
}
```

`src/styles.css`:
```css
:root {
  --bg: #f6f5f2; --card: #fff; --text: #1d1d1b; --muted: #6b6b66; --line: #e2e0da;
  --accent: #2f6f4f; --red: #b3261e; --red-bg: #fbe9e7; --yellow-bg: #fff4d6;
  color-scheme: light dark;
  font-family: system-ui, sans-serif;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #161614; --card: #22221f; --text: #ecebe6; --muted: #a3a29b; --line: #3a3934;
    --accent: #7cc4a0; --red: #ff8a80; --red-bg: #3d1d1a; --yellow-bg: #3a3218;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); }
button, input, select { font: inherit; color: inherit; }
input, select { width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--card); }
button { padding: 10px 14px; border: 0; border-radius: 8px; background: var(--accent); color: var(--bg); cursor: pointer; }
button:disabled { opacity: .5; }
button.secondary, button.link { background: transparent; color: var(--accent); }
label { display: grid; gap: 4px; font-size: .9rem; color: var(--muted); }
h1 { font-size: 1.2rem; margin: 0; }
h2 { font-size: 1rem; margin: 16px 0 8px; }

.app { max-width: 640px; margin: 0 auto; padding: 0 16px 88px; }
header { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px; display: grid; gap: 12px; }
.login { max-width: 360px; margin: 15vh auto 0; }
.error { color: var(--red); margin: 0; }
.hint, .empty { color: var(--muted); margin: 0; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
.actions.danger button { background: transparent; color: var(--red); padding-left: 0; }

.low ul { margin: 0; padding-left: 18px; }
.controls { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 12px 0; }
.controls input[type=search] { grid-column: 1 / -1; }
.check { display: flex; align-items: center; gap: 8px; grid-column: 1 / -1; color: var(--text); }
.check input { width: auto; }

.rows { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.row { display: flex; align-items: center; gap: 6px; background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 4px; }
.row.expired { background: var(--red-bg); border-color: var(--red); }
.row.soon { background: var(--yellow-bg); }
.row .main { flex: 1; display: grid; text-align: left; background: transparent; color: var(--text); padding: 8px; }
.row .meta { font-size: .85rem; color: var(--muted); }
.row .fill { background: transparent; color: var(--accent); letter-spacing: -2px; min-width: 48px; min-height: 44px; }
.row .minus { min-width: 52px; min-height: 44px; font-weight: 600; }

.segmented { display: flex; gap: 4px; margin: 12px 0; }
.segmented button { flex: 1; background: var(--card); color: var(--text); border: 1px solid var(--line); }
.segmented button[aria-pressed=true] { background: var(--accent); color: var(--bg); }
.camera { width: 100%; border-radius: 12px; background: #000; aspect-ratio: 4 / 3; object-fit: cover; margin-bottom: 12px; }

.overlay { position: fixed; inset: 0; background: rgb(0 0 0 / .4); display: grid; place-items: end center; padding: 16px; overflow: auto; }
.dialog { width: 100%; max-width: 480px; }
.toast { position: fixed; left: 16px; right: 16px; bottom: 76px; max-width: 608px; margin: 0 auto; background: var(--text); color: var(--bg); border-radius: 10px; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.toast button { background: transparent; color: var(--bg); text-decoration: underline; padding: 4px; }
.tabs { position: fixed; left: 0; right: 0; bottom: 0; display: flex; background: var(--card); border-top: 1px solid var(--line); padding-bottom: env(safe-area-inset-bottom); }
.tabs button { flex: 1; background: transparent; color: var(--muted); border-radius: 0; padding: 16px 4px; }
.tabs button[aria-current=page] { color: var(--accent); font-weight: 600; }
```

- [ ] **Step 4: Build und Tests prüfen**

Run: `npm run build && npm test`
Expected: Build erzeugt `dist/`, Vitest meldet „No test files found“ und endet mit Exit-Code 0.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + React + TypeScript app"
```

---

### Task 2: Supabase-Schema

**Files:**
- Create: `supabase/schema.sql`

- [ ] **Step 1: `supabase/schema.sql` anlegen**

```sql
-- myfood schema. Run once in the Supabase SQL editor.

create table products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  barcode text unique,
  category text not null default 'Sonstiges',
  min_stock int not null default 0 check (min_stock >= 0),
  created_at timestamptz not null default now()
);

create table stock (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  quantity int not null check (quantity >= 1),
  best_before date,
  fill_level text not null default 'voll' check (fill_level in ('voll', 'angebrochen', 'fast_leer')),
  planned_for text,
  created_at timestamptz not null default now(),
  unique nulls not distinct (product_id, best_before)
);

-- One household: every signed-in user may do everything, anonymous users nothing.
alter table products enable row level security;
alter table stock enable row level security;
create policy household on products for all to authenticated using (true) with check (true);
create policy household on stock for all to authenticated using (true) with check (true);

-- Same product + same best-before date is merged into one row.
create function add_stock(p_product_id uuid, p_quantity int, p_best_before date)
returns stock language sql as $$
  insert into stock (product_id, quantity, best_before)
  values (p_product_id, p_quantity, p_best_before)
  on conflict (product_id, best_before)
    do update set quantity = stock.quantity + excluded.quantity
  returning *;
$$;

-- Takes one unit, resets fill level for the next pack, deletes at zero.
-- Returns the row as it was before (for undo), or null if it no longer exists.
create function consume(p_stock_id uuid)
returns stock language plpgsql as $$
declare prev stock;
begin
  select * into prev from stock where id = p_stock_id for update;
  if not found then return null; end if;
  if prev.quantity <= 1 then
    delete from stock where id = p_stock_id;
  else
    update stock set quantity = quantity - 1, fill_level = 'voll' where id = p_stock_id;
  end if;
  return prev;
end $$;

-- voll -> angebrochen -> fast_leer -> consume.
create function advance_fill(p_stock_id uuid)
returns stock language plpgsql as $$
declare prev stock;
begin
  select * into prev from stock where id = p_stock_id for update;
  if not found then return null; end if;
  if prev.fill_level = 'fast_leer' then
    return consume(p_stock_id);
  end if;
  update stock
    set fill_level = case prev.fill_level when 'voll' then 'angebrochen' else 'fast_leer' end
    where id = p_stock_id;
  return prev;
end $$;

alter publication supabase_realtime add table products, stock;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat: add Supabase schema with RLS and stock functions"
```

- [ ] **Step 3: [Nutzer] Supabase einrichten**

Anleitung an den Nutzer ausgeben und warten, bis er fertig meldet:
1. Auf supabase.com ein neues Projekt anlegen, Region „Central EU (Frankfurt)“. Das Datenbank-Passwort im Passwortmanager ablegen; die App braucht es nicht.
2. *SQL Editor* → Inhalt von `supabase/schema.sql` einfügen → *Run*. Erwartet: „Success. No rows returned“.
3. *Authentication → Sign In / Providers*: „Allow new users to sign up“ ausschalten.
4. *Authentication → Users → Add user → Create new user*: für jedes Haushaltsmitglied E-Mail + Passwort, „Auto Confirm User“ anhaken.
5. *Project Settings → API Keys*: Projekt-URL und **publishable key** (bzw. „anon“-Schlüssel) in eine neue Datei `.env.local` im Projektordner eintragen, Format wie `.env.example`. **Niemals** den `service_role`/secret key verwenden.

---

### Task 3: Typen und Kategorien

**Files:**
- Create: `src/types.ts`, `src/categories.ts`
- Test: `src/categories.test.ts`

- [ ] **Step 1: `src/types.ts` anlegen**

```ts
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
```

- [ ] **Step 2: Failing test schreiben** – `src/categories.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { categoryFromOffTags } from './categories';

describe('categoryFromOffTags', () => {
  it('maps dairy tags', () => {
    expect(categoryFromOffTags(['en:dairies', 'en:yogurts'])).toBe('Milchprodukte');
  });
  it('prefers frozen over the food type', () => {
    expect(categoryFromOffTags(['en:vegetables', 'en:frozen-foods'])).toBe('Tiefkühl');
  });
  it('prefers beverages over fruits', () => {
    expect(categoryFromOffTags(['en:fruits-based-foods', 'en:beverages', 'en:fruit-juices'])).toBe('Getränke');
  });
  it('falls back to Sonstiges', () => {
    expect(categoryFromOffTags(['en:something-else'])).toBe('Sonstiges');
    expect(categoryFromOffTags([])).toBe('Sonstiges');
  });
});
```

- [ ] **Step 3: Test laufen lassen, er muss scheitern**

Run: `npm test`
Expected: FAIL, „Failed to resolve import "./categories"“.

- [ ] **Step 4: `src/categories.ts` implementieren**

```ts
export const CATEGORIES = [
  'Milchprodukte',
  'Obst & Gemüse',
  'Fleisch & Fisch',
  'Brot & Backwaren',
  'Tiefkühl',
  'Vorrat & Konserven',
  'Getränke',
  'Snacks & Süßes',
  'Gewürze & Saucen',
  'Sonstiges',
] as const;

export type Category = (typeof CATEGORIES)[number];

// Order matters: first keyword found in any tag wins.
const OFF_KEYWORDS: [string, Category][] = [
  ['frozen', 'Tiefkühl'],
  ['beverages', 'Getränke'],
  ['snacks', 'Snacks & Süßes'],
  ['sweets', 'Snacks & Süßes'],
  ['chocolates', 'Snacks & Süßes'],
  ['dairies', 'Milchprodukte'],
  ['cheeses', 'Milchprodukte'],
  ['yogurts', 'Milchprodukte'],
  ['milks', 'Milchprodukte'],
  ['meats', 'Fleisch & Fisch'],
  ['fishes', 'Fleisch & Fisch'],
  ['seafood', 'Fleisch & Fisch'],
  ['fruits', 'Obst & Gemüse'],
  ['vegetables', 'Obst & Gemüse'],
  ['breads', 'Brot & Backwaren'],
  ['pastries', 'Brot & Backwaren'],
  ['condiments', 'Gewürze & Saucen'],
  ['sauces', 'Gewürze & Saucen'],
  ['spices', 'Gewürze & Saucen'],
  ['canned', 'Vorrat & Konserven'],
  ['cereals', 'Vorrat & Konserven'],
  ['pastas', 'Vorrat & Konserven'],
  ['rices', 'Vorrat & Konserven'],
];

export function categoryFromOffTags(tags: string[]): Category {
  for (const [keyword, category] of OFF_KEYWORDS) {
    if (tags.some((tag) => tag.includes(keyword))) return category;
  }
  return 'Sonstiges';
}
```

- [ ] **Step 5: Tests grün**

Run: `npm test`
Expected: PASS, 4 Tests.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/categories.ts src/categories.test.ts
git commit -m "feat: add domain types and category mapping"
```

---

### Task 4: Open Food Facts

**Files:**
- Create: `src/off.ts`
- Test: `src/off.test.ts`

- [ ] **Step 1: Failing test schreiben** – `src/off.test.ts`

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchOffProduct, parseOffResponse } from './off';

describe('parseOffResponse', () => {
  it('prefers the German name', () => {
    const json = { status: 1, product: { product_name: 'Milk', product_name_de: 'Vollmilch ', categories_tags: ['en:milks'] } };
    expect(parseOffResponse(json)).toEqual({ name: 'Vollmilch', category: 'Milchprodukte' });
  });
  it('falls back to the generic name and Sonstiges', () => {
    expect(parseOffResponse({ status: 1, product: { product_name: 'Thing' } })).toEqual({ name: 'Thing', category: 'Sonstiges' });
  });
  it('returns null when not found', () => {
    expect(parseOffResponse({ status: 0 })).toBeNull();
    expect(parseOffResponse(null)).toBeNull();
  });
});

describe('fetchOffProduct', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns null on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await fetchOffProduct('4000000000000')).toBeNull();
  });
  it('returns null on HTTP 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 404 })));
    expect(await fetchOffProduct('4000000000000')).toBeNull();
  });
  it('parses a found product', async () => {
    const body = JSON.stringify({ status: 1, product: { product_name_de: 'Butter', categories_tags: ['en:dairies'] } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 200 })));
    expect(await fetchOffProduct('4000000000000')).toEqual({ name: 'Butter', category: 'Milchprodukte' });
  });
});
```

- [ ] **Step 2: Test laufen lassen, er muss scheitern**

Run: `npm test`
Expected: FAIL, „Failed to resolve import "./off"“.

- [ ] **Step 3: `src/off.ts` implementieren**

```ts
import { categoryFromOffTags, type Category } from './categories';

export interface OffResult {
  name: string;
  category: Category;
}

interface OffResponse {
  status?: number;
  product?: { product_name?: string; product_name_de?: string; categories_tags?: string[] };
}

export function parseOffResponse(json: OffResponse | null): OffResult | null {
  if (json?.status !== 1 || !json.product) return null;
  const p = json.product;
  return {
    name: (p.product_name_de || p.product_name || '').trim(),
    category: categoryFromOffTags(p.categories_tags ?? []),
  };
}

// Any failure means "unknown product": the user just types the name.
export async function fetchOffProduct(barcode: string): Promise<OffResult | null> {
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}?fields=product_name,product_name_de,categories_tags`,
    );
    if (!res.ok) return null;
    return parseOffResponse(await res.json());
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Tests grün**

Run: `npm test`
Expected: PASS, alle Tests aus Task 3 und 4.

- [ ] **Step 5: Commit**

```bash
git add src/off.ts src/off.test.ts
git commit -m "feat: add Open Food Facts lookup"
```

---

### Task 5: Bestandslogik

**Files:**
- Create: `src/inventory.ts`
- Test: `src/inventory.test.ts`

- [ ] **Step 1: Failing test schreiben** – `src/inventory.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import {
  addDays, buildView, describeChange, expiryStatus, findProductByName, formatDate, lowStock, pickConsumeTarget,
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
  it('returns no groups when nothing matches', () => {
    expect(buildView(products, stock, { ...base, search: 'xyz' })).toEqual([]);
    expect(buildView(products, stock, { ...base, search: 'xyz', group: false })).toEqual([]);
  });
});
```

- [ ] **Step 2: Test laufen lassen, er muss scheitern**

Run: `npm test`
Expected: FAIL, „Failed to resolve import "./inventory"“.

- [ ] **Step 3: `src/inventory.ts` implementieren**

```ts
import { CATEGORIES } from './categories';
import type { ChangeKind, FillLevel, Product, StockItem } from './types';

export const FILL_LABEL: Record<FillLevel, string> = { voll: 'voll', angebrochen: 'angebrochen', fast_leer: 'fast leer' };

const NO_DATE = '9999-12-31';
const byDate = (a: StockItem, b: StockItem) => (a.best_before ?? NO_DATE).localeCompare(b.best_before ?? NO_DATE);
const byName = (a: Row, b: Row) => a.product.name.localeCompare(b.product.name, 'de');

export function todayISO(now = new Date()): string {
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
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

export function pickConsumeTarget(stock: StockItem[], productId: string): StockItem | undefined {
  return stock.filter((s) => s.product_id === productId).sort(byDate)[0];
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
  neu: (a, b) => b.created_at.localeCompare(a.created_at),
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
    .filter((r) => !opts.category || r.product.category === opts.category)
    .sort(COMPARE[opts.sort]);

  if (!opts.group) return rows.length ? [{ title: '', rows }] : [];
  const groupOf = (r: Row) => ((CATEGORIES as readonly string[]).includes(r.product.category) ? r.product.category : 'Sonstiges');
  return CATEGORIES.map((title) => ({ title, rows: rows.filter((r) => groupOf(r) === title) })).filter((g) => g.rows.length);
}
```

- [ ] **Step 4: Tests grün**

Run: `npm test`
Expected: PASS, alle Tests.

- [ ] **Step 5: Commit**

```bash
git add src/inventory.ts src/inventory.test.ts
git commit -m "feat: add inventory view logic"
```

---

### Task 6: Supabase-Client, Datenzugriff, Realtime

**Files:**
- Create: `src/supabase.ts`, `src/api.ts`, `src/useInventory.ts`

Keine Unit-Tests: das sind dünne Hüllen um supabase-js, geprüft wird im Abnahmetest (Task 12).

- [ ] **Step 1: `src/supabase.ts` anlegen**

```ts
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_KEY);
```

- [ ] **Step 2: `src/api.ts` anlegen**

```ts
import { supabase } from './supabase';
import type { Product, StockItem } from './types';

async function run<T>(query: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data as T;
}

// Functions returning a composite may come back as an all-null object instead of null.
const rowOrNull = (row: StockItem | null) => (row?.id ? row : null);

export const loadProducts = () => run<Product[]>(supabase.from('products').select('*'));
export const loadStock = () => run<StockItem[]>(supabase.from('stock').select('*'));

export const createProduct = (product: { name: string; barcode: string | null; category: string }) =>
  run<Product>(supabase.from('products').insert(product).select().single());
export const updateProduct = (id: string, patch: Partial<Omit<Product, 'id' | 'created_at'>>) =>
  run<null>(supabase.from('products').update(patch).eq('id', id));
export const deleteProduct = (id: string) => run<null>(supabase.from('products').delete().eq('id', id));

export const addStock = (productId: string, quantity: number, bestBefore: string | null) =>
  run<StockItem>(supabase.rpc('add_stock', { p_product_id: productId, p_quantity: quantity, p_best_before: bestBefore }));
export const updateStock = (id: string, patch: Partial<Omit<StockItem, 'id' | 'product_id' | 'created_at'>>) =>
  run<null>(supabase.from('stock').update(patch).eq('id', id));
export const deleteStock = (id: string) => run<null>(supabase.from('stock').delete().eq('id', id));

/** Both return the row as it was before, or null if it no longer exists. */
export const consume = async (stockId: string) =>
  rowOrNull(await run<StockItem | null>(supabase.rpc('consume', { p_stock_id: stockId })));
export const advanceFill = async (stockId: string) =>
  rowOrNull(await run<StockItem | null>(supabase.rpc('advance_fill', { p_stock_id: stockId })));

/** Undo: writes the previous row back, re-inserting it if it was deleted. */
export const restoreStock = (prev: StockItem) => run<null>(supabase.from('stock').upsert(prev));
```

- [ ] **Step 3: `src/useInventory.ts` anlegen**

```ts
import { useCallback, useEffect, useState } from 'react';
import { loadProducts, loadStock } from './api';
import { supabase } from './supabase';
import type { Product, StockItem } from './types';

// ponytail: any change reloads both tables; a household's inventory is small
export function useInventory() {
  const [products, setProducts] = useState<Product[]>([]);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [p, s] = await Promise.all([loadProducts(), loadStock()]);
      setProducts(p);
      setStock(s);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void reload();
    const channel = supabase
      .channel('inventory')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => void reload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock' }, () => void reload())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [reload]);

  return { products, stock, error, reload };
}
```

- [ ] **Step 4: Typprüfung**

Run: `npx tsc`
Expected: keine Ausgabe, Exit-Code 0.

- [ ] **Step 5: Commit**

```bash
git add src/supabase.ts src/api.ts src/useInventory.ts
git commit -m "feat: add Supabase data access and realtime hook"
```

---

### Task 7: Login, App-Rahmen, Austragen mit Rückgängig

**Files:**
- Create: `src/components/Login.tsx`
- Modify: `src/App.tsx` (Platzhalter komplett ersetzen)

Dashboard, Scanner und AddForm existieren noch nicht. Bis Task 8–11 zeigen die Tabs Platzhaltertext; jede dieser Tasks ersetzt genau ihre Zeile in `App.tsx`.

- [ ] **Step 1: `src/components/Login.tsx` anlegen**

```tsx
import { useState, type FormEvent } from 'react';
import { supabase } from '../supabase';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setError(`Login fehlgeschlagen: ${error.message}`);
  }

  return (
    <form className="card login" onSubmit={submit}>
      <h1>myfood</h1>
      <label>
        E-Mail
        <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label>
        Passwort
        <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      <button disabled={busy}>Anmelden</button>
    </form>
  );
}
```

- [ ] **Step 2: `src/App.tsx` ersetzen**

```tsx
import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { advanceFill, consume, restoreStock } from './api';
import { describeChange } from './inventory';
import { supabase } from './supabase';
import type { ChangeFn, Notify, Toast } from './types';
import { useInventory } from './useInventory';
import { Login } from './components/Login';

type Tab = 'bestand' | 'scan' | 'add';
const TABS: [Tab, string][] = [['bestand', 'Bestand'], ['scan', 'Scannen'], ['add', 'Hinzufügen']];

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) return null;
  return session ? <Main /> : <Login />;
}

function Main() {
  const { products, stock, error, reload } = useInventory();
  const [tab, setTab] = useState<Tab>('bestand');
  const [toast, setToast] = useState<(Toast & { id: number }) | null>(null);

  const notify: Notify = useCallback((t) => setToast({ ...t, id: Date.now() }), []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  const change: ChangeFn = useCallback(
    async (kind, item, product) => {
      try {
        const prev = await (kind === 'consume' ? consume(item.id) : advanceFill(item.id));
        if (!prev) return notify({ text: 'Nicht im Bestand' });
        notify({
          text: describeChange(kind, prev, product.name),
          undo: async () => {
            await restoreStock(prev);
            await reload();
          },
        });
        await reload();
      } catch (e) {
        notify({ text: `Fehler: ${(e as Error).message}` });
      }
    },
    [notify, reload],
  );

  async function undo() {
    const fn = toast?.undo;
    if (!fn) return;
    setToast(null);
    try {
      await fn();
    } catch (e) {
      notify({ text: `Rückgängig fehlgeschlagen: ${(e as Error).message}` });
    }
  }

  return (
    <div className="app">
      <header>
        <h1>myfood</h1>
        <button className="link" onClick={() => void supabase.auth.signOut()}>Abmelden</button>
      </header>
      {error && <p className="error">Laden fehlgeschlagen: {error}</p>}
      <main>
        {tab === 'bestand' && <p>Bestand folgt ({stock.length} Einträge, {products.length} Produkte)</p>}
        {tab === 'scan' && <p>Scanner folgt</p>}
        {tab === 'add' && <p>Formular folgt</p>}
      </main>
      {toast && (
        <div className="toast" role="status">
          <span>{toast.text}</span>
          {toast.undo && <button onClick={() => void undo()}>Rückgängig</button>}
        </div>
      )}
      <nav className="tabs">
        {TABS.map(([id, label]) => (
          <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
```

Hinweis: `change` wird erst ab Task 8 benutzt. Falls `tsc` wegen unbenutzter Variablen meckert: die Konfiguration aus Task 1 setzt `noUnusedLocals` nicht, es sollte also durchlaufen.

- [ ] **Step 3: Lokal prüfen** (braucht `.env.local` aus Task 2)

Run: `npm run dev` und `http://localhost:5173` öffnen.
Expected: Login-Formular. Falsches Passwort → rote Fehlermeldung. Richtige Daten → Kopfzeile, Text „Bestand folgt (0 Einträge, 0 Produkte)“, Tab-Leiste. „Abmelden“ führt zurück zum Login. Neu laden bleibt eingeloggt.

- [ ] **Step 4: Build + Commit**

Run: `npm run build`
Expected: Erfolg.

```bash
git add src/App.tsx src/components/Login.tsx
git commit -m "feat: add login, tab shell and undoable consume action"
```

---

### Task 8: Dashboard

**Files:**
- Create: `src/components/Dashboard.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: `src/components/Dashboard.tsx` anlegen**

`EditDialog` folgt in Task 9; bis dahin ist der Import und die letzte Zeile auskommentiert (siehe Step 3 dort).

```tsx
import { useState } from 'react';
import { CATEGORIES } from '../categories';
import { buildView, expiryStatus, FILL_LABEL, formatDate, lowStock, todayISO, type Row, type ViewOptions } from '../inventory';
import type { ChangeFn, FillLevel, Notify, Product, StockItem } from '../types';
// import { EditDialog } from './EditDialog';

const FILL_ICON: Record<FillLevel, string> = { voll: '▮▮▮', angebrochen: '▮▮▯', fast_leer: '▮▯▯' };

interface Props {
  products: Product[];
  stock: StockItem[];
  onChange: ChangeFn;
  onSaved: () => Promise<void>;
  notify: Notify;
}

export function Dashboard({ products, stock, onChange, onSaved, notify }: Props) {
  const [opts, setOpts] = useState<ViewOptions>({ search: '', category: '', sort: 'mhd', group: true });
  const [editing, setEditing] = useState<Row | null>(null);
  const set = (patch: Partial<ViewOptions>) => setOpts((o) => ({ ...o, ...patch }));
  const today = todayISO();
  const low = lowStock(products, stock);
  const groups = buildView(products, stock, opts);

  return (
    <>
      {low.length > 0 && (
        <section className="card low">
          <h2>Wird knapp</h2>
          <ul>
            {low.map(({ product, total }) => (
              <li key={product.id}>
                {product.name}: {total} von mind. {product.min_stock}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="controls">
        <input type="search" placeholder="Suchen…" aria-label="Suchen" value={opts.search} onChange={(e) => set({ search: e.target.value })} />
        <select aria-label="Kategorie" value={opts.category} onChange={(e) => set({ category: e.target.value })}>
          <option value="">Alle Kategorien</option>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select aria-label="Sortierung" value={opts.sort} onChange={(e) => set({ sort: e.target.value as ViewOptions['sort'] })}>
          <option value="mhd">nach MHD</option>
          <option value="name">nach Name</option>
          <option value="neu">zuletzt hinzugefügt</option>
        </select>
        <label className="check">
          <input type="checkbox" checked={opts.group} onChange={(e) => set({ group: e.target.checked })} />
          nach Kategorie gruppieren
        </label>
      </div>

      {groups.length === 0 && <p className="empty">Nichts gefunden.</p>}
      {groups.map((g) => (
        <section key={g.title || 'alle'}>
          {g.title && <h2>{g.title}</h2>}
          <ul className="rows">
            {g.rows.map((r) => (
              <li key={r.id} className={`row ${expiryStatus(r.best_before, today)}`}>
                <button className="main" onClick={() => setEditing(r)}>
                  <span className="name">{r.product.name}</span>
                  <span className="meta">
                    {r.quantity}×{r.best_before && ` · MHD ${formatDate(r.best_before)}`}
                    {r.planned_for && ` · geplant: ${r.planned_for}`}
                  </span>
                </button>
                <button
                  className="fill"
                  aria-label={`Füllstand ${FILL_LABEL[r.fill_level]}, antippen zum Weiterschalten`}
                  onClick={() => void onChange('advance', r, r.product)}
                >
                  {FILL_ICON[r.fill_level]}
                </button>
                <button className="minus" aria-label={`Eins ${r.product.name} verbrauchen`} onClick={() => void onChange('consume', r, r.product)}>
                  −1
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {/* {editing && <EditDialog row={editing} onClose={() => setEditing(null)} onSaved={onSaved} notify={notify} />} */}
    </>
  );
}
```

- [ ] **Step 2: In `src/App.tsx` einbinden**

Import ergänzen:
```tsx
import { Dashboard } from './components/Dashboard';
```
Zeile ersetzen:
```tsx
        {tab === 'bestand' && <p>Bestand folgt ({stock.length} Einträge, {products.length} Produkte)</p>}
```
durch:
```tsx
        {tab === 'bestand' && <Dashboard products={products} stock={stock} onChange={change} onSaved={reload} notify={notify} />}
```

- [ ] **Step 3: Testdaten anlegen und prüfen**

Im Supabase *SQL Editor* ausführen:
```sql
insert into products (name, category, min_stock) values ('Milch', 'Milchprodukte', 2), ('Äpfel', 'Obst & Gemüse', 0);
select add_stock((select id from products where name = 'Milch'), 1, current_date + 1);
select add_stock((select id from products where name = 'Äpfel'), 4, current_date + 10);
```
Run: `npm run build && npm run dev`, einloggen.
Expected:
- „Wird knapp: Milch: 1 von mind. 2“.
- Gruppen „Milchprodukte“ (Milch gelb markiert) und „Obst & Gemüse“.
- Füllstand bei Äpfeln dreimal antippen → Toast „Äpfel: angebrochen“, „…: fast leer“, „Äpfel −1 (noch 3)“. „Rückgängig“ stellt den vorigen Stand her.
- −1 bei Milch → Eintrag verschwindet, „Wird knapp: Milch: 0 von mind. 2“. „Rückgängig“ holt ihn zurück.
- Zweiter Browser-Tab parallel offen: Änderungen erscheinen dort ohne Neuladen.

- [ ] **Step 4: Commit**

```bash
git add src/components/Dashboard.tsx src/App.tsx
git commit -m "feat: add inventory dashboard with quick consume"
```

---

### Task 9: Bearbeiten-Dialog

**Files:**
- Create: `src/components/EditDialog.tsx`
- Modify: `src/components/Dashboard.tsx`

- [ ] **Step 1: `src/components/EditDialog.tsx` anlegen**

```tsx
import { useState, type FormEvent } from 'react';
import { CATEGORIES } from '../categories';
import { deleteProduct, deleteStock, updateProduct, updateStock } from '../api';
import { FILL_LABEL, type Row } from '../inventory';
import type { FillLevel, Notify } from '../types';

interface Props {
  row: Row;
  onClose: () => void;
  onSaved: () => Promise<void>;
  notify: Notify;
}

export function EditDialog({ row, onClose, onSaved, notify }: Props) {
  const [name, setName] = useState(row.product.name);
  const [category, setCategory] = useState(row.product.category);
  const [minStock, setMinStock] = useState(row.product.min_stock);
  const [quantity, setQuantity] = useState(row.quantity);
  const [bestBefore, setBestBefore] = useState(row.best_before ?? '');
  const [fill, setFill] = useState<FillLevel>(row.fill_level);
  const [plannedFor, setPlannedFor] = useState(row.planned_for ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // On failure the dialog stays open with all inputs intact.
  async function act(fn: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await onSaved();
      notify({ text: message });
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  function save(e: FormEvent) {
    e.preventDefault();
    void act(async () => {
      await updateProduct(row.product.id, { name: name.trim(), category, min_stock: minStock });
      await updateStock(row.id, { quantity, best_before: bestBefore || null, fill_level: fill, planned_for: plannedFor.trim() || null });
    }, 'Gespeichert');
  }

  function removeProduct() {
    if (confirm(`„${row.product.name}“ samt gesamtem Bestand löschen?`)) {
      void act(() => deleteProduct(row.product.id), 'Produkt gelöscht');
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <form className="card dialog" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <h2>Bearbeiten</h2>
        <label>
          Name
          <input required value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Kategorie
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Mindestbestand
          <input type="number" min={0} required value={minStock} onChange={(e) => setMinStock(Number(e.target.value))} />
        </label>
        <label>
          Menge
          <input type="number" min={1} required value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
        </label>
        <label>
          MHD
          <input type="date" value={bestBefore} onChange={(e) => setBestBefore(e.target.value)} />
        </label>
        <label>
          Füllstand
          <select value={fill} onChange={(e) => setFill(e.target.value as FillLevel)}>
            {(Object.keys(FILL_LABEL) as FillLevel[]).map((f) => (
              <option key={f} value={f}>
                {FILL_LABEL[f]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Geplant für
          <input value={plannedFor} placeholder="z. B. Lasagne Sonntag" onChange={(e) => setPlannedFor(e.target.value)} />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button disabled={busy}>Speichern</button>
          <button type="button" className="secondary" onClick={onClose}>
            Abbrechen
          </button>
        </div>
        <div className="actions danger">
          <button type="button" disabled={busy} onClick={() => void act(() => deleteStock(row.id), 'Eintrag gelöscht')}>
            Eintrag löschen
          </button>
          <button type="button" disabled={busy} onClick={removeProduct}>
            Produkt löschen
          </button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: In `src/components/Dashboard.tsx` aktivieren**

Zeile `// import { EditDialog } from './EditDialog';` ersetzen durch:
```tsx
import { EditDialog } from './EditDialog';
```
Die auskommentierte Zeile am Ende (beginnt mit `{/* {editing && <EditDialog`) ersetzen durch:
```tsx
      {editing && <EditDialog row={editing} onClose={() => setEditing(null)} onSaved={onSaved} notify={notify} />}
```

- [ ] **Step 3: Prüfen**

Run: `npm run build && npm run dev`
Expected:
- Tippen auf „Äpfel“ öffnet den Dialog mit den aktuellen Werten.
- „Geplant für: Kuchen“ speichern → Zeile zeigt „geplant: Kuchen“.
- Mindestbestand Äpfel auf 10 → erscheint unter „Wird knapp“.
- Bei laufendem Dialog das Netzwerk in den DevTools auf „Offline“ stellen, Speichern → Fehlermeldung, Eingaben bleiben stehen.
- „Produkt löschen“ fragt nach, löscht Produkt samt Bestand.

- [ ] **Step 4: Commit**

```bash
git add src/components/EditDialog.tsx src/components/Dashboard.tsx
git commit -m "feat: add edit dialog for stock entries and products"
```

---

### Task 10: Manuelles Hinzufügen

**Files:**
- Create: `src/components/AddForm.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: `src/components/AddForm.tsx` anlegen**

```tsx
import { useState, type FormEvent } from 'react';
import { CATEGORIES } from '../categories';
import { addStock, createProduct, updateProduct } from '../api';
import { findProductByName } from '../inventory';
import type { Notify, Product } from '../types';

export interface AddInitial {
  name: string;
  category: string;
  barcode: string | null;
}

interface Props {
  products: Product[];
  initial?: AddInitial;
  onSaved: () => Promise<void>;
  notify: Notify;
  onDone?: () => void; // set when shown after a scan: closes the form
}

export function AddForm({ products, initial, onSaved, notify, onDone }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [category, setCategory] = useState(initial?.category ?? 'Sonstiges');
  const [quantity, setQuantity] = useState(1);
  const [bestBefore, setBestBefore] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const barcode = initial?.barcode ?? null;

  function changeName(value: string) {
    setName(value);
    const known = findProductByName(products, value);
    if (known) setCategory(known.category);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      let product = (barcode ? products.find((p) => p.barcode === barcode) : undefined) ?? findProductByName(products, name);
      if (!product) product = await createProduct({ name: name.trim(), barcode, category });
      else if (barcode && !product.barcode) await updateProduct(product.id, { barcode });
      await addStock(product.id, quantity, bestBefore || null);
      await onSaved();
      notify({ text: `${product.name} +${quantity}` });
      setName('');
      setCategory('Sonstiges');
      setQuantity(1);
      setBestBefore('');
      onDone?.();
    } catch (err) {
      // Inputs stay as they are so nothing has to be retyped.
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>Hinzufügen</h2>
      {barcode && <p className="hint">Barcode {barcode}</p>}
      <label>
        Name
        <input required list="product-names" autoComplete="off" value={name} onChange={(e) => changeName(e.target.value)} />
      </label>
      <datalist id="product-names">
        {products.map((p) => (
          <option key={p.id} value={p.name} />
        ))}
      </datalist>
      <label>
        Kategorie
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <label>
        Menge
        <input type="number" min={1} required value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
      </label>
      <label>
        MHD
        <input type="date" value={bestBefore} onChange={(e) => setBestBefore(e.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button disabled={busy}>Speichern</button>
        {onDone && (
          <button type="button" className="secondary" onClick={onDone}>
            Abbrechen
          </button>
        )}
      </div>
    </form>
  );
}
```

- [ ] **Step 2: In `src/App.tsx` einbinden**

Import ergänzen:
```tsx
import { AddForm } from './components/AddForm';
```
Zeile `{tab === 'add' && <p>Formular folgt</p>}` ersetzen durch:
```tsx
        {tab === 'add' && <AddForm products={products} onSaved={reload} notify={notify} />}
```

- [ ] **Step 3: Prüfen**

Run: `npm run build && npm run dev`
Expected:
- „milch“ tippen → Vorschlag „Milch“, Kategorie springt auf „Milchprodukte“. Speichern mit MHD = das MHD des vorhandenen Eintrags → **kein** neuer Eintrag, Menge steigt.
- Anderes MHD → zweiter Milch-Eintrag.
- Neuer Name „Joghurt“ → neues Produkt, Toast „Joghurt +1“, Formular leer.
- Offline speichern → Fehlermeldung, Eingaben bleiben.

- [ ] **Step 4: Commit**

```bash
git add src/components/AddForm.tsx src/App.tsx
git commit -m "feat: add manual add form with duplicate-safe product matching"
```

---

### Task 11: Deployment auf GitHub Pages

Kamera-Zugriff braucht HTTPS. Am Handy wird deshalb über die veröffentlichte Seite getestet; am Rechner reicht `localhost`.

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: `.github/workflows/deploy.yml` anlegen**

```yaml
name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_KEY: ${{ secrets.VITE_SUPABASE_KEY }}
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: deploy to GitHub Pages"
```

- [ ] **Step 3: [Nutzer] GitHub einrichten**

Anleitung ausgeben und warten:
1. GitHub Pages geht kostenlos nur bei **öffentlichen** Repos. Bei privatem Repo: entweder öffentlich stellen (der Code enthält keine Geheimnisse; die Daten schützt Supabase) oder GitHub Pro nutzen.
2. Repo → *Settings → Secrets and variables → Actions → New repository secret*: `VITE_SUPABASE_URL` und `VITE_SUPABASE_KEY`, Werte wie in `.env.local`.
3. Repo → *Settings → Pages → Source*: „GitHub Actions“.

- [ ] **Step 4: Pushen (nach Freigabe durch den Nutzer)**

```bash
git push -u origin main
```
Expected: Workflow „Deploy“ läuft grün durch; die Seite ist unter `https://felixsnowedin.github.io/myfood/` erreichbar, Login funktioniert vom Handy aus.

---

### Task 12: Scanner

**Files:**
- Create: `src/components/Scanner.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: `src/components/Scanner.tsx` anlegen**

```tsx
import { useEffect, useRef, useState } from 'react';
import { BarcodeDetector as BarcodeDetectorPonyfill } from 'barcode-detector/ponyfill';
import { pickConsumeTarget } from '../inventory';
import { fetchOffProduct } from '../off';
import type { ChangeFn, Notify, Product, StockItem } from '../types';
import { AddForm, type AddInitial } from './AddForm';

// ponytail: native detector where the browser has one (Chrome Android), zxing-wasm otherwise (iOS Safari)
const Detector: typeof BarcodeDetectorPonyfill =
  'BarcodeDetector' in globalThis
    ? (globalThis as unknown as { BarcodeDetector: typeof BarcodeDetectorPonyfill }).BarcodeDetector
    : BarcodeDetectorPonyfill;

const SAME_CODE_PAUSE_MS = 2000;

type Mode = 'add' | 'consume';

interface Props {
  products: Product[];
  stock: StockItem[];
  onChange: ChangeFn;
  onSaved: () => Promise<void>;
  notify: Notify;
}

export function Scanner({ products, stock, onChange, onSaved, notify }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [mode, setMode] = useState<Mode>('add');
  const [pending, setPending] = useState<AddInitial | null>(null);
  const [manual, setManual] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const last = useRef({ code: '', at: 0 });
  const busy = useRef(false);

  async function handleCode(code: string) {
    const now = Date.now();
    if (busy.current || pending) return;
    if (code === last.current.code && now - last.current.at < SAME_CODE_PAUSE_MS) return;
    last.current = { code, at: now };
    busy.current = true;
    try {
      const product = products.find((p) => p.barcode === code);
      if (mode === 'consume') {
        const target = product && pickConsumeTarget(stock, product.id);
        if (product && target) await onChange('consume', target, product);
        else notify({ text: 'Nicht im Bestand' });
      } else if (product) {
        setPending({ name: product.name, category: product.category, barcode: code });
      } else {
        const off = await fetchOffProduct(code);
        setPending({ name: off?.name ?? '', category: off?.category ?? 'Sonstiges', barcode: code });
      }
    } finally {
      busy.current = false;
    }
  }

  // The camera loop runs once; it always calls the latest handleCode (current mode, products, stock).
  const handler = useRef(handleCode);
  handler.current = handleCode;

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamError('Diese Seite hat keinen Kamerazugriff (HTTPS nötig).');
      return;
    }
    let stream: MediaStream | undefined;
    let timer: number | undefined;
    let stopped = false;
    const detector = new Detector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((s) => {
        if (stopped) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        const video = videoRef.current!;
        video.srcObject = s;
        void video.play();
        const tick = async () => {
          if (stopped) return;
          if (video.readyState >= 2) {
            const codes = await detector.detect(video).catch(() => []);
            if (codes[0]) void handler.current(codes[0].rawValue);
          }
          timer = window.setTimeout(tick, 250);
        };
        void tick();
      })
      .catch(() => setCamError('Kamera nicht verfügbar oder nicht erlaubt.'));

    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const closeForm = () => {
    setPending(null);
    setManual(false);
  };

  return (
    <>
      <div className="segmented" role="group" aria-label="Scan-Modus">
        <button aria-pressed={mode === 'add'} onClick={() => setMode('add')}>
          Hinzufügen
        </button>
        <button aria-pressed={mode === 'consume'} onClick={() => setMode('consume')}>
          Verbrauchen
        </button>
      </div>
      {camError ? (
        <div className="card">
          <p className="error">{camError}</p>
          <button onClick={() => setManual(true)}>Manuell eintragen</button>
        </div>
      ) : (
        <video ref={videoRef} className="camera" muted playsInline />
      )}
      {(pending || manual) && (
        <AddForm
          key={pending?.barcode ?? 'manual'}
          products={products}
          initial={pending ?? undefined}
          onSaved={onSaved}
          notify={notify}
          onDone={closeForm}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: In `src/App.tsx` einbinden**

Import ergänzen:
```tsx
import { Scanner } from './components/Scanner';
```
Zeile `{tab === 'scan' && <p>Scanner folgt</p>}` ersetzen durch:
```tsx
        {tab === 'scan' && <Scanner products={products} stock={stock} onChange={change} onSaved={reload} notify={notify} />}
```

- [ ] **Step 3: Build und Tests**

Run: `npm run build && npm test`
Expected: beides erfolgreich. Falls `tsc` die Typen von `barcode-detector/ponyfill` nicht findet: `npm ls barcode-detector` prüfen und in `node_modules/barcode-detector/package.json` unter `exports` den Pfad des Ponyfills nachsehen; Import entsprechend anpassen.

- [ ] **Step 4: Am Rechner prüfen**

Run: `npm run dev`, Tab „Scannen“, Webcam erlauben, einen Barcode (z. B. vom Handy-Bildschirm) vorhalten.
Expected: Formular mit Barcode-Hinweis; bei bekanntem Open-Food-Facts-Produkt ist der Name vorausgefüllt. Kamera verweigern → Hinweis + „Manuell eintragen“.

- [ ] **Step 5: Commit**

```bash
git add src/components/Scanner.tsx src/App.tsx
git commit -m "feat: add barcode scanner with add and consume modes"
```

---

### Task 13: Abnahmetest auf echten Geräten

Push nach Freigabe durch den Nutzer (`git push`), Deployment abwarten. Dann mit iPhone (Safari) und Android (Chrome) unter `https://felixsnowedin.github.io/myfood/`:

- [ ] Login klappt auf beiden Geräten; ausloggen und erneut einloggen.
- [ ] Scan „Hinzufügen“ eines Markenprodukts (z. B. Milch): Name und Kategorie vorausgefüllt, MHD eintragen, Speichern → Kamera bleibt an, Toast „… +1“.
- [ ] Scan eines Produkts, das Open Food Facts nicht kennt: leeres Namensfeld, Barcode-Hinweis; nach dem Speichern wird es beim nächsten Scan erkannt.
- [ ] Denselben Barcode lange vorhalten: es öffnet sich nur ein Formular.
- [ ] Scan „Verbrauchen“: Toast „… −1 (noch n)“, bei mehreren MHDs wird das früheste reduziert. „Rückgängig“ wirkt.
- [ ] Scan „Verbrauchen“ eines unbekannten Barcodes: „Nicht im Bestand“.
- [ ] Gerät A trägt aus, Gerät B zeigt es innerhalb weniger Sekunden ohne Neuladen.
- [ ] −1, Füllstand-Tippen, Bearbeiten, „Wird knapp“ verhalten sich wie in Task 8–10 beschrieben.

Gefundene Fehler mit superpowers:systematic-debugging angehen, Fix committen, Liste erneut durchgehen.
