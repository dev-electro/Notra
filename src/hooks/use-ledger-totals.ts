import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { totals } from '@/core';
import { getDb, listEntries } from '@/db';

interface State {
  loading: boolean;
  error: boolean;
  receivedPaise: number;
  givenPaise: number;
}

/** Totals of active (non-superseded) entries from the local DB; refreshes whenever the screen gains focus. */
export function useLedgerTotals(): State {
  const [state, setState] = useState<State>({ loading: true, error: false, receivedPaise: 0, givenPaise: 0 });
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        try {
          const db = await getDb();
          const t = totals(await listEntries(db));
          if (alive) setState({ loading: false, error: false, ...t });
        } catch {
          if (alive) setState((s) => ({ ...s, loading: false, error: true }));
        }
      })();
      return () => {
        alive = false;
      };
    }, []),
  );
  return state;
}
