import { sqlTotals, getMyHouseholdId } from '@/db';
import { useLoad } from './use-load';

/** Totals (computed in SQL over active entries) plus whether first-run setup is done. */
export function useLedgerTotals() {
  const r = useLoad(
    async (db) => {
      const [t, me] = await Promise.all([sqlTotals(db), getMyHouseholdId(db)]);
      return { ...t, setupDone: me !== null };
    },
    { receivedPaise: 0, givenPaise: 0, setupDone: true },
  );
  return { loading: r.loading, error: r.error, ...r.data };
}
