import { useEffect, useState, useSyncExternalStore } from 'react';
import { DEFAULT_LEDGER_NAME } from '@/core';
import { getDb, getLedger } from '@/db';
import type { Db } from '@/db';
import { getActiveLedgerId, subscribeLedger } from '@/ledgers/session';

/** The id of the ledger that is open now (re-renders when it changes). */
export const useActiveLedgerId = (): string => useSyncExternalStore(subscribeLedger, getActiveLedgerId, getActiveLedgerId);

/** Id and display name of the open ledger, for headers and chips. */
export function useActiveLedger(): { id: string; name: string } {
  const id = useActiveLedgerId();
  const [name, setName] = useState(DEFAULT_LEDGER_NAME);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const l = await getLedger((await getDb()) as unknown as Db, id);
        if (alive && l) setName(l.name);
      } catch {
        /* keep the previous name */
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);
  return { id, name };
}
