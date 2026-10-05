import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BigButton } from '@/components/big-button';
import { Card } from '@/components/card';
import { EventPicker } from '@/components/event-picker';
import { ExportBar } from '@/components/report-export';
import { ReportShell, RowCard, SummaryCard } from '@/components/report-parts';
import { Text } from '@/components/text';
import { displayDate, formatINR, isLegacyEventId, LEGACY_EVENT_LABEL, notComeDoc, occasionName, type NotComeRow, type NotraEvent } from '@/core';
import { getDb, getEvent, getMyHouseholdId, sqlNotCome, sqlNotComeTotal, type Db } from '@/db';
import { useActiveLedgerId } from '@/hooks/use-active-ledger';
import { useLoad } from '@/hooks/use-load';
import { usePaged } from '@/hooks/use-paged';
import { reportMeta } from '@/services/report-meta';
import { colors, type } from '@/theme';
import { useReportViewed } from '@/analytics/use-analytics';

const keyOf = (_: NotComeRow, i: number) => String(i);
const eventLabel = (e: NotraEvent) => `${isLegacyEventId(e.id) ? LEGACY_EVENT_LABEL : occasionName(e.occasion, e.occasionLabel)} · ${displayDate(e.date)}`;

/**
 * मेरे नोतरे में कौन नहीं आया: families I had given to, who still owed me a return before this program, and have no entry in it.
 * Neutral words, and private: it is only for me.
 */
export default function NotComeReport() {
  useReportViewed('notcome');
  const { eventId: param } = useLocalSearchParams<{ eventId?: string }>();
  const [eventId, setEventId] = useState<string | null>(param ?? null);
  if (!eventId) return <EventPicker title="किसके नोतरे की सूची?" onPick={(c) => setEventId(c.event.id)} />;
  return <Report eventId={eventId} onChange={() => setEventId(null)} />;
}

function Report({ eventId, onChange }: { eventId: string; onChange: () => void }) {
  const ledgerId = useActiveLedgerId();
  const { data: ev } = useLoad((db) => getEvent(db, eventId), null as NotraEvent | null, eventId);
  const { data: t } = useLoad(async (db, l) => sqlNotComeTotal(db, l, await getMyHouseholdId(db), eventId), { count: 0, pendingPaise: 0 }, eventId);
  const { rows, loading, more } = usePaged(async (db, l, limit) => sqlNotCome(db, l, await getMyHouseholdId(db), eventId, limit), eventId);
  const build = useCallback(async () => {
    const db = (await getDb()) as unknown as Db;
    const e = await getEvent(db, eventId);
    return notComeDoc(e ? eventLabel(e) : '', await sqlNotCome(db, ledgerId, await getMyHouseholdId(db), eventId), await reportMeta(db, []));
  }, [eventId, ledgerId]);
  const render = useCallback(({ item: r }: { item: NotComeRow }) => (
    <RowCard>
      <View style={styles.top}>
        <Text style={[type.bodyBold, styles.flex]} numberOfLines={1}>{r.name}</Text>
        <Text style={[type.money, { color: colors.given }]}>{formatINR(r.pendingPaise)}</Text>
      </View>
      <Text style={[type.caption, styles.muted]} numberOfLines={1}>{[r.father && `${r.father} का`, r.village].filter(Boolean).join(' · ')}</Text>
      <Text style={[type.caption, styles.muted]}>लौटाना बाकी</Text>
    </RowCard>
  ), []);
  return (
    <ReportShell
      title="मेरे नोतरे में कौन नहीं आया"
      onBack={onChange}
      header={
        <>
          <Text style={[type.heading, styles.ink]}>{ev ? eventLabel(ev) : ''}</Text>
          <Card tint="haldi">
            <Text style={type.body}>इन परिवारों का नोतरा मैंने दिया था और इनका लौटाना बाकी था, पर इस नोतरे में इनकी एंट्री नहीं है। यह सूची सिर्फ़ आपके लिए है।</Text>
          </Card>
          <BigButton testID="btn-other-event" compact icon="events" label="दूसरा नोतरा चुनें" tone="plain" onPress={onChange} />
          <SummaryCard lines={[{ label: `कुल लौटाना बाकी (${t.count} परिवार)`, value: formatINR(t.pendingPaise), tone: 'given' }]} />
          <ExportBar reportId="notcome" build={build} disabled={t.count === 0} />
        </>
      }
      data={rows} loading={loading} keyOf={keyOf} renderItem={render} onEnd={more} emptyIcon="families" emptyText="कोई नहीं। सबकी एंट्री है या किसी का लौटाना बाकी नहीं।"
    />
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1 },
  muted: { color: colors.muted },
  ink: { color: colors.ink },
});
