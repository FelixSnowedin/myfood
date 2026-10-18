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
const entries = (n: number) => `${n} ${n === 1 ? 'Eintrag' : 'Einträge'}`;

export function Archive({ onClose, onCopied, notify }: Props) {
  const [lists, setLists] = useState<ArchivedList[] | null>(null);
  const [selected, setSelected] = useState<ArchivedList | null>(null);
  const [items, setItems] = useState<ShoppingItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let stale = false;
    loadArchive().then(
      (rows) => !stale && setLists(rows),
      (e: Error) => !stale && setError(e.message),
    );
    return () => {
      stale = true;
    };
  }, []);

  // A late answer for a previously opened list must not show up under the current one.
  useEffect(() => {
    if (!selected) return;
    let stale = false;
    setItems(null);
    setError(null);
    loadListItems(selected.id).then(
      (rows) => !stale && setItems(rows.sort((a, b) => a.name.localeCompare(b.name, 'de'))),
      (e: Error) => !stale && setError(e.message),
    );
    return () => {
      stale = true;
    };
  }, [selected]);

  async function copy() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    let count: number;
    try {
      count = await copyList(selected.id);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
      return;
    }
    // Already copied: a failing reload is caught up by realtime.
    await onCopied().catch(() => {});
    notify({ text: count ? `${count} übernommen` : 'Alles stand schon drauf' });
    onClose();
  }

  function back() {
    setError(null);
    if (selected) setSelected(null);
    else onClose();
  }

  return (
    <>
      <div className="archive-head">
        <button type="button" className="link" onClick={back}>
          ← {selected ? 'Frühere Einkäufe' : 'Einkaufszettel'}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {selected ? (
        <section>
          <h2>Einkauf vom {dateOf(selected.finished_at)}</h2>
          {items === null && !error && <p className="empty">Lädt …</p>}
          <ul className="items">
            {items?.map((item) => (
              <li key={item.id} className="item">
                <span className="name">{item.name}</span>
                <span className="qty">{item.quantity}×</span>
              </li>
            ))}
          </ul>
          <div className="actions copy-action">
            <button type="button" disabled={busy || !items?.length} onClick={() => void copy()}>
              Auf aktuellen Zettel kopieren
            </button>
          </div>
        </section>
      ) : (
        <section>
          <h2>Frühere Einkäufe</h2>
          {lists === null && !error && <p className="empty">Lädt …</p>}
          {lists?.length === 0 && <p className="empty">Noch keine abgeschlossenen Einkäufe.</p>}
          <ul className="items">
            {lists?.map((list) => (
              <li key={list.id}>
                <button type="button" className="archive-row" onClick={() => setSelected(list)}>
                  <span>{dateOf(list.finished_at)}</span>
                  <span className="qty">{entries(list.shopping_items[0]?.count ?? 0)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
