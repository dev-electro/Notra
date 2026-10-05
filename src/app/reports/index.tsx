import React, { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BigButton } from '@/components/big-button';
import { HOUSEHOLD_ROW_HEIGHT, HouseholdRow } from '@/components/household-row';
import { Screen } from '@/components/screen';
import {
  displayDate, formatINR, MONTHS_HI, notraCalendar, OCCASION_ICON, OCCASION_LABEL,
  pendingFromBalances, personRowsFromBalances, type Household, type NotraEvent, type SelfLedgerRow,
} from '@/core';
import {
  getIncrement, listEvents, listHouseholds, sqlBalances, sqlOccasionWise, sqlSelfLedgerPage,
} from '@/db';
import { useLoad } from '@/hooks/use-load';
import { go } from '@/nav';
import { colors, spacing, type } from '@/theme';

type Tab = 'person' | 'occasion' | 'self' | 'pending' | 'calendar';
const TABS: { key: Tab; label: string }[] = [
  { key: 'person', label: 'व्यक्ति' },
  { key: 'occasion', label: 'अवसर' },
  { key: 'self', label: 'मेरा खाता' },
  { key: 'pending', label: 'लौटाना बाकी' },
  { key: 'calendar', label: 'कैलेंडर' },
];

export default function Reports() {
  const [tab, setTab] = useState<Tab>('person');
  return (
    <Screen title="रिपोर्ट" scroll={false}>
      <View style={styles.tabs}>
        {TABS.map((t) => (
          <BigButton key={t.key} compact label={t.label} tone="plain" selected={tab === t.key} onPress={() => setTab(t.key)} />
        ))}
      </View>
      {tab === 'person' ? <PeopleTab pending={false} /> : null}
      {tab === 'pending' ? <PeopleTab pending /> : null}
      {tab === 'occasion' ? <OccasionTab /> : null}
      {tab === 'self' ? <SelfTab /> : null}
      {tab === 'calendar' ? <CalendarTab /> : null}
    </Screen>
  );
}

// ---- person-wise and "कौन-कौन से लौटाना बाकी है" ----
interface PRow {
  household: Household;
  right: string;
}
const keyP = (r: PRow) => r.household.id;
const layoutP = (_: unknown, index: number) => ({ length: HOUSEHOLD_ROW_HEIGHT, offset: HOUSEHOLD_ROW_HEIGHT * index, index });

function PeopleTab({ pending }: { pending: boolean }) {
  const { data } = useLoad(
    async (db) => {
      const [bals, hs] = await Promise.all([sqlBalances(db, await getIncrement(db)), listHouseholds(db)]);
      const rows: PRow[] = [];
      if (pending) {
        for (const r of pendingFromBalances(bals, hs)) {
          if (r.household) rows.push({ household: r.household, right: formatINR(r.pendingPaise) });
        }
      } else {
        for (const r of personRowsFromBalances(bals, hs)) {
          if (r.household) rows.push({ household: r.household, right: `${formatINR(r.totalGiven)} / ${formatINR(r.totalReceived)}` });
        }
      }
      return rows;
    },
    [] as PRow[],
  );
  const open = useCallback((h: Household) => go(`/households/${h.id}`), []);
  const renderItem = useCallback(({ item }: { item: PRow }) => <HouseholdRow household={item.household} onPress={open} right={item.right} />, [open]);
  return (
    <FlatList
      data={data}
      keyExtractor={keyP}
      renderItem={renderItem}
      getItemLayout={layoutP}
      ListHeaderComponent={
        <Text style={styles.hint}>{pending ? 'इनका नोतरा आया है, लौटाना बाकी है' : 'दिया / आया'}</Text>
      }
      ListEmptyComponent={<Text style={styles.hint}>अभी कुछ नहीं</Text>}
      initialNumToRender={10}
      windowSize={5}
      maxToRenderPerBatch={10}
      removeClippedSubviews
      contentContainerStyle={styles.list}
    />
  );
}

// ---- occasion-wise ----
function OccasionTab() {
  const { data } = useLoad((db) => sqlOccasionWise(db), []);
  return (
    <ScrollView contentContainerStyle={styles.list}>
      {data.map((r) => (
        <View key={r.occasion} style={styles.card}>
          <Text style={styles.cardTitle}>
            {OCCASION_ICON[r.occasion]} {OCCASION_LABEL[r.occasion]}
          </Text>
          <Text style={[styles.line, { color: colors.inkBlue }]}>आया: {formatINR(r.totalReceived)}</Text>
          <Text style={[styles.line, { color: colors.inkRed }]}>दिया: {formatINR(r.totalGiven)}</Text>
          <Text style={styles.hint}>
            {r.eventCount} कार्यक्रम · {r.entryCount} एंट्री
          </Text>
        </View>
      ))}
      {data.length === 0 ? <Text style={styles.hint}>अभी कुछ नहीं</Text> : null}
    </ScrollView>
  );
}

// ---- self ledger (paged, newest first) ----
const SELF_ROW = 88;
const SELF_PAGE = 30;
const keyS = (r: SelfLedgerRow) => r.entry.id;
const layoutS = (_: unknown, index: number) => ({ length: SELF_ROW, offset: SELF_ROW * index, index });

function SelfTab() {
  const limit = useRef(SELF_PAGE);
  const { data, reload } = useLoad(
    async (db) => {
      const [rows, hs] = await Promise.all([sqlSelfLedgerPage(db, limit.current), listHouseholds(db)]);
      return { rows, names: new Map(hs.map((h) => [h.id, h.headName])) };
    },
    { rows: [] as SelfLedgerRow[], names: new Map<string, string>() },
  );
  const renderItem = useCallback(
    ({ item: r }: { item: SelfLedgerRow }) => {
      const ink = r.delta >= 0 ? colors.inkBlue : colors.inkRed;
      return (
        <View style={styles.selfRow}>
          <View style={styles.flex}>
            <Text style={styles.selfName} numberOfLines={1}>
              {data.names.get(r.entry.otherHouseholdId) ?? ''}
            </Text>
            <Text style={styles.hint}>{displayDate(r.entry.createdAt)}</Text>
          </View>
          <View style={styles.right}>
            <Text style={[styles.selfAmt, { color: ink }]}>
              {r.delta >= 0 ? '+' : '−'}
              {formatINR(Math.abs(r.delta))}
            </Text>
            <Text style={styles.hint}>जोड़: {formatINR(r.runningBalance)}</Text>
          </View>
        </View>
      );
    },
    [data.names],
  );
  const more = useCallback(() => {
    if (data.rows.length >= limit.current) {
      limit.current += SELF_PAGE;
      reload();
    }
  }, [data.rows.length, reload]);
  return (
    <FlatList
      data={data.rows}
      keyExtractor={keyS}
      renderItem={renderItem}
      getItemLayout={layoutS}
      ListHeaderComponent={<Text style={styles.hint}>+ आया, − गया</Text>}
      initialNumToRender={10}
      windowSize={5}
      maxToRenderPerBatch={10}
      removeClippedSubviews
      onEndReached={more}
      onEndReachedThreshold={0.5}
      contentContainerStyle={styles.list}
    />
  );
}

// ---- yearly Notra calendar ----
function CalendarTab() {
  const [year, setYear] = useState(new Date().getFullYear());
  const { data } = useLoad((db) => listEvents(db), [] as NotraEvent[]);
  const months = useMemo(() => notraCalendar(data, year), [data, year]);
  return (
    <ScrollView contentContainerStyle={styles.list}>
      <View style={styles.yearRow}>
        <BigButton compact label="◀" tone="plain" onPress={() => setYear((y) => y - 1)} />
        <Text style={styles.year}>{year}</Text>
        <BigButton compact label="▶" tone="plain" onPress={() => setYear((y) => y + 1)} />
      </View>
      {months.map((m) => (
        <View key={m.month} style={styles.card}>
          <Text style={styles.cardTitle}>{MONTHS_HI[m.month - 1]}</Text>
          {m.events.map((e) => (
            <Pressable key={e.id} accessibilityRole="button" onPress={() => go(`/events/${e.id}`)} style={styles.calRow}>
              <Text style={styles.line}>
                {OCCASION_ICON[e.occasion]} {e.date.slice(8, 10)} · {OCCASION_LABEL[e.occasion]}
              </Text>
            </Pressable>
          ))}
        </View>
      ))}
      {months.length === 0 ? <Text style={styles.hint}>इस साल कोई कार्यक्रम नहीं</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingLeft: 44, paddingRight: spacing.md, paddingBottom: spacing.sm },
  list: { paddingLeft: 44, paddingRight: spacing.md, paddingBottom: spacing.xl * 2, gap: spacing.sm },
  hint: { fontSize: 18, lineHeight: 26, color: colors.textMuted },
  card: { borderWidth: 2, borderColor: colors.border, borderRadius: 12, padding: spacing.md, backgroundColor: colors.card, gap: spacing.xs },
  cardTitle: { ...type.label, color: colors.text },
  line: { fontSize: 24, lineHeight: 32, fontWeight: '700', color: colors.text },
  flex: { flex: 1 },
  right: { alignItems: 'flex-end' },
  selfRow: { height: SELF_ROW, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.rule },
  selfName: { fontSize: 22, fontWeight: '700', color: colors.text },
  selfAmt: { fontSize: 24, fontWeight: '700' },
  yearRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  year: { ...type.amount, color: colors.inkBlue, flex: 1, textAlign: 'center' },
  calRow: { minHeight: 64, justifyContent: 'center' },
});
