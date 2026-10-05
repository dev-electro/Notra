import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon } from '@/components/icons';
import { ExportBar } from '@/components/report-export';
import { RangeFilter } from '@/components/range-filter';
import { ReportShell, RowCard } from '@/components/report-parts';
import { Text } from '@/components/text';
import { defaultFilter, displayDate, entryDate, filterLabels, filterRange, formatINR, selfDoc, todayIso, type ReportFilter, type SelfLedgerRow } from '@/core';
import { getDb, listHouseholds, sqlSelfLedgerPage, type Db } from '@/db';
import { useActiveLedgerId } from '@/hooks/use-active-ledger';
import { useLoad } from '@/hooks/use-load';
import { usePaged } from '@/hooks/use-paged';
import { reportMeta } from '@/services/report-meta';
import { colors, type } from '@/theme';
import { useReportViewed } from '@/analytics/use-analytics';

const keyOf = (r: SelfLedgerRow) => r.entry.id;

/** मेरा खाता: every entry in diary order with the running total (मिला minus दिया). Newest first on screen. */
export default function SelfReport() {
  useReportViewed('self');
  const [filter, setFilter] = useState<ReportFilter>(() => defaultFilter(todayIso()));
  const ledgerId = useActiveLedgerId();
  const key = JSON.stringify(filter);
  const { rows, loading, more } = usePaged(async (db, l, limit) => sqlSelfLedgerPage(db, l, limit, 0, filterRange(filter)), key);
  const { data: names } = useLoad(async (db) => new Map((await listHouseholds(db)).map((h) => [h.id, h.headName])), new Map<string, string>());
  const build = useCallback(async () => {
    const db = (await getDb()) as unknown as Db;
    const all = await sqlSelfLedgerPage(db, ledgerId, 1_000_000, 0, filterRange(filter));
    const hs = new Map((await listHouseholds(db)).map((h) => [h.id, h.headName]));
    const docRows = all.reverse().map((r) => ({
      date: entryDate(r.entry), direction: r.entry.direction, program: '', cashPaise: r.entry.cashPaise, inKindItem: r.entry.inKindItem ?? null,
      inKindValuePaise: r.entry.inKindValuePaise, utarPaise: 0, chadhavPaise: 0, runningNet: r.runningBalance, name: hs.get(r.entry.otherHouseholdId) ?? '',
    }));
    return selfDoc(docRows, await reportMeta(db, filterLabels(filter)));
  }, [filter, ledgerId]);
  const render = useCallback(({ item: r }: { item: SelfLedgerRow }) => {
    const aaya = r.delta >= 0;
    const ink = aaya ? colors.received : colors.given;
    return (
      <RowCard>
        <View style={styles.top}>
          <Text style={[type.bodyBold, styles.flex]} numberOfLines={1}>{names.get(r.entry.otherHouseholdId) ?? ''}</Text>
          <Icon name={aaya ? 'arrowDown' : 'arrowUp'} size={20} color={ink} strokeWidth={2.5} />
          <Text style={[type.money, { color: ink }]}>{formatINR(Math.abs(r.delta))}</Text>
        </View>
        <Text style={[type.caption, styles.muted]}>{displayDate(entryDate(r.entry))} · जोड़: {formatINR(r.runningBalance)}</Text>
      </RowCard>
    );
  }, [names]);
  return (
    <ReportShell
      title="मेरा खाता (क्रम से)"
      header={<><RangeFilter value={filter} onChange={setFilter} /><Text style={[type.caption, styles.muted]}>नया ऊपर। जोड़ में अब तक का हिसाब।</Text><ExportBar reportId={'self'} build={build} disabled={rows.length === 0} /></>}
      data={rows} loading={loading} keyOf={keyOf} renderItem={render} onEnd={more} emptyText="अभी कुछ नहीं"
    />
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1 },
  muted: { color: colors.muted },
});
