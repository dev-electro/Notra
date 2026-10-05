import React, { useCallback } from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { useAdRows } from '@/ads/use-ad-rows';
import { Card } from '@/components/card';
import { DirectionTag } from '@/components/direction';
import { EmptyState } from '@/components/empty-state';
import { EventCardView } from '@/components/event-card';
import { Icon } from '@/components/icons';
import { PressableScale } from '@/components/pressable-scale';
import { listContent } from '@/components/screen';
import { Text } from '@/components/text';
import { formatINR } from '@/core';
import { getMyHouseholdId, sqlEventCards, sqlTotals, type EventCard } from '@/db';
import { useLoad } from '@/hooks/use-load';
import { go } from '@/nav';
import { colors, spacing, type } from '@/theme';

const keyOf = (c: EventCard) => c.event.id;

/**
 * नोतरा > मेरा: the programs I hold. Here I only RECEIVE. Open one and add who came and how much they gave.
 */
export function MeraPane() {
  const { data, loading } = useLoad(
    async (db, ledgerId) => {
      const me = await getMyHouseholdId(db);
      const [cards, totals] = await Promise.all([sqlEventCards(db, ledgerId, me, { mine: true }), sqlTotals(db, ledgerId)]);
      return { cards, received: totals.receivedPaise };
    },
    { cards: [] as EventCard[], received: 0 },
  );
  const open = useCallback((c: EventCard) => go(`/events/${c.event.id}`), []);
  const ledger = useCallback((c: EventCard) => go(`/events/${c.event.id}/ledger`), []);
  const renderItem = useCallback(
    ({ item }: { item: EventCard }) => (
      <EventCardView card={item} mine onOpen={open} actionLabel="+ कौन आया" onAction={ledger} actionTestID="btn-who-came" />
    ),
    [open, ledger],
  );
  const ad = useAdRows(data.cards, 'mera', 'mera', keyOf, renderItem);
  return (
      <FlatList
        data={ad.rows}
        keyExtractor={ad.keyExtractor}
        renderItem={ad.renderItem}
        ListHeaderComponent={
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={`कुल मिला, ${formatINR(data.received)}`}
            accessibilityHint="मिले हुए नोतरा की पूरी सूची"
            onPress={() => go('/ledger/aaya')}
            style={styles.totalBtn}
          >
            <Card tint="received" style={styles.total}>
              <DirectionTag direction="AAYA" paired iconSize={26} />
              <Text style={[type.amount, { color: colors.received }]} numberOfLines={1} adjustsFontSizeToFit>
                {formatINR(data.received)}
              </Text>
              <Icon name="chevron" size={22} color={colors.received} />
            </Card>
          </PressableScale>
        }
        ListEmptyComponent={loading ? null : <EmptyState icon="events" text="अभी कोई नोतरा नहीं। अपना नोतरा बनाइए, फिर कौन आया लिखिए।" />}
        initialNumToRender={6}
        windowSize={5}
        maxToRenderPerBatch={6}
        removeClippedSubviews
        contentContainerStyle={[listContent, styles.list]}
      />
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  totalBtn: {},
  total: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, justifyContent: 'space-between' },
});
