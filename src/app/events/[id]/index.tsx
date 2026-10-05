import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { BigButton } from '@/components/big-button';
import { EntryRow } from '@/components/entry-row';
import { EventHeader } from '@/components/event-header';
import { listContent, Screen } from '@/components/screen';
import {
  displayDate, INVITATION_LABEL, OCCASION_LABEL, STATUS_LABEL, STATUS_ORDER,
  type Household, type NotraEvent,
} from '@/core';
import {
  getDb, getEvent, getHousehold, listEntriesForEvent, listEntriesPage, listHouseholds, setEventStatus, sqlEventSummaries,
  type Db, type EntryWithState, type EventSummary,
} from '@/db';
import { useLoad } from '@/hooks/use-load';
import { go } from '@/nav';
import { shareEventLedger } from '@/services/export';
import { guarded } from '@/services/guard';
import { spacing } from '@/theme';

const PAGE = 30;
const keyOf = (e: EntryWithState) => e.id;

interface Data {
  event: NotraEvent | null;
  host: Household | null;
  summary?: EventSummary;
  entries: EntryWithState[];
}

export default function EventDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const limit = useRef(PAGE);
  const [busy, setBusy] = useState(false);
  const { data, reload } = useLoad<Data>(
    async (db, ledgerId) => {
      const event = await getEvent(db, id);
      const [host, sums, entries] = await Promise.all([
        event ? getHousehold(db, event.hostHouseholdId) : null,
        sqlEventSummaries(db, ledgerId),
        listEntriesPage(db, { ledgerId, eventId: id, activeOnly: true, limit: limit.current }),
      ]);
      return { event, host, summary: sums[id], entries };
    },
    { event: null, host: null, entries: [] },
  );
  const { event: e, host, summary, entries } = data;

  const open = useCallback((x: EntryWithState) => go(`/households/${x.otherHouseholdId}`), []);
  const renderItem = useCallback(({ item }: { item: EntryWithState }) => <EntryRow entry={item} showWho onPress={open} />, [open]);
  const more = useCallback(() => {
    if (entries.length >= limit.current) {
      limit.current += PAGE;
      reload();
    }
  }, [entries.length, reload]);

  const next = e ? STATUS_ORDER[STATUS_ORDER.indexOf(e.status) + 1] : undefined;
  const advance = async () => {
    if (!e || !next) return;
    const ok = await guarded(async () => {
      await setEventStatus((await getDb()) as unknown as Db, e.id, next);
      return true;
    });
    if (ok) reload();
  };
  const exportPdf = async () => {
    if (!e || busy) return;
    setBusy(true);
    try {
      const db = (await getDb()) as unknown as Db;
      await shareEventLedger(e, host ?? undefined, await listEntriesForEvent(db, e.id), await listHouseholds(db));
    } finally {
      setBusy(false);
    }
  };

  const header = e ? (
    <View style={styles.header}>
      <EventHeader
        occasion={e.occasion}
        status={STATUS_LABEL[e.status]}
        subtitle={`${host?.headName ?? ''} · ${displayDate(e.date)} · ${INVITATION_LABEL[e.invitationType]}${e.panchApproved ? ' · पंच की मंज़ूरी' : ''}`}
        totalPaise={summary?.receivedPaise ?? 0}
        giverCount={summary?.giverCount ?? 0}
      />
      <View style={styles.row}>
        <BigButton compact icon="write" label="एंट्री" onPress={() => go(`/entry/new?eventId=${e.id}`)} />
        <BigButton compact icon="share" label="बही भेजें" onPress={exportPdf} disabled={busy} />
      </View>
      {next ? <BigButton icon="check" label={`आगे: ${STATUS_LABEL[next]}`} onPress={advance} /> : null}
    </View>
  ) : null;

  return (
    <Screen
      title={e ? OCCASION_LABEL[e.occasion] : 'कार्यक्रम'}
      scroll={false}
      action={e ? { icon: 'hisaab', label: 'खाता खोलें', onPress: () => go(`/events/${e.id}/ledger`) } : undefined}
    >
      <FlatList
        data={entries}
        keyExtractor={keyOf}
        renderItem={renderItem}
        ListHeaderComponent={header}
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
  header: { gap: spacing.md, paddingBottom: spacing.md },
  row: { flexDirection: 'row', gap: spacing.sm },
});
