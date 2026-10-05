import React, { useCallback } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { BigButton } from '@/components/big-button';
import { Screen } from '@/components/screen';
import { displayDate, OCCASION_ICON, OCCASION_LABEL, STATUS_LABEL, type NotraEvent } from '@/core';
import { listEvents } from '@/db';
import { useLoad } from '@/hooks/use-load';
import { go } from '@/nav';
import { colors, spacing } from '@/theme';

const ROW = 88;
const keyOf = (e: NotraEvent) => e.id;
const layout = (_: unknown, index: number) => ({ length: ROW, offset: ROW * index, index });

/** Lekhak mode step 1: pick the event (or create one). */
export default function LekhakPick() {
  const { data } = useLoad(async (db) => (await listEvents(db)).filter((e) => e.status !== 'SETTLED'), [] as NotraEvent[]);
  const renderItem = useCallback(
    ({ item: e }: { item: NotraEvent }) => (
      <Pressable accessibilityRole="button" onPress={() => go(`/lekhak/${e.id}`)} style={styles.row}>
        <Text style={styles.icon}>{OCCASION_ICON[e.occasion]}</Text>
        <View>
          <Text style={styles.title}>{OCCASION_LABEL[e.occasion]}</Text>
          <Text style={styles.sub}>
            {displayDate(e.date)} · {STATUS_LABEL[e.status]}
          </Text>
        </View>
      </Pressable>
    ),
    [],
  );
  return (
    <Screen title="लेखक मोड" scroll={false}>
      <View style={styles.top}>
        <Text style={styles.q}>कौन सा कार्यक्रम लिखना है?</Text>
        <BigButton icon="＋" label="नया कार्यक्रम" onPress={() => go('/events/new')} />
      </View>
      <FlatList
        data={data}
        keyExtractor={keyOf}
        renderItem={renderItem}
        getItemLayout={layout}
        initialNumToRender={10}
        windowSize={5}
        removeClippedSubviews
        contentContainerStyle={styles.list}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { gap: spacing.sm, paddingLeft: 44, paddingRight: spacing.md, paddingBottom: spacing.sm },
  q: { fontSize: 22, fontWeight: '700', color: colors.text },
  list: { paddingLeft: 44, paddingRight: spacing.md, paddingBottom: spacing.xl },
  row: { height: ROW, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.rule },
  icon: { fontSize: 36 },
  title: { fontSize: 26, fontWeight: '700', color: colors.text },
  sub: { fontSize: 18, color: colors.textMuted },
});
