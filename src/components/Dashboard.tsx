import { useState } from 'react';
import { CATEGORIES } from '../categories';
import { buildView, expiryStatus, FILL_LABEL, formatDate, lowStock, todayISO, type Row, type ViewOptions } from '../inventory';
import type { ChangeFn, FillLevel, Notify, Product, StockItem } from '../types';
import { EditDialog } from './EditDialog';

const FILL_ICON: Record<FillLevel, string> = { voll: '▮▮▮', angebrochen: '▮▮▯', fast_leer: '▮▯▯' };

interface Props {
  products: Product[];
  stock: StockItem[];
  onChange: ChangeFn;
  onSaved: () => Promise<void>;
  notify: Notify;
}

export function Dashboard({ products, stock, onChange, onSaved, notify }: Props) {
  const [opts, setOpts] = useState<ViewOptions>({ search: '', category: '', sort: 'mhd', group: true });
  const [editing, setEditing] = useState<Row | null>(null);
  const set = (patch: Partial<ViewOptions>) => setOpts((o) => ({ ...o, ...patch }));
  const today = todayISO();
  const low = lowStock(products, stock);
  const groups = buildView(products, stock, opts);

  return (
    <>
      {low.length > 0 && (
        <section className="card low">
          <h2>Wird knapp</h2>
          <ul>
            {low.map(({ product, total }) => (
              <li key={product.id}>
                {product.name}: {total} von mind. {product.min_stock}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="controls">
        <input type="search" placeholder="Suchen…" aria-label="Suchen" value={opts.search} onChange={(e) => set({ search: e.target.value })} />
        <select aria-label="Kategorie" value={opts.category} onChange={(e) => set({ category: e.target.value })}>
          <option value="">Alle Kategorien</option>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select aria-label="Sortierung" value={opts.sort} onChange={(e) => set({ sort: e.target.value as ViewOptions['sort'] })}>
          <option value="mhd">nach MHD</option>
          <option value="name">nach Name</option>
          <option value="neu">zuletzt hinzugefügt</option>
        </select>
        <label className="check">
          <input type="checkbox" checked={opts.group} onChange={(e) => set({ group: e.target.checked })} />
          nach Kategorie gruppieren
        </label>
      </div>

      {groups.length === 0 && <p className="empty">Nichts gefunden.</p>}
      {groups.map((g) => (
        <section key={g.title || 'alle'}>
          {g.title && <h2>{g.title}</h2>}
          <ul className="rows">
            {g.rows.map((r) => {
              const status = expiryStatus(r.best_before, today);
              const fillHint = r.fill_level === 'fast_leer' ? 'antippen verbraucht eins' : 'antippen zum Weiterschalten';
              return (
                <li key={r.id} className={`row ${status}`}>
                  <button className="main" onClick={() => setEditing(r)}>
                    <span className="name">{r.product.name}</span>
                    <span className="meta">
                      {r.quantity}×{r.best_before && ` · MHD ${formatDate(r.best_before)}`}
                      {status === 'expired' && ' · abgelaufen'}
                      {r.planned_for && ` · geplant: ${r.planned_for}`}
                    </span>
                  </button>
                  <button
                    className="fill"
                    aria-label={`${r.product.name}: Füllstand ${FILL_LABEL[r.fill_level]}, ${fillHint}`}
                    onClick={() => void onChange('advance', r, r.product)}
                  >
                    {FILL_ICON[r.fill_level]}
                  </button>
                  <button className="minus" aria-label={`Eins ${r.product.name} verbrauchen`} onClick={() => void onChange('consume', r, r.product)}>
                    −1
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {editing && <EditDialog row={editing} onClose={() => setEditing(null)} onSaved={onSaved} notify={notify} />}
    </>
  );
}
