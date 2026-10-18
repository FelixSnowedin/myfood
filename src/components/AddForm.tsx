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
