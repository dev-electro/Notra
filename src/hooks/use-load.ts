import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { getDb } from '@/db';
import type { Db } from '@/db';

export interface Loaded<T> {
  data: T;
  loading: boolean;
  error: boolean;
  reload: () => void;
}

/** Run a DB loader whenever the screen gains focus. The DB is opened once and reused (getDb caches it). */
export function useLoad<T>(loader: (db: Db) => Promise<T>, initial: T): Loaded<T> {
  const [state, setState] = useState({ data: initial, loading: true, error: false });
  const loaderRef = useRef(loader);
  loaderRef.current = loader; // eslint-disable-line react-hooks/refs
  const run = useCallback(() => {
    let alive = true;
    (async () => {
      try {
        const db = (await getDb()) as unknown as Db;
        const data = await loaderRef.current(db);
        if (alive) setState({ data, loading: false, error: false });
      } catch {
        if (alive) setState((s) => ({ ...s, loading: false, error: true }));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  useFocusEffect(run);
  return { ...state, reload: run };
}
