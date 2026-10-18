import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { CATEGORIES, categoryOf } from '../categories';
import { deleteProduct, deleteStock, restoreStock, updateProduct, updateStock } from '../api';
import { FILL_LABEL, type Row } from '../inventory';
import type { FillLevel, Notify, Toast } from '../types';

interface Props {
  row: Row;
  onClose: () => void;
  onSaved: () => Promise<void>;
  notify: Notify;
}

export function EditDialog({ row, onClose, onSaved, notify }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [name, setName] = useState(row.product.name);
  const [category, setCategory] = useState<string>(categoryOf(row.product.category));
  const [minStock, setMinStock] = useState(row.product.min_stock);
  const [quantity, setQuantity] = useState(row.quantity);
  const [bestBefore, setBestBefore] = useState(row.best_before ?? '');
  const [fill, setFill] = useState<FillLevel>(row.fill_level);
  const [plannedFor, setPlannedFor] = useState(row.planned_for ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Native modal: focus trap, Escape and backdrop come from the browser.
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  // On failure the dialog stays open with all inputs intact.
  async function act(fn: () => Promise<unknown>, toast: Toast) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await onSaved();
      notify(toast);
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
      void onSaved(); // show what actually got saved
    }
  }

  function save(e: FormEvent) {
    e.preventDefault();
    // Only changed fields: another device may have changed the rest meanwhile.
    const stockPatch: Parameters<typeof updateStock>[1] = {};
    if (quantity !== row.quantity) stockPatch.quantity = quantity;
    if ((bestBefore || null) !== row.best_before) stockPatch.best_before = bestBefore || null;
    if (fill !== row.fill_level) stockPatch.fill_level = fill;
    if ((plannedFor.trim() || null) !== row.planned_for) stockPatch.planned_for = plannedFor.trim() || null;
    const productPatch: Parameters<typeof updateProduct>[1] = {};
    if (name.trim() !== row.product.name) productPatch.name = name.trim();
    if (category !== row.product.category) productPatch.category = category;
    if (minStock !== row.product.min_stock) productPatch.min_stock = minStock;
    void act(async () => {
      // Stock first: it is the update that can hit the unique (product, MHD) key.
      if (Object.keys(stockPatch).length) await updateStock(row.id, stockPatch);
      if (Object.keys(productPatch).length) await updateProduct(row.product.id, productPatch);
    }, { text: 'Gespeichert' });
  }

  function removeEntry() {
    const { product: _product, ...item } = row;
    void act(() => deleteStock(row.id), {
      text: `${row.product.name} gelöscht`,
      undo: async () => {
        await restoreStock(item);
        await onSaved();
      },
    });
  }

  function removeProduct() {
    if (confirm(`„${row.product.name}“ samt gesamtem Bestand löschen?`)) {
      void act(() => deleteProduct(row.product.id), { text: 'Produkt gelöscht' });
    }
  }

  return (
    <dialog ref={ref} className="dialog" aria-labelledby={titleId} onClose={onClose} onCancel={(e) => busy && e.preventDefault()}>
      <form className="card" onSubmit={save}>
        <h2 id={titleId}>{row.product.name} bearbeiten</h2>
        <label>
          Name
          <input required pattern=".*\S.*" value={name} onChange={(e) => setName(e.target.value)} />
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
          <button type="button" className="secondary" disabled={busy} onClick={onClose}>
            Abbrechen
          </button>
        </div>
        <div className="actions danger">
          <button type="button" disabled={busy} onClick={removeEntry}>
            Eintrag löschen
          </button>
          <button type="button" disabled={busy} onClick={removeProduct}>
            Produkt löschen
          </button>
        </div>
      </form>
    </dialog>
  );
}
