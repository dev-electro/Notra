import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Card } from '@/components/card';
import { ExportBar } from '@/components/report-export';
import { RangeFilter } from '@/components/range-filter';
import { ReportShell, RowCard, SummaryCard } from '@/components/report-parts';
import { Text } from '@/components/text';
import { formatINR, MONTHS_HI, todayIso, yearDoc, type MonthRow, type YearSummary } from '@/core';
import { getDb, getMyHouseholdId, sqlYearSummary, type Db } from '@/db';
import { useActiveLedgerId } from '@/hooks/use-active-ledger';
import { useLoad } from '@/hooks/use-load';
import { reportMeta } from '@/services/report-meta';
import { colors, type } from '@/theme';
import { useReportViewed } from '@/analytics/use-analytics';

const EMPTY: YearSummary = {
  year: 0, givenPaise: 0, receivedPaise: 0, hosted: 0, attended: 0, months: [], givenUtar: 0, givenChadhav: 0, receivedUtar: 0, receivedChadhav: 0,
};
const keyOf = (r: MonthRow) => String(r.month);

/** साल भर का हिसाब: total दिया and मिला of a year, programs hosted and attended, month by month, उतार/चढ़ाव totals. */
export default function YearReport() {
  useReportViewed('year');
  const [year, setYear] = useState(Number(todayIso().slice(0, 4)));
  const ledgerId = useActiveLedgerId();
  const { data: s, loading } = useLoad(async (db, l) => sqlYearSummary(db, l, await getMyHouseholdId(db), year), EMPTY, String(year));
  const build = useCallback(async () => {
    const db = (await getDb()) as unknown as Db;
    return yearDoc(await sqlYearSummary(db, ledgerId, await getMyHouseholdId(db), year), await reportMeta(db, [`साल: ${year}`]));
  }, [ledgerId, year]);
  const render = useCallback(({ item: r }: { item: MonthRow }) => (
    <RowCard>
      <View style={styles.top}>
        <Text style={[type.bodyBold, styles.flex]}>{MONTHS_HI[r.month - 1]}</Text>
        <Text style={[type.caption, styles.muted]}>{r.entries} एंट्री</Text>
      </View>
      <View style={styles.top}>
        <Text style={[type.money, styles.flex, { color: colors.received }]}>मिला {formatINR(r.receivedPaise)}</Text>
        <Text style={[type.money, { color: colors.given }]}>दिया {formatINR(r.givenPaise)}</Text>
      </View>
    </RowCard>
  ), []);
  return (
    <ReportShell
      title="साल भर का हिसाब"
      header={
        <>
          <RangeFilter value={{ year }} onChange={(f) => setYear(f.year ?? year)} range={false} allYears={false} />
          <SummaryCard lines={[
            { label: 'कुल मिला', value: formatINR(s.receivedPaise), tone: 'received' },
            { label: 'कुल दिया', value: formatINR(s.givenPaise), tone: 'given' },
          ]} />
          <Card style={styles.card}>
            <Text style={[type.bodyBold, styles.ink]}>नोतरे</Text>
            <Text style={type.body}>मेरे नोतरे (मैंने बुलाए): {s.hosted}</Text>
            <Text style={type.body}>दूसरों के नोतरे में गया: {s.attended}</Text>
          </Card>
          <SummaryCard lines={[
            { label: 'कुल उतार', value: formatINR(s.givenUtar + s.receivedUtar) },
            { label: 'कुल चढ़ाव', value: formatINR(s.givenChadhav + s.receivedChadhav) },
            { label: 'दिया: उतार / चढ़ाव', value: `${formatINR(s.givenUtar)} / ${formatINR(s.givenChadhav)}`, tone: 'given' },
            { label: 'मिला: उतार / चढ़ाव', value: `${formatINR(s.receivedUtar)} / ${formatINR(s.receivedChadhav)}`, tone: 'received' },
          ]} />
          <ExportBar reportId="year" build={build} />
          <Text style={[type.bodyBold, styles.ink]}>महीने के हिसाब से</Text>
        </>
      }
      data={s.months} loading={loading} keyOf={keyOf} renderItem={render} emptyText="इस साल कुछ नहीं"
    />
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1 },
  muted: { color: colors.muted },
  ink: { color: colors.ink },
  card: { gap: 4 },
});
