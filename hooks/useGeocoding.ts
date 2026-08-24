import { useEffect, useState } from 'react';
import { searchCities } from '../api/openMeteo';
import type { GeoLocation } from '../api/types';

export function useGeocoding(query: string) {
  const [results, setResults] = useState<GeoLocation[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setSearching(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setSearching(true);
    setError(null);

    const timer = setTimeout(async () => {
      try {
        const found = await searchCities(trimmed);
        if (!cancelled) {
          setResults(found);
          setSearching(false);
        }
      } catch {
        if (!cancelled) {
          setError('City search failed. Check your connection.');
          setSearching(false);
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  return { results, searching, error };
}
