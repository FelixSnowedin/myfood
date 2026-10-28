import { useEffect, useState, type FormEvent } from 'react';
import { addToList, deleteItem, planRecipe, restoreItem, unplanRecipe, updateItem } from '../api';
import { findProductByName } from '../inventory';
import { currentPlan, itemTag, norm, plannedRecipes, recentRecipes, recipeIdeas, searchRecipes, shrinkReserved, type RecipeIdea } from '../recipes';
import { arrangeList, suggestions } from '../shopping';
import type { Notify, Product, Recipe, ShoppingItem, StockItem } from '../types';
import { useShopping } from '../useShopping';
import { Archive } from './Archive';
import { FinishSheet } from './FinishSheet';
import { RecipeEditor } from './RecipeEditor';
import { RecipeSheet } from './RecipeSheet';

interface Props {
  products: Product[];
  stock: StockItem[];
  notify: Notify;
  onStockChanged: () => Promise<void>;
}

const ADD = 'add';
const SUGGESTIONS = 'suggestions';
const RECENT = 3; // recipes as chips; the rest is found by typing
const DISMISSED = 'myfood.dismissedRecipeIdeas';

type Sheet = { kind: 'plan'; recipe: Recipe } | { kind: 'edit'; recipe: Recipe | null; draft?: RecipeIdea };

// ponytail: dismissed ideas are a per-device convenience, so localStorage
function loadDismissed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(DISMISSED) ?? '[]'));
  } catch {
    return new Set();
  }
}

export function ShoppingList({ products, stock, notify, onStockChanged }: Props) {
  const { listId, items, recipes, error, recipesError, reload } = useShopping();
  const [text, setText] = useState('');
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [dismissed, setDismissed] = useState(loadDismissed);
  // Id of the list being finished; the sheet disappears if that list was finished elsewhere meanwhile.
  const [finishing, setFinishing] = useState<string | null>(null);
  const [archive, setArchive] = useState(false);
  // Keys (item ids, ADD, SUGGESTIONS) with a request in flight: values are computed from what is on
  // screen, so a second tap before the reload would overwrite or double the first.
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const proposals = suggestions(products, stock, items);
  const { open, checked } = arrangeList(items, products);
  const loaded = listId !== null && !error; // nothing to suggest or call empty before the list has loaded
  const hits = searchRecipes(recipes, text);
  const ideas = recipeIdeas(products, stock, recipes, dismissed);
  const planned = plannedRecipes(recipes, items, stock);
  const reloadAll = () => Promise.all([reload(), onStockChanged()]).then(() => {});

  useEffect(() => {
    if (finishing && listId && finishing !== listId) {
      setFinishing(null);
      notify({ text: 'Der Einkauf wurde auf einem anderen Gerät abgeschlossen.' });
    }
  }, [finishing, listId, notify]);

  // Failures show as a toast; the list reloads either way (realtime also does).
  async function act(key: string, action: () => Promise<unknown>): Promise<boolean> {
    if (busy.has(key)) return false;
    setBusy((current) => new Set(current).add(key));
    try {
      await action();
      return true;
    } catch (e) {
      notify({ text: `Fehler: ${(e as Error).message}` });
      return false;
    } finally {
      await reload();
      setBusy((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    const name = text.trim();
    if (!name) return;
    const recipe = recipes.find((r) => norm(r.name) === norm(name));
    if (recipe) {
      setText('');
      return setSheet({ kind: 'plan', recipe });
    }
    const product = findProductByName(products, name); // exact match → product item, else free text
    if (await act(ADD, () => addToList(product?.id ?? null, product?.name ?? name))) setText('');
  }

  function addAll() {
    void act(SUGGESTIONS, async () => {
      for (const s of proposals) await addToList(s.product.id, s.product.name, s.quantity);
    });
  }

  function decrease(item: ShoppingItem) {
    if (item.quantity > 1) {
      const quantity = item.quantity - 1;
      // reserved is missing until the recipe SQL has been run
      const patch = item.reserved ? { quantity, reserved: shrinkReserved(item.reserved, quantity) } : { quantity };
      return void act(item.id, () => updateItem(item.id, patch));
    }
    void act(item.id, async () => {
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

  function showArchive(show: boolean) {
    setArchive(show);
    window.scrollTo(0, 0);
  }

  function unplan(name: string) {
    const prior = currentPlan(name, items, stock, products);
    void act(`plan:${name}`, async () => {
      await unplanRecipe(name);
      await onStockChanged();
      notify({
        text: `${name} nicht mehr geplant`,
        undo: async () => {
          await planRecipe(name, prior);
          await reloadAll();
        },
      });
    });
  }

  function dismiss(idea: RecipeIdea) {
    const next = new Set(dismissed).add(idea.key);
    setDismissed(next);
    try {
      localStorage.setItem(DISMISSED, JSON.stringify([...next]));
    } catch {
      // private mode: dismissed for this visit only
    }
  }

  if (archive) return <Archive onClose={() => showArchive(false)} onCopied={reload} notify={notify} />;

  const row = (item: ShoppingItem) => {
    const rowBusy = busy.has(item.id);
    return (
      <li key={item.id} className={item.checked ? 'item done' : 'item'}>
        <button
          type="button"
          className="tick"
          aria-pressed={item.checked}
          disabled={rowBusy}
          onClick={() => void act(item.id, () => updateItem(item.id, { checked: !item.checked }))}
        >
          <span className="box" aria-hidden="true">
            {item.checked ? '✓' : ''}
          </span>
          <span className="name">
            {item.name}
            {itemTag(item) && <small className="tag">{itemTag(item)}</small>}
          </span>
          <span className="qty">{item.quantity}×</span>
        </button>
        {!item.checked && (
          <>
            <button
              type="button"
              className="step"
              aria-label={item.quantity > 1 ? `${item.name}: eins weniger` : `${item.name} entfernen`}
              disabled={rowBusy}
              onClick={() => decrease(item)}
            >
              −
            </button>
            <button
              type="button"
              className="step"
              aria-label={`${item.name}: eins mehr`}
              disabled={rowBusy}
              onClick={() => void act(item.id, () => updateItem(item.id, { quantity: item.quantity + 1 }))}
            >
              +
            </button>
          </>
        )}
      </li>
    );
  };

  return (
    <>
      {error && <p className="error">Einkaufszettel konnte nicht geladen werden: {error}</p>}
      <form className="add-item" onSubmit={(e) => void add(e)}>
        <input
          aria-label="Auf den Zettel"
          placeholder={recipesError ? 'Auf den Zettel …' : 'Auf den Zettel … (auch Rezepte)'}
          list="shopping-products"
          autoComplete="off"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <datalist id="shopping-products">
          {products.map((p) => (
            <option key={p.id} value={p.name} />
          ))}
        </datalist>
        <button aria-label="Auf den Zettel setzen" disabled={!text.trim() || busy.has(ADD)}>
          +
        </button>
      </form>

      {hits.length > 0 && (
        <div className="suggest">
          {hits.map((r) => (
            <button
              key={r.id}
              type="button"
              className="suggest-row"
              onClick={() => {
                setText('');
                setSheet({ kind: 'plan', recipe: r });
              }}
            >
              <span>{r.name}</span>
              <small>Rezept · {r.items.length} Zutaten</small>
            </button>
          ))}
        </div>
      )}

      {recipesError && <p className="hint">Rezepte: {recipesError}</p>}
      {loaded && !recipesError && (
        <div className="recipes" role="group" aria-label="Zuletzt genutzte Rezepte">
          {recipes.length > 0 && <span className="label">Zuletzt</span>}
          {recentRecipes(recipes, RECENT).map((r) => (
            <button key={r.id} type="button" className="chip" onClick={() => setSheet({ kind: 'plan', recipe: r })}>
              {r.name}
            </button>
          ))}
          <button type="button" className="chip new" onClick={() => setSheet({ kind: 'edit', recipe: null })}>
            + Rezept
          </button>
        </div>
      )}

      {loaded &&
        !recipesError &&
        ideas.map((idea) => (
          <section key={idea.key} className="card idea">
            <div className="low-head">
              <h2>Rezept erkannt: {idea.name}</h2>
              <button type="button" className="icon" aria-label={`Idee ${idea.name} verwerfen`} onClick={() => dismiss(idea)}>
                ✕
              </button>
            </div>
            <p className="hint">
              Im Bestand ist „für {idea.name}“ geplant: {idea.items.map((x) => x.name).join(', ')}.
            </p>
            <div className="actions">
              <button type="button" onClick={() => setSheet({ kind: 'edit', recipe: null, draft: idea })}>
                Als Rezept speichern
              </button>
            </div>
          </section>
        ))}

      {loaded && proposals.length > 0 && (
        <section className="card low">
          <div className="low-head">
            <h2>Wird knapp</h2>
            <button type="button" className="link" disabled={busy.has(SUGGESTIONS)} onClick={addAll}>
              Alle übernehmen
            </button>
          </div>
          <div className="chips">
            {proposals.map((s) => (
              <button
                key={s.product.id}
                type="button"
                className="chip"
                disabled={busy.has(SUGGESTIONS)}
                onClick={() => void act(SUGGESTIONS, () => addToList(s.product.id, s.product.name, s.quantity))}
              >
                + {s.product.name} ({s.quantity})
              </button>
            ))}
          </div>
        </section>
      )}

      {planned.length > 0 && (
        <div className="for-bar">
          <span>Für</span>
          {planned.map((name) => (
            <button key={name} type="button" className="chip" aria-label={`${name} nicht mehr planen`} disabled={busy.has(`plan:${name}`)} onClick={() => unplan(name)}>
              {name} ✕
            </button>
          ))}
        </div>
      )}

      {loaded && items.length === 0 && <p className="empty">Der Zettel ist leer.</p>}
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

      <button type="button" className="link archive-link" onClick={() => showArchive(true)}>
        Frühere Einkäufe
      </button>

      <div className="finish-bar">
        <button type="button" disabled={!checked.length || !listId} onClick={() => setFinishing(listId)}>
          Einkauf abschließen
        </button>
      </div>

      {finishing && finishing === listId && (
        <FinishSheet
          listId={finishing}
          items={items}
          products={products}
          recipeNames={recipes.map((r) => r.name)}
          onClose={() => setFinishing(null)}
          onFinished={async (booked) => {
            setFinishing(null);
            notify({ text: `Einkauf abgeschlossen, ${booked} gebucht` });
            await Promise.all([reload(), onStockChanged()]);
          }}
        />
      )}

      {sheet?.kind === 'plan' && (
        <RecipeSheet
          recipe={sheet.recipe}
          products={products}
          stock={stock}
          items={items}
          notify={notify}
          onClose={() => setSheet(null)}
          onEdit={() => setSheet({ kind: 'edit', recipe: sheet.recipe })}
          onChanged={reloadAll}
        />
      )}
      {sheet?.kind === 'edit' && (
        <RecipeEditor
          key={sheet.recipe?.id ?? sheet.draft?.key ?? 'new'}
          recipe={sheet.recipe}
          draft={sheet.draft}
          recipes={recipes}
          products={products}
          items={items}
          notify={notify}
          onClose={() => setSheet(null)}
          onSaved={reload}
        />
      )}
    </>
  );
}
