import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useRef } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Avatar } from '@/components/avatar';
import { BigButton } from '@/components/big-button';
import { Card, SectionTitle } from '@/components/card';
import { DirectionTag } from '@/components/direction';
import { EntryRow } from '@/components/entry-row';
import { ExportBar } from '@/components/report-export';
import { listContent, Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { explainSuggestion, formatINR, householdLedgerDoc, type Balance, type Household, type Increment, DEFAULT_INCREMENT } from '@/core';
import {
  getDb, getHousehold, getIncrement, listEntriesPage, sqlBalances, sqlHouseholdLedger, type Db, type EntryWithState,
} from '@/db';
import { useActiveLedgerId } from '@/hooks/use-active-ledger';
import { useLoad } from '@/hooks/use-load';
import { go } from '@/nav';
import { reportMeta } from '@/services/report-meta';
import { colors, spacing, type } from '@/theme';
import { useReportViewed } from '@/analytics/use-analytics';

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
  useReportViewed('household');
  const { id } = useLocalSearchParams<{ id: string }>();
  const limit = useRef(PAGE);
  const ledgerId = useActiveLedgerId();

  const { data, reload } = useLoad<Data>(async (db, ledgerId) => {
    const increment = await getIncrement(db);
    const [household, bals, entries] = await Promise.all([
      getHousehold(db, id),
      sqlBalances(db, increment, ledgerId, id),
      listEntriesPage(db, { ledgerId, householdId: id, limit: limit.current }),
    ]);
    return { household, balance: bals[0] ?? null, increment, entries, hasMore: entries.length >= limit.current };
  }, INITIAL);

  const { household: h, balance: b, increment, entries } = data;
  const more = useCallback(() => {
    limit.current += PAGE;
    reload();
  }, [reload]);
  const correct = useCallback((e: EntryWithState) => go(`/entry/new?correctId=${e.id}&eventId=${e.eventId ?? ''}&householdId=${e.otherHouseholdId}`), []);
  const renderItem = useCallback(
    ({ item }: { item: EntryWithState }) => <EntryRow entry={item} actionLabel="सुधारें" onAction={correct} />,
    [correct],
  );

  /** The whole two-sided ledger of this family (every मिला and दिया, with उतार/चढ़ाव) for PDF / photo. */
  const build = useCallback(async () => {
    const db = (await getDb()) as unknown as Db;
    const rows = await sqlHouseholdLedger(db, ledgerId, id);
    return householdLedgerDoc(
      { name: h?.headName ?? '', father: h?.fatherName ?? '', village: h?.village ?? '' }, rows, await reportMeta(db, ['पूरा हिसाब']),
    );
  }, [ledgerId, id, h]);

  const given = b?.totalGiven ?? 0;
  const received = b?.totalReceived ?? 0;
  const pending = received - given;

  const header = (
    <View style={styles.header}>
      {h ? (
        <View style={styles.who}>
          <Avatar name={h.headName} photoUri={h.photoUri} size={80} />
          <View style={styles.flex}>
            <Text style={[type.title, styles.name]}>{h.headName}</Text>
            <Text style={[type.caption, styles.sub]}>{h.kind === 'PERSON' ? 'व्यक्ति' : 'परिवार'}</Text>
            <Text style={[type.caption, styles.sub]}>{[h.fatherName && `${h.fatherName} का`, h.village].filter(Boolean).join(' · ')}</Text>
            {[h.jati, h.panchayat, h.tehsil, h.district].some(Boolean) ? (
              <Text style={[type.caption, styles.sub]}>{[h.jati, h.panchayat, h.tehsil, h.district].filter(Boolean).join(' · ')}</Text>
            ) : null}
          </View>
        </View>
      ) : null}
      <Card>
        <View style={styles.line} accessible accessibilityLabel={`कुल मिला, ${formatINR(received)}`}>
          <DirectionTag direction="AAYA" paired iconSize={26} />
          <Text style={[type.amount, styles.received]} numberOfLines={1} adjustsFontSizeToFit>
            {formatINR(received)}
          </Text>
        </View>
        <View style={styles.line} accessible accessibilityLabel={`कुल दिया, ${formatINR(given)}`}>
          <DirectionTag direction="GAYA" paired iconSize={26} />
          <Text style={[type.amount, styles.given]} numberOfLines={1} adjustsFontSizeToFit>
            {formatINR(given)}
          </Text>
        </View>
      </Card>
      {pending > 0 ? (
        <Card tint="haldi">
          <Text style={[type.heading, styles.ink]}>लौटाना बाकी: {formatINR(pending)}</Text>
        </Card>
      ) : null}
      <Card>
        <Text style={[type.heading, styles.suggest]}>
          {b?.suggestedNext != null ? `अगली बार सुझाव: ${formatINR(b.suggestedNext)}` : 'अगली बार सुझाव: अभी नहीं'}
        </Text>
        <Text style={[type.caption, styles.sub]}>{explainSuggestion(b?.lastReceived ?? 0, b?.suggestedNext ?? null, increment)}</Text>
      </Card>
      <BigButton testID="btn-edit-household" icon="write" label="परिवार की जानकारी बदलें" onPress={() => go(`/households/edit?id=${id}`)} />
      <ExportBar reportId={'household'} build={build} disabled={!h} />
      <SectionTitle icon="hisaab">पूरा हिसाब</SectionTitle>
    </View>
  );

  return (
    <Screen
      title={h?.headName ?? 'परिवार'}
      scroll={false}
      action={{ testID: 'btn-visit', icon: 'moneyOut', label: 'इनके नोतरे में गए', onPress: () => go(`/others/new?householdId=${id}`), hint: 'इस परिवार के नोतरे में जो दिया वह लिखें' }}
    >
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
        contentContainerStyle={listContent}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.md, paddingBottom: spacing.md },
  flex: { flex: 1 },
  who: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  name: { color: colors.ink },
  sub: { color: colors.muted },
  ink: { color: colors.ink },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, minHeight: 64 },
  received: { flex: 1, textAlign: 'right', color: colors.received },
  given: { flex: 1, textAlign: 'right', color: colors.given },
  suggest: { color: colors.received },
  row: { flexDirection: 'row', gap: spacing.sm },
});
