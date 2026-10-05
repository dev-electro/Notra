import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { BigButton } from '@/components/big-button';
import { Card } from '@/components/card';
import { DatePickerField } from '@/components/calendar';
import { EntryRow } from '@/components/entry-row';
import { EventHeader } from '@/components/event-header';
import { OccasionPicker } from '@/components/occasion-picker';
import { listContent, Screen } from '@/components/screen';
import { Text } from '@/components/text';
import {
  displayDate, INVITATION_LABEL, isMyEvent, LEGACY_EVENT_LABEL, occasionName, STATUS_LABEL, STATUS_ORDER,
  isLegacyEventId, type Household, type NotraEvent,
} from '@/core';
import {
  getDb, getEvent, getHousehold, getMyHouseholdId, listEntriesForEvent, listEntriesPage, listHouseholds, setEventStatus,
  sqlEventSummaries, updateEventDetails, type Db, type EntryWithState, type EventSummary,
} from '@/db';
import { useLoad } from '@/hooks/use-load';
import { go } from '@/nav';
import { shareEventLedger } from '@/services/export';
import { guarded } from '@/services/guard';
import { colors, spacing, type } from '@/theme';

const PAGE = 30;
const keyOf = (e: EntryWithState) => e.id;

interface Data {
  event: NotraEvent | null;
  host: Household | null;
  mine: boolean;
  summary?: EventSummary;
  entries: EntryWithState[];
}

/**
 * One program. Mine (I host): who came and how much, and "+ कौन आया". Another family's: what I gave, and "+ मैंने दिया".
 * Events are editable (name, details, date), unlike entries.
 */
export default function EventDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const limit = useRef(PAGE);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const { data, reload } = useLoad<Data>(
    async (db, ledgerId) => {
      const event = await getEvent(db, id);
      const [host, sums, entries, me] = await Promise.all([
        event ? getHousehold(db, event.hostHouseholdId) : null,
        sqlEventSummaries(db, ledgerId),
        listEntriesPage(db, { ledgerId, eventId: id, activeOnly: true, limit: limit.current }),
        getMyHouseholdId(db),
      ]);
      return { event, host, mine: event ? isMyEvent(event, me) : true, summary: sums[id], entries };
    },
    { event: null, host: null, mine: true, entries: [] },
  );
  const { event: e, host, mine, summary, entries } = data;

  const open = useCallback((x: EntryWithState) => go(`/households/${x.otherHouseholdId}`), []);
  const correct = useCallback((x: EntryWithState) => go(`/entry/new?correctId=${x.id}&eventId=${x.eventId ?? ''}&householdId=${x.otherHouseholdId}`), []);
  const renderItem = useCallback(
    ({ item }: { item: EntryWithState }) => <EntryRow entry={item} showWho onPress={open} actionLabel="सुधारें" onAction={correct} />,
    [open, correct],
  );
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

  const legacy = !!e && isLegacyEventId(e.id);
  const title = e ? (legacy ? LEGACY_EVENT_LABEL : occasionName(e.occasion, e.occasionLabel)) : 'नोतरा';

  const header = e ? (
    <View style={styles.header}>
      <EventHeader
        occasion={e.occasion}
        label={e.occasionLabel}
        direction={mine ? 'AAYA' : 'GAYA'}
        status={STATUS_LABEL[e.status]}
        subtitle={`${mine ? 'मेरा नोतरा' : (host?.headName ?? '')} · ${displayDate(e.date)}${mine ? ` · ${INVITATION_LABEL[e.invitationType]}` : ''}${e.panchApproved ? ' · पंच की मंज़ूरी' : ''}`}
        totalPaise={mine ? (summary?.receivedPaise ?? 0) : (summary?.givenPaise ?? 0)}
        giverCount={summary?.giverCount ?? 0}
      />
      {e.occasionNote ? (
        <Card>
          <Text style={[type.caption, styles.muted]}>विवरण</Text>
          <Text style={type.body}>{e.occasionNote}</Text>
        </Card>
      ) : null}
      {editing ? <EditPanel event={e} onDone={() => { setEditing(false); reload(); }} /> : (
        <View style={styles.row}>
          <BigButton testID="btn-edit-event" compact icon="write" label="नाम / तारीख बदलें" onPress={() => setEditing(true)} />
          {mine ? <BigButton compact icon="share" label="बही भेजें" onPress={exportPdf} disabled={busy} /> : null}
        </View>
      )}
      {mine ? (
        <View style={styles.row}>
          <BigButton testID="btn-report-guests" compact icon="hisaab" label="कौन आया रिपोर्ट" onPress={() => go(`/reports/guests?eventId=${e.id}`)} />
          <BigButton testID="btn-report-notcome" compact icon="families" label="कौन नहीं आया" onPress={() => go(`/reports/notcome?eventId=${e.id}`)} />
        </View>
      ) : null}
      {next ? <BigButton testID="btn-next" icon="check" label={`आगे: ${STATUS_LABEL[next]}`} onPress={advance} /> : null}
    </View>
  ) : null;

  return (
    <Screen
      title={title}
      scroll={false}
      action={
        e
          ? mine
            ? { testID: 'btn-who-came', icon: 'plus', label: '+ कौन आया', onPress: () => go(`/events/${e.id}/ledger`) }
            : { testID: 'btn-i-gave', icon: 'moneyOut', label: '+ मैंने दिया', onPress: () => go(`/entry/new?eventId=${e.id}&householdId=${e.hostHouseholdId}`) }
          : undefined
      }
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
        keyboardShouldPersistTaps="handled"
      />
    </Screen>
  );
}

/** Edit the occasion (and the custom name + details for "अन्य") and the date. Marks the event for sync again. */
function EditPanel({ event, onDone }: { event: NotraEvent; onDone: () => void }) {
  const [occasion, setOccasion] = useState(event.occasion);
  const [label, setLabel] = useState(event.occasionLabel ?? '');
  const [note, setNote] = useState(event.occasionNote ?? '');
  const [date, setDate] = useState(event.date);
  const save = async () => {
    const ok = await guarded(async () => {
      await updateEventDetails((await getDb()) as unknown as Db, event.id, { occasion, occasionLabel: label, occasionNote: note, date });
      return true;
    });
    if (ok) onDone();
  };
  return (
    <Card style={styles.edit}>
      <OccasionPicker occasion={occasion} onOccasion={setOccasion} label={label} onLabel={setLabel} note={note} onNote={setNote} />
      <DatePickerField testID="field-date" label="तारीख" value={date} onChange={setDate} />
      <View style={styles.row}>
        <BigButton testID="btn-save" compact tone="primary" icon="check" label="सेव करें" onPress={save} disabled={occasion === 'OTHER' && !label.trim()} />
        <BigButton compact tone="plain" label="रहने दें" onPress={onDone} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.md, paddingBottom: spacing.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  muted: { color: colors.muted },
  edit: { gap: spacing.md },
});
