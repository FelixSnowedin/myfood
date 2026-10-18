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
