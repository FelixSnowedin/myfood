import { useCallback, useEffect, useRef, useState } from 'react';
import { loadProducts, loadStock } from './api';
import { supabase } from './supabase';
import type { Product, StockItem } from './types';

// ponytail: any change reloads both tables; a household's inventory is small
export function useInventory() {
  const [products, setProducts] = useState<Product[]>([]);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);

  const reload = useCallback(async () => {
    const call = ++latest.current; // only the newest reload may write state
    try {
      const [p, s] = await Promise.all([loadProducts(), loadStock()]);
      if (call !== latest.current) return;
      setProducts(p);
      setStock(s);
      setError(null);
    } catch (e) {
      if (call === latest.current) setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void reload();
    // Unique name per mount: a channel still leaving must not be reused.
    const channel = supabase
      .channel(`inventory-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => void reload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock' }, () => void reload())
      .subscribe((status, err) => {
        // Rejoins (after sleep/offline) don't replay missed changes, so catch up.
        if (status === 'SUBSCRIBED') void reload();
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.error('realtime', status, err);
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [reload]);

  return { products, stock, error, reload };
}
