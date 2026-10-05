import React, { useCallback } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { BigButton } from '@/components/big-button';
import { DirectionTag } from '@/components/direction';
import { EmptyState } from '@/components/empty-state';
import { OccasionBadge } from '@/components/occasion';
import { PressableScale } from '@/components/pressable-scale';
import { listContent, Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { displayDate, formatINR, OCCASION_LABEL, STATUS_LABEL, type NotraEvent } from '@/core';
import { listEvents, sqlEventSummaries, type EventSummary } from '@/db';
import { useLoad } from '@/hooks/use-load';
import { go } from '@/nav';
import { BORDER, colors, radius, spacing, type } from '@/theme';

const keyOf = (e: NotraEvent) => e.id;

interface RowProps {
  event: NotraEvent;
  summary?: EventSummary;
  onOpen: (e: NotraEvent) => void;
  onLedger: (e: NotraEvent) => void;
}

/** Event card: occasion picture, date and status, how much came, and a big "खाता खोलें" straight to its ledger. */
const Card = React.memo(function EventCard({ event: e, summary, onOpen, onLedger }: RowProps) {
  return (
    <View style={styles.card}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`${OCCASION_LABEL[e.occasion]}, ${displayDate(e.date)}, ${STATUS_LABEL[e.status]}`}
        accessibilityHint="कार्यक्रम की पूरी जानकारी खोलें"
        onPress={() => onOpen(e)}
        style={styles.top}
      >
        <OccasionBadge occasion={e.occasion} />
        <View style={styles.flex}>
          <Text style={[type.heading, styles.title]}>{OCCASION_LABEL[e.occasion]}</Text>
          <Text style={[type.caption, styles.sub]}>
            {displayDate(e.date)} · {STATUS_LABEL[e.status]}
            {e.panchApproved ? ' · पंच की मंज़ूरी' : ''}
          </Text>
          {summary ? (
            <View style={styles.sum}>
              <DirectionTag direction="AAYA" />
              <Text style={[type.money, styles.amount]}>{formatINR(summary.receivedPaise)}</Text>
              <Text style={[type.caption, styles.sub]}>· {summary.giverCount} परिवार</Text>
            </View>
          ) : null}
        </View>
      </PressableScale>
      <BigButton icon="hisaab" label="खाता खोलें" onPress={() => onLedger(e)} hint="इस कार्यक्रम में नोतरा लिखें" />
    </View>
  );
});

/** Events list. Totals come from one grouped SQL query. */
export default function Events() {
  const { data, loading } = useLoad(
    async (db, ledgerId) => {
      const [events, summaries] = await Promise.all([listEvents(db, ledgerId), sqlEventSummaries(db, ledgerId)]);
      return { events, summaries };
    },
    { events: [] as NotraEvent[], summaries: {} as Record<string, EventSummary> },
  );
  const open = useCallback((e: NotraEvent) => go(`/events/${e.id}`), []);
  const ledger = useCallback((e: NotraEvent) => go(`/events/${e.id}/ledger`), []);
  const renderItem = useCallback(
    ({ item }: { item: NotraEvent }) => <Card event={item} summary={data.summaries[item.id]} onOpen={open} onLedger={ledger} />,
    [open, ledger, data.summaries],
  );
  return (
    <Screen
      title="मेरे कार्यक्रम"
      scroll={false}
      action={{ icon: 'plus', label: 'नया कार्यक्रम', onPress: () => go('/events/new') }}
    >
      <FlatList
        data={data.events}
        keyExtractor={keyOf}
        renderItem={renderItem}
        ListEmptyComponent={loading ? null : <EmptyState icon="events" text="अभी कोई कार्यक्रम नहीं। शादी जैसे मौके का खाता यहाँ खुलेगा।" />}
        initialNumToRender={6}
        windowSize={5}
        maxToRenderPerBatch={6}
        removeClippedSubviews
        contentContainerStyle={[listContent, styles.list]}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  flex: { flex: 1 },
  card: { gap: spacing.sm, padding: spacing.md, backgroundColor: colors.card, borderWidth: BORDER, borderColor: colors.hairline, borderRadius: radius.card },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  title: { color: colors.ink },
  sub: { color: colors.muted },
  sum: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs },
  amount: { color: colors.received },
});
