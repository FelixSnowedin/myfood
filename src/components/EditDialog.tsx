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
