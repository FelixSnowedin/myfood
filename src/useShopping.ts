import { useCallback, useEffect, useRef, useState } from 'react';
import { loadDismissedIdeas, loadListItems, loadRecipes, openList } from './api';
import { supabase } from './supabase';
import type { Recipe, ShoppingItem } from './types';

let channelCount = 0;

// Same pattern as useInventory: any change reloads the open list (and the recipes).
export function useShopping() {
  const [listId, setListId] = useState<string | null>(null);
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [recipesError, setRecipesError] = useState<string | null>(null);
  const latest = useRef(0);

  const reload = useCallback(async () => {
    const call = ++latest.current; // only the newest reload may write state
    try {
      // Recipes failing (SQL not run yet) must not take the shopping list down with them.
      const [id, recipeResult, dismissedIdeas] = await Promise.all([
        openList(),
        loadRecipes().then((r) => r, (e: Error) => e),
        loadDismissedIdeas().catch(() => new Set<string>()), // missing table: nothing dismissed yet
      ]);
      const rows = await loadListItems(id);
      if (call !== latest.current) return;
      setListId(id);
      setItems(rows);
      setRecipes(recipeResult instanceof Error ? [] : recipeResult);
      setRecipesError(recipeResult instanceof Error ? recipeResult.message : null);
      setDismissed(dismissedIdeas);
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recipes' }, () => void reload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recipe_ideas_dismissed' }, () => void reload())
      .subscribe((status, err) => {
        // Rejoins (after sleep/offline) don't replay missed changes, so catch up.
        if (status === 'SUBSCRIBED') void reload();
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.error('realtime', status, err);
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [reload]);

  return { listId, items, recipes, dismissed, error, recipesError, reload };
}
