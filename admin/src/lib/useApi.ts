import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type Opts } from './api';

export interface Loaded<T> { data: T | null; error: unknown; loading: boolean; reload: () => void }

/** Minimal data hook: GET `path` (+query), re-run when they change or on reload(). Ignores stale responses. */
export function useApi<T>(path: string | null, query?: Opts['query']): Loaded<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(path !== null);
  const [tick, setTick] = useState(0);
  const key = JSON.stringify([path, query, tick]);
  const latest = useRef('');
  useEffect(() => {
    if (path === null) return;
    latest.current = key;
    setLoading(true);
    setError(null);
    api<T>(path, { query })
      .then((d) => { if (latest.current === key) { setData(d); setLoading(false); } })
      .catch((e) => { if (latest.current === key) { setError(e); setLoading(false); } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload };
}
