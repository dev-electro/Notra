import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BigButton } from '@/components/big-button';
import { EventPicker } from '@/components/event-picker';
import { ExportBar } from '@/components/report-export';
import { ReportShell, RowCard, SummaryCard } from '@/components/report-parts';
import { Text } from '@/components/text';
import {
  displayDate, formatINR, guestsDoc, LEGACY_EVENT_LABEL, isLegacyEventId, occasionName, utarChadhavText, type GuestRow, type NotraEvent,
} from '@/core';
import { getDb, getEvent, sqlGuestRows, sqlGuestTotals, type Db } from '@/db';
import { useActiveLedgerId } from '@/hooks/use-active-ledger';
import { useLoad } from '@/hooks/use-load';
import { usePaged } from '@/hooks/use-paged';
import { reportMeta } from '@/services/report-meta';
import { colors, type } from '@/theme';

const keyOf = (_: GuestRow, i: number) => String(i);
const eventLabel = (e: NotraEvent) => `${isLegacyEventId(e.id) ? LEGACY_EVENT_LABEL : occasionName(e.occasion, e.occasionLabel)} · ${displayDate(e.date)}`;

/** मेरे प्रोग्राम में कौन आया: pick one of my programs, then every family that came, what they gave, उतार/चढ़ाव, totals. */
export default function GuestsReport() {
  const { eventId: param } = useLocalSearchParams<{ eventId?: string }>();
  const [eventId, setEventId] = useState<string | null>(param ?? null);
  if (!eventId) return <EventPicker title="किसके नोतरे की रिपोर्ट?" onPick={(c) => setEventId(c.event.id)} />;
  return <Report eventId={eventId} onChange={() => setEventId(null)} />;
}

function Report({ eventId, onChange }: { eventId: string; onChange: () => void }) {
  const ledgerId = useActiveLedgerId();
  const { data: ev } = useLoad((db) => getEvent(db, eventId), null as NotraEvent | null, eventId);
  const { data: t } = useLoad((db, l) => sqlGuestTotals(db, l, eventId), { givers: 0, totalPaise: 0, utarPaise: 0, chadhavPaise: 0 }, eventId);
  const { rows, loading, more } = usePaged((db, l, limit) => sqlGuestRows(db, l, eventId, limit), eventId);
  const build = useCallback(async () => {
    const db = (await getDb()) as unknown as Db;
    const e = await getEvent(db, eventId);
    return guestsDoc(e ? eventLabel(e) : '', await sqlGuestRows(db, ledgerId, eventId), await sqlGuestTotals(db, ledgerId, eventId), await reportMeta(db, []));
  }, [eventId, ledgerId]);
  const render = useCallback(({ item: r }: { item: GuestRow }) => {
    const settle = utarChadhavText(r.utarPaise, r.chadhavPaise);
    return (
      <RowCard>
        <View style={styles.top}>
          <Text style={[type.bodyBold, styles.flex]} numberOfLines={1}>{r.name}</Text>
          <Text style={[type.money, { color: colors.received }]}>{formatINR(r.cashPaise + r.inKindValuePaise)}</Text>
        </View>
        <Text style={[type.caption, styles.muted]} numberOfLines={1}>{[r.father && `${r.father} का`, r.village].filter(Boolean).join(' · ')}{r.inKindItem ? ` · ${r.inKindItem}` : ''}</Text>
        {settle ? <Text style={type.captionBold}>{settle}</Text> : null}
      </RowCard>
    );
  }, []);
  return (
    <ReportShell
      title="मेरे प्रोग्राम में कौन आया"
      onBack={onChange}
      header={
        <>
          <Text style={[type.heading, styles.ink]}>{ev ? eventLabel(ev) : ''}</Text>
          <BigButton testID="btn-other-event" compact icon="events" label="दूसरा नोतरा चुनें" tone="plain" onPress={onChange} />
          <SummaryCard lines={[
            { label: `कुल मिला (${t.givers} परिवार)`, value: formatINR(t.totalPaise), tone: 'received' },
            { label: 'कुल उतार', value: formatINR(t.utarPaise) },
            { label: 'कुल चढ़ाव', value: formatINR(t.chadhavPaise) },
          ]} />
          <ExportBar build={build} disabled={t.givers === 0} />
        </>
      }
      data={rows} loading={loading} keyOf={keyOf} renderItem={render} onEnd={more} emptyIcon="families" emptyText="इस नोतरे में अभी किसी की एंट्री नहीं"
    />
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1 },
  muted: { color: colors.muted },
  ink: { color: colors.ink },
});
