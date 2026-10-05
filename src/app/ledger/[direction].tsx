import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useRef } from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { Card } from '@/components/card';
import { DirectionTag } from '@/components/direction';
import { EmptyState } from '@/components/empty-state';
import { ENTRY_ROW_HEIGHT, EntryRow } from '@/components/entry-row';
import { listContent, Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { formatINR } from '@/core';
import { listEntriesPage, sqlTotals, type EntryWithState } from '@/db';
import { useLoad } from '@/hooks/use-load';
import { go } from '@/nav';
import { colors, spacing, type } from '@/theme';

const PAGE = 30;
const keyOf = (e: EntryWithState) => e.id;
const layout = (_: unknown, index: number) => ({ length: ENTRY_ROW_HEIGHT, offset: ENTRY_ROW_HEIGHT * index, index });

/** "मिला (आया)" / "दिया (गया)" list: newest first, active entries only. */
export default function LedgerList() {
  const { direction } = useLocalSearchParams<{ direction: string }>();
  const aaya = direction !== 'gaya';
  const limit = useRef(PAGE);
  const { data, loading, reload } = useLoad(
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
  const ink = aaya ? colors.received : colors.given;

  return (
    <Screen title={aaya ? 'मिला (आया)' : 'दिया (गया)'} scroll={false}>
      <FlatList
        data={data.entries}
        keyExtractor={keyOf}
        renderItem={renderItem}
        getItemLayout={layout}
        ListHeaderComponent={
          <Card tint={aaya ? 'received' : 'given'} style={styles.total}>
            <DirectionTag direction={aaya ? 'AAYA' : 'GAYA'} paired iconSize={28} />
            <Text style={[type.amount, { color: ink }]} adjustsFontSizeToFit numberOfLines={1}>
              {formatINR(data.total)}
            </Text>
          </Card>
        }
        ListEmptyComponent={loading ? null : <EmptyState icon={aaya ? 'moneyIn' : 'moneyOut'} text={aaya ? 'अभी कुछ मिला नहीं लिखा' : 'अभी कुछ दिया नहीं लिखा'} />}
        initialNumToRender={10}
        windowSize={5}
        maxToRenderPerBatch={10}
        removeClippedSubviews
        onEndReached={more}
        onEndReachedThreshold={0.5}
        contentContainerStyle={listContent}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  total: { marginBottom: spacing.md, gap: spacing.xs },
});
