import { sqlTotals, getMyHouseholdId, getSetting } from '@/db';
import { useLoad } from './use-load';

/** Totals of the open ledger (computed in SQL over active entries) plus how far first-run setup has got. */
export function useLedgerTotals() {
  const r = useLoad(
    async (db, ledgerId) => {
      const [t, me, prompted, onboarded] = await Promise.all([
        sqlTotals(db, ledgerId), getMyHouseholdId(db), getSetting(db, 'signin_prompted'), getSetting(db, 'onboarding_seen'),
      ]);
      return { ...t, setupDone: me !== null, signinPrompted: prompted !== null, onboardingSeen: onboarded !== null };
    },
    { receivedPaise: 0, givenPaise: 0, setupDone: true, signinPrompted: true, onboardingSeen: true },
  );
  return { loading: r.loading, error: r.error, ...r.data };
}
