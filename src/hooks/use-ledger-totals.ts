import { sqlTotals, getMyHouseholdId, getSetting } from '@/db';
import { useLoad } from './use-load';

/** Totals (computed in SQL over active entries) plus whether first-run setup is done. */
export function useLedgerTotals() {
  const r = useLoad(
    async (db) => {
      const [t, me, prompted] = await Promise.all([sqlTotals(db), getMyHouseholdId(db), getSetting(db, 'signin_prompted')]);
      return { ...t, setupDone: me !== null, signinPrompted: prompted !== null };
    },
    { receivedPaise: 0, givenPaise: 0, setupDone: true, signinPrompted: true },
  );
  return { loading: r.loading, error: r.error, ...r.data };
}
