import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useRef } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { ENTRY_ROW_HEIGHT, EntryRow } from '@/components/entry-row';
import { Screen } from '@/components/screen';
import { formatINR } from '@/core';
import { listEntriesPage, sqlTotals, type EntryWithState } from '@/db';
import { useLoad } from '@/hooks/use-load';
import { go } from '@/nav';
import { colors, spacing, type } from '@/theme';

const PAGE = 30;
const keyOf = (e: EntryWithState) => e.id;
const layout = (_: unknown, index: number) => ({ length: ENTRY_ROW_HEIGHT, offset: ENTRY_ROW_HEIGHT * index, index });

/** "मेरा नोतरा" (aaya) / "दूसरों का नोतरा" (gaya): newest first, active entries only. */
export default function LedgerList() {
  const { direction } = useLocalSearchParams<{ direction: string }>();
  const aaya = direction !== 'gaya';
  const limit = useRef(PAGE);
  const { data, reload } = useLoad(
    async (db, ledgerId) => {
      const [t, entries] = await Promise.all([
        sqlTotals(db, ledgerId),
        listEntriesPage(db, { ledgerId, direction: aaya ? 'AAYA' : 'GAYA', activeOnly: true, limit: limit.current }),
      ]);
      return { total: aaya ? t.receivedPaise : t.givenPaise, entries };
    },
    { total: 0, entries: [] as EntryWithState[] },
  );

  const open = useCallback((e: EntryWithState) => go(`/households/${e.otherHouseholdId}`), []);
  const renderItem = useCallback(({ item }: { item: EntryWithState }) => <EntryRow entry={item} showWho onPress={open} />, [open]);
  const more = useCallback(() => {
    if (data.entries.length >= limit.current) {
      limit.current += PAGE;
      reload();
    }
  }, [data.entries.length, reload]);
  const ink = aaya ? colors.inkBlue : colors.inkRed;

  return (
    <Screen title={aaya ? 'मेरा नोतरा' : 'दूसरों का नोतरा'} scroll={false}>
      <View style={styles.total}>
        <Text style={styles.sub}>{aaya ? 'कुल आया' : 'कुल दिया'}</Text>
        <Text style={[styles.amount, { color: ink }]}>{formatINR(data.total)}</Text>
      </View>
      <FlatList
        data={data.entries}
        keyExtractor={keyOf}
        renderItem={renderItem}
        getItemLayout={layout}
        initialNumToRender={10}
        windowSize={5}
        maxToRenderPerBatch={10}
        removeClippedSubviews
        onEndReached={more}
        onEndReachedThreshold={0.5}
        contentContainerStyle={styles.list}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  total: { paddingLeft: 44, paddingRight: spacing.md, paddingBottom: spacing.sm },
  sub: { ...type.body, color: colors.textMuted },
  amount: { ...type.amount },
  list: { paddingLeft: 44, paddingRight: spacing.md, paddingBottom: spacing.xl },
});
