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
  // Id of the list being finished; the sheet disappears if that list was finished elsewhere meanwhile.
  const [finishing, setFinishing] = useState<string | null>(null);
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
        <button type="button" disabled={!checked.length || !listId} onClick={() => setFinishing(listId)}>
          Einkauf abschließen
        </button>
      </div>

      {finishing && finishing === listId && (
        <FinishSheet
          listId={finishing}
          items={items}
          onClose={() => setFinishing(null)}
          onFinished={async (booked) => {
            setFinishing(null);
            notify({ text: `Einkauf abgeschlossen, ${booked} gebucht` });
            await Promise.all([reload(), onStockChanged()]);
          }}
        />
      )}
    </>
  );
}
