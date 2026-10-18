import { useEffect, useState } from 'react';
import { copyList, loadArchive, loadListItems, type ArchivedList } from '../api';
import { formatDate, todayISO } from '../inventory';
import type { Notify, ShoppingItem } from '../types';

interface Props {
  onClose: () => void;
  onCopied: () => Promise<void>;
  notify: Notify;
}

// Local calendar date of a timestamp, German style.
const dateOf = (timestamp: string) => formatDate(todayISO(new Date(timestamp)));

export function Archive({ onClose, onCopied, notify }: Props) {
  const [lists, setLists] = useState<ArchivedList[] | null>(null);
  const [selected, setSelected] = useState<ArchivedList | null>(null);
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadArchive().then(setLists, (e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!selected) return;
    setItems([]);
    loadListItems(selected.id).then(
      (rows) => setItems(rows.sort((a, b) => a.name.localeCompare(b.name, 'de'))),
      (e: Error) => setError(e.message),
    );
  }, [selected]);

  async function copy() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const count = await copyList(selected.id);
      await onCopied();
      notify({ text: count ? `${count} übernommen` : 'Alles stand schon drauf' });
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <div className="archive-head">
        <button type="button" className="link" onClick={selected ? () => setSelected(null) : onClose}>
          ← {selected ? 'Frühere Einkäufe' : 'Einkaufszettel'}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {selected ? (
        <section>
          <h2>Einkauf vom {dateOf(selected.finished_at)}</h2>
          <ul className="items">
            {items.map((item) => (
              <li key={item.id} className="item">
                <span className="name">{item.name}</span>
                <span className="qty">{item.quantity}×</span>
              </li>
            ))}
          </ul>
          <div className="actions copy-action">
            <button type="button" disabled={busy || !items.length} onClick={() => void copy()}>
              Auf aktuellen Zettel kopieren
            </button>
          </div>
        </section>
      ) : (
        <section>
          <h2>Frühere Einkäufe</h2>
          {lists?.length === 0 && <p className="empty">Noch keine abgeschlossenen Einkäufe.</p>}
          <ul className="items">
            {lists?.map((list) => (
              <li key={list.id}>
                <button type="button" className="archive-row" onClick={() => setSelected(list)}>
                  <span>{dateOf(list.finished_at)}</span>
                  <span className="qty">{list.shopping_items[0]?.count ?? 0} Einträge</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
