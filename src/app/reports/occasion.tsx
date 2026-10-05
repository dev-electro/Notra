import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { DirectionTag } from '@/components/direction';
import { OccasionBadge } from '@/components/occasion';
import { ExportBar } from '@/components/report-export';
import { RangeFilter } from '@/components/range-filter';
import { ReportShell, RowCard } from '@/components/report-parts';
import { Text } from '@/components/text';
import { defaultFilter, filterLabels, filterRange, formatINR, OCCASION_LABEL, occasionDoc, todayIso, type OccasionRow, type ReportFilter } from '@/core';
import { getDb, sqlOccasionRange, type Db } from '@/db';
import { useActiveLedgerId } from '@/hooks/use-active-ledger';
import { useLoad } from '@/hooks/use-load';
import { reportMeta } from '@/services/report-meta';
import { colors, type } from '@/theme';
import { useReportViewed } from '@/analytics/use-analytics';

const keyOf = (r: OccasionRow) => r.occasion;

/** अवसर के हिसाब से: मिला and दिया per occasion (शादी, गृहप्रवेश, मुंडन संस्कार, ...). */
export default function OccasionReport() {
  useReportViewed('occasion');
  const [filter, setFilter] = useState<ReportFilter>(() => defaultFilter(todayIso()));
  const ledgerId = useActiveLedgerId();
  const { data, loading } = useLoad((db, l) => sqlOccasionRange(db, l, filterRange(filter)), [] as OccasionRow[], JSON.stringify(filter));
  const build = useCallback(async () => {
    const db = (await getDb()) as unknown as Db;
    return occasionDoc(await sqlOccasionRange(db, ledgerId, filterRange(filter)), await reportMeta(db, filterLabels(filter)));
  }, [filter, ledgerId]);
  const render = useCallback(({ item: r }: { item: OccasionRow }) => (
    <RowCard>
      <View style={styles.head}>
        <OccasionBadge occasion={r.occasion} size={48} />
        <Text style={[type.heading, styles.ink]}>{OCCASION_LABEL[r.occasion]}</Text>
      </View>
      <View style={styles.line}><DirectionTag direction="AAYA" /><Text style={[type.money, { color: colors.received }]}>{formatINR(r.totalReceived)}</Text></View>
      <View style={styles.line}><DirectionTag direction="GAYA" /><Text style={[type.money, { color: colors.given }]}>{formatINR(r.totalGiven)}</Text></View>
      <Text style={[type.caption, styles.muted]}>{r.eventCount} कार्यक्रम · {r.entryCount} एंट्री</Text>
    </RowCard>
  ), []);
  return (
    <ReportShell
      title="अवसर के हिसाब से"
      header={<><RangeFilter value={filter} onChange={setFilter} /><ExportBar reportId={'occasion'} build={build} disabled={data.length === 0} /></>}
      data={data} loading={loading} keyOf={keyOf} renderItem={render} emptyText="अभी कुछ नहीं"
    />
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ink: { color: colors.ink },
  muted: { color: colors.muted },
});
