import { useCallback, useEffect, useState } from 'react';
import { loadProducts, loadStock } from './api';
import { supabase } from './supabase';
import type { Product, StockItem } from './types';

// ponytail: any change reloads both tables; a household's inventory is small
export function useInventory() {
  const [products, setProducts] = useState<Product[]>([]);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [p, s] = await Promise.all([loadProducts(), loadStock()]);
      setProducts(p);
      setStock(s);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void reload();
    const channel = supabase
      .channel('inventory')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => void reload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock' }, () => void reload())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [reload]);

  return { products, stock, error, reload };
}
