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
 * नोतरा > दूसरों का: the programs of other families that I went to. Here I only GIVE. Newest first; each card is a family and its program.
 */
export function DoosrePane() {
  const { data, loading } = useLoad(
    async (db, ledgerId) => {
      const me = await getMyHouseholdId(db);
      const [cards, totals] = await Promise.all([sqlEventCards(db, ledgerId, me, { mine: false }), sqlTotals(db, ledgerId)]);
      return { cards, given: totals.givenPaise };
    },
    { cards: [] as EventCard[], given: 0 },
  );
  const open = useCallback((c: EventCard) => go(`/events/${c.event.id}`), []);
  const give = useCallback((c: EventCard) => go(`/entry/new?eventId=${c.event.id}&householdId=${c.event.hostHouseholdId}`), []);
  const renderItem = useCallback(
    ({ item }: { item: EventCard }) => (
      <EventCardView card={item} mine={false} onOpen={open} actionLabel="+ मैंने दिया" onAction={give} actionTestID="btn-i-gave" />
    ),
    [open, give],
  );
  const ad = useAdRows(data.cards, 'doosre', 'doosre', keyOf, renderItem);
  return (
      <FlatList
        data={ad.rows}
        keyExtractor={ad.keyExtractor}
        renderItem={ad.renderItem}
        ListHeaderComponent={
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={`कुल दिया, ${formatINR(data.given)}`}
            accessibilityHint="दिए हुए नोतरा की पूरी सूची"
            onPress={() => go('/ledger/gaya')}
          >
            <Card tint="given" style={styles.total}>
              <DirectionTag direction="GAYA" paired iconSize={26} />
              <Text style={[type.amount, { color: colors.given }]} numberOfLines={1} adjustsFontSizeToFit>
                {formatINR(data.given)}
              </Text>
              <Icon name="chevron" size={22} color={colors.given} />
            </Card>
          </PressableScale>
        }
        ListEmptyComponent={loading ? null : <EmptyState icon="moneyOut" text="अभी किसी और के नोतरे में जाना नहीं लिखा।" />}
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
  total: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, justifyContent: 'space-between' },
});
