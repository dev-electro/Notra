import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ExportBar } from '@/components/report-export';
import { RangeFilter } from '@/components/range-filter';
import { ReportShell, SummaryCard } from '@/components/report-parts';
import { HouseholdRow } from '@/components/household-row';
import { Icon } from '@/components/icons';
import { Text } from '@/components/text';
import {
  defaultFilter, filterLabels, filterRange, formatINR, pendingDoc, personDoc, todayIso, type Household, type ReportFilter,
} from '@/core';
import { getDb, getHousehold, sqlPersonRange, type Db } from '@/db';
import { useActiveLedgerId } from '@/hooks/use-active-ledger';
import { useLoad } from '@/hooks/use-load';
import { usePaged } from '@/hooks/use-paged';
import { go } from '@/nav';
import { reportMeta } from '@/services/report-meta';
import { colors, type } from '@/theme';
import { useReportViewed } from '@/analytics/use-analytics';

type Row = Awaited<ReturnType<typeof sqlPersonRange>>[number];
const keyOf = (r: Row) => r.householdId;

/**
 * किसका कितना (pending = false) and लौटाना बाकी (pending = true), by family, for a year or a date range. Tap a family for its full
 * two-sided ledger (which can be sent as a PDF / photo).
 */
export function PersonReport({ pending }: { pending: boolean }) {
  useReportViewed(pending ? 'pending' : 'person');
  // Optional: opened for one family, the header shows where they live.
  const { householdId } = useLocalSearchParams<{ householdId?: string }>();
  const { data: place } = useLoad(
    async (db) => {
      const h = householdId ? await getHousehold(db, String(householdId)) : null;
      return h ? [h.village, h.panchayat, h.tehsil, h.district].filter(Boolean).join(' · ') : '';
    },
    '',
    String(householdId ?? ''),
  );
  const [filter, setFilter] = useState<ReportFilter>(() => defaultFilter(todayIso()));
  const ledgerId = useActiveLedgerId();
  const key = JSON.stringify(filter) + pending;
  const range = filterRange(filter);
  const { rows, loading, more } = usePaged((db, l, limit) => sqlPersonRange(db, l, range, { pendingOnly: pending, limit }), key);
  const { data: tot } = useLoad(async (db, l) => {
    const all = await sqlPersonRange(db, l, range, { pendingOnly: pending });
    return {
      n: all.length,
      rec: all.reduce((a, r) => a + r.receivedPaise, 0),
      giv: all.reduce((a, r) => a + r.givenPaise, 0),
      pend: all.reduce((a, r) => a + Math.max(r.receivedPaise - r.givenPaise, 0), 0),
    };
  }, { n: 0, rec: 0, giv: 0, pend: 0 }, key);
  const build = useCallback(async () => {
    const db = (await getDb()) as unknown as Db;
    const all = await sqlPersonRange(db, ledgerId, filterRange(filter), { pendingOnly: pending });
    const meta = await reportMeta(db, filterLabels(filter));
    const docRows = all.map((r) => ({ name: r.name, father: r.father, village: r.village, receivedPaise: r.receivedPaise, givenPaise: r.givenPaise }));
    return pending ? pendingDoc(docRows, meta) : personDoc(docRows, meta);
  }, [filter, ledgerId, pending]);
  const open = useCallback((h: Household) => go(`/households/${h.id}`), []);
  const render = useCallback(({ item: r }: { item: Row }) => {
    const h = { id: r.householdId, headName: r.name, fatherName: r.father, village: r.village, jati: '', panchayat: '', tehsil: '', district: '', kind: 'FAMILY' } as Household;
    const owe = r.receivedPaise - r.givenPaise;
    return (
      <HouseholdRow
        household={h}
        onPress={open}
        rightLabel={pending ? `लौटाना बाकी ${formatINR(owe)}` : `मिला ${formatINR(r.receivedPaise)}, दिया ${formatINR(r.givenPaise)}`}
        rightNode={
          pending ? (
            <View style={styles.amounts}>
              <Icon name="arrowUp" size={18} color={colors.given} strokeWidth={2.5} />
              <Text style={[type.captionBold, { color: colors.given }]}>{formatINR(owe)}</Text>
            </View>
          ) : (
            <View style={styles.amounts}>
              <View style={styles.amtRow}>
                <Icon name="arrowDown" size={18} color={colors.received} strokeWidth={2.5} />
                <Text style={[type.captionBold, { color: colors.received }]}>{formatINR(r.receivedPaise)}</Text>
              </View>
              <View style={styles.amtRow}>
                <Icon name="arrowUp" size={18} color={colors.given} strokeWidth={2.5} />
                <Text style={[type.captionBold, { color: colors.given }]}>{formatINR(r.givenPaise)}</Text>
              </View>
            </View>
          )
        }
      />
    );
  }, [open, pending]);
  return (
    <ReportShell
      title={pending ? 'लौटाना बाकी' : 'किसका कितना'}
      header={
        <>
          {place ? <Text style={[type.bodyBold, styles.ink]} accessibilityLabel={`गाँव, पंचायत, तहसील, ज़िला: ${place}`}>{place}</Text> : null}
          <RangeFilter value={filter} onChange={setFilter} />
          <Text style={[type.caption, styles.muted]}>{pending ? 'इनका नोतरा आया है, लौटाना बाकी है' : 'किसके साथ कितना मिला, कितना दिया'}</Text>
          <SummaryCard lines={pending
            ? [{ label: `कुल लौटाना बाकी (${tot.n} परिवार)`, value: formatINR(tot.pend), tone: 'given' }]
            : [{ label: `कुल मिला (${tot.n} परिवार)`, value: formatINR(tot.rec), tone: 'received' }, { label: 'कुल दिया', value: formatINR(tot.giv), tone: 'given' }]} />
          <ExportBar reportId={pending ? 'pending' : 'person'} build={build} disabled={tot.n === 0} />
        </>
      }
      data={rows} loading={loading} keyOf={keyOf} renderItem={render} onEnd={more} emptyIcon="families" emptyText={pending ? 'कुछ भी लौटाना बाकी नहीं' : 'अभी कुछ नहीं'}
    />
  );
}

export default function Person() {
  return <PersonReport pending={false} />;
}

const styles = StyleSheet.create({
  amounts: { alignItems: 'flex-end' },
  amtRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  muted: { color: colors.muted },
  ink: { color: colors.ink },
});
