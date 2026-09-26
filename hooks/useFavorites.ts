import { useCallback, useEffect, useState } from 'react';
import { loadFavorites, saveFavorites } from '../utils/favoritesStore';
import type { GeoLocation } from '../api/types';

export function useFavorites() {
  const [favorites, setFavorites] = useState<GeoLocation[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await loadFavorites();
        if (cancelled) return;
        setFavorites(stored);
      } catch {
        // Corrupt storage: start with an empty list.
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(async (next: GeoLocation[]) => {
    setFavorites(next);
    await saveFavorites(next);
  }, []);

  const toggleFavorite = useCallback(
    (location: GeoLocation) => {
      const exists = favorites.some((fav) => fav.id === location.id);
      const next = exists
        ? favorites.filter((fav) => fav.id !== location.id)
        : [...favorites, { ...location }];
      void persist(next);
    },
    [favorites, persist],
  );

  const removeFavorite = useCallback(
    (id: string) => {
      void persist(favorites.filter((fav) => fav.id !== id));
    },
    [favorites, persist],
  );

  const isFavorite = useCallback(
    (id: string) => favorites.some((fav) => fav.id === id),
    [favorites],
  );

  return { favorites, ready, toggleFavorite, removeFavorite, isFavorite };
}
