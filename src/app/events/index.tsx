import React, { useCallback } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { BigButton } from '@/components/big-button';
import { Screen } from '@/components/screen';
import { displayDate, formatINR, OCCASION_ICON, OCCASION_LABEL, STATUS_LABEL, type NotraEvent } from '@/core';
import { listEvents, sqlEventSummaries, type EventSummary } from '@/db';
import { useLoad } from '@/hooks/use-load';
import { go } from '@/nav';
import { colors, spacing } from '@/theme';

const ROW = 104;
const keyOf = (e: NotraEvent) => e.id;
const layout = (_: unknown, index: number) => ({ length: ROW, offset: ROW * index, index });

interface RowProps {
  event: NotraEvent;
  summary?: EventSummary;
  onPress: (e: NotraEvent) => void;
}

const Row = React.memo(function Row({ event: e, summary, onPress }: RowProps) {
  return (
    <Pressable accessibilityRole="button" onPress={() => onPress(e)} style={styles.row}>
      <Text style={styles.icon}>{OCCASION_ICON[e.occasion]}</Text>
      <View style={styles.flex}>
        <Text style={styles.title}>{OCCASION_LABEL[e.occasion]}</Text>
        <Text style={styles.sub}>
          {displayDate(e.date)} · {STATUS_LABEL[e.status]}
          {e.panchApproved ? ' · पंच ✔' : ''}
        </Text>
      </View>
      {summary ? <Text style={styles.amount}>{formatINR(summary.receivedPaise)}</Text> : null}
    </Pressable>
  );
});

/** Events list. Totals come from one grouped SQL query. */
export default function Events() {
  const { data } = useLoad(
    async (db) => {
      const [events, summaries] = await Promise.all([listEvents(db), sqlEventSummaries(db)]);
      return { events, summaries };
    },
    { events: [] as NotraEvent[], summaries: {} as Record<string, EventSummary> },
  );
  const open = useCallback((e: NotraEvent) => go(`/events/${e.id}`), []);
  const renderItem = useCallback(
    ({ item }: { item: NotraEvent }) => <Row event={item} summary={data.summaries[item.id]} onPress={open} />,
    [open, data.summaries],
  );
  return (
    <Screen title="नोतरा कार्यक्रम" scroll={false}>
      <View style={styles.top}>
        <BigButton icon="＋" label="नया कार्यक्रम" onPress={() => go('/events/new')} />
      </View>
      <FlatList
        data={data.events}
        keyExtractor={keyOf}
        renderItem={renderItem}
        getItemLayout={layout}
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
  top: { paddingLeft: 44, paddingRight: spacing.md, paddingBottom: spacing.sm },
  list: { paddingLeft: 44, paddingRight: spacing.md, paddingBottom: spacing.xl },
  flex: { flex: 1 },
  row: { height: ROW, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.rule },
  icon: { fontSize: 40 },
  title: { fontSize: 26, fontWeight: '700', color: colors.text },
  sub: { fontSize: 18, color: colors.textMuted },
  amount: { fontSize: 24, fontWeight: '700', color: colors.inkBlue },
});
