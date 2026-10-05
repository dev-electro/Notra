import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { getDb } from '@/db';
import type { Db } from '@/db';
import { useActiveLedgerId } from './use-active-ledger';

export interface Loaded<T> {
  data: T;
  loading: boolean;
  error: boolean;
  reload: () => void;
}

/**
 * Run a DB loader whenever the screen gains focus or the open ledger changes. The loader gets the active ledger id, so every
 * query is scoped to the ledger on screen. `key` re-runs the loader when a screen's own filter changes. The DB is opened once and reused (getDb caches it).
 */
export function useLoad<T>(loader: (db: Db, ledgerId: string) => Promise<T>, initial: T, key = ''): Loaded<T> {
  const ledgerId = useActiveLedgerId();
  const [state, setState] = useState({ data: initial, loading: true, error: false });
  const loaderRef = useRef(loader);
  loaderRef.current = loader; // eslint-disable-line react-hooks/refs
  const run = useCallback(() => {
    let alive = true;
    (async () => {
      try {
        const db = (await getDb()) as unknown as Db;
        const data = await loaderRef.current(db, ledgerId);
        if (alive) setState({ data, loading: false, error: false });
      } catch {
        if (alive) setState((s) => ({ ...s, loading: false, error: true }));
      }
    })();
    return () => {
      alive = false;
    };
  }, [ledgerId, key]); // eslint-disable-line react-hooks/exhaustive-deps -- `key`: a screen's own filter (month, year, ...): when it changes the loader runs again
  useFocusEffect(run);
  return { ...state, reload: run };
}
