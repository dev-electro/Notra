import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '@/components/avatar';
import { BigButton } from '@/components/big-button';
import { EntryRow } from '@/components/entry-row';
import { Screen } from '@/components/screen';
import { explainSuggestion, formatINR, type Balance, type Household, type Increment, DEFAULT_INCREMENT } from '@/core';
import {
  getDb, getHousehold, getIncrement, listEntriesForHousehold, listEntriesPage, sqlBalances, type Db, type EntryWithState,
} from '@/db';
import { useLoad } from '@/hooks/use-load';
import { go } from '@/nav';
import { sharePersonLedger } from '@/services/export';
import { colors, spacing, type } from '@/theme';

const PAGE = 20;
const keyOf = (e: EntryWithState) => e.id;

interface Data {
  household: Household | null;
  balance: Balance | null;
  increment: Increment;
  entries: EntryWithState[];
  hasMore: boolean;
}
const INITIAL: Data = { household: null, balance: null, increment: DEFAULT_INCREMENT, entries: [], hasMore: false };

export default function HouseholdDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const limit = useRef(PAGE);
  const [busy, setBusy] = useState(false);

  const { data, reload } = useLoad<Data>(async (db) => {
    const increment = await getIncrement(db);
    const [household, bals, entries] = await Promise.all([
      getHousehold(db, id),
      sqlBalances(db, increment, id),
      listEntriesPage(db, { householdId: id, limit: limit.current }),
    ]);
    return { household, balance: bals[0] ?? null, increment, entries, hasMore: entries.length >= limit.current };
  }, INITIAL);

  const { household: h, balance: b, increment, entries } = data;
  const more = useCallback(() => {
    limit.current += PAGE;
    reload();
  }, [reload]);
  const correct = useCallback((e: EntryWithState) => go(`/entry/new?correctId=${e.id}&householdId=${e.otherHouseholdId}`), []);
  const renderItem = useCallback(
    ({ item }: { item: EntryWithState }) => <EntryRow entry={item} actionLabel="सुधारें" onAction={correct} />,
    [correct],
  );

  const exportPdf = async () => {
    if (!h || busy) return;
    setBusy(true);
    try {
      const db = (await getDb()) as unknown as Db;
      await sharePersonLedger(h, await listEntriesForHousehold(db, h.id));
    } finally {
      setBusy(false);
    }
  };

  const given = b?.totalGiven ?? 0;
  const received = b?.totalReceived ?? 0;
  const pending = received - given;

  const header = (
    <View style={styles.header}>
      {h ? (
        <View style={styles.who}>
          <Avatar name={h.headName} photoUri={h.photoUri} size={80} />
          <View style={styles.flex}>
            <Text style={styles.name}>{h.headName}</Text>
            <Text style={styles.sub}>{[h.fatherName && `${h.fatherName} का`, h.village].filter(Boolean).join(' · ')}</Text>
            <Text style={styles.sub}>{[h.jati, h.fala, h.atak].filter(Boolean).join(' · ')}</Text>
          </View>
        </View>
      ) : null}
      <View style={styles.box}>
        <Text style={[styles.line, { color: colors.inkRed }]}>कुल दिया: {formatINR(given)}</Text>
        <Text style={[styles.line, { color: colors.inkBlue }]}>कुल आया: {formatINR(received)}</Text>
        {pending > 0 ? <Text style={styles.pending}>लौटाना बाकी: {formatINR(pending)}</Text> : null}
      </View>
      <View style={styles.box}>
        <Text style={styles.suggest}>
          {b?.suggestedNext != null ? `अगली बार सुझाव: ${formatINR(b.suggestedNext)}` : 'अगली बार सुझाव: अभी नहीं'}
        </Text>
        <Text style={styles.sub}>{explainSuggestion(b?.lastReceived ?? 0, b?.suggestedNext ?? null, increment)}</Text>
      </View>
      <BigButton icon="✍️" label="नई एंट्री" onPress={() => go(`/entry/new?householdId=${id}`)} />
      <View style={styles.row}>
        <BigButton compact icon="✏️" label="बदलें" tone="plain" onPress={() => go(`/households/edit?id=${id}`)} />
        <BigButton compact icon="📄" label="PDF भेजें" tone="red" onPress={exportPdf} disabled={busy} />
      </View>
      <Text style={styles.section}>पूरा हिसाब</Text>
    </View>
  );

  return (
    <Screen title={h?.headName ?? 'परिवार'} scroll={false}>
      <FlatList
        data={entries}
        keyExtractor={keyOf}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListFooterComponent={data.hasMore ? <BigButton label="और दिखाएँ" tone="plain" onPress={more} /> : null}
        initialNumToRender={10}
        windowSize={5}
        maxToRenderPerBatch={10}
        removeClippedSubviews
        contentContainerStyle={styles.list}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingLeft: 44, paddingRight: spacing.md, paddingBottom: spacing.xl * 2 },
  header: { gap: spacing.md, paddingBottom: spacing.md },
  flex: { flex: 1 },
  who: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  name: { ...type.label, color: colors.text },
  sub: { fontSize: 18, lineHeight: 26, color: colors.textMuted },
  box: { borderWidth: 2, borderColor: colors.border, borderRadius: 12, padding: spacing.md, backgroundColor: colors.card, gap: spacing.xs },
  line: { fontSize: 30, lineHeight: 40, fontWeight: '700' },
  pending: { fontSize: 24, lineHeight: 32, fontWeight: '700', color: colors.neutral },
  suggest: { fontSize: 26, lineHeight: 34, fontWeight: '700', color: colors.inkBlue },
  row: { flexDirection: 'row', gap: spacing.sm },
  section: { ...type.label, color: colors.inkBlue },
});
