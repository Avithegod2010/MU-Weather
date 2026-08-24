import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GeoLocation } from '../api/types';

const FAVORITES_KEY = '@mu_weather/favorites_v1';

export function useFavorites() {
  const [favorites, setFavorites] = useState<GeoLocation[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(FAVORITES_KEY);
        if (cancelled) return;
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setFavorites(parsed as GeoLocation[]);
        }
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
    try {
      await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
    } catch {
      // Storage full or unavailable: keep in-memory state.
    }
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
