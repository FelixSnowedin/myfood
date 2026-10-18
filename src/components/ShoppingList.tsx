import { useEffect, useState, type FormEvent } from 'react';
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

const ADD = 'add';
const SUGGESTIONS = 'suggestions';

export function ShoppingList({ products, stock, notify, onStockChanged }: Props) {
  const { listId, items, error, reload } = useShopping();
  const [text, setText] = useState('');
  // Id of the list being finished; the sheet disappears if that list was finished elsewhere meanwhile.
  const [finishing, setFinishing] = useState<string | null>(null);
  const [archive, setArchive] = useState(false);
  // Keys (item ids, ADD, SUGGESTIONS) with a request in flight: values are computed from what is on
  // screen, so a second tap before the reload would overwrite or double the first.
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const proposals = suggestions(products, stock, items);
  const { open, checked } = arrangeList(items, products);

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
    const product = findProductByName(products, name); // exact match → product item, else free text
    if (await act(ADD, () => addToList(product?.id ?? null, product?.name ?? name))) setText('');
  }

  function addAll() {
    void act(SUGGESTIONS, async () => {
      for (const s of proposals) await addToList(s.product.id, s.product.name, s.quantity);
    });
  }

  function decrease(item: ShoppingItem) {
    if (item.quantity > 1) return void act(item.id, () => updateItem(item.id, { quantity: item.quantity - 1 }));
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
          <span className="name">{item.name}</span>
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
        <input aria-label="Auf den Zettel" placeholder="Auf den Zettel …" list="shopping-products" autoComplete="off" value={text} onChange={(e) => setText(e.target.value)} />
        <datalist id="shopping-products">
          {products.map((p) => (
            <option key={p.id} value={p.name} />
          ))}
        </datalist>
        <button aria-label="Auf den Zettel setzen" disabled={!text.trim() || busy.has(ADD)}>
          +
        </button>
      </form>

      {proposals.length > 0 && (
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
