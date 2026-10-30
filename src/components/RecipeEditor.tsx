import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { deleteRecipe, saveRecipe } from '../api';
import { findProductByName } from '../inventory';
import { findSameRecipe, findSimilarRecipe, norm } from '../recipes';
import type { Notify, Product, Recipe, RecipeIngredient, ShoppingItem, Toast } from '../types';

interface Props {
  recipe: Recipe | null; // null = new
  draft?: { name: string; items: RecipeIngredient[] }; // prefilled ingredients, e.g. from a recipe idea
  recipes: Recipe[];
  products: Product[];
  items: ShoppingItem[];
  notify: Notify;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function RecipeEditor({ recipe, draft, recipes, products, items, notify, onClose, onSaved }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const listId = useId();
  const [name, setName] = useState(recipe?.name ?? draft?.name ?? '');
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>(draft?.items ?? recipe?.items ?? []);
  // Name the user already confirmed despite a similar recipe (normalized).
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const take = (ing: RecipeIngredient) => {
    if (!ingredients.some((x) => sameName(x.name, ing.name))) setIngredients((current) => [...current, ing]);
  };

  function addText() {
    const value = text.trim();
    if (!value) return;
    const product = findProductByName(products, value); // known product → linked, else free text
    take({ product_id: product?.id ?? null, name: product?.name ?? value, quantity: 1 });
    setText('');
  }

  const step = (index: number, delta: number) =>
    setIngredients((current) =>
      current.flatMap((x, i) => (i !== index ? [x] : x.quantity + delta < 1 ? [] : [{ ...x, quantity: x.quantity + delta }])),
    );

  // On failure the sheet stays open with all inputs intact.
  async function act(fn: () => Promise<unknown>, toast: Toast) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      notify(toast);
      await onSaved().catch(() => {});
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  function save(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    const same = findSameRecipe(recipes, trimmed, recipe?.id);
    if (same) return setError(`Gibt es schon: „${same.name}“`);
    // Similar is only a warning: „Chili“ next to „Chili con carne“ can be meant.
    const similar = findSimilarRecipe(recipes, trimmed, recipe?.id);
    if (similar && confirmed !== norm(trimmed) && norm(trimmed) !== norm(recipe?.name ?? '')) {
      setConfirmed(norm(trimmed));
      return setError(`Ähnlich wie „${similar.name}“. Nochmal speichern, um es trotzdem so anzulegen.`);
    }
    void act(() => saveRecipe(recipe?.id ?? null, { name: trimmed, items: ingredients }), { text: `„${trimmed}“ gespeichert` });
  }

  function remove() {
    const { name: oldName, items: oldItems } = recipe!;
    void act(() => deleteRecipe(recipe!.id), {
      text: `Rezept „${oldName}“ gelöscht`,
      undo: async () => {
        await saveRecipe(null, { name: oldName, items: oldItems });
        await onSaved();
      },
    });
  }

  const fromList = items.filter((i) => !i.checked && !ingredients.some((x) => sameName(x.name, i.name)));

  return (
    <dialog ref={ref} className="sheet" aria-labelledby={titleId} onClose={onClose} onCancel={(e) => busy && e.preventDefault()}>
      <form onSubmit={save}>
        <header className="sheet-head">
          <h2 id={titleId}>{recipe ? 'Rezept bearbeiten' : 'Neues Rezept'}</h2>
          <button type="button" className="icon" aria-label="Schließen" disabled={busy} onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="sheet-body">
          <label>
            Name
            <input required value={name} placeholder="z. B. Gulasch" autoComplete="off" onChange={(e) => setName(e.target.value)} />
          </label>
          <h3>Zutaten</h3>
          {ingredients.length ? (
            <ul className="items">
              {ingredients.map((x, i) => (
                <li key={x.name} className="item">
                  <span className="name">{x.name}</span>
                  <span className="qty">{x.quantity}×</span>
                  <button type="button" className="step" aria-label={`${x.name}: eins weniger`} onClick={() => step(i, -1)}>
                    −
                  </button>
                  <button type="button" className="step" aria-label={`${x.name}: eins mehr`} onClick={() => step(i, 1)}>
                    +
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">Noch keine Zutaten.</p>
          )}
          <div className="add-item flush">
            <input
              aria-label="Zutat"
              placeholder="Zutat …"
              list={listId}
              autoComplete="off"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault(); // Enter adds the ingredient instead of saving
                addText();
              }}
            />
            <datalist id={listId}>
              {products.map((p) => (
                <option key={p.id} value={p.name} />
              ))}
            </datalist>
            <button type="button" aria-label="Zutat hinzufügen" disabled={!text.trim()} onClick={addText}>
              +
            </button>
          </div>
          {fromList.length > 0 && (
            <>
              <h3>Vom Zettel übernehmen</h3>
              <div className="chips">
                {fromList.map((i) => (
                  <button key={i.id} type="button" className="chip" onClick={() => take({ product_id: i.product_id, name: i.name, quantity: 1 })}>
                    + {i.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <footer className="sheet-foot">
          {error && <p className="error">{error}</p>}
          {recipe && (
            <button type="button" className="danger" disabled={busy} onClick={remove}>
              Löschen
            </button>
          )}
          <button type="button" className="secondary" disabled={busy} onClick={onClose}>
            Abbrechen
          </button>
          <button disabled={busy || !ingredients.length}>{confirmed && confirmed === norm(name) ? 'Trotzdem speichern' : 'Speichern'}</button>
        </footer>
      </form>
    </dialog>
  );
}
