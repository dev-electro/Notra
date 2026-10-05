import React, { useCallback } from 'react';
import { FlatList } from 'react-native';
import { EmptyState } from '@/components/empty-state';
import { EventCardView } from '@/components/event-card';
import { listContent, Screen } from '@/components/screen';
import { getMyHouseholdId, sqlEventCards, type EventCard } from '@/db';
import { useLoad } from '@/hooks/use-load';
import { spacing } from '@/theme';

interface Props {
  title: string;
  onPick: (c: EventCard) => void;
}

/** "कौन-सा नोतरा?": my own programs, newest first. Used by the "कौन आया" and "कौन नहीं आया" reports. */
export function EventPicker({ title, onPick }: Props) {
  const { data, loading } = useLoad(
    async (db, ledgerId) => sqlEventCards(db, ledgerId, await getMyHouseholdId(db), { mine: true }),
    [] as EventCard[],
  );
  const render = useCallback(({ item }: { item: EventCard }) => <EventCardView card={item} mine onOpen={onPick} actionLabel="यह नोतरा चुनें" onAction={onPick} actionTestID="btn-pick-event" />, [onPick]);
  return (
    <Screen title={title} scroll={false}>
      <FlatList
        data={data}
        keyExtractor={(c) => c.event.id}
        renderItem={render}
        ItemSeparatorComponent={undefined}
        ListEmptyComponent={loading ? null : <EmptyState icon="events" text="अभी कोई नोतरा नहीं" />}
        contentContainerStyle={[listContent, { gap: spacing.md }]}
      />
    </Screen>
  );
}
