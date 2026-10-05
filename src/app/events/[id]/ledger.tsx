import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { BigButton } from '@/components/big-button';
import { HouseholdPicker } from '@/components/household-picker';
import { NumberPad } from '@/components/number-pad';
import { Screen } from '@/components/screen';
import { formatINR, displayDate, OCCASION_ICON, OCCASION_LABEL, readBack, SHAGUN_QUICK_RUPEES, type Household, type NotraEvent } from '@/core';
import {
  addEntry, getDb, getEvent, getHousehold, getMyHouseholdId, lastActiveEntryForEvent, listEntriesForEvent, listHouseholds, setEventStatus,
  sqlEventTotals, voidEntry, type Db, type EventTotals,
} from '@/db';
import { useActiveLedgerId } from '@/hooks/use-active-ledger';
import { replace } from '@/nav';
import { HELP_EVENT_LEDGER } from '@/onboarding/help';
import { shareEventLedger } from '@/services/export';
import { guarded } from '@/services/guard';
import { speak } from '@/services/speech';
import { colors, spacing } from '@/theme';

type Step = 'pick' | 'amount' | 'summary';
const EMPTY: EventTotals = { cashPaise: 0, inKindValuePaise: 0, totalPaise: 0, giverCount: 0, entryCount: 0 };
const getDbTyped = async () => (await getDb()) as unknown as Db;

/**
 * Event ledger (खाता): the host records the Notra coming in. <=3 taps per giver (family -> shagun amount -> save). Every entry is written to SQLite the moment
 * it is saved, so an app kill loses nothing. "वापस" appends a void entry (append-only). "पूरा करें" only marks the
 * event HELD and shows the summary; running totals come from an indexed SQL query on the event.
 */
export default function EventLedger() {
  const { id: eventId } = useLocalSearchParams<{ id: string }>();
  const ledgerId = useActiveLedgerId();
  const [step, setStep] = useState<Step>('pick');
  const [event, setEvent] = useState<NotraEvent | null>(null);
  const [who, setWho] = useState<Household | null>(null);
  const [digits, setDigits] = useState('');
  const [pad, setPad] = useState(false);
  const [totals, setTotals] = useState<EventTotals>(EMPTY);
  const [last, setLast] = useState<{ id: string; name: string; paise: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const db = await getDbTyped();
    setTotals(await sqlEventTotals(db, eventId));
    const e = await lastActiveEntryForEvent(db, eventId);
    const h = e ? await getHousehold(db, e.otherHouseholdId) : null;
    setLast(e ? { id: e.id, name: h?.headName ?? '', paise: e.cashPaise + e.inKindValuePaise } : null);
  }, [eventId]);

  useEffect(() => {
    (async () => {
      setEvent(await getEvent(await getDbTyped(), eventId));
      await refresh(); // resumes after an app kill: earlier entries are already in the database
    })();
  }, [eventId, refresh]);

  const onPick = useCallback((h: Household, amt?: number) => {
    setWho(h);
    setDigits(amt ? String(amt) : '');
    setPad(false);
    setStep('amount');
  }, []);

  const cash = Number(digits || 0) * 100;
  const add = async () => {
    if (!who || cash <= 0 || busy) return;
    setBusy(true);
    try {
      const e = await guarded(async () => {
        const db = await getDbTyped();
        return addEntry(db, {
          eventId, ledgerId, otherHouseholdId: who.id, direction: 'AAYA', cashPaise: cash, inKindValuePaise: 0,
          paymentMode: 'CASH', recordedBy: (await getMyHouseholdId(db)) ?? 'self',
        });
      });
      if (!e) return; // a toast told the person; the amount stays on screen so they can press save again
      speak(readBack(e, who));
      setWho(null);
      setDigits('');
      setStep('pick');
      await refresh();
    } finally {
      setBusy(false);
    }
  };
  const undo = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await guarded(async () => {
        const db = await getDbTyped();
        const e = await lastActiveEntryForEvent(db, eventId);
        if (e) {
          await voidEntry(db, e);
          speak('आखिरी एंट्री हटा दी');
        }
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const ok = await guarded(async () => {
        const db = await getDbTyped();
        if (event?.status === 'PLANNED') await setEventStatus(db, eventId, 'HELD');
        return true;
      });
      await refresh();
      if (ok) setStep('summary');
    } finally {
      setBusy(false);
    }
  };

  const exportPdf = async () => {
    if (!event) return;
    const db = await getDbTyped();
    await shareEventLedger(event, (await getHousehold(db, event.hostHouseholdId)) ?? undefined, await listEntriesForEvent(db, eventId), await listHouseholds(db));
  };

  const title = event ? `${OCCASION_ICON[event.occasion]} ${OCCASION_LABEL[event.occasion]} का नोतरा खाता` : 'नोतरा खाता';

  if (step === 'summary') {
    return (
      <Screen title="हो गया" noBack>
        <Text style={styles.label}>कुल रकम</Text>
        <Text style={styles.huge}>{formatINR(totals.totalPaise)}</Text>
        <Text style={styles.count}>{totals.giverCount} परिवार</Text>
        <BigButton icon="＋" label="और एंट्री लिखें" tone="plain" onPress={() => setStep('pick')} />
        <BigButton icon="📄" label="PDF बही भेजें" tone="red" onPress={exportPdf} />
        <BigButton icon="📋" label="कार्यक्रम देखें" onPress={() => replace(`/events/${eventId}`)} />
        <BigButton label="होम" tone="plain" onPress={() => replace('/')} />
      </Screen>
    );
  }

  const bar = (
    <View style={styles.bar}>
      {event ? <Text style={styles.label}>{displayDate(event.date)}</Text> : null}
      <Text style={styles.huge} adjustsFontSizeToFit numberOfLines={1}>
        {formatINR(totals.totalPaise)}
      </Text>
      <Text style={styles.count}>{totals.giverCount} परिवार</Text>
      {last ? (
        <View style={styles.lastRow}>
          <Text style={styles.last} numberOfLines={1}>
            {last.name} · {formatINR(last.paise)}
          </Text>
          <BigButton compact label="↩ वापस" tone="plain" onPress={undo} disabled={busy} />
        </View>
      ) : null}
      {totals.entryCount > 0 ? <BigButton icon="✔" label="पूरा करें" onPress={finish} disabled={busy} /> : null}
    </View>
  );

  if (step === 'pick') {
    return (
      <Screen title={title} scroll={false} speakText={HELP_EVENT_LEDGER}>
        {bar}
        <HouseholdPicker onPick={onPick} />
      </Screen>
    );
  }

  return (
    <Screen title={title} speakText={HELP_EVENT_LEDGER}>
      {bar}
      {who ? (
        <Text style={styles.who}>
          {who.headName} · {[who.fatherName && `${who.fatherName} का`, who.village].filter(Boolean).join(' · ')}
        </Text>
      ) : null}
      <Text style={styles.amount}>{formatINR(cash)}</Text>
      <View style={styles.row}>
        {SHAGUN_QUICK_RUPEES.map((r) => (
          <BigButton key={r} compact label={formatINR(r * 100)} tone="plain" selected={digits === String(r)} onPress={() => setDigits(String(r))} />
        ))}
        <BigButton compact label="दूसरी रकम" tone="plain" selected={pad} onPress={() => setPad(!pad)} />
      </View>
      {pad ? <NumberPad value={digits} onChange={setDigits} /> : null}
      <BigButton icon="💾" label="सेव" onPress={add} disabled={cash <= 0 || busy} />
      <BigButton label="दूसरा परिवार चुनें" tone="plain" onPress={() => setStep('pick')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  bar: { gap: spacing.xs, paddingLeft: 44, paddingRight: spacing.md, paddingBottom: spacing.sm },
  huge: { fontSize: 64, lineHeight: 76, fontWeight: '700', color: colors.inkBlue },
  count: { fontSize: 26, fontWeight: '700', color: colors.textMuted },
  label: { fontSize: 22, color: colors.textMuted },
  lastRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  last: { flex: 1, fontSize: 20, color: colors.text },
  who: { fontSize: 26, lineHeight: 34, fontWeight: '700', color: colors.text },
  amount: { fontSize: 56, lineHeight: 68, fontWeight: '700', color: colors.inkBlue, textAlign: 'right' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
