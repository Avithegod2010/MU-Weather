import { useCallback, useEffect, useState } from 'react';
import { fetchRadarFrameSet, type RadarFrameSet } from '../utils/radar';

/** Frames are re-requested at most every 5 minutes - the API publishes every 10. */
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Module-level cache: reopening the radar must not refetch within the TTL. */
let cache: { frameSet: RadarFrameSet; at: number } | null = null;

export interface RadarFramesState {
  status: 'loading' | 'ready' | 'error';
  frameSet: RadarFrameSet | null;
  /** Manual retry: drops the cache and refetches immediately. */
  reload: () => void;
}

/**
 * RainViewer frame list for the radar screen. Cache-first with a 5-minute TTL,
 * a stale set kept on screen when a refresh fails, and `status: 'error'` only
 * when there is nothing at all to show.
 */
export function useRadarFrames(visible: boolean): RadarFramesState {
  const [nonce, setNonce] = useState(0);
  const [status, setStatus] = useState<RadarFramesState['status']>(cache ? 'ready' : 'loading');
  const [frameSet, setFrameSet] = useState<RadarFrameSet | null>(cache?.frameSet ?? null);

  const reload = useCallback(() => {
    cache = null;
    setNonce((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!visible) return;
    if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
      setFrameSet(cache.frameSet);
      setStatus('ready');
      return;
    }
    let cancelled = false;
    setStatus('loading');
    void (async () => {
      const fresh = await fetchRadarFrameSet();
      if (cancelled) return;
      if (!fresh || fresh.frames.length === 0) {
        setStatus(cache ? 'ready' : 'error');
        return;
      }
      cache = { frameSet: fresh, at: Date.now() };
      setFrameSet(fresh);
      setStatus('ready');
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, nonce]);

  return { status, frameSet, reload };
}
