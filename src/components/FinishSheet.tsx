import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { finishList } from '../api';
import { todayISO } from '../inventory';
import { buildBookings, initialFinishRows, type FinishRow } from '../shopping';
import type { Product, ShoppingItem } from '../types';

interface Props {
  listId: string;
  items: ShoppingItem[];
  products: Product[];
  recipeNames: string[];
  onClose: () => void;
  onFinished: (booked: number) => Promise<void>;
}

export function FinishSheet({ listId, items, products, recipeNames, onClose, onFinished }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const recipesId = useId();
  const [rows, setRows] = useState<FinishRow[]>(() => initialFinishRows(items, products, todayISO()));
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
    // Checked on another device meanwhile: show it instead of silently archiving it unbooked.
    const known = new Set(rows.map((r) => r.item.id));
    const added = items.filter((item) => item.checked && !known.has(item.id));
    if (added.length) {
      setRows((current) => [...current, ...initialFinishRows(added, products, todayISO())]);
      setError('Der Zettel hat sich geändert. Bitte prüfen und erneut abschließen.');
      return;
    }
    setBusy(true);
    setError(null);
    let booked: number;
    try {
      booked = await finishList(listId, buildBookings(rows));
    } catch (err) {
      // All or nothing in the DB: the sheet stays open with every input intact.
      setError((err as Error).message);
      setBusy(false);
      return;
    }
    // Already committed: a failing reload must not offer a retry of a finished list.
    await onFinished(booked).catch(() => {});
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
          <p className="hint">
            Was in den Bestand soll, mit Menge und optional MHD.
            {rows.some((r) => r.plannedFor) && ' „Geplant für“ ist aus den Rezepten übernommen.'}
            {rows.some((r) => r.item.product_id && r.bestBefore) && ' MHDs sind aus früheren Einkäufen vorbelegt, bitte prüfen.'}
          </p>
          {rows.map((r, i) => (
            <fieldset key={r.key} className="booking" aria-label={r.plannedFor ? `${r.item.name} für ${r.plannedFor}` : r.item.name}>
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
                    <input type="number" inputMode="numeric" min={1} required aria-label={`Menge ${r.item.name}`} value={r.quantity} onChange={(e) => update(i, { quantity: Number(e.target.value) })} />
                  </label>
                  <label>
                    MHD
                    <input type="date" aria-label={`MHD ${r.item.name}`} value={r.bestBefore} onChange={(e) => update(i, { bestBefore: e.target.value })} />
                  </label>
                </div>
              )}
              {r.book && (
                <label>
                  Geplant für
                  <input list={recipesId} placeholder="nichts geplant" autoComplete="off" aria-label={`Geplant für ${r.item.name}`} value={r.plannedFor} onChange={(e) => update(i, { plannedFor: e.target.value })} />
                </label>
              )}
            </fieldset>
          ))}
          <datalist id={recipesId}>
            {recipeNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
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
