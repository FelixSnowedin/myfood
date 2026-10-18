import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { advanceFill, consume, restoreStock } from './api';
import { describeChange } from './inventory';
import { supabase } from './supabase';
import type { ChangeFn, Notify, Toast } from './types';
import { useInventory } from './useInventory';
import { AddForm } from './components/AddForm';
import { Dashboard } from './components/Dashboard';
import { Login } from './components/Login';
import { Scanner } from './components/Scanner';

type Tab = 'bestand' | 'scan' | 'add';
const TABS: [Tab, string][] = [['bestand', 'Bestand'], ['scan', 'Scannen'], ['add', 'Hinzufügen']];

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) return null;
  return session ? <Main /> : <Login />;
}

function Main() {
  const { products, stock, error, reload } = useInventory();
  const [tab, setTab] = useState<Tab>('bestand');
  const [toast, setToast] = useState<Toast | null>(null);

  const notify: Notify = useCallback((t) => setToast({ ...t }), []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  const change: ChangeFn = useCallback(
    async (kind, item, product) => {
      try {
        const prev = await (kind === 'consume' ? consume(item.id) : advanceFill(item.id));
        if (!prev) return notify({ text: 'Nicht im Bestand' });
        notify({
          text: describeChange(kind, prev, product.name),
          undo: async () => {
            await restoreStock(prev);
            await reload();
          },
        });
        await reload();
      } catch (e) {
        notify({ text: `Fehler: ${(e as Error).message}` });
      }
    },
    [notify, reload],
  );

  async function undo() {
    const fn = toast?.undo;
    if (!fn) return;
    setToast(null);
    try {
      await fn();
    } catch (e) {
      notify({ text: `Rückgängig fehlgeschlagen: ${(e as Error).message}` });
    }
  }

  return (
    <div className="app">
      <header>
        <h1>myfood</h1>
        <button className="link" onClick={() => void supabase.auth.signOut({ scope: 'local' })}>Abmelden</button>
      </header>
      {error && <p className="error">Laden fehlgeschlagen: {error}</p>}
      <main>
        {tab === 'bestand' && <Dashboard products={products} stock={stock} onChange={change} onSaved={reload} notify={notify} />}
        {tab === 'scan' && <Scanner products={products} stock={stock} onChange={change} onSaved={reload} notify={notify} />}
        {tab === 'add' && <AddForm products={products} onSaved={reload} notify={notify} />}
      </main>
      {toast && (
        <div className="toast" role="status">
          <span>{toast.text}</span>
          {toast.undo && <button onClick={() => void undo()}>Rückgängig</button>}
        </div>
      )}
      <nav className="tabs">
        {TABS.map(([id, label]) => (
          <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
