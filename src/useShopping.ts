import { useCallback, useEffect, useRef, useState } from 'react';
import { loadListItems, openList } from './api';
import { supabase } from './supabase';
import type { ShoppingItem } from './types';

let channelCount = 0;

// Same pattern as useInventory: any change reloads the open list.
export function useShopping() {
  const [listId, setListId] = useState<string | null>(null);
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);

  const reload = useCallback(async () => {
    const call = ++latest.current; // only the newest reload may write state
    try {
      const id = await openList();
      const rows = await loadListItems(id);
      if (call !== latest.current) return;
      setListId(id);
      setItems(rows);
      setError(null);
    } catch (e) {
      if (call === latest.current) setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void reload();
    const channel = supabase
      .channel(`shopping-${++channelCount}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_lists' }, () => void reload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_items' }, () => void reload())
      .subscribe((status, err) => {
        // Rejoins (after sleep/offline) don't replay missed changes, so catch up.
        if (status === 'SUBSCRIBED') void reload();
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.error('realtime', status, err);
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [reload]);

  return { listId, items, error, reload };
}
