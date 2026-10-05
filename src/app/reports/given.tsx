import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ExportBar } from '@/components/report-export';
import { RangeFilter } from '@/components/range-filter';
import { ReportShell, RowCard, SummaryCard } from '@/components/report-parts';
import { Text } from '@/components/text';
import {
  defaultFilter, displayDate, filterLabels, filterRange, formatINR, givenDoc, LEGACY_EVENT_LABEL, occasionName, todayIso, utarChadhavText,
  type GivenRow, type ReportFilter,
} from '@/core';
import { getDb, sqlGivenRows, sqlGivenTotals, type Db } from '@/db';
import { useActiveLedgerId } from '@/hooks/use-active-ledger';
import { useLoad } from '@/hooks/use-load';
import { usePaged } from '@/hooks/use-paged';
import { reportMeta } from '@/services/report-meta';
import { colors, type } from '@/theme';

const keyOf = (_: GivenRow, i: number) => String(i);

/** किसको, किस दिन, कितना दिया: every दिया entry, in diary order, with the family, their program, the amount and उतार/चढ़ाव. */
export default function GivenReport() {
  const [filter, setFilter] = useState<ReportFilter>(() => defaultFilter(todayIso()));
  const ledgerId = useActiveLedgerId();
  const range = filterRange(filter);
  const key = JSON.stringify(filter);
  const { data: t } = useLoad((db, l) => sqlGivenTotals(db, l, range), { count: 0, totalPaise: 0, utarPaise: 0, chadhavPaise: 0 }, key);
  const { rows, loading, more } = usePaged((db, l, limit) => sqlGivenRows(db, l, range, limit), key);

  const build = useCallback(async () => {
    const db = (await getDb()) as unknown as Db;
    const r = filterRange(filter);
    return givenDoc(await sqlGivenRows(db, ledgerId, r), await sqlGivenTotals(db, ledgerId, r), await reportMeta(db, filterLabels(filter)));
  }, [filter, ledgerId]);

  const render = useCallback(({ item: r }: { item: GivenRow }) => {
    const settle = utarChadhavText(r.utarPaise, r.chadhavPaise);
    const program = r.legacy ? LEGACY_EVENT_LABEL : r.occasion ? occasionName(r.occasion, r.occasionLabel) : '—';
    return (
      <RowCard>
        <View style={styles.top}>
          <Text style={[type.bodyBold, styles.flex]} numberOfLines={1}>{r.name}</Text>
          <Text style={[type.money, { color: colors.given }]}>{formatINR(r.cashPaise + r.inKindValuePaise)}</Text>
        </View>
        <Text style={[type.caption, styles.muted]} numberOfLines={1}>{[r.father && `${r.father} का`, r.village].filter(Boolean).join(' · ')}</Text>
        <Text style={[type.caption, styles.muted]}>{displayDate(r.date)} · {program}{r.inKindItem ? ` · ${r.inKindItem}` : ''}</Text>
        {settle ? <Text style={type.captionBold}>{settle}</Text> : null}
      </RowCard>
    );
  }, []);

  return (
    <ReportShell
      title="किसको, किस दिन, कितना दिया"
      header={
        <>
          <RangeFilter value={filter} onChange={setFilter} />
          <SummaryCard lines={[
            { label: `कुल दिया (${t.count} एंट्री)`, value: formatINR(t.totalPaise), tone: 'given' },
            { label: 'कुल उतार', value: formatINR(t.utarPaise) },
            { label: 'कुल चढ़ाव', value: formatINR(t.chadhavPaise) },
          ]} />
          <ExportBar build={build} disabled={t.count === 0} />
        </>
      }
      data={rows} loading={loading} keyOf={keyOf} renderItem={render} onEnd={more} emptyIcon="moneyOut" emptyText="इस समय में कुछ दिया नहीं लिखा"
    />
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1 },
  muted: { color: colors.muted },
});
