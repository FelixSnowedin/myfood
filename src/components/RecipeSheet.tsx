import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { planRecipe, unplanRecipe } from '../api';
import { currentPlan, planLines, planRecipe as planRows, type PlanRow } from '../recipes';
import type { Notify, Product, Recipe, ShoppingItem, StockItem } from '../types';

interface Props {
  recipe: Recipe;
  products: Product[];
  stock: StockItem[];
  items: ShoppingItem[];
  notify: Notify;
  onClose: () => void;
  onEdit: () => void;
  onChanged: () => Promise<void>;
}

/** Check sheet: what is free is unchecked and gets reserved for the recipe, what is missing goes on the list. */
export function RecipeSheet({ recipe, products, stock, items, notify, onClose, onEdit, onChanged }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  // Computed once on open: a reload while the sheet is open must not undo the user's choices.
  const [rows, setRows] = useState<PlanRow[]>(() => planRows(recipe, products, stock, items));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const name = recipe.name;
    const prior = currentPlan(name, items, stock, products); // planned before: undo restores it
    try {
      await planRecipe(name, planLines(rows));
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
      return;
    }
    const added = rows.filter((r) => r.checked).length;
    const kept = rows.filter((r) => r.free > 0 && r.ingredient.quantity - r.mine > (r.checked ? r.add : 0)).length;
    notify({
      text: `${name}: ${added} auf den Zettel${kept ? `, ${kept} vorgemerkt` : ''}`,
      undo: async () => {
        await unplanRecipe(name);
        if (prior.length) await planRecipe(name, prior);
        await onChanged();
      },
    });
    await onChanged().catch(() => {});
    onClose();
  }

  const count = rows.filter((r) => r.checked).length;

  return (
    <dialog ref={ref} className="sheet" aria-labelledby={titleId} onClose={onClose} onCancel={(e) => busy && e.preventDefault()}>
      <form onSubmit={submit}>
        <header className="sheet-head">
          <h2 id={titleId}>{recipe.name}</h2>
          <button type="button" className="icon" aria-label="Schließen" disabled={busy} onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="sheet-body">
          <p className="hint">Was du schon frei hast, ist abgewählt und wird für {recipe.name} vorgemerkt.</p>
          {!rows.length && <p className="hint">Das Rezept hat noch keine Zutaten.</p>}
          <div className="ings">
            {rows.map((r, i) => (
              <label key={i} className="check ing">
                <input
                  type="checkbox"
                  checked={r.checked}
                  onChange={(e) => setRows((current) => current.map((x, j) => (j === i ? { ...x, checked: e.target.checked } : x)))}
                />
                <span className="ing-name">
                  {r.ingredient.name}
                  {r.note && <small>{r.note}</small>}
                </span>
                <span className="qty">{r.add}×</span>
              </label>
            ))}
          </div>
          <button type="button" className="link" disabled={busy} onClick={onEdit}>
            Rezept bearbeiten
          </button>
        </div>
        <footer className="sheet-foot">
          {error && <p className="error">{error}</p>}
          <button type="button" className="secondary" disabled={busy} onClick={onClose}>
            Abbrechen
          </button>
          <button disabled={busy || !rows.length}>{count ? `${count} auf den Zettel` : 'Nur vormerken'}</button>
        </footer>
      </form>
    </dialog>
  );
}
